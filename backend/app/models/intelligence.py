from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# ─────────────────────────────────────────────────────────────────────────────
# Filter Parameters
# ─────────────────────────────────────────────────────────────────────────────

class FilterParams(BaseModel):
    user_id: Optional[str] = None
    keyword: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    area: Optional[str] = None
    industry: Optional[str] = None
    technology: Optional[str] = None
    cms: Optional[str] = None
    min_website_score: Optional[int] = None
    max_website_score: Optional[int] = None
    min_seo_score: Optional[int] = None
    max_seo_score: Optional[int] = None
    min_performance_score: Optional[int] = None
    max_performance_score: Optional[int] = None
    min_opportunity_score: Optional[int] = None
    max_opportunity_score: Optional[int] = None
    lead_priority: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None


# ─────────────────────────────────────────────────────────────────────────────
# KPI Dashboard
# ─────────────────────────────────────────────────────────────────────────────

class KPIDashboard(BaseModel):
    user_id: Optional[str] = None
    # Lead counts
    total_leads: int = 0
    analyzed_leads: int = 0
    pending_analysis: int = 0
    failed_analysis: int = 0

    # Website contact stats
    total_websites: int = 0
    websites_with_email: int = 0
    websites_without_email: int = 0
    websites_with_phone: int = 0
    websites_without_phone: int = 0

    # Average scores (0-100)
    avg_website_score: float = 0.0
    avg_seo_score: float = 0.0
    avg_performance_score: float = 0.0
    avg_ui_score: float = 0.0
    avg_ux_score: float = 0.0
    avg_security_score: float = 0.0
    avg_accessibility_score: float = 0.0
    avg_business_opportunity_score: float = 0.0
    avg_lead_priority: float = 0.0

    # Metadata
    computed_at: datetime = Field(default_factory=datetime.utcnow)


# ─────────────────────────────────────────────────────────────────────────────
# Chart Data
# ─────────────────────────────────────────────────────────────────────────────

class ChartDataPoint(BaseModel):
    user_id: Optional[str] = None
    name: str
    value: int
    percentage: float = 0.0
    color: Optional[str] = None


class TrendDataPoint(BaseModel):
    user_id: Optional[str] = None
    date: str
    value: float
    label: Optional[str] = None


class DistributionCharts(BaseModel):
    user_id: Optional[str] = None
    website_score: List[ChartDataPoint] = Field(default_factory=list)
    seo_score: List[ChartDataPoint] = Field(default_factory=list)
    performance_score: List[ChartDataPoint] = Field(default_factory=list)
    ui_score: List[ChartDataPoint] = Field(default_factory=list)
    ux_score: List[ChartDataPoint] = Field(default_factory=list)
    security_score: List[ChartDataPoint] = Field(default_factory=list)
    accessibility_score: List[ChartDataPoint] = Field(default_factory=list)
    technology: List[ChartDataPoint] = Field(default_factory=list)
    cms: List[ChartDataPoint] = Field(default_factory=list)
    hosting: List[ChartDataPoint] = Field(default_factory=list)
    programming_language: List[ChartDataPoint] = Field(default_factory=list)
    business_opportunity: List[ChartDataPoint] = Field(default_factory=list)
    lead_priority: List[ChartDataPoint] = Field(default_factory=list)
    industry: List[ChartDataPoint] = Field(default_factory=list)
    country: List[ChartDataPoint] = Field(default_factory=list)
    state: List[ChartDataPoint] = Field(default_factory=list)
    city: List[ChartDataPoint] = Field(default_factory=list)
    computed_at: datetime = Field(default_factory=datetime.utcnow)


# ─────────────────────────────────────────────────────────────────────────────
# Top Opportunities / Leaderboard Leads
# ─────────────────────────────────────────────────────────────────────────────

class TopLead(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    name: Optional[str] = None
    website: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    industry: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    tiktok_url: Optional[str] = None
    tiktok_found: Optional[bool] = None

    # Scores
    website_score: Optional[int] = None
    seo_score: Optional[int] = None
    performance_score: Optional[int] = None
    ui_score: Optional[int] = None
    ux_score: Optional[int] = None
    security_score: Optional[int] = None
    accessibility_score: Optional[int] = None
    business_opportunity_score: Optional[int] = None
    lead_priority_score: Optional[int] = None

    # Performance
    lcp_ms: Optional[float] = None
    fcp_ms: Optional[float] = None

    # Issues count
    seo_issues_count: Optional[int] = None
    security_issues_count: Optional[int] = None
    ui_issues_count: Optional[int] = None
    ux_issues_count: Optional[int] = None

    analyzed_at: Optional[datetime] = None


class TopOpportunitiesResponse(BaseModel):
    user_id: Optional[str] = None
    highest_opportunity: List[TopLead] = Field(default_factory=list)
    worst_websites: List[TopLead] = Field(default_factory=list)
    best_websites: List[TopLead] = Field(default_factory=list)
    fastest_websites: List[TopLead] = Field(default_factory=list)
    slowest_websites: List[TopLead] = Field(default_factory=list)
    highest_seo_problems: List[TopLead] = Field(default_factory=list)
    security_risks: List[TopLead] = Field(default_factory=list)
    ui_problems: List[TopLead] = Field(default_factory=list)
    ux_problems: List[TopLead] = Field(default_factory=list)
    computed_at: datetime = Field(default_factory=datetime.utcnow)


# ─────────────────────────────────────────────────────────────────────────────
# AI Business Insights
# ─────────────────────────────────────────────────────────────────────────────

class InsightItem(BaseModel):
    user_id: Optional[str] = None
    label: str
    count: int
    percentage: float = 0.0
    severity: Optional[str] = None
    examples: List[str] = Field(default_factory=list)


class AIInsightsResponse(BaseModel):
    user_id: Optional[str] = None
    top_problems: List[InsightItem] = Field(default_factory=list)
    common_seo_issues: List[InsightItem] = Field(default_factory=list)
    common_performance_problems: List[InsightItem] = Field(default_factory=list)
    common_ui_problems: List[InsightItem] = Field(default_factory=list)
    common_security_issues: List[InsightItem] = Field(default_factory=list)
    missing_features: List[InsightItem] = Field(default_factory=list)
    requested_services: List[InsightItem] = Field(default_factory=list)
    avg_business_opportunity: float = 0.0
    industry_trends: List[Dict[str, Any]] = Field(default_factory=list)
    computed_at: datetime = Field(default_factory=datetime.utcnow)


# ─────────────────────────────────────────────────────────────────────────────
# Leaderboards
# ─────────────────────────────────────────────────────────────────────────────

class LeaderboardEntry(BaseModel):
    user_id: Optional[str] = None
    rank: int
    lead_id: str
    name: Optional[str] = None
    website: Optional[str] = None
    score: float
    city: Optional[str] = None
    country: Optional[str] = None


class LeaderboardsResponse(BaseModel):
    user_id: Optional[str] = None
    highest_seo: List[LeaderboardEntry] = Field(default_factory=list)
    lowest_seo: List[LeaderboardEntry] = Field(default_factory=list)
    highest_performance: List[LeaderboardEntry] = Field(default_factory=list)
    lowest_performance: List[LeaderboardEntry] = Field(default_factory=list)
    highest_opportunity: List[LeaderboardEntry] = Field(default_factory=list)
    highest_security: List[LeaderboardEntry] = Field(default_factory=list)
    lowest_security: List[LeaderboardEntry] = Field(default_factory=list)
    best_ui: List[LeaderboardEntry] = Field(default_factory=list)
    worst_ui: List[LeaderboardEntry] = Field(default_factory=list)
    computed_at: datetime = Field(default_factory=datetime.utcnow)


# ─────────────────────────────────────────────────────────────────────────────
# Heatmaps
# ─────────────────────────────────────────────────────────────────────────────

class HeatmapCell(BaseModel):
    user_id: Optional[str] = None
    x: str
    y: str
    value: float
    count: int = 0


class HeatmapsResponse(BaseModel):
    user_id: Optional[str] = None
    technology_industry: List[HeatmapCell] = Field(default_factory=list)
    industry_score: List[HeatmapCell] = Field(default_factory=list)
    country_opportunity: List[HeatmapCell] = Field(default_factory=list)
    country_seo: List[HeatmapCell] = Field(default_factory=list)
    business_opportunity_geo: List[HeatmapCell] = Field(default_factory=list)
    computed_at: datetime = Field(default_factory=datetime.utcnow)


# ─────────────────────────────────────────────────────────────────────────────
# Historical / Trend Data
# ─────────────────────────────────────────────────────────────────────────────

class DailyAggregate(BaseModel):
    user_id: Optional[str] = None
    date: str  # YYYY-MM-DD
    total_leads: int = 0
    analyzed_leads: int = 0
    avg_website_score: float = 0.0
    avg_seo_score: float = 0.0
    avg_performance_score: float = 0.0
    avg_opportunity_score: float = 0.0
    new_leads: int = 0
    completed_analyses: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TrendResponse(BaseModel):
    user_id: Optional[str] = None
    period: str  # daily, weekly, monthly
    field: str
    data: List[TrendDataPoint] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Reports & Export
# ─────────────────────────────────────────────────────────────────────────────

class ReportRequest(BaseModel):
    user_id: Optional[str] = None
    period: str = "daily"  # daily, weekly, monthly, yearly, custom
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    format: str = "json"  # json, csv, excel, pdf


class ReportSummary(BaseModel):
    user_id: Optional[str] = None
    period: str
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    kpis: KPIDashboard
    top_opportunities: List[TopLead] = Field(default_factory=list)
    top_insights: List[InsightItem] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    
