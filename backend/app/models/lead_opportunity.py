from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class LeadOpportunitySignals(BaseModel):
    user_id: Optional[str] = None
    lead_score: int = Field(ge=0, le=100, default=0)
    lead_quality: str = "Medium"
    lead_category: str = "Local Business"
    purchasing_power: str = "Low"
    decision_maker: str = "Owner"
    summary: str = ""
    signals: List[str] = Field(default_factory=list)


class SalesOpportunityResult(BaseModel):
    user_id: Optional[str] = None
    opportunity_score: int = Field(ge=0, le=100, default=0)
    sales_ready: str = "No"
    product_fit: str = "Low"
    budget_estimate: str = "Unknown"
    sales_channel: str = "WhatsApp"
    next_best_action: str = "Cold outreach"
    talking_points: List[str] = Field(default_factory=list)


class LeadOpportunityResult(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    lead_intelligence: LeadOpportunitySignals = Field(default_factory=LeadOpportunitySignals)
    sales_opportunity: SalesOpportunityResult = Field(default_factory=SalesOpportunityResult)
    metrics: Dict[str, Any] = Field(default_factory=dict)


class LeadOpportunityResultCreate(LeadOpportunityResult):
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LeadOpportunityResultInDB(LeadOpportunityResultCreate):
    id: str = Field(alias="_id")


class LeadOpportunityResultResponse(LeadOpportunityResultInDB):
    class Config:
        populate_by_name = True
