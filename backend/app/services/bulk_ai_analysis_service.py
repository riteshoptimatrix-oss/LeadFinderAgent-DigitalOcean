"""
Bulk AI Website Analysis — eligibility, de-duplication and queue orchestration.

Rules implemented here:
  - Only professional, valid website URLs are eligible.
  - Leads already analyzed / currently analyzing / already queued / deleted
    are skipped with a recorded reason.
  - Identical websites are analyzed ONCE; every matching lead is attached to
    that single job as a "linked lead" and receives a copy of the report.
  - A bulk queue stores one job per unique website, plus a summary of every
    lead that was skipped and why.
"""

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from bson import ObjectId

from app.db.database import get_db
from app.core.logger import logger
from app.core.websocket import manager
from app.models.ai_analysis import (
    AIAnalysisState,
    AIAnalysisQueueCreate,
    AIAnalysisQueueInDB,
    AIAnalysisJobCreate,
)
from app.services.lead_enrichment_service import to_object_id


# ─────────────────────────────────────────────────────────────────────────────
# Status sets
# ─────────────────────────────────────────────────────────────────────────────

# Job states that mean "this website is currently being processed".
ACTIVE_JOB_STATES = {
    AIAnalysisState.STARTED,
    AIAnalysisState.RUNNING,
    AIAnalysisState.COLLECTING,
    AIAnalysisState.ANALYZING,
    AIAnalysisState.SCORING,
    AIAnalysisState.SAVING,
}

# Job states that mean "this job is queued or waiting and must not be re-enqueued".
NON_TERMINAL_JOB_STATES = ACTIVE_JOB_STATES | {
    AIAnalysisState.WAITING,
    AIAnalysisState.QUEUED,
    AIAnalysisState.PENDING,
    AIAnalysisState.RETRY,
}

# Queue states that are still processing (not yet terminal).
ACTIVE_QUEUE_STATES = {
    AIAnalysisState.WAITING,
    AIAnalysisState.PENDING,
    AIAnalysisState.QUEUED,
    AIAnalysisState.STARTED,
    AIAnalysisState.RUNNING,
    AIAnalysisState.COLLECTING,
    AIAnalysisState.ANALYZING,
    AIAnalysisState.SCORING,
    AIAnalysisState.SAVING,
    AIAnalysisState.RETRY,
}

TERMINAL_QUEUE_STATES = {
    AIAnalysisState.COMPLETED,
    AIAnalysisState.SUCCESS,
    AIAnalysisState.PARTIAL_SUCCESS,
    AIAnalysisState.FAILED,
    AIAnalysisState.SKIPPED,
    AIAnalysisState.CANCELLED,
    AIAnalysisState.TIMEOUT,
    AIAnalysisState.UNKNOWN,
    AIAnalysisState.EMPTY,
}

# analysis_status values stored on the Lead document (ai_analysis.analysis_status)
# that mean the lead's website has already produced a successful report.
SUCCESS_LEAD_STATUSES = {
    "Completed",
    "PartialSuccess",
    "CompletedWithWarnings",
    "COMPLETED",
    "PARTIAL_SUCCESS",
    "COMPLETEDWITHWARNINGS",
    "SUCCESS",
}

# analysis_status values that mean a run is currently in flight for this lead.
ACTIVE_LEAD_STATUSES = {
    "Running",
    "RUNNING",
    "STARTED",
    "STARTING",
    "COLLECTING",
    "ANALYZING",
    "SCORING",
    "SAVING",
    "QUEUED",
    "WAITING",
    "PENDING",
}


# ─────────────────────────────────────────────────────────────────────────────
# Website classification
# ─────────────────────────────────────────────────────────────────────────────

SOCIAL_PLATFORMS = (
    "facebook.com", "instagram.com", "x.com", "twitter.com", "linkedin.com",
    "youtube.com", "tiktok.com", "pinterest.com", "snapchat.com", "reddit.com",
    "t.me", "telegram.me", "wa.me", "wa.link", "whatsapp.com", "vk.com",
    "behance.net", "dribbble.com", "medium.com", "substack.com", "quora.com",
    "threads.net", "weibo.com", "blogger.com",
    # Official social / messaging short links (redirect to the platform).
    "fb.watch", "m.me", "instagr.am", "lnkd.in", "youtu.be", "t.co",
)

MARKETPLACE_PLATFORMS = (
    "booking.com", "airbnb.com", "agoda.com", "yelp.com", "tripadvisor.com",
    "justdial.com", "indiamart.com", "alibaba.com", "amazon.com", "amazon.in",
    "ebay.com", "etsy.com", "wixsite.com", "myfreesites.com", "wordpress.com",
    "blogspot.com", "weebly.com", "squarespace.com", "godaddysites.com",
    "webflow.io", "notion.site", "carrd.co", "about.me", "linktr.ee",
    "business.site", "goo.gl", "shopify.com", "mystrikingly.com",
)

GOOGLE_PROFILE_HOSTS = ("maps.google.com", "business.google.com", "g.page")


def classify_website(url: Any) -> str:
    """
    Classify a lead's website value.

    Returns one of:
      - NO_WEBSITE            (empty / placeholder value)
      - INVALID               (malformed URL or non-URL text)
      - SOCIAL_PROFILE        (Facebook / Instagram / etc.)
      - GOOGLE_BUSINESS       (Google Maps / Business Profile)
      - MARKETPLACE_PROFILE   (Booking / JustDial / directory page)
      - PROFESSIONAL_WEBSITE  (a real business website — eligible)
    """
    if not url:
        return "NO_WEBSITE"

    cleaned = str(url).strip()
    if cleaned.lower() in ("-", "n/a", "none", "null", "no", "na", "unknown", "not available"):
        return "NO_WEBSITE"

    if re.search(r"\s", cleaned):
        return "INVALID"

    if not re.match(r"^https?://", cleaned, re.IGNORECASE):
        cleaned = "http://" + cleaned

    try:
        parsed = urlparse(cleaned)
        host = (parsed.netloc or "").lower()
    except Exception:
        return "INVALID"

    host = host.removeprefix("www.")
    # Strip the mobile "m." prefix only when the remainder still looks like a
    # host (m.facebook.com → facebook.com) — never when "m" is the whole
    # label (m.me is Facebook's Messenger short link and must be kept).
    if host.startswith("m.") and "." in host[2:]:
        host = host[2:]
    host = host.split("@")[-1]

    if not host:
        return "INVALID"
    if not re.fullmatch(r"[a-z0-9\-\.]+", host):
        return "INVALID"
    if "." not in host or host.endswith("."):
        return "INVALID"

    for platform in SOCIAL_PLATFORMS:
        if host == platform or host.endswith("." + platform):
            return "SOCIAL_PROFILE"

    for platform in MARKETPLACE_PLATFORMS:
        if host == platform or host.endswith("." + platform):
            return "MARKETPLACE_PROFILE"

    if host == "google.com" or host.endswith(".google.com") or host == "g.page":
        # sites.google.com hosts real business websites; Maps / Business
        # Profile links are just directory listings.
        if host.startswith("sites."):
            return "PROFESSIONAL_WEBSITE"
        return "GOOGLE_BUSINESS"

    return "PROFESSIONAL_WEBSITE"


# Human-readable reason per classification.
WEBSITE_REASON = {
    "NO_WEBSITE": "No website found.",
    "INVALID": "Invalid or malformed website URL.",
    "SOCIAL_PROFILE": "Website is a social media profile, not a business website.",
    "GOOGLE_BUSINESS": "Website is a Google Business listing, not a business website.",
    "MARKETPLACE_PROFILE": "Website is a directory / marketplace listing, not a business website.",
}


def website_dedup_key(url: Any) -> str:
    """
    Normalize a website URL into a stable key so identical websites (www vs
    non-www, http vs https, trailing slash) collapse into one analysis job.
    """
    if not url:
        return ""
    cleaned = str(url).strip().lower()
    if re.search(r"\s", cleaned):
        return ""
    if not re.match(r"^https?://", cleaned):
        cleaned = "http://" + cleaned
    try:
        parsed = urlparse(cleaned)
        host = parsed.netloc.lower()
    except Exception:
        return ""
    host = host.removeprefix("www.")
    path = parsed.path.rstrip("/")
    return f"{host}{path}"


# ─────────────────────────────────────────────────────────────────────────────
# Lead resolution
# ─────────────────────────────────────────────────────────────────────────────

def build_lead_filter(filters: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Translate request filters into a MongoDB query (mirrors GET /leads)."""
    filters = filters or {}
    query: Dict[str, Any] = {}
    filter_clauses = []

    keyword = filters.get("keyword") or filters.get("search")
    if keyword:
        filter_clauses.append({
            "$or": [
                {"name": {"$regex": re.escape(str(keyword)), "$options": "i"}},
                {"address": {"$regex": re.escape(str(keyword)), "$options": "i"}},
                {"phone": {"$regex": re.escape(str(keyword)), "$options": "i"}},
                {"email": {"$regex": re.escape(str(keyword)), "$options": "i"}},
            ]
        })

    job_id = filters.get("job_id") or filters.get("source_job_id") or filters.get("search_job_id")
    if job_id:
        filter_clauses.append({
            "$or": [
                {"source_job_id": job_id},
                {"job_id": job_id},
                {"search_job_id": job_id},
            ]
        })

    if filter_clauses:
        if len(filter_clauses) == 1:
            query["$or"] = filter_clauses[0]["$or"]
        else:
            query["$and"] = filter_clauses

    if filters.get("has_website") in (True, "true", "True"):
        query["website"] = {"$nin": ["", None]}
    elif filters.get("has_website") in (False, "false", "False"):
        query["website"] = {"$in": ["", None]}

    if filters.get("has_phone") in (True, "true", "True"):
        query["phone"] = {"$nin": ["", None]}
    if filters.get("has_email") in (True, "true", "True"):
        query["email"] = {"$nin": ["", None]}

    if filters.get("status"):
        query["status"] = str(filters["status"])

    if filters.get("city"):
        query["city"] = {"$regex": re.escape(str(filters["city"])), "$options": "i"}
    if filters.get("state"):
        query["state"] = {"$regex": re.escape(str(filters["state"])), "$options": "i"}
    if filters.get("country"):
        query["country"] = str(filters["country"])
    if filters.get("category"):
        query["category"] = {"$regex": re.escape(str(filters["category"])), "$options": "i"}

    if filters.get("min_rating"):
        try:
            query["google_rating"] = {"$gte": float(filters["min_rating"])}
        except (TypeError, ValueError):
            pass

    return query


async def resolve_lead_docs(
    db,
    lead_ids: Optional[List[str]],
    filters: Optional[Dict[str, Any]],
    user_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Resolve the lead documents that should be considered for bulk analysis.

    When lead_ids are given they are used verbatim; otherwise all leads
    matching the provided filters are loaded.
    """
    if lead_ids:
        cleaned = [str(l) for l in lead_ids if str(l).strip()]
        if not cleaned:
            return []
        oids = []
        for lid in cleaned:
            oid = to_object_id(lid)
            oids.append(oid)
        find_query: Dict[str, Any] = {"_id": {"$in": oids}}
        if user_id:
            find_query["user_id"] = user_id
        docs = await db["leads"].find(find_query).to_list(length=20000)
        by_id = {str(d["_id"]): d for d in docs}
        return [by_id[l] for l in cleaned if l in by_id]

    query = build_lead_filter(filters)
    if user_id and "user_id" not in query:
        query["user_id"] = user_id
    docs = await db["leads"].find(query).to_list(length=20000)
    return docs


# ─────────────────────────────────────────────────────────────────────────────
# Eligibility
# ─────────────────────────────────────────────────────────────────────────────

async def classify_leads(db, lead_docs: List[Dict[str, Any]], reanalyze: bool = False) -> Dict[str, Any]:
    """
    Classify every lead into eligible jobs (de-duplicated by website) or a
    skipped record with a reason.

    Returns: {"job_specs": [...], "skipped": [...], "counts": {...}}
    """
    skipped: List[Dict[str, Any]] = []
    eligible_docs: List[Dict[str, Any]] = []

    for doc in lead_docs:
        if doc is None:
            skipped.append({
                "lead_id": None,
                "name": None,
                "website": None,
                "reason": "Lead not found or deleted.",
                "category": "DELETED",
            })
            continue

        lead_id = str(doc.get("_id"))
        website = str(doc.get("website") or "").strip()
        classification = classify_website(website)

        if classification != "PROFESSIONAL_WEBSITE":
            skipped.append({
                "lead_id": lead_id,
                "name": doc.get("name"),
                "website": website or None,
                "reason": "Website not eligible for analysis.",
                "category": classification,
            })
            continue

        eligible_docs.append(doc)

    # Batch check: any existing non-terminal job for these leads means the
    # lead is already queued or currently analyzing.
    busy_lead_ids: set = set()
    if eligible_docs:
        lead_id_list = [str(d["_id"]) for d in eligible_docs]
        existing = await db["ai_analysis_jobs"].find(
            {"lead_id": {"$in": lead_id_list}, "status": {"$in": [s.value for s in NON_TERMINAL_JOB_STATES]}},
            {"lead_id": 1},
        ).to_list(length=50000)
        busy_lead_ids = {e["lead_id"] for e in existing}

    by_website: Dict[str, List[Dict[str, Any]]] = {}
    for doc in eligible_docs:
        lead_id = str(doc.get("_id"))
        ai = doc.get("ai_analysis") or {}
        analysis_status = (ai.get("analysis_status") or "").strip()

        if not reanalyze and analysis_status in SUCCESS_LEAD_STATUSES:
            skipped.append({
                "lead_id": lead_id,
                "name": doc.get("name"),
                "website": doc.get("website"),
                "reason": "Website already analyzed.",
                "category": "ALREADY_ANALYZED",
            })
            continue

        if analysis_status in ACTIVE_LEAD_STATUSES:
            skipped.append({
                "lead_id": lead_id,
                "name": doc.get("name"),
                "website": doc.get("website"),
                "reason": "Website is currently being analyzed.",
                "category": "CURRENTLY_ANALYZING",
            })
            continue

        if lead_id in busy_lead_ids:
            skipped.append({
                "lead_id": lead_id,
                "name": doc.get("name"),
                "website": doc.get("website"),
                "reason": "Lead already has a queued or running analysis job.",
                "category": "ALREADY_QUEUED",
            })
            continue

        key = website_dedup_key(doc.get("website"))
        if not key:
            skipped.append({
                "lead_id": lead_id,
                "name": doc.get("name"),
                "website": doc.get("website"),
                "reason": WEBSITE_REASON.get("INVALID", "Invalid or malformed website URL."),
                "category": "INVALID_URL",
            })
            continue

        by_website.setdefault(key, []).append(doc)

    job_specs: List[Dict[str, Any]] = []
    for key, docs in by_website.items():
        primary = docs[0]
        linked = [str(d["_id"]) for d in docs[1:]]
        job_specs.append({
            "website_url": str(primary.get("website")).strip(),
            "lead_id": str(primary["_id"]),
            "name": primary.get("name"),
            "linked_lead_ids": linked,
            "duplicate_count": len(docs),
        })

    counts: Dict[str, int] = {
        "total_leads": len(lead_docs),
        "eligible_leads": len(job_specs),
        "duplicate_leads": sum(max(0, s["duplicate_count"] - 1) for s in job_specs),
        "already_analyzed": 0,
        "already_queued": 0,
        "currently_analyzing": 0,
        "no_website": 0,
        "invalid_url": 0,
        "deleted": 0,
        "non_professional_website": 0,
    }
    for skip in skipped:
        category = skip.get("category") or "INVALID"
        if category == "NO_WEBSITE":
            counts["no_website"] += 1
        elif category == "INVALID" or category == "INVALID_URL":
            counts["invalid_url"] += 1
        elif category == "ALREADY_ANALYZED":
            counts["already_analyzed"] += 1
        elif category == "ALREADY_QUEUED":
            counts["already_queued"] += 1
        elif category == "CURRENTLY_ANALYZING":
            counts["currently_analyzing"] += 1
        elif category == "DELETED":
            counts["deleted"] += 1
        else:
            counts["non_professional_website"] += 1

    return {"job_specs": job_specs, "skipped": skipped, "counts": counts}


# ─────────────────────────────────────────────────────────────────────────────
# Public API used by routes
# ─────────────────────────────────────────────────────────────────────────────

def build_prepare_report(classification: Dict[str, Any]) -> Dict[str, Any]:
    """Build the human/UI-facing eligibility summary (no DB writes)."""
    counts = classification["counts"]
    job_specs = classification["job_specs"]

    # Cap preview arrays so responses stay small for very large lead sets.
    skipped_preview = classification["skipped"][:500]
    website_preview = [
        {
            "website": s["website_url"],
            "business_name": s.get("name"),
            "lead_id": s["lead_id"],
            "linked_lead_count": len(s["linked_lead_ids"]),
        }
        for s in job_specs
    ][:200]

    return {
        "total_leads": counts["total_leads"],
        "eligible_websites": counts["eligible_leads"],
        "duplicate_leads": counts["duplicate_leads"],
        "ready_to_analyze": counts["eligible_leads"],
        "already_analyzed": counts["already_analyzed"],
        "already_queued": counts["already_queued"],
        "currently_analyzing": counts["currently_analyzing"],
        "no_website": counts["no_website"],
        "invalid_url": counts["invalid_url"],
        "deleted": counts["deleted"],
        "non_professional_website": counts["non_professional_website"],
        "skipped_leads": skipped_preview,
        "websites": website_preview,
    }


async def prepare_bulk_analysis(
    db,
    lead_ids: Optional[List[str]] = None,
    filters: Optional[Dict[str, Any]] = None,
    user_id: Optional[str] = None,
    reanalyze: bool = False,
) -> Dict[str, Any]:
    """Compute the eligibility report without creating a queue."""
    lead_docs = await resolve_lead_docs(db, lead_ids, filters, user_id=user_id)
    classification = await classify_leads(db, lead_docs, reanalyze=reanalyze)
    return build_prepare_report(classification)


async def create_bulk_queue(
    db,
    user_id: str,
    name: Optional[str] = "Bulk AI Website Analysis",
    lead_ids: Optional[List[str]] = None,
    filters: Optional[Dict[str, Any]] = None,
    concurrency: int = 3,
    filter_user_id: Optional[str] = None,
    reanalyze: bool = False,
) -> Tuple[Optional[AIAnalysisQueueInDB], Dict[str, Any]]:
    """
    Persist a bulk queue: one job per unique website, linked-lead dedup and a
    skipped-leads ledger. Returns (queue, report); queue is None when there is
    nothing eligible to analyze.
    """
    lead_docs = await resolve_lead_docs(db, lead_ids, filters, user_id=filter_user_id)
    classification = await classify_leads(db, lead_docs, reanalyze=reanalyze)
    report = build_prepare_report(classification)

    job_specs = classification["job_specs"]
    if not job_specs:
        return None, report

    queue_id = ObjectId()
    now = datetime.now(timezone.utc)

    jobs = []
    for spec in job_specs:
        job = AIAnalysisJobCreate(
            queue_id=str(queue_id),
            lead_id=spec["lead_id"],
            website_url=spec["website_url"],
            status=AIAnalysisState.WAITING,
            linked_lead_ids=spec["linked_lead_ids"],
            is_bulk=True,
        )
        job_dict = job.model_dump()
        job_dict["_id"] = ObjectId()
        jobs.append(job_dict)

    await db["ai_analysis_jobs"].insert_many(jobs)

    total_leads = sum(1 + len(s["linked_lead_ids"]) for s in job_specs)
    duplicate_leads = total_leads - len(jobs)

    # Bound the skipped ledger so very large runs never bloat the queue doc.
    skipped_ledger = classification["skipped"][:1000]

    queue = AIAnalysisQueueCreate(
        name=name or "Bulk AI Website Analysis",
        user_id=user_id or "system",
        total_jobs=len(jobs),
        status=AIAnalysisState.WAITING,
        is_bulk=True,
        concurrency=concurrency,
        total_leads=total_leads,
        duplicate_leads=duplicate_leads,
        skipped_leads=skipped_ledger,
        pending_jobs=len(jobs),
    )
    queue_dict = queue.model_dump()
    queue_dict["_id"] = queue_id
    await db["ai_analysis_queues"].insert_one(queue_dict)

    try:
        await manager.broadcast_to_job(str(queue_id), {
            "type": "BULK_QUEUE_CREATED",
            "event_type": "BULK_QUEUE_CREATED",
            "queue_id": str(queue_id),
            "stage": "Queued",
            "progress": 0.0,
            "status": AIAnalysisState.WAITING.value,
            "total_jobs": len(jobs),
            "total_leads": total_leads,
            "duplicate_leads": duplicate_leads,
            "concurrency": concurrency,
            "message": f"Bulk analysis queue created with {len(jobs)} unique website(s) and {duplicate_leads} linked lead(s).",
            "timestamp": now.isoformat(),
        })

        # Streaming "Queued <business> (<website>)" log lines (capped so very
        # large runs never flood the event stream).
        for spec in job_specs[:500]:
            await manager.broadcast_to_job(str(queue_id), {
                "type": "bulk_log",
                "event_type": "bulk_log",
                "queue_id": str(queue_id),
                "level": "info",
                "business_name": spec.get("name"),
                "website": spec["website_url"],
                "message": f"Queued {spec.get('name') or spec['website_url']} ({spec['website_url']})",
                "timestamp": now.isoformat(),
            })
    except Exception as ws_err:
        logger.warning(f"Failed to broadcast bulk queue creation for {queue_id}: {ws_err}")

    logger.info(
        f"Created bulk AI Analysis Queue {queue_id} with {len(jobs)} unique website jobs "
        f"({duplicate_leads} linked leads) for user {user_id}. Concurrency: {concurrency}"
    )
    return AIAnalysisQueueInDB(**queue_dict), report


# ─────────────────────────────────────────────────────────────────────────────
# Startup recovery (resume support)
# ─────────────────────────────────────────────────────────────────────────────

async def recover_bulk_queues(db) -> int:
    """
    Resume unfinished bulk work after a backend restart.

    Any job stuck in an active processing state (STARTED / RUNNING / ...)
    is reset to WAITING so the dispatcher picks it up again. Jobs in terminal
    states are never touched — completed work never restarts.
    """
    bulk_queues = await db["ai_analysis_queues"].find(
        {"is_bulk": True, "status": {"$in": [s.value for s in ACTIVE_QUEUE_STATES]}}
    ).to_list(length=100)

    recovered = 0
    now = datetime.now(timezone.utc)
    for queue in bulk_queues:
        qid = str(queue["_id"])
        result = await db["ai_analysis_jobs"].update_many(
            {"queue_id": qid, "status": {"$in": [s.value for s in ACTIVE_JOB_STATES]}},
            {
                "$set": {"status": AIAnalysisState.WAITING.value, "updated_at": now},
                "$unset": {"started_at": ""},
            },
        )
        recovered += result.modified_count

        await db["ai_analysis_queues"].update_one(
            {"_id": queue["_id"]},
            {"$set": {"running_jobs": 0, "updated_at": now}},
        )

    if recovered:
        logger.info(f"BULK_RECOVERY: Reset {recovered} interrupted bulk job(s) to WAITING for resume.")
    return recovered


async def list_bulk_queues(db, user_id: str) -> List[Dict[str, Any]]:
    """List bulk queues for a user (summary only — no full job payloads)."""
    queues = await db["ai_analysis_queues"].find(
        {"user_id": user_id, "is_bulk": True}
    ).sort("created_at", -1).to_list(length=50)

    summary = []
    for q in queues:
        summary.append({
            "id": str(q.get("_id")),
            "name": q.get("name"),
            "status": q.get("status"),
            "total_jobs": q.get("total_jobs") or 0,
            "completed_jobs": q.get("completed_jobs") or 0,
            "failed_jobs": q.get("failed_jobs") or 0,
            "skipped_jobs": q.get("skipped_jobs") or 0,
            "running_jobs": q.get("running_jobs") or 0,
            "pending_jobs": q.get("pending_jobs") or 0,
            "overall_progress": q.get("overall_progress") or 0.0,
            "total_leads": q.get("total_leads") or 0,
            "duplicate_leads": q.get("duplicate_leads") or 0,
            "leads_analyzed": q.get("leads_analyzed") or 0,
            "duplicate_leads_completed": q.get("duplicate_leads_completed") or 0,
            "concurrency": q.get("concurrency") or 1,
            "skipped_leads_count": len(q.get("skipped_leads") or []),
            "started_at": q.get("started_at"),
            "completed_at": q.get("completed_at"),
            "created_at": q.get("created_at"),
        })
    return summary
