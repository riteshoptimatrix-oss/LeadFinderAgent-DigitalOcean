"""
intelligence_service.py
Core analytics engine for the Enterprise AI Lead Intelligence Dashboard.
All operations are READ-ONLY against existing collections.
"""
import asyncio
import logging
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.intelligence import (
    AIInsightsResponse,
    ChartDataPoint,
    DailyAggregate,
    DistributionCharts,
    FilterParams,
    HeatmapCell,
    HeatmapsResponse,
    InsightItem,
    KPIDashboard,
    LeaderboardEntry,
    LeaderboardsResponse,
    ReportRequest,
    ReportSummary,
    TopLead,
    TopOpportunitiesResponse,
    TrendDataPoint,
    TrendResponse,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# In-Memory TTL Cache
# ─────────────────────────────────────────────────────────────────────────────

_cache: Dict[str, Tuple[Any, float]] = {}

def _cache_key(*parts) -> str:
    return ":".join(str(p) for p in parts)

def _cache_get(key: str, ttl: float) -> Optional[Any]:
    if key in _cache:
        value, ts = _cache[key]
        if time.monotonic() - ts < ttl:
            return value
    return None

def _cache_set(key: str, value: Any) -> None:
    _cache[key] = (value, time.monotonic())

def invalidate_cache() -> None:
    """Call this when new analysis completes to force refresh."""
    _cache.clear()
    logger.info("Intelligence cache invalidated")


# ─────────────────────────────────────────────────────────────────────────────
# Score bucket helpers
# ─────────────────────────────────────────────────────────────────────────────

SCORE_BUCKETS = [
    (0, 20, "0-20"),
    (20, 40, "20-40"),
    (40, 60, "40-60"),
    (60, 80, "60-80"),
    (80, 101, "80-100"),
]

COLORS_PALETTE = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
    "#10b981", "#3b82f6", "#ef4444", "#14b8a6",
    "#f97316", "#84cc16", "#06b6d4", "#e11d48",
]


def _bucket_label(score: int) -> str:
    for lo, hi, label in SCORE_BUCKETS:
        if lo <= score < hi:
            return label
    return "80-100"


def _build_filter_match(filters: Optional[FilterParams]) -> Dict:
    match: Dict[str, Any] = {}
    if not filters:
        return match
    if filters.keyword:
        match["$or"] = [
            {"name": {"$regex": filters.keyword, "$options": "i"}},
            {"website": {"$regex": filters.keyword, "$options": "i"}},
            {"category": {"$regex": filters.keyword, "$options": "i"}},
        ]
    if filters.country:
        match["country"] = {"$regex": filters.country, "$options": "i"}
    if filters.state:
        match["state"] = {"$regex": filters.state, "$options": "i"}
    if filters.city:
        match["city"] = {"$regex": filters.city, "$options": "i"}
    if filters.industry:
        match["category"] = {"$regex": filters.industry, "$options": "i"}
    if filters.date_from or filters.date_to:
        date_query: Dict = {}
        if filters.date_from:
            date_query["$gte"] = filters.date_from
        if filters.date_to:
            date_query["$lte"] = filters.date_to
        match["created_at"] = date_query
    return match


# ─────────────────────────────────────────────────────────────────────────────
# KPI Dashboard
# ─────────────────────────────────────────────────────────────────────────────

async def get_kpi_dashboard(
    db: AsyncIOMotorDatabase, filters: Optional[FilterParams] = None
) -> KPIDashboard:
    cache_key = _cache_key("kpi", str(filters))
    cached = _cache_get(cache_key, ttl=60)
    if cached:
        return cached

    lead_match = _build_filter_match(filters)

    try:
        # Parallel queries for performance
        results = await asyncio.gather(
            db["leads"].count_documents(lead_match),
            db["leads"].count_documents({**lead_match, "website": {"$ne": None, "$ne": ""}}),
            db["leads"].count_documents({**lead_match, "email": {"$ne": None, "$ne": ""}}),
            db["leads"].count_documents({**lead_match, "phone": {"$ne": None, "$ne": ""}}),
            db["advanced_analysis_queue"].count_documents({"status": "COMPLETED"}),
            db["advanced_analysis_queue"].count_documents({"status": {"$in": ["PENDING", "QUEUED", "RUNNING"]}}),
            db["advanced_analysis_queue"].count_documents({"status": "FAILED"}),
            _get_avg_score(db, "advanced_analysis_queue", "website_quality_score", lead_match),
            _get_avg_score_from_collection(db, "seo_analysis_results", "scorecard.overall_score"),
            _get_avg_score_from_collection(db, "performance_analysis_results", "scorecard.overall_desktop_score"),
            _get_avg_score_from_collection(db, "ui_ux_analysis_results", "scorecard.overall_ui_score"),
            _get_avg_score_from_collection(db, "ui_ux_analysis_results", "scorecard.overall_ux_score"),
            _get_avg_score_from_collection(db, "security_analysis_results", "scorecard.overall_security_score"),
            _get_avg_score_from_collection(db, "security_analysis_results", "scorecard.accessibility_score"),
            _get_avg_score_from_collection(db, "business_intelligence_results", "scorecard.business_opportunity_score"),
            _get_avg_score_from_collection(db, "business_intelligence_results", "scorecard.lead_priority_score"),
            return_exceptions=True,
        )

        def safe_int(v):
            return int(v) if isinstance(v, int) else 0

        def safe_float(v):
            return round(float(v), 1) if isinstance(v, (int, float)) else 0.0

        total_leads = safe_int(results[0])
        total_websites = safe_int(results[1])
        websites_with_email = safe_int(results[2])
        websites_with_phone = safe_int(results[3])
        analyzed_leads = safe_int(results[4])
        pending_analysis = safe_int(results[5])
        failed_analysis = safe_int(results[6])

        kpi = KPIDashboard(
            total_leads=total_leads,
            analyzed_leads=analyzed_leads,
            pending_analysis=pending_analysis,
            failed_analysis=failed_analysis,
            total_websites=total_websites,
            websites_with_email=websites_with_email,
            websites_without_email=total_websites - websites_with_email,
            websites_with_phone=websites_with_phone,
            websites_without_phone=total_websites - websites_with_phone,
            avg_website_score=safe_float(results[7]),
            avg_seo_score=safe_float(results[8]),
            avg_performance_score=safe_float(results[9]),
            avg_ui_score=safe_float(results[10]),
            avg_ux_score=safe_float(results[11]),
            avg_security_score=safe_float(results[12]),
            avg_accessibility_score=safe_float(results[13]),
            avg_business_opportunity_score=safe_float(results[14]),
            avg_lead_priority=safe_float(results[15]),
        )
        _cache_set(cache_key, kpi)
        return kpi

    except Exception as e:
        logger.error(f"Error computing KPI dashboard: {e}")
        return KPIDashboard()


async def _get_avg_score(db, collection: str, field: str, match: Dict) -> float:
    try:
        pipeline = [{"$match": match}, {"$group": {"_id": None, "avg": {"$avg": f"${field}"}}}]
        result = await db[collection].aggregate(pipeline).to_list(length=1)
        return round(result[0]["avg"], 1) if result and result[0].get("avg") else 0.0
    except Exception:
        return 0.0


async def _get_avg_score_from_collection(db, collection: str, field: str) -> float:
    try:
        pipeline = [{"$group": {"_id": None, "avg": {"$avg": f"${field}"}}}]
        result = await db[collection].aggregate(pipeline).to_list(length=1)
        return round(result[0]["avg"], 1) if result and result[0].get("avg") else 0.0
    except Exception:
        return 0.0


# ─────────────────────────────────────────────────────────────────────────────
# Distribution Charts
# ─────────────────────────────────────────────────────────────────────────────

async def get_distribution_charts(
    db: AsyncIOMotorDatabase, filters: Optional[FilterParams] = None
) -> DistributionCharts:
    cache_key = _cache_key("charts", str(filters))
    cached = _cache_get(cache_key, ttl=300)
    if cached:
        return cached

    try:
        results = await asyncio.gather(
            _score_distribution(db, "advanced_analysis_queue", "website_quality_score"),
            _score_distribution(db, "seo_analysis_results", "scorecard.overall_score"),
            _score_distribution(db, "performance_analysis_results", "scorecard.overall_desktop_score"),
            _score_distribution(db, "ui_ux_analysis_results", "scorecard.overall_ui_score"),
            _score_distribution(db, "ui_ux_analysis_results", "scorecard.overall_ux_score"),
            _score_distribution(db, "security_analysis_results", "scorecard.overall_security_score"),
            _score_distribution(db, "security_analysis_results", "scorecard.accessibility_score"),
            _technology_distribution(db, "CMS"),
            _technology_distribution(db, "Hosting"),
            _technology_distribution(db, "Programming Language"),
            _score_distribution(db, "business_intelligence_results", "scorecard.business_opportunity_score"),
            _priority_distribution(db),
            _geo_distribution(db, "category"),
            _geo_distribution(db, "country"),
            _geo_distribution(db, "state"),
            _geo_distribution(db, "city"),
            _technology_distribution(db, None),  # all technologies
            return_exceptions=True,
        )

        def safe(v):
            return v if isinstance(v, list) else []

        charts = DistributionCharts(
            website_score=safe(results[0]),
            seo_score=safe(results[1]),
            performance_score=safe(results[2]),
            ui_score=safe(results[3]),
            ux_score=safe(results[4]),
            security_score=safe(results[5]),
            accessibility_score=safe(results[6]),
            cms=safe(results[7]),
            hosting=safe(results[8]),
            programming_language=safe(results[9]),
            business_opportunity=safe(results[10]),
            lead_priority=safe(results[11]),
            industry=safe(results[12]),
            country=safe(results[13]),
            state=safe(results[14]),
            city=safe(results[15]),
            technology=safe(results[16]),
        )
        _cache_set(cache_key, charts)
        return charts

    except Exception as e:
        logger.error(f"Error computing distribution charts: {e}")
        return DistributionCharts()


async def _score_distribution(db, collection: str, field: str) -> List[ChartDataPoint]:
    try:
        pipeline = [
            {"$match": {field: {"$exists": True, "$ne": None}}},
            {"$bucket": {
                "groupBy": f"${field}",
                "boundaries": [0, 20, 40, 60, 80, 101],
                "default": "Other",
                "output": {"count": {"$sum": 1}}
            }}
        ]
        raw = await db[collection].aggregate(pipeline).to_list(length=10)
        total = sum(r.get("count", 0) for r in raw)
        labels = ["0-20", "20-40", "40-60", "60-80", "80-100"]
        result = []
        for i, r in enumerate(raw):
            if r.get("_id") == "Other":
                continue
            label = labels[i] if i < len(labels) else str(r.get("_id", ""))
            count = r.get("count", 0)
            result.append(ChartDataPoint(
                name=label,
                value=count,
                percentage=round(count / total * 100, 1) if total else 0.0,
                color=COLORS_PALETTE[i % len(COLORS_PALETTE)],
            ))
        return result
    except Exception as e:
        logger.warning(f"Score distribution error ({collection}/{field}): {e}")
        return []


async def _technology_distribution(db, category: Optional[str]) -> List[ChartDataPoint]:
    try:
        if category:
            pass

        pipeline = [
            {"$unwind": "$technologies"},
        ]
        if category:
            pipeline.append({"$match": {"technologies.category": category}})
        pipeline += [
            {"$group": {"_id": "$technologies.name", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 20},
        ]
        raw = await db["technology_detections"].aggregate(pipeline).to_list(length=20)
        total = sum(r.get("count", 0) for r in raw)
        return [
            ChartDataPoint(
                name=r["_id"] or "Unknown",
                value=r["count"],
                percentage=round(r["count"] / total * 100, 1) if total else 0.0,
                color=COLORS_PALETTE[i % len(COLORS_PALETTE)],
            )
            for i, r in enumerate(raw) if r.get("_id")
        ]
    except Exception as e:
        logger.warning(f"Technology distribution error: {e}")
        return []


async def _geo_distribution(db, field: str) -> List[ChartDataPoint]:
    try:
        pipeline = [
            {"$match": {field: {"$ne": None, "$ne": ""}}},
            {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 30},
        ]
        raw = await db["leads"].aggregate(pipeline).to_list(length=30)
        total = sum(r.get("count", 0) for r in raw)
        return [
            ChartDataPoint(
                name=r["_id"],
                value=r["count"],
                percentage=round(r["count"] / total * 100, 1) if total else 0.0,
                color=COLORS_PALETTE[i % len(COLORS_PALETTE)],
            )
            for i, r in enumerate(raw) if r.get("_id")
        ]
    except Exception as e:
        logger.warning(f"Geo distribution error ({field}): {e}")
        return []


async def _priority_distribution(db) -> List[ChartDataPoint]:
    try:
        pipeline = [
            {"$match": {"priority_classification": {"$ne": None}}},
            {"$group": {"_id": "$priority_classification", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        raw = await db["business_intelligence_results"].aggregate(pipeline).to_list(length=10)
        total = sum(r.get("count", 0) for r in raw)
        color_map = {"Critical": "#ef4444", "High": "#f59e0b", "Medium": "#3b82f6", "Low": "#10b981"}
        return [
            ChartDataPoint(
                name=r["_id"],
                value=r["count"],
                percentage=round(r["count"] / total * 100, 1) if total else 0.0,
                color=color_map.get(r["_id"], "#6366f1"),
            )
            for r in raw if r.get("_id")
        ]
    except Exception as e:
        logger.warning(f"Priority distribution error: {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Top Opportunities
# ─────────────────────────────────────────────────────────────────────────────

async def get_top_opportunities(
    db: AsyncIOMotorDatabase, filters: Optional[FilterParams] = None
) -> TopOpportunitiesResponse:
    cache_key = _cache_key("top_opp", str(filters))
    cached = _cache_get(cache_key, ttl=300)
    if cached:
        return cached

    try:
        results = await asyncio.gather(
            _top_leads_by_score(db, "business_opportunity_score", -1),
            _top_leads_by_score(db, "website_score", 1),    # worst
            _top_leads_by_score(db, "website_score", -1),   # best
            _top_leads_by_perf(db, -1),   # fastest (highest perf score)
            _top_leads_by_perf(db, 1),    # slowest
            _top_leads_by_issues(db, "seo_issues_count", -1),
            _top_leads_by_score(db, "security_score", 1),   # lowest security = biggest risk
            _top_leads_by_score(db, "ui_score", 1),         # worst UI
            _top_leads_by_score(db, "ux_score", 1),         # worst UX
            return_exceptions=True,
        )

        def safe(v):
            return v if isinstance(v, list) else []

        resp = TopOpportunitiesResponse(
            highest_opportunity=safe(results[0]),
            worst_websites=safe(results[1]),
            best_websites=safe(results[2]),
            fastest_websites=safe(results[3]),
            slowest_websites=safe(results[4]),
            highest_seo_problems=safe(results[5]),
            security_risks=safe(results[6]),
            ui_problems=safe(results[7]),
            ux_problems=safe(results[8]),
        )
        _cache_set(cache_key, resp)
        return resp
    except Exception as e:
        logger.error(f"Error computing top opportunities: {e}")
        return TopOpportunitiesResponse()


async def _build_enriched_lead(db, lead_doc: Dict) -> TopLead:
    """Enrich a raw lead document with scores from analysis collections."""
    lead_id = str(lead_doc.get("_id", ""))

    # Fetch analysis results in parallel
    bi, seo, perf, uiux, sec = await asyncio.gather(
        db["business_intelligence_results"].find_one({"lead_id": lead_id}),
        db["seo_analysis_results"].find_one({"lead_id": lead_id}),
        db["performance_analysis_results"].find_one({"lead_id": lead_id}),
        db["ui_ux_analysis_results"].find_one({"lead_id": lead_id}),
        db["security_analysis_results"].find_one({"lead_id": lead_id}),
        return_exceptions=True,
    )

    def safe_doc(d):
        return d if isinstance(d, dict) else {}

    bi = safe_doc(bi)
    seo = safe_doc(seo)
    perf = safe_doc(perf)
    uiux = safe_doc(uiux)
    sec = safe_doc(sec)

    bi_card = bi.get("scorecard", {})
    seo_card = seo.get("scorecard", {})
    perf_card = perf.get("scorecard", {})
    uiux_card = uiux.get("scorecard", {})
    sec_card = sec.get("scorecard", {})

    return TopLead(
        lead_id=lead_id,
        name=lead_doc.get("name"),
        website=lead_doc.get("website"),
        city=lead_doc.get("city"),
        state=lead_doc.get("state"),
        country=lead_doc.get("country"),
        industry=lead_doc.get("category"),
        email=lead_doc.get("email"),
        phone=lead_doc.get("phone"),
        tiktok_found=bool((lead_doc.get("tiktok") or {}).get("found")),
        tiktok_url=(lead_doc.get("tiktok") or {}).get("url") if (lead_doc.get("tiktok") or {}).get("found") else None,
        website_score=bi_card.get("overall_website_score"),
        seo_score=seo_card.get("overall_score"),
        performance_score=perf_card.get("overall_desktop_score"),
        ui_score=uiux_card.get("overall_ui_score"),
        ux_score=uiux_card.get("overall_ux_score"),
        security_score=sec_card.get("overall_security_score"),
        accessibility_score=sec_card.get("accessibility_score"),
        business_opportunity_score=bi_card.get("business_opportunity_score"),
        lead_priority_score=bi_card.get("lead_priority_score"),
        lcp_ms=perf.get("desktop_cwv", {}).get("lcp_ms"),
        fcp_ms=perf.get("desktop_cwv", {}).get("fcp_ms"),
        seo_issues_count=len(seo.get("issues", [])),
        security_issues_count=len(sec.get("issues", [])),
        ui_issues_count=len(uiux.get("issues", [])),
        ux_issues_count=len(uiux.get("issues", [])),
    )


async def _top_leads_by_score(db, score_field: str, direction: int, limit: int = 50) -> List[TopLead]:
    """Get top leads sorted by a joined score field from analysis collections."""
    try:
        # Map field names to their source collection and nested path
        field_map = {
            "business_opportunity_score": ("business_intelligence_results", "scorecard.business_opportunity_score"),
            "website_score": ("business_intelligence_results", "scorecard.overall_website_score"),
            "security_score": ("security_analysis_results", "scorecard.overall_security_score"),
            "ui_score": ("ui_ux_analysis_results", "scorecard.overall_ui_score"),
            "ux_score": ("ui_ux_analysis_results", "scorecard.overall_ux_score"),
        }

        if score_field in field_map:
            collection, nested_field = field_map[score_field]
            pipeline = [
                {"$match": {nested_field: {"$exists": True, "$ne": None}}},
                {"$sort": {nested_field: direction}},
                {"$limit": limit},
                {"$project": {"lead_id": 1, nested_field: 1}},
            ]
            raw = await db[collection].aggregate(pipeline).to_list(length=limit)
            lead_ids = [r.get("lead_id") for r in raw if r.get("lead_id")]

            leads = []
            for lead_id in lead_ids:
                lead_doc = await db["leads"].find_one({"_id": lead_id})
                if not lead_doc:
                    lead_doc = await db["leads"].find_one({"_id": str(lead_id)})
                if lead_doc:
                    leads.append(await _build_enriched_lead(db, lead_doc))
            return leads
        return []
    except Exception as e:
        logger.warning(f"Top leads by score error ({score_field}): {e}")
        return []


async def _top_leads_by_perf(db, direction: int, limit: int = 50) -> List[TopLead]:
    try:
        pipeline = [
            {"$match": {"scorecard.overall_desktop_score": {"$exists": True, "$ne": None}}},
            {"$sort": {"scorecard.overall_desktop_score": direction}},
            {"$limit": limit},
        ]
        raw = await db["performance_analysis_results"].aggregate(pipeline).to_list(length=limit)
        leads = []
        for r in raw:
            lead_id = r.get("lead_id", "")
            lead_doc = await db["leads"].find_one({"_id": lead_id})
            if not lead_doc:
                lead_doc = await db["leads"].find_one({"_id": str(lead_id)})
            if lead_doc:
                leads.append(await _build_enriched_lead(db, lead_doc))
        return leads
    except Exception as e:
        logger.warning(f"Top leads by perf error: {e}")
        return []


async def _top_leads_by_issues(db, count_field: str, direction: int, limit: int = 50) -> List[TopLead]:
    try:
        pipeline = [
            {"$addFields": {"issues_count": {"$size": {"$ifNull": ["$issues", []]}}}},
            {"$sort": {"issues_count": direction}},
            {"$limit": limit},
        ]
        collection = "seo_analysis_results" if "seo" in count_field else "security_analysis_results"
        raw = await db[collection].aggregate(pipeline).to_list(length=limit)
        leads = []
        for r in raw:
            lead_id = r.get("lead_id", "")
            lead_doc = await db["leads"].find_one({"_id": lead_id})
            if not lead_doc:
                lead_doc = await db["leads"].find_one({"_id": str(lead_id)})
            if lead_doc:
                leads.append(await _build_enriched_lead(db, lead_doc))
        return leads
    except Exception as e:
        logger.warning(f"Top leads by issues error: {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# AI Business Insights
# ─────────────────────────────────────────────────────────────────────────────

async def get_ai_insights(
    db: AsyncIOMotorDatabase, filters: Optional[FilterParams] = None
) -> AIInsightsResponse:
    cache_key = _cache_key("insights", str(filters))
    cached = _cache_get(cache_key, ttl=1800)
    if cached:
        return cached

    try:
        results = await asyncio.gather(
            _aggregate_issues(db, "seo_analysis_results", "issues", "issue_type"),
            _aggregate_issues(db, "performance_analysis_results", "issues", "issue_type"),
            _aggregate_issues(db, "ui_ux_analysis_results", "issues", "issue_type"),
            _aggregate_issues(db, "security_analysis_results", "issues", "issue_type"),
            _aggregate_opportunities(db),
            _aggregate_services(db),
            _get_avg_score_from_collection(db, "business_intelligence_results", "scorecard.business_opportunity_score"),
            _industry_trends(db),
            return_exceptions=True,
        )

        def safe_list(v):
            return v if isinstance(v, list) else []

        def safe_float(v):
            return float(v) if isinstance(v, (int, float)) else 0.0

        # Top problems = union of all issues
        all_issues = []
        for r in results[:4]:
            if isinstance(r, list):
                all_issues.extend(r)
        all_issues.sort(key=lambda x: x.count, reverse=True)

        resp = AIInsightsResponse(
            top_problems=all_issues[:15],
            common_seo_issues=safe_list(results[0])[:15],
            common_performance_problems=safe_list(results[1])[:15],
            common_ui_problems=safe_list(results[2])[:15],
            common_security_issues=safe_list(results[3])[:15],
            missing_features=safe_list(results[4])[:15],
            requested_services=safe_list(results[5])[:15],
            avg_business_opportunity=safe_float(results[6]),
            industry_trends=results[7] if isinstance(results[7], list) else [],
        )
        _cache_set(cache_key, resp)
        return resp
    except Exception as e:
        logger.error(f"Error computing AI insights: {e}")
        return AIInsightsResponse()


async def _aggregate_issues(db, collection: str, issues_field: str, type_field: str) -> List[InsightItem]:
    try:
        pipeline = [
            {"$unwind": f"${issues_field}"},
            {"$group": {
                "_id": f"${issues_field}.{type_field}",
                "count": {"$sum": 1},
                "severity": {"$first": f"${issues_field}.severity"},
                "examples": {"$push": "$website_url"},
            }},
            {"$sort": {"count": -1}},
            {"$limit": 20},
        ]
        raw = await db[collection].aggregate(pipeline).to_list(length=20)
        total = sum(r.get("count", 0) for r in raw)
        return [
            InsightItem(
                label=r["_id"] or "Unknown",
                count=r["count"],
                percentage=round(r["count"] / total * 100, 1) if total else 0.0,
                severity=r.get("severity"),
                examples=list(set(r.get("examples", [])))[:3],
            )
            for r in raw if r.get("_id")
        ]
    except Exception as e:
        logger.warning(f"Aggregate issues error ({collection}): {e}")
        return []


async def _aggregate_opportunities(db) -> List[InsightItem]:
    try:
        pipeline = [
            {"$unwind": "$opportunities"},
            {"$group": {
                "_id": "$opportunities.opportunity_type",
                "count": {"$sum": 1},
                "avg_score": {"$avg": "$opportunities.opportunity_score"},
            }},
            {"$sort": {"count": -1}},
            {"$limit": 15},
        ]
        raw = await db["business_intelligence_results"].aggregate(pipeline).to_list(length=15)
        total = sum(r.get("count", 0) for r in raw)
        return [
            InsightItem(
                label=r["_id"] or "Unknown",
                count=r["count"],
                percentage=round(r["count"] / total * 100, 1) if total else 0.0,
            )
            for r in raw if r.get("_id")
        ]
    except Exception as e:
        logger.warning(f"Aggregate opportunities error: {e}")
        return []


async def _aggregate_services(db) -> List[InsightItem]:
    try:
        pipeline = [
            {"$unwind": "$service_opportunities"},
            {"$group": {
                "_id": "$service_opportunities.service_name",
                "count": {"$sum": 1},
                "avg_score": {"$avg": "$service_opportunities.opportunity_score"},
            }},
            {"$sort": {"count": -1}},
            {"$limit": 15},
        ]
        raw = await db["sales_intelligence_results"].aggregate(pipeline).to_list(length=15)
        total = sum(r.get("count", 0) for r in raw)
        return [
            InsightItem(
                label=r["_id"] or "Unknown",
                count=r["count"],
                percentage=round(r["count"] / total * 100, 1) if total else 0.0,
            )
            for r in raw if r.get("_id")
        ]
    except Exception as e:
        logger.warning(f"Aggregate services error: {e}")
        return []


async def _industry_trends(db) -> List[Dict]:
    try:
        # Join leads with business intelligence by category
        pipeline = [
            {"$match": {"category": {"$ne": None, "$ne": ""}}},
            {"$group": {
                "_id": "$category",
                "count": {"$sum": 1},
                "cities": {"$addToSet": "$city"},
                "countries": {"$addToSet": "$country"},
            }},
            {"$sort": {"count": -1}},
            {"$limit": 15},
        ]
        raw = await db["leads"].aggregate(pipeline).to_list(length=15)
        return [
            {
                "industry": r["_id"],
                "count": r["count"],
                "cities": len([c for c in r.get("cities", []) if c]),
                "countries": len([c for c in r.get("countries", []) if c]),
            }
            for r in raw if r.get("_id")
        ]
    except Exception as e:
        logger.warning(f"Industry trends error: {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Leaderboards
# ─────────────────────────────────────────────────────────────────────────────

async def get_leaderboards(
    db: AsyncIOMotorDatabase, limit: int = 10
) -> LeaderboardsResponse:
    cache_key = _cache_key("leaderboards", limit)
    cached = _cache_get(cache_key, ttl=300)
    if cached:
        return cached

    try:
        results = await asyncio.gather(
            _leaderboard(db, "seo_analysis_results", "scorecard.overall_score", -1, limit),
            _leaderboard(db, "seo_analysis_results", "scorecard.overall_score", 1, limit),
            _leaderboard(db, "performance_analysis_results", "scorecard.overall_desktop_score", -1, limit),
            _leaderboard(db, "performance_analysis_results", "scorecard.overall_desktop_score", 1, limit),
            _leaderboard(db, "business_intelligence_results", "scorecard.business_opportunity_score", -1, limit),
            _leaderboard(db, "security_analysis_results", "scorecard.overall_security_score", -1, limit),
            _leaderboard(db, "security_analysis_results", "scorecard.overall_security_score", 1, limit),
            _leaderboard(db, "ui_ux_analysis_results", "scorecard.overall_ui_score", -1, limit),
            _leaderboard(db, "ui_ux_analysis_results", "scorecard.overall_ui_score", 1, limit),
            return_exceptions=True,
        )

        def safe(v):
            return v if isinstance(v, list) else []

        lb = LeaderboardsResponse(
            highest_seo=safe(results[0]),
            lowest_seo=safe(results[1]),
            highest_performance=safe(results[2]),
            lowest_performance=safe(results[3]),
            highest_opportunity=safe(results[4]),
            highest_security=safe(results[5]),
            lowest_security=safe(results[6]),
            best_ui=safe(results[7]),
            worst_ui=safe(results[8]),
        )
        _cache_set(cache_key, lb)
        return lb
    except Exception as e:
        logger.error(f"Error computing leaderboards: {e}")
        return LeaderboardsResponse()


async def _leaderboard(db, collection: str, score_field: str, direction: int, limit: int) -> List[LeaderboardEntry]:
    try:
        pipeline = [
            {"$match": {score_field: {"$exists": True, "$ne": None}}},
            {"$sort": {score_field: direction}},
            {"$limit": limit},
            {"$project": {"lead_id": 1, score_field: 1}},
        ]
        raw = await db[collection].aggregate(pipeline).to_list(length=limit)

        entries = []
        for rank, r in enumerate(raw, start=1):
            lead_id = r.get("lead_id", "")
            score_val = r
            for part in score_field.split("."):
                score_val = score_val.get(part, {}) if isinstance(score_val, dict) else 0
            if not isinstance(score_val, (int, float)):
                score_val = 0

            # Get lead info
            lead_doc = await db["leads"].find_one({"_id": lead_id})
            if not lead_doc:
                lead_doc = await db["leads"].find_one({"_id": str(lead_id)})

            entries.append(LeaderboardEntry(
                rank=rank,
                lead_id=str(lead_id),
                name=lead_doc.get("name") if lead_doc else None,
                website=lead_doc.get("website") if lead_doc else None,
                score=float(score_val),
                city=lead_doc.get("city") if lead_doc else None,
                country=lead_doc.get("country") if lead_doc else None,
            ))
        return entries
    except Exception as e:
        logger.warning(f"Leaderboard error ({collection}/{score_field}): {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Heatmaps
# ─────────────────────────────────────────────────────────────────────────────

async def get_heatmaps(db: AsyncIOMotorDatabase) -> HeatmapsResponse:
    cache_key = "heatmaps"
    cached = _cache_get(cache_key, ttl=600)
    if cached:
        return cached

    try:
        results = await asyncio.gather(
            _tech_industry_heatmap(db),
            _industry_score_heatmap(db),
            _country_opportunity_heatmap(db),
            _country_seo_heatmap(db),
            _geo_opportunity_heatmap(db),
            return_exceptions=True,
        )

        def safe(v):
            return v if isinstance(v, list) else []

        resp = HeatmapsResponse(
            technology_industry=safe(results[0]),
            industry_score=safe(results[1]),
            country_opportunity=safe(results[2]),
            country_seo=safe(results[3]),
            business_opportunity_geo=safe(results[4]),
        )
        _cache_set(cache_key, resp)
        return resp
    except Exception as e:
        logger.error(f"Error computing heatmaps: {e}")
        return HeatmapsResponse()


async def _tech_industry_heatmap(db) -> List[HeatmapCell]:
    try:
        # technology_detections joined with leads via lead_id
        pipeline = [
            {"$unwind": "$technologies"},
            {"$match": {"technologies.category": {"$in": ["CMS", "Frontend Framework", "Backend Framework"]}}},
            {"$lookup": {
                "from": "leads",
                "localField": "lead_id",
                "foreignField": "_id",
                "as": "lead"
            }},
            {"$unwind": {"path": "$lead", "preserveNullAndEmptyArrays": True}},
            {"$match": {"lead.category": {"$ne": None, "$ne": ""}}},
            {"$group": {
                "_id": {"tech": "$technologies.name", "industry": "$lead.category"},
                "count": {"$sum": 1},
            }},
            {"$sort": {"count": -1}},
            {"$limit": 200},
        ]
        raw = await db["technology_detections"].aggregate(pipeline).to_list(length=200)
        return [
            HeatmapCell(x=r["_id"]["tech"], y=r["_id"]["industry"], value=float(r["count"]), count=r["count"])
            for r in raw if r.get("_id", {}).get("tech") and r.get("_id", {}).get("industry")
        ]
    except Exception as e:
        logger.warning(f"Tech-industry heatmap error: {e}")
        return []


async def _industry_score_heatmap(db) -> List[HeatmapCell]:
    try:
        pipeline = [
            {"$match": {"category": {"$ne": None, "$ne": ""}}},
            {"$lookup": {
                "from": "business_intelligence_results",
                "localField": "_id",
                "foreignField": "lead_id",
                "as": "bi"
            }},
            {"$unwind": {"path": "$bi", "preserveNullAndEmptyArrays": True}},
            {"$group": {
                "_id": {"industry": "$category", "priority": "$bi.priority_classification"},
                "count": {"$sum": 1},
                "avg_score": {"$avg": "$bi.scorecard.business_opportunity_score"},
            }},
            {"$limit": 100},
        ]
        raw = await db["leads"].aggregate(pipeline).to_list(length=100)
        return [
            HeatmapCell(
                x=r["_id"].get("industry", "Unknown"),
                y=r["_id"].get("priority", "Unknown"),
                value=round(r.get("avg_score") or 0, 1),
                count=r["count"]
            )
            for r in raw if r.get("_id")
        ]
    except Exception as e:
        logger.warning(f"Industry score heatmap error: {e}")
        return []


async def _country_opportunity_heatmap(db) -> List[HeatmapCell]:
    try:
        pipeline = [
            {"$match": {"country": {"$ne": None, "$ne": ""}}},
            {"$lookup": {
                "from": "business_intelligence_results",
                "localField": "_id",
                "foreignField": "lead_id",
                "as": "bi"
            }},
            {"$unwind": {"path": "$bi", "preserveNullAndEmptyArrays": True}},
            {"$group": {
                "_id": {"country": "$country", "priority": "$bi.priority_classification"},
                "count": {"$sum": 1},
                "avg_opp": {"$avg": "$bi.scorecard.business_opportunity_score"},
            }},
            {"$sort": {"count": -1}},
            {"$limit": 100},
        ]
        raw = await db["leads"].aggregate(pipeline).to_list(length=100)
        return [
            HeatmapCell(
                x=r["_id"].get("country", "Unknown"),
                y=r["_id"].get("priority", "Unknown"),
                value=round(r.get("avg_opp") or 0, 1),
                count=r["count"]
            )
            for r in raw if r.get("_id")
        ]
    except Exception as e:
        logger.warning(f"Country opportunity heatmap error: {e}")
        return []


async def _country_seo_heatmap(db) -> List[HeatmapCell]:
    try:
        pipeline = [
            {"$match": {"country": {"$ne": None, "$ne": ""}}},
            {"$lookup": {
                "from": "seo_analysis_results",
                "localField": "_id",
                "foreignField": "lead_id",
                "as": "seo"
            }},
            {"$unwind": {"path": "$seo", "preserveNullAndEmptyArrays": True}},
            {"$group": {
                "_id": {"country": "$country", "industry": "$category"},
                "count": {"$sum": 1},
                "avg_seo": {"$avg": "$seo.scorecard.overall_score"},
            }},
            {"$sort": {"count": -1}},
            {"$limit": 100},
        ]
        raw = await db["leads"].aggregate(pipeline).to_list(length=100)
        return [
            HeatmapCell(
                x=r["_id"].get("country", "Unknown"),
                y=r["_id"].get("industry", "Unknown"),
                value=round(r.get("avg_seo") or 0, 1),
                count=r["count"]
            )
            for r in raw if r.get("_id")
        ]
    except Exception as e:
        logger.warning(f"Country SEO heatmap error: {e}")
        return []


async def _geo_opportunity_heatmap(db) -> List[HeatmapCell]:
    try:
        pipeline = [
            {"$match": {"country": {"$ne": None, "$ne": ""}, "city": {"$ne": None, "$ne": ""}}},
            {"$lookup": {
                "from": "business_intelligence_results",
                "localField": "_id",
                "foreignField": "lead_id",
                "as": "bi"
            }},
            {"$unwind": {"path": "$bi", "preserveNullAndEmptyArrays": True}},
            {"$group": {
                "_id": {"country": "$country", "city": "$city"},
                "count": {"$sum": 1},
                "avg_opp": {"$avg": "$bi.scorecard.business_opportunity_score"},
            }},
            {"$sort": {"avg_opp": -1}},
            {"$limit": 100},
        ]
        raw = await db["leads"].aggregate(pipeline).to_list(length=100)
        return [
            HeatmapCell(
                x=r["_id"].get("country", "Unknown"),
                y=r["_id"].get("city", "Unknown"),
                value=round(r.get("avg_opp") or 0, 1),
                count=r["count"]
            )
            for r in raw if r.get("_id")
        ]
    except Exception as e:
        logger.warning(f"Geo opportunity heatmap error: {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# Trend Data
# ─────────────────────────────────────────────────────────────────────────────

async def get_trend_data(
    db: AsyncIOMotorDatabase, period: str = "daily", field: str = "total_leads"
) -> TrendResponse:
    cache_key = _cache_key("trend", period, field)
    cached = _cache_get(cache_key, ttl=300)
    if cached:
        return cached

    try:
        collection_map = {
            "daily": "dashboard_daily_aggregates",
            "weekly": "dashboard_weekly_aggregates",
            "monthly": "dashboard_monthly_aggregates",
        }
        collection = collection_map.get(period, "dashboard_daily_aggregates")

        days_back = {"daily": 30, "weekly": 12, "monthly": 12}.get(period, 30)
        since = datetime.utcnow() - timedelta(days=days_back * 7 if period == "weekly" else days_back * 30 if period == "monthly" else days_back)

        raw = await db[collection].find(
            {"created_at": {"$gte": since}},
            sort=[("created_at", 1)],
            limit=100
        ).to_list(length=100)

        data = [
            TrendDataPoint(
                date=r.get("date", str(r.get("created_at", ""))[:10]),
                value=float(r.get(field, 0) or 0),
            )
            for r in raw
        ]

        # If no historical data yet, fall back to live 30-day leads trend
        if not data and field == "total_leads":
            data = await _live_leads_trend(db, days_back)

        resp = TrendResponse(period=period, field=field, data=data)
        _cache_set(cache_key, resp)
        return resp
    except Exception as e:
        logger.error(f"Error computing trend data: {e}")
        return TrendResponse(period=period, field=field, data=[])


async def _live_leads_trend(db, days: int) -> List[TrendDataPoint]:
    points = []
    for i in range(days - 1, -1, -1):
        day = datetime.utcnow() - timedelta(days=i)
        start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        count = await db["leads"].count_documents({"created_at": {"$gte": start, "$lt": end}})
        points.append(TrendDataPoint(date=start.strftime("%b %d"), value=float(count)))
    return points


# ─────────────────────────────────────────────────────────────────────────────
# Daily Aggregate Writer
# ─────────────────────────────────────────────────────────────────────────────

async def write_daily_aggregate(db: AsyncIOMotorDatabase) -> None:
    """Write today's KPI snapshot to dashboard_daily_aggregates."""
    try:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        kpi = await get_kpi_dashboard(db)
        agg = DailyAggregate(
            date=today,
            total_leads=kpi.total_leads,
            analyzed_leads=kpi.analyzed_leads,
            avg_website_score=kpi.avg_website_score,
            avg_seo_score=kpi.avg_seo_score,
            avg_performance_score=kpi.avg_performance_score,
            avg_opportunity_score=kpi.avg_business_opportunity_score,
            new_leads=0,  # could be computed with a date filter
            completed_analyses=kpi.analyzed_leads,
        )
        await db["dashboard_daily_aggregates"].update_one(
            {"date": today},
            {"$set": agg.model_dump()},
            upsert=True,
        )
        logger.info(f"Daily aggregate written for {today}")
    except Exception as e:
        logger.error(f"Error writing daily aggregate: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Reports & Export
# ─────────────────────────────────────────────────────────────────────────────

async def generate_report(
    db: AsyncIOMotorDatabase, req: ReportRequest
) -> ReportSummary:
    # Compute filters from period
    now = datetime.utcnow()
    period_map = {
        "daily": timedelta(days=1),
        "weekly": timedelta(weeks=1),
        "monthly": timedelta(days=30),
        "yearly": timedelta(days=365),
    }
    filters = FilterParams()
    if req.period in period_map:
        filters.date_from = now - period_map[req.period]
        filters.date_to = now
    elif req.date_from and req.date_to:
        filters.date_from = req.date_from
        filters.date_to = req.date_to

    kpi = await get_kpi_dashboard(db, filters)
    top_opp = await get_top_opportunities(db, filters)
    insights = await get_ai_insights(db, filters)

    return ReportSummary(
        period=req.period,
        date_from=str(filters.date_from)[:10] if filters.date_from else None,
        date_to=str(filters.date_to)[:10] if filters.date_to else None,
        kpis=kpi,
        top_opportunities=top_opp.highest_opportunity[:10],
        top_insights=insights.top_problems[:10],
    )


def export_to_csv(leads: List[TopLead]) -> str:
    """Convert list of TopLead to CSV string."""
    try:
        import pandas as pd
        data = [l.model_dump() for l in leads]
        df = pd.DataFrame(data)
        return df.to_csv(index=False)
    except Exception as e:
        logger.error(f"CSV export error: {e}")
        return ""


def export_to_excel(leads: List[TopLead]) -> bytes:
    """Convert list of TopLead to Excel bytes."""
    try:
        import pandas as pd
        import io
        data = [l.model_dump() for l in leads]
        df = pd.DataFrame(data)
        buffer = io.BytesIO()
        df.to_excel(buffer, index=False, engine="openpyxl")
        return buffer.getvalue()
    except Exception as e:
        logger.error(f"Excel export error: {e}")
        return b""
