"""
Automatic Cleanup Service
Runs daily to prune stale data, orphaned records, and expired logs.
"""
import logging
from datetime import datetime, timedelta
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def run_cleanup(db: AsyncIOMotorDatabase):
    """Main cleanup routine. Called by APScheduler daily."""
    logger.info("=== Starting daily cleanup ===")
    metrics = {
        "orphaned_queue_records": 0,
        "expired_sessions": 0,
        "stale_worker_nodes": 0,
    }

    try:
        # 1. Clean orphaned queue records (RUNNING with no heartbeat > 1 hour)
        cutoff = datetime.utcnow() - timedelta(hours=1)

        # Search queue items stuck in RUNNING
        result = await db["search_queue"].update_many(
            {"status": "RUNNING", "updated_at": {"$lt": cutoff}},
            {"$set": {"status": "PENDING", "worker_id": None}},
        )
        metrics["orphaned_queue_records"] += result.modified_count

        # Email queue items stuck in processing
        result = await db["email_queue"].update_many(
            {"status": "Processing", "last_attempt_at": {"$lt": cutoff}},
            {"$set": {"status": "Pending"}},
        )
        metrics["orphaned_queue_records"] += result.modified_count

        # WhatsApp queue items stuck in processing
        result = await db["whatsapp_queue"].update_many(
            {"status": "Processing", "last_attempt_at": {"$lt": cutoff}},
            {"$set": {"status": "Pending"}},
        )
        metrics["orphaned_queue_records"] += result.modified_count

        # 2. Clean expired sessions (older than 24 hours past their expiration)
        session_cutoff = datetime.utcnow() - timedelta(hours=24)
        result = await db["sessions"].delete_many(
            {"expires_at": {"$lt": session_cutoff}}
        )
        metrics["expired_sessions"] = result.deleted_count

        # 3. Mark stale worker nodes as OFFLINE
        worker_cutoff = datetime.utcnow() - timedelta(minutes=5)
        result = await db["worker_nodes"].update_many(
            {"last_heartbeat": {"$lt": worker_cutoff}, "status": "ONLINE"},
            {"$set": {"status": "OFFLINE"}},
        )
        metrics["stale_worker_nodes"] = result.modified_count

    except Exception as e:
        logger.error(f"Cleanup error: {e}", exc_info=True)

    logger.info(f"=== Cleanup complete: {metrics} ===")
    return metrics
