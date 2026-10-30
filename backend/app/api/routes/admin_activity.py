import logging
from typing import Any, List, Optional, Dict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson.objectid import ObjectId

from app.db.database import get_db, db_instance
from app.models.user import UserInDB
from app.api.dependencies import RequireRole

logger = logging.getLogger(__name__)

router = APIRouter()
require_admin = RequireRole(["admin", "ADMIN"])

def get_raw_db() -> AsyncIOMotorDatabase:
    """Ensure admin queries bypass tenant isolation and access full database."""
    if db_instance.db is not None:
        return db_instance.db
    db = get_db()
    if hasattr(db, "_db"):
        return db._db
    return db

def sanitize_doc(doc: Any) -> Any:
    """Recursively convert ObjectIds to strings and datetimes to ISO strings for safe JSON serialization."""
    if isinstance(doc, dict):
        cleaned = {}
        for k, v in doc.items():
            if isinstance(v, ObjectId):
                cleaned[k] = str(v)
            elif isinstance(v, datetime):
                cleaned[k] = v.isoformat()
            elif isinstance(v, (dict, list)):
                cleaned[k] = sanitize_doc(v)
            else:
                cleaned[k] = v
        return cleaned
    elif isinstance(doc, list):
        return [sanitize_doc(item) for item in doc]
    elif isinstance(doc, ObjectId):
        return str(doc)
    elif isinstance(doc, datetime):
        return doc.isoformat()
    return doc

def build_user_filter(user_id: str) -> Dict[str, Any]:
    """Match user_id whether stored as string or ObjectId in Mongo documents."""
    conditions = [{"user_id": user_id}]
    if ObjectId.is_valid(user_id):
        conditions.append({"user_id": ObjectId(user_id)})
        conditions.append({"created_by": user_id})
        conditions.append({"created_by": ObjectId(user_id)})
    return {"$or": conditions}

@router.get("/dashboard-stats")
async def get_dashboard_stats(
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    raw_db = get_raw_db()
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    total_users = await raw_db["users"].count_documents({})
    today_new_users = await raw_db["users"].count_documents({"created_at": {"$gte": today}})
    
    total_searches = await raw_db["search_jobs"].count_documents({})
    today_searches = await raw_db["search_jobs"].count_documents({"created_at": {"$gte": today}})
    
    total_leads = await raw_db["leads"].count_documents({})
    total_ai_analyses = await raw_db["ai_analysis_jobs"].count_documents({})
    total_emails = (await raw_db["email_ai_campaigns"].count_documents({})) + (await raw_db["email_campaigns"].count_documents({}))
    total_whatsapp = (await raw_db["wa_ai_campaigns"].count_documents({})) + (await raw_db["wa_campaigns"].count_documents({}))
    
    active_users_today = len(await raw_db["audit_logs"].distinct("user_id", {"created_at": {"$gte": today}}))
    logged_in_users = len(await raw_db["sessions"].distinct("user_id", {"is_active": True}))
    
    return sanitize_doc({
        "total_users": total_users,
        "active_users_today": active_users_today,
        "logged_in_users": logged_in_users,
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
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    raw_db = get_raw_db()
    query: Dict[str, Any] = {}
    if search:
        query = {
            "$or": [
                {"full_name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"company_name": {"$regex": search, "$options": "i"}}
            ]
        }
    
    cursor = raw_db["users"].find(query).sort("created_at", -1).skip(skip).limit(limit)
    users = []
    async for user in cursor:
        user["_id"] = str(user["_id"])
        if "hashed_password" in user:
            del user["hashed_password"]
        if "password_hash" in user:
            del user["password_hash"]
        users.append(user)
        
    total = await raw_db["users"].count_documents(query)
    
    return sanitize_doc({
        "items": users,
        "total": total,
        "skip": skip,
        "limit": limit
    })

@router.get("/users/{user_id}/profile")
async def get_user_profile(
    user_id: str,
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    raw_db = get_raw_db()
    
    user_query = {"_id": ObjectId(user_id)} if ObjectId.is_valid(user_id) else {"_id": user_id}
    user = await raw_db["users"].find_one(user_query)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user["_id"] = str(user["_id"])
    if "hashed_password" in user:
        del user["hashed_password"]
    if "password_hash" in user:
        del user["password_hash"]
        
    user_filter = build_user_filter(user_id)
    
    total_searches = await raw_db["search_jobs"].count_documents(user_filter)
    total_leads = await raw_db["leads"].count_documents(user_filter)
    total_ai_analyses = await raw_db["ai_analysis_jobs"].count_documents(user_filter)
    total_emails = (await raw_db["email_ai_campaigns"].count_documents(user_filter)) + (await raw_db["email_campaigns"].count_documents(user_filter))
    total_whatsapp = (await raw_db["wa_ai_campaigns"].count_documents(user_filter)) + (await raw_db["wa_campaigns"].count_documents(user_filter))
    
    stats = {
        "total_searches": total_searches,
        "total_leads": total_leads,
        "total_ai_analyses": total_ai_analyses,
        "total_emails": total_emails,
        "total_whatsapp": total_whatsapp,
    }
    
    return sanitize_doc({
        "profile": user,
        "stats": stats
    })

@router.get("/users/{user_id}/activity/{module}")
async def get_user_module_activity(
    user_id: str,
    module: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    raw_db = get_raw_db()
    user_filter = build_user_filter(user_id)
    
    # -------------------------------------------------------------
    # 1. TIMELINE MODULE
    # -------------------------------------------------------------
    if module == "timeline":
        timeline_events: List[Dict[str, Any]] = []
        
        # User Registration
        user_query = {"_id": ObjectId(user_id)} if ObjectId.is_valid(user_id) else {"_id": user_id}
        user_doc = await raw_db["users"].find_one(user_query)
        if user_doc and user_doc.get("created_at"):
            timeline_events.append({
                "_id": f"reg_{user_id}",
                "title": "Account Registered",
                "module": "auth",
                "activity_type": "USER_REGISTER",
                "description": f"User account created for {user_doc.get('email', 'user')}",
                "status": "COMPLETED",
                "created_at": user_doc["created_at"],
                "metadata": {"email": user_doc.get("email"), "company": user_doc.get("company_name")}
            })
            
        # Audit Logs (Logins, Security, Profile updates)
        audit_cursor = raw_db["audit_logs"].find(user_filter).sort("created_at", -1).limit(50)
        async for audit in audit_cursor:
            timeline_events.append({
                "_id": str(audit.get("_id")),
                "title": f"Action: {audit.get('action', 'Activity')}",
                "module": "security",
                "activity_type": audit.get("action", "SECURITY_LOG"),
                "description": f"IP: {audit.get('ip_address', '127.0.0.1')} - {audit.get('user_agent', 'Session')[:60] if audit.get('user_agent') else 'Authentication event'}",
                "status": "COMPLETED",
                "created_at": audit.get("created_at") or datetime.now(timezone.utc),
                "metadata": audit.get("details") or {}
            })
            
        # Activity Logs (Generic app events)
        activity_cursor = raw_db["activity_logs"].find(user_filter).sort("created_at", -1).limit(50)
        async for act in activity_cursor:
            timeline_events.append({
                "_id": str(act.get("_id")),
                "title": act.get("title") or act.get("activity_type") or "User Action",
                "module": act.get("module", "app"),
                "activity_type": act.get("activity_type", "ACTIVITY"),
                "description": act.get("description") or "Operation executed",
                "status": "COMPLETED",
                "created_at": act.get("created_at") or datetime.now(timezone.utc),
                "metadata": act.get("metadata") or {}
            })
            
        # Search Jobs Events
        search_cursor = raw_db["search_jobs"].find(user_filter).sort("created_at", -1).limit(30)
        async for s in search_cursor:
            loc = ", ".join(filter(None, [s.get("city"), s.get("state"), s.get("country")]))
            timeline_events.append({
                "_id": f"search_{s.get('_id')}",
                "title": f"Lead Search: {s.get('keyword', 'Query')}",
                "module": "search",
                "activity_type": "SEARCH_JOB",
                "description": f"Search executed for '{s.get('keyword', 'Leads')}' in {loc or 'Target Region'} ({s.get('completed_leads', 0)} leads gathered)",
                "status": s.get("status", "COMPLETED"),
                "created_at": s.get("created_at") or datetime.now(timezone.utc),
                "metadata": {
                    "provider": s.get("provider", "google_maps"),
                    "completed_leads": s.get("completed_leads", 0),
                    "total_found": s.get("total_found", 0)
                }
            })
            
        # AI Analysis Jobs Events
        ai_cursor = raw_db["ai_analysis_jobs"].find(user_filter).sort("created_at", -1).limit(30)
        async for aj in ai_cursor:
            score = aj.get("overall_ai_score") or aj.get("ui_score") or aj.get("seo_score")
            score_str = f"Score: {score}/100" if score is not None else "Analyzed"
            timeline_events.append({
                "_id": f"ai_{aj.get('_id')}",
                "title": f"AI Audit: {aj.get('website_url', 'Lead Website')}",
                "module": "ai_analysis",
                "activity_type": "AI_ANALYSIS",
                "description": f"Deep website & SEO intelligence audit ({score_str}, status: {aj.get('status', 'COMPLETED')})",
                "status": aj.get("status", "COMPLETED"),
                "created_at": aj.get("created_at") or datetime.now(timezone.utc),
                "metadata": {
                    "website_url": aj.get("website_url"),
                    "score": score,
                    "pages": aj.get("total_pages", 0)
                }
            })
            
        # Email Campaigns Events
        email_cursor = raw_db["email_ai_campaigns"].find(user_filter).sort("created_at", -1).limit(20)
        async for ec in email_cursor:
            timeline_events.append({
                "_id": f"email_{ec.get('_id')}",
                "title": f"Email Campaign: {ec.get('campaign_name', 'Broadcast')}",
                "module": "email",
                "activity_type": "EMAIL_CAMPAIGN",
                "description": f"Subject: '{ec.get('subject', 'Outreach')}' - {ec.get('sent_count', 0)} messages dispatched",
                "status": ec.get("status", "COMPLETED"),
                "created_at": ec.get("created_at") or datetime.now(timezone.utc),
                "metadata": ec
            })
            
        # WhatsApp Campaigns Events
        wa_cursor = raw_db["wa_ai_campaigns"].find(user_filter).sort("created_at", -1).limit(20)
        async for wc in wa_cursor:
            timeline_events.append({
                "_id": f"wa_{wc.get('_id')}",
                "title": f"WhatsApp Campaign: {wc.get('campaign_name', 'Broadcast')}",
                "module": "whatsapp",
                "activity_type": "WHATSAPP_CAMPAIGN",
                "description": f"Template: '{wc.get('template_name', 'Message')}' - {wc.get('sent_count', 0)} messages delivered",
                "status": wc.get("status", "COMPLETED"),
                "created_at": wc.get("created_at") or datetime.now(timezone.utc),
                "metadata": wc
            })
            
        # Sort newest first
        timeline_events.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
        total_events = len(timeline_events)
        paginated_events = timeline_events[skip:skip + limit]
        
        return sanitize_doc({
            "items": paginated_events,
            "total": total_events,
            "skip": skip,
            "limit": limit
        })

    # -------------------------------------------------------------
    # 2. SEARCHES MODULE
    # -------------------------------------------------------------
    elif module == "searches":
        query = dict(user_filter)
        if search:
            query["$and"] = [
                user_filter,
                {"$or": [
                    {"keyword": {"$regex": search, "$options": "i"}},
                    {"city": {"$regex": search, "$options": "i"}},
                    {"state": {"$regex": search, "$options": "i"}},
                    {"country": {"$regex": search, "$options": "i"}}
                ]}
            ]
            
        cursor = raw_db["search_jobs"].find(query).sort("created_at", -1).skip(skip).limit(limit)
        items = []
        async for doc in cursor:
            loc_parts = filter(None, [doc.get("city"), doc.get("state"), doc.get("country")])
            doc["location"] = ", ".join(loc_parts) or "All Locations"
            doc["details"] = f"{doc.get('keyword', 'Search')} in {doc['location']} ({doc.get('completed_leads', 0)} leads gathered)"
            items.append(doc)
            
        total = await raw_db["search_jobs"].count_documents(query)
        return sanitize_doc({
            "items": items,
            "total": total,
            "skip": skip,
            "limit": limit
        })

    # -------------------------------------------------------------
    # 3. LEADS MODULE
    # -------------------------------------------------------------
    elif module == "leads":
        query = dict(user_filter)
        if search:
            query["$and"] = [
                user_filter,
                {"$or": [
                    {"name": {"$regex": search, "$options": "i"}},
                    {"company_name": {"$regex": search, "$options": "i"}},
                    {"phone": {"$regex": search, "$options": "i"}},
                    {"email": {"$regex": search, "$options": "i"}},
                    {"city": {"$regex": search, "$options": "i"}}
                ]}
            ]
            
        cursor = raw_db["leads"].find(query).sort("created_at", -1).skip(skip).limit(limit)
        items = []
        async for doc in cursor:
            doc["status"] = doc.get("processing_status") or doc.get("status") or "VERIFIED"
            loc = ", ".join(filter(None, [doc.get("city"), doc.get("state"), doc.get("country")]))
            doc["location"] = loc or doc.get("address") or "N/A"
            doc["details"] = f"{doc.get('name') or doc.get('company_name', 'Lead')} • {doc.get('phone') or doc.get('email') or 'No direct phone'}"
            items.append(doc)
            
        total = await raw_db["leads"].count_documents(query)
        return sanitize_doc({
            "items": items,
            "total": total,
            "skip": skip,
            "limit": limit
        })

    # -------------------------------------------------------------
    # 4. AI ANALYSIS MODULE
    # -------------------------------------------------------------
    elif module == "ai":
        query = dict(user_filter)
        if search:
            query["$and"] = [
                user_filter,
                {"$or": [
                    {"website_url": {"$regex": search, "$options": "i"}},
                    {"domain": {"$regex": search, "$options": "i"}}
                ]}
            ]
            
        cursor = raw_db["ai_analysis_jobs"].find(query).sort("created_at", -1).skip(skip).limit(limit)
        items = []
        async for doc in cursor:
            # Lookup lead name if lead_id present
            lead_name = None
            if doc.get("lead_id"):
                try:
                    lead_query = {"_id": ObjectId(doc["lead_id"])} if ObjectId.is_valid(doc["lead_id"]) else {"_id": doc["lead_id"]}
                    l = await raw_db["leads"].find_one(lead_query, {"name": 1, "company_name": 1})
                    if l:
                        lead_name = l.get("name") or l.get("company_name")
                except Exception:
                    pass
                    
            doc["lead_name"] = lead_name or doc.get("website_url") or "Analyzed Website"
            score = doc.get("overall_ai_score") or doc.get("ui_score") or doc.get("seo_score")
            doc["score"] = score
            doc["details"] = f"{doc['lead_name']} (Score: {score}/100)" if score is not None else doc['lead_name']
            doc["status"] = doc.get("status", "COMPLETED")
            items.append(doc)
            
        total = await raw_db["ai_analysis_jobs"].count_documents(query)
        return sanitize_doc({
            "items": items,
            "total": total,
            "skip": skip,
            "limit": limit
        })

    # -------------------------------------------------------------
    # 5. EMAILS MODULE
    # -------------------------------------------------------------
    elif module in ["emails", "email"]:
        # Query email_ai_campaigns and email_campaigns
        cursor1 = raw_db["email_ai_campaigns"].find(user_filter).sort("created_at", -1).skip(skip).limit(limit)
        items = []
        async for doc in cursor1:
            doc["campaign_name"] = doc.get("campaign_name") or doc.get("title") or "Email AI Campaign"
            doc["details"] = f"{doc['campaign_name']} - Subject: '{doc.get('subject', 'N/A')}' ({doc.get('sent_count', 0)} sent)"
            doc["status"] = doc.get("status", "COMPLETED")
            items.append(doc)
            
        if len(items) < limit:
            cursor2 = raw_db["email_campaigns"].find(user_filter).sort("created_at", -1).skip(skip).limit(limit - len(items))
            async for doc in cursor2:
                doc["campaign_name"] = doc.get("campaign_name") or doc.get("title") or "Email Campaign"
                doc["details"] = f"{doc['campaign_name']} - Subject: '{doc.get('subject', 'N/A')}'"
                doc["status"] = doc.get("status", "COMPLETED")
                items.append(doc)
                
        total1 = await raw_db["email_ai_campaigns"].count_documents(user_filter)
        total2 = await raw_db["email_campaigns"].count_documents(user_filter)
        total = total1 + total2
        
        return sanitize_doc({
            "items": items,
            "total": total,
            "skip": skip,
            "limit": limit
        })

    # -------------------------------------------------------------
    # 6. WHATSAPP MODULE
    # -------------------------------------------------------------
    elif module in ["whatsapp", "wa"]:
        cursor1 = raw_db["wa_ai_campaigns"].find(user_filter).sort("created_at", -1).skip(skip).limit(limit)
        items = []
        async for doc in cursor1:
            doc["campaign_name"] = doc.get("campaign_name") or "WhatsApp AI Campaign"
            doc["details"] = f"{doc['campaign_name']} - Template: '{doc.get('template_name', 'General')}' ({doc.get('sent_count', 0)} sent)"
            doc["status"] = doc.get("status", "COMPLETED")
            items.append(doc)
            
        if len(items) < limit:
            cursor2 = raw_db["wa_campaigns"].find(user_filter).sort("created_at", -1).skip(skip).limit(limit - len(items))
            async for doc in cursor2:
                doc["campaign_name"] = doc.get("campaign_name") or "WhatsApp Campaign"
                doc["details"] = f"{doc['campaign_name']} ({doc.get('sent_count', 0)} sent)"
                doc["status"] = doc.get("status", "COMPLETED")
                items.append(doc)
                
        total1 = await raw_db["wa_ai_campaigns"].count_documents(user_filter)
        total2 = await raw_db["wa_campaigns"].count_documents(user_filter)
        total = total1 + total2
        
        return sanitize_doc({
            "items": items,
            "total": total,
            "skip": skip,
            "limit": limit
        })

    else:
        raise HTTPException(status_code=400, detail=f"Invalid activity module: {module}")
