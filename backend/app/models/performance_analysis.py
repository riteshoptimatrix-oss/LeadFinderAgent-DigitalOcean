from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class PerformanceIssue(BaseModel):
    user_id: Optional[str] = None
    issue_type: str
    problem: str
    root_cause: str
    impact: str
    priority: str # 'High', 'Medium', 'Low'
    difficulty: str # 'Easy', 'Moderate', 'Hard'
    estimated_gain: str

class CoreWebVitals(BaseModel):
    user_id: Optional[str] = None
    fcp_ms: float = 0.0
    lcp_ms: float = 0.0
    cls_score: float = 0.0
    inp_ms: float = 0.0
    ttfb_ms: float = 0.0

class LighthouseMetrics(BaseModel):
    user_id: Optional[str] = None
    speed_index_ms: float = 0.0
    tti_ms: float = 0.0
    tbt_ms: float = 0.0
    first_meaningful_paint_ms: float = 0.0

class ServerMetrics(BaseModel):
    user_id: Optional[str] = None
    server_response_time_ms: float = 0.0
    dns_lookup_ms: float = 0.0
    tcp_connection_ms: float = 0.0
    tls_handshake_ms: float = 0.0
    redirect_time_ms: float = 0.0
    http_version: str = "unknown"

class NetworkMetrics(BaseModel):
    user_id: Optional[str] = None
    total_requests: int = 0
    js_requests: int = 0
    css_requests: int = 0
    image_requests: int = 0
    font_requests: int = 0
    third_party_requests: int = 0
    total_byte_weight: int = 0
    js_byte_weight: int = 0
    css_byte_weight: int = 0
    image_byte_weight: int = 0

class PerformanceScorecard(BaseModel):
    user_id: Optional[str] = None
    overall_desktop_score: int = Field(ge=0, le=100, default=0)
    overall_mobile_score: int = Field(ge=0, le=100, default=0)
    server_score: int = Field(ge=0, le=100, default=0)
    frontend_score: int = Field(ge=0, le=100, default=0)
    network_score: int = Field(ge=0, le=100, default=0)
    core_web_vitals_score: int = Field(ge=0, le=100, default=0)
    caching_score: int = Field(ge=0, le=100, default=0)
    image_optimization_score: int = Field(ge=0, le=100, default=0)
    javascript_optimization_score: int = Field(ge=0, le=100, default=0)
    css_optimization_score: int = Field(ge=0, le=100, default=0)

class PerformanceAnalysisResultBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    scorecard: PerformanceScorecard = Field(default_factory=PerformanceScorecard)
    issues: List[PerformanceIssue] = Field(default_factory=list)
    desktop_cwv: CoreWebVitals = Field(default_factory=CoreWebVitals)
    mobile_cwv: CoreWebVitals = Field(default_factory=CoreWebVitals)
    desktop_metrics: LighthouseMetrics = Field(default_factory=LighthouseMetrics)
    mobile_metrics: LighthouseMetrics = Field(default_factory=LighthouseMetrics)
    server_metrics: ServerMetrics = Field(default_factory=ServerMetrics)
    network_metrics: NetworkMetrics = Field(default_factory=NetworkMetrics)
    raw_desktop_psi: Optional[Dict[str, Any]] = None
    raw_mobile_psi: Optional[Dict[str, Any]] = None
    performance_status: Optional[str] = "AVAILABLE"

class PerformanceAnalysisResultCreate(PerformanceAnalysisResultBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PerformanceAnalysisResultInDB(PerformanceAnalysisResultCreate):
    id: str = Field(alias="_id")

class PerformanceAnalysisResultResponse(PerformanceAnalysisResultInDB):
    class Config:
        populate_by_name = True
