"""Pydantic models for the Enterprise Website Security Audit engine.

The core audit runs fully locally on already-crawled page data (URL scheme,
response headers, rendered HTML). The optional Domain Security section adds
bounded, cached DNSSEC + WHOIS lookups performed off the event loop. Produces
the spec-aligned ``securityAudit`` section stored on the Lead document and
returned inside the AI Analysis response.

Field names use camelCase to match the spec's database shape:
    securityAudit {
        overallScore, grade, ssl, headers, cookies, server, forms,
        content, authentication, domain, recommendations, auditTime
    }
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime


# Status → color mapping (used by the frontend for value pills).
GREEN = "#10b981"
BLUE = "#3b82f6"
ORANGE = "#f59e0b"
RED = "#ef4444"
CRITICAL = "#7f1d1d"


class SecurityHeaderItem(BaseModel):
    """A single HTTP security header check result."""

    name: str
    status: str                    # Present | Missing | Weak | Configured
    value: Optional[str] = None


class SecurityHeaderAudit(BaseModel):
    score: int = 0
    present: int = 0
    missing: int = 0
    weak: int = 0
    total: int = 0
    headers: List[SecurityHeaderItem] = Field(default_factory=list)


class SSLAudit(BaseModel):
    """SSL certificate + HTTPS transport security checks."""

    score: int = 0
    enabled: bool = False                 # HTTPS enabled
    valid: bool = False                   # certificate valid (not expired)
    expiry: Optional[str] = None          # e.g. "2026-08-01"
    issuer: Optional[str] = None
    version: Optional[str] = None
    daysRemaining: Optional[int] = None
    expired: bool = False
    selfSigned: bool = False
    weak: bool = False
    httpRedirect: bool = False            # HTTP → HTTPS redirect detected
    mixedContent: bool = False            # HTTP resources on HTTPS page
    secureConnection: bool = False


class CookieAudit(BaseModel):
    score: int = 0
    totalCookies: int = 0
    secureCookies: int = 0
    httpOnlyCookies: int = 0
    sameSiteCookies: int = 0
    sessionCookies: int = 0
    insecureCookies: int = 0


class ServerAudit(BaseModel):
    score: int = 0
    server: Optional[str] = None
    serverHeaderExposed: bool = False
    xPoweredBy: Optional[str] = None
    xPoweredByExposed: bool = False
    phpVersionExposed: bool = False
    aspNetVersionExposed: bool = False
    apacheVersionExposed: bool = False
    nginxVersionExposed: bool = False
    informationLeakage: bool = False


class FormAudit(BaseModel):
    score: int = 0
    totalForms: int = 0
    formsWithCsrf: int = 0
    csrfProtected: bool = False
    passwordFields: int = 0
    autocompleteSensitive: int = 0
    httpsSubmit: bool = True
    captchaProtected: bool = False
    recaptcha: bool = False
    turnstile: bool = False


class ContentAudit(BaseModel):
    score: int = 0
    mixedContent: bool = False
    unsafeResources: int = 0
    externalScripts: int = 0
    unsafeIframes: int = 0
    totalIframes: int = 0


class AuthenticationAudit(BaseModel):
    score: int = 0
    loginPage: bool = False
    passwordReset: bool = False
    registration: bool = False
    protectedAdminPages: bool = False


class DomainAudit(BaseModel):
    """Domain-level security: DNSSEC signing + WHOIS registration data.

    dnssecEnabled is tri-state — True when the zone publishes DNSKEY records,
    False when confirmed unsigned, None when the check was unavailable.
    """

    score: int = 0
    domain: Optional[str] = None
    dnssecEnabled: Optional[bool] = None
    dnssecValid: bool = False
    whoisAvailable: bool = False
    registrar: Optional[str] = None
    creationDate: Optional[str] = None
    expiryDate: Optional[str] = None
    daysToExpiry: Optional[int] = None
    expired: bool = False
    nameServers: List[str] = Field(default_factory=list)


class SecurityRecommendation(BaseModel):
    title: str
    description: str
    priority: str = "Medium"          # High | Medium | Low
    category: str = "Security"


class SecurityAuditResultCreate(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    overallScore: int = 0
    grade: str = "F"
    ssl: SSLAudit = Field(default_factory=SSLAudit)
    headers: SecurityHeaderAudit = Field(default_factory=SecurityHeaderAudit)
    cookies: CookieAudit = Field(default_factory=CookieAudit)
    server: ServerAudit = Field(default_factory=ServerAudit)
    forms: FormAudit = Field(default_factory=FormAudit)
    content: ContentAudit = Field(default_factory=ContentAudit)
    authentication: AuthenticationAudit = Field(default_factory=AuthenticationAudit)
    domain: DomainAudit = Field(default_factory=DomainAudit)
    recommendations: List[SecurityRecommendation] = Field(default_factory=list)
    auditTime: float = 0.0            # milliseconds spent auditing
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SecurityAuditResultInDB(SecurityAuditResultCreate):
    id: str = Field(alias="_id")


class SecurityAuditResultResponse(SecurityAuditResultInDB):
    class Config:
        populate_by_name = True
