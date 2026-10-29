"""
Automatic Report Generation Worker
Monitors AI analysis completions and automatically generates reports
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
import logging

from app.models.report import ReportType, ReportFormat, ReportMetadata
from app.models.ai_analysis import AIAnalysisState
from app.services.reports.report_generator import ReportGeneratorService

logger = logging.getLogger(__name__)

class AutoReportWorker:
    """
    Background worker that automatically generates reports when AI analysis completes
    """
    
    def __init__(self, db: AsyncIOMotorDatabase, check_interval: int = 30):
        self.db = db
        self.check_interval = check_interval
        self.running = False
        self.task = None
        self.report_service = ReportGeneratorService(db)
        self.processed_analyses = set()  # Track processed analysis IDs
        
        # Default reports to generate automatically (All 15)
        self.auto_generate_reports = [
            ReportType.EXECUTIVE_SUMMARY,
            ReportType.COMPLETE_AUDIT,
            ReportType.SEO_REPORT,
            ReportType.TECHNICAL_SEO,
            ReportType.PERFORMANCE,
            ReportType.UI_ANALYSIS,
            ReportType.UX_ANALYSIS,
            ReportType.ACCESSIBILITY,
            ReportType.SECURITY,
            ReportType.TECHNOLOGY_STACK,
            ReportType.CONTACT_DISCOVERY,
            ReportType.BUSINESS_OPPORTUNITY,
            ReportType.AI_RECOMMENDATIONS,
            ReportType.PROPOSAL,
            ReportType.CLIENT_PRESENTATION
        ]
    
    def start(self):
        """Start the worker"""
        if self.running:
            logger.warning("AutoReportWorker is already running")
            return
        
        self.running = True
        self.task = asyncio.create_task(self._worker_loop())
        logger.info("AutoReportWorker started")
    
    async def stop(self):
        """Stop the worker"""
        if not self.running:
            return
        
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        logger.info("AutoReportWorker stopped")
    
    async def _worker_loop(self):
        """Main worker loop"""
        while self.running:
            try:
                await self._check_completed_analyses()
            except Exception as e:
                logger.error(f"Error in AutoReportWorker: {e}", exc_info=True)
            
            await asyncio.sleep(self.check_interval)
    
    async def _check_completed_analyses(self):
        """Check for completed AI analyses and generate reports"""
        
        # Find recently completed analyses that we haven't processed
        cursor = self.db.ai_analysis_jobs.find({
            "status": AIAnalysisState.COMPLETED,
            "completed_at": {"$ne": None}
        }).sort("completed_at", -1).limit(50)
        
        async for analysis_doc in cursor:
            analysis_id = str(analysis_doc["_id"])
            
            # Skip if already processed
            if analysis_id in self.processed_analyses:
                continue
            
            lead_id = analysis_doc.get("lead_id")
            if not lead_id:
                continue
            
            # Check if reports already exist
            existing_reports = await self.db.reports.count_documents({
                "lead_id": lead_id,
                "report_type": {"$in": [rt.value for rt in self.auto_generate_reports]}
            })
            
            # Only generate if no reports exist
            if existing_reports == 0:
                logger.info(f"Auto-generating reports for lead {lead_id} after analysis completion")
                
                try:
                    # Get user_id from analysis or lead
                    user_id = analysis_doc.get("user_id")
                    if not user_id:
                        lead_doc = await self.db.leads.find_one({"_id": ObjectId(lead_id)})
                        if lead_doc:
                            user_id = lead_doc.get("user_id")
                    
                    if not user_id:
                        logger.warning(f"No user_id found for lead {lead_id}, skipping auto-report generation")
                        continue
                    
                    # Generate reports
                    await self._generate_reports_for_lead(
                        lead_id=lead_id,
                        user_id=user_id
                    )
                    
                    logger.info(f"Successfully auto-generated reports for lead {lead_id}")
                    
                except Exception as e:
                    logger.error(f"Failed to auto-generate reports for lead {lead_id}: {e}", exc_info=True)
            
            # Mark as processed
            self.processed_analyses.add(analysis_id)
            
            # Keep set size manageable
            if len(self.processed_analyses) > 1000:
                # Remove oldest entries
                self.processed_analyses = set(list(self.processed_analyses)[-500:])
    
    async def _generate_reports_for_lead(self, lead_id: str, user_id: str):
        """Generate all auto-reports for a lead"""
        
        metadata = ReportMetadata(
            generated_by="Auto Report Worker",
            include_charts=True,
            include_screenshots=True,
            include_recommendations=True
        )
        
        for report_type in self.auto_generate_reports:
            try:
                await self.report_service.generate_report(
                    lead_id=lead_id,
                    user_id=user_id,
                    report_type=report_type,
                    report_format=ReportFormat.PDF,
                    metadata=metadata
                )
                logger.info(f"Generated {report_type.value} for lead {lead_id}")
            except Exception as e:
                logger.error(f"Failed to generate {report_type.value} for lead {lead_id}: {e}")
