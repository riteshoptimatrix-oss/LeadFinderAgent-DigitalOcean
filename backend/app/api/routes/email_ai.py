from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import pandas as pd
import tempfile
import os
import asyncio
import smtplib
import ssl
import socket
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import UserInDB
from app.core.websocket import manager
from app.core.logger import logger
from app.models.email_ai import (
    EmailAISmtpCreate, EmailAISmtpUpdate,
    EmailAITemplateCreate, EmailAITemplateUpdate,
    EmailAICampaignCreate
)

router = APIRouter()

def serialize_doc(doc: dict) -> dict:
    if not doc:
        return doc
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc

def get_user_match_filter(current_user: UserInDB) -> List[Dict[str, Any]]:
    uid = str(current_user.id)
    match_list: List[Dict[str, Any]] = [{"user_id": uid}]
    if ObjectId.is_valid(uid):
        match_list.append({"user_id": ObjectId(uid)})
    return match_list

# ==========================================
# SMTP Profiles
# ==========================================
@router.get("/smtp", response_model=List[Dict[Any, Any]])
async def get_smtp_profiles(
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    query = {
        "is_active": {"$ne": False},
        "$or": user_match + [{"user_id": None}, {"user_id": {"$exists": False}}, {"is_default": True}]
    }
    profiles = await db["email_ai_smtp"].find(query).to_list(100)
    return [serialize_doc(p) for p in profiles]

@router.post("/smtp", response_model=Dict[Any, Any])
async def create_smtp_profile(
    profile: EmailAISmtpCreate,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    new_profile = profile.model_dump()
    new_profile["user_id"] = str(current_user.id)
    new_profile["created_at"] = datetime.now(timezone.utc)
    new_profile["updated_at"] = datetime.now(timezone.utc)
    
    if new_profile.get("is_default"):
        await db["email_ai_smtp"].update_many(
            {"user_id": str(current_user.id)},
            {"$set": {"is_default": False}}
        )
        
    result = await db["email_ai_smtp"].insert_one(new_profile)
    created = await db["email_ai_smtp"].find_one({"_id": result.inserted_id})
    return serialize_doc(created)

@router.delete("/smtp/{id}")
async def delete_smtp_profile(
    id: str,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SMTP profile id")
        
    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    res = await db["email_ai_smtp"].update_one(
        filter_q,
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="SMTP profile not found or permission denied")
    return {"message": "Deleted"}

@router.get("/smtp/{id}/test")
async def test_smtp_profile(
    id: str,
    send_test: bool = Query(False, description="Also send a real test email to the SMTP username"),
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    """Attempt a real SMTP connection + authentication against a stored profile.

    Returns a clear pass/fail result so the frontend can show a professional
    error instead of a blank screen when the SMTP configuration is invalid.
    When ``send_test=true`` a real test message is sent to the profile's own
    address to validate the full connect -> auth -> send -> disconnect cycle.
    """
    try:
        profile = await db["email_ai_smtp"].find_one({"_id": ObjectId(id), "is_active": {"$ne": False}})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SMTP profile id.")
    if not profile:
        raise HTTPException(status_code=404, detail="SMTP profile not found.")

    host = (profile.get("host") or "").strip()
    port = int(profile.get("port", 587))
    username = (profile.get("username") or "").strip()
    password = str(profile.get("password") or "")
    encryption = (profile.get("encryption") or "TLS").upper().strip()

    if not host or not username or not password:
        raise HTTPException(status_code=400, detail="SMTP configuration is invalid: host, username and password are required.")

    # Build permissive SSL context
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    primary_is_ssl = (port == 465) or (encryption in ["SSL", "SMTPS"])
    strategies = []
    if primary_is_ssl:
        strategies.append({"mode": "SSL", "port": port})
        if port == 465:
            strategies.append({"mode": "TLS", "port": 587})
    else:
        strategies.append({"mode": "TLS", "port": port})
        if port == 587:
            strategies.append({"mode": "SSL", "port": 465})

    server = None
    last_error = None
    connected_strategy = None

    for strat in strategies:
        strat_mode = strat["mode"]
        strat_port = strat["port"]
        server = None
        try:
            logger.info(f"[EmailAI] Testing SMTP {host}:{strat_port} via {strat_mode}...")
            if strat_mode == "SSL":
                server = smtplib.SMTP_SSL(host, strat_port, timeout=15, context=context)
                server.ehlo()
            else:
                server = smtplib.SMTP(host, strat_port, timeout=15)
                server.ehlo()
                if encryption != "NONE":
                    server.starttls(context=context)
                    server.ehlo()

            server.login(username, password)
            connected_strategy = strat
            logger.info(f"[EmailAI] SMTP test OK: host={host}, port={strat_port}, mode={strat_mode}, user={username}")
            break
        except smtplib.SMTPAuthenticationError as e:
            logger.warning(f"[EmailAI] SMTP test auth failed: host={host}, port={strat_port}, user={username}: {e}")
            raise HTTPException(
                status_code=400,
                detail=f"Authentication failed: Check username and password. If using Gmail/Yahoo/Outlook, an App Password is required."
            )
        except (smtplib.SMTPServerDisconnected, ConnectionResetError, BrokenPipeError, TimeoutError, socket.timeout) as e:
            logger.warning(f"[EmailAI] SMTP test disconnected on {host}:{strat_port} ({strat_mode}): {e}")
            last_error = f"Connection unexpectedly closed by {host}:{strat_port}. Please check port (465 for SSL, 587 for TLS), verify your App Password, or check if your hosting provider (DigitalOcean) blocks outbound SMTP."
            continue
        except Exception as e:
            logger.warning(f"[EmailAI] SMTP test failed on {host}:{strat_port}: {e}")
            last_error = str(e)
            continue
        finally:
            if not connected_strategy and server:
                try:
                    server.quit()
                except Exception:
                    pass

    if not connected_strategy or not server:
        raise HTTPException(status_code=400, detail=last_error or f"SMTP connection failed for {host}:{port}")

    result = {
        "status": "success",
        "host": host,
        "port": connected_strategy["port"],
        "mode": connected_strategy["mode"],
        "message": f"SMTP Verified Successfully via {connected_strategy['mode']} on port {connected_strategy['port']}!"
    }

    if send_test:
        try:
            from email.mime.text import MIMEText
            msg = MIMEText("This is a test email from the Lead Finder Agent Email AI to verify your SMTP configuration is working correctly.")
            msg["Subject"] = "Lead Finder Agent - SMTP Test"
            msg["From"] = username
            msg["To"] = username
            server.sendmail(username, [username], msg.as_string())
            result["message"] = f"Connection successful and test email sent to {username}"
            result["test_email_sent"] = True
            logger.info(f"[EmailAI] SMTP test email sent to {username}")
        except Exception as send_err:
            logger.warning(f"[EmailAI] Test email send failed: {send_err}")

    try:
        server.quit()
    except Exception:
        pass

    return result

# ==========================================
# Templates
# ==========================================
@router.get("/templates", response_model=List[Dict[Any, Any]])
async def get_templates(
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    query = {
        "is_active": {"$ne": False},
        "$or": user_match + [{"user_id": None}, {"user_id": {"$exists": False}}, {"user_id": "system"}]
    }
    templates = await db["email_ai_templates"].find(query).to_list(100)
    return [serialize_doc(t) for t in templates]

@router.post("/templates", response_model=Dict[Any, Any])
async def create_template(
    template: EmailAITemplateCreate,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    new_template = template.model_dump()
    new_template["user_id"] = str(current_user.id)
    new_template["created_at"] = datetime.now(timezone.utc)
    new_template["updated_at"] = datetime.now(timezone.utc)
    
    result = await db["email_ai_templates"].insert_one(new_template)
    created = await db["email_ai_templates"].find_one({"_id": result.inserted_id})
    return serialize_doc(created)

@router.delete("/templates/{id}")
async def delete_template(
    id: str,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template id")
        
    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    res = await db["email_ai_templates"].update_one(
        filter_q,
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found or permission denied")
    return {"message": "Deleted"}


@router.put("/templates/{id}", response_model=Dict[Any, Any])
async def update_template(
    id: str,
    template: EmailAITemplateUpdate,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template id")

    update_data = {k: v for k, v in template.model_dump(exclude_unset=True).items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
        
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    result = await db["email_ai_templates"].update_one(
        filter_q,
        {
            "$set": update_data,
            "$inc": {"version": 1}
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found or permission denied")
        
    updated = await db["email_ai_templates"].find_one({"_id": oid})
    return serialize_doc(updated)

@router.put("/templates/{id}/favorite", response_model=Dict[Any, Any])
async def favorite_template(
    id: str,
    is_favorite: bool = Query(...),
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template id")

    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    result = await db["email_ai_templates"].update_one(
        filter_q,
        {"$set": {"is_favorite": is_favorite, "updated_at": datetime.now(timezone.utc)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found or permission denied")
    updated = await db["email_ai_templates"].find_one({"_id": oid})
    return serialize_doc(updated)

@router.post("/templates/{id}/duplicate", response_model=Dict[Any, Any])
async def duplicate_template(
    id: str,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template id")

    template = await db["email_ai_templates"].find_one({"_id": oid})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
        
    template.pop("_id", None)
    template["name"] = f"{template.get('name', 'Template')} (Copy)"
    template["user_id"] = str(current_user.id)
    template["created_at"] = datetime.now(timezone.utc)
    template["updated_at"] = datetime.now(timezone.utc)
    template["version"] = 1
    template["usage_count"] = 0
    
    result = await db["email_ai_templates"].insert_one(template)
    created = await db["email_ai_templates"].find_one({"_id": result.inserted_id})
    return serialize_doc(created)

# ==========================================
# Campaigns
# ==========================================
@router.get("/campaigns", response_model=List[Dict[Any, Any]])
async def get_campaigns(
    status: Optional[str] = None,
    search: Optional[str] = None,
    all_users: bool = Query(False),
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    query: Dict[str, Any] = {}
    if not (all_users and str(current_user.role).upper() in ["ADMIN", "SUPERADMIN"]):
        query["$or"] = user_match

    if status:
        query["status"] = status
    if search:
        search_filter = [
            {"name": {"$regex": search, "$options": "i"}},
            {"info.name": {"$regex": search, "$options": "i"}}
        ]
        if "$or" in query:
            query = {"$and": [{"$or": query["$or"]}, {"$or": search_filter}]}
            if status:
                query["status"] = status
        else:
            query["$or"] = search_filter
        
    campaigns = await db["email_ai_campaigns"].find(query).sort("created_at", -1).to_list(100)
    return [serialize_doc(c) for c in campaigns]

@router.post("/campaigns", response_model=Dict[Any, Any])
async def create_campaign(
    campaign: EmailAICampaignCreate,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    start = datetime.now(timezone.utc)
    logger.info(
        f"[EmailAI] create_campaign: user={current_user.email}, name={campaign.info.name}, "
        f"leads={len(campaign.target_leads)}, template={campaign.template_id}, smtp={campaign.smtp_id}"
    )

    # ── Validation before persisting anything ─────────────────────────────
    try:
        template = await db["email_ai_templates"].find_one(
            {"_id": ObjectId(campaign.template_id), "is_active": {"$ne": False}}
        )
        if not template:
            raise HTTPException(status_code=400, detail="Selected template does not exist or is inactive.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid template_id.")

    try:
        smtp_profile = await db["email_ai_smtp"].find_one(
            {"_id": ObjectId(campaign.smtp_id), "is_active": {"$ne": False}}
        )
        if not smtp_profile:
            raise HTTPException(status_code=400, detail="Selected SMTP profile does not exist or is inactive.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid smtp_id.")

    if not campaign.target_leads:
        raise HTTPException(status_code=400, detail="At least one lead must be selected.")

    # Validate lead ids are valid ObjectIds (avoid queueing garbage references)
    invalid_ids = [lid for lid in campaign.target_leads if not ObjectId.is_valid(lid)]
    if invalid_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid lead id(s) in target_leads: {invalid_ids[:5]}"
        )

    new_campaign = campaign.model_dump()
    new_campaign["user_id"] = str(current_user.id)
    new_campaign["name"] = campaign.info.name
    new_campaign["created_at"] = datetime.now(timezone.utc)
    new_campaign["updated_at"] = datetime.now(timezone.utc)
    new_campaign["status"] = "QUEUED"
    new_campaign["leads_processed"] = []
    new_campaign["logs"] = []

    try:
        result = await db["email_ai_campaigns"].insert_one(new_campaign)
    except Exception as e:
        logger.error(f"[EmailAI] create_campaign failed to persist campaign: {e}")
        raise HTTPException(status_code=500, detail="Failed to persist campaign. Please try again.")

    created = await db["email_ai_campaigns"].find_one({"_id": result.inserted_id})

    duration = (datetime.now(timezone.utc) - start).total_seconds()
    logger.info(
        f"[EmailAI] create_campaign SUCCESS: campaign_id={result.inserted_id}, user={current_user.email}, "
        f"status=QUEUED, leads={len(campaign.target_leads)}, duration_ms={round(duration * 1000, 2)}"
    )
    return serialize_doc(created)

@router.post("/campaigns/{campaign_id}/{action}")
async def control_campaign(
    campaign_id: str,
    action: str,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    if action not in ["pause", "resume", "cancel"]:
        raise HTTPException(status_code=400, detail="Invalid action")
        
    status_map = {
        "pause": "PAUSED",
        "resume": "RUNNING",
        "cancel": "CANCELLED"
    }

    try:
        oid = ObjectId(campaign_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign_id")

    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)
    
    result = await db["email_ai_campaigns"].update_one(
        filter_q,
        {"$set": {"status": status_map[action], "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found or permission denied")

    # Cancelling also finalizes any outstanding Pending/Waiting jobs so the
    # campaign does not remain open indefinitely.
    if action == "cancel":
        cancel_result = await db["email_ai_queue"].update_many(
            {"campaign_id": campaign_id, "status": {"$in": ["Pending", "Waiting"]}},
            {
                "$set": {"status": "Cancelled", "updated_at": datetime.now(timezone.utc)},
                "$push": {"logs": "Status changed to Cancelled: campaign cancelled"}
            }
        )
        logger.info(f"[EmailAI] control_campaign cancel: finalized {cancel_result.modified_count} pending job(s) for campaign {campaign_id}")

    return {"message": f"Campaign {action}ed successfully"}

@router.get("/campaigns/{campaign_id}/live-status")
async def get_campaign_live_status(
    campaign_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(campaign_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign_id")

    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    campaign = await db["email_ai_campaigns"].find_one(filter_q)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    # Aggregate from email_ai_queue
    pipeline = [
        {"$match": {"campaign_id": campaign_id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_counts = await db["email_ai_queue"].aggregate(pipeline).to_list(None)
    
    stats = {
        "Pending": 0,
        "Waiting": 0,
        "Preparing": 0,
        "Connecting": 0,
        "Sending": 0,
        "Delivered": 0,
        "Failed": 0,
        "Skipped": 0,
        "Cancelled": 0
    }
    
    for sc in status_counts:
        status_name = sc["_id"]
        if status_name in stats:
            stats[status_name] = sc["count"]
            
    # Fetch latest active logs
    latest_jobs = await db["email_ai_queue"].find(
        {"campaign_id": campaign_id, "status": {"$ne": "Pending"}}
    ).sort("updated_at", -1).limit(20).to_list(20)
    
    recent_logs = []
    for job in latest_jobs:
        if job.get("logs"):
            recent_logs.append({
                "lead_id": str(job["lead_id"]),
                "status": job["status"],
                "last_message": job["logs"][-1],
                "updated_at": job["updated_at"].isoformat() if job.get("updated_at") else None
            })
    
    return {
        "status": campaign.get("status", "UNKNOWN"),
        "total": len(campaign.get("target_leads", [])),
        "stats": stats,
        "sent": stats["Delivered"],
        "failed": stats["Failed"],
        "logs": recent_logs
    }

# ==========================================
# WebSocket
# ==========================================
@router.websocket("/ws/{campaign_id}")
async def websocket_endpoint(websocket: WebSocket, campaign_id: str):
    await manager.connect(websocket, campaign_id)
    try:
        while True:
            await asyncio.wait_for(websocket.receive_text(), timeout=15.0)
    except asyncio.TimeoutError:
        try:
            await websocket.send_json({"type": "HEARTBEAT", "campaign_id": campaign_id})
        except Exception:
            pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, campaign_id)
    except Exception as e:
        manager.disconnect(websocket, campaign_id)

# ==========================================
# Analytics & Exports
# ==========================================
@router.get("/analytics")
async def get_analytics(
    all_users: bool = Query(False),
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    query: Dict[str, Any] = {}
    if not (all_users and str(current_user.role).upper() in ["ADMIN", "SUPERADMIN"]):
        query = {"$or": user_match}

    campaigns = await db["email_ai_campaigns"].find(query).to_list(None)
    
    total_campaigns = len(campaigns)
    total_sent = 0
    total_failed = 0
    total_duration = 0.0
    valid_durations_count = 0
    
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_week = today - timedelta(days=today.weekday())
    start_of_month = today.replace(day=1)
    
    sent_today = sent_week = sent_month = 0
    daily_trends = {}
    
    for c in campaigns:
        for log in c.get("logs", []):
            status = log.get("status")
            if status == "sent":
                total_sent += 1
                log_date = log.get("processed_at")
                if log_date:
                    if isinstance(log_date, str):
                        try:
                            log_date = datetime.fromisoformat(log_date.replace('Z', '+00:00'))
                        except Exception:
                            log_date = None
                    if log_date:
                        if log_date >= today: sent_today += 1
                        if log_date >= start_of_week: sent_week += 1
                        if log_date >= start_of_month: sent_month += 1
                        
                        day_str = log_date.strftime("%Y-%m-%d")
                        if day_str not in daily_trends:
                            daily_trends[day_str] = {"date": day_str, "sent": 0, "failed": 0}
                        daily_trends[day_str]["sent"] += 1
            elif status == "failed":
                total_failed += 1
                log_date = log.get("processed_at")
                if log_date:
                    if isinstance(log_date, str):
                        try:
                            log_date = datetime.fromisoformat(log_date.replace('Z', '+00:00'))
                        except Exception:
                            log_date = None
                    if log_date:
                        day_str = log_date.strftime("%Y-%m-%d")
                        if day_str not in daily_trends:
                            daily_trends[day_str] = {"date": day_str, "sent": 0, "failed": 0}
                        daily_trends[day_str]["failed"] += 1
                        
            if (log.get("duration") or 0) > 0:
                total_duration += log["duration"]
                valid_durations_count += 1
                
    total = total_sent + total_failed
    success_rate = (total_sent / total * 100) if total > 0 else 0.0
    
    trends_list = sorted(list(daily_trends.values()), key=lambda x: x["date"])[-14:] # last 14 days
    
    return {
        "success_rate": round(success_rate, 1),
        "avg_send_time": round((total_duration / valid_durations_count), 2) if valid_durations_count > 0 else 0.0,
        "total_campaigns": total_campaigns,
        "messages_sent_today": sent_today,
        "messages_sent_week": sent_week,
        "messages_sent_month": sent_month,
        "total_sent": total_sent,
        "total_failed": total_failed,
        "daily_trends": trends_list
    }

@router.get("/analytics/smtp")
async def get_smtp_analytics(
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    query_campaigns = {"$or": user_match}
    query_smtp = {
        "is_active": {"$ne": False},
        "$or": user_match + [{"user_id": None}, {"user_id": {"$exists": False}}, {"is_default": True}]
    }

    smtps = await db["email_ai_smtp"].find(query_smtp).to_list(100)
    campaigns = await db["email_ai_campaigns"].find(query_campaigns).to_list(None)
    
    stats = {}
    for smtp in smtps:
        stats[str(smtp["_id"])] = {"name": smtp.get("name", "SMTP Relay"), "sent": 0, "failed": 0}
        
    for c in campaigns:
        smtp_id = str(c.get("smtp_id"))
        if smtp_id in stats:
            for log in c.get("logs", []):
                if log.get("status") == "sent": stats[smtp_id]["sent"] += 1
                elif log.get("status") == "failed": stats[smtp_id]["failed"] += 1
                
    return list(stats.values())

@router.get("/analytics/templates")
async def get_template_analytics(
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    query_campaigns = {"$or": user_match}
    query_templates = {
        "is_active": {"$ne": False},
        "$or": user_match + [{"user_id": None}, {"user_id": {"$exists": False}}, {"user_id": "system"}]
    }

    templates = await db["email_ai_templates"].find(query_templates).to_list(100)
    campaigns = await db["email_ai_campaigns"].find(query_campaigns).to_list(None)
    
    stats = {}
    for t in templates:
        stats[str(t["_id"])] = {"name": t.get("name", "Template"), "sent": 0, "failed": 0}
        
    for c in campaigns:
        t_id = str(c.get("template_id"))
        if t_id in stats:
            for log in c.get("logs", []):
                if log.get("status") == "sent": stats[t_id]["sent"] += 1
                elif log.get("status") == "failed": stats[t_id]["failed"] += 1
                
    return list(stats.values())

@router.get("/analytics/errors")
async def get_errors_center(
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    campaigns = await db["email_ai_campaigns"].find({"$or": user_match}).to_list(None)
    error_counts = {}
    
    for c in campaigns:
        for log in c.get("logs", []):
            if log.get("status") == "failed":
                err_msg = log.get("error", "Unknown Error")
                category = "Unknown"
                if "timeout" in err_msg.lower(): category = "Connection Timeout"
                elif "auth" in err_msg.lower(): category = "Authentication"
                elif "format" in err_msg.lower() or "syntax" in err_msg.lower(): category = "Validation"
                elif "closed" in err_msg.lower() or "reset" in err_msg.lower(): category = "Connection Closed"
                
                if category not in error_counts: error_counts[category] = 0
                error_counts[category] += 1
                
    return [{"category": k, "count": v} for k, v in error_counts.items()]

@router.get("/logs")
async def get_global_logs(
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    user_match = get_user_match_filter(current_user)
    campaigns = await db["email_ai_campaigns"].find({"$or": user_match}).sort("created_at", -1).limit(20).to_list(20)
    
    logs_flat = []
    for c in campaigns:
        for log in c.get("logs", []):
            logs_flat.append({
                "campaign_name": c.get("name") or c.get("info", {}).get("name", "Campaign"),
                "lead_id": log.get("lead_id"),
                "status": log.get("status"),
                "error": log.get("error"),
                "processed_at": log.get("processed_at"),
                "duration": log.get("duration")
            })
            
    logs_flat.sort(key=lambda x: str(x.get("processed_at") or ""), reverse=True)
    return logs_flat[:100]

@router.get("/campaigns/{campaign_id}/export")
async def export_campaign(
    campaign_id: str,
    format: str = Query("csv"),
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    try:
        oid = ObjectId(campaign_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid campaign_id")

    filter_q: Dict[str, Any] = {"_id": oid}
    if str(current_user.role).upper() not in ["ADMIN", "SUPERADMIN"]:
        filter_q["$or"] = get_user_match_filter(current_user)

    campaign = await db["email_ai_campaigns"].find_one(filter_q)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found or access denied")
        
    data = []
    for log in campaign.get("logs", []):
        lead = await db["leads"].find_one({"_id": ObjectId(log["lead_id"])}) if log.get("lead_id") and ObjectId.is_valid(log["lead_id"]) else None
        data.append({
            "Lead ID": log.get("lead_id", ""),
            "Business Name": lead.get("business_name") if lead else "Unknown",
            "Email": lead.get("email") if lead else "Unknown",
            "Status": str(log.get("status", "")).upper(),
            "Duration (s)": log.get("duration", 0),
            "Processed At": log.get("processed_at", "")
        })
        
    df = pd.DataFrame(data)
    fd, path = tempfile.mkstemp(suffix=f".{format}")
    os.close(fd)
    
    if format == "csv":
        df.to_csv(path, index=False)
        media_type = "text/csv"
    else:
        path = path.replace(".excel", ".xlsx")
        df.to_excel(path, index=False)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        
    return FileResponse(path, media_type=media_type, filename=f"EmailCampaign_{campaign_id}.{format.replace('excel', 'xlsx')}")


@router.get("/leads/select-all")
async def get_all_leads_for_email_ai(
    search: Optional[str] = None,
    city: Optional[str] = None,
    category: Optional[str] = None,
    has_website: Optional[bool] = None,
    has_phone: Optional[bool] = None,
    has_email: Optional[bool] = None,
    min_rating: Optional[float] = None,
    status: Optional[str] = None,
    current_user=Depends(get_current_user),
    db=Depends(get_db)
):
    scope = {} if current_user.role == "ADMIN" else {"user_id": current_user.id}
    query = dict(scope)
    
    has_business_name = [
        {"business_name": {"$nin": [None, ""]}},
        {"company_name": {"$nin": [None, ""]}},
        {"name": {"$nin": [None, ""]}}
    ]
    
    has_email_fields = [
        {"email": {"$nin": [None, ""]}},
        {"emails.0": {"$exists": True}},
        {"contact_discovery.primary_email": {"$nin": [None, ""]}},
        {"contact_discovery.all_emails.0": {"$exists": True}}
    ]
    
    validity_cond = {
        "$and": [
            {"$or": has_business_name},
            {"$or": has_email_fields}
        ]
    }
    
    and_conds = [validity_cond]
    
    if search:
        and_conds.append({
            "$or": [
                {"business_name": {"$regex": search, "$options": "i"}},
                {"company_name": {"$regex": search, "$options": "i"}},
                {"name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}}
            ]
        })
        
    if city:
        and_conds.append({"city": {"$regex": city, "$options": "i"}})
    if category:
        and_conds.append({"category": {"$regex": category, "$options": "i"}})
    if has_website is True:
        and_conds.append({"website": {"$nin": [None, ""]}})
    if has_website is False:
        and_conds.append({"website": {"$in": [None, ""]}})
    if has_phone is True:
        and_conds.append({"phone": {"$nin": [None, ""]}})
    if has_phone is False:
        and_conds.append({"phone": {"$in": [None, ""]}})
    if min_rating is not None:
        and_conds.append({"google_rating": {"$gte": min_rating}})
    if status and status != "ALL":
        and_conds.append({"status": status})
        
    query["$and"] = and_conds
    query["blacklisted"] = {"$ne": True}
    
    leads_cursor = db["leads"].find(query, {"_id": 1})
    ids = [str(lead["_id"]) async for lead in leads_cursor]
    
    return {"ids": ids, "total": len(ids)}
