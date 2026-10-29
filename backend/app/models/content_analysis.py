from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class ContentIssue(BaseModel):
    user_id: Optional[str] = None
    issue_type: str
    description: str
    severity: str  # 'Critical', 'High', 'Medium', 'Low'
    affected_url: Optional[str] = None


class ContentPageMetric(BaseModel):
    user_id: Optional[str] = None
    url: str
    title: str = ""
    word_count: int = 0
    heading_count: int = 0
    image_count: int = 0
    video_count: int = 0
    has_cta: bool = False
    has_blog_link: bool = False
    has_testimonial: bool = False
    is_thin_content: bool = False


class ContentScorecard(BaseModel):
    user_id: Optional[str] = None
    overall_content_score: int = Field(ge=0, le=100, default=0)
    depth_score: int = Field(ge=0, le=100, default=0)
    structure_score: int = Field(ge=0, le=100, default=0)
    freshness_score: int = Field(ge=0, le=100, default=0)
    engagement_score: int = Field(ge=0, le=100, default=0)


class ContentAnalysisResultBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    scorecard: ContentScorecard = Field(default_factory=ContentScorecard)
    issues: List[ContentIssue] = Field(default_factory=list)
    page_metrics: List[ContentPageMetric] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)
    metrics: Dict[str, Any] = Field(default_factory=dict)


class ContentAnalysisResultCreate(ContentAnalysisResultBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ContentAnalysisResultInDB(ContentAnalysisResultCreate):
    id: str = Field(alias="_id")


class ContentAnalysisResultResponse(ContentAnalysisResultInDB):
    class Config:
        populate_by_name = True
