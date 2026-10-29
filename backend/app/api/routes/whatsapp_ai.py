from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import pandas as pd
import tempfile
import os
import asyncio
from app.db.database import get_db
from app.core.websocket import manager
from app.models.whatsapp_ai import (
    WAAITemplateCreate, WAAITemplateUpdate, WAAITemplateInDB,
    WAAICampaignCreate, WAAICampaignInDB
)
from app.api.dependencies import get_current_user

router = APIRouter()

def serialize_doc(doc: dict) -> dict:
    if not doc:
        return doc
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


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
async def create_campaign(campaign: WAAICampaignCreate, db=Depends(get_db)):
    new_campaign = campaign.model_dump()
    new_campaign["created_at"] = datetime.now(timezone.utc)
    new_campaign["updated_at"] = datetime.now(timezone.utc)
    new_campaign["status"] = "QUEUED"
    new_campaign["leads_processed"] = []
    new_campaign["logs"] = []
    
    result = await db["wa_ai_campaigns"].insert_one(new_campaign)
    
    # Auto-start the campaign immediately by setting to RUNNING
    await db["wa_ai_campaigns"].update_one(
        {"_id": result.inserted_id},
        {"$set": {"status": "RUNNING"}}
    )
    
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
    sent_count = sum(1 for log in logs if log["status"] == "sent")
    failed_count = sum(1 for log in logs if log["status"] == "failed")
    skipped_count = sum(1 for log in logs if log["status"] == "skipped")
    
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
