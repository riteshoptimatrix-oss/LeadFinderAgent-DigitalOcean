from typing import Optional, Any
from pydantic import BaseModel, EmailStr, Field, field_validator, ConfigDict
import re

from enum import Enum

from datetime import datetime

class UserRole(str, Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    VIEWER = "VIEWER"
    USER = "USER"

class EmailSettingsModel(BaseModel):
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_encryption: str = "TLS"
    smtp_from_email: str = ""
    smtp_sender_name: str = ""
    daily_limit: int = 500
    signature: str = "Best regards,\nThe Growth Team\nwww.example.com"
    track_opens: bool = True
    has_password: bool = False

class WhatsAppSettingsModel(BaseModel):
    auto_reply: bool = True
    campaign_limit: int = 250
    api_key: str = ""
    webhook_url: str = "https://api.example.com/webhooks/whatsapp"

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    mobile_number: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    company_name: Optional[str] = None
    role: UserRole = UserRole.USER
    avatar: Optional[str] = None
    language: Optional[str] = "English (US)"
    timezone: Optional[str] = "UTC-08:00 (Pacific Time)"
    is_active: bool = True
    is_superuser: bool = False
    account_status: str = "Active"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None
    
    # Password Reset
    password_reset_token_hash: Optional[str] = None
    password_reset_expires_at: Optional[datetime] = None
    password_reset_requested_at: Optional[datetime] = None
    
    # Integrations
    email_settings: EmailSettingsModel = Field(default_factory=lambda: EmailSettingsModel())
    whatsapp_settings: WhatsAppSettingsModel = Field(default_factory=lambda: WhatsAppSettingsModel())

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)
    
    @field_validator('password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit.")
        if not re.search(r"[@$!%*?&#^]", v):
            raise ValueError("Password must contain at least one special character.")
        return v

class UserInDB(UserBase):
    id: str = Field(alias="_id")
    hashed_password: str

    @field_validator("id", mode="before")
    @classmethod
    def convert_object_id(cls, v: Any) -> str:
        return str(v)

class UserResponse(UserBase):
    id: str = Field(alias="_id")
    
    model_config = ConfigDict(populate_by_name=True)

    @field_validator("id", mode="before")
    @classmethod
    def convert_object_id(cls, v: Any) -> str:
        return str(v)

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: Optional[str] = None

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    company_name: Optional[str] = None
    mobile_number: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    role: Optional[UserRole] = None
    avatar: Optional[str] = None
    language: Optional[str] = None
    timezone: Optional[str] = None
    email_settings: Optional[EmailSettingsModel] = None
    whatsapp_settings: Optional[WhatsAppSettingsModel] = None

class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)
    
    @field_validator('new_password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit.")
        if not re.search(r"[@$!%*?&#^]", v):
            raise ValueError("Password must contain at least one special character.")
        return v
