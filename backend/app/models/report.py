from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum

class ReportType(str, Enum):
    EXECUTIVE_SUMMARY = "Executive Summary"
    COMPLETE_AUDIT = "Complete Website Audit"
    SEO_REPORT = "SEO Report"
    TECHNICAL_SEO = "Technical SEO Report"
    PERFORMANCE = "Performance Report"
    UI_ANALYSIS = "UI Analysis Report"
    UX_ANALYSIS = "UX Analysis Report"
    ACCESSIBILITY = "Accessibility Report"
    SECURITY = "Security Report"
    TECHNOLOGY_STACK = "Technology Stack Report"
    CONTACT_DISCOVERY = "Contact Discovery Report"
    BUSINESS_OPPORTUNITY = "Business Opportunity Report"
    AI_RECOMMENDATIONS = "AI Recommendations Report"
    PROPOSAL = "Proposal Report"
    CLIENT_PRESENTATION = "Client Presentation Report"

class ReportFormat(str, Enum):
    PDF = "PDF"
    HTML = "HTML"
    JSON = "JSON"
    CSV = "CSV"
    EXCEL = "Excel"

class ReportStatus(str, Enum):
    PENDING = "Pending"
    GENERATING = "Generating"
    COMPLETED = "Completed"
    FAILED = "Failed"

class ReportMetadata(BaseModel):
    user_id: Optional[str] = None
    company_logo: Optional[str] = None
    project_name: Optional[str] = None
    generated_by: Optional[str] = None
    report_version: str = "1.0"
    branding_color: str = "#3B82F6"
    include_charts: bool = True
    include_screenshots: bool = True
    include_recommendations: bool = True

class ReportBase(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    user_id: str
    report_type: ReportType
    report_format: ReportFormat
    status: ReportStatus = ReportStatus.PENDING
    file_path: Optional[str] = None
    file_size_bytes: Optional[int] = None
    download_count: int = Field(default=0)
    metadata: ReportMetadata = Field(default_factory=ReportMetadata)
    error_message: Optional[str] = None
    generation_started_at: Optional[datetime] = None
    generation_completed_at: Optional[datetime] = None
    generation_time_seconds: Optional[float] = None

class ReportCreate(ReportBase):
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ReportInDB(ReportCreate):
    id: str = Field(alias="_id")

class ReportResponse(ReportInDB):
    class Config:
        populate_by_name = True

class PaginatedReportResponse(BaseModel):
    user_id: Optional[str] = None
    data: List[ReportResponse]
    total: int

class ReportGenerationRequest(BaseModel):
    user_id: Optional[str] = None
    lead_id: str
    report_types: List[ReportType]
    report_format: ReportFormat = ReportFormat.PDF
    metadata: Optional[ReportMetadata] = None

class BulkReportGenerationRequest(BaseModel):
    user_id: Optional[str] = None
    lead_ids: List[str]
    report_types: List[ReportType]
    report_format: ReportFormat = ReportFormat.PDF
    metadata: Optional[ReportMetadata] = None
