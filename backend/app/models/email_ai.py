from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Any, Dict
from datetime import datetime

class EmailAISmtpBase(BaseModel):
    user_id: Optional[str] = None
    name: str = Field(..., description="Profile name, e.g., 'Main Marketing'")
    host: str = Field(..., description="SMTP server host")
    port: int = Field(587, description="SMTP server port")
    username: str = Field(..., description="SMTP username")
    password: str = Field(..., description="SMTP password or app password")
    encryption: str = Field("TLS", description="Encryption type: TLS, SSL, or None")
    timeout: int = Field(15, description="Timeout in seconds")
    daily_limit: int = Field(500, description="Max emails per day")
    hourly_limit: int = Field(50, description="Max emails per hour")
    priority: int = Field(1, description="Priority level for rotation")
    is_active: bool = True
    is_default: bool = False

class EmailAISmtpCreate(EmailAISmtpBase):
    pass

class EmailAISmtpUpdate(BaseModel):
    user_id: Optional[str] = None
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    encryption: Optional[str] = None
    timeout: Optional[int] = None
    daily_limit: Optional[int] = None
    hourly_limit: Optional[int] = None
    priority: Optional[int] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None

class EmailAITemplateBase(BaseModel):
    user_id: Optional[str] = None
    name: str = Field(..., description="Internal template name")
    subject: str = Field(..., description="Email subject line with variables")
    body_html: str = Field("", description="HTML version of the email")
    body_text: str = Field("", description="Plain text fallback of the email")
    category: str = Field("Custom", description="Template category")
    language: str = Field("English", description="Template language")
    is_active: bool = True
    is_favorite: bool = False
    usage_count: int = 0
    version: int = 1

class EmailAITemplateCreate(EmailAITemplateBase):
    pass

class EmailAITemplateUpdate(BaseModel):
    user_id: Optional[str] = None
    name: Optional[str] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    category: Optional[str] = None
    language: Optional[str] = None
    is_active: Optional[bool] = None
    is_favorite: Optional[bool] = None


class CampaignInfo(BaseModel):
    user_id: Optional[str] = None
    name: str = Field(..., description="Campaign name")
    description: Optional[str] = Field(None, description="Internal note about this campaign's goal")
    tag: Optional[str] = Field(None, description="Internal tag")
    category: Optional[str] = Field("Outreach", description="Category")
    priority: int = Field(1, description="Priority level")
    color: str = Field("#3b82f6", description="Color code")
    owner: str = Field("System", description="Campaign Owner")

class SendingRules(BaseModel):
    user_id: Optional[str] = None
    delay_seconds: int = Field(120, description="Delay between emails in seconds")
    random_delay: bool = Field(True, description="Whether to randomize delay by +/- 20%")
    max_per_hour: int = Field(30, description="Maximum emails per hour")
    max_per_day: int = Field(300, description="Maximum emails per day")
    max_concurrent: int = Field(1, description="Concurrent threads")
    retry_count: int = Field(2, description="Times to retry on failure")
    retry_delay: int = Field(300, description="Delay before retrying (seconds)")
    duplicate_protection: bool = Field(True, description="Prevent sending to same email twice")

class TrackingConfig(BaseModel):
    user_id: Optional[str] = None
    open_tracking: bool = Field(False, description="Track opens")
    click_tracking: bool = Field(False, description="Track clicks")
    reply_tracking: bool = Field(False, description="Track replies")
    bounce_tracking: bool = Field(False, description="Track bounces")

class ScheduleConfig(BaseModel):
    user_id: Optional[str] = None
    type: str = Field("Immediate", description="Immediate or Scheduled")
    start_time: Optional[datetime] = Field(None, description="When to start")
    timezone: str = Field("UTC", description="Timezone")
    business_hours_only: bool = Field(False, description="Only send during business hours")
    weekdays_only: bool = Field(False, description="Skip weekends")

class EmailAICampaignBase(BaseModel):
    user_id: Optional[str] = None
    info: CampaignInfo
    template_id: str = Field(..., description="Email template ID")
    smtp_id: str = Field(..., description="SMTP Profile ID")
    target_leads: List[str] = Field(..., description="List of lead IDs to target")
    rules: SendingRules
    tracking: TrackingConfig
    schedule: ScheduleConfig
    attachments: Optional[List[str]] = []
    status: str = Field("Configured", description="Campaign status")
    stats: Optional[Dict[str, Any]] = {"sent": 0, "failed": 0, "queued": 0}

class EmailAICampaignCreate(EmailAICampaignBase):
    pass

class EmailAICampaignUpdate(BaseModel):
    user_id: Optional[str] = None
    status: Optional[str] = None
    info: Optional[CampaignInfo] = None
    stats: Optional[Dict[str, Any]] = None

class EmailAIBlockListBase(BaseModel):
    user_id: Optional[str] = None
    email: str = Field(..., description="Email address to block")
    reason: str = Field(..., description="Reason for block (bounce, manual, complaint)")
    
class EmailAIBlockListCreate(EmailAIBlockListBase):
    pass


class EmailAIQueueJob(BaseModel):
    user_id: Optional[str] = None
    campaign_id: str = Field(..., description="Parent Campaign ID")
    lead_id: str = Field(..., description="Target Lead ID")
    smtp_id: str = Field(..., description="SMTP Profile to use")
    template_id: str = Field(..., description="Template to render")
    status: str = Field("Pending", description="Pending, Waiting, Preparing, Connecting, Sending, Delivered, Failed, Retry Scheduled, Skipped")
    retries: int = Field(0, description="Current retry count")
    max_retries: int = Field(2, description="Maximum allowed retries")
    next_run: Optional[datetime] = Field(None, description="When to run next (for delays/retries)")
    logs: Optional[List[Dict[str, Any]]] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    error_message: Optional[str] = None


class EmailAIAuditLog(BaseModel):
    user_id: Optional[str] = None
    action: str = Field(..., description="Action performed e.g., CAMPAIGN_STARTED")
    resource_id: Optional[str] = Field(None, description="Related Campaign, SMTP, or Template ID")
    resource_type: str = Field(..., description="Campaign, SMTP, Template, System")
    details: Dict[str, Any] = Field(default_factory=dict)
    performed_by: str = Field("system")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EmailAISchedule(BaseModel):
    user_id: Optional[str] = None
    campaign_id: str
    schedule_type: str = Field(..., description="Immediate, SpecificDate, Recurring")
    cron_expression: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    max_runs: Optional[int] = None
    runs_completed: int = 0
    status: str = Field("ACTIVE", description="ACTIVE, PAUSED, COMPLETED")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
