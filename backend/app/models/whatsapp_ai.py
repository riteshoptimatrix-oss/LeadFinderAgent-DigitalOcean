from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class WAAITemplateBase(BaseModel):
    user_id: Optional[str] = None
    name: str = Field(..., description="Name of the template")
    content: str = Field(..., description="Template content with placeholders like {{business_name}}")
    description: Optional[str] = None
    is_active: bool = True

class WAAITemplateCreate(WAAITemplateBase):
    pass

class WAAITemplateUpdate(BaseModel):
    user_id: Optional[str] = None
    name: Optional[str] = None
    content: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class WAAITemplateInDB(WAAITemplateBase):
    id: str = Field(..., alias="_id")
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True

class WAAICampaignBase(BaseModel):
    user_id: Optional[str] = None
    name: str = Field(..., description="Campaign name")
    description: Optional[str] = None
    template_id: str = Field(..., description="ID of the template used")
    target_leads: List[str] = Field(default_factory=list, description="List of lead IDs")
    status: str = Field(default="pending", description="Status of the campaign")
    optional_delay: Optional[int] = None
    random_delay: Optional[bool] = False
    retry_count: Optional[int] = 0
    schedule: Optional[str] = None

class WAAICampaignCreate(WAAICampaignBase):
    pass

class WAAICampaignInDB(WAAICampaignBase):
    id: str = Field(..., alias="_id")
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        populate_by_name = True


class WhatsAppConfigUpdate(BaseModel):
    access_token: Optional[str] = None
    phone_number_id: Optional[str] = None
    waba_id: Optional[str] = None
    verify_token: Optional[str] = None


class WhatsAppConfigResponse(BaseModel):
    is_configured: bool
    phone_number_id: Optional[str] = None
    waba_id: Optional[str] = None
    masked_token: Optional[str] = None
    webhook_url: Optional[str] = None
    verified_phone: Optional[str] = None
    display_name: Optional[str] = None
    quality_rating: Optional[str] = None


class PreviewRequest(BaseModel):
    template_id: Optional[str] = None
    template_content: Optional[str] = None
    lead_id: Optional[str] = None
