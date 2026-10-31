from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field

class SMTPSettings(BaseModel):
    user_id: Optional[str] = None
    smtp_host: Optional[str] = "smtp.gmail.com"
    smtp_port: Optional[int] = 587
    smtp_user: Optional[str] = None
    smtp_pass: Optional[str] = None
    smtp_encryption: Optional[str] = "TLS" # TLS, SSL, STARTTLS, NONE
    smtp_from_email: Optional[str] = None
    smtp_sender_name: Optional[str] = None
    smtp_reply_to: Optional[str] = None
    smtp_status: Optional[str] = "NOT_CONFIGURED" # NOT_CONFIGURED, TESTING, CONNECTED, AUTH_FAILED, CONNECTION_FAILED
    last_tested_at: Optional[datetime] = None
    last_test_error: Optional[str] = None
    daily_limit: Optional[int] = 500
    signature: Optional[str] = "Best regards,\nThe Growth Team\nwww.example.com"
    track_opens: Optional[bool] = True
    has_password: Optional[bool] = False

class SMTPSettingsResponse(BaseModel):
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_encryption: str = "TLS"
    smtp_from_email: str = ""
    smtp_sender_name: str = ""
    smtp_status: str = "NOT_CONFIGURED"
    last_tested_at: Optional[datetime] = None
    last_test_error: Optional[str] = None
    daily_limit: int = 500
    signature: str = "Best regards,\nThe Growth Team\nwww.example.com"
    track_opens: bool = True
    has_password: bool = False

class SMTPSettingsUpdate(BaseModel):
    smtp_host: Optional[str] = "smtp.gmail.com"
    smtp_port: Optional[int] = 587
    smtp_user: Optional[str] = None
    smtp_pass: Optional[str] = None
    smtp_encryption: Optional[str] = "TLS"
    smtp_from_email: Optional[str] = None
    smtp_sender_name: Optional[str] = None
    daily_limit: Optional[int] = 500
    signature: Optional[str] = None
    track_opens: Optional[bool] = None

class SMTPTestRequest(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = 587
    smtp_user: Optional[str] = None
    smtp_pass: Optional[str] = None
    smtp_encryption: Optional[str] = "TLS"
    smtp_from_email: Optional[str] = None
    smtp_sender_name: Optional[str] = None
    send_test: bool = False
    recipient: Optional[str] = None

class SMTPTestResponse(BaseModel):
    success: bool
    status: str # CONNECTED, AUTH_FAILED, CONNECTION_FAILED
    message: str
    host: Optional[str] = None
    port: Optional[int] = None
    mode: Optional[str] = None
    test_email_sent: bool = False
    recipient: Optional[str] = None
    error: Optional[str] = None

class WhatsAppSettings(BaseModel):
    user_id: Optional[str] = None
    wa_provider_type: Optional[str] = "OFFICIAL" # OFFICIAL, BROWSER
    wa_official_token: Optional[str] = None
    wa_api_key: Optional[str] = None
    wa_phone_id: Optional[str] = None
    wa_waba_id: Optional[str] = None
    wa_webhook_verify_token: Optional[str] = None
    wa_browser_headless: Optional[bool] = True
    wa_browser_profile_dir: Optional[str] = None
    wa_retry_count: Optional[int] = 3
    wa_batch_size: Optional[int] = 10
    wa_queue_size: Optional[int] = 1000
    wa_max_daily_messages: Optional[int] = 5000
    wa_country_code_default: Optional[str] = "+1"

class AISettings(BaseModel):
    user_id: Optional[str] = None
    ai_enabled: Optional[bool] = False
    ai_provider: Optional[str] = "OPENAI" # OPENAI, CLAUDE, etc.
    ai_api_key: Optional[str] = None
    ai_model: Optional[str] = "gpt-4"
    ai_temperature: Optional[float] = 0.7
    ai_max_tokens: Optional[int] = 1000

class UserSettingsBase(SMTPSettings, WhatsAppSettings, AISettings):
    user_id: str

class UserSettingsUpdate(SMTPSettings, WhatsAppSettings, AISettings):
    pass

class UserSettingsInDB(UserSettingsBase):
    id: str = Field(alias="_id")

class UserSettingsResponse(UserSettingsBase):
    id: str = Field(alias="_id")
    
    class Config:
        populate_by_name = True
