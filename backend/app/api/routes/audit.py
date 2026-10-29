from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import UserInDB
from app.models.audit import WebsiteAuditResponse, GlobalAuditResponse
from app.services.audit_service import AuditService
from app.core.logger import logger

router = APIRouter()

@router.get("/global", response_model=GlobalAuditResponse)
async def get_global_audit(
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get global audit statistics for all leads.
    Never returns 404.
    """
    try:
        audit_service = AuditService(db)
        global_stats = await audit_service.get_global_audit_stats(current_user.id)
        return global_stats
    except Exception as e:
        logger.error(f"Error getting global audit stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get global audit: {str(e)}")

@router.get("/{lead_id}", response_model=WebsiteAuditResponse)
async def get_lead_audit(
    lead_id: str,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get website audit for a specific lead.
    If audit doesn't exist, automatically generates it.
    Never returns 404.
    """
    if not ObjectId.is_valid(lead_id):
        raise HTTPException(status_code=400, detail="Invalid lead ID format")
    
    # Check if lead exists
    lead = await db["leads"].find_one({"_id": ObjectId(lead_id), "user_id": current_user.id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    try:
        audit_service = AuditService(db)
        audit = await audit_service.get_or_generate_audit(lead_id, current_user.id, lead)
        return audit
    except Exception as e:
        logger.error(f"Error getting/generating audit for lead {lead_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate audit: {str(e)}")

@router.post("/run/{lead_id}", response_model=WebsiteAuditResponse)
async def run_lead_audit(
    lead_id: str,
    force: bool = False,
    current_user: UserInDB = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Manually trigger a website audit for a specific lead.
    Use force=true to regenerate existing audit.
    """
    if not ObjectId.is_valid(lead_id):
        raise HTTPException(status_code=400, detail="Invalid lead ID format")
    
    # Check if lead exists
    lead = await db["leads"].find_one({"_id": ObjectId(lead_id), "user_id": current_user.id})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    try:
        audit_service = AuditService(db)
        
        # If force, delete existing audit
        if force:
            await db["website_audits"].delete_one({"lead_id": lead_id, "user_id": current_user.id})
        
        # Generate new audit
        audit = await audit_service.generate_audit(lead_id, current_user.id, lead)
        return audit
    except Exception as e:
        logger.error(f"Error running audit for lead {lead_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to run audit: {str(e)}")
