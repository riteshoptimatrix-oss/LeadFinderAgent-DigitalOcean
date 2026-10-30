import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from bson import ObjectId
from app.models.notification import NotificationCreate

logger = logging.getLogger(__name__)

async def create_notification(
    db,
    user_id: str,
    title: str,
    message: str,
    notif_type: str = "system",
    link: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Optional[Dict[str, Any]]:
    """Insert a new notification for a given user."""
    try:
        data = {
            "user_id": str(user_id),
            "type": notif_type,
            "title": title,
            "message": message,
            "link": link or "/dashboard",
            "read": False,
            "metadata": metadata or {},
            "created_at": datetime.utcnow()
        }
        res = await db["notifications"].insert_one(data)
        data["_id"] = str(res.inserted_id)
        return data
    except Exception as e:
        logger.error(f"Error creating notification: {e}")
        return None

async def ensure_user_notifications(db, user_id: str) -> None:
    """
    If the user has 0 notifications, intelligently derive initial notifications
    from recent search jobs, leads, campaigns, or welcome events.
    """
    try:
        count = await db["notifications"].count_documents({"user_id": str(user_id)})
        if count > 0:
            return

        initial_notifications: List[Dict[str, Any]] = []

        # 1. Check for recent search jobs
        search_filter = {"user_id": user_id}
        if ObjectId.is_valid(user_id):
            search_filter = {"$or": [{"user_id": user_id}, {"user_id": ObjectId(user_id)}]}
        
        recent_jobs = await db["search_jobs"].find(search_filter).sort("created_at", -1).limit(3).to_list(3)
        for job in recent_jobs:
            query = job.get("query") or job.get("keyword") or "Targeted Leads"
            location = job.get("location") or "your target area"
            leads_cnt = job.get("leads_count") or job.get("results_count") or 0
            status = job.get("status") or "COMPLETED"
            
            initial_notifications.append({
                "user_id": str(user_id),
                "type": "lead",
                "title": f"Lead Discovery: {leads_cnt} Leads Found" if leads_cnt > 0 else f"Search Job: {query}",
                "message": f"Search for '{query}' in {location} finished with status {status}.",
                "link": "/dashboard/leads",
                "read": False,
                "metadata": {"job_id": str(job.get("_id"))},
                "created_at": job.get("created_at") or datetime.utcnow()
            })

        # 2. Check for recent campaigns
        campaign_filter = {"user_id": user_id}
        if ObjectId.is_valid(user_id):
            campaign_filter = {"$or": [{"user_id": user_id}, {"user_id": ObjectId(user_id)}]}
        recent_campaigns = await db["campaigns"].find(campaign_filter).sort("created_at", -1).limit(2).to_list(2)
        for camp in recent_campaigns:
            camp_name = camp.get("name") or "Automated Campaign"
            camp_type = (camp.get("type") or "email").lower()
            notif_t = "whatsapp" if "wa" in camp_type or "whatsapp" in camp_type else "email"
            link = "/dashboard/whatsapp-ai" if notif_t == "whatsapp" else "/dashboard/email-ai"
            initial_notifications.append({
                "user_id": str(user_id),
                "type": notif_t,
                "title": f"Campaign: {camp_name}",
                "message": f"Campaign is currently {camp.get('status', 'ACTIVE')}.",
                "link": link,
                "read": False,
                "metadata": {"campaign_id": str(camp.get("_id"))},
                "created_at": camp.get("created_at") or datetime.utcnow()
            })

        # 3. Always ensure at least welcome & feature readiness notifications exist
        if len(initial_notifications) < 3:
            initial_notifications.append({
                "user_id": str(user_id),
                "type": "lead",
                "title": "Lead Discovery Engine Ready",
                "message": "Autonomous lead extraction is ready. Search Google Maps & business directories anytime.",
                "link": "/dashboard/search",
                "read": False,
                "metadata": {},
                "created_at": datetime.utcnow()
            })
            initial_notifications.append({
                "user_id": str(user_id),
                "type": "whatsapp",
                "title": "WhatsApp AI Agent Online",
                "message": "Desktop & API WhatsApp automation pipelines are active for outreach.",
                "link": "/dashboard/whatsapp-ai",
                "read": False,
                "metadata": {},
                "created_at": datetime.utcnow()
            })
            initial_notifications.append({
                "user_id": str(user_id),
                "type": "calling",
                "title": "Voice AI Calling Pipeline Ready",
                "message": "Sub-500ms voice pipeline configured and ready for outbound calling.",
                "link": "/dashboard/calling-ai",
                "read": False,
                "metadata": {},
                "created_at": datetime.utcnow()
            })

        if initial_notifications:
            await db["notifications"].insert_many(initial_notifications)

    except Exception as e:
        logger.error(f"Error seeding user notifications: {e}")
