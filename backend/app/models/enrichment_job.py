from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from datetime import datetime

class EnrichmentJobState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"
    CANCELLED = "cancelled"

class EnrichmentJob(BaseModel):
    user_id: Optional[str] = None
    id: Optional[str] = Field(None, alias="_id")
    lead_id: str
    status: EnrichmentJobState = EnrichmentJobState.QUEUED
    attempts: int = 0
    max_attempts: int = 3
    
    # Timing
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = 0.0
    
    # Diagnostics
    error_message: Optional[str] = None
    logs: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Snapshot of scores when completed
    final_quality_score: Optional[float] = None
    final_completeness_percent: Optional[float] = None
    
    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
