"""
intelligence.py — FastAPI Router
Enterprise AI Lead Intelligence Dashboard API
All endpoints are additive — no existing routes modified.
"""
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.db.database import get_db
from app.models.intelligence import (
    AIInsightsResponse,
    DistributionCharts,
    FilterParams,
    HeatmapsResponse,
    KPIDashboard,
    LeaderboardsResponse,
    ReportRequest,
    ReportSummary,
    TopOpportunitiesResponse,
    TrendResponse,
)
from app.services.intelligence_service import (
    export_to_csv,
    export_to_excel,
    generate_report,
    get_ai_insights,
    get_distribution_charts,
    get_heatmaps,
    get_kpi_dashboard,
    get_leaderboards,
    get_top_opportunities,
    get_trend_data,
    invalidate_cache,
    write_daily_aggregate,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Filter dependency
# ─────────────────────────────────────────────────────────────────────────────

def get_filters(
    keyword: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    area: Optional[str] = Query(None),
    industry: Optional[str] = Query(None),
    technology: Optional[str] = Query(None),
    cms: Optional[str] = Query(None),
    min_website_score: Optional[int] = Query(None, ge=0, le=100),
    max_website_score: Optional[int] = Query(None, ge=0, le=100),
    min_seo_score: Optional[int] = Query(None, ge=0, le=100),
    max_seo_score: Optional[int] = Query(None, ge=0, le=100),
    min_performance_score: Optional[int] = Query(None, ge=0, le=100),
    max_performance_score: Optional[int] = Query(None, ge=0, le=100),
    min_opportunity_score: Optional[int] = Query(None, ge=0, le=100),
    max_opportunity_score: Optional[int] = Query(None, ge=0, le=100),
    lead_priority: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
) -> FilterParams:
    return FilterParams(
        keyword=keyword,
        country=country,
        state=state,
        city=city,
        area=area,
        industry=industry,
        technology=technology,
        cms=cms,
        min_website_score=min_website_score,
        max_website_score=max_website_score,
        min_seo_score=min_seo_score,
        max_seo_score=max_seo_score,
        min_performance_score=min_performance_score,
        max_performance_score=max_performance_score,
        min_opportunity_score=min_opportunity_score,
        max_opportunity_score=max_opportunity_score,
        lead_priority=lead_priority,
        date_from=date_from,
        date_to=date_to,
    )


# ─────────────────────────────────────────────────────────────────────────────
# KPI Dashboard
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/kpis", response_model=KPIDashboard, summary="Get all global KPIs")
async def get_kpis(
    db=Depends(get_db),
    filters: FilterParams = Depends(get_filters),
):
    """Returns all 19 KPI metrics for the intelligence dashboard."""
    return await get_kpi_dashboard(db, filters)


# ─────────────────────────────────────────────────────────────────────────────
# Distribution Charts
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/charts/distributions", response_model=DistributionCharts, summary="Get all distribution charts data")
async def get_charts(
    db=Depends(get_db),
    filters: FilterParams = Depends(get_filters),
):
    """Returns data for all 17 analytics distribution charts."""
    return await get_distribution_charts(db, filters)


# ─────────────────────────────────────────────────────────────────────────────
# Trend Data
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/charts/trends", response_model=TrendResponse, summary="Get trend / historical data")
async def get_trends(
    period: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    field: str = Query("total_leads"),
    db=Depends(get_db),
):
    """Returns time-series trend data from historical aggregates."""
    return await get_trend_data(db, period, field)


# ─────────────────────────────────────────────────────────────────────────────
# Top Opportunities
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/top-opportunities", response_model=TopOpportunitiesResponse, summary="Get top 50 opportunity lists")
async def get_top_opp(
    db=Depends(get_db),
    filters: FilterParams = Depends(get_filters),
):
    """Returns 9 top-50 ranked lists: best/worst websites, opportunities, SEO problems, etc."""
    return await get_top_opportunities(db, filters)


# ─────────────────────────────────────────────────────────────────────────────
# AI Business Insights
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/insights", response_model=AIInsightsResponse, summary="Get AI-generated business insights")
async def get_insights(
    db=Depends(get_db),
    filters: FilterParams = Depends(get_filters),
):
    """Returns aggregated AI insights: common issues, missing features, industry trends."""
    return await get_ai_insights(db, filters)


# ─────────────────────────────────────────────────────────────────────────────
# Leaderboards
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/leaderboards", response_model=LeaderboardsResponse, summary="Get all 9 leaderboards")
async def get_lb(
    limit: int = Query(10, ge=1, le=50),
    db=Depends(get_db),
):
    """Returns 9 ranked leaderboards: SEO, Performance, Security, UI, Opportunity."""
    return await get_leaderboards(db, limit)


# ─────────────────────────────────────────────────────────────────────────────
# Heatmaps
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/heatmaps", response_model=HeatmapsResponse, summary="Get heatmap matrix data")
async def get_hm(db=Depends(get_db)):
    """Returns 5 heatmap matrices: Technology×Industry, Country×Opportunity, etc."""
    return await get_heatmaps(db)


# ─────────────────────────────────────────────────────────────────────────────
# Reports
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/reports", response_model=ReportSummary, summary="Generate executive report")
async def get_report(
    period: str = Query("daily", pattern="^(daily|weekly|monthly|yearly|custom)$"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db=Depends(get_db),
):
    """Generates a report summary for the given period."""
    req = ReportRequest(period=period, date_from=date_from, date_to=date_to)
    return await generate_report(db, req)


# ─────────────────────────────────────────────────────────────────────────────
# Export
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/export", summary="Export dashboard data")
async def export_data(
    format: str = Query("csv", pattern="^(csv|excel|json)$"),
    db=Depends(get_db),
    filters: FilterParams = Depends(get_filters),
):
    """Exports top opportunity leads in CSV, Excel, or JSON format."""
    top_opp = await get_top_opportunities(db, filters)
    leads = top_opp.highest_opportunity

    if format == "json":
        content = json.dumps([l.model_dump() for l in leads], indent=2, default=str)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=intelligence_export.json"},
        )
    elif format == "excel":
        data = export_to_excel(leads)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=intelligence_export.xlsx"},
        )
    else:  # csv
        data = export_to_csv(leads)
        return Response(
            content=data,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=intelligence_export.csv"},
        )


# ─────────────────────────────────────────────────────────────────────────────
# Admin: Manual cache invalidation and aggregate computation
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/aggregates/compute", summary="Manually trigger daily aggregate computation")
async def compute_aggregates(db=Depends(get_db)):
    """Triggers a manual computation of today's daily aggregate snapshot."""
    await write_daily_aggregate(db)
    invalidate_cache()
    return {"message": "Daily aggregate computed and cache invalidated"}


@router.post("/cache/invalidate", summary="Invalidate the intelligence cache")
async def clear_cache():
    """Clears the in-memory analytics cache, forcing fresh computation on next request."""
    invalidate_cache()
    return {"message": "Cache invalidated successfully"}
