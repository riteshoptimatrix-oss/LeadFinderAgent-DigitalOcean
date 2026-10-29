from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class ScoreEvidence(BaseModel):
    user_id: Optional[str] = None
    category_name: str
    raw_value: float
    weighted_value: float
    weight_percentage: float
    reason: str

class BusinessOpportunity(BaseModel):
    user_id: Optional[str] = None
    opportunity_type: str # e.g. 'Website Redesign', 'SEO Service', 'Performance Optimization'
    opportunity_score: int = Field(ge=0, le=100)
    confidence_score: int = Field(ge=0, le=100)
    estimated_business_impact: str # 'High', 'Medium', 'Low'
    estimated_priority: str # 'Critical', 'High', 'Medium', 'Low'
    reasoning: str

class ScoreConfig(BaseModel):
    user_id: Optional[str] = None
    version: str = "1.0"
    seo_weight: float = 0.20
    performance_weight: float = 0.20
    ui_ux_weight: float = 0.20
    security_weight: float = 0.15
    tech_weight: float = 0.10
    contact_weight: float = 0.15

class MasterScorecard(BaseModel):
    user_id: Optional[str] = None
    overall_website_score: int = Field(ge=0, le=100, default=0)
    business_opportunity_score: int = Field(ge=0, le=100, default=0)
    lead_priority_score: int = Field(ge=0, le=100, default=0)
    website_quality_score: int = Field(ge=0, le=100, default=0)
    website_health_score: int = Field(ge=0, le=100, default=0)
    digital_maturity_score: int = Field(ge=0, le=100, default=0)
    technical_quality_score: int = Field(ge=0, le=100, default=0)
    conversion_optimization_score: int = Field(ge=0, le=100, default=0)
    evidence: List[ScoreEvidence] = Field(default_factory=list)

class BusinessIntelligenceResultBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    scorecard: MasterScorecard = Field(default_factory=MasterScorecard)
    opportunities: List[BusinessOpportunity] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    lead_classification: str = "Cold Lead"
    priority_classification: str = "Low"

class BusinessIntelligenceResultCreate(BusinessIntelligenceResultBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BusinessIntelligenceResultInDB(BusinessIntelligenceResultCreate):
    id: str = Field(alias="_id")

class BusinessIntelligenceResultResponse(BusinessIntelligenceResultInDB):
    class Config:
        populate_by_name = True
