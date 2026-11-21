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
    clean_api_token,
    dispatch_user_leads_to_easyadserver
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


# ─────────────────────────────────────────────────────────────────────────────
# Scheduling & Automated Dispatch with Hidden Pre-EAS Bulk Analysis
# ─────────────────────────────────────────────────────────────────────────────

def calculate_bulk_analysis_time(time_str: str) -> str:
    """Calculates exactly 2 hours prior to time_str (HH:MM)."""
    parts = time_str.strip().split(":")
    h = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 else 0
    bulk_h = (h - 2) % 24
    return f"{bulk_h:02d}:{m:02d}"


async def execute_scheduled_eas_send(user_id: str, user_email: str):
    """Execution function triggered by scheduler at the user's scheduled time."""
    logger.info(f"[EAS_SCHEDULER] Running scheduled EAS auto-send for {user_email} (ID: {user_id})")
    raw_db = get_raw_db()
    if raw_db is None:
        logger.error("[EAS_SCHEDULER] Database unavailable for scheduled EAS send.")
        return

    res = await dispatch_user_leads_to_easyadserver(
        db=raw_db,
        user_id=user_id,
        user_email=user_email,
        skip_already_sent=True
    )
    now = datetime.now(timezone.utc)
    await raw_db["eas_schedules"].update_one(
        {"user_id": user_id},
        {"$set": {
            "last_eas_run_at": now,
            "last_result": res.get("message") or ("Success" if res.get("success") else "Failed"),
            "updated_at": now
        }}
    )
    logger.info(f"[EAS_SCHEDULER] Completed EAS auto-send for {user_email}: {res.get('message')}")


async def execute_scheduled_bulk_analysis(user_id: str, user_email: str):
    """
    Hidden pre-EAS bulk analysis triggered silently exactly 2 hours before EAS send.
    Checks whether Bulk Analysis is already done for the leads that are going to be sent.
    - If already done: does NOT run Bulk Analysis again. Skips it completely.
    - If not done (or only partly done): runs Bulk Analysis ONLY for the leads that are still pending.
    - Reuses the existing classify_leads check (reanalyze=False) from bulk_ai_analysis_service.
    - Operates completely silently in the backend with nothing shown in the frontend.
    """
    logger.info(f"[EAS_SCHEDULER] Checking pre-EAS bulk analysis eligibility for {user_email} (ID: {user_id})")
    raw_db = get_raw_db()
    if raw_db is None:
        logger.error("[EAS_SCHEDULER] Database unavailable for pre-EAS bulk analysis.")
        return

    # Find all leads for this user that are going to be dispatched to EasyAdServer (excluding already sent & hidden)
    conditions: List[Dict[str, Any]] = [
        {"user_id": user_id},
        {"assigned_to": user_id},
        {"assigned_user_email": {"$regex": f"^{re.escape(user_email)}$", "$options": "i"}}
    ]
    if ObjectId.is_valid(user_id):
        conditions.append({"user_id": ObjectId(user_id)})
        conditions.append({"created_by": user_id})
        conditions.append({"created_by": ObjectId(user_id)})

    query = {
        "$and": [
            {"$or": conditions},
            {"visibility": {"$ne": "hidden"}},
            {"easyadserver_sent": {"$ne": True}}
        ]
    }

    leads_to_send = await raw_db["leads"].find(query).to_list(length=3000)
    if not leads_to_send:
        logger.info(f"[EAS_SCHEDULER] No pending leads to dispatch for {user_email}. Skipping pre-EAS bulk analysis.")
        return

    lead_ids = [str(l["_id"]) for l in leads_to_send]

    from app.services.bulk_ai_analysis_service import create_bulk_queue
    try:
        # reanalyze=False ensures that any lead with already completed analysis is automatically skipped!
        # If all leads are already analyzed, create_bulk_queue returns queue=None, skipping execution.
        queue, report = await create_bulk_queue(
            db=raw_db,
            user_id=user_id,
            name="Scheduled Pre-EAS Bulk Analysis",
            lead_ids=lead_ids,
            filters=None,
            concurrency=3,
            reanalyze=False
        )
        now = datetime.now(timezone.utc)
        await raw_db["eas_schedules"].update_one(
            {"user_id": user_id},
            {"$set": {"last_bulk_run_at": now, "updated_at": now}}
        )
        if queue:
            eligible_count = len(report.get("websites", []))
            logger.info(f"[EAS_SCHEDULER] Pre-EAS bulk analysis started for {eligible_count} pending website(s) (Queue ID: {queue.id}). Already analyzed leads were skipped.")
        else:
            logger.info(f"[EAS_SCHEDULER] Pre-EAS bulk analysis skipped: All {len(lead_ids)} candidate lead(s) are already analyzed or have no eligible website.")
    except Exception as e:
        logger.error(f"[EAS_SCHEDULER] Silent bulk analysis error for {user_email}: {e}", exc_info=True)


def schedule_eas_jobs(scheduler, user_id: str, user_email: str, schedule_time: str):
    """Registers the Auto Send and 2-hour-prior Bulk Analysis jobs in APScheduler."""
    if not scheduler:
        logger.warning("[EAS_SCHEDULER] Scheduler is not available.")
        return

    import zoneinfo
    try:
        kolkata_tz = zoneinfo.ZoneInfo("Asia/Kolkata")
    except Exception:
        kolkata_tz = "Asia/Kolkata"

    parts = schedule_time.strip().split(":")
    send_h = int(parts[0])
    send_m = int(parts[1]) if len(parts) > 1 else 0
    bulk_h = (send_h - 2) % 24
    bulk_m = send_m

    eas_job_id = f"eas_autosend_{user_id}"
    bulk_job_id = f"eas_bulk_analysis_{user_id}"

    # Auto Send Job
    scheduler.add_job(
        execute_scheduled_eas_send,
        'cron',
        hour=send_h,
        minute=send_m,
        timezone=kolkata_tz,
        id=eas_job_id,
        replace_existing=True,
        args=[user_id, user_email],
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600
    )

    # Silent Bulk Analysis Job (2 hours prior)
    scheduler.add_job(
        execute_scheduled_bulk_analysis,
        'cron',
        hour=bulk_h,
        minute=bulk_m,
        timezone=kolkata_tz,
        id=bulk_job_id,
        replace_existing=True,
        args=[user_id, user_email],
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600
    )
    logger.info(f"[EAS_SCHEDULER] Successfully scheduled EAS dispatch at {send_h:02d}:{send_m:02d} IST and silent Bulk Analysis at {bulk_h:02d}:{bulk_m:02d} IST for user {user_email}")


def remove_eas_jobs(scheduler, user_id: str):
    """Removes both scheduled jobs from APScheduler."""
    if not scheduler:
        return
    for jid in [f"eas_autosend_{user_id}", f"eas_bulk_analysis_{user_id}"]:
        try:
            scheduler.remove_job(jid)
            logger.info(f"[EAS_SCHEDULER] Removed job {jid}")
        except Exception:
            pass


class EasyAdServerScheduleRequest(BaseModel):
    schedule_time: str = Field(..., description="Time of day in HH:MM format (24-hour, IST)")
    is_active: bool = Field(True, description="Whether the auto-send schedule is enabled")


@router.get("/schedule")
async def get_easyadserver_schedule(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> Any:
    """Retrieve the current user's Auto Send to EAS schedule."""
    raw_db = get_raw_db()
    user_id_str = str(current_user.id)
    doc = await raw_db["eas_schedules"].find_one({"user_id": user_id_str})

    if not doc:
        return {
            "has_schedule": False,
            "is_active": False,
            "schedule_time": None,
            "bulk_analysis_time": None,
            "timezone": "Asia/Kolkata",
            "next_run_at": None,
            "last_eas_run_at": None
        }

    # Format dates
    last_eas = doc.get("last_eas_run_at")
    if isinstance(last_eas, datetime):
        last_eas = last_eas.isoformat()

    return {
        "has_schedule": True,
        "is_active": bool(doc.get("is_active", True)),
        "schedule_time": doc.get("schedule_time"),
        "bulk_analysis_time": doc.get("bulk_analysis_time"),
        "timezone": "Asia/Kolkata",
        "last_eas_run_at": last_eas,
        "last_result": doc.get("last_result")
    }


@router.post("/schedule")
async def save_easyadserver_schedule(
    payload: EasyAdServerScheduleRequest,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> Any:
    """
    Save or update the user's Auto Send to EAS schedule.
    Automatically calculates silent Bulk Analysis at exactly 2 hours prior and registers both jobs in APScheduler.
    """
    raw_db = get_raw_db()
    user_id_str = str(current_user.id)
    user_email = (current_user.email or "").strip().lower()

    # Validate HH:MM
    match = re.match(r"^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$", payload.schedule_time.strip())
    if not match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid schedule_time format. Please use HH:MM in 24-hour format."
        )

    formatted_time = f"{int(match.group(1)):02d}:{int(match.group(2)):02d}"
    bulk_time = calculate_bulk_analysis_time(formatted_time)

    now = datetime.now(timezone.utc)
    schedule_doc = {
        "user_id": user_id_str,
        "user_email": user_email,
        "schedule_time": formatted_time,
        "bulk_analysis_time": bulk_time,
        "is_active": payload.is_active,
        "timezone": "Asia/Kolkata",
        "updated_at": now
    }

    await raw_db["eas_schedules"].update_one(
        {"user_id": user_id_str},
        {"$set": schedule_doc, "$setOnInsert": {"created_at": now}},
        upsert=True
    )

    # Update live APScheduler
    from app.main import scheduler
    if payload.is_active:
        schedule_eas_jobs(scheduler, user_id=user_id_str, user_email=user_email, schedule_time=formatted_time)
    else:
        remove_eas_jobs(scheduler, user_id=user_id_str)

    return {
        "success": True,
        "message": f"Auto Send scheduled successfully for {formatted_time} IST.",
        "schedule_time": formatted_time,
        "is_active": payload.is_active
    }


@router.delete("/schedule")
async def delete_easyadserver_schedule(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
) -> Any:
    """Disable/remove the user's Auto Send to EAS schedule."""
    raw_db = get_raw_db()
    user_id_str = str(current_user.id)

    await raw_db["eas_schedules"].delete_one({"user_id": user_id_str})

    from app.main import scheduler
    remove_eas_jobs(scheduler, user_id=user_id_str)

    return {
        "success": True,
        "message": "Auto Send schedule removed successfully."
    }

