from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class TechnologyStack(BaseModel):
    user_id: Optional[str] = None
    """Detected technologies on the website"""
    cms: Optional[str] = None  # WordPress, Shopify, Custom, etc.
    framework: Optional[str] = None  # React, Angular, Vue, Next.js, etc.
    hosting: Optional[str] = None
    analytics: List[str] = Field(default_factory=list)
    other: List[str] = Field(default_factory=list)

class SEOMetrics(BaseModel):
    user_id: Optional[str] = None
    """SEO-related metrics"""
    title: Optional[str] = None
    meta_description: Optional[str] = None
    h1_count: int = 0
    h2_count: int = 0
    h3_count: int = 0
    total_headings: int = 0
    missing_alt_images: int = 0
    total_images: int = 0
    has_sitemap: bool = False
    has_robots_txt: bool = False
    canonical_url: Optional[str] = None

class SecurityMetrics(BaseModel):
    user_id: Optional[str] = None
    """Security-related metrics"""
    ssl_enabled: bool = False
    ssl_valid: bool = False
    ssl_issuer: Optional[str] = None
    ssl_expiry: Optional[datetime] = None
    security_headers: Dict[str, bool] = Field(default_factory=dict)
    mixed_content: bool = False

class PerformanceMetrics(BaseModel):
    user_id: Optional[str] = None
    """Performance-related metrics"""
    page_load_time_ms: Optional[int] = None
    page_size_kb: Optional[int] = None
    total_requests: Optional[int] = None
    time_to_first_byte_ms: Optional[int] = None
    mobile_friendly: Optional[bool] = None

class AccessibilityMetrics(BaseModel):
    user_id: Optional[str] = None
    """Accessibility metrics"""
    has_lang_attribute: bool = False
    has_viewport_meta: bool = False
    color_contrast_issues: int = 0
    form_labels_missing: int = 0
    aria_labels_present: bool = False

class AuditIssues(BaseModel):
    user_id: Optional[str] = None
    """Issues found during audit"""
    critical: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)

class WebsiteAuditData(BaseModel):
    user_id: Optional[str] = None
    """Complete audit data"""
    # Basic info
    url: str
    http_status: Optional[int] = None
    response_time_ms: Optional[int] = None
    
    # Technology
    technology: TechnologyStack = Field(default_factory=TechnologyStack)
    
    # SEO
    seo: SEOMetrics = Field(default_factory=SEOMetrics)
    
    # Security
    security: SecurityMetrics = Field(default_factory=SecurityMetrics)
    
    # Performance
    performance: PerformanceMetrics = Field(default_factory=PerformanceMetrics)
    
    # Accessibility
    accessibility: AccessibilityMetrics = Field(default_factory=AccessibilityMetrics)
    
    # Issues
    issues: AuditIssues = Field(default_factory=AuditIssues)
    
    # Scores (0-100)
    seo_score: int = 0
    security_score: int = 0
    performance_score: int = 0
    accessibility_score: int = 0
    overall_score: int = 0

class WebsiteAuditResponse(BaseModel):
    user_id: Optional[str] = None
    """Response model for website audit"""
    id: str = Field(alias="_id")
    lead_id: str
    user_id: str
    business_name: Optional[str] = None
    website: str
    audit_data: WebsiteAuditData
    audited_at: datetime
    processing_time_ms: int
    
    class Config:
        populate_by_name = True

class GlobalAuditStats(BaseModel):
    user_id: Optional[str] = None
    """Global statistics across all audits"""
    total_audits: int = 0
    avg_overall_score: float = 0.0
    avg_seo_score: float = 0.0
    avg_security_score: float = 0.0
    avg_performance_score: float = 0.0
    avg_accessibility_score: float = 0.0
    
    # Technology distribution
    technology_distribution: Dict[str, int] = Field(default_factory=dict)
    cms_distribution: Dict[str, int] = Field(default_factory=dict)
    
    # Security stats
    ssl_enabled_count: int = 0
    ssl_enabled_percentage: float = 0.0
    
    # Performance stats
    avg_page_load_time_ms: Optional[float] = None
    mobile_friendly_count: int = 0
    mobile_friendly_percentage: float = 0.0
    
    # Common issues
    most_common_issues: List[Dict[str, Any]] = Field(default_factory=list)

class GlobalAuditResponse(BaseModel):
    user_id: Optional[str] = None
    """Response model for global audit statistics"""
    user_id: str
    stats: GlobalAuditStats
    generated_at: datetime
    
    class Config:
        populate_by_name = True

class AuditLogCreate(BaseModel):
    user_id: Optional[str] = None
    """System audit log for tracking user actions"""
    user_id: str
    user_email: str
    action: str
    resource: Optional[str] = None
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ActivityLogCreate(BaseModel):
    user_id: Optional[str] = None
    """User activity log"""
    user_id: str
    type: str
    description: str
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
