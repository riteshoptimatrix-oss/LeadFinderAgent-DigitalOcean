from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────

class WACampaignStatus(str, Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    QUEUED = "QUEUED"
    WAITING_CONFIGURATION = "WAITING_CONFIGURATION"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"


class WAMessageStatus(str, Enum):
    PENDING = "PENDING"
    PREPARING = "PREPARING"
    OPENING_WHATSAPP = "OPENING_WHATSAPP"
    SENDING = "SENDING"
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    READ = "READ"
    FAILED = "FAILED"
    CONFIGURATION_ERROR = "CONFIGURATION_ERROR"
    SKIPPED = "SKIPPED"


SUPPORTED_VARIABLES = [
    "business_name",
    "owner",
    "city",
    "website",
    "phone",
    "category",
]


# ──────────────────────────────────────────────
# Templates
# ──────────────────────────────────────────────

class WATemplateCreate(BaseModel):
    user_id: Optional[str] = None
    name: str
    content: str
    category: str = "General"
    is_default: bool = False


class WATemplateUpdate(BaseModel):
    user_id: Optional[str] = None
    name: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    is_default: Optional[bool] = None


class WATemplateResponse(BaseModel):
    user_id: Optional[str] = None
    id: str = Field(alias="_id")
    user_id: str
    name: str
    content: str
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

class WACampaignFilters(BaseModel):
    user_id: Optional[str] = None
    search: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None


class WACampaignCreate(BaseModel):
    user_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    template_id: str
    lead_ids: List[str]
    lead_source: Optional[str] = None
    filters: Optional[WACampaignFilters] = None


class WACampaignResponse(BaseModel):
    user_id: Optional[str] = None
    id: str = Field(alias="_id")
    user_id: str
    name: str
    description: Optional[str] = None
    template_id: str
    status: WACampaignStatus = WACampaignStatus.DRAFT
    lead_source: Optional[str] = None
    total_count: int = 0
    sent_count: int = 0
    delivered_count: int = 0
    failed_count: int = 0
    read_count: int = 0
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        populate_by_name = True


# ──────────────────────────────────────────────
# Message Logs
# ──────────────────────────────────────────────

class WAMessageLogResponse(BaseModel):
    user_id: Optional[str] = None
    id: str = Field(alias="_id")
    campaign_id: str
    user_id: str
    lead_id: str
    lead_name: Optional[str] = None
    recipient_phone: str
    status: WAMessageStatus = WAMessageStatus.PENDING
    rendered_message: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    next_retry_at: Optional[datetime] = None
    queued_at: datetime
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        populate_by_name = True


# ──────────────────────────────────────────────
# Campaign History
# ──────────────────────────────────────────────

class WACampaignHistoryResponse(BaseModel):
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

class WAPreviewRequest(BaseModel):
    user_id: Optional[str] = None
    template_content: str
    lead_id: Optional[str] = None


class WAPreviewResponse(BaseModel):
    user_id: Optional[str] = None
    rendered_message: str
    lead_name: Optional[str] = None
    variables_found: List[str] = []


class WAValidateTemplateRequest(BaseModel):
    user_id: Optional[str] = None
    content: str


class WAValidateTemplateResponse(BaseModel):
    user_id: Optional[str] = None
    is_valid: bool
    errors: List[str] = []
    warnings: List[str] = []
    variables_used: List[str] = []
    character_count: int = 0


# ──────────────────────────────────────────────
# Leads
# ──────────────────────────────────────────────

class WALeadResponse(BaseModel):
    user_id: Optional[str] = None
    id: str = Field(alias="_id")
    name: Optional[str] = None
    phone: Optional[str] = None
    phones: List[str] = []
    email: Optional[str] = None
    emails: List[str] = []
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    category: Optional[str] = None
    lead_score: Optional[int] = 0
    status: str = "New"
    google_rating: Optional[float] = None
    created_at: Optional[datetime] = None

    class Config:
        populate_by_name = True


class PaginatedWALeadResponse(BaseModel):
    user_id: Optional[str] = None
    data: List[WALeadResponse]
    total: int
    variables_used: List[str] = []
    character_count: int = 0
