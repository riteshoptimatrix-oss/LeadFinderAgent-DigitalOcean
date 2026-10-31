from typing import Optional
from pydantic import BaseModel, Field

class SMTPSettings(BaseModel):
    user_id: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_pass: Optional[str] = None
    smtp_encryption: Optional[str] = "TLS" # TLS, SSL, NONE
    smtp_from_email: Optional[str] = None
    smtp_sender_name: Optional[str] = None
    smtp_reply_to: Optional[str] = None

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
