from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime, timedelta, timezone

from app.db.database import get_db
from app.models.user import UserInDB
from app.api.dependencies import get_current_user, RequireRole

router = APIRouter()
require_admin = RequireRole(["admin"])

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
    total_ai_analyses = await db["ai_analysis"].count_documents({})
    total_emails = await db["campaigns"].count_documents({})
    total_whatsapp = await db["wa_campaigns"].count_documents({})
    
    # Active users today (users who logged in today or had activity)
    active_users_today = len(await db["activity_logs"].distinct("user_id", {"created_at": {"$gte": today}}))
    
    # Logged in users (approximate based on active sessions)
    logged_in_users = len(await db["sessions"].distinct("user_id", {"is_active": True, "expires_at": {"$gt": datetime.utcnow()}}))
    
    return {
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
    }

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
        user["_id"] = str(user["_id"])
        if "hashed_password" in user:
            del user["hashed_password"]
        users.append(user)
        
    total = await db["users"].count_documents(query)
    
    return {
        "items": users,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.get("/users/{user_id}/profile")
async def get_user_profile(
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    from bson.objectid import ObjectId
    user = await db["users"].find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user["_id"] = str(user["_id"])
    if "hashed_password" in user:
        del user["hashed_password"]
        
    stats = {
        "total_searches": await db["search_jobs"].count_documents({"user_id": user_id}),
        "total_leads": await db["leads"].count_documents({"user_id": user_id}),
        "total_ai_analyses": await db["ai_analysis"].count_documents({"user_id": user_id}),
        "total_emails": await db["campaigns"].count_documents({"user_id": user_id}),
        "total_whatsapp": await db["wa_campaigns"].count_documents({"user_id": user_id}),
    }
    
    return {
        "profile": user,
        "stats": stats
    }

@router.get("/users/{user_id}/activity/{module}")
async def get_user_module_activity(
    user_id: str,
    module: str,
    skip: int = 0,
    limit: int = 50,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_admin: UserInDB = Depends(require_admin)
) -> Any:
    collection_map = {
        "searches": "search_jobs",
        "leads": "leads",
        "ai": "ai_analysis",
        "emails": "campaigns",
        "whatsapp": "wa_campaigns",
        "timeline": "activity_logs"
    }
    
    if module not in collection_map:
        raise HTTPException(status_code=400, detail="Invalid module")
        
    collection = collection_map[module]
    query = {"user_id": user_id}
    
    sort_field = "created_at"
    if module == "ai":
        sort_field = "analyzed_at"
        
    cursor = db[collection].find(query).sort(sort_field, -1).skip(skip).limit(limit)
    items = []
    async for item in cursor:
        if "_id" in item:
            item["_id"] = str(item["_id"])
        if "lead_id" in item:
            item["lead_id"] = str(item["lead_id"])
        items.append(item)
        
    total = await db[collection].count_documents(query)
    
    return {
        "items": items,
        "total": total,
        "skip": skip,
        "limit": limit
    }
