"""Pydantic models for the Enterprise Website UI/UX Intelligence Engine.

The audit is a Lighthouse-style, fully local analysis of already-crawled
page data (rendered HTML). It produces the spec-aligned ``uiuxAudit`` section
stored on the Lead document and returned inside the AI Analysis response.

Field names intentionally use camelCase to match the spec's database shape:
    uiuxAudit {
        overallScore, grade, visualDesign, colors, typography, layout,
        navigation, cta, responsive, mobile, forms, ux, content, images,
        icons, branding, accessibility, modernDesign, trust,
        issues, recommendations, redesignOpportunity, salesOpportunity,
        auditTime
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


class UIUXModuleAudit(BaseModel):
    """Base shape shared by every UI/UX category module (audit card)."""

    score: int = 0
    status: Optional[str] = None        # Excellent | Good | Average | Poor | Critical
    color: Optional[str] = None         # hex from the status palette
    issueCount: int = 0
    recommendationCount: int = 0


class VisualDesignAudit(UIUXModuleAudit):
    hasHeroSection: bool = False
    heroQuality: Optional[str] = None   # Strong | Moderate | Weak
    hasVisualHierarchy: bool = True
    goodWhitespace: bool = True
    consistentDesign: bool = True
    modernStyling: bool = True
    stockPhotoHeavy: bool = False
    outdatedElements: List[str] = Field(default_factory=list)
    gallerySections: int = 0


class ColorsAudit(UIUXModuleAudit):
    hasColorPalette: bool = False
    brandColors: int = 0
    accentColor: Optional[str] = None
    primaryColorHex: Optional[str] = None
    colorConsistency: bool = True
    distinctColors: int = 0
    dominantColors: List[str] = Field(default_factory=list)
    contrastIssues: int = 0


class TypographyAudit(UIUXModuleAudit):
    fontCount: int = 0
    googleFonts: int = 0
    customFonts: int = 0
    readableFontSize: bool = True
    consistentHeadings: bool = True
    fontFamilies: List[str] = Field(default_factory=list)
    fontSizes: List[str] = Field(default_factory=list)
    textContrastIssues: int = 0


class LayoutAudit(UIUXModuleAudit):
    hasContainerLayout: bool = True
    usesCssGrid: bool = False
    usesFlexbox: bool = False
    centeredContent: bool = True
    hasSidebar: bool = False
    balancedColumns: bool = True
    contentWidthOk: bool = True
    fixedWidthElements: int = 0


class NavigationAudit(UIUXModuleAudit):
    hasNavMenu: bool = False
    menuLinks: int = 0
    hasHeaderNav: bool = False
    hasFooterNav: bool = False
    hasBreadcrumbs: bool = False
    hasSearch: bool = False
    mobileMenu: bool = False
    navItems: List[str] = Field(default_factory=list)
    brokenMenuLinks: int = 0


class CtaAudit(UIUXModuleAudit):
    totalCtas: int = 0
    strongCtaText: int = 0
    hasPrimaryCta: bool = False
    hasHeroCta: bool = False
    hasContactCta: bool = False
    ctaTexts: List[str] = Field(default_factory=list)
    buttonStylePresent: bool = False
    ctasWithoutAction: int = 0


class ResponsiveAudit(UIUXModuleAudit):
    hasViewport: bool = False
    mediaQueries: int = 0
    responsiveLayout: bool = True
    fluidWidths: bool = True
    breakpoints: List[str] = Field(default_factory=list)
    horizontalScrollRisk: int = 0


class MobileAudit(UIUXModuleAudit):
    hasViewport: bool = False
    touchFriendly: bool = True
    hasMobileMenu: bool = False
    tapTargetSizeOk: bool = True
    hasAppleTouchIcon: bool = False
    hasThemeColor: bool = False
    mobileOptimized: bool = True


class FormsAudit(UIUXModuleAudit):
    totalForms: int = 0
    totalInputs: int = 0
    labeledInputs: int = 0
    unlabeledInputs: int = 0
    placeholderOnly: int = 0
    requiredFields: int = 0
    hasSubmitButton: bool = False
    formActions: int = 0


class UxAudit(UIUXModuleAudit):
    navigationClarity: bool = True
    ctaVisibility: bool = True
    userJourney: bool = True
    readabilityScore: int = 0
    hasBreadcrumbs: bool = False
    hasContactAccess: bool = True
    hasSearchFeature: bool = False
    frictionSignals: int = 0


class ContentAudit(UIUXModuleAudit):
    totalWords: int = 0
    averageWordsPerPage: int = 0
    thinPages: int = 0
    hasBlogOrNews: bool = False
    structuredContent: bool = True
    listsUsed: int = 0
    hasPagination: bool = False
    lastUpdatedSignal: bool = False


class ImagesAudit(UIUXModuleAudit):
    total: int = 0
    withAlt: int = 0
    missingAlt: int = 0
    lazyLoaded: int = 0
    missingLazyLoading: int = 0
    missingDimensions: int = 0
    decorativeImages: int = 0


class IconsAudit(UIUXModuleAudit):
    totalIcons: int = 0
    svgIcons: int = 0
    iconFonts: int = 0
    socialIcons: int = 0
    featureIcons: int = 0
    emojiIcons: int = 0


class BrandingAudit(UIUXModuleAudit):
    hasLogo: bool = False
    logoText: bool = True
    brandInTitle: bool = False
    hasFavicon: bool = False
    hasTagline: bool = False
    consistentBranding: bool = True
    socialLinks: int = 0


class AccessibilityAudit(UIUXModuleAudit):
    hasLang: bool = False
    altCoverage: int = 0
    formLabels: int = 0
    ariaAttributes: int = 0
    semanticStructure: bool = True
    skipLink: bool = False
    headingOrderIssues: int = 0
    contrastIssues: int = 0


class ModernDesignAudit(UIUXModuleAudit):
    modernFramework: bool = False
    usesCssVariables: bool = False
    hasAnimations: bool = False
    hasGradients: bool = False
    hasRoundedCorners: bool = False
    hasDarkMode: bool = False
    smoothScrolling: bool = False
    modernFonts: bool = False


class TrustAudit(UIUXModuleAudit):
    hasTestimonials: bool = False
    hasReviews: bool = False
    hasTrustBadges: bool = False
    hasCertifications: bool = False
    hasGuarantee: bool = False
    hasContactInfo: bool = False
    hasPrivacyPolicy: bool = False
    hasAboutPage: bool = False
    secureSite: bool = False


class UIUXVisualIssue(BaseModel):
    category: str = "Visual Design"
    severity: str = "Info"              # Error | Warning | Info
    status: Optional[str] = None        # Excellent | Good | Average | Poor | Critical
    title: str = ""
    description: str = ""
    affectedUrl: Optional[str] = None


class UIUXRecommendation(BaseModel):
    title: str = ""
    description: str = ""
    priority: str = "Medium"            # High | Medium | Low
    category: str = "UI/UX"


class RedesignOpportunity(BaseModel):
    score: int = 0
    opportunityLevel: Optional[str] = None   # High | Medium | Low
    rationale: str = ""
    estimatedImpact: Optional[str] = None
    suggestedChanges: List[str] = Field(default_factory=list)
    payoff: Optional[str] = None


class SalesOpportunity(BaseModel):
    score: int = 0
    opportunityLevel: Optional[str] = None   # High | Medium | Low
    sellingPoints: List[str] = Field(default_factory=list)
    painPoints: List[str] = Field(default_factory=list)
    suggestedServices: List[str] = Field(default_factory=list)
    pitchSummary: str = ""


class UIUXAuditResultCreate(BaseModel):
    class Config:
        populate_by_name = True

    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    overallScore: int = 0
    grade: str = "F"
    overallStatus: Optional[str] = None
    overallColor: Optional[str] = None
    visualDesign: VisualDesignAudit = Field(default_factory=VisualDesignAudit)
    colors: ColorsAudit = Field(default_factory=ColorsAudit)
    typography: TypographyAudit = Field(default_factory=TypographyAudit)
    layout: LayoutAudit = Field(default_factory=LayoutAudit)
    navigation: NavigationAudit = Field(default_factory=NavigationAudit)
    cta: CtaAudit = Field(default_factory=CtaAudit)
    responsive: ResponsiveAudit = Field(default_factory=ResponsiveAudit)
    mobile: MobileAudit = Field(default_factory=MobileAudit)
    forms: FormsAudit = Field(default_factory=FormsAudit)
    ux: UxAudit = Field(default_factory=UxAudit)
    content: ContentAudit = Field(default_factory=ContentAudit)
    images: ImagesAudit = Field(default_factory=ImagesAudit)
    icons: IconsAudit = Field(default_factory=IconsAudit)
    branding: BrandingAudit = Field(default_factory=BrandingAudit)
    accessibility: AccessibilityAudit = Field(default_factory=AccessibilityAudit)
    modernDesign: ModernDesignAudit = Field(default_factory=ModernDesignAudit)
    trust: TrustAudit = Field(default_factory=TrustAudit)
    issues: List[UIUXVisualIssue] = Field(default_factory=list)
    recommendations: List[UIUXRecommendation] = Field(default_factory=list)
    redesignOpportunity: RedesignOpportunity = Field(default_factory=RedesignOpportunity)
    salesOpportunity: SalesOpportunity = Field(default_factory=SalesOpportunity)
    auditTime: float = 0.0              # milliseconds spent auditing
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UIUXAuditResultInDB(UIUXAuditResultCreate):
    id: str = Field(alias="_id")


class UIUXAuditResultResponse(UIUXAuditResultInDB):
    class Config:
        populate_by_name = True
