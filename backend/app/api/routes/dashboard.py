from fastapi import APIRouter, Depends
from datetime import datetime, timedelta, timezone
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import UserInDB

router = APIRouter()

@router.get("/stats")
async def get_dashboard_stats(
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    try:
        from app.repositories.search_repository import SearchRepository
        search_repo = SearchRepository(db)
        total_searches = await search_repo.count_searches(user_id=current_user.id)
        total_leads = await db["leads"].count_documents({"user_id": current_user.id})
        
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_leads = await db["leads"].count_documents({"user_id": current_user.id, "created_at": {"$gte": today}})
        
        emails_sent = await db["activity_logs"].count_documents({"user_id": current_user.id, "action": "EMAIL_SENT"})
        wa_sent = await db["activity_logs"].count_documents({"user_id": current_user.id, "action": "WA_SENT"})
        
        active_campaigns = await db["campaigns"].count_documents({"user_id": current_user.id, "status": "RUNNING"})
        
        return {
            "total_searches": total_searches,
            "total_leads": total_leads,
            "today_leads": today_leads,
            "emails_sent": emails_sent,
            "wa_sent": wa_sent,
            "active_campaigns": active_campaigns
        }
    except Exception:
        return {
            "total_searches": 0,
            "total_leads": 0,
            "today_leads": 0,
            "emails_sent": 0,
            "wa_sent": 0,
            "active_campaigns": 0
        }

@router.get("/charts")
async def get_dashboard_charts(
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    try:
        from app.repositories.search_repository import SearchRepository
        search_repo = SearchRepository(db)
        
        # Recent searches
        searches = await search_repo.list_searches(user_id=current_user.id, limit=5)
        recent_searches = []
        for search in searches:
            search["_id"] = str(search["_id"])
            recent_searches.append(search)

        # Top Categories
        pipeline_cat = [
            {"$match": {"user_id": current_user.id}},
            {"$group": {"_id": "$category", "value": {"$sum": 1}}},
            {"$sort": {"value": -1}},
            {"$limit": 5},
            {"$project": {"name": "$_id", "value": 1, "_id": 0}}
        ]
        top_categories = []
        async for doc in db["leads"].aggregate(pipeline_cat):
            if doc.get("name"):
                top_categories.append(doc)

        # Country Stats
        pipeline_country = [
            {"$match": {"user_id": current_user.id}},
            {"$group": {"_id": "$country", "value": {"$sum": 1}}},
            {"$sort": {"value": -1}},
            {"$limit": 5},
            {"$project": {"name": "$_id", "value": 1, "_id": 0}}
        ]
        country_stats = []
        async for doc in db["leads"].aggregate(pipeline_country):
            if doc.get("name"):
                country_stats.append(doc)

        # Recent Activity (Last 7 days)
        recent_activity = []
        for i in range(6, -1, -1):
            date = datetime.now(timezone.utc) - timedelta(days=i)
            start = date.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
            count = await db["leads"].count_documents({
                "user_id": current_user.id,
                "created_at": {"$gte": start, "$lt": end}
            })
            recent_activity.append({
                "date": date.strftime("%b %d"),
                "leads": count
            })

        return {
            "recent_activity": recent_activity,
            "recent_searches": recent_searches,
            "top_categories": top_categories,
            "country_stats": country_stats
        }
    except Exception:
        return {
            "recent_activity": [],
            "recent_searches": [],
            "top_categories": [],
            "country_stats": []
        }
