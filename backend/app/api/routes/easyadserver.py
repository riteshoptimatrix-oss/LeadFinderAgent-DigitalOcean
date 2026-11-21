import logging
import re
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson.objectid import ObjectId

from app.db.database import get_db, db_instance
from app.models.user import UserInDB
from app.api.dependencies import get_current_user
from app.services.easyadserver_service import (
    send_single_lead_to_easyadserver,
    send_leads_batch,
    clean_api_token
)

logger = logging.getLogger(__name__)

router = APIRouter()


def get_raw_db() -> AsyncIOMotorDatabase:
    if db_instance.db is not None:
        return db_instance.db
    db = get_db()
    if hasattr(db, "_db"):
        return db._db
    return db


def build_user_ownership_filter(current_user: UserInDB) -> Dict[str, Any]:
    """Strictly isolates lead queries so a user can only access their own leads."""
    user_id_str = str(current_user.id)
    user_email = (current_user.email or "").strip().lower()

    conditions: List[Dict[str, Any]] = [
        {"user_id": user_id_str},
        {"assigned_to": user_id_str},
        {"assigned_user_email": {"$regex": f"^{re.escape(user_email)}$", "$options": "i"}}
    ]

    if ObjectId.is_valid(user_id_str):
        conditions.append({"user_id": ObjectId(user_id_str)})
        conditions.append({"created_by": user_id_str})
        conditions.append({"created_by": ObjectId(user_id_str)})

    return {"$or": conditions}


class EasyAdServerSendRequest(BaseModel):
    lead_id: Optional[str] = None
    lead_ids: Optional[List[str]] = None
    send_all: Optional[bool] = False
    skip_already_sent: Optional[bool] = True


@router.get("/status")
async def get_easyadserver_status(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> Any:
    """
    Check if EasyAdServer is enabled for current user and whether API token is configured.
    Never exposes raw API token to frontend.
    """
    raw_db = get_raw_db()
    user_query = {"_id": ObjectId(current_user.id)} if ObjectId.is_valid(current_user.id) else {"_id": current_user.id}
    user_doc = await raw_db["users"].find_one(user_query)

    is_enabled = bool(user_doc.get("easyadserver_access", False)) if user_doc else False
    has_token = bool(clean_api_token(user_doc.get("easyadserver_token", ""))) if user_doc else False

    # Count leads already dispatched by this user
    user_filter = build_user_ownership_filter(current_user)
    sent_count = await raw_db["leads"].count_documents({
        "$and": [
            user_filter,
            {"easyadserver_sent": True}
        ]
    })

    return {
        "enabled": is_enabled,
        "has_token": has_token,
        "user_email": current_user.email,
        "total_sent_leads": sent_count
    }


@router.post("/send")
async def send_leads_to_easyadserver(
    payload: EasyAdServerSendRequest,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> Any:
    """
    Send individual lead (Option A) or all leads (Option B) belonging to current user
    to EasyAdServer API using the Admin-configured token.
    """
    raw_db = get_raw_db()
    user_query = {"_id": ObjectId(current_user.id)} if ObjectId.is_valid(current_user.id) else {"_id": current_user.id}
    user_doc = await raw_db["users"].find_one(user_query)

    if not user_doc or not user_doc.get("easyadserver_access"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="EasyAdServer integration is not enabled for your account. Please contact an administrator."
        )

    raw_token = user_doc.get("easyadserver_token", "")
    token = clean_api_token(raw_token)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="EasyAdServer API Token has not been configured by the Admin for your account. Please contact your administrator."
        )

    ownership_filter = build_user_ownership_filter(current_user)
    query_clauses = [ownership_filter, {"visibility": {"$ne": "hidden"}}]

    # Option A: Single lead or specific lead IDs
    if payload.lead_id:
        lead_oid = ObjectId(payload.lead_id) if ObjectId.is_valid(payload.lead_id) else payload.lead_id
        query_clauses.append({"_id": lead_oid})
    elif payload.lead_ids:
        if not payload.lead_ids:
            raise HTTPException(status_code=400, detail="Provided lead_ids list is empty.")
        oids = [ObjectId(i) if ObjectId.is_valid(i) else i for i in payload.lead_ids]
        query_clauses.append({"_id": {"$in": oids}})
    elif payload.send_all:
        # Option B: Send all leads belonging to this user
        pass
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please specify lead_id (individual), lead_ids (selected), or send_all=True."
        )

    final_query = {"$and": query_clauses}
    leads_cursor = raw_db["leads"].find(final_query)
    leads = await leads_cursor.to_list(length=1000)

    if not leads:
        return {
            "success": True,
            "total_requested": 0,
            "successful_count": 0,
            "failed_count": 0,
            "skipped_count": 0,
            "results": [],
            "message": "No matching leads found to dispatch."
        }

    # Execute dispatch via service
    batch_result = await send_leads_batch(
        leads=leads,
        token=token,
        db=raw_db,
        user_id=str(current_user.id),
        user_email=current_user.email,
        skip_already_sent=bool(payload.skip_already_sent)
    )

    return batch_result


@router.get("/logs")
async def get_easyadserver_logs(
    limit: int = Query(50, ge=1, le=200),
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> Any:
    """
    Retrieve recent submission logs for the current user.
    """
    raw_db = get_raw_db()
    user_id_str = str(current_user.id)
    user_email = (current_user.email or "").strip().lower()

    filter_q: Dict[str, Any] = {
        "$or": [
            {"user_id": user_id_str},
            {"user_email": {"$regex": f"^{re.escape(user_email)}$", "$options": "i"}}
        ]
    }

    cursor = raw_db["easyadserver_logs"].find(filter_q).sort("timestamp", -1).limit(limit)
    logs = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        if isinstance(doc.get("timestamp"), datetime):
            doc["timestamp"] = doc["timestamp"].isoformat()
        logs.append(doc)

    return {
        "success": True,
        "logs": logs,
        "total": len(logs)
    }
