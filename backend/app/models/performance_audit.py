"""Pydantic models for the Website Performance Audit engine.

The audit is a Lighthouse-style, fully local analysis of already-crawled
page data (HTML + response headers + timing metrics). It produces the
spec-aligned ``performanceAudit`` section stored on the Lead document and
returned inside the AI Analysis response.

Field names intentionally use camelCase to match the spec's database shape:
    performanceAudit {
        overallScore, grade, coreWebVitals, websiteSpeed, images,
        javascript, css, fonts, compression, cache, cdn, resources,
        mobile, desktop, hosting, recommendations, auditTime
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


class AuditMetric(BaseModel):
    """A single measured/estimated value with status + color."""

    value: float = 0.0
    unit: Optional[str] = None          # ms | s | KB | % | score
    status: Optional[str] = None        # Excellent | Good | Average | Poor
    color: Optional[str] = None         # hex from the status palette
    label: Optional[str] = None         # human-readable rendering hint


class CoreWebVitalsAudit(BaseModel):
    score: int = 0
    lcp: AuditMetric = Field(default_factory=AuditMetric)
    fcp: AuditMetric = Field(default_factory=AuditMetric)
    inp: AuditMetric = Field(default_factory=AuditMetric)
    cls: AuditMetric = Field(default_factory=AuditMetric)
    ttfb: AuditMetric = Field(default_factory=AuditMetric)
    tbt: AuditMetric = Field(default_factory=AuditMetric)
    speedIndex: AuditMetric = Field(default_factory=AuditMetric)
    tti: AuditMetric = Field(default_factory=AuditMetric)


class WebsiteSpeedAudit(BaseModel):
    score: int = 0
    loadTime: AuditMetric = Field(default_factory=AuditMetric)
    domReadyTime: AuditMetric = Field(default_factory=AuditMetric)
    fullyLoadedTime: AuditMetric = Field(default_factory=AuditMetric)
    initialResponseTime: AuditMetric = Field(default_factory=AuditMetric)
    networkIdleTime: AuditMetric = Field(default_factory=AuditMetric)


class ImageAudit(BaseModel):
    score: int = 0
    total: int = 0
    optimized: int = 0
    unoptimized: int = 0
    largeImages: int = 0
    missingLazyLoading: int = 0
    missingResponsive: int = 0
    missingAlt: int = 0
    formats: Dict[str, int] = Field(default_factory=dict)


class JavaScriptAudit(BaseModel):
    score: int = 0
    totalFiles: int = 0
    bundleSize: AuditMetric = Field(default_factory=AuditMetric)
    unusedJS: AuditMetric = Field(default_factory=AuditMetric)
    largeBundles: int = 0
    minified: bool = False
    treeShaking: Optional[bool] = None
    codeSplitting: bool = False
    renderBlocking: int = 0


class CSSAudit(BaseModel):
    score: int = 0
    totalFiles: int = 0
    unusedCSS: AuditMetric = Field(default_factory=AuditMetric)
    minified: bool = False
    criticalCSS: bool = False
    renderBlocking: int = 0


class FontAudit(BaseModel):
    score: int = 0
    googleFonts: int = 0
    customFonts: int = 0
    total: int = 0
    tooManyFonts: bool = False
    fontLoading: str = "block"
    fontDisplay: str = "auto"


class CompressionAudit(BaseModel):
    score: int = 0
    gzip: bool = False
    brotli: bool = False
    noCompression: bool = True


class CacheAudit(BaseModel):
    score: int = 0
    cacheControl: bool = False
    etag: bool = False
    expires: bool = False
    immutableAssets: bool = False


class CDNAudit(BaseModel):
    score: int = 0
    detected: bool = False
    provider: Optional[str] = None


class MobileAudit(BaseModel):
    score: int = 0
    viewport: bool = False
    responsiveLayout: bool = False
    touchFriendly: bool = False


class DesktopAudit(BaseModel):
    score: int = 0


class ResourceAudit(BaseModel):
    score: int = 0
    totalRequests: int = 0
    htmlSize: AuditMetric = Field(default_factory=AuditMetric)
    cssSize: AuditMetric = Field(default_factory=AuditMetric)
    jsSize: AuditMetric = Field(default_factory=AuditMetric)
    imageSize: AuditMetric = Field(default_factory=AuditMetric)
    videoSize: AuditMetric = Field(default_factory=AuditMetric)
    fontSize: AuditMetric = Field(default_factory=AuditMetric)
    totalDownloadSize: AuditMetric = Field(default_factory=AuditMetric)


class ThirdPartyAudit(BaseModel):
    score: int = 0
    count: int = 0
    trackingScripts: int = 0
    chatWidgets: int = 0
    providers: List[Dict[str, str]] = Field(default_factory=list)


class HostingAudit(BaseModel):
    score: int = 0
    responseTime: AuditMetric = Field(default_factory=AuditMetric)
    serverHeaders: Optional[str] = None
    connectionKeepAlive: bool = True
    httpVersion: Optional[str] = None
    http2: bool = False
    http3: bool = False


class PerformanceRecommendation(BaseModel):
    title: str
    description: str
    priority: str = "Medium"          # High | Medium | Low
    category: str = "Performance"


class PerformanceAuditResultCreate(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    overallScore: int = 0
    grade: str = "F"
    coreWebVitals: CoreWebVitalsAudit = Field(default_factory=CoreWebVitalsAudit)
    websiteSpeed: WebsiteSpeedAudit = Field(default_factory=WebsiteSpeedAudit)
    images: ImageAudit = Field(default_factory=ImageAudit)
    javascript: JavaScriptAudit = Field(default_factory=JavaScriptAudit)
    css: CSSAudit = Field(default_factory=CSSAudit)
    fonts: FontAudit = Field(default_factory=FontAudit)
    compression: CompressionAudit = Field(default_factory=CompressionAudit)
    cache: CacheAudit = Field(default_factory=CacheAudit)
    cdn: CDNAudit = Field(default_factory=CDNAudit)
    resources: ResourceAudit = Field(default_factory=ResourceAudit)
    mobile: MobileAudit = Field(default_factory=MobileAudit)
    desktop: DesktopAudit = Field(default_factory=DesktopAudit)
    hosting: HostingAudit = Field(default_factory=HostingAudit)
    thirdParty: ThirdPartyAudit = Field(default_factory=ThirdPartyAudit)
    recommendations: List[PerformanceRecommendation] = Field(default_factory=list)
    auditTime: float = 0.0            # milliseconds spent auditing
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PerformanceAuditResultInDB(PerformanceAuditResultCreate):
    id: str = Field(alias="_id")


class PerformanceAuditResultResponse(PerformanceAuditResultInDB):
    class Config:
        populate_by_name = True
