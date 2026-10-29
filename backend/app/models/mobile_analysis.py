from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class MobileIssue(BaseModel):
    user_id: Optional[str] = None
    issue_type: str
    description: str
    severity: str  # 'Critical', 'High', 'Medium', 'Low'
    affected_url: Optional[str] = None


class MobileScorecard(BaseModel):
    user_id: Optional[str] = None
    overall_mobile_score: int = Field(ge=0, le=100, default=0)
    viewport_score: int = Field(ge=0, le=100, default=0)
    responsive_score: int = Field(ge=0, le=100, default=0)
    tap_target_score: int = Field(ge=0, le=100, default=0)
    typography_score: int = Field(ge=0, le=100, default=0)
    layout_score: int = Field(ge=0, le=100, default=0)


class MobilePageMetric(BaseModel):
    user_id: Optional[str] = None
    url: str
    has_viewport: bool = False
    viewport_content: Optional[str] = None
    has_responsive_meta: bool = False
    css_breakpoints: int = 0
    media_queries: int = 0
    small_tap_targets: int = 0
    tiny_fonts: int = 0
    horizontal_scroll_risk: bool = False
    oversized_images: int = 0


class MobileAnalysisResultBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    scorecard: MobileScorecard = Field(default_factory=MobileScorecard)
    issues: List[MobileIssue] = Field(default_factory=list)
    page_metrics: List[MobilePageMetric] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)


class MobileAnalysisResultCreate(MobileAnalysisResultBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MobileAnalysisResultInDB(MobileAnalysisResultCreate):
    id: str = Field(alias="_id")


class MobileAnalysisResultResponse(MobileAnalysisResultInDB):
    class Config:
        populate_by_name = True
