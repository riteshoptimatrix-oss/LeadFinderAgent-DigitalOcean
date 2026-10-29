import asyncio
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId

from app.db.database import get_db
from app.core.logger import logger
from app.core.websocket import manager
from app.models.lead_intelligence import LeadIntelligenceState
from app.services.lead_intelligence_service import LeadIntelligenceService
from app.services.lead_enrichment_service import lead_enrichment_service, LeadEnrichmentData, to_object_id

class LeadIntelligenceWorker:
    def __init__(self):
        self.is_running = False
        self._task: Optional[asyncio.Task] = None

    def start(self):
        if not self.is_running:
            self.is_running = True
            self._task = asyncio.create_task(self.run())
            logger.info("Lead Intelligence Worker started")

    async def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            logger.info("Lead Intelligence Worker stopped")

    async def startup_cleanup(self, db) -> dict:
        """
        Runs on startup to verify referential integrity (Phase 3, 4, 5).
        Removes orphan queue jobs (jobs referencing missing leads or queues) and repairs parent queue counts.
        """
        logger.info("LEAD_INTEL_STARTUP_CLEANUP: Starting referential integrity verification...")
        
        # 1. Fetch all lead intelligence jobs
        jobs = await db["lead_intelligence_jobs"].find({}).to_list(length=10000)
        
        orphan_jobs_removed = 0
        repaired_queue_ids = set()
        valid_jobs_count = 0
        
        for job in jobs:
            job_id = job["_id"]
            lead_id = job.get("lead_id")
            queue_id = job.get("queue_id")
            
            # Check queue existence
            queue_exists = False
            if queue_id:
                try:
                    queue_id_obj = ObjectId(queue_id) if len(queue_id) == 24 else queue_id
                except Exception:
                    queue_id_obj = queue_id
                queue_exists = await db["lead_intelligence_queues"].count_documents({"_id": queue_id_obj}) > 0
                
            # Check lead existence
            lead_exists = False
            if lead_id:
                lead_oid = to_object_id(lead_id)
                lead_exists = await db["leads"].count_documents({"_id": lead_oid}) > 0
                
            # If parent queue or lead does not exist, remove (delete) the job
            if not queue_exists or not lead_exists:
                reason = "missing parent queue" if not queue_exists else "missing lead"
                logger.warning(f"LEAD_INTEL_STARTUP_CLEANUP: Removing job {job_id} due to {reason}.")
                await db["lead_intelligence_jobs"].delete_one({"_id": job_id})
                orphan_jobs_removed += 1
                
                # If the queue exists but the lead is missing, repair the queue's total_jobs
                if queue_exists and queue_id:
                    await db["lead_intelligence_queues"].update_one(
                        {"_id": queue_id_obj},
                        {"$inc": {"total_jobs": -1}}
                    )
                    repaired_queue_ids.add(str(queue_id))
            else:
                valid_jobs_count += 1
                
        # Additionally, repair queue status/progress for any active queue
        for q_id in repaired_queue_ids:
            try:
                queue_id_obj = ObjectId(q_id) if len(q_id) == 24 else q_id
            except Exception:
                queue_id_obj = q_id
            await self._check_queue_completion(db, [str(q_id)])
            
        report = {
            "orphan_jobs_removed": orphan_jobs_removed,
            "repaired_queue_entries": list(repaired_queue_ids),
            "remaining_valid_jobs": valid_jobs_count
        }
        logger.info(f"LEAD_INTEL_STARTUP_CLEANUP_REPORT: {report}")
        return report

    async def run(self):
        from app.services.worker_manager import emit_heartbeat, shutdown_event
        db = get_db()
        if db is not None:
            try:
                await self.startup_cleanup(db)
            except Exception as se:
                logger.error(f"Error during startup cleanup: {se}")
        
        watchdog_counter = 0
        while self.is_running and not shutdown_event.is_set():
            try:
                watchdog_counter += 2
                if watchdog_counter >= 30:
                    watchdog_counter = 0
                    await emit_heartbeat("lead_intelligence_worker")
                await self._process_next_job()
            except Exception as e:
                logger.error(f"Error in Lead Intelligence Worker loop: {e}")
            await asyncio.sleep(2)

    async def _process_next_job(self):
        db = get_db()
        if db is None:
            return

        # ── Discard stale / orphaned jobs BEFORE claiming new work ──
        await self._discard_stale_jobs(db)

        active_queues = await db["lead_intelligence_queues"].find(
            {"status": {"$in": ["Waiting", "Starting", "Building Business Profile", "Analyzing Digital Maturity", "Detecting Opportunities", "Opportunity Scoring", "Generating AI Summary"]}}
        ).to_list(length=100)

        if not active_queues:
            return

        active_queue_ids = [str(q["_id"]) for q in active_queues]

        job = await db["lead_intelligence_jobs"].find_one_and_update(
            {
                "status": "Waiting",
                "queue_id": {"$in": active_queue_ids}
            },
            {
                "$set": {
                    "status": "Building Business Profile",
                    "started_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }
            },
            return_document=True
        )

        if not job:
            await self._check_queue_completion(db, active_queue_ids)
            return

        await self._execute_job(db, job)
        
    async def _discard_stale_jobs(self, db):
        """
        Phase 6 — automatically discard stale / orphan queue entries.

        - Jobs whose queue no longer exists are marked Cancelled (orphan jobs).
        - Jobs stuck in a non-terminal state beyond the stale threshold are
          marked Cancelled so the worker never repeatedly retries them.
        """
        from datetime import timedelta
        STALE_THRESHOLD = timedelta(minutes=20)

        # 1) Orphan jobs (queue missing)
        queues = await db["lead_intelligence_queues"].find({}, {"_id": 1}).to_list(length=1000)
        valid_queue_ids = {str(q["_id"]) for q in queues}
        orphan_modified = 0
        if valid_queue_ids:
            orphan_result = await db["lead_intelligence_jobs"].update_many(
                {
                    "queue_id": {"$nin": list(valid_queue_ids)},
                    "status": {"$nin": ["Completed", "Failed", "Cancelled"]},
                },
                {"$set": {
                    "status": "Cancelled",
                    "error_message": "Orphan job — parent queue no longer exists",
                    "completed_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                }}
            )
            orphan_modified = orphan_result.modified_count
        if orphan_modified:
            logger.warning(f"LEAD_INTEL_ORPHAN_CLEANUP: cancelled {orphan_result.modified_count} orphan jobs")

        # 2) Stale jobs (stuck too long)
        stale_cutoff = datetime.now(timezone.utc) - STALE_THRESHOLD
        stale_result = await db["lead_intelligence_jobs"].update_many(
            {
                "status": {"$nin": ["Completed", "Failed", "Cancelled"]},
                "updated_at": {"$lt": stale_cutoff},
            },
            {"$set": {
                "status": "Cancelled",
                "error_message": "Stale job discarded — exceeded processing time",
                "completed_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }}
        )
        if stale_result.modified_count:
            logger.warning(f"LEAD_INTEL_STALE_CLEANUP: cancelled {stale_result.modified_count} stale jobs")

    async def _check_queue_completion(self, db, active_queue_ids: list):
        for q_id in active_queue_ids:
            try:
                queue_id = ObjectId(q_id) if len(q_id) == 24 else q_id
            except:
                queue_id = q_id
                
            queue = await db["lead_intelligence_queues"].find_one({"_id": queue_id})
            if not queue:
                continue

            pending_count = await db["lead_intelligence_jobs"].count_documents({
                "queue_id": str(q_id),
                "status": {"$nin": ["Completed", "Failed", "Cancelled"]}
            })
            
            if pending_count == 0:
                completed_count = await db["lead_intelligence_jobs"].count_documents({
                    "queue_id": str(q_id),
                    "status": "Completed"
                })
                failed_count = await db["lead_intelligence_jobs"].count_documents({
                    "queue_id": str(q_id),
                    "status": "Failed"
                })
                cancelled_count = await db["lead_intelligence_jobs"].count_documents({
                    "queue_id": str(q_id),
                    "status": "Cancelled"
                })
                
                if failed_count > 0:
                    new_status = "Failed"
                elif completed_count > 0:
                    new_status = "Completed"
                elif cancelled_count > 0:
                    new_status = "Cancelled"
                else:
                    new_status = "Completed"

                await db["lead_intelligence_queues"].update_one(
                    {"_id": queue_id},
                    {"$set": {
                        "status": new_status,
                        "completed_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc),
                        "running_jobs": 0,
                        "overall_progress": 100.0
                    }}
                )
                
    async def _execute_job(self, db, job: dict):
        queue_id = job["queue_id"]
        lead_id = str(job.get("lead_id"))
        job_id = job["_id"]

        # Validate queue existence first (orphan guard)
        try:
            queue_id_obj = ObjectId(queue_id) if len(queue_id) == 24 else queue_id
        except Exception:
            queue_id_obj = queue_id

        queue = await db["lead_intelligence_queues"].find_one({"_id": queue_id_obj})
        if not queue:
            # Orphan job — cancel immediately, never retry
            logger.error(f"LEAD_INTEL_ORPHAN: Job {job_id} has no parent queue. Cancelling.")
            await db["lead_intelligence_jobs"].update_one(
                {"_id": job_id},
                {"$set": {
                    "status": "Cancelled",
                    "error_message": "Orphan job — parent queue missing",
                    "completed_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                }}
            )
            return

        # Validate lead existence (convert string id → ObjectId correctly)
        lead_oid = to_object_id(lead_id)
        lead = await db["leads"].find_one({"_id": lead_oid})
        if not lead:
            # Invalid lead — mark Cancelled so the worker never retries it.
            logger.error(
                f"LEAD_INTEL_INVALID_LEAD: Job {job_id} references missing lead "
                f"{lead_id}. Cancelling (no retry) and removing from queue."
            )
            await db["lead_intelligence_jobs"].update_one(
                {"_id": job_id},
                {"$set": {
                    "status": "Cancelled",
                    "error_message": f"Lead not found: {lead_id}",
                    "completed_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                }}
            )
            # Remove job from queue collection (delete)
            await db["lead_intelligence_jobs"].delete_one({"_id": job_id})
            
            # Repair parent queue entries
            await db["lead_intelligence_queues"].update_one(
                {"_id": queue_id_obj},
                {"$inc": {"total_jobs": -1}}
            )
            
            await self._check_queue_completion(db, [str(queue_id)])
            return

        await db["lead_intelligence_queues"].update_one(
            {"_id": queue_id_obj},
            {"$set": {
                "status": "Building Business Profile",
                "running_jobs": 1,
                "updated_at": datetime.now(timezone.utc)
            }}
        )

        business_name = lead.get("name") or "Unknown"

        async def broadcast(event_type: str, stage: str, message: str):
            try:
                await manager.broadcast({
                    "type": event_type,
                    "lead_id": lead_id,
                    "business_name": business_name,
                    "stage": stage,
                    "message": message,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })
            except Exception as e:
                logger.warning(f"Failed to broadcast {event_type}: {e}")
                
        async def on_update(stage: str, message: str):
            await broadcast("INTELLIGENCE_STARTED", stage, message)

        try:
            await broadcast("INTELLIGENCE_STARTED", "Initializing", "Starting Lead Intelligence pipeline...")
            
            li_service = LeadIntelligenceService(db)
            result = await li_service.execute_intelligence(lead_id, lead, on_update=on_update)
            
            await broadcast("OPPORTUNITY_DETECTED", "Opportunity Detection", f"Detected {len(result.opportunities_detected)} critical opportunities.")
            await broadcast("PRIORITY_UPDATED", "Priority Classification", f"Lead Priority set to {result.priority_classification}.")
            await broadcast("SUMMARY_GENERATED", "AI Summary", "Business summary and talking points generated.")
            
            # Save to MongoDB
            enrichment = LeadEnrichmentData()
            enrichment.lead_intelligence = result.model_dump()
            await lead_enrichment_service.enrich_lead(lead_id, enrichment)
            
            await db["lead_intelligence_jobs"].update_one(
                {"_id": job_id},
                {"$set": {
                    "status": "Completed",
                    "completed_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            
            await broadcast("LEAD_INTELLIGENCE_COMPLETED", "Completed", "Lead Intelligence successfully built and stored.")
            logger.info(f"Lead Intelligence job {job_id} completed successfully for lead {lead_id}.")
            
        except Exception as e:
            logger.error(f"Failed Lead Intelligence job {job_id}: {e}")
            await db["lead_intelligence_jobs"].update_one(
                {"_id": job_id},
                {"$set": {
                    "status": "Failed",
                    "error_message": str(e),
                    "completed_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            await self._check_queue_completion(db, [str(queue_id)])
            
lead_intelligence_worker = LeadIntelligenceWorker()
