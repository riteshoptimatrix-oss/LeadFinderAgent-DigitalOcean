"""
Reports API Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status, Response, BackgroundTasks
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging
import os

from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import UserInDB
from app.models.report import (
    ReportFormat, ReportResponse, 
    PaginatedReportResponse, ReportGenerationRequest,
    BulkReportGenerationRequest
)
from app.services.reports.report_generator import ReportGeneratorService

router = APIRouter()
logger = logging.getLogger(__name__)

async def get_report_service(db: AsyncIOMotorDatabase = Depends(get_db)) -> ReportGeneratorService:
    return ReportGeneratorService(db)

@router.post("/generate", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def generate_report(
    request: ReportGenerationRequest,
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(get_current_user),
    report_service: ReportGeneratorService = Depends(get_report_service)
):
    """Generate a report for a lead"""
    try:
        # Generate first report type immediately
        if not request.report_types:
            raise HTTPException(status_code=400, detail="No report types specified")
        
        report = await report_service.generate_report(
            lead_id=request.lead_id,
            user_id=str(current_user.id),
            report_type=request.report_types[0],
            report_format=request.report_format,
            metadata=request.metadata
        )
        
        # Generate additional reports in background
        if len(request.report_types) > 1:
            for report_type in request.report_types[1:]:
                background_tasks.add_task(
                    report_service.generate_report,
                    lead_id=request.lead_id,
                    user_id=str(current_user.id),
                    report_type=report_type,
                    report_format=request.report_format,
                    metadata=request.metadata
                )
        
        return report
    except Exception as e:
        logger.error(f"Error generating report: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@router.get("/lead/{lead_id}", response_model=PaginatedReportResponse)
async def get_lead_reports(
    lead_id: str,
    skip: int = 0,
    limit: int = 50,
    current_user: UserInDB = Depends(get_current_user),
    report_service: ReportGeneratorService = Depends(get_report_service)
):
    """Get all reports for a specific lead"""
    try:
        reports, total = await report_service.get_lead_reports(lead_id, skip, limit)
        return PaginatedReportResponse(data=reports, total=total)
    except Exception as e:
        logger.error(f"Error fetching reports: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: str,
    current_user: UserInDB = Depends(get_current_user),
    report_service: ReportGeneratorService = Depends(get_report_service)
):
    """Get a specific report"""
    report = await report_service.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report

@router.get("/{report_id}/download")
async def download_report(
    report_id: str,
    current_user: UserInDB = Depends(get_current_user),
    report_service: ReportGeneratorService = Depends(get_report_service)
):
    """Download a report file"""
    report = await report_service.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    if not report.file_path or not os.path.exists(report.file_path):
        raise HTTPException(status_code=404, detail="Report file not found")
    
    # Increment download count
    await report_service.increment_download_count(report_id)
    
    # Determine media type
    media_type_map = {
        ReportFormat.PDF: "application/pdf",
        ReportFormat.HTML: "text/html",
        ReportFormat.EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ReportFormat.JSON: "application/json",
        ReportFormat.CSV: "text/csv"
    }
    media_type = media_type_map.get(report.report_format, "application/octet-stream")
    
    filename = os.path.basename(report.file_path)
    
    return FileResponse(
        path=report.file_path,
        media_type=media_type,
        filename=filename,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.post("/{report_id}/regenerate", response_model=ReportResponse)
async def regenerate_report(
    report_id: str,
    current_user: UserInDB = Depends(get_current_user),
    report_service: ReportGeneratorService = Depends(get_report_service)
):
    """Regenerate an existing report"""
    try:
        report = await report_service.regenerate_report(report_id)
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error regenerating report: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: str,
    current_user: UserInDB = Depends(get_current_user),
    report_service: ReportGeneratorService = Depends(get_report_service)
):
    """Delete a report"""
    deleted = await report_service.delete_report(report_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Report not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.post("/bulk-generate")
async def bulk_generate_reports(
    request: BulkReportGenerationRequest,
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(get_current_user),
    report_service: ReportGeneratorService = Depends(get_report_service)
):
    """Generate reports for multiple leads in background"""
    for lead_id in request.lead_ids:
        for report_type in request.report_types:
            background_tasks.add_task(
                report_service.generate_report,
                lead_id=lead_id,
                user_id=str(current_user.id),
                report_type=report_type,
                report_format=request.report_format,
                metadata=request.metadata
            )
    
    return {
        "message": f"Generating {len(request.report_types)} reports for {len(request.lead_ids)} leads",
        "total_reports": len(request.lead_ids) * len(request.report_types)
    }
