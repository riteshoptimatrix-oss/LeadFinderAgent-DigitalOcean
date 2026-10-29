from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict, field_validator
from enum import Enum
from app.models.pyobjectid import PyObjectId

class AIAnalysisState(str, Enum):
    # === Original states (preserved for backward compat) ===
    WAITING = "WAITING"
    QUEUED = "QUEUED"
    STARTED = "STARTED"
    COLLECTING = "COLLECTING"
    ANALYZING = "ANALYZING"
    SCORING = "SCORING"
    SAVING = "SAVING"
    COMPLETED = "COMPLETED"
    PARTIAL_SUCCESS = "PARTIAL_SUCCESS"
    FAILED = "FAILED"
    EMPTY = "EMPTY"

    # === New canonical states ===
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCESS = "SUCCESS"
    RETRY = "RETRY"
    SKIPPED = "SKIPPED"
    CANCELLED = "CANCELLED"
    TIMEOUT = "TIMEOUT"
    UNKNOWN = "UNKNOWN"

class AIAnalysisJobBase(BaseModel):
    user_id: Optional[str] = None
    queue_id: str
    lead_id: str
    website_url: str
    status: AIAnalysisState = Field(default=AIAnalysisState.WAITING)
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    retry_count: int = Field(default=0, ge=0)
    max_retries: int = Field(default=3, ge=0)
    next_retry_at: Optional[datetime] = None
    dead_letter: bool = Field(default=False)
    retry_history: List[Dict[str, Any]] = Field(default_factory=list)
    # ── Bulk analysis (additive) ────────────────────────────────────────
    # Extra leads sharing the same website. Only this job runs the analysis
    # once; results are later propagated to every linked lead.
    linked_lead_ids: List[str] = Field(default_factory=list)
    is_bulk: bool = Field(default=False)

    @field_validator('status', mode='before')
    @classmethod
    def normalize_status(cls, v):
        if isinstance(v, str):
            return v.upper()
        return v
    
    # Crawl Metrics
    total_pages: int = Field(default=0)
    internal_pages: int = Field(default=0)
    external_links: int = Field(default=0)
    broken_links_count: int = Field(default=0)
    redirects_count: int = Field(default=0)
    navigation_depth: int = Field(default=0)
    crawl_time_seconds: float = Field(default=0.0)
    current_internal_page: Optional[str] = None
    success_count: int = Field(default=0)
    failure_count: int = Field(default=0)
    live_throughput: float = Field(default=0.0)
    
    # Audit Scores
    ui_score: Optional[int] = None
    ux_score: Optional[int] = None
    performance_score: Optional[int] = None
    website_quality_score: Optional[int] = None
    seo_score: Optional[int] = None
    overall_ai_score: Optional[int] = None
    security_score: Optional[int] = None
    accessibility_score: Optional[int] = None
    mobile_score: Optional[int] = None
    business_opportunity_score: Optional[int] = None
    contact_completeness_score: Optional[int] = None

class AIAnalysisJobCreate(AIAnalysisJobBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class AIAnalysisJobInDB(AIAnalysisJobCreate):
    id: PyObjectId = Field(alias="_id")

class AIAnalysisJobResponse(AIAnalysisJobInDB):
    model_config = ConfigDict(populate_by_name=True)

class AIAnalysisQueueBase(BaseModel):
    user_id: Optional[str] = None
    name: str = Field(default="AI Website Analysis Queue")
    user_id: Optional[str] = Field(default="system")
    total_jobs: int
    completed_jobs: int = Field(default=0)
    failed_jobs: int = Field(default=0)
    skipped_jobs: int = Field(default=0)
    running_jobs: int = Field(default=0)
    pending_jobs: int = Field(default=0)
    current_lead_index: int = Field(default=0)
    overall_progress: float = Field(default=0.0)
    status: AIAnalysisState = Field(default=AIAnalysisState.WAITING)
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    # ── Bulk analysis (additive) ────────────────────────────────────────
    is_bulk: bool = Field(default=False)
    concurrency: int = Field(default=1, ge=1)
    # total_leads = unique websites (total_jobs) + duplicate (linked) leads
    total_leads: int = Field(default=0)
    duplicate_leads: int = Field(default=0)
    duplicate_leads_completed: int = Field(default=0)
    # Number of leads that received an analysis result (unique + linked)
    leads_analyzed: int = Field(default=0)
    # Records of leads that were skipped and why (no website / invalid URL)
    skipped_leads: List[Dict[str, Any]] = Field(default_factory=list)

class AIAnalysisQueueCreate(AIAnalysisQueueBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

from typing import List

class AIAnalysisQueueInDB(AIAnalysisQueueCreate):
    id: PyObjectId = Field(alias="_id")

class AIAnalysisQueueResponse(AIAnalysisQueueInDB):
    model_config = ConfigDict(populate_by_name=True)

class AIAnalysisQueueDetailResponse(AIAnalysisQueueResponse):
    jobs: List[AIAnalysisJobResponse] = Field(default_factory=list)
    skipped_jobs: int = Field(default=0)

# Websocket Event Payloads
class WSEventType(str, Enum):
    CONNECTED = "CONNECTED"
    HEARTBEAT = "HEARTBEAT"
    QUEUE_CREATED = "QUEUE_CREATED"
    QUEUE_STARTED = "QUEUE_STARTED"
    QUEUE_PROGRESS = "QUEUE_PROGRESS"
    LEAD_STARTED = "LEAD_STARTED"
    LEAD_PROGRESS = "LEAD_PROGRESS"
    LEAD_STAGE_CHANGED = "LEAD_STAGE_CHANGED"
    STAGE_PROGRESS = "STAGE_PROGRESS"
    PAGE_DISCOVERED = "PAGE_DISCOVERED"
    PAGE_ANALYZED = "PAGE_ANALYZED"
    EMAIL_FOUND = "EMAIL_FOUND"
    PHONE_FOUND = "PHONE_FOUND"
    WHATSAPP_FOUND = "WHATSAPP_FOUND"
    SOCIAL_FOUND = "SOCIAL_FOUND"
    TECHNOLOGY_DETECTED = "TECHNOLOGY_DETECTED"
    CMS_DETECTED = "CMS_DETECTED"
    SEO_STARTED = "SEO_STARTED"
    SEO_UPDATED = "SEO_UPDATED"
    SEO_COMPLETED = "SEO_COMPLETED"
    PERFORMANCE_STARTED = "PERFORMANCE_STARTED"
    PERFORMANCE_UPDATED = "PERFORMANCE_UPDATED"
    PERFORMANCE_COMPLETED = "PERFORMANCE_COMPLETED"
    UI_STARTED = "UI_STARTED"
    UI_UPDATED = "UI_UPDATED"
    UI_COMPLETED = "UI_COMPLETED"
    UX_STARTED = "UX_STARTED"
    UX_UPDATED = "UX_UPDATED"
    UX_COMPLETED = "UX_COMPLETED"
    ACCESSIBILITY_STARTED = "ACCESSIBILITY_STARTED"
    ACCESSIBILITY_COMPLETED = "ACCESSIBILITY_COMPLETED"
    SECURITY_STARTED = "SECURITY_STARTED"
    SECURITY_COMPLETED = "SECURITY_COMPLETED"
    CONTACT_DISCOVERY_STARTED = "CONTACT_DISCOVERY_STARTED"
    CONTACT_DISCOVERY_COMPLETED = "CONTACT_DISCOVERY_COMPLETED"
    SOCIAL_MEDIA_STARTED = "SOCIAL_MEDIA_STARTED"
    SOCIAL_MEDIA_DETECTED = "SOCIAL_MEDIA_DETECTED"
    SOCIAL_MEDIA_COMPLETED = "SOCIAL_MEDIA_COMPLETED"
    MOBILE_STARTED = "MOBILE_STARTED"
    MOBILE_COMPLETED = "MOBILE_COMPLETED"
    CONTENT_STARTED = "CONTENT_STARTED"
    CONTENT_COMPLETED = "CONTENT_COMPLETED"
    LEAD_INTELLIGENCE_STARTED = "LEAD_INTELLIGENCE_STARTED"
    LEAD_INTELLIGENCE_COMPLETED = "LEAD_INTELLIGENCE_COMPLETED"
    SALES_OPPORTUNITY_STARTED = "SALES_OPPORTUNITY_STARTED"
    SALES_OPPORTUNITY_COMPLETED = "SALES_OPPORTUNITY_COMPLETED"
    REPORT_READY = "REPORT_READY"
    SCORE_UPDATED = "SCORE_UPDATED"
    LEAD_COMPLETED = "LEAD_COMPLETED"
    LEAD_FAILED = "LEAD_FAILED"
    QUEUE_COMPLETED = "QUEUE_COMPLETED"
    QUEUE_PAUSED = "QUEUE_PAUSED"
    QUEUE_RESUMED = "QUEUE_RESUMED"
    QUEUE_CANCELLED = "QUEUE_CANCELLED"
    QUEUE_FAILED = "QUEUE_FAILED"
    ERROR = "ERROR"

class AIAnalysisWSEvent(BaseModel):
    user_id: Optional[str] = None
    type: WSEventType
    queue_id: Optional[str] = None
    job_id: Optional[str] = None
    lead_id: Optional[str] = None
    business_name: Optional[str] = None
    website: Optional[str] = None
    queue_position: Optional[str] = None
    stage: Optional[str] = None
    progress: Optional[float] = None
    timestamp: Optional[datetime] = None
    worker: Optional[str] = None
    message: Optional[str] = None
    state: Optional[AIAnalysisState] = None
    metrics: Optional[Dict[str, Any]] = None

