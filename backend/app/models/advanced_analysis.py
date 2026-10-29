from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class AdvancedAnalysisJobBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    status: str = "PENDING"  # PENDING, QUEUED, INITIALIZING, RUNNING, COMPLETED, FAILED, SKIPPED, CANCELLED
    error_message: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    last_error: Optional[str] = None
    logs: List[str] = Field(default_factory=list)

class AdvancedAnalysisJobCreate(AdvancedAnalysisJobBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AdvancedAnalysisJobInDB(AdvancedAnalysisJobCreate):
    id: str = Field(alias="_id")
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

class AdvancedAnalysisJobResponse(AdvancedAnalysisJobInDB):
    class Config:
        populate_by_name = True

class AdvancedAnalysisStartRequest(BaseModel):
    user_id: Optional[str] = None
    lead_ids: List[str] = []
    analyze_all_search: bool = False
    keyword: Optional[str] = None
    city: Optional[str] = None
    status_filter: Optional[str] = None
    analyze_favorites: bool = False
