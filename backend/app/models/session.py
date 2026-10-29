from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

class SessionBase(BaseModel):
    user_id: Optional[str] = None
    user_id: str
    refresh_token: str
    device_info: Optional[str] = None
    ip_address: Optional[str] = None
    is_active: bool = True

class SessionCreate(SessionBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime

class SessionInDB(SessionCreate):
    id: str = Field(alias="_id")

class SessionResponse(BaseModel):
    user_id: Optional[str] = None
    id: str = Field(alias="_id")
    device_info: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime
    is_active: bool

    class Config:
        populate_by_name = True
