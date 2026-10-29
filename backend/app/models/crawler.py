from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime
from app.models.pyobjectid import PyObjectId
from bson import ObjectId

class PerformanceMetrics(BaseModel):
    user_id: Optional[str] = None
    dns_lookup: float = 0.0
    tcp_connection: float = 0.0
    tls_handshake: float = 0.0
    ttfb: float = 0.0
    dom_ready: float = 0.0
    load_event: float = 0.0
    network_idle: float = 0.0
    full_load_time: float = 0.0

class CrawlPage(BaseModel):
    user_id: Optional[str] = None
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    job_id: str = Field(...)
    queue_id: str = Field(...)
    lead_id: str = Field(...)
    domain: str = Field(...)
    url: str = Field(...)
    final_url: Optional[str] = None
    redirect_chain: List[str] = Field(default_factory=list)
    
    title: Optional[str] = None
    meta_description: Optional[str] = None
    canonical_url: Optional[str] = None
    language: Optional[str] = None

    response_headers: Dict[str, Any] = Field(default_factory=dict)
    meta_tags: Dict[str, Any] = Field(default_factory=dict)
    
    h1: List[str] = Field(default_factory=list)
    h2: List[str] = Field(default_factory=list)
    h3: List[str] = Field(default_factory=list)
    
    html: Optional[str] = None
    rendered_html: Optional[str] = None
    visible_text: Optional[str] = None
    
    internal_links: List[str] = Field(default_factory=list)
    external_links: List[str] = Field(default_factory=list)
    
    images: List[str] = Field(default_factory=list)
    scripts: List[str] = Field(default_factory=list)
    css: List[str] = Field(default_factory=list)
    
    schema_markup: List[Dict[str, Any]] = Field(default_factory=list)
    forms: List[Dict[str, Any]] = Field(default_factory=list)
    buttons: List[str] = Field(default_factory=list)
    nav_links: List[str] = Field(default_factory=list)
    footer_links: List[str] = Field(default_factory=list)
    embedded_maps: List[str] = Field(default_factory=list)
    
    status_code: int = 200
    timing_metrics: PerformanceMetrics = Field(default_factory=PerformanceMetrics)
    
    page_size_bytes: int = 0
    content_length: int = 0
    
    crawled_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class CrawlSession(BaseModel):
    user_id: Optional[str] = None
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    job_id: str = Field(...)
    queue_id: str = Field(...)
    lead_id: str = Field(...)
    website_url: str = Field(...)
    
    status: str = Field(default="STARTING") # STARTING, RUNNING, COMPLETED, FAILED
    
    total_pages_crawled: int = 0
    pages_discovered: int = 0
    
    robots_rules: Dict[str, Any] = Field(default_factory=dict)
    sitemap_urls: List[str] = Field(default_factory=list)
    
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
