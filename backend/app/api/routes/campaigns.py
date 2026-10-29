from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import UserInDB
from app.models.campaign import (
    CampaignResponse, CampaignStatus, CampaignType,
    PaginatedCampaignResponse
)

router = APIRouter()

class CreateUnifiedCampaignReq(BaseModel):
    name: str
    campaign_type: CampaignType
    template_id: str
    lead_ids: List[str]

@router.get("/", response_model=PaginatedCampaignResponse)
async def get_campaigns(
    limit: int = 50,
    skip: int = 0,
    type: Optional[CampaignType] = None,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    query = {"user_id": current_user.id}
    if type: query["campaign_type"] = type
    
    cursor = db["unified_campaigns"].find(query).sort("created_at", -1).skip(skip).limit(limit)
    campaigns = await cursor.to_list(length=None)
    for c in campaigns: c["_id"] = str(c["_id"])
    
    total = await db["unified_campaigns"].count_documents(query)
    return PaginatedCampaignResponse(data=campaigns, total=total)

@router.post("/", response_model=CampaignResponse)
async def create_campaign(
    data: CreateUnifiedCampaignReq,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    campaign = {
        "user_id": current_user.id,
        "name": data.name,
        "campaign_type": data.campaign_type,
        "template_id": data.template_id,
        "status": CampaignStatus.DRAFT,
        "total_count": len(data.lead_ids),
        "pending_count": len(data.lead_ids),
        "success_count": 0,
        "failure_count": 0,
        "created_at": datetime.utcnow()
    }
    res = await db["unified_campaigns"].insert_one(campaign)
    campaign["_id"] = str(res.inserted_id)
    return CampaignResponse(**campaign)

@router.get("/{id}", response_model=CampaignResponse)
async def get_campaign(
    id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    if not ObjectId.is_valid(id): raise HTTPException(400)
    campaign = await db["unified_campaigns"].find_one({"_id": ObjectId(id), "user_id": current_user.id})
    if not campaign: raise HTTPException(404)
    campaign["_id"] = str(campaign["_id"])
    return CampaignResponse(**campaign)

@router.delete("/{id}")
async def delete_campaign(
    id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    if not ObjectId.is_valid(id): raise HTTPException(400)
    await db["unified_campaigns"].delete_one({"_id": ObjectId(id), "user_id": current_user.id})
    return {"success": True}
