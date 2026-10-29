import logging
from typing import Optional, Dict, Any
from app.db.database import get_db
from app.models.activity_log import ActivityLogCreate
from datetime import datetime

logger = logging.getLogger(__name__)

async def log_user_activity(
    user_id: str,
    activity_type: str,
    module: str,
    title: str,
    description: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    browser: Optional[str] = None,
    device: Optional[str] = None
):
    """
    Logs user activity to the activity_logs collection for the Enterprise Admin Module.
    """
    try:
        db = get_db()
        log_entry = ActivityLogCreate(
            user_id=user_id,
            activity_type=activity_type,
            module=module,
            title=title,
            description=description,
            metadata=metadata or {},
            ip_address=ip_address,
            browser=browser,
            device=device,
            created_at=datetime.utcnow()
        )
        
        await db["activity_logs"].insert_one(log_entry.model_dump())
    except Exception as e:
        logger.error(f"Failed to log user activity: {e}")
