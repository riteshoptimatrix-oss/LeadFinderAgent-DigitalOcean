from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, Request, Response
from fastapi.responses import FileResponse
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import pandas as pd
import tempfile
import os
import asyncio
from app.db.database import get_db
from app.core.websocket import manager, WebSocketEventType
from app.models.whatsapp_ai import (
    WAAITemplateCreate, WAAITemplateUpdate, WAAITemplateInDB,
    WAAICampaignCreate, WAAICampaignInDB,
    WhatsAppConfigUpdate, WhatsAppConfigResponse, PreviewRequest
)
from app.api.dependencies import get_current_user
from app.services.whatsapp.whatsapp_cloud_service import WhatsAppCloudService
from app.services.whatsapp_ai.cloud_worker import WAAICloudWorker

router = APIRouter()

def serialize_doc(doc: dict) -> dict:
    if not doc:
        return doc
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


@router.get("/config", response_model=WhatsAppConfigResponse)
async def get_whatsapp_config(current_user=Depends(get_current_user), db=Depends(get_db)):
    creds = await WhatsAppCloudService.get_credentials(db, current_user.id)
    verified_phone = None
    display_name = None
    quality_rating = None
    
    if creds.get("is_configured"):
        service = WhatsAppCloudService()
        is_valid, details, _ = await service.verify_credentials(creds["token"], creds["phone_number_id"])
        if is_valid:
            verified_phone = details.get("display_phone_number")
            display_name = details.get("verified_name")
            quality_rating = details.get("quality_rating")

    return WhatsAppConfigResponse(
        is_configured=creds["is_configured"],
        phone_number_id=creds.get("phone_number_id"),
        waba_id=creds.get("waba_id"),
        masked_token=creds.get("masked_token"),
        webhook_url="/api/v1/whatsapp-ai/webhook",
        verified_phone=verified_phone,
        display_name=display_name,
        quality_rating=quality_rating
    )

@router.post("/config", response_model=WhatsAppConfigResponse)
async def update_whatsapp_config(
    config: WhatsAppConfigUpdate,
    current_user=Depends(get_current_user),
    db=Depends(get_db)
):
    update_fields = {}
    if config.access_token is not None and config.access_token.strip():
        update_fields["wa_official_token"] = config.access_token.strip()
        update_fields["wa_api_key"] = config.access_token.strip()
    if config.phone_number_id is not None:
        update_fields["wa_phone_id"] = config.phone_number_id.strip()
    if config.waba_id is not None:
        update_fields["wa_waba_id"] = config.waba_id.strip()
    if config.verify_token is not None:
        update_fields["wa_webhook_verify_token"] = config.verify_token.strip()

    if update_fields:
        update_fields["updated_at"] = datetime.now(timezone.utc)
        await db["settings"].update_one(
            {"user_id": current_user.id},
            {"$set": update_fields},
            upsert=True
        )

    return await get_whatsapp_config(current_user=current_user, db=db)

@router.post("/config/verify")
async def verify_whatsapp_config(
    payload: Optional[Dict[str, Any]] = None,
    current_user=Depends(get_current_user),
    db=Depends(get_db)
):
    payload = payload or {}
    token = payload.get("access_token")
    phone_id = payload.get("phone_number_id")

    if not token or not phone_id:
        creds = await WhatsAppCloudService.get_credentials(db, current_user.id)
        token = token or creds.get("token")
        phone_id = phone_id or creds.get("phone_number_id")

    if not token or not phone_id:
        return {"valid": False, "details": {}, "error": "Access Token and Phone Number ID are required to verify connection."}

    service = WhatsAppCloudService()
    is_valid, details, error = await service.verify_credentials(token, phone_id)
    return {
        "valid": is_valid,
        "details": details,
        "error": error
    }

@router.get("/webhook")
async def verify_webhook(request: Request, db=Depends(get_db)):
    hub_mode = request.query_params.get("hub.mode")
    hub_token = request.query_params.get("hub.verify_token")
    hub_challenge = request.query_params.get("hub.challenge")

    creds = await WhatsAppCloudService.get_credentials(db)
    expected_token = creds.get("verify_token") or "leadfinder_verify_token"

    if hub_mode == "subscribe" and hub_token == expected_token:
        return Response(content=hub_challenge or "", media_type="text/plain")
    else:
        raise HTTPException(status_code=403, detail="Verification token mismatch")

@router.post("/webhook")
async def handle_webhook(request: Request, db=Depends(get_db)):
    try:
        body = await request.json()
    except Exception:
        return {"status": "ignored"}

    entries = body.get("entry", [])
    for entry in entries:
        changes = entry.get("changes", [])
        for change in changes:
            value = change.get("value", {})
            
            # 1. Delivery & Read Statuses
            statuses = value.get("statuses", [])
            for st in statuses:
                wamid = st.get("id")
                new_status = st.get("status")  # sent, delivered, read, failed
                if wamid and new_status:
                    await db["wa_ai_recipients"].update_one(
                        {"meta_message_id": wamid},
                        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc)}}
                    )
                    recipient = await db["wa_ai_recipients"].find_one({"meta_message_id": wamid})
                    if recipient and "campaign_id" in recipient:
                        cid = recipient["campaign_id"]
                        await db["wa_ai_campaigns"].update_one(
                            {"_id": ObjectId(cid), "logs.meta_message_id": wamid},
                            {"$set": {"logs.$.status": new_status}}
                        )
                        evt_type = (
                            WebSocketEventType.WA_LEAD_DELIVERED.value if new_status == "delivered" else
                            WebSocketEventType.WA_LEAD_READ.value if new_status == "read" else
                            WebSocketEventType.WA_LEAD_SENT.value
                        )
                        await manager.broadcast_to_job(
                            cid,
                            {
                                "type": evt_type,
                                "campaign_id": cid,
                                "lead_id": recipient.get("lead_id"),
                                "meta_message_id": wamid,
                                "status": new_status
                            }
                        )

            # 2. Incoming Messages & Opt-outs
            messages = value.get("messages", [])
            for msg in messages:
                text_body = msg.get("text", {}).get("body", "").strip().upper()
                from_phone = msg.get("from")
                if text_body in ["STOP", "UNSUBSCRIBE", "OPT OUT", "QUIT"] and from_phone:
                    clean_phone = from_phone.lstrip('+')
                    await db["leads"].update_many(
                        {"$or": [
                            {"phone": {"$regex": clean_phone}},
                            {"whatsapp_number": {"$regex": clean_phone}}
                        ]},
                        {"$set": {"whatsapp_opted_out": True, "updated_at": datetime.now(timezone.utc)}}
                    )

    return {"status": "success"}

@router.post("/preview")
async def preview_message(payload: PreviewRequest, current_user=Depends(get_current_user), db=Depends(get_db)):
    content = payload.template_content
    if not content and payload.template_id:
        try:
            t = await db["wa_ai_templates"].find_one({"_id": ObjectId(payload.template_id)})
        except Exception:
            t = await db["wa_ai_templates"].find_one({"_id": payload.template_id})
        if t:
            content = t.get("content", "")

    if not content:
        content = "Hello {{business_name}}, thanks for connecting with us!"

    lead = None
    if payload.lead_id:
        try:
            lead = await db["leads"].find_one({"_id": ObjectId(payload.lead_id)})
        except Exception:
            lead = await db["leads"].find_one({"_id": payload.lead_id})

    if not lead:
        lead = {
            "business_name": "Apex Digital Labs",
            "contact_name": "Alexander Wright",
            "city": "Austin",
            "state": "TX",
            "website": "www.apexdigital.io",
            "phone": "+1 (512) 555-0199",
            "industry": "Marketing Tech",
            "ai_score": 94
        }

    worker = WAAICloudWorker(db)
    rendered = worker._replace_variables(content, lead)

    return {
        "rendered": rendered,
        "business_name": lead.get("business_name") or lead.get("company_name") or "Apex Digital Labs",
        "phone": lead.get("whatsapp_number") or lead.get("phone", "+1 512 555-0199"),
        "lead_id": str(lead.get("_id", "sample"))
    }

@router.post("/templates/sync-meta")
async def sync_meta_templates(current_user=Depends(get_current_user), db=Depends(get_db)):
    creds = await WhatsAppCloudService.get_credentials(db, current_user.id)
    if not creds.get("token") or not creds.get("waba_id"):
        raise HTTPException(status_code=400, detail="Meta Access Token and WABA ID must be configured in settings to sync Meta templates.")

    service = WhatsAppCloudService()
    success, templates, error = await service.get_waba_templates(creds["token"], creds["waba_id"])
    if not success:
        raise HTTPException(status_code=400, detail=error)

    synced_count = 0
    now = datetime.now(timezone.utc)
    for t in templates:
        name = t.get("name")
        status = t.get("status")
        body_text = ""
        for comp in t.get("components", []):
            if comp.get("type") == "BODY":
                body_text = comp.get("text", "")
                break

        if name and body_text:
            await db["wa_ai_templates"].update_one(
                {"name": name},
                {
                    "$set": {
                        "name": name,
                        "content": body_text,
                        "description": f"Meta Cloud Template ({status})",
                        "meta_template_id": t.get("id"),
                        "language": t.get("language"),
                        "category": t.get("category"),
                        "is_active": (status == "APPROVED"),
                        "updated_at": now
                    },
                    "$setOnInsert": {"created_at": now}
                },
                upsert=True
            )
            synced_count += 1

    return {"message": f"Successfully synced {synced_count} templates from Meta", "total": len(templates)}



@router.get("/templates", response_model=List[Dict[Any, Any]])
async def get_templates(db=Depends(get_db)):
    templates = await db["wa_ai_templates"].find({"is_active": {"$ne": False}}).to_list(100)
    return [serialize_doc(t) for t in templates]

@router.post("/templates", response_model=Dict[Any, Any])
async def create_template(template: WAAITemplateCreate, db=Depends(get_db)):
    new_template = template.model_dump()
    new_template["created_at"] = datetime.now(timezone.utc)
    new_template["updated_at"] = datetime.now(timezone.utc)
    
    result = await db["wa_ai_templates"].insert_one(new_template)
    created = await db["wa_ai_templates"].find_one({"_id": result.inserted_id})
    return serialize_doc(created)

@router.put("/templates/{template_id}", response_model=Dict[Any, Any])
async def update_template(template_id: str, template: WAAITemplateUpdate, db=Depends(get_db)):
    update_data = {k: v for k, v in template.model_dump(exclude_unset=True).items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
        
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db["wa_ai_templates"].update_one(
        {"_id": ObjectId(template_id)},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
        
    updated = await db["wa_ai_templates"].find_one({"_id": ObjectId(template_id)})
    return serialize_doc(updated)

@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, db=Depends(get_db)):
    result = await db["wa_ai_templates"].update_one(
        {"_id": ObjectId(template_id)},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted successfully"}

@router.post("/campaigns", response_model=Dict[Any, Any])
async def create_campaign(
    campaign: WAAICampaignCreate,
    current_user=Depends(get_current_user),
    db=Depends(get_db)
):
    new_campaign = campaign.model_dump()
    new_campaign["user_id"] = current_user.id
    new_campaign["created_at"] = datetime.now(timezone.utc)
    new_campaign["updated_at"] = datetime.now(timezone.utc)
    new_campaign["status"] = "RUNNING"
    new_campaign["leads_processed"] = []
    new_campaign["logs"] = []
    
    result = await db["wa_ai_campaigns"].insert_one(new_campaign)
    cid_str = str(result.inserted_id)

    # Seed initial recipient records in wa_ai_recipients
    target_leads = campaign.target_leads or []
    if target_leads:
        now = datetime.now(timezone.utc)
        initial_recipients = []
        for lid in target_leads:
            initial_recipients.append({
                "campaign_id": cid_str,
                "lead_id": lid,
                "status": "queued",
                "phone": "",
                "business_name": "",
                "created_at": now,
                "updated_at": now
            })
        if initial_recipients:
            try:
                await db["wa_ai_recipients"].insert_many(initial_recipients, ordered=False)
            except Exception:
                pass
    
    created = await db["wa_ai_campaigns"].find_one({"_id": result.inserted_id})
    return serialize_doc(created)

@router.get("/campaigns", response_model=List[Dict[Any, Any]])
async def get_campaigns(
    status: Optional[str] = None,
    search: Optional[str] = None,
    db=Depends(get_db)
):
    query = {}
    if status:
        query["status"] = status
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
        
    campaigns = await db["wa_ai_campaigns"].find(query).sort("created_at", -1).to_list(100)
    return [serialize_doc(c) for c in campaigns]

@router.get("/campaigns/{campaign_id}/live-status")
async def get_campaign_live_status(campaign_id: str, db=Depends(get_db)):
    campaign = await db["wa_ai_campaigns"].find_one({"_id": ObjectId(campaign_id)})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    logs = campaign.get("logs", [])
    sent_count = sum(1 for log in logs if log.get("status") in ["sent", "delivered", "read"])
    delivered_count = sum(1 for log in logs if log.get("status") in ["delivered", "read"])
    read_count = sum(1 for log in logs if log.get("status") == "read")
    failed_count = sum(1 for log in logs if log.get("status") == "failed")
    skipped_count = sum(1 for log in logs if log.get("status") == "skipped")
    
    # Get current processing lead
    current_lead_id = None
    target_leads = campaign.get("target_leads", [])
    leads_processed = campaign.get("leads_processed", [])
    for t_lead in target_leads:
        if t_lead not in leads_processed:
            current_lead_id = t_lead
            break
            
    current_lead_data = None
    if current_lead_id:
        lead = await db["leads"].find_one({"_id": ObjectId(current_lead_id)})
        if lead:
            current_lead_data = {
                "business_name": lead.get("business_name"),
                "phone": lead.get("whatsapp_number") or lead.get("phone")
            }
    # Calculate ETA based on duration average
    eta_seconds = 0
    if len(logs) > 0:
        total_duration = sum(log.get("duration", 0) for log in logs if log.get("duration", 0) > 0)
        valid_logs = sum(1 for log in logs if log.get("duration", 0) > 0)
        avg_duration = total_duration / valid_logs if valid_logs > 0 else 5.0 # default to 5s
        remaining = len(target_leads) - len(leads_processed)
        eta_seconds = remaining * avg_duration
    else:
        eta_seconds = len(target_leads) * 5.0
        
    # Format ETA as string (MM:SS)
    eta = f"{int(eta_seconds // 60):02d}:{int(eta_seconds % 60):02d}"
    
    return {
        "status": campaign.get("status", "QUEUED"),
        "total": len(target_leads),
        "completed": len(leads_processed),
        "sent": sent_count,
        "delivered": delivered_count,
        "read": read_count,
        "failed": failed_count,
        "skipped": skipped_count,
        "current_lead": current_lead_data,
        "current_message": campaign.get("current_message", ""),
        "eta": eta,
        "logs": sorted(logs, key=lambda x: x["processed_at"], reverse=True)[:50]
    }

@router.websocket("/ws/{campaign_id}")
async def websocket_endpoint(websocket: WebSocket, campaign_id: str):
    await manager.connect(websocket, campaign_id)
    try:
        while True:
            # Keep connection alive
            await asyncio.wait_for(websocket.receive_text(), timeout=15.0)
    except asyncio.TimeoutError:
        try:
            await websocket.send_json({"type": "HEARTBEAT", "campaign_id": campaign_id})
        except Exception:
            pass
    except WebSocketDisconnect:
        await manager.disconnect(websocket, campaign_id)
    except Exception as e:
        await manager.disconnect(websocket, campaign_id)

@router.post("/campaigns/{campaign_id}/{action}")
async def control_campaign(campaign_id: str, action: str, db=Depends(get_db)):
    if action not in ["pause", "resume", "cancel"]:
        raise HTTPException(status_code=400, detail="Invalid action")
        
    status_map = {
        "pause": "PAUSED",
        "resume": "RUNNING",
        "cancel": "CANCELLED"
    }
    
    result = await db["wa_ai_campaigns"].update_one(
        {"_id": ObjectId(campaign_id)},
        {"$set": {"status": status_map[action], "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    return {"message": f"Campaign {action}ed successfully"}

@router.get("/campaigns/{campaign_id}/recipients")
async def get_campaign_recipients(
    campaign_id: str,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db=Depends(get_db)
):
    query: Dict[str, Any] = {"campaign_id": campaign_id}
    if status and status.lower() != "all":
        query["status"] = status.lower()
    if search:
        query["$or"] = [
            {"business_name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"error": {"$regex": search, "$options": "i"}}
        ]

    total = await db["wa_ai_recipients"].count_documents(query)
    recipients = await db["wa_ai_recipients"].find(query).sort("updated_at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)

    return {
        "recipients": [serialize_doc(r) for r in recipients],
        "total": total,
        "page": page,
        "limit": limit
    }

@router.post("/campaigns/{campaign_id}/retry-failed")
async def retry_failed_recipients(campaign_id: str, db=Depends(get_db)):
    campaign = await db["wa_ai_campaigns"].find_one({"_id": ObjectId(campaign_id)})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    logs = campaign.get("logs", [])
    failed_lead_ids = [log["lead_id"] for log in logs if log.get("status") == "failed"]

    if not failed_lead_ids:
        # Also check wa_ai_recipients
        failed_recs = await db["wa_ai_recipients"].find({"campaign_id": campaign_id, "status": "failed"}).to_list(500)
        failed_lead_ids = [r["lead_id"] for r in failed_recs]

    if not failed_lead_ids:
        return {"message": "No failed recipients to retry", "retried_count": 0}

    # Remove failed leads from leads_processed so worker retries them
    await db["wa_ai_campaigns"].update_one(
        {"_id": ObjectId(campaign_id)},
        {
            "$pull": {"leads_processed": {"$in": failed_lead_ids}},
            "$set": {"status": "RUNNING", "updated_at": datetime.now(timezone.utc)}
        }
    )

    # Reset recipient status in wa_ai_recipients
    await db["wa_ai_recipients"].update_many(
        {"campaign_id": campaign_id, "lead_id": {"$in": failed_lead_ids}},
        {"$set": {"status": "queued", "error": None, "updated_at": datetime.now(timezone.utc)}}
    )

    await manager.broadcast_to_job(
        campaign_id,
        {
            "type": WebSocketEventType.WA_CAMPAIGN_RESUMED.value,
            "campaign_id": campaign_id,
            "message": f"Retrying {len(failed_lead_ids)} failed recipients"
        }
    )

    return {"message": f"Retrying {len(failed_lead_ids)} failed recipients", "retried_count": len(failed_lead_ids)}

@router.get("/analytics")
async def get_analytics(db=Depends(get_db)):
    campaigns = await db["wa_ai_campaigns"].find().to_list(None)
    
    total_campaigns = len(campaigns)
    
    total_sent = 0
    total_failed = 0
    total_skipped = 0
    total_duration = 0.0
    valid_durations_count = 0
    
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    start_of_week = today - timedelta(days=today.weekday())
    start_of_month = today.replace(day=1)
    
    sent_today = 0
    sent_week = 0
    sent_month = 0
    
    for c in campaigns:
        logs = c.get("logs", [])
        for log in logs:
            if log["status"] == "sent":
                total_sent += 1
                if "processed_at" in log:
                    log_date = log["processed_at"]
                    # handle if it's string vs datetime depending on motor config
                    if isinstance(log_date, str):
                        log_date = datetime.fromisoformat(log_date.replace('Z', '+00:00'))
                    
                    if log_date >= today:
                        sent_today += 1
                    if log_date >= start_of_week:
                        sent_week += 1
                    if log_date >= start_of_month:
                        sent_month += 1
                        
            elif log["status"] == "failed":
                total_failed += 1
            elif log["status"] == "skipped":
                total_skipped += 1
                
            if log.get("duration", 0) > 0:
                total_duration += log["duration"]
                valid_durations_count += 1
                
    total_processed = total_sent + total_failed + total_skipped
    success_rate = (total_sent / total_processed * 100) if total_processed > 0 else 0
    failure_rate = (total_failed / total_processed * 100) if total_processed > 0 else 0
    avg_send_time = (total_duration / valid_durations_count) if valid_durations_count > 0 else 0
    
    return {
        "success_rate": success_rate,
        "failure_rate": failure_rate,
        "avg_send_time": avg_send_time,
        "total_campaigns": total_campaigns,
        "messages_sent_today": sent_today,
        "messages_sent_week": sent_week,
        "messages_sent_month": sent_month,
        "total_sent": total_sent,
        "total_failed": total_failed
    }

@router.get("/campaigns/{campaign_id}/export")
async def export_campaign(campaign_id: str, format: str = Query("csv"), db=Depends(get_db)):
    campaign = await db["wa_ai_campaigns"].find_one({"_id": ObjectId(campaign_id)})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
        
    logs = campaign.get("logs", [])
    data = []
    
    for log in logs:
        # Try to resolve lead info
        lead = await db["leads"].find_one({"_id": ObjectId(log["lead_id"])})
        business_name = lead.get("business_name", "Unknown") if lead else "Unknown"
        phone = lead.get("whatsapp_number") or lead.get("phone") if lead else "Unknown"
        
        data.append({
            "Lead ID": log["lead_id"],
            "Business Name": business_name,
            "Phone Number": phone,
            "Status": log["status"].upper(),
            "Error": log.get("error", ""),
            "Duration (s)": log.get("duration", 0),
            "Processed At": log.get("processed_at", "")
        })
        
    df = pd.DataFrame(data)
    
    fd, path = tempfile.mkstemp(suffix=f".{format}")
    os.close(fd)
    
    if format == "csv":
        df.to_csv(path, index=False)
        media_type = "text/csv"
    elif format == "xlsx" or format == "excel":
        path = path.replace(".excel", ".xlsx")
        df.to_excel(path, index=False)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        raise HTTPException(status_code=400, detail="Unsupported format. Use 'csv' or 'excel'")
        
    return FileResponse(path, media_type=media_type, filename=f"Campaign_{campaign.get('name', 'Report')}_{datetime.now().strftime('%Y%m%d')}.{format.replace('excel', 'xlsx')}")
from app.models.lead import build_lead_response
from app.core.logger import logger

@router.get("/leads")
async def get_leads_for_whatsapp_ai(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    current_user=Depends(get_current_user),
    db=Depends(get_db)
):
    skip = (page - 1) * limit
    
    scope = {} if current_user.role == "ADMIN" else {"user_id": current_user.id}
    query = dict(scope)
    
    # Positive inclusion: Only reject if Business Name AND Phone AND Email are ALL missing.
    # Therefore, we include if it HAS a business name, OR HAS an email, OR HAS a phone.
    has_business_name = [
        {"business_name": {"$nin": [None, ""]}},
        {"company_name": {"$nin": [None, ""]}},
        {"name": {"$nin": [None, ""]}}
    ]
    
    has_email = [
        {"email": {"$nin": [None, ""]}},
        {"emails.0": {"$exists": True}},
        {"contact_discovery.primary_email": {"$nin": [None, ""]}},
        {"contact_discovery.all_emails.0": {"$exists": True}}
    ]
    
    has_phone_fields = [
        {"phone": {"$nin": [None, ""]}},
        {"phones.0": {"$exists": True}},
        {"phone_number": {"$nin": [None, ""]}},
        {"phone_digits": {"$nin": [None, ""]}},
        {"mobile": {"$nin": [None, ""]}},
        {"whatsapp": {"$nin": [None, ""]}},
        {"whatsapp_number": {"$nin": [None, ""]}},
        {"contact_discovery.primary_phone": {"$nin": [None, ""]}},
        {"contact_discovery.secondary_phones.0": {"$exists": True}},
        {"contact_discovery.whatsapp_numbers.0": {"$exists": True}},
        {"ai_analysis.phones.0": {"$exists": True}},
        {"ai_analysis.whatsapp.0": {"$exists": True}}
    ]
    
    validity_cond = {
        "$or": [
            *has_business_name,
            *has_email,
            *has_phone_fields
        ]
    }
    
    and_conds = [validity_cond]
    
    if search:
        and_conds.append({
            "$or": [
                {"business_name": {"$regex": search, "$options": "i"}},
                {"company_name": {"$regex": search, "$options": "i"}},
                {"name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
                {"phone_number": {"$regex": search, "$options": "i"}},
                {"whatsapp_number": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}}
            ]
        })
        
    query["$and"] = and_conds
    query["whatsapp_opted_out"] = {"$ne": True}
    query["blacklisted"] = {"$ne": True}
        
    total = await db["leads"].count_documents(query)
    
    leads = await db["leads"].find(query).skip(skip).limit(limit).to_list(limit)
    
    formatted_leads = []
    
    for raw_lead in leads:
        try:
            normalized, warnings = build_lead_response(raw_lead, logger=logger)
            for w in warnings:
                logger.warning(f"WHATSAPP_AI_NORMALIZATION: {w}")
            # Ensure _id is a string, and return the raw dump (so aliases are resolved)
            lead_dict = normalized.model_dump(by_alias=True)
            if "_id" not in lead_dict and "id" in lead_dict:
                lead_dict["_id"] = lead_dict["id"]
            formatted_leads.append(lead_dict)
        except Exception as e:
            logger.error(f"WHATSAPP_AI_VALIDATION_SKIP: Skipping lead {raw_lead.get('_id')}: {e}")
            continue
        
    return {
        "leads": formatted_leads,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }

@router.get("/leads/select-all")
async def get_all_leads_for_whatsapp_ai(
    search: Optional[str] = None,
    current_user=Depends(get_current_user),
    db=Depends(get_db)
):
    scope = {} if current_user.role == "ADMIN" else {"user_id": current_user.id}
    query = dict(scope)
    
    # Positive inclusion: Only reject if Business Name AND Phone AND Email are ALL missing.
    has_business_name = [
        {"business_name": {"$nin": [None, ""]}},
        {"company_name": {"$nin": [None, ""]}},
        {"name": {"$nin": [None, ""]}}
    ]
    
    has_email = [
        {"email": {"$nin": [None, ""]}},
        {"emails.0": {"$exists": True}},
        {"contact_discovery.primary_email": {"$nin": [None, ""]}},
        {"contact_discovery.all_emails.0": {"$exists": True}}
    ]
    
    has_phone_fields = [
        {"phone": {"$nin": [None, ""]}},
        {"phones.0": {"$exists": True}},
        {"phone_number": {"$nin": [None, ""]}},
        {"phone_digits": {"$nin": [None, ""]}},
        {"mobile": {"$nin": [None, ""]}},
        {"whatsapp": {"$nin": [None, ""]}},
        {"whatsapp_number": {"$nin": [None, ""]}},
        {"contact_discovery.primary_phone": {"$nin": [None, ""]}},
        {"contact_discovery.secondary_phones.0": {"$exists": True}},
        {"contact_discovery.whatsapp_numbers.0": {"$exists": True}},
        {"ai_analysis.phones.0": {"$exists": True}},
        {"ai_analysis.whatsapp.0": {"$exists": True}}
    ]
    
    validity_cond = {
        "$or": [
            *has_business_name,
            *has_email,
            *has_phone_fields
        ]
    }
    
    and_conds = [validity_cond]
    
    if search:
        and_conds.append({
            "$or": [
                {"business_name": {"$regex": search, "$options": "i"}},
                {"company_name": {"$regex": search, "$options": "i"}},
                {"name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
                {"phone_number": {"$regex": search, "$options": "i"}},
                {"whatsapp_number": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}}
            ]
        })
        
    query["$and"] = and_conds
    query["whatsapp_opted_out"] = {"$ne": True}
    query["blacklisted"] = {"$ne": True}
    
    # Highly optimized projection: Only fetch ObjectIDs
    leads_cursor = db["leads"].find(query, {"_id": 1})
    ids = [str(lead["_id"]) async for lead in leads_cursor]
    
    return {"ids": ids, "total": len(ids)}
