"""
Bulk AI Website Analysis Worker — parallel dispatcher.

Reuses the existing single-lead pipeline (AIAnalysisWorker._execute_job) but
drives multiple jobs concurrently per bulk queue (configurable concurrency).

Responsibilities:
  - Claim WAITING / retry-due jobs from bulk queues, up to `concurrency` at a time.
  - Run the existing fault-tolerant pipeline per job.
  - On success, reuse the report for every linked lead (identical website).
  - On failure, mark linked leads as failed and continue — a single failure
    never stops the queue.
  - Persist and broadcast real-time bulk progress (total / completed /
    running / queued / skipped / failed / remaining / current website /
    current business / ETA) plus streaming bulk logs.
  - Finalize the queue with a completion summary (total time, average time
    per website) and never re-run completed work after a restart.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.db.database import get_db
from app.core.logger import logger
from app.core.websocket import manager
from app.models.ai_analysis import AIAnalysisState
from app.services.bulk_ai_analysis_service import (
    ACTIVE_JOB_STATES,
    ACTIVE_QUEUE_STATES,
    TERMINAL_QUEUE_STATES,
    recover_bulk_queues,
)
from app.services.lead_enrichment_service import (
    to_object_id,
    persist_ai_analysis,
    lead_enrichment_service,
)

# JOB_GLOBAL_TIMEOUT mirrors the single-lead worker ceiling (10 minutes).
JOB_GLOBAL_TIMEOUT = 600

# Analysis sub-documents copied verbatim from the primary lead to every
# linked lead so the report is fully reused (not just ai_analysis metadata).
REUSED_LEAD_FIELDS = (
    "ai_analysis",
    "website_information",
    "website_structure",
    "contact_discovery",
    "technology_detection",
    "seo",
    "performance",
    "design",
    "business",
    "social_media",
    "social_media_analysis",
    "mobile",
    "content",
    "seoAudit",
    "lead_intelligence",
    "sales_opportunity",
)

SUCCESS_JOB_STATES = {
    AIAnalysisState.COMPLETED,
    AIAnalysisState.SUCCESS,
    AIAnalysisState.PARTIAL_SUCCESS,
}

SKIPPED_JOB_STATES = {
    AIAnalysisState.SKIPPED,
    AIAnalysisState.CANCELLED,
    AIAnalysisState.TIMEOUT,
    AIAnalysisState.UNKNOWN,
}


class BulkAIAnalysisWorker:
    def __init__(self):
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        self._background_tasks: List[asyncio.Task] = []

    # ── Lifecycle ────────────────────────────────────────────────────────────

    async def start(self) -> None:
        db = get_db()
        if db is not None:
            try:
                await recover_bulk_queues(db)
            except Exception as e:
                logger.error(f"BULK_RECOVERY_FAILED: {e}")

        if not self.is_running:
            self.is_running = True
            self._task = asyncio.create_task(self.run())
            logger.info("BULK_WORKER_STARTED: Bulk AI Analysis Worker started")

    async def stop(self) -> None:
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            logger.info("BULK_WORKER_STOPPED: Bulk AI Analysis Worker stopped")

    # ── Main loop ────────────────────────────────────────────────────────────

    async def run(self) -> None:
        from app.services.worker_manager import emit_heartbeat, shutdown_event

        watchdog_counter = 0
        while self.is_running and not shutdown_event.is_set():
            try:
                watchdog_counter += 2
                if watchdog_counter >= 30:
                    watchdog_counter = 0
                    await emit_heartbeat("bulk_ai_analysis_worker")
                await self._dispatch()
            except Exception as e:
                logger.error(f"BULK_WORKER_LOOP_ERROR: {e}")
            await asyncio.sleep(2)

    # ── Dispatch ─────────────────────────────────────────────────────────────

    async def _dispatch(self) -> None:
        db = get_db()
        if db is None:
            return

        bulk_queues = await db["ai_analysis_queues"].find(
            {"is_bulk": True, "status": {"$in": [s.value for s in ACTIVE_QUEUE_STATES]}}
        ).to_list(length=100)

        if not bulk_queues:
            return

        now = datetime.now(timezone.utc)
        started_new = False

        for queue in bulk_queues:
            qid = str(queue["_id"])
            concurrency = int(queue.get("concurrency") or 1)
            if concurrency < 1:
                concurrency = 1

            running = await db["ai_analysis_jobs"].count_documents(
                {"queue_id": qid, "status": {"$in": [s.value for s in ACTIVE_JOB_STATES]}}
            )
            slots = max(0, concurrency - running)

            for _ in range(slots):
                job = await db["ai_analysis_jobs"].find_one_and_update(
                    {
                        "$or": [
                            {"status": AIAnalysisState.WAITING.value},
                            {
                                "status": AIAnalysisState.RETRY.value,
                                "next_retry_at": {"$lte": now},
                            },
                        ],
                        "queue_id": qid,
                    },
                    {
                        "$set": {
                            "status": AIAnalysisState.STARTED.value,
                            "started_at": now,
                            "updated_at": now,
                        }
                    },
                    return_document=True,
                )

                if not job:
                    break

                old_status = job.get("status")
                await db["ai_analysis_jobs"].update_one(
                    {"_id": job["_id"]},
                    {"$push": {"state_history": {
                        "from": old_status.value if isinstance(old_status, AIAnalysisState) else str(old_status),
                        "to": AIAnalysisState.STARTED.value,
                        "timestamp": now,
                        "reason": "bulk_worker_claimed",
                        "actor": "bulk_ai_analysis_worker",
                    }}},
                )

                # First job of the queue → stamp started_at and announce.
                if not queue.get("started_at"):
                    await db["ai_analysis_queues"].update_one(
                        {"_id": queue["_id"]},
                        {"$set": {"started_at": now, "status": AIAnalysisState.RUNNING.value, "updated_at": now}},
                    )
                    queue["started_at"] = now
                    started_new = True

                # Mark linked leads as Running so they are not re-enqueued and
                # their rows reflect an in-flight analysis.
                for linked_id in job.get("linked_lead_ids") or []:
                    try:
                        await lead_enrichment_service.mark_analysis_started(
                            str(linked_id), str(job["_id"]), job.get("website_url")
                        )
                    except Exception as e:
                        logger.warning(f"BULK_LINKED_START_FAILED: {linked_id}: {e}")

                await self._log(
                    queue, "info",
                    f"Started {await self._business_name(db, job)} ({job.get('website_url')})",
                    job,
                )

                task = asyncio.create_task(self._process_job(job))
                self._background_tasks.append(task)
                task.add_done_callback(self._background_tasks.remove)

        if started_new:
            for queue in bulk_queues:
                try:
                    await manager.broadcast_to_job(str(queue["_id"]), {
                        "type": "BULK_QUEUE_STARTED",
                        "event_type": "BULK_QUEUE_STARTED",
                        "queue_id": str(queue["_id"]),
                        "stage": "Running",
                        "progress": 0.0,
                        "status": AIAnalysisState.RUNNING.value,
                        "message": "Bulk analysis started.",
                        "timestamp": now.isoformat(),
                    })
                except Exception:
                    pass

        # Recompute persisted progress for every active bulk queue.
        for queue in bulk_queues:
            counts = await self._update_bulk_progress(db, queue)
            await self._finalize_if_done(db, queue, counts)

    # ── Per-job processing ───────────────────────────────────────────────────

    async def _process_job(self, job: Dict[str, Any]) -> None:
        from app.services.ai_analysis_worker import ai_analysis_worker_instance

        db = get_db()
        if db is None:
            return

        job_id = job["_id"]
        queue_id = str(job.get("queue_id", ""))
        linked_ids = job.get("linked_lead_ids") or []

        try:
            await asyncio.wait_for(
                ai_analysis_worker_instance._execute_job(db, job),
                timeout=JOB_GLOBAL_TIMEOUT,
            )
        except asyncio.TimeoutError:
            logger.error(f"BULK_JOB_TIMEOUT: Job {job_id} exceeded global timeout of {JOB_GLOBAL_TIMEOUT}s.")
        except asyncio.CancelledError:
            logger.error(f"BULK_JOB_CANCELLED: Job {job_id} was cancelled.")
        except Exception as e:
            logger.error(f"BULK_JOB_ERROR: Job {job_id} unexpected error: {e}")

        updated = await db["ai_analysis_jobs"].find_one({"_id": job_id})
        if not updated:
            return

        status = updated.get("status")
        queue = await db["ai_analysis_queues"].find_one(
            {"_id": self._normalize_oid(queue_id)}
        ) if queue_id else None
        if queue is None:
            return

        if status in SUCCESS_JOB_STATES:
            await self._propagate_to_linked_leads(db, updated, linked_ids)
            duplicate_done = len(linked_ids)
            await db["ai_analysis_queues"].update_one(
                {"_id": queue["_id"]},
                {"$inc": {"duplicate_leads_completed": duplicate_done, "leads_analyzed": 1 + duplicate_done}},
            )
            await self._log(queue, "success", f"Completed {updated.get('website_url')}", updated)
        elif status == AIAnalysisState.FAILED.value:
            for linked_id in linked_ids:
                try:
                    await lead_enrichment_service.mark_analysis_failed(
                        str(linked_id), updated.get("error_message") or "Analysis failed."
                    )
                except Exception as e:
                    logger.warning(f"BULK_LINKED_FAIL_MARK_FAILED: {linked_id}: {e}")
            await self._log(queue, "error", f"Failed {updated.get('website_url')}: {updated.get('error_message') or 'Unknown error'}", updated)
        elif status == AIAnalysisState.RETRY.value:
            await self._log(
                queue, "warning",
                f"Retrying {updated.get('website_url')} (attempt {updated.get('retry_count')}) after transient failure",
                updated,
            )
        elif status in [s.value for s in SKIPPED_JOB_STATES]:
            await self._log(queue, "warning", f"Skipped {updated.get('website_url')}: {updated.get('error_message') or 'Skipped'}", updated)

        try:
            counts = await self._update_bulk_progress(db, queue)
            await self._finalize_if_done(db, queue, counts)
        except Exception as e:
            logger.error(f"BULK_PROGRESS_UPDATE_FAILED: Job {job_id} queue {queue_id}: {e}")

    # ── Report reuse for linked leads ────────────────────────────────────────

    async def _propagate_to_linked_leads(self, db, job: Dict[str, Any], linked_ids: List[str]) -> None:
        if not linked_ids:
            return

        primary = await db["leads"].find_one({"_id": to_object_id(job.get("lead_id"))})
        if not primary:
            return

        reuse: Dict[str, Any] = {}
        for field in REUSED_LEAD_FIELDS:
            if field in primary and primary.get(field) not in (None, {}, []):
                reuse[field] = primary.get(field)

        if not reuse:
            return

        now = datetime.now(timezone.utc)
        for linked_id in linked_ids:
            if str(linked_id) == str(job.get("lead_id")):
                continue
            try:
                await db["leads"].update_one(
                    {"_id": to_object_id(linked_id)},
                    {"$set": {**reuse, "updated_at": now}},
                )
                await manager.broadcast({
                    "type": "LEAD_ANALYSIS_UPDATED",
                    "lead_id": str(linked_id),
                    "fields": list(reuse.keys()),
                    "timestamp": now.isoformat(),
                })
                logger.info(f"BULK_LINKED_REUSED: Report reused for linked lead {linked_id} (job {job.get('_id')})")
            except Exception as e:
                logger.error(f"BULK_LINKED_REUSE_FAILED: linked lead {linked_id}: {e}")

    # ── Progress accounting ──────────────────────────────────────────────────

    async def _count_jobs(self, db, qid: str) -> Optional[Dict[str, Any]]:
        pipeline = [
            {"$match": {"queue_id": qid}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]
        groups = await db["ai_analysis_jobs"].aggregate(pipeline).to_list(length=50)

        counts: Dict[str, int] = {}
        for g in groups:
            key = g.get("_id")
            counts[str(key).upper()] = int(g.get("count", 0))

        total = sum(counts.values())
        if total == 0:
            return None

        completed = counts.get(AIAnalysisState.COMPLETED.value, 0) + \
            counts.get(AIAnalysisState.SUCCESS.value, 0) + \
            counts.get(AIAnalysisState.PARTIAL_SUCCESS.value, 0)
        failed = counts.get(AIAnalysisState.FAILED.value, 0)
        skipped = sum(counts.get(s.value, 0) for s in SKIPPED_JOB_STATES)
        retry = counts.get(AIAnalysisState.RETRY.value, 0)
        running = sum(counts.get(s.value, 0) for s in ACTIVE_JOB_STATES)
        waiting = counts.get(AIAnalysisState.WAITING.value, 0) + \
            counts.get(AIAnalysisState.QUEUED.value, 0) + \
            counts.get(AIAnalysisState.PENDING.value, 0)
        queued = waiting + retry
        remaining = total - completed - failed - skipped

        return {
            "counts": counts,
            "total": total,
            "completed": completed,
            "failed": failed,
            "skipped": skipped,
            "retry": retry,
            "running": running,
            "queued": queued,
            "remaining": remaining,
        }

    async def _update_bulk_progress(self, db, queue: Dict[str, Any]) -> Optional[Dict[str, int]]:
        qid = str(queue["_id"])

        stats = await self._count_jobs(db, qid)
        if stats is None:
            return None

        counts = stats["counts"]
        total = stats["total"]
        completed = stats["completed"]
        failed = stats["failed"]
        skipped = stats["skipped"]
        retry = stats["retry"]
        running = stats["running"]
        queued = stats["queued"]
        remaining = stats["remaining"]

        progress = round((completed / total) * 100, 2) if total else 0.0

        # Current website / business: most recently started active job.
        current_website = None
        current_business = None
        current_job = await db["ai_analysis_jobs"].find_one(
            {"queue_id": qid, "status": {"$in": [s.value for s in ACTIVE_JOB_STATES]}},
            sort=[("started_at", -1)],
        )
        if current_job:
            current_website = current_job.get("website_url")
            try:
                current_lead = await db["leads"].find_one(
                    {"_id": to_object_id(current_job.get("lead_id"))}, {"name": 1}
                )
                current_business = current_lead.get("name") if current_lead else None
            except Exception:
                current_business = None

        started_at = queue.get("started_at")
        now = datetime.now(timezone.utc)
        elapsed = 0.0
        if started_at:
            if isinstance(started_at, datetime):
                if started_at.tzinfo is None:
                    started_at = started_at.replace(tzinfo=timezone.utc)
                elapsed = max(0.0, (now - started_at).total_seconds())
            else:
                try:
                    parsed = datetime.fromisoformat(str(started_at))
                    if parsed.tzinfo is None:
                        parsed = parsed.replace(tzinfo=timezone.utc)
                    elapsed = max(0.0, (now - parsed).total_seconds())
                except Exception:
                    elapsed = 0.0

        average_time = round(elapsed / completed, 2) if completed else 0.0
        eta_seconds = int(average_time * remaining) if average_time and remaining > 0 else None

        duplicate_total = int(queue.get("duplicate_leads") or 0)
        duplicate_done = int(queue.get("duplicate_leads_completed") or 0)
        leads_analyzed = completed + duplicate_done

        update_data = {
            "completed_jobs": completed,
            "failed_jobs": failed,
            "skipped_jobs": skipped,
            "running_jobs": running,
            "pending_jobs": queued,
            "overall_progress": progress,
            "leads_analyzed": leads_analyzed,
            "duplicate_leads_completed": duplicate_done,
            "current_lead_index": completed + running + 1,
            "updated_at": now,
        }
        await db["ai_analysis_queues"].update_one({"_id": queue["_id"]}, {"$set": update_data})

        try:
            await manager.broadcast_to_job(qid, {
                "type": "bulk_progress",
                "event_type": "bulk_progress",
                "queue_id": qid,
                "status": queue.get("status"),
                "progress": progress,
                "total": total,
                "completed": completed,
                "running": running,
                "queued": queued,
                "retry": retry,
                "skipped": skipped,
                "failed": failed,
                "remaining": remaining,
                "total_leads": int(queue.get("total_leads") or total),
                "leads_analyzed": leads_analyzed,
                "duplicate_leads": duplicate_total,
                "duplicate_leads_completed": duplicate_done,
                "current_website": current_website,
                "current_business": current_business,
                "elapsed_seconds": elapsed,
                "eta_seconds": eta_seconds,
                "average_time_per_website": average_time,
                "concurrency": int(queue.get("concurrency") or 1),
                "timestamp": now.isoformat(),
            })
        except Exception as e:
            logger.warning(f"BULK_PROGRESS_BROADCAST_FAILED: {e}")

        return {
            "completed": completed,
            "failed": failed,
            "skipped": skipped,
            "duplicate_done": duplicate_done,
            "leads_analyzed": leads_analyzed,
        }

    # ── Completion summary ───────────────────────────────────────────────────

    async def _finalize_if_done(self, db, queue: Dict[str, Any], counts: Optional[Dict[str, int]] = None) -> None:
        qid = str(queue["_id"])

        if queue.get("_bulk_summary_broadcast"):
            return
        if queue.get("status") not in [s.value for s in TERMINAL_QUEUE_STATES]:
            pending = await db["ai_analysis_jobs"].count_documents(
                {"queue_id": qid, "status": {"$nin": [s.value for s in TERMINAL_QUEUE_STATES]}}
            )
            if pending > 0:
                return

        now = datetime.now(timezone.utc)
        started_at = queue.get("started_at")
        total_time = None
        if started_at:
            try:
                if isinstance(started_at, datetime):
                    if started_at.tzinfo is None:
                        started_at = started_at.replace(tzinfo=timezone.utc)
                    total_time = round((now - started_at).total_seconds(), 2)
                else:
                    parsed = datetime.fromisoformat(str(started_at))
                    if parsed.tzinfo is None:
                        parsed = parsed.replace(tzinfo=timezone.utc)
                    total_time = round((now - parsed).total_seconds(), 2)
            except Exception:
                total_time = None

        stats = await self._count_jobs(db, qid)
        completed = (stats or {}).get("completed", (counts or {}).get("completed", int(queue.get("completed_jobs") or 0)))
        average_time = round(total_time / completed, 2) if total_time and completed else 0.0

        duplicate_done = (counts or {}).get("duplicate_done", int(queue.get("duplicate_leads_completed") or 0))
        leads_analyzed = completed + duplicate_done
        failed = (stats or {}).get("failed", (counts or {}).get("failed", int(queue.get("failed_jobs") or 0)))
        skipped_count = (stats or {}).get("skipped", (counts or {}).get("skipped", int(queue.get("skipped_jobs") or 0))) + len(queue.get("skipped_leads") or [])

        result = await db["ai_analysis_queues"].find_one_and_update(
            {"_id": queue["_id"], "_bulk_summary_broadcast": {"$ne": True}},
            {
                "$set": {
                    "total_time": total_time,
                    "average_time": average_time,
                    "leads_analyzed": leads_analyzed,
                    "duplicate_leads_completed": duplicate_done,
                    "running_jobs": 0,
                    "pending_jobs": 0,
                    "overall_progress": 100.0,
                    "completed_at": now,
                    "updated_at": now,
                    "_bulk_summary_broadcast": True,
                }
            },
            return_document=False,
        )
        if result is None:
            return

        try:
            await manager.broadcast_to_job(qid, {
                "type": "bulk_completed",
                "event_type": "bulk_completed",
                "queue_id": qid,
                "stage": "Completed",
                "status": queue.get("status"),
                "progress": 100.0,
                "summary": {
                    "total_leads": int(queue.get("total_leads") or 0) + len(queue.get("skipped_leads") or []),
                    "analyzed": leads_analyzed,
                    "websites_analyzed": completed,
                    "skipped": skipped_count,
                    "failed": failed,
                    "total_time": total_time,
                    "average_time_per_website": average_time,
                },
                "timestamp": now.isoformat(),
            })
        except Exception as e:
            logger.warning(f"BULK_COMPLETED_BROADCAST_FAILED: {e}")

    # ── Helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _normalize_oid(value: Any) -> Any:
        """Convert a 24-char hex string to ObjectId for Mongo lookups."""
        if isinstance(value, ObjectId):
            return value
        if isinstance(value, str) and len(value) == 24:
            try:
                return ObjectId(value)
            except Exception:
                pass
        return value

    async def _log(self, queue: Dict[str, Any], level: str, message: str, job: Optional[Dict[str, Any]] = None) -> None:
        try:
            await manager.broadcast_to_job(str(queue["_id"]), {
                "type": "bulk_log",
                "event_type": "bulk_log",
                "queue_id": str(queue["_id"]),
                "level": level,
                "business_name": (job or {}).get("business_name"),
                "website": (job or {}).get("website_url"),
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.warning(f"BULK_LOG_BROADCAST_FAILED: {e}")

    async def _business_name(self, db, job: Dict[str, Any]) -> str:
        try:
            lead = await db["leads"].find_one(
                {"_id": to_object_id(job.get("lead_id"))}, {"name": 1}
            )
            return lead.get("name") if lead else job.get("website_url")
        except Exception:
            return job.get("website_url") or "Unknown"


bulk_ai_analysis_worker_instance = BulkAIAnalysisWorker()
