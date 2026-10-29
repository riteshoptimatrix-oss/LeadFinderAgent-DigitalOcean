from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class DetectedTechnology(BaseModel):
    user_id: Optional[str] = None
    name: str
    category: str # 'Server', 'CMS', 'Frontend Framework', 'Backend Framework', 'Programming Language', 'Database', 'Hosting', 'CDN', 'Analytics', 'Marketing Tools', 'Payment Gateway', 'Security', 'AI', ...
    version: Optional[str] = None
    detection_method: str
    confidence_score: float = Field(ge=0, le=100)
    evidence: str
    # ── Website Technology Stack (extended fields) ──
    confidence: Optional[float] = Field(default=None, ge=0, le=100)
    detectedFrom: Optional[str] = None
    logo: Optional[str] = None

class TechnologyDetectionResultBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    technologies: List[DetectedTechnology] = Field(default_factory=list)
    # Spec-aligned representation: [{name, category, confidence, version, detectedFrom, logo}]
    websiteTechnologies: List[Dict[str, Any]] = Field(default_factory=list)
    # AI insights derived from the detected stack.
    insights: Dict[str, List[str]] = Field(default_factory=dict)

class TechnologyDetectionResultCreate(TechnologyDetectionResultBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TechnologyDetectionResultInDB(TechnologyDetectionResultCreate):
    id: str = Field(alias="_id")

class TechnologyDetectionResultResponse(TechnologyDetectionResultInDB):
    class Config:
        populate_by_name = True
