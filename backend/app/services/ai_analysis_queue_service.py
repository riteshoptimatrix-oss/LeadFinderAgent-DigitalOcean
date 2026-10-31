from bson import ObjectId
from datetime import datetime
from typing import List, Dict, Any, Optional

from app.db.database import get_db
from app.models.ai_analysis import (
    AIAnalysisQueueCreate,
    AIAnalysisQueueInDB,
    AIAnalysisJobCreate,
    AIAnalysisState
)
from app.core.logger import logger
from app.core.websocket import manager

class AIAnalysisQueueService:
    @staticmethod
    async def create_queue(user_id: str, leads: List[Dict[str, Any]]) -> AIAnalysisQueueInDB:
        db = get_db()
        queue_collection = db["ai_analysis_queues"]
        job_collection = db["ai_analysis_jobs"]

        queue_id = ObjectId()
        
        # Filter leads to only include those with valid website URLs
        valid_leads = [
            lead for lead in leads 
            if lead.get("website") and str(lead.get("website")).strip()
        ]
        
        # Create jobs after verifying lead documents exist in MongoDB
        jobs = []
        for lead in valid_leads:
            lead_id_raw = lead.get("_id", lead.get("id"))
            lead_id_str = str(lead_id_raw)
            
            # Normalize ID format
            if isinstance(lead_id_raw, ObjectId):
                lead_oid = lead_id_raw
            elif ObjectId.is_valid(lead_id_str):
                lead_oid = ObjectId(lead_id_str)
            else:
                lead_oid = lead_id_str
            
            # Verify the lead exists in MongoDB
            lead_in_db = await db["leads"].find_one({"_id": lead_oid})
            if not lead_in_db:
                logger.error(
                    f"QUEUE_VALIDATION_FAILED: Cannot enqueue job for lead {lead_id_str}. "
                    f"Reason: Lead document not found in collection 'leads' of DB '{db.name}'. "
                    f"Lead data checked: {lead}"
                )
                continue
                
            logger.info(f"QUEUE_VALIDATION_SUCCESS: Lead {lead_id_str} verified in DB. Enqueueing AI Analysis job.")
            
            job_id = ObjectId()
            job = AIAnalysisJobCreate(
                queue_id=str(queue_id),
                lead_id=lead_id_str,
                website_url=str(lead.get("website")).strip(),
                status=AIAnalysisState.WAITING
            )
            job_dict = job.model_dump()
            job_dict["_id"] = job_id
            jobs.append(job_dict)

        if jobs:
            await job_collection.insert_many(jobs)
            queue_status = AIAnalysisState.WAITING
            from datetime import timezone
            now_utc = datetime.now(timezone.utc)
            lead_oids = []
            for j in jobs:
                lid = j.get("lead_id")
                if isinstance(lid, ObjectId):
                    lead_oids.append(lid)
                elif isinstance(lid, str) and ObjectId.is_valid(lid):
                    lead_oids.append(ObjectId(lid))
            if lead_oids:
                await db["leads"].update_many(
                    {"_id": {"$in": lead_oids}},
                    {"$set": {
                        "ai_analysis.analysis_status": "Queued",
                        "ai_analysis.status": "Queued",
                        "ai_analysis.progress": 10,
                        "ai_analysis.stage": "Queued for AI analysis",
                        "ai_analysis.queue_id": str(queue_id),
                        "ai_analysis.analysis_started_at": now_utc,
                        "updated_at": now_utc,
                    }}
                )
        else:
            queue_status = AIAnalysisState.EMPTY

        # Create queue
        queue = AIAnalysisQueueCreate(
            user_id=user_id or "system",
            total_jobs=len(jobs),
            status=queue_status
        )
        
        queue_dict = queue.model_dump()
        queue_dict["_id"] = queue_id
        await queue_collection.insert_one(queue_dict)

        # ── Real-time: announce the freshly created queue ──
        from datetime import datetime
        try:
            await manager.broadcast_to_job(str(queue_id), {
                "type": "QUEUE_CREATED",
                "event_type": "QUEUE_CREATED",
                "queue_id": str(queue_id),
                "stage": "Queued",
                "progress": 0.0,
                "status": queue_status.value,
                "total_jobs": len(jobs),
                "message": f"AI analysis queue created with {len(jobs)} job(s). Awaiting worker assignment.",
                "timestamp": datetime.utcnow().isoformat(),
            })
            if jobs:
                await manager.broadcast_to_job(str(queue_id), {
                    "type": "job_created",
                    "event_type": "job_created",
                    "queue_id": str(queue_id),
                    "job_id": str(jobs[0]["_id"]),
                    "lead_id": jobs[0]["lead_id"],
                    "website": jobs[0]["website_url"],
                    "stage": "Queued",
                    "progress": 0.0,
                    "message": "Job created and queued for AI website analysis",
                    "timestamp": datetime.utcnow().isoformat(),
                })
        except Exception as ws_err:
            logger.warning(f"Failed to broadcast queue creation for {queue_id}: {repr(ws_err)}")

        logger.info(f"Created AI Analysis Queue {queue_id} with {len(jobs)} valid jobs for user {user_id}. Status: {queue_status}")
        return AIAnalysisQueueInDB(**queue_dict)

    @staticmethod
    async def get_queue_status(queue_id: str) -> Optional[Dict[str, Any]]:
        db = get_db()
        queue = await db["ai_analysis_queues"].find_one({"_id": ObjectId(queue_id) if isinstance(queue_id, str) and len(queue_id)==24 else queue_id})
        if not queue:
            return None
            
        jobs = await db["ai_analysis_jobs"].find({"queue_id": str(queue_id)}).to_list(length=1000)
        
        # Recalculate counts based on terminal states
        completed = sum(1 for j in jobs if j.get("status") in (
            AIAnalysisState.COMPLETED,
            AIAnalysisState.SUCCESS,
            AIAnalysisState.PARTIAL_SUCCESS,
        ))
        failed = sum(1 for j in jobs if j.get("status") == AIAnalysisState.FAILED)
        skipped = sum(1 for j in jobs if j.get("status") in (AIAnalysisState.SKIPPED, AIAnalysisState.CANCELLED, AIAnalysisState.TIMEOUT))
        
        queue["completed_jobs"] = completed
        queue["failed_jobs"] = failed
        queue["skipped_jobs"] = skipped # Include all non-terminal skips
        queue["jobs"] = jobs
        
        return queue

    @staticmethod
    async def get_queue_history(user_id: str) -> List[Dict[str, Any]]:
        db = get_db()
        queues = await db["ai_analysis_queues"].find({"user_id": user_id}).sort("created_at", -1).to_list(length=50)
        return queues

    @staticmethod
    async def update_queue_status(queue_id: str, new_status: AIAnalysisState) -> bool:
        db = get_db()
        
        # Validate Transition
        current_queue = await db["ai_analysis_queues"].find_one({"_id": ObjectId(queue_id) if len(queue_id)==24 else queue_id})
        if not current_queue:
            return False
            
        current_status = current_queue.get("status")
        
        # Prevent moving out of terminal states
        terminal_states = [AIAnalysisState.COMPLETED, AIAnalysisState.SUCCESS, AIAnalysisState.PARTIAL_SUCCESS, AIAnalysisState.FAILED, AIAnalysisState.SKIPPED, AIAnalysisState.CANCELLED, AIAnalysisState.TIMEOUT]
        if current_status in terminal_states:
            logger.warning(f"Cannot transition queue {queue_id} from {current_status} to {new_status}. It is terminal.")
            return False

        now = datetime.utcnow()
        update_data = {
            "status": new_status,
            "updated_at": now,
        }
        if new_status in terminal_states:
            update_data["completed_at"] = now

        history_entry = {
            "from": str(current_status) if current_status else None,
            "to": new_status.value,
            "timestamp": now,
            "reason": "api_update",
            "actor": "queue_service",
        }
            
        result = await db["ai_analysis_queues"].update_one(
            {"_id": current_queue["_id"], "status": current_status},
            {
                "$set": update_data,
                "$push": {"state_history": history_entry},
            }
        )
        if result.modified_count == 0:
            logger.warning(
                f"Queue {queue_id} status update race: expected {current_status}, "
                f"but another process changed it. Update skipped."
            )
            return False
        
        logger.info(f"TRANSITION [ai_analysis_queue]: {current_status} -> {new_status}")
        return result.modified_count > 0

    @staticmethod
    async def retry_failed_jobs(queue_id: str) -> bool:
        db = get_db()
        now = datetime.utcnow()

        # Fetch affected jobs before updating to capture old statuses
        affected = await db["ai_analysis_jobs"].find(
            {"queue_id": str(queue_id), "status": {"$in": [AIAnalysisState.FAILED, AIAnalysisState.TIMEOUT, AIAnalysisState.SKIPPED, AIAnalysisState.RETRY]}}
        ).to_list(length=1000)

        old_statuses = {}
        for j in affected:
            old_statuses[str(j["_id"])] = j.get("status")

        result = await db["ai_analysis_jobs"].update_many(
            {"queue_id": str(queue_id), "status": {"$in": [AIAnalysisState.FAILED, AIAnalysisState.TIMEOUT, AIAnalysisState.SKIPPED, AIAnalysisState.RETRY]}},
            {
                "$set": {
                    "status": AIAnalysisState.WAITING,
                    "updated_at": now,
                    "retry_count": 0,
                    "dead_letter": False,
                },
                "$unset": {
                    "next_retry_at": "",
                    "dead_lettered_at": "",
                }
            }
        )
        if result.modified_count > 0:
            # Push state history for each affected job
            for job_id_str, old_st in old_statuses.items():
                await db["ai_analysis_jobs"].update_one(
                    {"_id": ObjectId(job_id_str)},
                    {"$push": {
                        "state_history": {
                            "from": str(old_st) if old_st else None,
                            "to": AIAnalysisState.WAITING.value,
                            "timestamp": now,
                            "reason": "manual_retry",
                            "actor": "queue_service",
                        }
                    }}
                )

            # Ensure queue is back to WAITING with history
            queue_filter = {"_id": ObjectId(queue_id) if len(queue_id)==24 else queue_id}
            queue_doc = await db["ai_analysis_queues"].find_one(queue_filter)
            old_q_status = queue_doc.get("status") if queue_doc else None
            await db["ai_analysis_queues"].update_one(
                queue_filter,
                {
                    "$set": {"status": AIAnalysisState.WAITING, "updated_at": now},
                    "$push": {
                        "state_history": {
                            "from": str(old_q_status) if old_q_status else None,
                            "to": AIAnalysisState.WAITING.value,
                            "timestamp": now,
                            "reason": "manual_retry",
                            "actor": "queue_service",
                        }
                    }
                }
            )
            logger.info(f"TRANSITION: Retried {result.modified_count} jobs in queue {queue_id} to WAITING")
        return True
