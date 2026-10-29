from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Union, Any, Dict
from datetime import datetime

class AIRecommendations(BaseModel):
    user_id: Optional[str] = None
    services: List[str] = []
    technologies: List[str] = []
    priority_level: str # 'High', 'Medium', 'Low'
    expected_value: str
    reasoning: str

class AIAnalysisData(BaseModel):
    user_id: Optional[str] = None
    business_summary: Optional[str] = None
    strengths: List[str] = []
    weaknesses: List[str] = []
    opportunities: List[str] = []
    
    digital_presence_analysis: Optional[str] = None
    website_analysis_summary: Optional[str] = None
    seo_summary: Optional[str] = None
    
    website_quality: Optional[str] = None
    design_quality: Optional[str] = None
    performance: Optional[str] = None
    seo_issues: List[str] = []
    seo_recommendations: List[str] = []
    ui_ux_recommendations: List[str] = []
    performance_recommendations: List[str] = []
    security_observations: List[str] = []
    business_opportunities: List[str] = []
    
    seo_issues: List[str] = []
    trust_signals: List[str] = []
    online_reputation_summary: Optional[str] = None
    
    lead_priority: str = "Cold" # 'Hot', 'Warm', 'Cold', 'Very Cold'
    priority_reason: Optional[str] = None
    lead_score_explanation: Optional[str] = None
    
    cold_outreach: Optional[str] = None
    sales_email: Optional[str] = None
    sales_whatsapp: Optional[str] = None
    follow_up_email: Optional[str] = None
    follow_up_whatsapp: Optional[str] = None
    second_follow_up: Optional[str] = None
    final_follow_up: Optional[str] = None
    
    recommendations: Optional[AIRecommendations] = None

class AIAnalysisCreate(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    prompt_version: str = "1.0"
    model: str
    data: AIAnalysisData

class AIAnalysisResponse(AIAnalysisCreate):
    id: str = Field(alias="_id")
    user_id: str
    created_at: datetime
    processing_time_ms: int

class AIAnalysisDetailResponse(BaseModel):
    user_id: Optional[str] = None
    """Detailed response for GET /analysis/{lead_id} endpoint"""
    lead_id: str
    business_name: Optional[str] = None
    lead_score: int = 0
    website_score: int = 0
    opportunity_score: int = 0
    technology_detected: List[str] = Field(default_factory=list)
    seo_score: int = 0
    ui_score: int = 0
    ux_score: int = 0
    performance_score: int = 0
    ssl_enabled: bool = False
    mobile_friendly: Optional[bool] = None
    page_speed: Optional[int] = None
    recommendations: List[str] = Field(default_factory=list)
    analyzed_at: datetime
    
    # Full analysis data
    analysis_data: Optional[AIAnalysisData] = None
    
    class Config:
        populate_by_name = True

    @model_validator(mode="before")
    @classmethod
    def _flatten_recommendations_before(cls, data: Any) -> Any:
        """Flatten legacy dict-shaped recommendations to flat strings before validation."""
        if isinstance(data, dict):
            recs = data.get("recommendations")
            if recs is not None:
                from app.models.lead import _flatten_recommendations
                data["recommendations"] = _flatten_recommendations(recs)
        return data

class AIQueueItemCreate(BaseModel):
    user_id: Optional[str] = None
    lead_ids: List[str] = []
    analyze_all_search: bool = False
    keyword: Optional[str] = None
    status_filter: Optional[str] = None
    analyze_favorites: bool = False

class AIQueueItemResponse(BaseModel):
    user_id: Optional[str] = None
    id: str = Field(alias="_id")
    lead_id: str
    user_id: str
    status: str # "QUEUED", "PROCESSING", "SUCCESS", "FAILED"
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
