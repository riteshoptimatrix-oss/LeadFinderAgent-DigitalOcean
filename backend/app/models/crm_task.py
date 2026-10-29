from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

class CRMTaskCreate(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    task_type: str # 'Call', 'Email', 'Meeting', 'Website Review', 'Custom'
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: str = Field(default="Normal")
    status: str = Field(default="Pending") # Pending, Completed, Cancelled
    is_recurring: bool = False
    reminder_minutes_before: Optional[int] = None # e.g. 15, 30, 60

class CRMTaskInDB(CRMTaskCreate):
    id: str = Field(alias="_id")
    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

class CRMTaskResponse(CRMTaskInDB):
    class Config:
        populate_by_name = True
