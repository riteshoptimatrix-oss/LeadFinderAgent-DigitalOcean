from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class ServiceOpportunity(BaseModel):
    user_id: Optional[str] = None
    service_name: str # e.g. 'Core Web Vitals Optimization', 'Technical SEO', 'WhatsApp Automation'
    opportunity_score: int = Field(ge=0, le=100)
    confidence_score: int = Field(ge=0, le=100)
    business_impact: str # 'Critical', 'High', 'Medium', 'Low'
    technical_justification: str
    commercial_justification: str
    expected_outcome: str

class ROIEstimate(BaseModel):
    user_id: Optional[str] = None
    expected_roi_percentage: int
    business_growth_potential: str # 'Exponential', 'High', 'Steady', 'Low'
    lead_generation_improvement: str
    conversion_improvement: str
    maintenance_savings: str

class ClientPainPoint(BaseModel):
    user_id: Optional[str] = None
    category: str
    issue: str
    severity: str # 'Critical', 'High', 'Medium'

class RecommendedPackage(BaseModel):
    user_id: Optional[str] = None
    package_name: str # e.g. 'Digital Transformation Package'
    services_included: List[str]
    priority: str
    reason: str
    business_value: str

class SalesIntelligenceResultBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    service_opportunities: List[ServiceOpportunity] = Field(default_factory=list)
    roi_estimate: ROIEstimate
    client_pain_points: List[ClientPainPoint] = Field(default_factory=list)
    recommended_packages: List[RecommendedPackage] = Field(default_factory=list)

class SalesIntelligenceResultCreate(SalesIntelligenceResultBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SalesIntelligenceResultInDB(SalesIntelligenceResultCreate):
    id: str = Field(alias="_id")

class SalesIntelligenceResultResponse(SalesIntelligenceResultInDB):
    class Config:
        populate_by_name = True
