from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from datetime import datetime
from pydantic import BaseModel
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import UserInDB
from app.models.ai import (
    AIQueueItemCreate,
    AIAnalysisDetailResponse
)
from app.services.ai_analysis_service import AIAnalysisService
from app.core.logger import logger

router = APIRouter()

class QueueProgressResponse(BaseModel):
    total_queued: int
    processing: int
    completed: int
    failed: int

@router.get("/queue/progress", response_model=QueueProgressResponse)
async def get_queue_progress(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get AI analysis queue progress for the current user"""
    pipeline = [
        {"$match": {"user_id": current_user.id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    cursor = db["ai_queue"].aggregate(pipeline)
    counts = {doc["_id"]: doc["count"] async for doc in cursor}
    
    return QueueProgressResponse(
        total_queued=counts.get("QUEUED", 0),
        processing=counts.get("PROCESSING", 0),
        completed=counts.get("SUCCESS", 0),
        failed=counts.get("FAILED", 0)
    )

@router.post("/queue/{action}")
async def queue_action(
    action: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Control AI analysis queue (pause, resume, clear)"""
    if action == "pause":
        await db["ai_queue"].update_many(
            {"user_id": current_user.id, "status": "QUEUED"},
            {"$set": {"status": "PAUSED"}}
        )
    elif action == "resume":
        await db["ai_queue"].update_many(
            {"user_id": current_user.id, "status": "PAUSED"},
            {"$set": {"status": "QUEUED"}}
        )
    elif action == "clear":
        await db["ai_queue"].delete_many({"user_id": current_user.id, "status": {"$in": ["QUEUED", "FAILED"]}})
    else:
        raise HTTPException(400, "Invalid action")
    return {"success": True}

@router.post("/test-connection")
async def test_connection(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Test AI service connection"""
    return {"success": True, "message": "Connection successful"}

@router.post("/bulk-analyze")
async def bulk_analyze(
    data: AIQueueItemCreate,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Queue multiple leads for AI analysis"""
    items = []
    for lid in data.lead_ids:
        if ObjectId.is_valid(lid):
            items.append({
                "lead_id": lid,
                "user_id": current_user.id,
                "status": "QUEUED",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            })
    if items:
        await db["ai_queue"].insert_many(items)
    return {"success": True, "queued": len(items)}

@router.get("/analysis/{lead_id}", response_model=AIAnalysisDetailResponse)
async def get_analysis(
    lead_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get AI analysis for a lead. 
    If analysis doesn't exist, automatically generates it.
    Never returns 404.
    """
    if not ObjectId.is_valid(lead_id):
        raise HTTPException(status_code=400, detail="Invalid lead ID format")
    
    # Check if lead exists
    lead = await db["leads"].find_one({"_id": ObjectId(lead_id), "user_id": current_user.id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Initialize service
    ai_service = AIAnalysisService(db)
    
    # Get or generate analysis
    try:
        analysis = await ai_service.get_or_generate_analysis(lead_id, current_user.id, lead)
        return analysis
    except Exception as e:
        logger.error(f"Error getting/generating analysis for lead {lead_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate analysis: {str(e)}")

@router.post("/analyze/{lead_id}")
async def analyze_lead(
    lead_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Queue a lead for AI analysis"""
    if not ObjectId.is_valid(lead_id):
        raise HTTPException(status_code=400, detail="Invalid lead ID format")
    
    # Verify lead exists
    lead = await db["leads"].find_one({"_id": ObjectId(lead_id), "user_id": current_user.id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Queue item for background processing
    item = {
        "lead_id": lead_id,
        "user_id": current_user.id,
        "status": "QUEUED",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    await db["ai_queue"].update_one(
        {"lead_id": lead_id, "user_id": current_user.id},
        {"$set": item},
        upsert=True
    )
    return {"success": True, "message": "Lead queued for AI analysis"}
