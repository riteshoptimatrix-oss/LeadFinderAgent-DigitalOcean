from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class ActivityLogBase(BaseModel):
    user_id: str
    activity_type: str # e.g. "LOGIN", "SEARCH_STARTED", "LEAD_GENERATED"
    module: str # e.g. "auth", "search", "ai_analysis", "email", "whatsapp", "settings"
    title: str
    description: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    ip_address: Optional[str] = None
    browser: Optional[str] = None
    device: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ActivityLogCreate(ActivityLogBase):
    pass

class ActivityLogResponse(ActivityLogBase):
    id: str = Field(alias="_id")
