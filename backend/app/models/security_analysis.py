from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class SecurityIssue(BaseModel):
    user_id: Optional[str] = None
    issue_type: str
    category: str # 'Security', 'Accessibility', 'Compliance'
    description: str
    risk_level: str # 'Critical', 'High', 'Medium', 'Low'
    developer_notes: Optional[str] = None
    affected_url: Optional[str] = None

class ComplianceAudit(BaseModel):
    user_id: Optional[str] = None
    has_cookie_banner: bool = False
    has_privacy_policy: bool = False
    has_terms: bool = False
    gdpr_indicators: bool = False
    ccpa_indicators: bool = False
    has_refund_policy: bool = False
    has_shipping_policy: bool = False
    has_contact_info: bool = False

class SecurityScorecard(BaseModel):
    user_id: Optional[str] = None
    overall_security_score: int = Field(ge=0, le=100, default=0)
    ssl_score: int = Field(ge=0, le=100, default=0)
    http_security_score: int = Field(ge=0, le=100, default=0)
    cookie_security_score: int = Field(ge=0, le=100, default=0)
    accessibility_score: int = Field(ge=0, le=100, default=0)
    wcag_compliance_score: int = Field(ge=0, le=100, default=0)
    privacy_compliance_score: int = Field(ge=0, le=100, default=0)
    legal_compliance_score: int = Field(ge=0, le=100, default=0)

class SecurityAnalysisResultBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    scorecard: SecurityScorecard = Field(default_factory=SecurityScorecard)
    issues: List[SecurityIssue] = Field(default_factory=list)
    compliance_audit: ComplianceAudit = Field(default_factory=ComplianceAudit)
    raw_headers: Dict[str, str] = Field(default_factory=dict)
    raw_cookies: List[Dict[str, Any]] = Field(default_factory=list)

class SecurityAnalysisResultCreate(SecurityAnalysisResultBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SecurityAnalysisResultInDB(SecurityAnalysisResultCreate):
    id: str = Field(alias="_id")

class SecurityAnalysisResultResponse(SecurityAnalysisResultInDB):
    class Config:
        populate_by_name = True
