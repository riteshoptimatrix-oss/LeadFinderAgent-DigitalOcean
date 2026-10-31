from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from pydantic import BaseModel, Field, ConfigDict, model_validator, field_validator, ValidationError


def _as_str(value: Any) -> Optional[str]:
    if value is None or value == "":
        return None
    return str(value)

import re
from app.services.contact_deduplication import (
    deduplicate_emails,
    deduplicate_phones,
    normalize_email as _canonical_email,
    normalize_phone as _canonical_phone,
)

_PLACEHOLDER_VALUES = ("null", "undefined", "n/a", "-", "unknown", "none")


def normalize_phone(phone: Any, default_country: Any = None) -> Optional[str]:
    if not phone:
        return None
    s = str(phone).strip()
    if s.lower() in _PLACEHOLDER_VALUES:
        return None
    return _canonical_phone(s, default_country=default_country)

def normalize_email(email: Any) -> Optional[str]:
    if not email:
        return None
    s = str(email).strip().lower()
    if s in _PLACEHOLDER_VALUES or not s:
        return None
    return _canonical_email(s)

def deduplicate_contacts(contacts: List[Any], normalizer: Any) -> List[str]:
    seen = set()
    unique = []
    for c in contacts:
        if not c:
            continue
        norm = normalizer(c)
        if norm and norm not in seen:
            seen.add(norm)
            unique.append(norm)
    return unique


def _extract_all_contacts(data: Any, target: str, default_country: Any = None) -> List[str]:
    """Universally search and extract phones or emails from relevant keys only."""
    results = []
    
    def _is_relevant_key(k: str) -> bool:
        k_lower = k.lower()
        if target == "phone":
            return any(x in k_lower for x in ['phone', 'mobile', 'whatsapp', 'number', 'contact', 'telephone'])
        else:
            return 'email' in k_lower

    def _process_value(v):
        if not v:
            return
        if isinstance(v, str):
            if target == "phone":
                for part in v.replace(',', ' ').split():
                    clean = re.sub(r'[^\d+]', '', part)
                    if clean.count('+') > 1:
                        clean = '+' + clean.replace('+', '')
                    if len(clean) >= 7 and len(clean) <= 15: # basic phone length check to filter out huge IDs
                        results.append(clean)
            elif target == "email":
                for part in v.replace(',', ' ').split():
                    if '@' in part and '.' in part:
                        results.append(part.strip().lower())
        elif isinstance(v, list):
            for item in v:
                _process_value(item)
        elif isinstance(v, dict):
            # If we're already inside a relevant block, process all its sub-values
            for k, val in v.items():
                if isinstance(k, str) and _is_relevant_key(k):
                    _process_value(val)
                elif isinstance(val, (dict, list)):
                    # Keep digging for relevant keys
                    _search_for_keys(val)

    def _search_for_keys(v):
        if isinstance(v, dict):
            for k, val in v.items():
                if isinstance(k, str) and _is_relevant_key(k):
                    _process_value(val)
                elif isinstance(val, (dict, list)):
                    _search_for_keys(val)
        elif isinstance(v, list):
            for item in v:
                _search_for_keys(item)

    _search_for_keys(data)
    
    # Clean and deduplicate while maintaining order (canonical normalization)
    seen = set()
    unique = []
    for r in results:
        if target == "phone":
            norm = normalize_phone(r, default_country=default_country)
        else:
            norm = normalize_email(r)
        clean_val = norm
        if clean_val and clean_val not in seen:
            seen.add(clean_val)
            unique.append(clean_val)
            
    return unique


def _phone_digits(value: Any) -> Optional[str]:
    """Return the digits of a plausible phone number, or None if invalid.

    Unlike the strict E.164 normalizer this deliberately ACCEPTS leading-zero
    domestic numbers (e.g. "093747 61306"), so valid phones are never dropped
    between scraping and display.
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s or s.lower() in _PLACEHOLDER_VALUES:
        return None
    digits = re.sub(r"[^\d]", "", s)
    if not digits:
        return None
    # ``00`` is the international prefix, equivalent to ``+``.
    if digits.startswith("00") and len(digits) > 2:
        digits = digits[2:]
    if 7 <= len(digits) <= 15:
        return digits
    return None


def _is_valid_phone(value: Any) -> bool:
    return _phone_digits(value) is not None


_PHONE_FIELD_ALIASES = {
    "phone", "phones", "primaryphone", "allphones", "phonenumber",
    "phonenumbers", "telephone", "telephonenumber", "tel", "mobile",
    "mobilenumber", "mobilenumbers", "cellphone", "cellnumber",
    "contactnumber", "contactnumbers", "contactphone", "secondaryphones",
    "whatsappnumber", "whatsappnumbers", "phonelist", "number",
}


def _is_phone_field_key(key: Any) -> bool:
    """True when a dict key represents a phone-number field (any legacy alias)."""
    if not isinstance(key, str):
        return False
    k = re.sub(r"[^a-z0-9]", "", key.lower())
    if not k:
        return False
    if k in _PHONE_FIELD_ALIASES:
        return True
    if "phone" in k or "mobile" in k or "telephone" in k or "whatsapp" in k:
        return True
    return False


def _collect_phone_values(value: Any, results: List[str]) -> None:
    """Depth-first collect phone-number candidates from a document subtree.

    Handles every legacy shape: scalar strings, arrays (phones, mobile_numbers,
    contact_numbers, ...), nested objects (contact.phone, ai_analysis.phones,
    contact_discovery.secondary_phones, ...) and multi-number strings.
    """
    if value is None:
        return
    if isinstance(value, dict):
        for k, v in value.items():
            if isinstance(k, str) and _is_phone_field_key(k):
                _collect_phone_values(v, results)
            elif isinstance(v, (dict, list, tuple)):
                _collect_phone_values(v, results)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _collect_phone_values(item, results)
    else:
        s = str(value).strip()
        if not s or s.lower() in _PLACEHOLDER_VALUES:
            return
        # Split explicit multi-number separators; a plain space is kept as-is
        # so "093747 61306" survives as a single display value.
        if any(sep in s for sep in (",", ";", "|", "\n", "\r")):
            for part in re.split(r"[,;\r\n|]+", s):
                part = part.strip()
                if part and _phone_digits(part):
                    results.append(part)
            return
        if _phone_digits(s):
            results.append(s)


def _unique_phones(raw_values: List[str]) -> List[str]:
    """Deduplicate phone candidates preserving order (ignores only empty/invalid)."""
    seen: set = set()
    unique: List[str] = []
    for v in raw_values:
        key = _phone_digits(v)
        if not key:
            continue
        if key not in seen:
            seen.add(key)
            unique.append(str(v).strip())
    return unique


def _collect_all_phones(data: Any) -> List[str]:
    """Collect every phone number stored anywhere in a lead document."""
    candidates: List[str] = []
    _collect_phone_values(data, candidates)
    return _unique_phones(candidates)


def _normalize_recommendation_element(data: Any) -> Dict[str, Any]:
    """Coerce any legacy recommendation shape (str, dict with many key layouts,
    or arbitrary object) into the canonical AIRecommendation dict."""
    if data is None:
        return {}
    if isinstance(data, str):
        return {"recommendation": data}
    if isinstance(data, dict):
        mapped: Dict[str, Any] = {}
        recommendation = (
            data.get("recommendation")
            or data.get("description")
            or data.get("action")
            or data.get("issue")
            or data.get("summary")
            or data.get("text")
            or data.get("suggestion")
        )
        if recommendation is not None:
            mapped["recommendation"] = str(recommendation)

        title = data.get("title") or data.get("name") or data.get("headline") or data.get("service_name")
        if title is not None:
            mapped["title"] = str(title)

        for key in ("category", "priority", "impact", "estimated_benefit", "status", "reference_url"):
            if data.get(key) is not None:
                mapped[key] = data[key]

        difficulty = data.get("difficulty") or data.get("effort")
        if difficulty is not None:
            mapped["difficulty"] = str(difficulty)

        return mapped
    return {"recommendation": str(data)}


def _extract_recommendation_text(data: Any) -> str:
    """Extract a flat recommendation string from any shape (string, dict, AIRecommendation)."""
    if data is None:
        return ""
    if isinstance(data, str):
        return data
    if isinstance(data, dict):
        return str(
            data.get("recommendation")
            or data.get("description")
            or data.get("action")
            or data.get("issue")
            or data.get("summary")
            or data.get("text")
            or data.get("suggestion")
            or data.get("title")
            or data.get("name")
            or ""
        )
    if isinstance(data, BaseModel):
        return _extract_recommendation_text(data.model_dump())
    return str(data)


def _flatten_recommendations(recs: Any) -> List[str]:
    """Coerce any recommendations value into a list of flat strings."""
    if recs is None:
        return []
    if isinstance(recs, str):
        return [recs]
    if not isinstance(recs, list):
        return [str(recs)]
    result: List[str] = []
    for item in recs:
        text = _extract_recommendation_text(item)
        if text:
            result.append(text)
    return result


class AIRecommendation(BaseModel):
    user_id: Optional[str] = None
    """Canonical, structured AI recommendation.

    Every recommendation across MongoDB, the AI analysis pipeline, the API
    response models and the frontend MUST use this single shape. It is fully
    tolerant of legacy data: strings and dicts with heterogeneous keys are
    coerced into the canonical structure so validation never fails.
    """

    category: Optional[str] = None
    priority: Optional[str] = None
    title: Optional[str] = None
    recommendation: Optional[str] = None
    impact: Optional[str] = None
    difficulty: Optional[str] = None
    estimated_benefit: Optional[str] = None
    status: Optional[str] = None
    reference_url: Optional[str] = None

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def _coerce(cls, data: Any) -> Any:
        if data is None:
            return {}
        if isinstance(data, (str, int, float, bool)):
            return {"recommendation": str(data)}
        if isinstance(data, dict):
            return _normalize_recommendation_element(data)
        if hasattr(data, "model_dump"):
            return _normalize_recommendation_element(data.model_dump())
        return {"recommendation": str(data)}


# Backwards-compatible alias so existing imports keep working.
RecommendationItem = AIRecommendation


class AIAnalysisMetadata(BaseModel):
    user_id: Optional[str] = None
    """The canonical `ai_analysis` payload stored on every Lead document.

    Tolerant of legacy documents: unknown fields are ignored, missing fields
    default to None/empty, and `recommendations` is normalized to a list of
    flat strings (legacy objects are coerced at load time).
    """

    model_config = ConfigDict(extra="ignore")

    analysis_status: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[float] = None
    stage: Optional[str] = None
    queue_id: Optional[str] = None
    error_message: Optional[str] = None
    analysis_started_at: Optional[datetime] = None
    analysis_completed_at: Optional[datetime] = None
    analysis_version: Optional[str] = None
    analysis_duration: Optional[float] = None
    last_analysis_date: Optional[datetime] = None
    analysis_count: int = Field(default=0)

    # Enrichment fields to prevent Pydantic serialization filtering
    overall_score: Optional[int] = None
    overall_ai_score: Optional[int] = None
    website_score: Optional[int] = None
    seo_score: Optional[int] = None
    performance_score: Optional[int] = None
    ui_score: Optional[int] = None
    ux_score: Optional[int] = None
    accessibility_score: Optional[int] = None
    security_score: Optional[int] = None
    business_opportunity: Optional[int] = None
    mobile_score: Optional[int] = None
    social_media_score: Optional[int] = None
    content_score: Optional[int] = None
    lead_intelligence_score: Optional[int] = None
    sales_opportunity_score: Optional[int] = None
    cms: Optional[str] = None
    frontend: Optional[str] = None
    backend: Optional[str] = None
    hosting: Optional[str] = None
    cdn: Optional[str] = None
    analytics: Optional[str] = None
    pages: Optional[int] = None
    internal_links: Optional[int] = None
    broken_links: Optional[int] = None
    robots: Optional[bool] = None
    sitemap: Optional[bool] = None
    response_time: Optional[float] = None
    ssl: Optional[bool] = None
    emails: List[str] = Field(default_factory=list)
    phones: List[str] = Field(default_factory=list)
    addresses: List[str] = Field(default_factory=list)
    social_links: Dict[str, str] = Field(default_factory=dict)
    contacts: List[Dict[str, Any]] = Field(default_factory=list)
    top_seo_issues: List[str] = Field(default_factory=list)
    top_ui_issues: List[str] = Field(default_factory=list)
    top_ux_issues: List[str] = Field(default_factory=list)
    performance_suggestions: List[str] = Field(default_factory=list)
    security_suggestions: List[str] = Field(default_factory=list)
    accessibility_suggestions: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    google_maps: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def _normalize_recommendations(cls, data: Any) -> Any:
        if isinstance(data, dict):
            recs = data.get("recommendations", "__MISSING__")
            if recs is None:
                data["recommendations"] = []
            elif recs != "__MISSING__":
                if not isinstance(recs, list):
                    recs = [recs]
                data["recommendations"] = _flatten_recommendations(recs)
        return data


class WebsiteInformation(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    website_url: Optional[str] = None
    final_url: Optional[str] = None
    domain: Optional[str] = None
    https: Optional[bool] = None
    ssl: Optional[bool] = None
    http_status: Optional[int] = None
    server: Optional[str] = None
    response_time: Optional[float] = None
    robots_txt: Optional[bool] = None
    sitemap: Optional[bool] = None
    favicon: Optional[bool] = None
    language: Optional[str] = None
    country: Optional[str] = None


class WebsiteStructure(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    total_pages: Optional[int] = None
    internal_pages: Optional[int] = None
    external_links: Optional[int] = None
    navigation_depth: Optional[int] = None
    broken_links: Optional[int] = None
    redirects: Optional[int] = None
    canonical_urls: Optional[int] = None
    crawl_graph: Optional[Dict[str, Any]] = None


class ContactDiscovery(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    primary_email: Optional[str] = None
    secondary_emails: List[str] = Field(default_factory=list)
    support_email: Optional[str] = None
    sales_email: Optional[str] = None
    hr_email: Optional[str] = None
    marketing_email: Optional[str] = None
    all_emails: List[str] = Field(default_factory=list)
    primary_phone: Optional[str] = None
    secondary_phones: List[str] = Field(default_factory=list)
    whatsapp_numbers: List[str] = Field(default_factory=list)
    contact_pages: List[str] = Field(default_factory=list)
    contact_forms: List[str] = Field(default_factory=list)
    google_maps: Optional[str] = None
    office_address: Optional[str] = None


class SocialMedia(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    facebook: Optional[str] = None
    instagram: Optional[str] = None
    linkedin: Optional[str] = None
    youtube: Optional[str] = None
    twitter: Optional[str] = None
    threads: Optional[str] = None
    telegram: Optional[str] = None
    github: Optional[str] = None


class TechnologyDetection(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    frontend_framework: Optional[str] = None
    backend_framework: Optional[str] = None
    cms: Optional[str] = None
    hosting: Optional[str] = None
    cdn: Optional[str] = None
    analytics: Optional[str] = None
    payment_gateway: Optional[str] = None
    server_stack: Optional[str] = None
    javascript_framework: Optional[str] = None
    css_framework: Optional[str] = None


class SEOAnalysis(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    seo_score: Optional[int] = None
    titles: Optional[bool] = None
    meta_description: Optional[bool] = None
    headings: Optional[bool] = None
    schema_markup: Optional[bool] = None  # Renamed from 'schema' to avoid shadowing BaseModel attribute
    open_graph: Optional[bool] = None
    twitter_cards: Optional[bool] = None
    robots: Optional[bool] = None
    sitemap: Optional[bool] = None
    images_without_alt: Optional[int] = None
    duplicate_titles: Optional[int] = None
    duplicate_meta: Optional[int] = None
    broken_internal_link: Optional[int] = None


class PerformanceAnalysis(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    performance_score: Optional[int] = None
    pagespeed: Optional[int] = None
    fcp: Optional[float] = None
    lcp: Optional[float] = None
    cls: Optional[float] = None
    ttfb: Optional[float] = None
    tbt: Optional[float] = None
    speed_index: Optional[float] = None


class DesignAnalysis(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    ui_score: Optional[int] = None
    ux_score: Optional[int] = None
    branding_score: Optional[int] = None
    mobile_score: Optional[int] = None
    desktop_score: Optional[int] = None
    accessibility_score: Optional[int] = None
    security_score: Optional[int] = None


class BusinessIntelligence(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    overall_score: Optional[int] = None
    business_opportunity: Optional[str] = None
    lead_priority: Optional[str] = None
    recommended_services: List[str] = Field(default_factory=list)
    estimated_project_value: Optional[float] = None
    conversion_probability: Optional[float] = None


class SocialMediaAnalysis(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    overall_social_score: Optional[int] = None
    presence_score: Optional[int] = None
    profiles: Dict[str, str] = Field(default_factory=dict)
    platforms_detected: int = Field(default=0)
    missing_platforms: List[str] = Field(default_factory=list)
    issues: List[str] = Field(default_factory=list)


class MobileAnalysis(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    overall_mobile_score: Optional[int] = None
    viewport_score: Optional[int] = None
    responsive_score: Optional[int] = None
    has_viewport: Optional[bool] = None
    media_queries: Optional[int] = None
    issues: List[str] = Field(default_factory=list)


class ContentAnalysis(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    overall_content_score: Optional[int] = None
    depth_score: Optional[int] = None
    structure_score: Optional[int] = None
    freshness_score: Optional[int] = None
    avg_word_count: Optional[float] = None
    thin_pages: Optional[int] = None
    has_blog: Optional[bool] = None
    issues: List[str] = Field(default_factory=list)


class LeadIntelligence(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    lead_score: Optional[int] = None
    lead_quality: Optional[str] = None
    lead_category: Optional[str] = None
    purchasing_power: Optional[str] = None
    decision_maker: Optional[str] = None
    summary: Optional[str] = None
    signals: List[str] = Field(default_factory=list)


class SalesOpportunity(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    opportunity_score: Optional[int] = None
    sales_ready: Optional[str] = None
    product_fit: Optional[str] = None
    budget_estimate: Optional[str] = None
    sales_channel: Optional[str] = None
    next_best_action: Optional[str] = None
    talking_points: List[str] = Field(default_factory=list)


class TikTokPresence(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    found: bool = Field(default=False)
    url: Optional[str] = None
    username: Optional[str] = None
    source_page: Optional[str] = None
    last_checked: Optional[datetime] = None


class LeadBase(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    job_id: Optional[str] = None
    user_id: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    primary_phone: Optional[str] = None
    phones: List[str] = Field(default_factory=list)
    all_phones: List[str] = Field(default_factory=list)
    whatsapp_number: Optional[str] = None
    email: Optional[str] = None
    primary_email: Optional[str] = None
    all_emails: List[str] = Field(default_factory=list)
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    area: Optional[str] = None
    category: Optional[str] = None
    google_rating: Optional[float] = None
    source_url: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_favorite: bool = Field(default=False)
    lead_score: Optional[int] = Field(default=0)
    ai_score: Optional[int] = Field(default=0)
    website_score: Optional[int] = Field(default=0)
    website_status: Optional[str] = Field(default="Unknown")
    website_type: Optional[str] = None
    professional_website: Optional[bool] = None
    social_only: Optional[bool] = None
    analysis_skipped_reason: Optional[str] = None
    review_count: Optional[int] = Field(default=0)
    opening_hours: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    business_status: Optional[str] = None
    place_id: Optional[str] = None

    # CRM Fields
    pipeline_stage: str = Field(default="New Lead")
    priority: str = Field(default="Normal") # High, Normal, Low
    owner_id: Optional[str] = None
    proposal_status: Optional[str] = None
    meeting_status: Optional[str] = None
    reminder_status: Optional[str] = None
    last_contacted_at: Optional[datetime] = None

    # AI Analysis Fields
    ai_analysis: Optional[AIAnalysisMetadata] = Field(default_factory=AIAnalysisMetadata)
    website_information: Optional[WebsiteInformation] = Field(default_factory=WebsiteInformation)
    website_structure: Optional[WebsiteStructure] = Field(default_factory=WebsiteStructure)
    contact_discovery: Optional[ContactDiscovery] = Field(default_factory=ContactDiscovery)
    social_media: Optional[SocialMedia] = Field(default_factory=SocialMedia)
    technology_detection: Optional[TechnologyDetection] = Field(default_factory=TechnologyDetection)
    seo: Optional[SEOAnalysis] = Field(default_factory=SEOAnalysis)
    performance: Optional[PerformanceAnalysis] = Field(default_factory=PerformanceAnalysis)
    design: Optional[DesignAnalysis] = Field(default_factory=DesignAnalysis)
    business: Optional[BusinessIntelligence] = Field(default_factory=BusinessIntelligence)
    social_media_analysis: Optional[SocialMediaAnalysis] = Field(default_factory=SocialMediaAnalysis)
    tiktok: Optional[TikTokPresence] = Field(default_factory=TikTokPresence)
    mobile: Optional[MobileAnalysis] = Field(default_factory=MobileAnalysis)
    content: Optional[ContentAnalysis] = Field(default_factory=ContentAnalysis)
    lead_intelligence: Optional[LeadIntelligence] = Field(default_factory=LeadIntelligence)
    sales_opportunity: Optional[SalesOpportunity] = Field(default_factory=SalesOpportunity)

    historical_analyses: List[Dict[str, Any]] = Field(default_factory=list)

    # Required by persistence redesign
    lead_id: Optional[str] = None
    search_job_id: Optional[str] = None
    search_keyword: Optional[str] = None
    search_area: Optional[str] = None
    search_session_id: Optional[str] = None
    business_name: Optional[str] = None
    google_maps_url: Optional[str] = None
    rating: Optional[float] = None
    reviews: Optional[int] = Field(default=0)
    status: Optional[str] = Field(default="new")
    created_by: Optional[str] = None
    user_id: Optional[str] = None
    failure_reason: Optional[str] = None
    missing_fields: List[str] = Field(default_factory=list)



    @field_validator("website", mode="before")
    @classmethod
    def validate_website(cls, v: Any) -> Optional[str]:
        if not v:
            return None
        try:
            from app.utils.website_validator import is_valid_website
            if is_valid_website(str(v)):
                return str(v).strip()
        except ImportError:
            pass
        return None

class LeadCreate(LeadBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LeadInDB(LeadCreate):
    id: str = Field(alias="_id")

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class LeadResponse(LeadInDB):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class PaginatedLeadResponse(BaseModel):
    user_id: Optional[str] = None
    model_config = ConfigDict(extra="ignore")
    data: List[LeadResponse]
    total: int
    warnings: List[str] = Field(default_factory=list)


def build_lead_response(raw: Any, logger: Any = None) -> Tuple[LeadResponse, List[str]]:
    """Build a LeadResponse from a raw MongoDB document without ever raising.

    If a document is malformed, the offending sections are progressively
    stripped (starting with the deepest nested objects) until a valid response
    can be produced. Any normalization that occurs is reported through the
    returned `warnings` list so the API can surface it instead of crashing.
    """
    warnings: List[str] = []
    if not isinstance(raw, dict):
        warnings.append("Lead document was not a mapping; returning empty placeholder.")
        return LeadResponse(_id="placeholder_id"), warnings

    doc: Dict[str, Any] = dict(raw)

    # Normalize legacy field names so the API and UI use a consistent lead contract.
    if not doc.get("name"):
        doc["name"] = doc.get("business_name") or doc.get("company_name")
    
    doc["business_name"] = doc.get("name") or doc.get("business_name") or doc.get("company_name")
    
    if "search_job_id" not in doc and doc.get("job_id"):
        doc["search_job_id"] = doc["job_id"]
    if "google_rating" not in doc and doc.get("rating") is not None:
        doc["google_rating"] = doc["rating"]
    if "review_count" not in doc and doc.get("reviews") is not None:
        doc["review_count"] = doc["reviews"]
    if "google_maps_url" not in doc and doc.get("source_url"):
        doc["google_maps_url"] = doc["source_url"]
    
    # Universal Extraction for Phones and Emails
    country_hint = doc.get("country") or (doc.get("website_information") or {}).get("country")
    all_phones = _collect_all_phones(doc)
    all_emails = _extract_all_contacts(doc, "email", default_country=country_hint)
    
    doc["all_emails"] = all_emails
    if all_emails:
        doc["primary_email"] = all_emails[0]
        doc["email"] = all_emails[0]  # Backwards compatibility
    
    # Phone display mapping: keep every discovered phone, expose the primary one.
    # Never overwrite an existing valid phone and never replace a populated
    # phones array with an empty one.
    if all_phones:
        doc["all_phones"] = all_phones
        doc["phones"] = all_phones
        if not _is_valid_phone(doc.get("primary_phone")):
            doc["primary_phone"] = all_phones[0]
        if not _is_valid_phone(doc.get("phone")):
            doc["phone"] = all_phones[0]  # Backwards compatibility
    else:
        doc["all_phones"] = doc.get("all_phones") or []
        doc["phones"] = doc.get("phones") or []
        
    # Extract dedicated WhatsApp Number if available, else fallback to primary phone
    raw_wa = []
    def _extract_wa(v):
        if not v: return
        if isinstance(v, str):
            for part in v.replace(',', ' ').split():
                clean = re.sub(r'[^\d+]', '', part)
                if len(clean) >= 7: raw_wa.append(clean)
        elif isinstance(v, list):
            for i in v: _extract_wa(i)
            
    _extract_wa(doc.get("whatsapp"))
    _extract_wa(doc.get("whatsapp_number"))
    if isinstance(doc.get("contact_discovery"), dict):
        _extract_wa(doc.get("contact_discovery").get("whatsapp_numbers"))
    if isinstance(doc.get("ai_analysis"), dict):
        _extract_wa(doc.get("ai_analysis").get("whatsapp"))
        _extract_wa(doc.get("ai_analysis").get("whatsapp_numbers"))
        
    unique_wa = []
    seen_wa = set()
    for w in raw_wa:
        if w not in seen_wa:
            seen_wa.add(w)
            unique_wa.append(w)
            
    if unique_wa:
        doc["whatsapp_number"] = unique_wa[0]
    elif all_phones:
        doc["whatsapp_number"] = all_phones[0]
    else:
        doc["whatsapp_number"] = None
    
    if logger is not None:
        logger.info(
            f"PHONES_RETURNED_BY_API: lead={doc.get('_id')} phones_extracted={len(all_phones)} "
            f"primary_phone={doc.get('primary_phone')} all_phones={all_phones} "
            f"location=({doc.get('state')} -> {doc.get('city')} -> {doc.get('area')})"
        )
    
    if isinstance(doc.get("opening_hours"), list):
        import json
        doc["opening_hours"] = json.dumps(doc["opening_hours"])
        
    coords = doc.get("coordinates")
    if isinstance(coords, dict):
        if "latitude" not in doc and "latitude" in coords:
            doc["latitude"] = coords["latitude"]
        if "longitude" not in doc and "longitude" in coords:
            doc["longitude"] = coords["longitude"]

    # Normalize the Mongo _id into a string so it maps to `id`.
    if "_id" in doc:
        try:
            doc["_id"] = str(doc["_id"])
        except Exception:
            doc["_id"] = None

    # Flatten recommendations to flat strings so AIAnalysisMetadata.List[str]
    # never receives objects that could trigger a ValidationError.
    ai = doc.get("ai_analysis")
    if isinstance(ai, dict):
        if "recommendations" in ai:
            try:
                doc["ai_analysis"]["recommendations"] = _flatten_recommendations(ai.get("recommendations") or [])
            except Exception:
                doc["ai_analysis"].pop("recommendations", None)
        
        # Backwards compatibility: Map scores from ai_analysis to root
        if "ai_score" not in doc or doc["ai_score"] == 0:
            doc["ai_score"] = ai.get("overall_score") or ai.get("overall_ai_score") or 0
        if "lead_score" not in doc or doc["lead_score"] == 0:
            doc["lead_score"] = ai.get("lead_score") or 0
            
    # Deduplicate phones and emails across the lead document.
    # Use permissive phone validation so leading-zero numbers are never nulled.
    if "phone" in doc:
        if _is_valid_phone(doc.get("phone")):
            doc["phone"] = str(doc["phone"]).strip()
        else:
            doc["phone"] = None
    
    if "email" in doc:
        n_email = normalize_email(doc.get("email"))
        doc["email"] = str(doc["email"]).strip() if n_email else None
        
    cd = doc.get("contact_discovery")
    if isinstance(cd, dict):
        for field in ["secondary_phones", "whatsapp_numbers"]:
            if field in cd and isinstance(cd[field], list):
                cd[field] = _unique_phones(cd[field])
        for field in ["all_emails", "secondary_emails", "support_email", "sales_email", "hr_email", "marketing_email"]:
            if field in cd and isinstance(cd[field], list):
                cd[field] = deduplicate_contacts(cd[field], normalize_email)
        
        if cd.get("primary_phone"):
            if _is_valid_phone(cd.get("primary_phone")):
                cd["primary_phone"] = str(cd["primary_phone"]).strip()
            else:
                cd["primary_phone"] = None
        if cd.get("primary_email"):
            n_email = normalize_email(cd.get("primary_email"))
            cd["primary_email"] = str(cd["primary_email"]).strip() if n_email else None

    if isinstance(ai, dict):
        if "phones" in ai and isinstance(ai["phones"], list):
            ai["phones"] = _unique_phones(ai["phones"])
        if "emails" in ai and isinstance(ai["emails"], list):
            ai["emails"] = deduplicate_contacts(ai["emails"], normalize_email)

    try:
        return LeadResponse(**doc), warnings
    except ValidationError as exc:
        first = exc.errors()[0] if exc.errors() else {}
        warnings.append(
            f"Lead {doc.get('_id')} required fallback normalization "
            f"({first.get('loc')} -> {first.get('msg')})."
        )

    # Progressive recovery: drop the deepest nested sections one by one.
    nested_sections = (
        "ai_analysis",
        "website_information",
        "website_structure",
        "contact_discovery",
        "social_media",
        "technology_detection",
        "seo",
        "performance",
        "design",
        "business",
        "social_media_analysis",
        "mobile",
        "content",
        "lead_intelligence",
        "sales_opportunity",
        "historical_analyses",
    )
    for section in nested_sections:
        if section in doc:
            doc.pop(section, None)
            try:
                return LeadResponse(**doc), warnings
            except ValidationError:
                continue

    # Absolute fallback: keep only fields the model knows about, plus aliases.
    allowed_keys = set(LeadResponse.model_fields.keys())
    allowed_keys.add("_id")
    safe = {k: v for k, v in doc.items() if k in allowed_keys}
    try:
        return LeadResponse(**safe), warnings
    except ValidationError:
        if logger is not None:
            logger.error(f"LEAD_RECOVERY_FAILED: Lead {doc.get('_id')} could not be normalized.")
        warnings.append(f"Lead {doc.get('_id')} could only be partially recovered.")
        fallback_id = doc.get("_id") or "fallback_id"
        return LeadResponse(_id=fallback_id), warnings
