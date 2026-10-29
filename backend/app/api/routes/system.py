from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import UserInDB

router = APIRouter()

@router.get("/health")
async def get_health(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    # MongoDB ping
    db_status = "unhealthy"
    try:
        await db.command("ping")
        db_status = "healthy"
    except Exception:
        pass

    return {
        "status": "online",
        "timestamp": datetime.utcnow(),
        "database": db_status,
        "memory_percent": 45.0,
        "cpu_percent": 12.0
    }

@router.get("/jobs")
async def get_jobs(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    return {
        "active_jobs": 0,
        "queued_jobs": 0,
        "failed_jobs": 0,
        "completed_jobs": 0,
        "workers_online": 1
    }

@router.get("/audit")
async def get_system_audit_logs(
    skip: int = 0,
    limit: int = 50,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get system audit logs.
    """
    # For now return empty list or fetch from an audit collection
    cursor = db["system_audit_logs"].find().sort("created_at", -1).skip(skip).limit(limit)
    logs = await cursor.to_list(length=None)
    
    # ensure _id is string
    for log in logs:
        log["_id"] = str(log["_id"])
        
    return {"data": logs, "total": len(logs)}
