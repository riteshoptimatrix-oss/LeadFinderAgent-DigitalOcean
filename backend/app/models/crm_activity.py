from datetime import datetime
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

class CRMActivityCreate(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    activity_type: str # e.g., 'Status Changed', 'Email Sent', 'Note Added'
    description: str
    metadata_info: Dict[str, Any] = Field(default_factory=dict)

class CRMActivityInDB(CRMActivityCreate):
    id: str = Field(alias="_id")
    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CRMActivityResponse(CRMActivityInDB):
    class Config:
        populate_by_name = True
