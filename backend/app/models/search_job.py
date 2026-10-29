from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, Field

class SearchJob(BaseModel):
    user_id: Optional[str] = None
    id: Optional[str] = Field(default=None, alias="_id")
    keyword: str
    area: str
    city: str
    state: str
    country: str
    limit: int = 50
    status: str = "QUEUED" # QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED
    progress: int = 0
    total_found: int = 0
    logs: List[Dict[str, str]] = Field(default_factory=list) # [{stage: "START", message: "...", timestamp: "..."}]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
