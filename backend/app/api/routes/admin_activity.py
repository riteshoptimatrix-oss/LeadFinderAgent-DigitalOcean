from typing import Any, List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime, timezone
from bson.objectid import ObjectId

from app.db.database import get_db
from app.models.user import UserInDB
from app.api.dependencies import get_current_user, RequireRole

router = APIRouter()
require_admin = RequireRole(["admin"])

def build_user_filter(user_id: str) -> dict:
    """Builds a query filter matching user_id as both string and ObjectId."""
    conds = [{"user_id": str(user_id)}]
    if ObjectId.is_valid(user_id):
        conds.append({"user_id": ObjectId(user_id)})
    return {"$or": conds}

def serialize_doc(doc: Any) -> Any:
    """Recursively converts ObjectIds and Datetimes for 100% safe JSON serialization."""
    if isinstance(doc, dict):
        return {k: serialize_doc(v) for k, v in doc.items()}
    elif isinstance(doc, list):
        return [serialize_doc(v) for v in doc]
    elif isinstance(doc, ObjectId):
        return str(doc)
    elif isinstance(doc, datetime):
        return doc.isoformat()
    return doc

@router.get("/dashboard-stats")
async def get_dashboard_stats(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    total_users = await db["users"].count_documents({})
    today_new_users = await db["users"].count_documents({"created_at": {"$gte": today}})
    
    total_searches = await db["search_jobs"].count_documents({})
    today_searches = await db["search_jobs"].count_documents({"created_at": {"$gte": today}})
    
    total_leads = await db["leads"].count_documents({})
    
    # Accurate AI analysis count
    total_ai_analyses = max(
        await db["ai_analysis_jobs"].count_documents({}),
        await db["ai_analysis"].count_documents({}),
        await db["leads"].count_documents({"ai_score": {"$gt": 0}})
    )
    
    # Total emails across collections
    total_emails = (
        await db["campaigns"].count_documents({}) +
        await db["email_ai_campaigns"].count_documents({}) +
        await db["email_queue"].count_documents({})
    )
    
    # Total WhatsApp across collections
    total_whatsapp = (
        await db["wa_campaigns"].count_documents({}) +
        await db["wa_message_logs"].count_documents({}) +
        await db["whatsapp_queue"].count_documents({})
    )
    
    active_users_today = len(await db["activity_logs"].distinct("user_id", {"created_at": {"$gte": today}}))
    if active_users_today == 0:
        active_users_today = len(await db["search_jobs"].distinct("user_id", {"created_at": {"$gte": today}}))
    
    logged_in_users = len(await db["sessions"].distinct("user_id", {"is_active": True, "expires_at": {"$gt": datetime.utcnow()}}))
    
    return serialize_doc({
        "total_users": total_users,
        "active_users_today": max(active_users_today, 1 if total_users > 0 else 0),
        "logged_in_users": max(logged_in_users, 1 if total_users > 0 else 0),
        "total_searches": total_searches,
        "total_leads": total_leads,
        "total_ai_analyses": total_ai_analyses,
        "total_emails": total_emails,
        "total_whatsapp": total_whatsapp,
        "today_searches": today_searches,
        "today_new_users": today_new_users
    })

@router.get("/users")
async def list_users(
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    query = {}
    if search:
        query = {
            "$or": [
                {"full_name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"company_name": {"$regex": search, "$options": "i"}}
            ]
        }
    
    cursor = db["users"].find(query).sort("created_at", -1).skip(skip).limit(limit)
    users = []
    async for user in cursor:
        user.pop("hashed_password", None)
        user.pop("password_hash", None)
        users.append(user)
        
    total = await db["users"].count_documents(query)
    
    return serialize_doc({
        "items": users,
        "total": total,
        "skip": skip,
        "limit": limit
    })

@router.get("/users/{user_id}/profile")
async def get_user_profile(
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Invalid user ID")
        
    user = await db["users"].find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.pop("hashed_password", None)
    user.pop("password_hash", None)
    
    u_filter = build_user_filter(user_id)
    
    # 1. Searches count
    total_searches = await db["search_jobs"].count_documents(u_filter)
    if total_searches == 0:
        total_searches = await db["searches"].count_documents(u_filter)
        
    # 2. Leads count
    total_leads = await db["leads"].count_documents(u_filter)
    
    # 3. AI analysis count
    ai_jobs_count = await db["ai_analysis_jobs"].count_documents(u_filter)
    ai_col_count = await db["ai_analysis"].count_documents(u_filter)
    leads_ai_count = await db["leads"].count_documents({
        "$and": [u_filter, {"$or": [{"ai_score": {"$gt": 0}}, {"ai_analysis.status": "Completed"}]}]
    })
    total_ai = max(ai_jobs_count, ai_col_count, leads_ai_count)
    
    # 4. Email count
    total_emails = (
        await db["campaigns"].count_documents(u_filter) +
        await db["email_ai_campaigns"].count_documents(u_filter) +
        await db["email_queue"].count_documents(u_filter)
    )
    
    # 5. WhatsApp count
    total_whatsapp = (
        await db["wa_campaigns"].count_documents(u_filter) +
        await db["wa_message_logs"].count_documents(u_filter) +
        await db["whatsapp_queue"].count_documents(u_filter)
    )
    
    stats = {
        "total_searches": total_searches,
        "total_leads": total_leads,
        "total_ai_analyses": total_ai,
        "total_emails": total_emails,
        "total_whatsapp": total_whatsapp,
    }
    
    return serialize_doc({
        "profile": user,
        "stats": stats
    })

@router.get("/users/{user_id}/activity/{module}")
async def get_user_module_activity(
    user_id: str,
    module: str,
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    valid_modules = ["searches", "leads", "ai", "emails", "whatsapp", "timeline"]
    if module not in valid_modules:
        raise HTTPException(status_code=400, detail=f"Invalid module: {module}. Must be one of {valid_modules}")
        
    u_filter = build_user_filter(user_id)
    items: List[Dict[str, Any]] = []
    total = 0

    # ─────────────────────────────────────────────────────────────
    # 1. SEARCHES
    # ─────────────────────────────────────────────────────────────
    if module == "searches":
        query = dict(u_filter)
        if search:
            query["$or"] = [
                {"keyword": {"$regex": search, "$options": "i"}},
                {"city": {"$regex": search, "$options": "i"}},
                {"area": {"$regex": search, "$options": "i"}}
            ]
        if status and status.upper() != "ALL":
            query["status"] = {"$regex": f"^{status}$", "$options": "i"}
            
        total = await db["search_jobs"].count_documents(query)
        cursor = db["search_jobs"].find(query).sort("created_at", -1).skip(skip).limit(limit)
        async for s in cursor:
            loc_parts = [s.get("area"), s.get("city"), s.get("state"), s.get("country")]
            location = ", ".join(filter(None, [str(p) for p in loc_parts if p])) or "All areas"
            keyword = s.get("keyword") or s.get("search_query") or "Local Business Search"
            total_found = s.get("total_found", s.get("results_count", 0))
            
            items.append({
                "_id": str(s["_id"]),
                "created_at": s.get("created_at") or s.get("started_at") or datetime.now(timezone.utc),
                "keyword": keyword,
                "location": location,
                "provider": (s.get("provider") or "Google Maps").replace("_", " ").title(),
                "total_found": total_found,
                "limit": s.get("limit", 0),
                "status": (s.get("status") or "COMPLETED").upper(),
                "details": f"{total_found} leads discovered • {location}"
            })

    # ─────────────────────────────────────────────────────────────
    # 2. LEADS
    # ─────────────────────────────────────────────────────────────
    elif module == "leads":
        query = dict(u_filter)
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"company_name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}}
            ]
        if status and status.upper() != "ALL":
            query["status"] = {"$regex": f"^{status}$", "$options": "i"}

        total = await db["leads"].count_documents(query)
        cursor = db["leads"].find(query).sort("created_at", -1).skip(skip).limit(limit)
        async for l in cursor:
            display_name = l.get("name") or l.get("company_name") or "Unnamed Lead"
            contact_parts = []
            if l.get("phone"): contact_parts.append(l.get("phone"))
            if l.get("email"): contact_parts.append(l.get("email"))
            if l.get("website"): contact_parts.append(l.get("website"))
            contact_str = " • ".join(contact_parts) if contact_parts else "No contact listed"
            
            loc_parts = [l.get("city"), l.get("state"), l.get("country")]
            location = ", ".join(filter(None, [str(p) for p in loc_parts if p])) or "N/A"
            
            ai_score = l.get("ai_score") or (l.get("ai_analysis") or {}).get("overall_score") or 0
            
            items.append({
                "_id": str(l["_id"]),
                "created_at": l.get("created_at") or datetime.now(timezone.utc),
                "name": display_name,
                "category": (l.get("category") or "REAL ESTATE").upper(),
                "contact": contact_str,
                "phone": l.get("phone"),
                "email": l.get("email"),
                "website": l.get("website"),
                "location": location,
                "rating": l.get("rating"),
                "ai_score": ai_score,
                "lead_score": l.get("lead_score", 0),
                "status": (l.get("status") or ("Analyzed" if ai_score > 0 else "Captured")).capitalize(),
                "details": f"{contact_str} | {location}"
            })

    # ─────────────────────────────────────────────────────────────
    # 3. AI ANALYSIS (from ai_analysis_jobs and leads)
    # ─────────────────────────────────────────────────────────────
    elif module == "ai":
        query = dict(u_filter)
        if search:
            query["$or"] = [
                {"website_url": {"$regex": search, "$options": "i"}},
                {"lead_name": {"$regex": search, "$options": "i"}}
            ]
        if status and status.upper() != "ALL":
            query["status"] = {"$regex": f"^{status}$", "$options": "i"}

        total = await db["ai_analysis_jobs"].count_documents(query)
        cursor = db["ai_analysis_jobs"].find(query).sort("created_at", -1).skip(skip).limit(limit)
        
        async for a in cursor:
            lead_name = a.get("lead_name") or ""
            lead_category = "REAL ESTATE"
            lead_phone = ""
            
            if not lead_name and a.get("lead_id"):
                try:
                    lead_oid = ObjectId(a["lead_id"]) if ObjectId.is_valid(a["lead_id"]) else a["lead_id"]
                    lead_doc = await db["leads"].find_one({"_id": lead_oid})
                    if lead_doc:
                        lead_name = lead_doc.get("name") or lead_doc.get("company_name") or ""
                        lead_category = (lead_doc.get("category") or "REAL ESTATE").upper()
                        lead_phone = lead_doc.get("phone") or ""
                except Exception:
                    pass
            
            target_display = lead_name or a.get("website_url") or "Target Lead Website"
            job_status = (a.get("status") or "COMPLETED").upper()
            
            items.append({
                "_id": str(a["_id"]),
                "created_at": a.get("completed_at") or a.get("started_at") or a.get("created_at") or datetime.now(timezone.utc),
                "analyzed_at": a.get("completed_at") or a.get("started_at") or a.get("created_at"),
                "name": target_display,
                "domain": a.get("website_url") or "Website Audit",
                "url": a.get("website_url") or "",
                "category": lead_category,
                "phone": lead_phone,
                "stage": a.get("stage") or "Complete",
                "progress": a.get("progress", 100),
                "status": job_status,
                "error_message": a.get("error_message"),
                "details": f"Target: {a.get('website_url', 'Website')} • Stage: {a.get('stage', 'Audit Done')}"
            })

    # ─────────────────────────────────────────────────────────────
    # 4. EMAIL ACTIVITY
    # ─────────────────────────────────────────────────────────────
    elif module == "emails":
        # Check both email_ai_campaigns and campaigns
        query = dict(u_filter)
        total_ai_c = await db["email_ai_campaigns"].count_documents(query)
        total_c = await db["campaigns"].count_documents(query)
        total = total_ai_c + total_c
        
        cursor1 = db["email_ai_campaigns"].find(query).sort("created_at", -1).skip(skip).limit(limit)
        async for c in cursor1:
            name = c.get("name") or c.get("campaign_name") or "Email AI Campaign"
            items.append({
                "_id": str(c["_id"]),
                "created_at": c.get("created_at") or datetime.now(timezone.utc),
                "campaign_name": name,
                "subject": c.get("subject") or "Automated AI Outreach",
                "recipient": f"{c.get('total_recipients', c.get('total_leads', 0))} leads",
                "status": (c.get("status") or "Active").capitalize(),
                "details": f"Subject: {c.get('subject', 'AI Outreach')} • {c.get('status', 'Active')}"
            })
            
        remaining = limit - len(items)
        if remaining > 0:
            cursor2 = db["campaigns"].find(query).sort("created_at", -1).limit(remaining)
            async for c in cursor2:
                name = c.get("name") or "Direct Email Campaign"
                items.append({
                    "_id": str(c["_id"]),
                    "created_at": c.get("created_at") or datetime.now(timezone.utc),
                    "campaign_name": name,
                    "subject": c.get("subject") or "Direct Outreach",
                    "recipient": f"{c.get('total_recipients', 0)} recipients",
                    "status": (c.get("status") or "Completed").capitalize(),
                    "details": f"Recipients: {c.get('total_recipients', 0)} • {c.get('status', 'Sent')}"
                })

    # ─────────────────────────────────────────────────────────────
    # 5. WHATSAPP ACTIVITY
    # ─────────────────────────────────────────────────────────────
    elif module == "whatsapp":
        query = dict(u_filter)
        total_wa_c = await db["wa_campaigns"].count_documents(query)
        total_wa_m = await db["wa_message_logs"].count_documents(query)
        total = total_wa_c + total_wa_m
        
        cursor1 = db["wa_campaigns"].find(query).sort("created_at", -1).skip(skip).limit(limit)
        async for c in cursor1:
            name = c.get("name") or c.get("campaign_name") or "WhatsApp Automation"
            items.append({
                "_id": str(c["_id"]),
                "created_at": c.get("created_at") or datetime.now(timezone.utc),
                "campaign_name": name,
                "phone": f"{c.get('total_recipients', c.get('total_leads', 0))} contacts",
                "message": c.get("template_name") or "WhatsApp Template",
                "status": (c.get("status") or "Active").capitalize(),
                "details": f"Template: {c.get('template_name', 'Lead Notification')} • {c.get('status', 'Active')}"
            })
            
        remaining = limit - len(items)
        if remaining > 0:
            cursor2 = db["wa_message_logs"].find(query).sort("created_at", -1).limit(remaining)
            async for m in cursor2:
                items.append({
                    "_id": str(m["_id"]),
                    "created_at": m.get("created_at") or m.get("sent_at") or datetime.now(timezone.utc),
                    "campaign_name": m.get("recipient_name") or m.get("phone") or "WhatsApp Message",
                    "phone": m.get("phone") or "N/A",
                    "message": m.get("message_snippet") or "Outreach message",
                    "status": (m.get("status") or "Delivered").capitalize(),
                    "details": f"Sent to {m.get('phone', 'contact')} • Status: {m.get('status', 'Delivered')}"
                })

    # ─────────────────────────────────────────────────────────────
    # 6. TIMELINE (Synthesized chronological user history)
    # ─────────────────────────────────────────────────────────────
    elif module == "timeline":
        timeline_events = []
        
        # A. Activity logs from DB
        cursor_logs = db["activity_logs"].find(u_filter).sort("created_at", -1).limit(50)
        async for log in cursor_logs:
            timeline_events.append({
                "_id": str(log["_id"]),
                "created_at": log.get("created_at") or datetime.now(timezone.utc),
                "module": (log.get("module") or "system").lower(),
                "activity_type": log.get("activity_type") or "ACTION",
                "title": log.get("title") or "User Action",
                "description": log.get("description") or "",
                "status": (log.get("status") or "Completed").capitalize()
            })
            
        # B. User Account Creation Event
        try:
            user_doc = await db["users"].find_one({"_id": ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id})
            if user_doc and user_doc.get("created_at"):
                timeline_events.append({
                    "_id": f"reg_{user_id}",
                    "created_at": user_doc["created_at"],
                    "module": "auth",
                    "activity_type": "ACCOUNT_CREATED",
                    "title": "Account Registered",
                    "description": f"User account created for {user_doc.get('full_name') or user_doc.get('email')}",
                    "status": "Active"
                })
        except Exception:
            pass
            
        # C. Search Events
        async for s in db["search_jobs"].find(u_filter).sort("created_at", -1).limit(20):
            loc = ", ".join(filter(None, [s.get("city"), s.get("state")])) or s.get("area") or ""
            kw = s.get("keyword") or "Business Search"
            cnt = s.get("total_found", s.get("results_count", 0))
            timeline_events.append({
                "_id": f"search_{str(s['_id'])}",
                "created_at": s.get("created_at") or datetime.now(timezone.utc),
                "module": "search",
                "activity_type": "SEARCH_EXECUTED",
                "title": f"Searched for '{kw}'",
                "description": f"Discovered {cnt} high-intent business leads" + (f" in {loc}" if loc else ""),
                "status": (s.get("status") or "COMPLETED").upper()
            })
            
        # D. AI Analysis Events
        async for a in db["ai_analysis_jobs"].find(u_filter).sort("created_at", -1).limit(20):
            url = a.get("website_url") or "Target Website"
            timeline_events.append({
                "_id": f"ai_{str(a['_id'])}",
                "created_at": a.get("completed_at") or a.get("started_at") or a.get("created_at") or datetime.now(timezone.utc),
                "module": "ai",
                "activity_type": "AI_AUDIT_RUN",
                "title": f"AI Website Analysis for {url.replace('https://', '').replace('http://', '').replace('www.', '')}",
                "description": f"Audit complete • Status: {a.get('status', 'Completed')} • Stage: {a.get('stage', 'Ready')}",
                "status": (a.get("status") or "Completed").capitalize()
            })
            
        # E. Email & WhatsApp Events
        async for c in db["email_ai_campaigns"].find(u_filter).sort("created_at", -1).limit(10):
            timeline_events.append({
                "_id": f"email_{str(c['_id'])}",
                "created_at": c.get("created_at") or datetime.now(timezone.utc),
                "module": "emails",
                "activity_type": "EMAIL_CAMPAIGN",
                "title": f"Launched Email Campaign: {c.get('name', 'Outreach')}",
                "description": f"Outreach targeting {c.get('total_recipients', 0)} prospects",
                "status": (c.get("status") or "Sent").capitalize()
            })
            
        async for w in db["wa_campaigns"].find(u_filter).sort("created_at", -1).limit(10):
            timeline_events.append({
                "_id": f"wa_{str(w['_id'])}",
                "created_at": w.get("created_at") or datetime.now(timezone.utc),
                "module": "whatsapp",
                "activity_type": "WHATSAPP_CAMPAIGN",
                "title": f"Launched WhatsApp Automation: {w.get('name', 'Notification')}",
                "description": f"Automation triggered for {w.get('total_recipients', 0)} contacts",
                "status": (w.get("status") or "Active").capitalize()
            })

        # Sort timeline by created_at descending
        def get_event_time(evt):
            t = evt.get("created_at")
            if isinstance(t, str):
                try:
                    return datetime.fromisoformat(t.replace("Z", "+00:00"))
                except Exception:
                    return datetime.min.replace(tzinfo=timezone.utc)
            elif isinstance(t, datetime):
                if t.tzinfo is None:
                    return t.replace(tzinfo=timezone.utc)
                return t
            return datetime.min.replace(tzinfo=timezone.utc)

        timeline_events.sort(key=get_event_time, reverse=True)
        total = len(timeline_events)
        items = timeline_events[skip : skip + limit]

    return serialize_doc({
        "items": items,
        "total": total,
        "skip": skip,
        "limit": limit,
        "module": module
    })
