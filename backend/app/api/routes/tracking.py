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

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import RedirectResponse

from app.api.dependencies import require_email_automation_access
from app.core.logger import logger
from app.core.websocket import manager
from app.db.database import get_db
from app.models.user import UserInDB
from app.services.email_ai.tracking_utils import (
    TRANSPARENT_1X1_GIF,
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
