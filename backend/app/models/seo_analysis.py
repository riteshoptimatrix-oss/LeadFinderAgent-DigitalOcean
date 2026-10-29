from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class SeoIssue(BaseModel):
    user_id: Optional[str] = None
    severity: str # 'Error', 'Warning', 'Info'
    category: str # 'Technical', 'Content', 'Metadata', 'Links', 'Indexability'
    issue_type: str # e.g. 'Missing Title', 'Duplicate Title', 'Broken Link'
    description: str
    evidence: Optional[str] = None
    affected_url: Optional[str] = None

class PageLevelAudit(BaseModel):
    user_id: Optional[str] = None
    url: str
    title: str = ""
    title_length: int = 0
    meta_description: str = ""
    description_length: int = 0
    h1_count: int = 0
    word_count: int = 0
    image_count: int = 0
    images_missing_alt: int = 0
    internal_links: int = 0
    external_links: int = 0
    broken_links: int = 0
    canonical_url: Optional[str] = None
    has_schema: bool = False
    schema_types: List[str] = Field(default_factory=list)
    indexable: bool = True
    load_time: float = 0.0

class SeoScorecard(BaseModel):
    user_id: Optional[str] = None
    overall_score: int = Field(ge=0, le=100, default=0)
    technical_score: int = Field(ge=0, le=100, default=0)
    content_score: int = Field(ge=0, le=100, default=0)
    metadata_score: int = Field(ge=0, le=100, default=0)
    internal_linking_score: int = Field(ge=0, le=100, default=0)
    structured_data_score: int = Field(ge=0, le=100, default=0)
    image_seo_score: int = Field(ge=0, le=100, default=0)
    mobile_score: int = Field(ge=0, le=100, default=0)
    indexability_score: int = Field(ge=0, le=100, default=0)

class SeoAnalysisResultBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    scorecard: SeoScorecard = Field(default_factory=SeoScorecard)
    issues: List[SeoIssue] = Field(default_factory=list)
    page_audits: List[PageLevelAudit] = Field(default_factory=list)
    pagespeed_data: Optional[Dict[str, Any]] = None

class SeoAnalysisResultCreate(SeoAnalysisResultBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SeoAnalysisResultInDB(SeoAnalysisResultCreate):
    id: str = Field(alias="_id")

class SeoAnalysisResultResponse(SeoAnalysisResultInDB):
    class Config:
        populate_by_name = True
