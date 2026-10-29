from app.db.database import get_db
from app.models.audit import AuditLogCreate, ActivityLogCreate
from app.core.logger import logger
from typing import Optional, Any, Dict

async def log_audit_action(
    action: str, 
    user_id: Optional[str] = None, 
    user_email: str = "Unknown",
    resource: Optional[str] = None,
    resource_id: Optional[str] = None, 
    ip_address: Optional[str] = None, 
    user_agent: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
):
    """
    Asynchronously write an audit log to MongoDB.
    """
    db = get_db()
    if db is None:
        return
        
    try:
        audit_log = AuditLogCreate(
            user_id=user_id or "system",
            user_email=user_email,
            action=action,
            resource=resource,
            resource_id=resource_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details=details
        )
        await db["audit_logs"].insert_one(audit_log.model_dump(by_alias=True))
    except Exception as e:
        logger.error(f"Failed to record audit log: {str(e)}")

async def log_activity_action(
    type: str,
    description: str,
    user_id: str,
    metadata: Optional[Dict[str, Any]] = None
):
    """
    Asynchronously write an activity log to MongoDB.
    """
    db = get_db()
    if db is None:
        return
        
    try:
        activity_log = ActivityLogCreate(
            user_id=user_id,
            type=type,
            description=description,
            metadata=metadata
        )
        await db["activity_logs"].insert_one(activity_log.model_dump(by_alias=True))
    except Exception as e:
        logger.error(f"Failed to record activity log: {str(e)}")
