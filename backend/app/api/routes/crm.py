from fastapi import APIRouter, Depends, HTTPException, Query, Body
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional
from bson import ObjectId
from datetime import datetime

from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import UserResponse
from app.models.crm_activity import CRMActivityCreate, CRMActivityResponse
from app.models.crm_task import CRMTaskCreate, CRMTaskResponse
from app.core.websocket import manager

router = APIRouter()

# -----------------
# CRM Pipelineeeeeeeeeeeeeeeeeeeeeee
# -----------------

@router.get("/leads/pipeline")
async def get_pipeline_leads(
    pipeline_stage: Optional[str] = None,
    priority: Optional[str] = None,
    owner_id: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    query = {"user_id": str(current_user.id)}
    if pipeline_stage:
        query["pipeline_stage"] = pipeline_stage
    if priority:
        query["priority"] = priority
    if owner_id:
        query["owner_id"] = owner_id
        
    cursor = db.leads.find(query).skip(skip).limit(limit)
    leads = await cursor.to_list(length=limit)
    
    total = await db.leads.count_documents(query)
    
    # Map _id to string for Pydantic
    for lead in leads:
        lead["_id"] = str(lead["_id"])
        
    return {
        "data": leads,
        "total": total,
        "skip": skip,
        "limit": limit
    }

@router.patch("/leads/{lead_id}/stage")
async def update_pipeline_stage(
    lead_id: str,
    stage: str = Body(..., embed=True),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    result = await db.leads.update_one(
        {"_id": ObjectId(lead_id), "user_id": str(current_user.id)},
        {"$set": {"pipeline_stage": stage}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    # Log activity
    activity = {
        "lead_id": lead_id,
        "user_id": str(current_user.id),
        "activity_type": "Status Changed",
        "description": f"Pipeline stage changed to {stage}",
        "metadata_info": {"new_stage": stage},
        "created_at": datetime.utcnow()
    }
    await db.crm_activities.insert_one(activity)
    
    # Broadcast event
    await manager.broadcast({
        "type": "CRM_PIPELINE_UPDATE",
        "lead_id": lead_id,
        "new_stage": stage
    })
    
    return {"message": "Pipeline stage updated", "new_stage": stage}

@router.patch("/leads/{lead_id}/owner")
async def update_lead_owner(
    lead_id: str,
    owner_id: str = Body(..., embed=True),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    result = await db.leads.update_one(
        {"_id": ObjectId(lead_id), "user_id": str(current_user.id)},
        {"$set": {"owner_id": owner_id}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    activity = {
        "lead_id": lead_id,
        "user_id": str(current_user.id),
        "activity_type": "Ownership Transferred",
        "description": f"Lead ownership transferred to {owner_id}",
        "metadata_info": {"new_owner": owner_id},
        "created_at": datetime.utcnow()
    }
    await db.crm_activities.insert_one(activity)
    
    return {"message": "Lead owner updated"}

# -----------------
# CRM Activities
# -----------------

@router.post("/activities", response_model=CRMActivityResponse)
async def create_activity(
    activity: CRMActivityCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    # Verify lead ownership
    lead = await db.leads.find_one({"_id": ObjectId(activity.lead_id), "user_id": str(current_user.id)})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    doc = activity.dict()
    doc["user_id"] = str(current_user.id)
    doc["created_at"] = datetime.utcnow()
    
    result = await db.crm_activities.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    
    await manager.broadcast({
        "type": "CRM_ACTIVITY_ADDED",
        "lead_id": activity.lead_id
    })
    
    return doc

@router.get("/activities/lead/{lead_id}")
async def get_lead_activities(
    lead_id: str,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Return CRM activities for a lead.

    Per the production audit (Phase 5): this MUST never return HTTP 404 for a
    valid lead. When a lead has no activities (or the lead id is unknown /
    orphaned), we respond with HTTP 200 and an empty activity list so the
    frontend never shows an error for a lead that simply has no activity.
    """
    try:
        lead_oid = ObjectId(lead_id)
    except Exception:
        # Malformed id — treat as "no activities", not a 404.
        return {"activities": [], "count": 0}

    # Verify lead ownership; if missing, still return 200 with empty list.
    lead = await db.leads.find_one({"_id": lead_oid, "user_id": str(current_user.id)})
    if not lead:
        return {"activities": [], "count": 0}

    cursor = db.crm_activities.find({"lead_id": lead_id}).sort("created_at", -1).limit(limit)
    activities = await cursor.to_list(length=limit)

    for act in activities:
        act["_id"] = str(act["_id"])

    return {"activities": activities, "count": len(activities)}

# -----------------
# CRM Tasks
# -----------------

@router.post("/tasks", response_model=CRMTaskResponse)
async def create_task(
    task: CRMTaskCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    # Verify lead ownership
    lead = await db.leads.find_one({"_id": ObjectId(task.lead_id), "user_id": str(current_user.id)})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    doc = task.dict()
    doc["user_id"] = str(current_user.id)
    doc["created_at"] = datetime.utcnow()
    doc["completed_at"] = None
    
    result = await db.crm_tasks.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    
    # Log activity
    activity = {
        "lead_id": task.lead_id,
        "user_id": str(current_user.id),
        "activity_type": "Task Created",
        "description": f"Created {task.task_type} task: {task.title}",
        "metadata_info": {"task_id": str(result.inserted_id)},
        "created_at": datetime.utcnow()
    }
    await db.crm_activities.insert_one(activity)
    
    return doc

@router.get("/tasks")
async def get_tasks(
    status: Optional[str] = None,
    lead_id: Optional[str] = None,
    due_before: Optional[datetime] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    query = {"user_id": str(current_user.id)}
    if status:
        query["status"] = status
    if lead_id:
        query["lead_id"] = lead_id
    if due_before:
        query["due_date"] = {"$lte": due_before}
        
    cursor = db.crm_tasks.find(query).sort("due_date", 1).limit(100)
    tasks = await cursor.to_list(length=100)
    
    for t in tasks:
        t["_id"] = str(t["_id"])
        
    return {"data": tasks}

@router.patch("/tasks/{task_id}/status")
async def update_task_status(
    task_id: str,
    status: str = Body(..., embed=True),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    update_data = {"status": status}
    if status == "Completed":
        update_data["completed_at"] = datetime.utcnow()
        
    result = await db.crm_tasks.update_one(
        {"_id": ObjectId(task_id), "user_id": str(current_user.id)},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
        
    # Get task to log activity
    task = await db.crm_tasks.find_one({"_id": ObjectId(task_id)})
    if task:
        activity = {
            "lead_id": task.get("lead_id"),
            "user_id": str(current_user.id),
            "activity_type": "Task Updated",
            "description": f"Task '{task.get('title')}' marked as {status}",
            "metadata_info": {"task_id": task_id, "status": status},
            "created_at": datetime.utcnow()
        }
        await db.crm_activities.insert_one(activity)
        
    return {"message": "Task status updated", "new_status": status}
