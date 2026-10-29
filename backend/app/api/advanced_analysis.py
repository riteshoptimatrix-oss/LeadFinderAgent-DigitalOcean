from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from app.db.database import get_db
from app.models.advanced_analysis import AdvancedAnalysisStartRequest

router = APIRouter()

@router.post("/bulk-start")
async def start_advanced_analysis(
    request: AdvancedAnalysisStartRequest,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Start advanced AI analysis for selected leads with websites"""
    
    # Build query to find eligible leads
    query: Dict[str, Any] = {"website": {"$exists": True, "$ne": "", "$ne": None}}
    
    if request.analyze_all_search:
        if request.keyword:
            query["$or"] = [
                {"name": {"$regex": request.keyword, "$options": "i"}},
                {"category": {"$regex": request.keyword, "$options": "i"}},
                {"description": {"$regex": request.keyword, "$options": "i"}}
            ]
        if request.city:
            query["city"] = {"$regex": f"^{request.city}$", "$options": "i"}
    elif request.analyze_favorites:
        query["is_favorite"] = True
    elif request.lead_ids:
        try:
            object_ids = [ObjectId(lid) if len(lid) == 24 else lid for lid in request.lead_ids]
            query["_id"] = {"$in": object_ids}
        except:
            query["_id"] = {"$in": request.lead_ids}
    else:
        raise HTTPException(status_code=400, detail="Must provide lead_ids or search criteria")
    
    leads_cursor = db["leads"].find(query, {"_id": 1, "website": 1})
    leads = await leads_cursor.to_list(length=None)
    
    if not leads:
        return {"message": "No eligible leads with valid websites found", "count": 0}
    
    # Create jobs
    jobs = []
    for lead in leads:
        lead_id_str = str(lead["_id"])
        
        # Check if a pending or processing job already exists to avoid duplicates
        existing_job = await db["advanced_analysis_queue"].find_one({
            "lead_id": lead_id_str,
            "status": {"$in": ["PENDING", "INITIALIZING", "CRAWLING", "ANALYZING", "SAVING"]}
        })
        
        if existing_job:
            continue
            
        jobs.append({
            "lead_id": lead_id_str,
            "website_url": lead["website"],
            "status": "PENDING",
            "logs": ["Job queued for advanced analysis"],
            "created_at": __import__('datetime').datetime.utcnow(),
            "updated_at": __import__('datetime').datetime.utcnow()
        })
    
    if jobs:
        await db["advanced_analysis_queue"].insert_many(jobs)
    
    return {
        "message": f"Successfully queued {len(jobs)} leads for advanced analysis",
        "count": len(jobs)
    }

@router.get("/status")
async def get_queue_status(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Get statistics for the advanced analysis queue"""
    pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    
    results = await db["advanced_analysis_queue"].aggregate(pipeline).to_list(length=None)
    
    stats = {
        "PENDING": 0,
        "INITIALIZING": 0,
        "CRAWLING": 0,
        "ANALYZING": 0,
        "SAVING": 0,
        "COMPLETED": 0,
        "FAILED": 0,
        "SKIPPED": 0,
        "CANCELLED": 0,
        "TOTAL": 0
    }
    
    for r in results:
        status = r["_id"]
        count = r["count"]
        if status in stats:
            stats[status] = count
        stats["TOTAL"] += count
        
    return stats
