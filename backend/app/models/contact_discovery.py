from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class DiscoveredContact(BaseModel):
    user_id: Optional[str] = None
    type: str # 'Email', 'Phone', 'WhatsApp', 'LinkedIn', 'Twitter', 'Facebook', 'Instagram', 'YouTube', 'Pinterest', 'Threads', 'Telegram', 'Google Business', 'Address'
    value: str
    source_url: str
    is_primary: bool = False
    confidence_score: float = Field(default=1.0)
    extraction_method: str = Field(default="regex")
    classification: str = Field(default="General Contact") # Primary, Support, Sales, Marketing, HR, Career, Billing, Technical, General Contact
    dom_selector: Optional[str] = None
    page_type: Optional[str] = None
    discovery_time: datetime = Field(default_factory=datetime.utcnow)

class ContactDiscoveryResultBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    contacts: List[DiscoveredContact] = Field(default_factory=list)
    primary_email: Optional[str] = None
    primary_phone: Optional[str] = None

class ContactDiscoveryResultCreate(ContactDiscoveryResultBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)

from app.models.pyobjectid import PyObjectId
from pydantic import ConfigDict

class ContactDiscoveryResultInDB(ContactDiscoveryResultCreate):
    id: PyObjectId = Field(alias="_id")

class ContactDiscoveryResultResponse(ContactDiscoveryResultInDB):
    model_config = ConfigDict(populate_by_name=True)
