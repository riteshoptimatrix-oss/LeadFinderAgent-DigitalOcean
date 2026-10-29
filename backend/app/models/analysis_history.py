"""
Analysis History Models
========================
Strongly typed models for versioned AI Analysis history.

Every Lead may be analyzed multiple times. This module provides
the schema for historical snapshots and comparison results.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


# ─────────────────────────────────────────────────────────
# Analysis History Snapshot
# ─────────────────────────────────────────────────────────

class AnalysisScoreSummary(BaseModel):
    user_id: Optional[str] = None
    """Score snapshot for a single analysis run."""
    overall_score: Optional[int] = None
    seo_score: Optional[int] = None
    performance_score: Optional[int] = None
    ui_score: Optional[int] = None
    ux_score: Optional[int] = None
    accessibility_score: Optional[int] = None
    security_score: Optional[int] = None
    business_opportunity: Optional[int] = None
    contact_completeness_score: Optional[int] = None


class AnalysisHistorySnapshot(BaseModel):
    user_id: Optional[str] = None
    """
    A frozen point-in-time snapshot of a completed AI analysis.
    Stored in Lead.historical_analyses[] array.
    """
    version: int = Field(description="Analysis run number (1, 2, 3...)")
    label: str = Field(description="Display label (e.g. 'Analysis #1' or 'Initial Scan')")
    archived_at: datetime = Field(description="When this snapshot was created")
    
    # Analysis Metadata
    analysis_status: str = Field(description="'Completed' or 'Failed'")
    analysis_version: str = Field(default="1.0", description="Analysis engine version")
    analysis_date: Optional[datetime] = Field(description="When analysis completed")
    analysis_started_at: Optional[datetime] = None
    analysis_completed_at: Optional[datetime] = None
    analysis_duration: Optional[float] = Field(description="Duration in seconds")
    
    # Scores Summary
    scores: AnalysisScoreSummary = Field(default_factory=AnalysisScoreSummary)
    
    # Convenience score accessors (duplicated from scores for easy access)
    overall_score: Optional[int] = None
    seo_score: Optional[int] = None
    performance_score: Optional[int] = None
    ui_score: Optional[int] = None
    ux_score: Optional[int] = None
    accessibility_score: Optional[int] = None
    security_score: Optional[int] = None
    business_opportunity: Optional[int] = None
    
    # Full Sub-Document Snapshots
    website_information: Optional[Dict[str, Any]] = None
    website_structure: Optional[Dict[str, Any]] = None
    contact_discovery: Optional[Dict[str, Any]] = None
    social_media: Optional[Dict[str, Any]] = None
    technology_detection: Optional[Dict[str, Any]] = None
    seo: Optional[Dict[str, Any]] = None
    performance: Optional[Dict[str, Any]] = None
    design: Optional[Dict[str, Any]] = None
    business: Optional[Dict[str, Any]] = None


# ─────────────────────────────────────────────────────────
# Change Detection
# ─────────────────────────────────────────────────────────

class ScoreDelta(BaseModel):
    user_id: Optional[str] = None
    """Tracks change in a single score metric."""
    previous: Optional[float] = None
    latest: Optional[float] = None
    delta: Optional[float] = None
    direction: str = Field(default="unchanged", description="'improved', 'degraded', or 'unchanged'")


class ScoreComparison(BaseModel):
    user_id: Optional[str] = None
    """Complete score comparison between two analyses."""
    overall_score: ScoreDelta = Field(default_factory=ScoreDelta)
    seo_score: ScoreDelta = Field(default_factory=ScoreDelta)
    performance_score: ScoreDelta = Field(default_factory=ScoreDelta)
    ui_score: ScoreDelta = Field(default_factory=ScoreDelta)
    ux_score: ScoreDelta = Field(default_factory=ScoreDelta)
    accessibility_score: ScoreDelta = Field(default_factory=ScoreDelta)
    security_score: ScoreDelta = Field(default_factory=ScoreDelta)
    business_opportunity: ScoreDelta = Field(default_factory=ScoreDelta)


class TechnologyChange(BaseModel):
    user_id: Optional[str] = None
    """Tracks a change in technology stack."""
    field: str = Field(description="cms, hosting, frontend_framework, etc.")
    previous: Optional[str] = None
    latest: Optional[str] = None
    change_type: str = Field(description="'added', 'removed', or 'changed'")


class ContactChange(BaseModel):
    user_id: Optional[str] = None
    """Tracks discovered or removed contacts."""
    new_emails: List[str] = Field(default_factory=list)
    removed_emails: List[str] = Field(default_factory=list)
    new_phones: List[str] = Field(default_factory=list)
    removed_phones: List[str] = Field(default_factory=list)
    new_whatsapp: List[str] = Field(default_factory=list)
    removed_whatsapp: List[str] = Field(default_factory=list)


class WebsiteChange(BaseModel):
    user_id: Optional[str] = None
    """Tracks structural and content changes."""
    new_pages: int = Field(default=0)
    removed_pages: int = Field(default=0)
    new_broken_links: int = Field(default=0)
    fixed_links: int = Field(default=0)


class ChangeSummary(BaseModel):
    user_id: Optional[str] = None
    """Human-readable summary of all detected changes."""
    new_contacts_discovered: List[str] = Field(default_factory=list)
    removed_contacts: List[str] = Field(default_factory=list)
    new_technologies: List[TechnologyChange] = Field(default_factory=list)
    website_improvements: List[str] = Field(default_factory=list)
    website_issues: List[str] = Field(default_factory=list)
    score_difference: ScoreComparison = Field(default_factory=ScoreComparison)


class AnalysisComparison(BaseModel):
    user_id: Optional[str] = None
    """
    Complete comparison between two analysis runs.
    Generated by comparing previous and latest analysis snapshots.
    """
    previous_version: Optional[int] = Field(description="Version number of previous analysis")
    latest_version: int = Field(description="Version number of latest analysis")
    
    # Detailed Change Detection
    contact_changes: ContactChange = Field(default_factory=ContactChange)
    website_changes: WebsiteChange = Field(default_factory=WebsiteChange)
    technology_changes: List[TechnologyChange] = Field(default_factory=list)
    
    # SEO & Performance Trends
    seo_improvements: bool = Field(default=False)
    seo_degradation: bool = Field(default=False)
    performance_improvement: bool = Field(default=False)
    performance_degradation: bool = Field(default=False)
    
    # CMS and Infrastructure Changes
    cms_changes: List[TechnologyChange] = Field(default_factory=list)
    hosting_changes: List[TechnologyChange] = Field(default_factory=list)
    
    # Complete Score Comparison
    score_difference: ScoreComparison = Field(default_factory=ScoreComparison)
    
    # Human-Readable Summary
    change_summary: ChangeSummary = Field(default_factory=ChangeSummary)


# ─────────────────────────────────────────────────────────
# History Timeline
# ─────────────────────────────────────────────────────────

class AnalysisTimelineEntry(BaseModel):
    user_id: Optional[str] = None
    """
    A single entry in the analysis timeline (history or current).
    """
    version: int
    label: str
    is_current: bool = Field(default=False)
    analysis_status: Optional[str] = None
    analysis_date: Optional[datetime] = None
    duration: Optional[float] = None
    scores: AnalysisScoreSummary = Field(default_factory=AnalysisScoreSummary)


class AnalysisTimeline(BaseModel):
    user_id: Optional[str] = None
    """
    Complete chronological timeline of all analyses for a Lead.
    """
    lead_id: str
    total_count: int = Field(description="Total number of completed analyses")
    timeline: List[AnalysisTimelineEntry] = Field(default_factory=list)
    current: Optional[AnalysisTimelineEntry] = None


# ─────────────────────────────────────────────────────────
# API Response Models
# ─────────────────────────────────────────────────────────

class LatestAnalysisResponse(BaseModel):
    user_id: Optional[str] = None
    """Response model for GET /api/ai-analysis/lead/{lead_id}/latest-analysis"""
    lead_id: str
    current: AnalysisHistorySnapshot


class AnalysisHistoryResponse(BaseModel):
    user_id: Optional[str] = None
    """Response model for GET /api/ai-analysis/lead/{lead_id}/analysis-history"""
    lead_id: str
    count: int = Field(description="Total number of analyses (including current)")
    history: List[AnalysisHistorySnapshot] = Field(default_factory=list)
    current: Optional[AnalysisHistorySnapshot] = None
    timeline: List[AnalysisTimelineEntry] = Field(default_factory=list)


class AnalysisComparisonResponse(BaseModel):
    user_id: Optional[str] = None
    """Response model for GET /api/ai-analysis/lead/{lead_id}/analysis-comparison"""
    lead_id: str
    previous: Optional[AnalysisHistorySnapshot] = None
    latest: AnalysisHistorySnapshot
    comparison: AnalysisComparison


class AnalysisVersionResponse(BaseModel):
    user_id: Optional[str] = None
    """Response for fetching a specific analysis version."""
    lead_id: str
    version: int
    snapshot: AnalysisHistorySnapshot
