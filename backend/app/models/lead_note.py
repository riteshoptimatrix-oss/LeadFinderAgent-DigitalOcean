from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

class LeadNoteCreate(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    content: str
    is_pinned: bool = False
    is_private: bool = False
    attachments: List[str] = Field(default_factory=list)
    
class LeadNoteInDB(LeadNoteCreate):
    id: str = Field(alias="_id")
    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

class LeadNoteResponse(LeadNoteInDB):
    model_config = ConfigDict(populate_by_name=True)
