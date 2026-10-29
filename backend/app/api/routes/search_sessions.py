"""
Search Sessions API.

Read-only helpers that power the "Search Sessions" quick access panel on the
Leads page. They reuse the existing ``search_jobs`` and ``leads`` collections
(no duplicate data) and join Leads to Search Jobs through the existing
relationship fields (``source_job_id`` / ``job_id`` / ``search_job_id``).

These routes are intentionally mounted BEFORE ``/search`` so the static
``/search/sessions/*`` paths never collide with ``/search/{job_id}``.
"""
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from bson.objectid import ObjectId
from fastapi import APIRouter, HTTPException, Query, Depends
from app.api.dependencies import get_current_user

from app.db.database import get_db

router = APIRouter()

# Lead -> Search Job linkage fields, in priority order. The current search
# engine writes ``source_job_id``; legacy records may only carry ``job_id`` or
# ``search_job_id``.
_LINK_FIELDS = ("source_job_id", "job_id", "search_job_id")

# Terminal "analysis finished" AI analysis states.
_AI_COMPLETED_STATES = ("COMPLETED", "SUCCESS", "PARTIAL_SUCCESS")

_LIST_PROJECTION = {"logs": 0}

# Supported sort keys for the sessions list. ``most_leads``/``least_leads``
# sort by the *actual* linked-lead count computed via $lookup (never by the
# possibly-stale ``completed_leads`` field), so order always matches what the
# UI displays as "Total Leads Saved".
_SORT_MAP: Dict[str, tuple] = {
    "newest": ("created_at", -1),
    "oldest": ("created_at", 1),
    "most_leads": ("leads_count", -1),
    "least_leads": ("leads_count", 1),
    "fastest": ("duration_seconds", 1),
    "longest": ("duration_seconds", -1),
}


def _lead_lookup_stage() -> Dict[str, Any]:
    """
    $lookup stage that joins each search job to its linked leads (using the
    existing source_job_id / job_id / search_job_id relationship) and computes
    the authoritative lead count and AI-analysis-completed count in one pass.
    """
    return {
        "$lookup": {
            "from": "leads",
            "let": {"jid": {"$toString": "$_id"}},
            "pipeline": [
                {"$match": {"$expr": {"$or": [
                    {"$eq": ["$source_job_id", "$$jid"]},
                    {"$eq": ["$job_id", "$$jid"]},
                    {"$eq": ["$search_job_id", "$$jid"]},
                ]}}},
                {"$group": {"_id": None,
                    "leads_count": {"$sum": 1},
                    "ai_completed": {
                        "$sum": {
                            "$cond": [{"$in": ["$ai_analysis.analysis_status", list(_AI_COMPLETED_STATES)]}, 1, 0]
                        }
                    },
                }},
            ],
            "as": "agg",
        }
    }


def _iso(value: Any) -> str:
    """Best-effort ISO 8601 string for a datetime-like value."""
    if isinstance(value, datetime):
        return value.isoformat()
    if value is None:
        return ""
    return str(value)


def _date_range(value: str) -> Optional[tuple]:
    """
    Parse a ``YYYY-MM-DD`` (or ``YYYY-MM``) string into a half-open UTC
    datetime range, or ``None`` if it is not a valid date. Used so the search
    box can filter sessions by the day (or month) they ran.
    """
    if not value:
        return None
    stripped = value.strip()
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            parsed = datetime.strptime(stripped, fmt)
        except ValueError:
            continue
        start = parsed.replace(tzinfo=timezone.utc)
        if fmt == "%Y-%m-%d":
            end = start.replace(day=start.day + 1)
        elif fmt == "%Y-%m":
            end = start.replace(day=1, month=start.month + 1) if start.month < 12 else start.replace(day=1, year=start.year + 1, month=1)
        else:
            end = start.replace(day=1, year=start.year + 1)
        return (start, end)
    return None


async def _compute_job_aggregates(db: Any, job_ids: List[str]) -> Dict[str, Dict[str, int]]:
    """
    Compute authoritative lead counts for a batch of search jobs using a single
    aggregation over the existing ``leads`` collection.

    Returns a map of ``job_id -> {leads_count, ai_completed}``. Each lead is
    bucketed under one canonical job (source_job_id preferred) so a single
    document is never counted twice.
    """
    result: Dict[str, Dict[str, int]] = {}
    if not job_ids:
        return result

    match_or = [{field: {"$in": job_ids}} for field in _LINK_FIELDS]
    pipeline = [
        {"$match": {"$or": match_or}},
        {"$project": {
            "canonical_job": {
                "$ifNull": [
                    "$source_job_id",
                    {"$ifNull": ["$job_id", "$search_job_id"]},
                ]
            },
            "analysis_status": "$ai_analysis.analysis_status",
        }},
        {"$group": {
            "_id": "$canonical_job",
            "leads_count": {"$sum": 1},
            "ai_completed": {
                "$sum": {
                    "$cond": [{"$in": ["$analysis_status", list(_AI_COMPLETED_STATES)]}, 1, 0]
                }
            },
        }},
    ]
    async for doc in db["leads"].aggregate(pipeline):
        job_id = doc.get("_id")
        if job_id is None:
            continue
        result[str(job_id)] = {
            "leads_count": int(doc.get("leads_count") or 0),
            "ai_completed": int(doc.get("ai_completed") or 0),
        }
    return result


def _build_summary(job: Dict[str, Any], aggregates: Dict[str, Dict[str, int]]) -> Dict[str, Any]:
    """Build the compact, serialization-safe session summary payload."""
    job_id = str(job.get("_id"))
    agg = aggregates.get(job_id, {})
    leads_count = int(agg.get("leads_count") or 0)
    ai_completed = int(agg.get("ai_completed") or 0)

    saved = leads_count if leads_count else int(job.get("completed_leads") or 0)

    return {
        "id": job_id,
        "job_id": job_id,
        "keyword": job.get("keyword", ""),
        "country": job.get("country", ""),
        "state": job.get("state", ""),
        "city": job.get("city", ""),
        "area": job.get("area", ""),
        "provider": job.get("provider") or "Google Maps",
        "search_date": _iso(job.get("created_at")),
        "search_time": _iso(job.get("created_at")),
        "duration_seconds": round(float(job.get("duration_seconds") or 0), 2),
        "status": job.get("status", "UNKNOWN"),
        "progress": int(job.get("progress") or 0),
        "requested_leads": int(job.get("limit") or 0),
        "total_found": int(job.get("total_found") or 0),
        "total_saved": saved,
        "leads_count": leads_count,
        "accepted_leads": int(job.get("accepted_leads") or 0),
        "duplicate_leads": int(job.get("duplicates_removed") or 0),
        "failed_leads": int(job.get("rejected_leads") or 0),
        "ai_analysis_completed": ai_completed,
        "ai_analysis_pending": max(0, leads_count - ai_completed) if leads_count else 0,
        "error_message": job.get("error_message"),
        "created_at": _iso(job.get("created_at")),
    }


@router.get("", response_model=Dict[str, Any])
async def list_search_sessions(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    country: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    sort_by: str = Query("newest"),
    current_user: Any = Depends(get_current_user)
):
    """
    Paginated list of search sessions (newest first by default).

    Supports searching by keyword/country/state/city and sorting by recency,
    lead volume or duration. Only loads a page of sessions at a time so large
    histories are never pulled into memory at once.
    """
    db = get_db()

    query: Dict[str, Any] = {"user_id": str(current_user.id)} if getattr(current_user, "role", "") != "ADMIN" else {}
    if keyword:
        query["$or"] = [
            {"keyword": {"$regex": keyword, "$options": "i"}},
            {"country": {"$regex": keyword, "$options": "i"}},
            {"state": {"$regex": keyword, "$options": "i"}},
            {"city": {"$regex": keyword, "$options": "i"}},
            {"area": {"$regex": keyword, "$options": "i"}},
        ]
        # If the search term is a date, also match sessions created that day/month/year.
        date_range = _date_range(keyword)
        if date_range:
            query["$or"].append({"created_at": {"$gte": date_range[0], "$lt": date_range[1]}})
    if country:
        query["country"] = {"$regex": country, "$options": "i"}
    if state:
        query["state"] = {"$regex": state, "$options": "i"}
    if city:
        query["city"] = {"$regex": city, "$options": "i"}

    sort_field, sort_order = _SORT_MAP.get(sort_by, _SORT_MAP["newest"])

    total = await db["search_jobs"].count_documents(query)

    pipeline: List[Dict[str, Any]] = [{"$match": query}]
    if sort_field == "leads_count":
        pipeline.append(_lead_lookup_stage())
        pipeline.append({"$addFields": {
            "leads_count": {"$ifNull": [{"$arrayElemAt": ["$agg.leads_count", 0]}, 0]},
            "ai_completed": {"$ifNull": [{"$arrayElemAt": ["$agg.ai_completed", 0]}, 0]},
        }})
        pipeline.append({"$project": {"logs": 0, "agg": 0}})
    else:
        pipeline.append({"$project": _LIST_PROJECTION})
    pipeline.append({"$sort": {sort_field: sort_order}})
    pipeline.append({"$skip": skip})
    pipeline.append({"$limit": limit})

    jobs = await db["search_jobs"].aggregate(pipeline).to_list(limit)

    # For non-lead-count sorts the aggregation may not have computed counts, so
    # derive them from the shared aggregate helper for the loaded page only.
    job_ids = [str(job.get("_id")) for job in jobs if job.get("_id")]
    needs_counts = any("leads_count" not in job for job in jobs)
    aggregates = {}
    if needs_counts:
        aggregates = await _compute_job_aggregates(db, job_ids)
    else:
        aggregates = {
            job_id: {
                "leads_count": int(job.get("leads_count") or 0),
                "ai_completed": int(job.get("ai_completed") or 0),
            }
            for job_id, job in zip(job_ids, jobs)
            if job_id
        }

    return {
        "data": [_build_summary(job, aggregates) for job in jobs],
        "total": total,
    }


@router.get("/stats", response_model=Dict[str, Any])
async def search_sessions_stats(current_user: Any = Depends(get_current_user)):
    """
    Quick high-level statistics for the Search Sessions panel.
    """
    db = get_db()
    user_filter = {"user_id": str(current_user.id)} if getattr(current_user, "role", "") != "ADMIN" else {}
    comp_filter = {"status": "COMPLETED", **user_filter}
    total_searches = await db["search_jobs"].count_documents(user_filter)
    total_completed_searches = await db["search_jobs"].count_documents(comp_filter)
    total_leads_generated = await db["leads"].count_documents(user_filter)

    avg_duration_seconds = 0.0
    async for doc in db["search_jobs"].aggregate([
        {"$match": {"duration_seconds": {"$gt": 0}, **user_filter}},
        {"$group": {"_id": None, "avg": {"$avg": "$duration_seconds"}}},
    ]):
        avg_duration_seconds = float(doc.get("avg") or 0)

    average_leads_per_search = 0.0
    if total_searches > 0:
        average_leads_per_search = total_leads_generated / total_searches

    return {
        "total_searches": total_searches,
        "total_leads_generated": total_leads_generated,
        "average_search_time_seconds": round(avg_duration_seconds, 2),
        "average_leads_per_search": round(average_leads_per_search, 2),
        "total_completed_searches": total_completed_searches,
    }


@router.get("/{job_id}", response_model=Dict[str, Any])
async def search_session_detail(job_id: str, current_user: Any = Depends(get_current_user)):
    """
    Full details (job document + authoritative lead/AI-analysis counts) for a
    single search session.
    """
    db = get_db()
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=400, detail="Invalid search session ID")

    job = await db["search_jobs"].find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Search session not found")
    if getattr(current_user, "role", "") != "ADMIN" and job.get("user_id") != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden: not owner")

    aggregates = await _compute_job_aggregates(db, [job_id])
    summary = _build_summary(job, aggregates)

    job["_id"] = str(job["_id"])
    return {"data": summary, "job": job}
