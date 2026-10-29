import socket
from datetime import datetime
from app.db.database import get_db
from app.core.logger import logger

NODE_ID = socket.gethostname()

import psutil
import asyncio

# Global shutdown event for graceful exit
shutdown_event = asyncio.Event()

async def emit_heartbeat(worker_name: str = "general_worker"):
    """Background task to announce worker is alive and provide metrics."""
    try:
        db = get_db()
    except Exception:
        return
        
    try:
        now = datetime.utcnow()
        cpu_usage = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        mem_usage = mem.percent
        
        await db["worker_nodes"].update_one(
            {"node_id": NODE_ID, "worker_name": worker_name},
            {
                "$set": {
                    "last_heartbeat": now,
                    "status": "ONLINE",
                    "cpu_percent": cpu_usage,
                    "memory_percent": mem_usage
                },
                "$setOnInsert": {
                    "started_at": now,
                    "active_jobs": 0
                }
            },
            upsert=True
        )
    except Exception as e:
        logger.error(f"Failed to emit heartbeat for {worker_name}: {str(e)}")

async def log_job_event(job_type: str, level: str, message: str, target_id: str = None, details: dict = None):
    """Utility to log job events to the unified JobLog collection."""
    try:
        db = get_db()
    except Exception:
        return
        
    from app.models.worker import JobLogCreate
    
    log_entry = JobLogCreate(
        job_type=job_type,
        level=level,
        message=message,
        target_id=target_id,
        details=details
    )
    
    try:
        await db["job_logs"].insert_one(log_entry.model_dump(by_alias=True))
    except Exception as e:
        logger.error(f"Failed to write to job_logs: {str(e)}")
