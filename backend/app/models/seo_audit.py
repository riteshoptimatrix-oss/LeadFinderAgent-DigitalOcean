from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class PageSEOMetrics(BaseModel):
    user_id: Optional[str] = None
    url: str
    has_title: bool = False
    title_length: int = 0
    has_meta_description: bool = False
    meta_description_length: int = 0
    h1_count: int = 0
    h2_count: int = 0
    has_canonical: bool = False
    has_open_graph: bool = False
    has_twitter_card: bool = False
    schema_types: List[str] = Field(default_factory=list)
    images_count: int = 0
    images_without_alt: int = 0
    status_code: Optional[int] = None
    is_indexable: bool = True

class LighthouseMetrics(BaseModel):
    user_id: Optional[str] = None
    performance_score: Optional[int] = None
    accessibility_score: Optional[int] = None
    best_practices_score: Optional[int] = None
    seo_score: Optional[int] = None
    first_contentful_paint: Optional[str] = None
    largest_contentful_paint: Optional[str] = None
    cumulative_layout_shift: Optional[str] = None
    total_blocking_time: Optional[str] = None

class Recommendation(BaseModel):
    user_id: Optional[str] = None
    issue: str
    impact: str # 'High', 'Medium', 'Low'
    action: str

class WebsiteSEOAuditBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    base_url: str
    normalized_score: int = 0 # 0-100
    seo_score: int = 0
    technical_seo_score: int = 0
    accessibility_score: int = 0
    best_practices_score: int = 0
    page_metrics: List[PageSEOMetrics] = Field(default_factory=list)
    lighthouse_metrics: Optional[LighthouseMetrics] = None
    has_robots_txt: bool = False
    has_sitemap_xml: bool = False
    is_https_enforced: bool = False
    recommendations: List[Recommendation] = Field(default_factory=list)

class WebsiteSEOAuditCreate(WebsiteSEOAuditBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)

from app.models.pyobjectid import PyObjectId
from pydantic import ConfigDict

class WebsiteSEOAuditInDB(WebsiteSEOAuditCreate):
    id: PyObjectId = Field(alias="_id")

class WebsiteSEOAuditResponse(WebsiteSEOAuditInDB):
    model_config = ConfigDict(populate_by_name=True)
