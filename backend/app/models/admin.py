from typing import Optional, Any
from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import datetime

class AdminBase(BaseModel):
    email: EmailStr
    role: str = "admin"
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None

class AdminInDB(AdminBase):
    id: str = Field(alias="_id")
    password_hash: str

    @field_validator("id", mode="before")
    @classmethod
    def convert_object_id(cls, v: Any) -> str:
        return str(v)
