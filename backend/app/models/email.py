from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class EmailCampaignStatus(str, Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"

class EmailTemplateCreate(BaseModel):
    user_id: Optional[str] = None
    name: str
    subject: str
    content_html: str
    content_text: Optional[str] = None
    category: Optional[str] = "General"

class EmailTemplateResponse(EmailTemplateCreate):
    id: str = Field(alias="_id")
    user_id: str
    created_at: datetime
    updated_at: datetime

class EmailCampaignCreate(BaseModel):
    user_id: Optional[str] = None
    name: str
    template_id: str
    lead_ids: List[str]
    sender_name: Optional[str] = None
    reply_to: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    priority: int = 1

class EmailCampaignResponse(BaseModel):
    user_id: Optional[str] = None
    id: str = Field(alias="_id")
    name: str
    template_id: str
    status: EmailCampaignStatus
    user_id: str
    sender_name: Optional[str] = None
    reply_to: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    total_count: int = 0
    pending_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    open_count: int = 0
    click_count: int = 0
    bounce_count: int = 0
    unsub_count: int = 0
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

class EmailLogResponse(BaseModel):
    user_id: Optional[str] = None
    id: str = Field(alias="_id")
    campaign_id: str
    lead_id: str
    user_id: str
    action: str  # QUEUED, SENT, OPENED, CLICKED, FAILED, BOUNCED, UNSUBSCRIBED
    message: str
    timestamp: datetime
