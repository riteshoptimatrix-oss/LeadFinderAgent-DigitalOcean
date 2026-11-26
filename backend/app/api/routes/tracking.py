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
from datetime import date, datetime, timedelta, timezone
import html as html_lib
from typing import Any, Dict, List, Optional
import uuid

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
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
    get_client_ip_from_request,
    is_safe_redirect_url,
)
from app.services.ws_manager import ws_manager

router = APIRouter()

NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


def _to_utc_iso(val: Any) -> Optional[str]:
    """Serialize a datetime (naive or aware) as an explicit UTC ISO-8601 string ending with 'Z'."""
    if val is None:
        return None
    if isinstance(val, datetime):
        dt = val if val.tzinfo is not None else val.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(val)


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
async def track_email_open(tracking_id: str, request: Request, db=Depends(get_db)):
    """Record an estimated email open event (with IP, User-Agent & event history) and return a 1x1 transparent GIF."""
    now = datetime.now(timezone.utc)
    ip = get_client_ip_from_request(request)
    ua = (request.headers.get("user-agent") or "")[:512]
    try:
        doc = await db["email_tracking"].find_one({"tracking_id": tracking_id})
        if doc:
            update_set: Dict[str, Any] = {
                "opened": True,
                "last_opened_at": now,
                "last_ip": ip or doc.get("last_ip"),
                "last_user_agent": ua or doc.get("last_user_agent"),
                "updated_at": now,
            }
            if not doc.get("opened_at"):
                update_set["opened_at"] = now
            if doc.get("status") in (None, "SENT"):
                update_set["status"] = "OPENED"

            await db["email_tracking"].update_one(
                {"_id": doc["_id"]},
                {
                    "$set": update_set,
                    "$inc": {"open_count": 1},
                    "$push": {
                        "event_history": {
                            "$each": [{
                                "type": "open",
                                "timestamp": now.isoformat(),
                                "ip": ip,
                                "user_agent": ua,
                            }],
                            "$slice": -100,
                        }
                    },
                },
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
                    "ip": ip,
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
    request: Request,
    url: str = Query(..., description="Destination URL to redirect to"),
    db=Depends(get_db),
):
    """Validate destination URL, record click interaction with IP/UA, and redirect."""
    if not is_safe_redirect_url(url):
        raise HTTPException(status_code=400, detail="Invalid or unsafe redirect URL")

    now = datetime.now(timezone.utc)
    ip = get_client_ip_from_request(request)
    ua = (request.headers.get("user-agent") or "")[:512]
    try:
        doc = await db["email_tracking"].find_one({"tracking_id": tracking_id})
        if doc:
            update_set: Dict[str, Any] = {
                "clicked": True,
                "last_clicked_at": now,
                "last_ip": ip or doc.get("last_ip"),
                "last_user_agent": ua or doc.get("last_user_agent"),
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
                            "$each": [{"url": url, "clicked_at": now.isoformat(), "ip": ip, "user_agent": ua}],
                            "$slice": -50,
                        },
                        "event_history": {
                            "$each": [{
                                "type": "click",
                                "timestamp": now.isoformat(),
                                "url": url,
                                "ip": ip,
                                "user_agent": ua,
                            }],
                            "$slice": -100,
                        },
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
                    "ip": ip,
                    "click_count": new_click_count,
                    "timestamp": now.isoformat(),
                },
                campaign_id=campaign_id,
            )
    except Exception as exc:
        logger.error(f"[EmailTracking] Error recording click for {tracking_id}: {exc}")

    return RedirectResponse(url=url, status_code=302)


def _render_unsubscribe_html(title: str, heading: str, message: str, show_button: bool = False, action_url: str = "") -> str:
    button_html = ""
    if show_button and action_url:
        safe_action = html_lib.escape(action_url, quote=True)
        button_html = (
            f'<form method="POST" action="{safe_action}" style="margin-top:20px;">'
            '<button type="submit" style="background:#0f172a;color:#fff;border:none;padding:12px 24px;'
            'border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;">Confirm Unsubscribe</button>'
            "</form>"
        )
    return (
        "<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1.0'>"
        f"<title>{html_lib.escape(title)}</title></head>"
        "<body style='margin:0;padding:40px 16px;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;color:#0f172a;'>"
        "<div style='max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;text-align:center;'>"
        f"<h1 style='margin:0 0 12px;font-size:20px;'>{html_lib.escape(heading)}</h1>"
        f"<p style='margin:0;font-size:14px;line-height:1.6;color:#475569;'>{message}</p>"
        f"{button_html}"
        "</div></body></html>"
    )


@router.get("/unsubscribe/{tracking_id}", response_class=HTMLResponse)
async def unsubscribe_page(tracking_id: str, request: Request, db=Depends(get_db)):
    """Render public unsubscribe confirmation page for a tracked email."""
    doc = await db["email_tracking"].find_one({"tracking_id": tracking_id})
    if not doc:
        return HTMLResponse(
            _render_unsubscribe_html("Invalid Link", "Invalid Unsubscribe Link", "This unsubscribe link is invalid or has expired."),
            status_code=404,
        )
    email_safe = html_lib.escape(str(doc.get("recipient_email") or ""))
    if doc.get("unsubscribed"):
        return HTMLResponse(
            _render_unsubscribe_html("Already Unsubscribed", "Already Unsubscribed", f"<strong>{email_safe}</strong> is already unsubscribed from future emails.")
        )
    return HTMLResponse(
        _render_unsubscribe_html(
            "Unsubscribe",
            "Unsubscribe from Emails",
            f"Click below to unsubscribe <strong>{email_safe}</strong> from future campaign emails.",
            show_button=True,
            action_url=str(request.url),
        )
    )


@router.post("/unsubscribe/{tracking_id}", response_class=HTMLResponse)
async def unsubscribe_confirm(tracking_id: str, request: Request, db=Depends(get_db)):
    """Process unsubscribe confirmation or RFC 8058 One-Click unsubscribe."""
    now = datetime.now(timezone.utc)
    ip = get_client_ip_from_request(request)
    ua = (request.headers.get("user-agent") or "")[:512]

    doc = await db["email_tracking"].find_one({"tracking_id": tracking_id})
    if not doc:
        return HTMLResponse(
            _render_unsubscribe_html("Invalid Link", "Invalid Unsubscribe Link", "This unsubscribe link is invalid or has expired."),
            status_code=404,
        )

    email_addr = str(doc.get("recipient_email") or "").lower()
    if not doc.get("unsubscribed"):
        await db["email_tracking"].update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "unsubscribed": True,
                    "unsubscribed_at": now,
                    "status": "UNSUBSCRIBED",
                    "followups_paused": True,
                    "last_ip": ip or doc.get("last_ip"),
                    "last_user_agent": ua or doc.get("last_user_agent"),
                    "updated_at": now,
                },
                "$push": {
                    "event_history": {
                        "$each": [{
                            "type": "unsubscribe",
                            "timestamp": now.isoformat(),
                            "ip": ip,
                            "user_agent": ua,
                        }],
                        "$slice": -100,
                    }
                },
            },
        )
        await _broadcast_tracking_event(
            {
                "type": "email_unsubscribed",
                "event_type": "email_unsubscribed",
                "tracking_id": tracking_id,
                "user_id": doc.get("user_id"),
                "campaign_id": doc.get("campaign_id"),
                "lead_id": doc.get("lead_id"),
                "email": email_addr,
                "timestamp": now.isoformat(),
            },
            campaign_id=doc.get("campaign_id"),
        )

    email_safe = html_lib.escape(email_addr)
    return HTMLResponse(
        _render_unsubscribe_html(
            "Unsubscribed",
            "Unsubscribed Successfully",
            f"<strong>{email_safe}</strong> has been unsubscribed and will no longer receive campaign emails.",
        )
    )


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

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_sent = await db["email_tracking"].count_documents(query)
    total_opened = await db["email_tracking"].count_documents({**query, "opened": True})
    total_clicked = await db["email_tracking"].count_documents({**query, "clicked": True})
    total_replied = await db["email_tracking"].count_documents({**query, "replied": True})
    total_bounced = await db["email_tracking"].count_documents({**query, "bounced": True})
    total_unsubscribed = await db["email_tracking"].count_documents({**query, "unsubscribed": True})
    followups_paused = await db["email_tracking"].count_documents({**query, "followups_paused": True})

    sent_today = await db["email_tracking"].count_documents({**query, "sent_at": {"$gte": today_start}})
    opened_today = await db["email_tracking"].count_documents({**query, "opened": True, "opened_at": {"$gte": today_start}})
    clicked_today = await db["email_tracking"].count_documents({**query, "clicked": True, "clicked_at": {"$gte": today_start}})

    open_rate = round((total_opened / total_sent) * 100, 1) if total_sent > 0 else 0.0
    click_rate = round((total_clicked / total_sent) * 100, 1) if total_sent > 0 else 0.0
    reply_rate = round((total_replied / total_sent) * 100, 1) if total_sent > 0 else 0.0
    bounce_rate = round((total_bounced / total_sent) * 100, 1) if total_sent > 0 else 0.0
    unsubscribe_rate = round((total_unsubscribed / total_sent) * 100, 1) if total_sent > 0 else 0.0

    return {
        "total_sent": total_sent,
        "total_opened": total_opened,
        "total_clicked": total_clicked,
        "total_replied": total_replied,
        "total_bounced": total_bounced,
        "total_unsubscribed": total_unsubscribed,
        "followups_paused": followups_paused,
        "sent_today": sent_today,
        "opened_today": opened_today,
        "clicked_today": clicked_today,
        "open_rate": open_rate,
        "click_rate": click_rate,
        "reply_rate": reply_rate,
        "bounce_rate": bounce_rate,
        "unsubscribe_rate": unsubscribe_rate,
    }


@router.get("/events")
async def get_tracking_events(
    campaign_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db),
):
    """Return paginated email tracking records enriched with lead, campaign, and event history."""
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
        elif s_upper == "BOUNCED":
            query["bounced"] = True
        elif s_upper == "UNSUBSCRIBED":
            query["unsubscribed"] = True
        elif s_upper == "SENT":
            query["status"] = "SENT"

    if date_from or date_to:
        date_filter: Dict[str, Any] = {}
        if date_from:
            try:
                dt_from = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
                date_filter["$gte"] = dt_from
            except ValueError:
                pass
        if date_to:
            try:
                dt_to = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc) + timedelta(days=1)
                date_filter["$lt"] = dt_to
            except ValueError:
                pass
        if date_filter:
            query["sent_at"] = date_filter

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
            "sent_at": _to_utc_iso(d.get("sent_at")),
            "opened": bool(d.get("opened", False)),
            "opened_at": _to_utc_iso(d.get("opened_at")),
            "last_opened_at": _to_utc_iso(d.get("last_opened_at")),
            "open_count": int(d.get("open_count", 0)),
            "clicked": bool(d.get("clicked", False)),
            "clicked_at": _to_utc_iso(d.get("clicked_at")),
            "last_clicked_at": _to_utc_iso(d.get("last_clicked_at")),
            "click_count": int(d.get("click_count", 0)),
            "clicked_urls": d.get("clicked_urls", []),
            "replied": bool(d.get("replied", False)),
            "replied_at": _to_utc_iso(d.get("replied_at")),
            "reply_subject": d.get("reply_subject"),
            "reply_snippet": d.get("reply_snippet"),
            "reply_from": d.get("reply_from"),
            "bounced": bool(d.get("bounced", False)),
            "bounced_at": _to_utc_iso(d.get("bounced_at")),
            "unsubscribed": bool(d.get("unsubscribed", False)),
            "unsubscribed_at": _to_utc_iso(d.get("unsubscribed_at")),
            "last_ip": d.get("last_ip"),
            "last_user_agent": d.get("last_user_agent"),
            "event_history": d.get("event_history", []),
            "followups_paused": bool(d.get("followups_paused", False)),
        })

    return {"data": items, "total": total, "skip": skip, "limit": limit}


@router.get("/daily-report")
async def get_daily_tracking_report(
    campaign_id: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db),
):
    """Return day-by-day sent, opened, clicked, replied, bounced, and unsubscribed counts."""
    today = datetime.now(timezone.utc).date()
    try:
        start_d = date.fromisoformat(date_from) if date_from else (today - timedelta(days=29))
    except ValueError:
        start_d = today - timedelta(days=29)
    try:
        end_d = date.fromisoformat(date_to) if date_to else today
    except ValueError:
        end_d = today
    if start_d > end_d:
        start_d, end_d = end_d, start_d
    if (end_d - start_d).days > 90:
        start_d = end_d - timedelta(days=90)

    start_dt = datetime.combine(start_d, datetime.min.time(), tzinfo=timezone.utc)
    end_dt = datetime.combine(end_d + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)

    query: Dict[str, Any] = {"sent_at": {"$gte": start_dt, "$lt": end_dt}}
    if str(current_user.role).upper() not in ("ADMIN", "SUPERADMIN"):
        query["$or"] = _user_match_filter(current_user)
    if campaign_id:
        query["campaign_id"] = campaign_id

    docs = await db["email_tracking"].find(
        query,
        {"sent_at": 1, "opened": 1, "clicked": 1, "replied": 1, "bounced": 1, "unsubscribed": 1},
    ).to_list(10000)

    day_map: Dict[str, Dict[str, int]] = {}
    for d in docs:
        sa = d.get("sent_at")
        if not isinstance(sa, datetime):
            continue
        day_key = sa.astimezone(timezone.utc).date().isoformat() if sa.tzinfo else sa.date().isoformat()
        bucket = day_map.setdefault(day_key, {"sent": 0, "opened": 0, "clicked": 0, "replied": 0, "bounced": 0, "unsubscribed": 0})
        bucket["sent"] += 1
        if d.get("opened"):
            bucket["opened"] += 1
        if d.get("clicked"):
            bucket["clicked"] += 1
        if d.get("replied"):
            bucket["replied"] += 1
        if d.get("bounced"):
            bucket["bounced"] += 1
        if d.get("unsubscribed"):
            bucket["unsubscribed"] += 1

    rows: List[Dict[str, Any]] = []
    cur = start_d
    while cur <= end_d:
        ds = cur.isoformat()
        b = day_map.get(ds, {})
        rows.append({
            "date": ds,
            "label": cur.strftime("%d %b"),
            "sent": b.get("sent", 0),
            "opened": b.get("opened", 0),
            "clicked": b.get("clicked", 0),
            "replied": b.get("replied", 0),
            "bounced": b.get("bounced", 0),
            "unsubscribed": b.get("unsubscribed", 0),
        })
        cur += timedelta(days=1)

    return {
        "date_from": start_d.isoformat(),
        "date_to": end_d.isoformat(),
        "rows": rows,
        "totals": {
            "sent": sum(r["sent"] for r in rows),
            "opened": sum(r["opened"] for r in rows),
            "clicked": sum(r["clicked"] for r in rows),
            "replied": sum(r["replied"] for r in rows),
            "bounced": sum(r["bounced"] for r in rows),
            "unsubscribed": sum(r["unsubscribed"] for r in rows),
        },
    }


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


@router.post("/check-bounces")
async def trigger_bounce_check(
    current_user: UserInDB = Depends(require_email_automation_access),
    db=Depends(get_db),
):
    """Manually trigger an immediate IMAP bounce DSN check for the authenticated user."""
    from app.services.email_ai.bounce_detector import EmailBounceDetector

    detector = EmailBounceDetector(db)
    summary = await detector.check_user_bounces(str(current_user.id))
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
        "sent_at": _to_utc_iso(d.get("sent_at")),
        "opened": bool(d.get("opened", False)),
        "opened_at": _to_utc_iso(d.get("opened_at")),
        "open_count": int(d.get("open_count", 0)),
        "clicked": bool(d.get("clicked", False)),
        "clicked_at": _to_utc_iso(d.get("clicked_at")),
        "click_count": int(d.get("click_count", 0)),
        "replied": bool(d.get("replied", False)),
        "replied_at": _to_utc_iso(d.get("replied_at")),
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
    subject = "Email Tracking Verification Test"
    raw_html = (
        "<html><body style='font-family:Arial,sans-serif;color:#1e293b;line-height:1.6;'>"
        "<h2 style='margin-bottom:8px;'>Email Tracking Verification</h2>"
        "<p>This is an automated test email sent from LeadFinderAgent to verify real-time open and reply tracking.</p>"
        "<p style='font-size:12px;color:#64748b;'>Simply opening this email (with images enabled) or replying to it will automatically update the tracking status.</p>"
        "</body></html>"
    )
    text_body = (
        "Email Tracking Verification\n\n"
        "This is an automated test email sent from LeadFinderAgent to verify real-time open and reply tracking.\n"
    )
    tracked_html = apply_email_tracking(
        raw_html,
        tracking_id,
        open_tracking=True,
        click_tracking=False,
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
