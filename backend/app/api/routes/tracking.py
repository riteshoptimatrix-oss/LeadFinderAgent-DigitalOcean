"""
Email Tracking & Engagement API Routes

Public tracking endpoints (triggered by email clients / recipients):
  GET /api/v1/tracking/open/{tracking_id}
  GET /api/v1/tracking/click/{tracking_id}?url=...

Authenticated dashboard endpoints (scoped to user):
  GET /api/v1/tracking/stats
  GET /api/v1/tracking/events
  POST /api/v1/tracking/check-replies
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr

from app.api.dependencies import require_email_automation_access, require_email_testing_access
from app.core.config import settings as app_settings
from app.core.logger import logger
from app.core.websocket import manager
from app.db.database import get_db
from app.models.user import UserInDB
from app.services.email_ai.tracking_utils import (
    TRANSPARENT_1X1_GIF,
    apply_email_tracking,
    build_message_id,
    generate_tracking_id,
    is_safe_redirect_url,
)
from app.services.ws_manager import ws_manager

router = APIRouter()

NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


def _user_match_filter(current_user: UserInDB) -> List[Dict[str, Any]]:
    uid = str(current_user.id)
    filters: List[Dict[str, Any]] = [{"user_id": uid}]
    if ObjectId.is_valid(uid):
        filters.append({"user_id": ObjectId(uid)})
    return filters


async def _broadcast_tracking_event(payload: Dict[str, Any], campaign_id: Optional[str] = None) -> None:
    """Broadcast tracking event to both job-scoped and global WebSocket rooms."""
    try:
        if campaign_id:
            await ws_manager.broadcast_to_job(campaign_id, payload)
        await ws_manager.broadcast(payload)
        await manager.broadcast(payload)
    except Exception as exc:
        logger.warning(f"[EmailTracking] WebSocket broadcast failed: {exc}")


# ==========================================
# Public Tracking Pixel & Click Redirect
# ==========================================

@router.get("/open/{tracking_id}")
async def track_email_open(tracking_id: str, db=Depends(get_db)):
    """Record an estimated email open event and return a 1x1 transparent GIF."""
    now = datetime.now(timezone.utc)
    try:
        doc = await db["email_tracking"].find_one({"tracking_id": tracking_id})
        if doc:
            update_set: Dict[str, Any] = {
                "opened": True,
                "last_opened_at": now,
                "updated_at": now,
            }
            if not doc.get("opened_at"):
                update_set["opened_at"] = now
            if doc.get("status") in (None, "SENT"):
                update_set["status"] = "OPENED"

            await db["email_tracking"].update_one(
                {"_id": doc["_id"]},
                {"$set": update_set, "$inc": {"open_count": 1}},
            )

            campaign_id = doc.get("campaign_id")
            lead_id = doc.get("lead_id")
            new_open_count = int(doc.get("open_count", 0)) + 1

            await _broadcast_tracking_event(
                {
                    "type": "email_opened",
                    "event_type": "email_opened",
                    "tracking_id": tracking_id,
                    "user_id": doc.get("user_id"),
                    "campaign_id": campaign_id,
                    "lead_id": lead_id,
                    "email": doc.get("recipient_email"),
                    "open_count": new_open_count,
                    "opened_at": (doc.get("opened_at") or now).isoformat()
                    if hasattr(doc.get("opened_at") or now, "isoformat")
                    else str(doc.get("opened_at") or now),
                    "timestamp": now.isoformat(),
                },
                campaign_id=campaign_id,
            )
    except Exception as exc:
        logger.error(f"[EmailTracking] Error recording open for {tracking_id}: {exc}")

    return Response(content=TRANSPARENT_1X1_GIF, media_type="image/gif", headers=NO_CACHE_HEADERS)


@router.get("/click/{tracking_id}")
async def track_email_click(
    tracking_id: str,
    url: str = Query(..., description="Destination URL to redirect to"),
    db=Depends(get_db),
):
    """Validate destination URL, record click interaction, and redirect."""
    if not is_safe_redirect_url(url):
        raise HTTPException(status_code=400, detail="Invalid or unsafe redirect URL")

    now = datetime.now(timezone.utc)
    try:
        doc = await db["email_tracking"].find_one({"tracking_id": tracking_id})
        if doc:
            update_set: Dict[str, Any] = {
                "clicked": True,
                "last_clicked_at": now,
                "updated_at": now,
            }
            if not doc.get("clicked_at"):
                update_set["clicked_at"] = now
            if doc.get("status") in (None, "SENT", "OPENED"):
                update_set["status"] = "CLICKED"

            await db["email_tracking"].update_one(
                {"_id": doc["_id"]},
                {
                    "$set": update_set,
                    "$inc": {"click_count": 1},
                    "$push": {
                        "clicked_urls": {
                            "$each": [{"url": url, "clicked_at": now.isoformat()}],
                            "$slice": -50,
                        }
                    },
                },
            )

            campaign_id = doc.get("campaign_id")
            lead_id = doc.get("lead_id")
            new_click_count = int(doc.get("click_count", 0)) + 1

            await _broadcast_tracking_event(
                {
                    "type": "email_clicked",
                    "event_type": "email_clicked",
                    "tracking_id": tracking_id,
                    "user_id": doc.get("user_id"),
                    "campaign_id": campaign_id,
                    "lead_id": lead_id,
                    "email": doc.get("recipient_email"),
                    "url": url,
                    "click_count": new_click_count,
                    "timestamp": now.isoformat(),
                },
                campaign_id=campaign_id,
            )
    except Exception as exc:
        logger.error(f"[EmailTracking] Error recording click for {tracking_id}: {exc}")

    return RedirectResponse(url=url, status_code=302)


# ==========================================
# Authenticated Tracking Dashboard Endpoints
# ==========================================

@router.get("/stats")
async def get_tracking_stats(
    campaign_id: Optional[str] = Query(None),
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db),
):
    """Return aggregated email tracking statistics scoped to the authenticated user."""
    query: Dict[str, Any] = {}
    if str(current_user.role).upper() not in ("ADMIN", "SUPERADMIN"):
        query["$or"] = _user_match_filter(current_user)
    if campaign_id:
        query["campaign_id"] = campaign_id

    total_sent = await db["email_tracking"].count_documents(query)
    total_opened = await db["email_tracking"].count_documents({**query, "opened": True})
    total_clicked = await db["email_tracking"].count_documents({**query, "clicked": True})
    total_replied = await db["email_tracking"].count_documents({**query, "replied": True})
    followups_paused = await db["email_tracking"].count_documents({**query, "followups_paused": True})

    open_rate = round((total_opened / total_sent) * 100, 1) if total_sent > 0 else 0.0
    click_rate = round((total_clicked / total_sent) * 100, 1) if total_sent > 0 else 0.0
    reply_rate = round((total_replied / total_sent) * 100, 1) if total_sent > 0 else 0.0

    return {
        "total_sent": total_sent,
        "total_opened": total_opened,
        "total_clicked": total_clicked,
        "total_replied": total_replied,
        "followups_paused": followups_paused,
        "open_rate": open_rate,
        "click_rate": click_rate,
        "reply_rate": reply_rate,
    }


@router.get("/events")
async def get_tracking_events(
    campaign_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db),
):
    """Return paginated email tracking records enriched with lead & campaign metadata."""
    query: Dict[str, Any] = {}
    if str(current_user.role).upper() not in ("ADMIN", "SUPERADMIN"):
        query["$or"] = _user_match_filter(current_user)
    if campaign_id:
        query["campaign_id"] = campaign_id
    if status and status.upper() != "ALL":
        s_upper = status.upper()
        if s_upper == "OPENED":
            query["opened"] = True
        elif s_upper == "CLICKED":
            query["clicked"] = True
        elif s_upper == "REPLIED":
            query["replied"] = True
        elif s_upper == "SENT":
            query["status"] = "SENT"
    if search:
        s_clean = search.strip()
        if s_clean:
            regex = {"$regex": s_clean, "$options": "i"}
            search_or = [
                {"recipient_email": regex},
                {"subject": regex},
                {"lead_name": regex},
                {"campaign_name": regex},
            ]
            if "$or" in query:
                query = {"$and": [{"$or": query.pop("$or")}, {"$or": search_or}], **query}
            else:
                query["$or"] = search_or

    total = await db["email_tracking"].count_documents(query)
    docs = (
        await db["email_tracking"]
        .find(query)
        .sort("sent_at", -1)
        .skip(skip)
        .limit(limit)
        .to_list(limit)
    )

    # Enrich missing lead_name / campaign_name in bulk
    lead_ids = [ObjectId(d["lead_id"]) for d in docs if ObjectId.is_valid(str(d.get("lead_id", "")))]
    camp_ids = [ObjectId(d["campaign_id"]) for d in docs if ObjectId.is_valid(str(d.get("campaign_id", "")))]

    lead_map: Dict[str, str] = {}
    if lead_ids:
        async for l_doc in db["leads"].find({"_id": {"$in": lead_ids}}, {"business_name": 1, "name": 1}):
            lead_map[str(l_doc["_id"])] = l_doc.get("business_name") or l_doc.get("name") or "Unknown Lead"

    camp_map: Dict[str, str] = {}
    if camp_ids:
        async for c_doc in db["email_ai_campaigns"].find({"_id": {"$in": camp_ids}}, {"info.name": 1}):
            camp_map[str(c_doc["_id"])] = (c_doc.get("info") or {}).get("name") or "Campaign"

    items: List[Dict[str, Any]] = []
    for d in docs:
        items.append({
            "_id": str(d["_id"]),
            "tracking_id": d.get("tracking_id"),
            "message_id": d.get("message_id"),
            "campaign_id": d.get("campaign_id"),
            "campaign_name": d.get("campaign_name") or camp_map.get(str(d.get("campaign_id")), "Campaign"),
            "lead_id": d.get("lead_id"),
            "lead_name": d.get("lead_name") or lead_map.get(str(d.get("lead_id")), "Unknown Lead"),
            "recipient_email": d.get("recipient_email"),
            "subject": d.get("subject"),
            "status": d.get("status", "SENT"),
            "sent_at": d["sent_at"].isoformat() if hasattr(d.get("sent_at"), "isoformat") else d.get("sent_at"),
            "opened": bool(d.get("opened", False)),
            "opened_at": d["opened_at"].isoformat() if hasattr(d.get("opened_at"), "isoformat") else d.get("opened_at"),
            "open_count": int(d.get("open_count", 0)),
            "clicked": bool(d.get("clicked", False)),
            "clicked_at": d["clicked_at"].isoformat() if hasattr(d.get("clicked_at"), "isoformat") else d.get("clicked_at"),
            "click_count": int(d.get("click_count", 0)),
            "clicked_urls": d.get("clicked_urls", []),
            "replied": bool(d.get("replied", False)),
            "replied_at": d["replied_at"].isoformat() if hasattr(d.get("replied_at"), "isoformat") else d.get("replied_at"),
            "reply_subject": d.get("reply_subject"),
            "reply_snippet": d.get("reply_snippet"),
            "reply_from": d.get("reply_from"),
            "followups_paused": bool(d.get("followups_paused", False)),
        })

    return {"data": items, "total": total, "skip": skip, "limit": limit}


@router.post("/check-replies")
async def trigger_reply_check(
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db),
):
    """Manually trigger an immediate IMAP reply check for the authenticated user."""
    from app.services.email_ai.reply_worker import EmailReplyWorker

    worker = EmailReplyWorker(db)
    summary = await worker.check_user_replies(str(current_user.id))
    return summary


# ==========================================
# Exclusive Email Testing Endpoints (khushi.optimatrix@gmail.com only)
# ==========================================

class EmailTestSendRequest(BaseModel):
    to_email: EmailStr


def _compute_verification_status(doc: Dict[str, Any]) -> str:
    if doc.get("opened") or doc.get("clicked") or doc.get("replied"):
        return "Success"
    if str(doc.get("status") or "").upper() == "FAILED":
        return "Failed"
    return "Pending"


def _serialize_test_record(d: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "_id": str(d["_id"]),
        "tracking_id": d.get("tracking_id"),
        "message_id": d.get("message_id"),
        "to_email": d.get("recipient_email"),
        "subject": d.get("subject"),
        "status": d.get("status", "SENT"),
        "verification_status": _compute_verification_status(d),
        "error": d.get("error_message"),
        "sent_at": d["sent_at"].isoformat() if hasattr(d.get("sent_at"), "isoformat") else d.get("sent_at"),
        "opened": bool(d.get("opened", False)),
        "opened_at": d["opened_at"].isoformat() if hasattr(d.get("opened_at"), "isoformat") else d.get("opened_at"),
        "open_count": int(d.get("open_count", 0)),
        "clicked": bool(d.get("clicked", False)),
        "clicked_at": d["clicked_at"].isoformat() if hasattr(d.get("clicked_at"), "isoformat") else d.get("clicked_at"),
        "click_count": int(d.get("click_count", 0)),
        "replied": bool(d.get("replied", False)),
        "replied_at": d["replied_at"].isoformat() if hasattr(d.get("replied_at"), "isoformat") else d.get("replied_at"),
        "reply_subject": d.get("reply_subject"),
        "reply_snippet": d.get("reply_snippet"),
    }


@router.post("/test-email")
async def send_tracking_test_email(
    payload: EmailTestSendRequest,
    request: Request,
    current_user: UserInDB = Depends(require_email_testing_access),
    db=Depends(get_db),
):
    """Send a tracked test email using the user's configured SMTP profile to verify tracking."""
    from app.services.email_ai.smtp_worker import EmailAIQueueWorker
    from app.services.smtp_service import get_user_smtp_config

    uid_str = str(current_user.id)
    to_email = str(payload.to_email).strip().lower()

    # Resolve SMTP profile (reuse existing Email AI + Settings fallback logic)
    smtp_profile = await db["email_ai_smtp"].find_one(
        {"user_id": uid_str, "is_active": True},
        sort=[("is_default", -1), ("updated_at", -1)],
    )
    if not smtp_profile or not smtp_profile.get("password"):
        cfg = await get_user_smtp_config(db, uid_str, decrypt_pwd=False)
        raw_settings = await db["settings"].find_one({"user_id": uid_str})
        enc_pwd = raw_settings.get("smtp_pass") if raw_settings else ""
        if cfg and cfg.get("has_password") and enc_pwd:
            smtp_profile = {
                "host": cfg.get("smtp_host", "smtp.gmail.com"),
                "port": cfg.get("smtp_port", 587),
                "username": cfg.get("smtp_user"),
                "password": enc_pwd,
                "encryption": cfg.get("smtp_encryption", "TLS"),
                "from_email": cfg.get("smtp_from_email") or cfg.get("smtp_user"),
                "from_name": cfg.get("smtp_sender_name", ""),
                "timeout": 15,
            }

    if not smtp_profile or not smtp_profile.get("password"):
        raise HTTPException(
            status_code=400,
            detail="No active SMTP configuration found. Please save your SMTP credentials in Settings > Email Automation.",
        )

    fwd_proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
    fwd_host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
    req_base_url = f"{fwd_proto}://{fwd_host}" if fwd_host else str(request.base_url).rstrip("/")

    tracking_id = generate_tracking_id(uid_str, "email_testing", to_email, uuid.uuid4().hex)
    message_id = build_message_id(tracking_id)
    now = datetime.now(timezone.utc)
    verify_url = req_base_url if ("localhost" not in req_base_url and "127.0.0.1" not in req_base_url) else (app_settings.FRONTEND_BASE_URL or "http://localhost:3000").strip().rstrip("/")
    subject = "Email Tracking Verification Test"
    raw_html = (
        "<html><body style='font-family:Arial,sans-serif;color:#1e293b;line-height:1.6;'>"
        "<h2 style='margin-bottom:8px;'>Email Tracking Verification</h2>"
        "<p>This is an automated test email sent from LeadFinderAgent to verify open, link-click, and reply tracking.</p>"
        f"<p><a href='{verify_url}' style='display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;"
        "text-decoration:none;border-radius:8px;font-weight:bold;'>Verify Link Click Tracking</a></p>"
        "<p style='font-size:12px;color:#64748b;'>You can also reply to this email to verify IMAP reply detection.</p>"
        "</body></html>"
    )
    text_body = (
        "Email Tracking Verification\n\n"
        "This is a test email from LeadFinderAgent to verify open, click, and reply tracking.\n"
        f"Verify link: {verify_url}\n"
    )
    tracked_html = apply_email_tracking(
        raw_html,
        tracking_id,
        open_tracking=True,
        click_tracking=True,
        base_url=req_base_url,
    )

    worker = EmailAIQueueWorker(db)
    loop = asyncio.get_running_loop()
    send_error: Optional[str] = None
    try:
        await loop.run_in_executor(
            None,
            worker._send_email_sync,
            smtp_profile,
            to_email,
            subject,
            tracked_html,
            text_body,
            message_id,
        )
    except Exception as exc:
        send_error = str(exc) or "SMTP send failed"
        logger.error(f"[EmailTesting] Test email send failed for {to_email}: {send_error}")

    doc = {
        "tracking_id": tracking_id,
        "message_id": message_id,
        "user_id": uid_str,
        "campaign_id": "email_testing",
        "campaign_name": "Email Testing",
        "lead_id": "test",
        "lead_name": to_email,
        "recipient_email": to_email,
        "subject": subject,
        "status": "FAILED" if send_error else "SENT",
        "error_message": send_error,
        "is_test": True,
        "sent_at": now,
        "opened": False,
        "opened_at": None,
        "open_count": 0,
        "clicked": False,
        "clicked_at": None,
        "click_count": 0,
        "clicked_urls": [],
        "replied": False,
        "replied_at": None,
        "reply_subject": None,
        "reply_snippet": None,
        "reply_from": None,
        "followups_paused": False,
        "created_at": now,
        "updated_at": now,
    }
    res = await db["email_tracking"].insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialize_test_record(doc)


@router.get("/test-email/history")
async def get_test_email_history(
    limit: int = Query(10, ge=1, le=50),
    current_user: UserInDB = Depends(require_email_testing_access),
    db=Depends(get_db),
):
    """Fetch recent Email Testing verification records for khushi.optimatrix@gmail.com."""
    docs = (
        await db["email_tracking"]
        .find({"$or": _user_match_filter(current_user), "is_test": True})
        .sort("sent_at", -1)
        .limit(limit)
        .to_list(limit)
    )
    return {"data": [_serialize_test_record(d) for d in docs]}


@router.get("/test-email/{tracking_id}")
async def get_test_email_status(
    tracking_id: str,
    current_user: UserInDB = Depends(require_email_testing_access),
    db=Depends(get_db),
):
    """Fetch verification status (Pending / Success / Failed) for a specific test email."""
    doc = await db["email_tracking"].find_one({
        "tracking_id": tracking_id,
        "$or": _user_match_filter(current_user),
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Test tracking record not found")
    return _serialize_test_record(doc)
