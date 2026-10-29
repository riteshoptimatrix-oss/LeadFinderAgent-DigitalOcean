from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class PerformanceMetrics(BaseModel):
    user_id: Optional[str] = None
    server_response_time_ms: Optional[int] = None
    ttfb_ms: Optional[int] = None
    fcp_ms: Optional[int] = None
    lcp_ms: Optional[int] = None
    cls_score: Optional[float] = None
    tbt_ms: Optional[int] = None
    js_size_kb: Optional[int] = None
    css_size_kb: Optional[int] = None
    image_optimization_score: Optional[int] = None
    caching_score: Optional[int] = None

class UXMetrics(BaseModel):
    user_id: Optional[str] = None
    navigation_clarity_score: int = 0
    cta_visibility_score: int = 0
    trust_signals_score: int = 0
    mobile_layout_score: int = 0
    readability_score: int = 0
    user_journey_score: int = 0
    responsive_layout_score: int = 0
    accessibility_score: int = 0

class UIMetrics(BaseModel):
    user_id: Optional[str] = None
    color_consistency_score: int = 0
    typography_score: int = 0
    visual_hierarchy_score: int = 0
    brand_consistency_score: int = 0
    spacing_score: int = 0

class DesignRecommendation(BaseModel):
    user_id: Optional[str] = None
    category: str # 'UI', 'UX', or 'Performance'
    issue: str
    impact: str # 'High', 'Medium', 'Low'
    action: str

class WebsiteDesignAuditBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    base_url: str
    ui_score: int = 0 # 0-100
    ux_score: int = 0 # 0-100
    performance_score: int = 0 # 0-100
    website_quality_score: int = 0 # 0-100
    performance_metrics: Optional[PerformanceMetrics] = None
    ux_metrics: Optional[UXMetrics] = None
    ui_metrics: Optional[UIMetrics] = None
    recommendations: List[DesignRecommendation] = Field(default_factory=list)

class WebsiteDesignAuditCreate(WebsiteDesignAuditBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)

from app.models.pyobjectid import PyObjectId
from pydantic import ConfigDict

class WebsiteDesignAuditInDB(WebsiteDesignAuditCreate):
    id: PyObjectId = Field(alias="_id")

class WebsiteDesignAuditResponse(WebsiteDesignAuditInDB):
    model_config = ConfigDict(populate_by_name=True)
