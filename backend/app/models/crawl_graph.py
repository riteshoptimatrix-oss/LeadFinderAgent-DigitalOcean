from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class CrawlNode(BaseModel):
    user_id: Optional[str] = None
    url: str
    title: Optional[str] = None
    depth: int = 0
    content_hash: Optional[str] = None
    canonical_url: Optional[str] = None
    status_code: Optional[int] = None
    is_orphan: bool = False
    text_content: Optional[str] = None  # We'll keep this short or remove it when storing large graphs
    meta_description: Optional[str] = None
    seo_data: Optional[Dict[str, Any]] = None
    ux_data: Optional[Dict[str, Any]] = None
    contact_data: Optional[Dict[str, Any]] = None

class CrawlEdge(BaseModel):
    user_id: Optional[str] = None
    source: str
    target: str
    link_text: Optional[str] = None

class WebsiteStructureCreate(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    base_url: str
    total_pages: int = 0
    max_depth: int = 0
    nodes: List[CrawlNode] = Field(default_factory=list)
    edges: List[CrawlEdge] = Field(default_factory=list)
    broken_links: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class WebsiteStructureInDB(WebsiteStructureCreate):
    id: str = Field(alias="_id")

class WebsiteStructureResponse(WebsiteStructureInDB):
    class Config:
        populate_by_name = True
