from app.db.database import get_db
from datetime import datetime, timezone
import logging

from .stop import TERMINAL_STATES

logger = logging.getLogger(__name__)

class Progress:
    """
    Manages job tracking and status updates.
    """
    
    async def create_job(self, keyword: str, area: str, city: str, state: str, country: str, limit: int, provider: str = "Google Maps", user_id: str = None, exhaustive: bool = False, grid_size: int = 3, target_cap: str = "ALL") -> str:
        """
        Creates a new SearchJob in the database and returns its ID.
        """
        db = get_db()
        if db is None:
            logger.error("[PROGRESS] No database connection available.")
            raise Exception("Database connection unavailable")
            
        now = datetime.now(timezone.utc)
        job_doc = {
            "keyword": keyword,
            "area": area,
            "city": city,
            "state": state,
            "country": country,
            "provider": provider,
            "limit": limit,
            "exhaustive": bool(exhaustive),
            "grid_size": int(grid_size or 3),
            "target_cap": target_cap,
            "user_id": user_id,
            "status": "QUEUED",
            "progress": 0,
            "total_found": 0,
            "accepted_leads": 0,
            "rejected_leads": 0,
            "duplicates_removed": 0,
            "completed_leads": 0,
            "duration_seconds": 0,
            "estimated_remaining_time": 0,
            "logs": [{"stage": "CREATED", "message": f"Job created (Target Cap: {target_cap})", "timestamp": now}],
            "created_at": now,
            "updated_at": now
        }
        
        result = await db["search_jobs"].insert_one(job_doc)
        return str(result.inserted_id)

    async def update_status(self, job_id: str, status: str, stage: str = None, message: str = None):
        """
        Updates the job status and appends a log entry.

        Guards against race conditions: if the job has already reached a
        terminal state (STOPPED, COMPLETED, FAILED, CANCELLED, TIMEOUT) a
        delayed non-terminal update is ignored, so STOPPED can never be
        overwritten back to RUNNING.
        """
        db = get_db()
        if db is None:
            return
            
        from bson.objectid import ObjectId
        
        update_doc = {
            "$set": {
                "status": status,
                "updated_at": datetime.now(timezone.utc)
            }
        }
        
        query = {"_id": ObjectId(job_id)}
        if status not in TERMINAL_STATES:
            query["status"] = {"$nin": list(TERMINAL_STATES)}
        elif status != "STOPPED":
            # STOPPED is the strongest terminal state: once a job is STOPPED,
            # a competing COMPLETED/FAILED/CANCELLED/TIMEOUT update is ignored.
            query["status"] = {"$ne": "STOPPED"}
        
        if status in TERMINAL_STATES:
            update_doc["$set"]["completed_at"] = datetime.now(timezone.utc)
            if status == "STOPPED":
                update_doc["$set"]["stopped_at"] = datetime.now(timezone.utc)
            if status == "FAILED" and message:
                update_doc["$set"]["error_message"] = message
                
        if stage and message:
            update_doc["$push"] = {
                "logs": {
                    "stage": stage,
                    "message": message,
                    "timestamp": datetime.now(timezone.utc)
                }
            }
            
        await db["search_jobs"].update_one(
            query,
            update_doc
        )

    async def mark_stopped(self, job_id: str, reason: str = "Stopped by user", logs: list = None):
        """
        Atomically transitions a job to the terminal STOPPED state.

        Preserves the current progress so the UI freezes on the last known
        value, and appends the terminal log block. Idempotent: jobs that are
        already terminal are left untouched.
        """
        db = get_db()
        if db is None:
            return None

        from bson.objectid import ObjectId
        now = datetime.now(timezone.utc)

        job = await db["search_jobs"].find_one(
            {"_id": ObjectId(job_id)},
            {"status": 1, "progress": 1, "completed_leads": 1, "total_found": 1}
        )
        if job is None:
            return None
        if job.get("status") in TERMINAL_STATES:
            return job

        update_doc = {
            "$set": {
                "status": "STOPPED",
                "stopped_at": now,
                "completed_at": now,
                "stop_reason": reason,
                "progress": job.get("progress", 0),
                "updated_at": now
            }
        }
        if logs:
            update_doc["$push"] = {
                "logs": {
                    "$each": [
                        {
                            "stage": stage,
                            "message": message,
                            "timestamp": now
                        }
                        for stage, message in logs
                    ]
                }
            }

        await db["search_jobs"].update_one(
            {"_id": ObjectId(job_id)},
            update_doc
        )
        return job

    async def log(self, job_id: str, stage: str, message: str):
        """
        Appends a log entry to the job without changing its primary status.
        """
        db = get_db()
        if db is None:
            return
            
        from bson.objectid import ObjectId
        await db["search_jobs"].update_one(
            {"_id": ObjectId(job_id)},
            {
                "$push": {
                    "logs": {
                        "stage": stage,
                        "message": message,
                        "timestamp": datetime.now(timezone.utc)
                    }
                },
                "$set": {"updated_at": datetime.now(timezone.utc)}
            }
        )
        
    async def complete_job(
        self,
        job_id: str,
        status: str,
        message: str = None,
        found: int = 0,
        accepted: int = 0,
        rejected: int = 0,
        duplicates: int = 0,
        saved: int = 0,
        limit: int = 0,
        target_reached: bool = True,
        source_exhausted: bool = False,
    ):
        """
        Atomically transitions a job to a terminal COMPLETED state while recording
        the requested target vs the actual collected count and the completion reason.

        The only two legitimate ways to complete are:
        * TARGET_REACHED: saved >= limit (valid unique persisted leads).
        * SOURCE_EXHAUSTED: Google Maps had no more unique usable results.

        A competing STOPPED state always wins over this update.
        """
        db = get_db()
        if db is None:
            logger.error("[PROGRESS] No database connection available.")
            return

        from bson.objectid import ObjectId
        now = datetime.now(timezone.utc)

        # Authoritative MongoDB count of unique leads persisted for this job.
        actual_saved = saved
        try:
            db_saved = await db["leads"].count_documents({"source_job_id": job_id})
            if db_saved > 0:
                actual_saved = db_saved
        except Exception as e:
            logger.warning(f"[PROGRESS] Failed to verify saved leads for job {job_id}: {e}")

        if limit > 0:
            progress_pct = min(100, int((actual_saved / limit) * 100))
        else:
            progress_pct = 100 if target_reached else 0

        # Duration
        elapsed_seconds = 0
        job = await db["search_jobs"].find_one({"_id": ObjectId(job_id)}, {"created_at": 1})
        if job and job.get("created_at"):
            created_at = job["created_at"]
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            elapsed_seconds = (now - created_at).total_seconds()

        completion_reason = "TARGET_REACHED" if target_reached else "SOURCE_EXHAUSTED"

        update_doc = {
            "$set": {
                "status": status,
                "progress": progress_pct,
                "total_found": found,
                "accepted_leads": accepted,
                "rejected_leads": rejected,
                "duplicates_removed": duplicates,
                "completed_leads": actual_saved,
                "total_leads": actual_saved,
                "requested_target": limit,
                "actual_collected": actual_saved,
                "target_reached": bool(target_reached),
                "source_exhausted": bool(source_exhausted),
                "completion_reason": completion_reason,
                "completion_message": message,
                "duration_seconds": int(elapsed_seconds),
                "completed_at": now,
                "updated_at": now,
            }
        }
        if message:
            update_doc["$push"] = {
                "logs": {
                    "stage": "COMPLETE",
                    "message": message,
                    "timestamp": now,
                }
            }

        # A competing terminal state (STOPPED, TIMEOUT, FAILED, CANCELLED) must
        # never be overwritten back to COMPLETED.
        await db["search_jobs"].update_one(
            {"_id": ObjectId(job_id), "status": {"$nin": list(TERMINAL_STATES)}},
            update_doc,
        )
        logger.info(
            f"[PROGRESS] Job {job_id} completed: reason={completion_reason} "
            f"saved={actual_saved}/{limit}"
        )

    async def update_progress(self, job_id: str, found: int = 0, accepted: int = 0, rejected: int = 0, duplicates: int = 0, saved: int = 0, limit: int = 0):
        """
        Updates the numeric progress of the job, including all granular counters and ETA.

        Once the job reaches a terminal state (e.g. STOPPED) the counters are
        frozen and delayed updates are ignored so they can never overwrite the
        stopped state.
        """
        db = get_db()
        if db is None:
            return
            
        from bson.objectid import ObjectId
        now = datetime.now(timezone.utc)
        
        # Calculate progress percentage and ETA
        progress_pct = 0
        if limit > 0:
            progress_pct = min(100, int((saved / limit) * 100))
        
        # Calculate elapsed time
        job = await db["search_jobs"].find_one({"_id": ObjectId(job_id)}, {"created_at": 1, "status": 1})
        if job and job.get("status") in TERMINAL_STATES:
            return
        elapsed_seconds = 0
        eta = 0
        if job and "created_at" in job:
            # created_at is naive or aware, enforce aware
            created_at = job["created_at"]
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
                
            elapsed_seconds = (now - created_at).total_seconds()
            
            if saved > 0 and limit > 0:
                rate = saved / elapsed_seconds
                remaining = limit - saved
                if rate > 0:
                    eta = remaining / rate
            
        await db["search_jobs"].update_one(
            {"_id": ObjectId(job_id)},
            {
                "$set": {
                    "total_found": found,
                    "accepted_leads": accepted,
                    "rejected_leads": rejected,
                    "duplicates_removed": duplicates,
                    "completed_leads": saved,
                    "total_leads": saved,
                    "progress": progress_pct,
                    "duration_seconds": elapsed_seconds,
                    "estimated_remaining_time": eta,
                    "updated_at": now
                }
            }
        )

    async def get_job(self, job_id: str) -> dict:
        """
        Retrieves job details.
        """
        db = get_db()
        if db is None:
            return None
            
        from bson.objectid import ObjectId
        job = await db["search_jobs"].find_one({"_id": ObjectId(job_id)})
        if job:
            job["_id"] = str(job["_id"])
        return job
