from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from bson import ObjectId
from app.models.pyobjectid import PyObjectId

class LeadIntelligenceState(str, Enum):
    WAITING = "Waiting"
    STARTING = "Starting"
    BUILDING_PROFILE = "Building Business Profile"
    ANALYZING_MATURITY = "Analyzing Digital Maturity"
    DETECTING_OPPORTUNITIES = "Detecting Opportunities"
    SCORING = "Opportunity Scoring"
    SUMMARIZING = "Generating AI Summary"
    COMPLETED = "Completed"
    FAILED = "Failed"
    CANCELLED = "Cancelled"

class LeadIntelligenceJob(BaseModel):
    user_id: Optional[str] = None
    queue_id: str
    lead_id: str
    status: LeadIntelligenceState = Field(default=LeadIntelligenceState.WAITING)
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    retry_count: int = Field(default=0)
    
class LeadIntelligenceJobCreate(LeadIntelligenceJob):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class LeadIntelligenceQueue(BaseModel):
    user_id: Optional[str] = None
    user_id: str
    name: str = Field(default="Lead Intelligence Pipeline")
    total_jobs: int = Field(default=0)
    completed_jobs: int = Field(default=0)
    failed_jobs: int = Field(default=0)
    running_jobs: int = Field(default=0)
    overall_progress: float = Field(default=0.0)
    status: LeadIntelligenceState = Field(default=LeadIntelligenceState.WAITING)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

class OpportunityScore(BaseModel):
    user_id: Optional[str] = None
    category: str
    score: int = Field(ge=0, le=100)
    reasoning: str

class OpportunityDetection(BaseModel):
    user_id: Optional[str] = None
    opportunity_type: str
    detected: bool
    severity: str # 'Critical', 'High', 'Medium', 'Low'
    description: str

class ServiceRecommendation(BaseModel):
    user_id: Optional[str] = None
    service_name: str
    priority: str # 'Critical', 'High', 'Medium', 'Low'
    reason: str
    estimated_business_impact: str # 'High', 'Medium', 'Low'

class BusinessProfile(BaseModel):
    user_id: Optional[str] = None
    industry: str = "Unknown"
    sub_industry: str = "Unknown"
    business_category: str = "Unknown"
    estimated_business_size: str = "Unknown" # e.g. 'Small', 'Medium', 'Enterprise'
    estimated_customer_reach: str = "Unknown"
    website_age: str = "Unknown"
    digital_presence: str = "Unknown" # e.g. 'Basic', 'Established', 'Strong'
    technology_adoption: str = "Unknown"
    business_type: str = "Unknown" # e.g. 'B2B', 'B2C'

class AISummary(BaseModel):
    user_id: Optional[str] = None
    business_overview: str
    website_strengths: List[str]
    website_weaknesses: List[str]
    biggest_opportunities: List[str]
    recommended_services: List[str]
    sales_talking_points: List[str]
    objection_risks: List[str]

class LeadIntelligenceResult(BaseModel):
    user_id: Optional[str] = None
    digital_maturity_score: int = Field(ge=0, le=100, default=0)
    sales_readiness_score: int = Field(ge=0, le=100, default=0)
    risk_score: int = Field(ge=0, le=100, default=0)
    overall_opportunity_score: int = Field(ge=0, le=100, default=0)
    
    priority_classification: str = "Low" # Critical, High, Medium, Low, Very Low
    
    business_profile: BusinessProfile = Field(default_factory=BusinessProfile)
    opportunities_detected: List[OpportunityDetection] = Field(default_factory=list)
    opportunity_breakdown: List[OpportunityScore] = Field(default_factory=list)
    service_recommendations: List[ServiceRecommendation] = Field(default_factory=list)
    
    ai_summary: Optional[AISummary] = None
    
    analysis_date: datetime = Field(default_factory=datetime.utcnow)
    version: str = "1.0"
