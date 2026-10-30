import logging
from typing import Any, List, Optional, Dict
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from bson import ObjectId

from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import UserInDB
from app.models.notification import NotificationCreate
from app.services.notification_service import ensure_user_notifications

logger = logging.getLogger(__name__)

router = APIRouter()

def sanitize_notification(doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(doc.get("_id", "")),
        "user_id": str(doc.get("user_id", "")),
        "type": doc.get("type", "system"),
        "title": doc.get("title", ""),
        "message": doc.get("message", ""),
        "link": doc.get("link", "/dashboard"),
        "read": bool(doc.get("read", False)),
        "metadata": doc.get("metadata", {}),
        "created_at": doc.get("created_at").isoformat() if isinstance(doc.get("created_at"), datetime) else str(doc.get("created_at", ""))
    }

@router.get("")
async def get_notifications(
    limit: int = Query(30, ge=1, le=100),
    unread_only: bool = Query(False),
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
) -> Any:
    """Retrieve notifications for the current authenticated user."""
    user_id_str = str(current_user.id)
    
    # Auto-seed if the user has no notifications yet
    await ensure_user_notifications(db, user_id_str)

    query: Dict[str, Any] = {
        "$or": [
            {"user_id": user_id_str},
            {"user_id": ObjectId(user_id_str)} if ObjectId.is_valid(user_id_str) else {"user_id": user_id_str}
        ]
    }
    
    if unread_only:
        query["read"] = False

    cursor = db["notifications"].find(query).sort("created_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)

    unread_query = {
        "$or": [
            {"user_id": user_id_str},
            {"user_id": ObjectId(user_id_str)} if ObjectId.is_valid(user_id_str) else {"user_id": user_id_str}
        ],
        "read": False
    }
    unread_count = await db["notifications"].count_documents(unread_query)
    total_count = await db["notifications"].count_documents({
        "$or": [
            {"user_id": user_id_str},
            {"user_id": ObjectId(user_id_str)} if ObjectId.is_valid(user_id_str) else {"user_id": user_id_str}
        ]
    })

    return {
        "notifications": [sanitize_notification(d) for d in docs],
        "unread_count": unread_count,
        "total": total_count
    }

@router.post("")
async def create_user_notification(
    payload: NotificationCreate,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
) -> Any:
    """Create a new notification for the current user."""
    user_id_str = str(current_user.id)
    new_doc = {
        "user_id": user_id_str,
        "type": payload.type,
        "title": payload.title,
        "message": payload.message,
        "link": payload.link or "/dashboard",
        "read": payload.read,
        "metadata": payload.metadata or {},
        "created_at": payload.created_at or datetime.utcnow()
    }
    result = await db["notifications"].insert_one(new_doc)
    new_doc["_id"] = result.inserted_id
    return sanitize_notification(new_doc)

@router.patch("/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
) -> Any:
    """Mark an individual notification as read."""
    user_id_str = str(current_user.id)
    notif_id_obj = ObjectId(notification_id) if ObjectId.is_valid(notification_id) else notification_id

    result = await db["notifications"].update_one(
        {
            "_id": notif_id_obj,
            "$or": [
                {"user_id": user_id_str},
                {"user_id": ObjectId(user_id_str)} if ObjectId.is_valid(user_id_str) else {"user_id": user_id_str}
            ]
        },
        {"$set": {"read": True}}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    return {"success": True, "notification_id": notification_id, "read": True}

@router.post("/mark-all-read")
async def mark_all_notifications_as_read(
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
) -> Any:
    """Mark all notifications of the current user as read."""
    user_id_str = str(current_user.id)
    result = await db["notifications"].update_many(
        {
            "$or": [
                {"user_id": user_id_str},
                {"user_id": ObjectId(user_id_str)} if ObjectId.is_valid(user_id_str) else {"user_id": user_id_str}
            ],
            "read": False
        },
        {"$set": {"read": True}}
    )
    return {"success": True, "modified_count": result.modified_count}

@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
) -> Any:
    """Delete a single notification."""
    user_id_str = str(current_user.id)
    notif_id_obj = ObjectId(notification_id) if ObjectId.is_valid(notification_id) else notification_id

    result = await db["notifications"].delete_one({
        "_id": notif_id_obj,
        "$or": [
            {"user_id": user_id_str},
            {"user_id": ObjectId(user_id_str)} if ObjectId.is_valid(user_id_str) else {"user_id": user_id_str}
        ]
    })

    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    return {"success": True, "deleted_id": notification_id}

@router.delete("")
async def clear_all_notifications(
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
) -> Any:
    """Clear all notifications for the current user."""
    user_id_str = str(current_user.id)
    result = await db["notifications"].delete_many({
        "$or": [
            {"user_id": user_id_str},
            {"user_id": ObjectId(user_id_str)} if ObjectId.is_valid(user_id_str) else {"user_id": user_id_str}
        ]
    })
    return {"success": True, "deleted_count": result.deleted_count}
