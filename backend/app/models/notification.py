from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

class NotificationBase(BaseModel):
    user_id: str
    type: str = "system"  # 'lead' | 'campaign' | 'whatsapp' | 'calling' | 'email' | 'system' | 'ai'
    title: str
    message: str
    link: Optional[str] = None
    read: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class NotificationCreate(BaseModel):
    user_id: Optional[str] = None
    type: str = "system"
    title: str
    message: str
    link: Optional[str] = None
    read: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None

class NotificationUpdate(BaseModel):
    read: Optional[bool] = None

class NotificationInDB(NotificationBase):
    id: str = Field(alias="_id")

    class Config:
        populate_by_name = True
