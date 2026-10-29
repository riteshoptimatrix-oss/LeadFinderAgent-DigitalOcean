from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class ScreenshotRecord(BaseModel):
    user_id: Optional[str] = None
    url: str
    device: str # 'Desktop', 'Tablet', 'Mobile'
    file_path: str
    width: int
    height: int
    file_size_bytes: int

class VisualIssue(BaseModel):
    user_id: Optional[str] = None
    issue_type: str
    element_selector: Optional[str] = None
    description: str
    severity: str # 'Critical', 'High', 'Medium', 'Low'
    affected_device: str # 'Desktop', 'Tablet', 'Mobile', 'All'

class UIUXScorecard(BaseModel):
    user_id: Optional[str] = None
    overall_ui_score: int = Field(ge=0, le=100, default=0)
    overall_ux_score: int = Field(ge=0, le=100, default=0)
    visual_quality_score: int = Field(ge=0, le=100, default=0)
    design_consistency_score: int = Field(ge=0, le=100, default=0)
    responsiveness_score: int = Field(ge=0, le=100, default=0)
    conversion_optimization_score: int = Field(ge=0, le=100, default=0)
    accessibility_visual_score: int = Field(ge=0, le=100, default=0)
    navigation_score: int = Field(ge=0, le=100, default=0)
    typography_score: int = Field(ge=0, le=100, default=0)
    color_system_score: int = Field(ge=0, le=100, default=0)
    layout_score: int = Field(ge=0, le=100, default=0)
    component_quality_score: int = Field(ge=0, le=100, default=0)

class UiUxAnalysisResultBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    website_url: str
    scorecard: UIUXScorecard = Field(default_factory=UIUXScorecard)
    issues: List[VisualIssue] = Field(default_factory=list)
    screenshots: List[ScreenshotRecord] = Field(default_factory=list)

class UiUxAnalysisResultCreate(UiUxAnalysisResultBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UiUxAnalysisResultInDB(UiUxAnalysisResultCreate):
    id: str = Field(alias="_id")

class UiUxAnalysisResultResponse(UiUxAnalysisResultInDB):
    class Config:
        populate_by_name = True
