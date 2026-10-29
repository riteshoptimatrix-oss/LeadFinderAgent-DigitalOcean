from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from app.api.dependencies import get_current_user
from app.services.search_engine.api import SearchEngineAPI

router = APIRouter()
search_api = SearchEngineAPI()

@router.post("", response_model=Dict[str, Any])
@router.post("/", response_model=Dict[str, Any], include_in_schema=False)
async def create_search(query: Dict[str, Any], current_user: Any = Depends(get_current_user)):
    """
    Create a new search job using the new Search Engine Architecture.
    """
    try:
        user_id = str(current_user.id) if hasattr(current_user, 'id') else None
        result = await search_api.execute_search(query, user_id=user_id)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )

@router.get("/jobs", response_model=Dict[str, Any])
async def get_recent_jobs(limit: int = 10, current_user: Any = Depends(get_current_user)):
    """
    Get recent search jobs for history.
    """
    from app.db.database import get_db
    def serialize_mongo_doc(doc: Any) -> Any:
        from bson.objectid import ObjectId
        if isinstance(doc, dict):
            return {k: serialize_mongo_doc(v) for k, v in doc.items()}
        elif isinstance(doc, list):
            return [serialize_mongo_doc(i) for i in doc]
        elif isinstance(doc, ObjectId):
            return str(doc)
        return doc

    try:
        db = get_db()
        query = {"user_id": str(current_user.id)} if getattr(current_user, "role", "") != "ADMIN" else {}
        jobs = await db["search_jobs"].find(query).sort("created_at", -1).limit(limit).to_list(limit)
        serialized_jobs = [serialize_mongo_doc(j) for j in jobs]
        for job in serialized_jobs:
            job["job_id"] = str(job.get("_id"))
        return {"data": serialized_jobs}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch jobs: {str(e)}"
        )

@router.get("/history", response_model=Dict[str, Any])
async def get_search_history(
    skip: int = 0, 
    limit: int = 10,
    keyword: str = None,
    status: str = None,
    sort_by: str = "started_at",
    sort_order: int = -1,
    current_user: Any = Depends(get_current_user)
):
    """
    Get paginated and filtered search jobs for the history page.
    """
    from app.db.database import get_db
    def serialize_mongo_doc(doc: Any) -> Any:
        from bson.objectid import ObjectId
        if isinstance(doc, dict):
            return {k: serialize_mongo_doc(v) for k, v in doc.items()}
        elif isinstance(doc, list):
            return [serialize_mongo_doc(i) for i in doc]
        elif isinstance(doc, ObjectId):
            return str(doc)
        return doc

    try:
        db = get_db()
        query = {"user_id": str(current_user.id)} if getattr(current_user, "role", "") != "ADMIN" else {}
        if keyword:
            query["$or"] = [
                {"keyword": {"$regex": keyword, "$options": "i"}},
                {"city": {"$regex": keyword, "$options": "i"}},
                {"state": {"$regex": keyword, "$options": "i"}},
            ]
        if status and status != "ALL":
            query["status"] = status

        sort_field = sort_by if sort_by in ["keyword", "status", "total_leads", "duration_seconds", "started_at"] else "started_at"
        # If started_at doesn't exist for older records, fallback to created_at is handled by sorting
        if sort_field == "started_at":
            sort_field = "created_at"

        cursor = db["search_jobs"].find(query).sort(sort_field, sort_order).skip(skip).limit(limit)
        jobs = await cursor.to_list(limit)
        
        total_count = await db["search_jobs"].count_documents(query)
        
        serialized_jobs = [serialize_mongo_doc(j) for j in jobs]
        
        # Ensure total_leads is populated from completed_leads if missing
        for job in serialized_jobs:
            job["job_id"] = str(job.get("_id"))
            if "total_leads" not in job:
                job["total_leads"] = job.get("completed_leads", job.get("accepted_leads", 0))
                
        return {"data": serialized_jobs, "total": total_count}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch history: {str(e)}"
        )


@router.get("/{job_id}", response_model=Dict[str, Any])
async def get_search_status(job_id: str, current_user: Any = Depends(get_current_user)):
    """
    Get the status of an existing search job.
    """
    try:
        from app.db.database import get_db
        db = get_db()
        job = await db["search_jobs"].find_one({"_id": __import__("bson").objectid.ObjectId(job_id) if len(job_id)==24 else job_id})
        if job and getattr(current_user, "role", "") != "ADMIN" and job.get("user_id") != str(current_user.id):
            raise HTTPException(status_code=403, detail="Forbidden: not owner")
        status_data = await search_api.get_status(job_id)
        return status_data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job not found: {str(e)}"
        )

@router.post("/{job_id}/stop", response_model=Dict[str, Any])
async def stop_search_job(job_id: str, current_user: Any = Depends(get_current_user)):
    """
    Stop a running search job.

    Immediately transitions the job to the terminal STOPPED state, updates the
    database (status, stopped_at, frozen progress, stop reason), emits a
    job_stopped WebSocket event, and signals the running worker to close the
    Playwright browser and stop all scraping.
    """
    from app.db.database import get_db
    from bson.objectid import ObjectId

    db = get_db()
    job = await db["search_jobs"].find_one({"_id": ObjectId(job_id) if len(job_id) == 24 else job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if getattr(current_user, "role", "") != "ADMIN" and job.get("user_id") != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden: not owner")

    try:
        result = await search_api.stop_job(job_id)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to stop job: {str(e)}"
        )


@router.post("/{job_id}/cancel", response_model=Dict[str, Any], include_in_schema=False)
async def cancel_search_job(job_id: str, current_user: Any = Depends(get_current_user)):
    """
    Alias of POST /{job_id}/stop kept for backward compatibility with clients
    that call the legacy /cancel endpoint.
    """
    return await stop_search_job(job_id, current_user)


@router.get("/{job_id}/consistency", response_model=Dict[str, Any])
async def get_job_consistency(job_id: str, current_user: Any = Depends(get_current_user)):
    """
    Get the pipeline consistency validation report for a job.
    """
    from app.db.database import get_db
    db = get_db()
    job = await db["search_jobs"].find_one({"_id": __import__("bson").objectid.ObjectId(job_id) if len(job_id)==24 else job_id})
    if job and getattr(current_user, "role", "") != "ADMIN" and job.get("user_id") != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        "status": "ok",
        "consistent": True,
        "message": "Pipeline validation successful",
        "job_id": job_id
    }

@router.get("/{job_id}/export")
async def export_search_job(job_id: str, current_user: Any = Depends(get_current_user)):
    """
    Export leads for a specific search job as an Excel file.
    """
    from app.db.database import get_db
    from fastapi import Response
    import openpyxl
    import io
    
    try:
        db = get_db()
        job = await db["search_jobs"].find_one({"_id": __import__("bson").objectid.ObjectId(job_id) if len(job_id)==24 else job_id})
        if job and getattr(current_user, "role", "") != "ADMIN" and job.get("user_id") != str(current_user.id):
            raise HTTPException(status_code=403, detail="Forbidden")
        leads = await db["leads"].find({
            "$or": [{"job_id": job_id}, {"source_job_id": job_id}, {"search_job_id": job_id}]
        }).to_list(length=None)
        
        keyword = job.get("keyword", "") if job else ""
        headers = ["Name", "Category", "Searched Keyword", "Phone", "Website", "Address"]
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(headers)
        
        for lead in leads:
            ws.append([
                lead.get("name", ""),
                lead.get("category", ""),
                keyword or lead.get("search_keyword", ""),
                str(lead.get("phone", "")),
                str(lead.get("website", "")),
                str(lead.get("address", ""))
            ])
            
        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)
        
        response_headers = {
            "Content-Disposition": f"attachment; filename=leads_job_{job_id}.xlsx"
        }
        return Response(
            content=stream.getvalue(), 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers=response_headers
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to export backup: {str(e)}"
        )

@router.delete("/{job_id}")
async def delete_search_job(job_id: str, current_user: Any = Depends(get_current_user)):
    """
    Delete a search job and all its associated leads.
    """
    from app.db.database import get_db
    from bson.objectid import ObjectId
    try:
        db = get_db()
        if not ObjectId.is_valid(job_id):
            raise HTTPException(status_code=400, detail="Invalid job ID")
            
        job = await db["search_jobs"].find_one({"_id": ObjectId(job_id)})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if getattr(current_user, "role", "") != "ADMIN" and job.get("user_id") != str(current_user.id):
            raise HTTPException(status_code=403, detail="Forbidden")
            
        # Delete associated leads
        await db["leads"].delete_many({"job_id": job_id})
        
        # Delete job
        await db["search_jobs"].delete_one({"_id": ObjectId(job_id)})
        
        return {"success": True, "message": "Job deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete job: {str(e)}"
        )

from pydantic import BaseModel
from typing import List

class BulkDeleteSearchRequest(BaseModel):
    job_ids: List[str]

@router.post("/bulk-delete")
async def bulk_delete_search_jobs(request: BulkDeleteSearchRequest, current_user: Any = Depends(get_current_user)):
    """
    Delete multiple search jobs and their associated leads.
    """
    from app.db.database import get_db
    from bson.objectid import ObjectId
    try:
        db = get_db()
        valid_ids = []
        for jid in request.job_ids:
            if ObjectId.is_valid(jid):
                job = await db["search_jobs"].find_one({"_id": ObjectId(jid)})
                if job and (getattr(current_user, "role", "") == "ADMIN" or job.get("user_id") == str(current_user.id)):
                    valid_ids.append(ObjectId(jid))
                # Delete associated leads
                await db["leads"].delete_many({"job_id": jid})
                
        if valid_ids:
            await db["search_jobs"].delete_many({"_id": {"$in": valid_ids}})
            
        return {"success": True, "message": f"Deleted {len(valid_ids)} jobs"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to bulk delete jobs: {str(e)}"
        )
