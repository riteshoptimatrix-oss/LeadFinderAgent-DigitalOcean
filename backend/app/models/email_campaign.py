from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────

class EmailCampaignStatus(str, Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"


class EmailMessageStatus(str, Enum):
    PENDING = "PENDING"
    PREPARING = "PREPARING"
    CONNECTING_SMTP = "CONNECTING_SMTP"
    PERSONALIZING = "PERSONALIZING"
    SENDING = "SENDING"
    SENT = "SENT"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"
    RETRYING = "RETRYING"
    CANCELLED = "CANCELLED"


SUPPORTED_VARIABLES = [
    "business_name",
    "company_name",
    "contact_name",
    "city",
    "state",
    "country",
    "website",
    "email",
    "phone",
    "category",
    "ai_score",
    "seo_score",
    "website_score"
]


# ──────────────────────────────────────────────
# Templates
# ──────────────────────────────────────────────

class EmailTemplateCreate(BaseModel):
    user_id: Optional[str] = None
    name: str
    subject: str
    html_content: str
    plain_content: Optional[str] = None
    category: str = "General"
    is_default: bool = False


class EmailTemplateUpdate(BaseModel):
    user_id: Optional[str] = None
    name: Optional[str] = None
    subject: Optional[str] = None
    html_content: Optional[str] = None
    plain_content: Optional[str] = None
    category: Optional[str] = None
    is_default: Optional[bool] = None


class EmailTemplateResponse(BaseModel):
    user_id: Optional[str] = None
    id: str = Field(alias="_id")
    user_id: str
    name: str
    subject: str
    html_content: str
    plain_content: Optional[str] = None
    category: str = "General"
    is_default: bool = False
    variables_used: List[str] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


# ──────────────────────────────────────────────
# Campaigns
# ──────────────────────────────────────────────

class EmailCampaignFilters(BaseModel):
    user_id: Optional[str] = None
    search: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None


class EmailCampaignCreate(BaseModel):
    user_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    template_id: str
    lead_ids: List[str]
    filters: Optional[EmailCampaignFilters] = None


class EmailCampaignResponse(BaseModel):
    user_id: Optional[str] = None
    id: str = Field(alias="_id")
    user_id: str
    name: str
    description: Optional[str] = None
    template_id: str
    status: EmailCampaignStatus = EmailCampaignStatus.DRAFT
    total_count: int = 0
    sent_count: int = 0
    failed_count: int = 0
    skipped_count: int = 0
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        populate_by_name = True


# ──────────────────────────────────────────────
# Message Logs
# ──────────────────────────────────────────────

class EmailMessageLogResponse(BaseModel):
    user_id: Optional[str] = None
    id: str = Field(alias="_id")
    campaign_id: str
    user_id: str
    lead_id: str
    lead_name: Optional[str] = None
    recipient_email: str
    status: EmailMessageStatus = EmailMessageStatus.PENDING
    rendered_subject: Optional[str] = None
    rendered_html: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    next_retry_at: Optional[datetime] = None
    queued_at: datetime
    sent_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        populate_by_name = True


class PaginatedEmailLogResponse(BaseModel):
    user_id: Optional[str] = None
    data: List[EmailMessageLogResponse]
    total: int


# ──────────────────────────────────────────────
# Campaign History
# ──────────────────────────────────────────────

class EmailCampaignHistoryResponse(BaseModel):
    user_id: Optional[str] = None
    id: str = Field(alias="_id")
    campaign_id: str
    campaign_name: str
    user_id: str
    action: str
    details: Optional[str] = None
    created_at: datetime

    class Config:
        populate_by_name = True


# ──────────────────────────────────────────────
# Preview & Validation
# ──────────────────────────────────────────────

class EmailPreviewRequest(BaseModel):
    user_id: Optional[str] = None
    template_subject: str
    template_html: str
    lead_id: Optional[str] = None


class EmailPreviewResponse(BaseModel):
    user_id: Optional[str] = None
    rendered_subject: str
    rendered_html: str
    lead_name: Optional[str] = None
    variables_found: List[str] = []


class EmailValidateTemplateRequest(BaseModel):
    user_id: Optional[str] = None
    subject: str
    html_content: str


class EmailValidateTemplateResponse(BaseModel):
    user_id: Optional[str] = None
    is_valid: bool
    errors: List[str] = []
    warnings: List[str] = []
    variables_used: List[str] = []


# ──────────────────────────────────────────────
# Leads
# ──────────────────────────────────────────────

class EmailLeadResponse(BaseModel):
    user_id: Optional[str] = None
    id: str = Field(alias="_id")
    name: Optional[str] = None
    email: Optional[str] = None
    emails: List[str] = []
    phone: Optional[str] = None
    phones: List[str] = []
    website: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    category: Optional[str] = None
    company_name: Optional[str] = None
    lead_source: Optional[str] = None
    created_at: Optional[datetime] = None
    ai_score: Optional[int] = 0
    status: str = "New"

    class Config:
        populate_by_name = True


class PaginatedEmailLeadResponse(BaseModel):
    user_id: Optional[str] = None
    data: List[EmailLeadResponse]
    total: int
