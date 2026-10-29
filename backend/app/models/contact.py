from typing import List, Optional
from pydantic import BaseModel, Field
from app.models.pyobjectid import PyObjectId
from bson import ObjectId

class ContactExtracted(BaseModel):
    user_id: Optional[str] = None
    type: str = Field(description="Email, Phone, WhatsApp, LinkedIn, Twitter, Facebook, Instagram")
    value: str = Field(...)
    source_url: str = Field(...)
    confidence_score: int = Field(default=100)

class ContactDiscoveryResult(BaseModel):
    user_id: Optional[str] = None
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    job_id: str = Field(...)
    lead_id: str = Field(...)
    
    primary_email: Optional[str] = None
    primary_phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    
    office_addresses: List[str] = Field(default_factory=list)
    contacts: List[ContactExtracted] = Field(default_factory=list)
    
    social_linkedin: Optional[str] = None
    social_twitter: Optional[str] = None
    social_facebook: Optional[str] = None
    social_instagram: Optional[str] = None
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
