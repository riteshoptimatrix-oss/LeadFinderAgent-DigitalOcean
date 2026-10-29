from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Dict, Any, List
from datetime import datetime, timezone
from bson import ObjectId

from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.enrichment_job import EnrichmentJob, EnrichmentJobState

router = APIRouter()

@router.post("/schedule", status_code=status.HTTP_201_CREATED)
async def schedule_enrichment(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Manually schedule an enrichment job for a specific lead."""
    db = get_db()
    
    # Check if lead exists
    lead = await db["leads"].find_one({"_id": lead_id})
    if not lead:
        try:
            lead = await db["leads"].find_one({"_id": ObjectId(lead_id)})
        except:
            pass
            
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    # Check if a job already exists
    existing = await db["enrichment_jobs"].find_one({
        "lead_id": lead_id, 
        "status": {"$in": ["queued", "running"]}
    })
    
    if existing:
        return {"message": "Enrichment already queued or running", "job_id": str(existing["_id"])}
        
    job = EnrichmentJob(lead_id=lead_id)
    result = await db["enrichment_jobs"].insert_one(job.model_dump(by_alias=True, exclude_none=True))
    
    return {"message": "Enrichment scheduled", "job_id": str(result.inserted_id)}


@router.post("/{job_id}/retry")
async def retry_enrichment(job_id: str, current_user: dict = Depends(get_current_user)):
    """Retry a failed enrichment job."""
    db = get_db()
    try:
        oid = ObjectId(job_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid job ID")
        
    job = await db["enrichment_jobs"].find_one({"_id": oid})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    if job.get("status") not in ["failed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Can only retry failed or cancelled jobs")
        
    await db["enrichment_jobs"].update_one(
        {"_id": oid},
        {"$set": {
            "status": "queued",
            "attempts": 0,
            "error_message": None,
            "started_at": None,
            "completed_at": None
        }}
    )
    
    return {"message": "Job queued for retry"}


@router.post("/{job_id}/cancel")
async def cancel_enrichment(job_id: str, current_user: dict = Depends(get_current_user)):
    """Cancel a queued enrichment job."""
    db = get_db()
    try:
        oid = ObjectId(job_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid job ID")
        
    job = await db["enrichment_jobs"].find_one({"_id": oid})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    if job.get("status") not in ["queued", "running"]:
        raise HTTPException(status_code=400, detail="Can only cancel queued or running jobs")
        
    await db["enrichment_jobs"].update_one(
        {"_id": oid},
        {"$set": {
            "status": "cancelled",
            "completed_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"message": "Job cancelled"}


@router.get("/")
async def list_enrichment_jobs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    status: str = None,
    current_user: dict = Depends(get_current_user)
):
    """List enrichment jobs."""
    db = get_db()
    
    query = {}
    if status:
        query["status"] = status
        
    cursor = db["enrichment_jobs"].find(query).sort("created_at", -1).skip(skip).limit(limit)
    jobs = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        jobs.append(doc)
        
    total = await db["enrichment_jobs"].count_documents(query)
    
    return {
        "items": jobs,
        "total": total,
        "skip": skip,
        "limit": limit
    }
