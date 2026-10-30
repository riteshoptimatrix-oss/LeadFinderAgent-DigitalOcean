from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import io
import csv
try:
    import pandas as pd
except ImportError:
    pd = None
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.services.ai_analysis_queue_service import AIAnalysisQueueService
from app.services.ai_analysis_worker import ai_analysis_worker_instance
from app.models.ai_analysis import AIAnalysisState, AIAnalysisQueueResponse
from app.core.websocket import manager
import asyncio
import logging
from bson import ObjectId

logger = logging.getLogger(__name__)

router = APIRouter()

class CreateQueueRequest(BaseModel):
    leads: List[Dict[str, Any]]


class BulkAnalysisRequest(BaseModel):
    """Bulk AI Website Analysis — analyze many leads with one queue.

    Either ``lead_ids`` (explicit set of leads) or ``filters`` (query over
    the whole leads collection) can be supplied.
    """
    lead_ids: Optional[List[str]] = None
    filters: Optional[Dict[str, Any]] = None
    name: Optional[str] = "Bulk AI Website Analysis"
    concurrency: int = Field(default=3, ge=1, le=20)
    reanalyze: bool = Field(default=False)


@router.post("/bulk/prepare")
async def prepare_bulk_analysis(
    request: BulkAnalysisRequest,
    current_user: Any = Depends(get_current_user),
):
    """Compute the bulk eligibility summary WITHOUT creating a queue."""
    from app.services.bulk_ai_analysis_service import prepare_bulk_analysis as _prepare

    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    scoped_user_id = str(current_user.id) if getattr(current_user, "role", "") != "ADMIN" else None
    report = await _prepare(
        db,
        request.lead_ids,
        request.filters,
        user_id=scoped_user_id,
        reanalyze=request.reanalyze,
    )
    return report


@router.post("/bulk/start", response_model=AIAnalysisQueueResponse)
async def start_bulk_analysis(
    request: BulkAnalysisRequest,
    current_user: Any = Depends(get_current_user),
):
    """Create and start a bulk AI website analysis queue."""
    from app.services.bulk_ai_analysis_service import create_bulk_queue

    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    scoped_user_id = str(current_user.id) if getattr(current_user, "role", "") != "ADMIN" else None
    queue, report = await create_bulk_queue(
        db,
        user_id=str(current_user.id),
        name=request.name,
        lead_ids=request.lead_ids,
        filters=request.filters,
        concurrency=request.concurrency,
        filter_user_id=scoped_user_id,
        reanalyze=request.reanalyze,
    )
    if queue is None:
        raise HTTPException(
            status_code=400,
            detail="No eligible leads to analyze. All leads are either already "
                   "analyzed, currently analyzing, queued, or have no valid website.",
        )
    return queue


@router.get("/bulk/queues")
async def get_bulk_queues(current_user: Any = Depends(get_current_user)):
    """List bulk analysis queues for the current user (summary only)."""
    from app.services.bulk_ai_analysis_service import list_bulk_queues

    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    return await list_bulk_queues(db, str(current_user.id))


@router.post("/bulk/{queue_id}/stop")
async def stop_bulk_analysis(queue_id: str, current_user: Any = Depends(get_current_user)):
    """Stop a running bulk analysis queue: pending jobs are cancelled, the
    queue reaches a terminal CANCELLED state. Completed work is preserved."""
    from datetime import datetime, timezone

    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    queue = await db["ai_analysis_queues"].find_one({"_id": ObjectId(queue_id)})
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    if str(queue.get("user_id")) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")

    now = datetime.now(timezone.utc)
    await db["ai_analysis_jobs"].update_many(
        {"queue_id": queue_id, "status": {"$in": [
            AIAnalysisState.WAITING.value,
            AIAnalysisState.QUEUED.value,
            AIAnalysisState.PENDING.value,
            AIAnalysisState.RETRY.value,
        ]}},
        {"$set": {
            "status": AIAnalysisState.CANCELLED.value,
            "error_message": "Cancelled by user.",
            "completed_at": now,
            "updated_at": now,
        }},
    )
    await db["ai_analysis_queues"].update_one(
        {"_id": queue["_id"]},
        {"$set": {
            "status": AIAnalysisState.CANCELLED.value,
            "completed_at": now,
            "updated_at": now,
        }},
    )
    try:
        await manager.broadcast_to_job(queue_id, {
            "type": "BULK_QUEUE_CANCELLED",
            "event_type": "BULK_QUEUE_CANCELLED",
            "queue_id": queue_id,
            "stage": "Cancelled",
            "status": AIAnalysisState.CANCELLED.value,
            "message": "Bulk analysis cancelled. Pending jobs stopped; completed work preserved.",
            "timestamp": now.isoformat(),
        })
    except Exception:
        pass
    return {"message": "Bulk analysis stopped.", "queue_id": queue_id}


@router.post("/queue", response_model=AIAnalysisQueueResponse)
async def create_queue(
    request: CreateQueueRequest,
    current_user: Any = Depends(get_current_user)
):
    if not request.leads:
        raise HTTPException(status_code=400, detail="No leads provided")
        
    import re
    for lead in request.leads:
        website = str(lead.get("website", "")).strip().lower()
        if not website or website in ["-", "n/a", "none", "null"]:
            logger.warning(f"Website Missing - Lead Loaded but website missing/empty for {lead.get('_id', lead.get('id', 'Unknown'))}")
            raise HTTPException(status_code=400, detail="AI Website Analysis requires a valid website URL.")
            
        if not re.match(r'^https?://[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}', website):
            if not website.startswith('http'):
                # Try prepending http:// to see if it's a valid domain
                website = "http://" + website
                
            if not re.match(r'^https?://[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}', website):
                logger.warning(f"Website Missing - Malformed website URL for {lead.get('_id', lead.get('id', 'Unknown'))}: {website}")
                raise HTTPException(status_code=400, detail="AI Website Analysis requires a valid website URL.")
                
        logger.info(f"Website Validated for lead {lead.get('_id', lead.get('id', 'Unknown'))}: {website}")

    logger.info("Queue Created - Request validated successfully")
        
    queue = await AIAnalysisQueueService.create_queue(
        user_id=str(current_user.id),
        leads=request.leads
    )
    return queue

from app.models.ai_analysis import AIAnalysisQueueDetailResponse

@router.get("/queue/{queue_id}", response_model=AIAnalysisQueueDetailResponse)
async def get_queue_status(queue_id: str, current_user: Any = Depends(get_current_user)):
    queue = await AIAnalysisQueueService.get_queue_status(queue_id)
    if not queue:
        raise HTTPException(status_code=404, detail="Queue not found")
    queue_user_id = queue.get("user_id") or ""
    if queue_user_id and queue_user_id != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized to view this queue")
    return AIAnalysisQueueDetailResponse.model_validate(queue)

@router.get("/worker/status")
async def get_worker_status(current_user: dict = Depends(get_current_user)):
    return {"is_running": ai_analysis_worker_instance.is_running}

@router.get("/queues")
async def get_queues_list(current_user: dict = Depends(get_current_user)):
    queues = await AIAnalysisQueueService.get_queue_history(str(current_user.id))
    summary = {
        "total": len(queues),
        "queues": []
    }
    for q in queues:
        summary["queues"].append({
            "id": str(q.get("_id")),
            "status": q.get("status"),
            "total_jobs": q.get("total_jobs") or 0,
            "completed_jobs": q.get("completed_jobs") or 0,
            "failed_jobs": q.get("failed_jobs") or 0,
            "created_at": q.get("created_at"),
            "completed_at": q.get("completed_at"),
            "leads": q.get("leads") or [],
        })
    return summary

@router.post("/queue/{queue_id}/pause")
async def pause_queue(queue_id: str, current_user: dict = Depends(get_current_user)):
    raise HTTPException(status_code=400, detail="Pause operation is deprecated under the strict status machine.")

@router.post("/queue/{queue_id}/resume")
async def resume_queue(queue_id: str, current_user: dict = Depends(get_current_user)):
    raise HTTPException(status_code=400, detail="Resume operation is deprecated under the strict status machine.")

@router.post("/queue/{queue_id}/retry")
async def retry_failed(queue_id: str, current_user: dict = Depends(get_current_user)):
    queue = await AIAnalysisQueueService.get_queue_status(queue_id)
    if not queue or str(queue["user_id"]) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Not authorized")
        
    success = await AIAnalysisQueueService.retry_failed_jobs(queue_id)
    if not success:
        raise HTTPException(status_code=400, detail="Could not retry jobs")
    return {"message": "Failed jobs queued for retry"}

@router.post("/queue/{queue_id}/cancel")
async def cancel_queue(queue_id: str, current_user: dict = Depends(get_current_user)):
    raise HTTPException(status_code=400, detail="Cancel operation is deprecated under the strict status machine.")

@router.get("/history", response_model=List[AIAnalysisQueueResponse])
async def get_queue_history(current_user: dict = Depends(get_current_user)):
    queues = await AIAnalysisQueueService.get_queue_history(current_user.id)
    return [AIAnalysisQueueResponse.model_validate(q) for q in queues]

@router.websocket("/ws/{queue_id}")
async def websocket_endpoint(websocket: WebSocket, queue_id: str, token: Optional[str] = None):
    from jose import jwt, JWTError
    from app.core.config import settings as app_settings

    logger.info(f"CLIENT_CONNECT: AI-analysis websocket handshake for queue {queue_id}")

    # 1. JWT validation
    user_id = None
    if token:
        try:
            payload = jwt.decode(
                token, 
                app_settings.SECRET_KEY, 
                algorithms=[app_settings.ALGORITHM],
                audience=app_settings.JWT_AUDIENCE,
                issuer=app_settings.JWT_ISSUER
            )
            user_id = payload.get("sub")
            user_role = (payload.get("role") or "").lower()
            logger.info(f"AUTH_SUCCESS: Token accepted for queue {queue_id} (user={user_id}, role={user_role})")
        except JWTError as e:
            logger.error(f"AUTH_FAILED: Invalid/expired token for queue {queue_id}: {repr(e)}")
            await websocket.accept()
            await websocket.close(code=4003)
            return
    else:
        logger.error(f"AUTH_FAILED: Missing token for queue {queue_id}")
        await websocket.accept()
        await websocket.close(code=4003)
        return

    # 2. Queue lookup and ownership validation
    queue = await AIAnalysisQueueService.get_queue_status(queue_id)
    queue_owner = str(queue.get("user_id", "")) if queue else ""
    is_owner = queue_owner == str(user_id) or queue_owner in ["system", "", "None"]
    if not queue or (not is_owner and user_role != "admin"):
        logger.error(
            f"AUTH_FAILED: Queue {queue_id} not found or not owned by user {user_id}. "
            f"queue_found={queue is not None}, owner={queue_owner}, user_role={user_role}"
        )
        await websocket.accept()
        await websocket.close(code=4003)
        return

    # 3. Accept and connect
    await manager.connect(websocket, queue_id)
    logger.info(f"WEBSOCKET_ACCEPTED: queue {queue_id} user {user_id}")
    try:
        # Notify the client the stream is live
        await websocket.send_json({
            "type": "CONNECTED",
            "event_type": "CONNECTED",
            "queue_id": queue_id,
            "message": "Connected to analysis stream",
        })
        logger.info(f"EVENT_SENT: CONNECTED for queue {queue_id}")
        while True:
            try:
                # Wait for client message with 15s timeout
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=15.0)
                if raw == "ping":
                    try:
                        await websocket.send_text("pong")
                    except Exception:
                        break
            except asyncio.TimeoutError:
                # Send heartbeat to keep connection alive
                try:
                    await websocket.send_json({"type": "HEARTBEAT", "queue_id": queue_id})
                    logger.debug(f"EVENT_SENT: HEARTBEAT for queue {queue_id}")
                except Exception:
                    # Client probably disconnected during timeout
                    break
    except WebSocketDisconnect:
        logger.info(f"CLIENT_DISCONNECTED: queue {queue_id} (client closed socket)")
    except Exception as e:
        logger.error(f"ERROR: WebSocket error for queue {queue_id}: {repr(e)}")
    finally:
        await manager.disconnect(websocket)
        logger.info(f"CLIENT_DISCONNECTED: Cleaned up websocket for queue {queue_id}")

from app.models.ai_analysis import AIAnalysisJobResponse
from app.models.seo_audit import WebsiteSEOAuditResponse
from app.models.ui_ux_audit import WebsiteDesignAuditResponse
from app.models.contact_discovery import ContactDiscoveryResultResponse
from app.models.analysis_history import (
    LatestAnalysisResponse,
    AnalysisHistoryResponse,
    AnalysisComparisonResponse,
    AnalysisVersionResponse,
)
from app.services.analysis_history_service import analysis_history_service
from app.services.production_validation_service import ProductionValidationService
from pydantic import ConfigDict

class LeadAnalysisResponse(BaseModel):
    job: AIAnalysisJobResponse
    seo_audit: Optional[WebsiteSEOAuditResponse] = None
    design_audit: Optional[WebsiteDesignAuditResponse] = None
    contact_discovery: Optional[ContactDiscoveryResultResponse] = None
    business_opportunity_score: int
    
    model_config = ConfigDict(populate_by_name=True)

@router.get("/lead/{lead_id}", response_model=Optional[LeadAnalysisResponse])
async def get_lead_analysis(lead_id: str, current_user: dict = Depends(get_current_user)):
    """
    Returns the latest AI analysis for a lead.
    All data is read directly from the Lead document (single source of truth).
    Falls back to the job-based approach for legacy leads.
    """
    db = get_db()

    # Primary path: read from the enriched Lead document
    lead = await db["leads"].find_one(_lead_query(lead_id))
    analysis_status = (lead or {}).get("ai_analysis", {}).get("analysis_status", "")
    if lead and lead.get("ai_analysis") and analysis_status.upper() in ("COMPLETED", "COMPLETEDWITHWARNINGS"):
        # Find the latest job for metadata
        job = await db["ai_analysis_jobs"].find_one(
            {"lead_id": lead_id},
            sort=[("_id", -1)]
        )
        if not job:
            return None

        # Compute business opportunity score from Lead's business sub-document
        biz = lead.get("business") or {}
        overall_score = biz.get("overall_score") or lead.get("ai_analysis", {}).get("overall_score") or (job.get("overall_ai_score") if job else 0)
        try:
            overall_score = int(overall_score or 0)
        except (TypeError, ValueError):
            overall_score = 0

        cd = lead.get("contact_discovery") or {}
        has_email = 1 if cd.get("primary_email") else 0
        has_phone = 1 if cd.get("primary_phone") else 0
        contact_bonus = (has_email * 10) + (has_phone * 5)
        business_score = min(100, max(0, int((overall_score * 0.8) + (contact_bonus * 2)))) if overall_score > 0 else 0

        return LeadAnalysisResponse(
            job=AIAnalysisJobResponse.model_validate(job),
            seo_audit=None,       # Legacy field — data now lives in lead.seo
            design_audit=None,    # Legacy field — data now lives in lead.design
            contact_discovery=None,  # Legacy field — data now lives in lead.contact_discovery
            business_opportunity_score=business_score
        )

    # Legacy fallback: old leads that haven't been re-analysed yet
    job = await db["ai_analysis_jobs"].find_one(
        {"lead_id": lead_id},
        sort=[("_id", -1)]
    )
    if not job:
        return None

    job_id = job["_id"]
    seo_audit = await db["seo_audits"].find_one({"job_id": job_id})
    design_audit = await db["design_audits"].find_one({"job_id": job_id})
    contacts = await db["contact_discoveries"].find_one({"job_id": job_id})

    overall_score = job.get("overall_ai_score")
    try:
        overall_score = int(overall_score or 0)
    except (TypeError, ValueError):
        overall_score = 0

    has_primary_email = 1 if (contacts and contacts.get("primary_email")) else 0
    has_primary_phone = 1 if (contacts and contacts.get("primary_phone")) else 0
    contact_bonus = (has_primary_email * 10) + (has_primary_phone * 5)
    business_score = min(100, max(0, int((overall_score * 0.8) + (contact_bonus * 2)))) if overall_score > 0 else 0

    return LeadAnalysisResponse(
        job=AIAnalysisJobResponse.model_validate(job),
        seo_audit=WebsiteSEOAuditResponse.model_validate(seo_audit) if seo_audit else None,
        design_audit=WebsiteDesignAuditResponse.model_validate(design_audit) if design_audit else None,
        contact_discovery=ContactDiscoveryResultResponse.model_validate(contacts) if contacts else None,
        business_opportunity_score=business_score
    )

@router.get("/lead/{lead_id}/analysis-summary")
async def get_lead_analysis_summary(lead_id: str, current_user: dict = Depends(get_current_user)):
    """
    Returns the complete enriched analysis from the Lead document.
    This is the primary endpoint for the new Lead-centric architecture.
    Includes all sub-documents and the full historical_analyses array.
    """
    db = get_db()
    lead = await db["leads"].find_one(_lead_query(lead_id))
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Strip MongoDB internal _id and format
    lead.pop("_id", None)

    return {
        "lead_id": lead_id,
        "ai_analysis": lead.get("ai_analysis"),
        "website_information": lead.get("website_information"),
        "website_structure": lead.get("website_structure"),
        "contact_discovery": lead.get("contact_discovery"),
        "social_media": lead.get("social_media"),
        "technology_detection": lead.get("technology_detection"),
        "websiteTechnologies": (lead.get("technology_detection") or {}).get("websiteTechnologies") or [],
        "seo": lead.get("seo"),
        "performance": lead.get("performance"),
        "performanceAudit": lead.get("performanceAudit"),
        "securityAudit": lead.get("securityAudit"),
        "seoAudit": lead.get("seoAudit"),
        "uiuxAudit": lead.get("uiuxAudit"),
        "design": lead.get("design"),
        "business": lead.get("business"),
        "social_media_analysis": lead.get("social_media_analysis"),
        "mobile": lead.get("mobile"),
        "content": lead.get("content"),
        "tiktok": lead.get("tiktok"),
        "lead_intelligence": lead.get("lead_intelligence"),
        "sales_opportunity": lead.get("sales_opportunity"),
        "analysis_history_count": len(lead.get("historical_analyses", [])),
        "historical_analyses": lead.get("historical_analyses", []),
    }


@router.get("/lead/{lead_id}/report")
async def get_lead_audit_report(lead_id: str, current_user: dict = Depends(get_current_user)):
    """
    Returns the comprehensive Enterprise Website Audit Report for a lead.
    Aggregated read-only view built from every analysis sub-document.
    """
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    from app.services.audit_report_service import audit_report_service

    lead = await db["leads"].find_one(_lead_query(lead_id))
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    report = audit_report_service.build_report(lead)
    if not report.get("analysis_status"):
        raise HTTPException(status_code=404, detail="No analysis found for this lead")

    return report


@router.get("/lead/{lead_id}/production-validation")
async def get_production_validation_report(lead_id: str, current_user: dict = Depends(get_current_user)):
    """Produces a structured production certification report for a lead."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database unavailable")

    lead = await db["leads"].find_one(_lead_query(lead_id))
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    latest_job = await db["ai_analysis_jobs"].find_one({"lead_id": lead_id}, sort=[("_id", -1)])
    queue = None
    if latest_job:
        queue = await db["ai_analysis_queues"].find_one({"_id": latest_job.get("queue_id")})

    jobs = await db["ai_analysis_jobs"].find({"lead_id": lead_id}).to_list(length=20)
    validator = ProductionValidationService()
    return validator.validate_lead_document(
        lead,
        queue=queue,
        jobs=jobs,
        websocket_ready=True,
    )


def _clean_list(value: Any) -> List[str]:
    if not value:
        return []
    if not isinstance(value, list):
        value = [value]
    return list(dict.fromkeys([str(item) for item in value if item]))


def _as_number(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _score_delta(previous: Any, latest: Any) -> Dict[str, Any]:
    old = _as_number(previous)
    new = _as_number(latest)
    delta = None if old is None or new is None else round(new - old, 2)
    direction = "unchanged"
    if delta is not None and delta > 0:
        direction = "improved"
    elif delta is not None and delta < 0:
        direction = "degraded"
    return {"previous": old, "latest": new, "delta": delta, "direction": direction}


def _lead_query(lead_id: str) -> Dict[str, Any]:
    query: Dict[str, Any] = {"$or": [{"_id": lead_id}]}
    if ObjectId.is_valid(lead_id):
        query["$or"].append({"_id": ObjectId(lead_id)})
    return query


async def _get_lead_document(lead_id: str) -> Dict[str, Any]:
    db = get_db()
    lead = await db["leads"].find_one(_lead_query(lead_id))
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead["_id"] = str(lead["_id"])
    return lead


def _analysis_scores(source: Dict[str, Any]) -> Dict[str, Any]:
    if source.get("scores"):
        return source.get("scores") or {}
    seo = source.get("seo") or {}
    perf = source.get("performance") or {}
    design = source.get("design") or {}
    business = source.get("business") or {}
    social_analysis = source.get("social_media_analysis") or {}
    mobile = source.get("mobile") or {}
    content = source.get("content") or {}
    lead_intel = source.get("lead_intelligence") or {}
    sales_opp = source.get("sales_opportunity") or {}
    return {
        "overall_score": business.get("overall_score") or source.get("overall_score"),
        "seo_score": seo.get("seo_score") or source.get("seo_score"),
        "performance_score": perf.get("performance_score") or perf.get("pagespeed") or source.get("performance_score"),
        "ui_score": design.get("ui_score") or source.get("ui_score"),
        "ux_score": design.get("ux_score") or source.get("ux_score"),
        "accessibility_score": design.get("accessibility_score") or source.get("accessibility_score"),
        "security_score": design.get("security_score") or source.get("security_score"),
        "business_opportunity": business.get("business_opportunity_score") or business.get("business_opportunity") or source.get("business_opportunity"),
        "social_media_score": social_analysis.get("overall_social_score") or source.get("social_media_score"),
        "mobile_score": mobile.get("overall_mobile_score") or design.get("mobile_score") or source.get("mobile_score"),
        "content_score": content.get("overall_content_score") or source.get("content_score"),
        "lead_intelligence_score": lead_intel.get("lead_score") or source.get("lead_intelligence_score"),
        "sales_opportunity_score": sales_opp.get("opportunity_score") or source.get("sales_opportunity_score"),
    }


def _analysis_snapshot(source: Dict[str, Any], *, current: bool = False) -> Dict[str, Any]:
    ai_meta = source.get("ai_analysis") or source
    analysis_number = ai_meta.get("analysis_count") or source.get("version") or 1
    scores = _analysis_scores(source)
    return {
        "version": analysis_number,
        "label": "Current" if current else source.get("label") or f"Analysis #{analysis_number}",
        "is_current": current,
        "analysis_status": ai_meta.get("analysis_status"),
        "analysis_version": ai_meta.get("analysis_version"),
        "analysis_date": ai_meta.get("analysis_completed_at") or ai_meta.get("last_analysis_date") or source.get("analysis_date"),
        "duration": ai_meta.get("analysis_duration") or source.get("analysis_duration"),
        "scores": scores,
        "overall_score": scores.get("overall_score"),
        "seo_score": scores.get("seo_score"),
        "performance_score": scores.get("performance_score"),
        "ui_score": scores.get("ui_score"),
        "ux_score": scores.get("ux_score"),
        "accessibility_score": scores.get("accessibility_score"),
        "security_score": scores.get("security_score"),
        "business_opportunity": scores.get("business_opportunity"),
        "website_information": source.get("website_information"),
        "website_structure": source.get("website_structure"),
        "contact_discovery": source.get("contact_discovery"),
        "social_media": source.get("social_media"),
        "technology_detection": source.get("technology_detection"),
        "seo": source.get("seo"),
        "performance": source.get("performance"),
        "design": source.get("design"),
        "business": source.get("business"),
        "social_media_analysis": source.get("social_media_analysis"),
        "mobile": source.get("mobile"),
        "content": source.get("content"),
        "tiktok": source.get("tiktok"),
        "lead_intelligence": source.get("lead_intelligence"),
        "sales_opportunity": source.get("sales_opportunity"),
    }


def _compare_analysis(previous: Optional[Dict[str, Any]], latest: Dict[str, Any]) -> Dict[str, Any]:
    previous = previous or {}
    prev_cd = previous.get("contact_discovery") or {}
    next_cd = latest.get("contact_discovery") or {}
    prev_ws = previous.get("website_structure") or {}
    next_ws = latest.get("website_structure") or {}
    prev_tech = previous.get("technology_detection") or {}
    next_tech = latest.get("technology_detection") or {}
    prev_scores = _analysis_scores(previous)
    next_scores = _analysis_scores(latest)

    previous_emails = set(_clean_list(prev_cd.get("all_emails")) + _clean_list(prev_cd.get("secondary_emails")) + _clean_list(prev_cd.get("primary_email")))
    latest_emails = set(_clean_list(next_cd.get("all_emails")) + _clean_list(next_cd.get("secondary_emails")) + _clean_list(next_cd.get("primary_email")))
    previous_phones = set(_clean_list(prev_cd.get("secondary_phones")) + _clean_list(prev_cd.get("primary_phone")) + _clean_list(prev_cd.get("whatsapp_numbers")))
    latest_phones = set(_clean_list(next_cd.get("secondary_phones")) + _clean_list(next_cd.get("primary_phone")) + _clean_list(next_cd.get("whatsapp_numbers")))

    tech_keys = ["cms", "frontend_framework", "backend_framework", "hosting", "cdn", "analytics", "server_stack", "javascript_framework", "css_framework"]
    technology_changes = []
    for key in tech_keys:
        old = prev_tech.get(key)
        new = next_tech.get(key)
        if old != new and (old or new):
            technology_changes.append({"field": key, "previous": old, "latest": new})

    score_difference = {
        "overall_score": _score_delta(prev_scores.get("overall_score"), next_scores.get("overall_score")),
        "seo_score": _score_delta(prev_scores.get("seo_score"), next_scores.get("seo_score")),
        "performance_score": _score_delta(prev_scores.get("performance_score"), next_scores.get("performance_score")),
        "ui_score": _score_delta(prev_scores.get("ui_score"), next_scores.get("ui_score")),
        "ux_score": _score_delta(prev_scores.get("ux_score"), next_scores.get("ux_score")),
        "accessibility_score": _score_delta(prev_scores.get("accessibility_score"), next_scores.get("accessibility_score")),
        "security_score": _score_delta(prev_scores.get("security_score"), next_scores.get("security_score")),
        "business_opportunity": _score_delta(prev_scores.get("business_opportunity"), next_scores.get("business_opportunity")),
        "mobile_score": _score_delta(prev_scores.get("mobile_score"), next_scores.get("mobile_score")),
        "social_media_score": _score_delta(prev_scores.get("social_media_score"), next_scores.get("social_media_score")),
        "content_score": _score_delta(prev_scores.get("content_score"), next_scores.get("content_score")),
        "lead_intelligence_score": _score_delta(prev_scores.get("lead_intelligence_score"), next_scores.get("lead_intelligence_score")),
        "sales_opportunity_score": _score_delta(prev_scores.get("sales_opportunity_score"), next_scores.get("sales_opportunity_score")),
    }

    new_pages = max(0, int((next_ws.get("total_pages") or 0) - (prev_ws.get("total_pages") or 0)))
    seo_delta = score_difference["seo_score"].get("delta")
    perf_delta = score_difference["performance_score"].get("delta")

    summary = {
        "new_contacts_discovered": sorted((latest_emails | latest_phones) - (previous_emails | previous_phones)),
        "removed_contacts": sorted((previous_emails | previous_phones) - (latest_emails | latest_phones)),
        "new_technologies": [item for item in technology_changes if not item.get("previous") and item.get("latest")],
        "website_improvements": [],
        "website_issues": [],
        "score_difference": score_difference,
    }
    if seo_delta is not None:
        (summary["website_improvements"] if seo_delta > 0 else summary["website_issues"] if seo_delta < 0 else []).append(f"SEO score changed by {seo_delta}")
    if perf_delta is not None:
        (summary["website_improvements"] if perf_delta > 0 else summary["website_issues"] if perf_delta < 0 else []).append(f"Performance score changed by {perf_delta}")
    if new_pages:
        summary["website_improvements"].append(f"{new_pages} new pages discovered")

    return {
        "previous_version": previous.get("version") or previous.get("analysis_count"),
        "latest_version": latest.get("version") or latest.get("analysis_count"),
        "new_email": sorted(latest_emails - previous_emails),
        "new_phone": sorted(latest_phones - previous_phones),
        "removed_contacts": summary["removed_contacts"],
        "new_pages": new_pages,
        "seo_improvements": seo_delta is not None and seo_delta > 0,
        "seo_degradation": seo_delta is not None and seo_delta < 0,
        "performance_improvement": perf_delta is not None and perf_delta > 0,
        "technology_changes": technology_changes,
        "cms_changes": [item for item in technology_changes if item["field"] == "cms"],
        "hosting_changes": [item for item in technology_changes if item["field"] == "hosting"],
        "score_difference": score_difference,
        "change_summary": summary,
    }


@router.get("/lead/{lead_id}/latest-analysis")
async def get_latest_analysis(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await _get_lead_document(lead_id)
    return _analysis_snapshot(lead, current=True)


@router.get("/lead/{lead_id}/analysis-history")
async def get_analysis_history(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await _get_lead_document(lead_id)
    historical = [_analysis_snapshot(item) for item in (lead.get("historical_analyses") or [])]
    historical.sort(key=lambda item: item.get("version") or 0)
    current = _analysis_snapshot(lead, current=True)
    return {
        "lead_id": lead_id,
        "count": len(historical) + (1 if lead.get("ai_analysis") else 0),
        "history": historical,
        "current": current,
        "timeline": historical + ([current] if lead.get("ai_analysis") else []),
    }


@router.get("/lead/{lead_id}/analysis-comparison")
async def get_analysis_comparison(lead_id: str, current_user: dict = Depends(get_current_user)):
    lead = await _get_lead_document(lead_id)
    historical = [_analysis_snapshot(item) for item in (lead.get("historical_analyses") or [])]
    historical.sort(key=lambda item: item.get("version") or 0)
    latest = _analysis_snapshot(lead, current=True)
    previous = historical[-1] if historical else None
    return {
        "lead_id": lead_id,
        "previous": previous,
        "latest": latest,
        "comparison": _compare_analysis(previous, latest),
    }

@router.get("/lead/{lead_id}/export")
async def export_lead_analysis(lead_id: str, format: str = "csv", current_user: dict = Depends(get_current_user)):
    db = get_db()

    # Read from Lead document (single source of truth)
    lead = await db["leads"].find_one(_lead_query(lead_id))
    if not lead or not lead.get("ai_analysis"):
        raise HTTPException(status_code=404, detail="No analysis found for this lead")

    seo = lead.get("seo") or {}
    design = lead.get("design") or {}
    perf = lead.get("performance") or {}
    cd = lead.get("contact_discovery") or {}
    biz = lead.get("business") or {}
    wi = lead.get("website_information") or {}
    ws = lead.get("website_structure") or {}
    ai_meta = lead.get("ai_analysis") or {}
    social_analysis = lead.get("social_media_analysis") or {}
    mobile = lead.get("mobile") or {}
    content = lead.get("content") or {}
    tiktok = lead.get("tiktok") or {}
    lead_intel = lead.get("lead_intelligence") or {}
    sales_opp = lead.get("sales_opportunity") or {}
    uiux_audit = lead.get("uiuxAudit") or {}

    data = {
        "Business Name": lead.get("name"),
        "Website": lead.get("website") or wi.get("website_url"),
        "Domain": wi.get("domain"),
        "HTTPS": wi.get("https"),
        "HTTP Status": wi.get("http_status"),
        "Overall Score": biz.get("overall_score"),
        "SEO Score": seo.get("seo_score"),
        "Performance Score": perf.get("performance_score"),
        "UI Score": design.get("ui_score"),
        "UX Score": design.get("ux_score"),
        "Security Score": design.get("security_score"),
        "Accessibility Score": design.get("accessibility_score"),
        "Mobile Score": mobile.get("overall_mobile_score") or design.get("mobile_score"),
        "Social Media Score": social_analysis.get("overall_social_score"),
        "Content Score": content.get("overall_content_score"),
        "TikTok Found": bool(tiktok.get("found")),
        "TikTok URL": tiktok.get("url") if tiktok.get("found") else None,
        "TikTok Username": tiktok.get("username") if tiktok.get("found") else None,
        "TikTok Source Page": tiktok.get("source_page") if tiktok.get("found") else None,
        "Lead Intelligence Score": lead_intel.get("lead_score"),
        "Sales Opportunity Score": sales_opp.get("opportunity_score"),
        "Lead Quality": lead_intel.get("lead_quality"),
        "Next Best Action": sales_opp.get("next_best_action"),
        "FCP (s)": perf.get("fcp"),
        "LCP (s)": perf.get("lcp"),
        "CLS": perf.get("cls"),
        "TTFB (s)": perf.get("ttfb"),
        "Total Pages": ws.get("total_pages"),
        "Broken Links": ws.get("broken_links"),
        "Primary Email": cd.get("primary_email"),
        "Primary Phone": cd.get("primary_phone"),
        "WhatsApp": (cd.get("whatsapp_numbers") or [""])[0],
        "All Emails": ", ".join(cd.get("all_emails") or []),
        "Lead Priority": biz.get("lead_priority"),
        "Recommended Services": ", ".join(biz.get("recommended_services") or []),
        "Analysis Count": ai_meta.get("analysis_count"),
        "Last Analysed": ai_meta.get("last_analysis_date"),
        "Analysis Duration (s)": ai_meta.get("analysis_duration"),
        "UI/UX Intelligence Score": uiux_audit.get("overallScore"),
        "UI/UX Intelligence Grade": uiux_audit.get("grade"),
        "UI/UX Redesign Opportunity": uiux_audit.get("redesignOpportunity", {}).get("opportunityLevel"),
        "UI/UX Sales Opportunity": uiux_audit.get("salesOpportunity", {}).get("opportunityLevel"),
        "UI/UX Issues Count": len(uiux_audit.get("issues") or []),
        "UI/UX Recommendations Count": len(uiux_audit.get("recommendations") or []),
    }

    if format == "csv":
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fieldnames=data.keys())
        writer.writeheader()
        writer.writerow(data)
        response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
        response.headers["Content-Disposition"] = f"attachment; filename=analysis_{lead_id}.csv"
        return response
    elif format == "excel":
        if not pd:
            raise HTTPException(status_code=500, detail="Pandas not installed for Excel export")
        df = pd.DataFrame([data])
        stream = io.BytesIO()
        with pd.ExcelWriter(stream, engine="openpyxl") as writer:
            df.to_excel(writer, index=False)
        response = StreamingResponse(
            iter([stream.getvalue()]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response.headers["Content-Disposition"] = f"attachment; filename=analysis_{lead_id}.xlsx"
        return response

    raise HTTPException(status_code=400, detail="Invalid format. Use 'csv' or 'excel'.")


# ═══════════════════════════════════════════════════════════════════════
# VERSIONED ANALYSIS HISTORY API
# ═══════════════════════════════════════════════════════════════════════

@router.get("/lead/{lead_id}/v2/latest", summary="Get Latest Analysis (Enhanced)")
async def get_latest_analysis_v2(lead_id: str, current_user: dict = Depends(get_current_user)):
    """
    Returns the current (most recent) AI analysis for a Lead.
    Enhanced endpoint with strongly typed response model.
    """
    result = await analysis_history_service.get_latest_analysis(lead_id)
    if not result:
        raise HTTPException(status_code=404, detail="No analysis found for this lead")
    
    return {
        "lead_id": lead_id,
        "current": result,
    }


@router.get("/lead/{lead_id}/v2/history", summary="Get Analysis History (Enhanced)")
async def get_analysis_history_v2(lead_id: str, current_user: dict = Depends(get_current_user)):
    """
    Returns the complete analysis history for a Lead.
    
    Response includes:
    - All historical analyses (archived snapshots)
    - Current analysis
    - Chronological timeline view
    """
    result = await analysis_history_service.get_analysis_history(lead_id)
    return result


@router.get("/lead/{lead_id}/v2/comparison", summary="Get Analysis Comparison (Enhanced)")
async def get_analysis_comparison_v2(lead_id: str, current_user: dict = Depends(get_current_user)):
    """
    Compares the previous analysis with the latest analysis.
    
    Detects and returns:
    - New/removed contacts (emails, phones, WhatsApp)
    - Technology stack changes (CMS, hosting, frameworks)
    - Website structure changes (new pages, broken links)
    - SEO improvements/degradations
    - Performance trends
    - Complete score deltas
    """
    result = await analysis_history_service.get_analysis_comparison(lead_id)
    if not result:
        raise HTTPException(status_code=404, detail="No analysis found for this lead")
    
    return result


@router.get("/lead/{lead_id}/v2/version/{version}", summary="Get Specific Analysis Version")
async def get_analysis_version(
    lead_id: str,
    version: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Retrieves a specific analysis version by its version number.
    
    Args:
        lead_id: Lead identifier
        version: Analysis version number (1, 2, 3...)
    
    Returns:
        Complete analysis snapshot for the specified version.
    """
    result = await analysis_history_service.get_analysis_by_version(lead_id, version)
    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"Analysis version {version} not found for lead {lead_id}"
        )
    
    return {
        "lead_id": lead_id,
        "version": version,
        "snapshot": result,
    }


@router.get("/lead/{lead_id}/v2/compare/{version_a}/{version_b}", summary="Compare Two Analysis Versions")
async def compare_analysis_versions(
    lead_id: str,
    version_a: int,
    version_b: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Compares two specific analysis versions.
    
    Args:
        lead_id: Lead identifier
        version_a: First version number (typically older)
        version_b: Second version number (typically newer)
    
    Returns:
        Detailed comparison showing all changes between the two versions.
    """
    result = await analysis_history_service.compare_versions(lead_id, version_a, version_b)
    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"Could not compare versions {version_a} and {version_b} for lead {lead_id}"
        )
    
    return result


@router.get("/lead/{lead_id}/v2/timeline", summary="Get Analysis Timeline")
async def get_analysis_timeline(lead_id: str, current_user: dict = Depends(get_current_user)):
    """
    Returns a compact chronological timeline of all analyses for a Lead.
    Useful for displaying in UI as a vertical timeline component.
    
    Response includes:
    - Version number
    - Label (e.g., "Analysis #1", "Current")
    - Status
    - Date
    - Duration
    - Score summary
    """
    result = await analysis_history_service.get_analysis_history(lead_id)
    
    return {
        "lead_id": lead_id,
        "total_count": result["count"],
        "timeline": result["timeline"],
        "current": result["current"],
    }

