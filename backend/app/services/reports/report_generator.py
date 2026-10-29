"""
Report Generator Service - Main orchestrator for report generation
"""
import asyncio
from datetime import datetime
from typing import Dict, Any, Optional, List
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
import logging

from app.models.report import (
    ReportType, ReportFormat, ReportStatus, ReportMetadata,
    ReportCreate, ReportResponse
)
from app.services.reports.data_aggregator import ReportDataAggregator
from app.services.reports.pdf_generator import PDFReportGenerator
from app.services.reports.html_generator import HTMLReportGenerator
from app.services.reports.excel_generator import ExcelReportGenerator
from app.services.reports.json_exporter import JSONExporter
from app.services.reports.csv_exporter import CSVExporter

try:
    from app.services.reports.excel_generator import ExcelReportGenerator
except Exception as exc:
    logger.warning("[REPORTS] Excel generator import failed: %s", exc)
    ExcelReportGenerator = None

logger = logging.getLogger(__name__)

class ReportGeneratorService:
    """Main service for generating all types of reports"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.data_aggregator = ReportDataAggregator(db)
        self.pdf_generator = PDFReportGenerator()
        self.html_generator = HTMLReportGenerator()
        self.excel_generator = ExcelReportGenerator() if ExcelReportGenerator is not None else None
        self.json_exporter = JSONExporter()
        self.csv_exporter = CSVExporter()
    
    async def generate_report(
        self,
        lead_id: str,
        user_id: str,
        report_type: ReportType,
        report_format: ReportFormat,
        metadata: Optional[ReportMetadata] = None
    ) -> ReportResponse:
        """
        Generate a single report for a lead
        """
        if metadata is None:
            metadata = ReportMetadata()
        
        # Create report record
        report_doc = ReportCreate(
            lead_id=lead_id,
            user_id=user_id,
            report_type=report_type,
            report_format=report_format,
            status=ReportStatus.PENDING,
            metadata=metadata
        )
        
        result = await self.db.reports.insert_one(report_doc.model_dump(by_alias=True, exclude={"id"}))
        report_id = str(result.inserted_id)
        
        # Update status to generating
        await self.db.reports.update_one(
            {"_id": ObjectId(report_id)},
            {
                "$set": {
                    "status": ReportStatus.GENERATING,
                    "generation_started_at": datetime.utcnow()
                }
            }
        )
        
        try:
            # Aggregate data
            report_data = await self.data_aggregator.aggregate_report_data(
                lead_id=lead_id,
                report_type=report_type
            )
            
            # Generate report file
            file_path, file_size = await self._generate_report_file(
                report_id=report_id,
                report_data=report_data,
                report_type=report_type,
                report_format=report_format,
                metadata=metadata
            )
            
            generation_time = (datetime.utcnow() - report_doc.generation_started_at).total_seconds() if report_doc.generation_started_at else 0
            
            # Update report record
            await self.db.reports.update_one(
                {"_id": ObjectId(report_id)},
                {
                    "$set": {
                        "status": ReportStatus.COMPLETED,
                        "file_path": file_path,
                        "file_size_bytes": file_size,
                        "generation_completed_at": datetime.utcnow(),
                        "generation_time_seconds": generation_time
                    }
                }
            )
            
            logger.info(f"Report {report_id} generated successfully in {generation_time:.2f}s")
            
        except Exception as e:
            logger.error(f"Error generating report {report_id}: {str(e)}", exc_info=True)
            await self.db.reports.update_one(
                {"_id": ObjectId(report_id)},
                {
                    "$set": {
                        "status": ReportStatus.FAILED,
                        "error_message": str(e),
                        "generation_completed_at": datetime.utcnow()
                    }
                }
            )
            raise
        
        # Fetch and return updated report
        report_doc = await self.db.reports.find_one({"_id": ObjectId(report_id)})
        report_doc["_id"] = str(report_doc["_id"])
        return ReportResponse(**report_doc)
    
    async def _generate_report_file(
        self,
        report_id: str,
        report_data: Dict[str, Any],
        report_type: ReportType,
        report_format: ReportFormat,
        metadata: ReportMetadata
    ) -> tuple[str, int]:
        """Generate report file based on format"""
        
        if report_format == ReportFormat.PDF:
            return await self.pdf_generator.generate(
                report_id=report_id,
                report_data=report_data,
                report_type=report_type,
                metadata=metadata
            )
        elif report_format == ReportFormat.HTML:
            return await self.html_generator.generate(
                report_id=report_id,
                report_data=report_data,
                report_type=report_type,
                metadata=metadata
            )
        elif report_format == ReportFormat.EXCEL:
            if self.excel_generator is None:
                raise RuntimeError("Excel report generation is unavailable because the Excel dependencies are not installed or are broken")
            return await self.excel_generator.generate(
                report_id=report_id,
                report_data=report_data,
                report_type=report_type
            )
        elif report_format == ReportFormat.JSON:
            return await self.json_exporter.export(
                report_id=report_id,
                report_data=report_data
            )
        elif report_format == ReportFormat.CSV:
            return await self.csv_exporter.export(
                report_id=report_id,
                report_data=report_data,
                report_type=report_type
            )
        else:
            raise ValueError(f"Unsupported report format: {report_format}")
    
    async def generate_multiple_reports(
        self,
        lead_id: str,
        user_id: str,
        report_types: List[ReportType],
        report_format: ReportFormat,
        metadata: Optional[ReportMetadata] = None
    ) -> List[ReportResponse]:
        """Generate multiple report types for a single lead"""
        
        tasks = [
            self.generate_report(lead_id, user_id, report_type, report_format, metadata)
            for report_type in report_types
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        reports = []
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Error generating report: {str(result)}")
            else:
                reports.append(result)
        
        return reports
    
    async def get_report(self, report_id: str) -> Optional[ReportResponse]:
        """Get report by ID"""
        report_doc = await self.db.reports.find_one({"_id": ObjectId(report_id)})
        if not report_doc:
            return None
        report_doc["_id"] = str(report_doc["_id"])
        return ReportResponse(**report_doc)
    
    async def get_lead_reports(
        self,
        lead_id: str,
        skip: int = 0,
        limit: int = 50
    ) -> tuple[List[ReportResponse], int]:
        """Get all reports for a lead"""
        cursor = self.db.reports.find({"lead_id": lead_id}).sort("created_at", -1).skip(skip).limit(limit)
        reports = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            reports.append(ReportResponse(**doc))
        
        total = await self.db.reports.count_documents({"lead_id": lead_id})
        return reports, total
    
    async def increment_download_count(self, report_id: str) -> None:
        """Increment download counter"""
        await self.db.reports.update_one(
            {"_id": ObjectId(report_id)},
            {"$inc": {"download_count": 1}}
        )
    
    async def delete_report(self, report_id: str) -> bool:
        """Delete report"""
        import os
        
        # Get report to delete file
        report = await self.get_report(report_id)
        if report and report.file_path and os.path.exists(report.file_path):
            try:
                os.remove(report.file_path)
            except Exception as e:
                logger.warning(f"Failed to delete report file {report.file_path}: {e}")
        
        result = await self.db.reports.delete_one({"_id": ObjectId(report_id)})
        return result.deleted_count > 0
    
    async def regenerate_report(self, report_id: str) -> ReportResponse:
        """Regenerate an existing report"""
        report = await self.get_report(report_id)
        if not report:
            raise ValueError(f"Report {report_id} not found")
        
        # Delete old file
        if report.file_path:
            import os
            if os.path.exists(report.file_path):
                os.remove(report.file_path)
        
        # Reset status
        await self.db.reports.update_one(
            {"_id": ObjectId(report_id)},
            {
                "$set": {
                    "status": ReportStatus.PENDING,
                    "file_path": None,
                    "error_message": None
                }
            }
        )
        
        # Regenerate
        return await self.generate_report(
            lead_id=report.lead_id,
            user_id=report.user_id,
            report_type=report.report_type,
            report_format=report.report_format,
            metadata=report.metadata
        )
