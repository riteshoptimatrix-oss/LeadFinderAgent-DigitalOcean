from enum import Enum
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

class CampaignStatus(str, Enum):
    DRAFT = "Draft"
    SCHEDULED = "Scheduled"
    QUEUED = "Queued"
    RUNNING = "Running"
    PAUSED = "Paused"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"
    FAILED = "Failed"

class CampaignType(str, Enum):
    EMAIL = "EMAIL"
    WHATSAPP = "WHATSAPP"
    SMS = "SMS"
    LINKEDIN = "LINKEDIN"
    TELEGRAM = "TELEGRAM"

class CampaignTemplateBase(BaseModel):
    user_id: Optional[str] = None
    name: str
    campaign_type: CampaignType
    subject: Optional[str] = None # Used for Email
    content: str # Contains {{Variables}}

class CampaignTemplateCreate(CampaignTemplateBase):
    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class CampaignTemplateInDB(CampaignTemplateCreate):
    id: str = Field(alias="_id")

# Queue Item representing a single message to a single lead
class CampaignQueueItem(BaseModel):
    user_id: Optional[str] = None
    campaign_id: str
    lead_id: str
    user_id: str
    status: str = "Pending" # Pending, Success, Failed, Retry
    retry_count: int = 0
    error_message: Optional[str] = None
    last_attempt_at: Optional[datetime] = None

class CampaignBase(BaseModel):
    user_id: Optional[str] = None
    name: str
    campaign_type: CampaignType
    template_id: str
    status: CampaignStatus = CampaignStatus.DRAFT
    scheduled_date: Optional[datetime] = None
    # Tracking
    success_count: int = 0
    failure_count: int = 0
    pending_count: int = 0
    total_count: int = 0

class CampaignCreate(CampaignBase):
    user_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

class CampaignInDB(CampaignCreate):
    id: str = Field(alias="_id")

class CampaignResponse(CampaignInDB):
    class Config:
        populate_by_name = True

class CampaignLog(BaseModel):
    user_id: Optional[str] = None
    campaign_id: str
    user_id: str
    lead_id: Optional[str] = None
    action: str
    message: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class PaginatedCampaignResponse(BaseModel):
    user_id: Optional[str] = None
    data: List[CampaignResponse]
    total: int
