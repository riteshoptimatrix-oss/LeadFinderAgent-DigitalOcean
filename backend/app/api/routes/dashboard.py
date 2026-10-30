from fastapi import APIRouter, Depends
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import UserInDB
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/stats")
async def get_dashboard_stats(
    current_user: UserInDB = Depends(get_current_user),
    db=Depends(get_db)
):
    try:
        is_admin = getattr(current_user, "role", "").upper() == "ADMIN"
        user_filter = {} if is_admin else {
            "$or": [
                {"user_id": str(current_user.id)},
                {"user_id": ObjectId(str(current_user.id)) if ObjectId.is_valid(str(current_user.id)) else str(current_user.id)}
            ]
        }

        total_searches = await db["search_jobs"].count_documents(user_filter)
        total_leads = await db["leads"].count_documents(user_filter)
        
        today_utc = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_naive = today_utc.replace(tzinfo=None)
        today_clause = {
            "$or": [
                {"created_at": {"$gte": today_utc}},
                {"created_at": {"$gte": today_naive}},
                {"created_at": {"$gte": today_naive.isoformat()}}
            ]
        }
        today_query = {"$and": [user_filter, today_clause]} if user_filter else today_clause
        today_leads = await db["leads"].count_documents(today_query)
        
        act_filter = {} if is_admin else {"user_id": str(current_user.id)}
        emails_sent = await db["activity_logs"].count_documents({**act_filter, "action": "EMAIL_SENT"})
        wa_sent = await db["activity_logs"].count_documents({**act_filter, "action": "WA_SENT"})
        
        camp_filter = {} if is_admin else {"user_id": str(current_user.id)}
        active_campaigns = await db["campaigns"].count_documents({**camp_filter, "status": "RUNNING"})
        
        return {
            "total_searches": total_searches,
            "total_leads": total_leads,
            "today_leads": today_leads,
            "emails_sent": emails_sent,
            "wa_sent": wa_sent,
            "active_campaigns": active_campaigns
        }
    except Exception as e:
        logger.error(f"Error getting dashboard stats: {repr(e)}")
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
        is_admin = getattr(current_user, "role", "").upper() == "ADMIN"
        user_filter = {} if is_admin else {
            "$or": [
                {"user_id": str(current_user.id)},
                {"user_id": ObjectId(str(current_user.id)) if ObjectId.is_valid(str(current_user.id)) else str(current_user.id)}
            ]
        }
        
        # Recent searches from search_jobs
        cursor = db["search_jobs"].find(user_filter).sort("created_at", -1).limit(5)
        recent_searches = []
        async for search in cursor:
            search["_id"] = str(search["_id"])
            recent_searches.append(search)

        # Top Categories
        pipeline_cat = []
        if user_filter:
            pipeline_cat.append({"$match": user_filter})
        pipeline_cat.extend([
            {"$group": {"_id": "$category", "value": {"$sum": 1}}},
            {"$sort": {"value": -1}},
            {"$limit": 5},
            {"$project": {"name": "$_id", "value": 1, "_id": 0}}
        ])
        top_categories = []
        async for doc in db["leads"].aggregate(pipeline_cat):
            if doc.get("name"):
                top_categories.append(doc)

        # Country Stats
        pipeline_country = []
        if user_filter:
            pipeline_country.append({"$match": user_filter})
        pipeline_country.extend([
            {"$group": {"_id": "$country", "value": {"$sum": 1}}},
            {"$sort": {"value": -1}},
            {"$limit": 5},
            {"$project": {"name": "$_id", "value": 1, "_id": 0}}
        ])
        country_stats = []
        async for doc in db["leads"].aggregate(pipeline_country):
            if doc.get("name"):
                country_stats.append(doc)

        # Recent Activity (Last 7 days: Pipeline Growth & Discovery Velocity)
        now = datetime.now(timezone.utc)
        recent_activity = []
        for i in range(6, -1, -1):
            d = now - timedelta(days=i)
            start_utc = d.replace(hour=0, minute=0, second=0, microsecond=0)
            end_utc = start_utc + timedelta(days=1)
            start_naive = start_utc.replace(tzinfo=None)
            end_naive = end_utc.replace(tzinfo=None)

            date_clause = {
                "$or": [
                    {"created_at": {"$gte": start_utc, "$lt": end_utc}},
                    {"created_at": {"$gte": start_naive, "$lt": end_naive}},
                    {"created_at": {"$gte": start_naive.isoformat(), "$lt": end_naive.isoformat()}}
                ]
            }
            lead_query = {"$and": [user_filter, date_clause]} if user_filter else date_clause
            discovered_count = await db["leads"].count_documents(lead_query)

            # AI Qualified prospects: completed analysis, status='qualified', or AI score >= 50
            qual_query = {
                "$and": [
                    lead_query,
                    {
                        "$or": [
                            {"status": {"$in": ["qualified", "Qualified"]}},
                            {"ai_score": {"$gte": 50}},
                            {"ai_analysis.overall_score": {"$gte": 50}},
                            {"ai_analysis.overall_ai_score": {"$gte": 50}},
                            {"ai_analysis.analysis_status": {"$in": ["COMPLETED", "completed", "PARTIAL_SUCCESS", "partial_success"]}}
                        ]
                    }
                ]
            }
            qualified_count = await db["leads"].count_documents(qual_query)

            recent_activity.append({
                "date": d.strftime("%a"),
                "label": d.strftime("%a, %b %d"),
                "full_date": d.strftime("%Y-%m-%d"),
                "leads": discovered_count,
                "qualified": qualified_count
            })

        return {
            "recent_activity": recent_activity,
            "recent_searches": recent_searches,
            "top_categories": top_categories,
            "country_stats": country_stats
        }
    except Exception as e:
        logger.error(f"Error getting dashboard charts: {repr(e)}")
        return {
            "recent_activity": [],
            "recent_searches": [],
            "top_categories": [],
            "country_stats": []
        }
