from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class ExecutiveSummary(BaseModel):
    user_id: Optional[str] = None
    business_name: str
    website: str
    industry: str
    overall_website_score: int
    business_opportunity_score: int
    lead_priority: str
    top_strengths: List[str]
    top_weaknesses: List[str]
    top_risks: List[str]
    top_opportunities: List[str]

class EmailSequence(BaseModel):
    user_id: Optional[str] = None
    initial_cold_email_subject: str
    initial_cold_email_body: str
    followup_1_subject: str
    followup_1_body: str
    followup_2_subject: str
    followup_2_body: str
    final_followup_subject: str
    final_followup_body: str

class WhatsAppCampaign(BaseModel):
    user_id: Optional[str] = None
    short_version: str
    medium_version: str
    long_version: str
    friendly_version: str
    professional_version: str
    executive_version: str
    followup_version: str
    reminder_version: str

class LineItem(BaseModel):
    user_id: Optional[str] = None
    service_name: str
    estimated_hours: int
    estimated_cost: int

class Quotation(BaseModel):
    user_id: Optional[str] = None
    recommended_package: str
    line_items: List[LineItem]
    total_estimated_cost: int
    priority: str

class ProposalDocument(BaseModel):
    user_id: Optional[str] = None
    project_overview: str
    problems_identified: List[str]
    recommended_solution: str
    scope_of_work: List[str]
    expected_benefits: List[str]
    deliverables: List[str]
    timeline_weeks: int
    support_maintenance: str

class OutreachIntelligenceResultBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    executive_summary: ExecutiveSummary
    email_sequence: EmailSequence
    whatsapp_campaign: WhatsAppCampaign
    quotations: List[Quotation]
    proposal: ProposalDocument

class OutreachIntelligenceResultCreate(OutreachIntelligenceResultBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)

class OutreachIntelligenceResultInDB(OutreachIntelligenceResultCreate):
    id: str = Field(alias="_id")

class OutreachIntelligenceResultResponse(OutreachIntelligenceResultInDB):
    class Config:
        populate_by_name = True
