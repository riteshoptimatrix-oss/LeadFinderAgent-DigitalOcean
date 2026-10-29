"""Pydantic models for the Enterprise SEO Intelligence Engine.

The audit is a Lighthouse-style, fully local analysis of already-crawled
page data (HTML). It produces the spec-aligned ``seoAudit`` section stored on
the Lead document and returned inside the AI Analysis response.

Field names intentionally use camelCase to match the spec's database shape:
    seoAudit {
        overallScore, grade, meta, headings, images, urls, indexability,
        openGraph, twitterCards, schema, internalLinks, externalLinks,
        content, mobile, pages, localSEO, socialSEO, favicon,
        issues, recommendations, auditTime
    }

Every category module reports a ``score`` (0-100), a visual ``status``
(Excellent / Good / Average / Poor / Critical), a ``color`` and its own
``issueCount`` + ``recommendationCount`` so the UI can render one card per
module with Status, Score, Issue Count and Recommendation Count.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from datetime import datetime


# Status → color mapping (used by the frontend for value pills).
GREEN = "#10b981"        # Excellent
BLUE = "#3b82f6"         # Good
ORANGE = "#f59e0b"       # Average
RED = "#ef4444"          # Poor
CRITICAL = "#b91c1c"     # Critical


class SEOModuleAudit(BaseModel):
    """Base shape shared by every SEO category module (audit card)."""

    score: int = 0
    status: Optional[str] = None        # Excellent | Good | Average | Poor | Critical
    color: Optional[str] = None         # hex from the status palette
    issueCount: int = 0
    recommendationCount: int = 0


class SEOMetaAudit(SEOModuleAudit):
    title: Optional[str] = None
    titleLength: int = 0
    titleStatus: Optional[str] = None
    metaDescription: Optional[str] = None
    descriptionLength: int = 0
    descriptionStatus: Optional[str] = None
    canonical: Optional[str] = None
    canonicalStatus: Optional[str] = None
    missingTitles: int = 0
    missingDescriptions: int = 0
    duplicateTitles: int = 0
    duplicateDescriptions: int = 0
    longTitles: int = 0
    longDescriptions: int = 0


class SEOHeadingsAudit(SEOModuleAudit):
    h1Count: int = 0
    h2Count: int = 0
    h3Count: int = 0
    singleH1: bool = True
    hierarchicalOrder: bool = True
    pagesWithMissingH1: int = 0
    pagesWithMultipleH1: int = 0


class SEOImagesAudit(SEOModuleAudit):
    total: int = 0
    withAlt: int = 0
    missingAlt: int = 0
    missingAltPages: int = 0
    lazyLoaded: int = 0
    missingLazyLoading: int = 0
    missingDimensions: int = 0
    missingWidthHeight: int = 0


class SEOUrlsAudit(SEOModuleAudit):
    totalPages: int = 0
    cleanUrls: int = 0
    descriptiveSlugs: int = 0
    lengthIssues: int = 0
    uppercaseUrls: int = 0
    underscoresInUrls: int = 0
    queryStringUrls: int = 0


class SEOIndexabilityAudit(SEOModuleAudit):
    hasRobotsTxt: bool = False
    robotsTxtUrl: Optional[str] = None
    hasSitemap: bool = False
    sitemapUrl: Optional[str] = None
    noindexPages: int = 0
    blockedByRobots: int = 0
    canonicalIssues: int = 0
    indexablePages: int = 0


class SEOOpenGraphAudit(SEOModuleAudit):
    hasOpenGraph: bool = False
    pagesWithOgTags: int = 0
    totalPages: int = 0
    ogTitle: bool = False
    ogDescription: bool = False
    ogImage: bool = False
    ogUrl: bool = False
    ogType: bool = False
    missingTags: int = 0


class SEOTwitterCardsAudit(SEOModuleAudit):
    hasTwitterCards: bool = False
    pagesWithTwitterTags: int = 0
    totalPages: int = 0
    twitterCard: bool = False
    twitterTitle: bool = False
    twitterDescription: bool = False
    twitterImage: bool = False
    missingTags: int = 0


class SEOSchemaAudit(SEOModuleAudit):
    hasSchema: bool = False
    totalSchemas: int = 0
    jsonLdBlocks: int = 0
    microdataItems: int = 0
    schemaTypes: List[str] = Field(default_factory=list)
    validJsonLd: bool = True
    pagesWithSchema: int = 0
    totalPages: int = 0
    hasOrganization: bool = False
    hasBreadcrumbs: bool = False
    hasLocalBusiness: bool = False


class SEOInternalLinksAudit(SEOModuleAudit):
    total: int = 0
    averagePerPage: float = 0.0
    orphanedPages: int = 0
    pagesWithoutInternalLinks: int = 0
    brokenInternalLinks: int = 0
    deepLinks: int = 0
    homePageLinks: int = 0


class SEOExternalLinksAudit(SEOModuleAudit):
    total: int = 0
    nofollowCount: int = 0
    followedCount: int = 0
    brokenExternalLinks: int = 0
    highAuthorityLinks: int = 0
    spammyLinks: int = 0


class SEOContentAudit(SEOModuleAudit):
    avgWordCount: int = 0
    minWordCount: int = 0
    maxWordCount: int = 0
    thinPages: int = 0
    totalPages: int = 0
    hasBlog: bool = False
    textToHtmlRatio: float = 0.0
    duplicateContent: int = 0
    keywordInTitle: int = 0
    keywordInH1: int = 0


class SEOMobileAudit(SEOModuleAudit):
    viewport: bool = False
    responsiveLayout: bool = False
    tapTargets: bool = False
    mobileFriendly: bool = False
    pagesWithViewport: int = 0
    totalPages: int = 0


class SEOPagesAudit(SEOModuleAudit):
    totalPages: int = 0
    titleCoverage: int = 0
    descriptionCoverage: int = 0
    canonicalCoverage: int = 0
    h1Coverage: int = 0
    indexablePages: int = 0
    duplicateTitles: int = 0
    duplicateDescriptions: int = 0


class SEOLocalSEOAudit(SEOModuleAudit):
    hasNab: bool = False
    hasAddress: bool = False
    hasPhone: bool = False
    hasLocalBusinessSchema: bool = False
    hasGoogleMaps: bool = False
    localPackSignals: int = 0
    citiesMentioned: List[str] = Field(default_factory=list)


class SEOSocialSEOAudit(SEOModuleAudit):
    hasSocialLinks: bool = False
    socialProfiles: int = 0
    hasSameAsSchema: bool = False
    platforms: List[str] = Field(default_factory=list)


class SEOFaviconAudit(SEOModuleAudit):
    hasFavicon: bool = False
    faviconUrl: Optional[str] = None
    hasAppleTouchIcon: bool = False
    hasIcoFormat: bool = False
    multipleIcons: int = 0


class SEOSEOIssue(BaseModel):
    category: str = "SEO"
    severity: str = "Warning"           # Error | Warning | Info
    status: Optional[str] = None        # Excellent | Good | Average | Poor | Critical
    title: str = ""
    description: str = ""
    affectedUrl: Optional[str] = None


class SEOSEORecommendation(BaseModel):
    title: str = ""
    description: str = ""
    priority: str = "Medium"            # High | Medium | Low
    category: str = "SEO"


class SEOAuditResultCreate(BaseModel):
    class Config:
        populate_by_name = True

    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    overallScore: int = 0
    grade: str = "F"
    overallStatus: Optional[str] = None
    overallColor: Optional[str] = None
    meta: SEOMetaAudit = Field(default_factory=SEOMetaAudit)
    headings: SEOHeadingsAudit = Field(default_factory=SEOHeadingsAudit)
    images: SEOImagesAudit = Field(default_factory=SEOImagesAudit)
    urls: SEOUrlsAudit = Field(default_factory=SEOUrlsAudit)
    indexability: SEOIndexabilityAudit = Field(default_factory=SEOIndexabilityAudit)
    openGraph: SEOOpenGraphAudit = Field(default_factory=SEOOpenGraphAudit)
    twitterCards: SEOTwitterCardsAudit = Field(default_factory=SEOTwitterCardsAudit)
    schema_markup: SEOSchemaAudit = Field(
        default_factory=SEOSchemaAudit,
        validation_alias="schema",
        serialization_alias="schema",
    )
    internalLinks: SEOInternalLinksAudit = Field(default_factory=SEOInternalLinksAudit)
    externalLinks: SEOExternalLinksAudit = Field(default_factory=SEOExternalLinksAudit)
    content: SEOContentAudit = Field(default_factory=SEOContentAudit)
    mobile: SEOMobileAudit = Field(default_factory=SEOMobileAudit)
    pages: SEOPagesAudit = Field(default_factory=SEOPagesAudit)
    localSEO: SEOLocalSEOAudit = Field(default_factory=SEOLocalSEOAudit)
    socialSEO: SEOSocialSEOAudit = Field(default_factory=SEOSocialSEOAudit)
    favicon: SEOFaviconAudit = Field(default_factory=SEOFaviconAudit)
    issues: List[SEOSEOIssue] = Field(default_factory=list)
    recommendations: List[SEOSEORecommendation] = Field(default_factory=list)
    auditTime: float = 0.0              # milliseconds spent auditing
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SEOAuditResultInDB(SEOAuditResultCreate):
    id: str = Field(alias="_id")


class SEOAuditResultResponse(SEOAuditResultInDB):
    class Config:
        populate_by_name = True
