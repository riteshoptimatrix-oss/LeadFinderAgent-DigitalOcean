"""
Data Aggregator - Pulls and combines all analysis data for reports
"""
from typing import Dict, Any, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
import logging

from app.models.report import ReportType

logger = logging.getLogger(__name__)

class ReportDataAggregator:
    """Aggregates all analysis data from MongoDB for report generation"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    async def aggregate_report_data(
        self,
        lead_id: str,
        report_type: ReportType
    ) -> Dict[str, Any]:
        """
        Aggregate all relevant data for a specific report type
        Returns only REAL data from MongoDB - never generates fake values
        """
        
        # Always fetch lead info
        lead = await self._get_lead(lead_id)
        if not lead:
            raise ValueError(f"Lead {lead_id} not found")
        
        # Base data structure
        data = {
            "lead": lead,
            "report_type": report_type,
            "generated_at": None  # Will be set during generation
        }
        
        # Fetch data based on report type
        if report_type == ReportType.EXECUTIVE_SUMMARY:
            data.update(await self._aggregate_executive_summary(lead_id))
        
        elif report_type == ReportType.COMPLETE_AUDIT:
            data.update(await self._aggregate_complete_audit(lead_id))
        
        elif report_type == ReportType.SEO_REPORT or report_type == ReportType.TECHNICAL_SEO:
            data.update(await self._aggregate_seo_data(lead_id))
        
        elif report_type == ReportType.PERFORMANCE:
            data.update(await self._aggregate_performance_data(lead_id))
        
        elif report_type == ReportType.UI_ANALYSIS or report_type == ReportType.UX_ANALYSIS:
            data.update(await self._aggregate_ui_ux_data(lead_id))
        
        elif report_type == ReportType.ACCESSIBILITY:
            data.update(await self._aggregate_accessibility_data(lead_id))
        
        elif report_type == ReportType.SECURITY:
            data.update(await self._aggregate_security_data(lead_id))
        
        elif report_type == ReportType.TECHNOLOGY_STACK:
            data.update(await self._aggregate_technology_data(lead_id))
        
        elif report_type == ReportType.CONTACT_DISCOVERY:
            data.update(await self._aggregate_contact_data(lead_id))
        
        elif report_type == ReportType.BUSINESS_OPPORTUNITY:
            data.update(await self._aggregate_business_data(lead_id))
        
        elif report_type == ReportType.AI_RECOMMENDATIONS:
            data.update(await self._aggregate_recommendations_data(lead_id))
        
        elif report_type == ReportType.PROPOSAL or report_type == ReportType.CLIENT_PRESENTATION:
            data.update(await self._aggregate_proposal_data(lead_id))
        
        return data
    
    async def _get_lead(self, lead_id: str) -> Optional[Dict[str, Any]]:
        """Fetch lead information"""
        lead = await self.db.leads.find_one({"_id": ObjectId(lead_id)})
        if lead:
            lead["_id"] = str(lead["_id"])
        return lead
    
    async def _get_ai_analysis(self, lead_id: str) -> Optional[Dict[str, Any]]:
        """Fetch AI analysis job"""
        analysis = await self.db.ai_analysis_jobs.find_one({"lead_id": lead_id})
        if analysis:
            analysis["_id"] = str(analysis["_id"])
        return analysis

    async def _get_performance_audit(self, lead_id: str) -> Optional[Dict[str, Any]]:
        """Fetch the local Website Performance Audit from the Lead sub-document."""
        lead = await self.db.leads.find_one({"_id": ObjectId(lead_id)})
        if lead and lead.get("performanceAudit"):
            return lead["performanceAudit"]
        return None

    async def _get_security_audit(self, lead_id: str) -> Optional[Dict[str, Any]]:
        """Fetch the local Website Security Audit from the Lead sub-document."""
        lead = await self.db.leads.find_one({"_id": ObjectId(lead_id)})
        if lead and lead.get("securityAudit"):
            return lead["securityAudit"]
        return None

    async def _get_seo_audit(self, lead_id: str) -> Optional[Dict[str, Any]]:
        """Fetch the local SEO Intelligence Audit from the Lead sub-document."""
        lead = await self.db.leads.find_one({"_id": ObjectId(lead_id)})
        if lead and lead.get("seoAudit"):
            return lead["seoAudit"]
        return None

    async def _get_uiux_audit(self, lead_id: str) -> Optional[Dict[str, Any]]:
        """Fetch the local Website UI/UX Intelligence Audit from the Lead sub-document."""
        lead = await self.db.leads.find_one({"_id": ObjectId(lead_id)})
        if lead and lead.get("uiuxAudit"):
            return lead["uiuxAudit"]
        return None

    async def _get_technology_detection(self, lead_id: str) -> Optional[Dict[str, Any]]:
        """Fetch technology detection data, preferring the Lead sub-document
        (the source of truth after an AI analysis) over the legacy results collection."""
        lead = await self.db.leads.find_one({"_id": ObjectId(lead_id)})
        if lead and lead.get("technology_detection"):
            return lead["technology_detection"]
        return await self.db.technology_detection_results.find_one({"lead_id": lead_id})
    
    async def _aggregate_executive_summary(self, lead_id: str) -> Dict[str, Any]:
        """Aggregate data for executive summary"""
        return {
            "ai_analysis": await self._get_ai_analysis(lead_id),
            "seo_analysis": await self.db.seo_analysis_results.find_one({"lead_id": lead_id}),
            "performance_analysis": await self.db.performance_analysis_results.find_one({"lead_id": lead_id}),
            "ui_ux_analysis": await self.db.ui_ux_analysis_results.find_one({"lead_id": lead_id}),
            "security_analysis": await self.db.security_analysis_results.find_one({"lead_id": lead_id}),
            "business_intelligence": await self.db.business_intelligence_results.find_one({"lead_id": lead_id}),
            "technology_detection": await self._get_technology_detection(lead_id),
            "performance_audit": await self._get_performance_audit(lead_id),
            "security_audit": await self._get_security_audit(lead_id),
            "seo_audit": await self._get_seo_audit(lead_id),
            "uiux_audit": await self._get_uiux_audit(lead_id),
            "contact_discovery": await self.db.contact_discovery_results.find_one({"lead_id": lead_id})
        }
    
    async def _aggregate_complete_audit(self, lead_id: str) -> Dict[str, Any]:
        """Aggregate all available data for complete audit"""
        return await self._aggregate_executive_summary(lead_id)
    
    async def _aggregate_seo_data(self, lead_id: str) -> Dict[str, Any]:
        """Aggregate SEO-specific data"""
        return {
            "ai_analysis": await self._get_ai_analysis(lead_id),
            "seo_analysis": await self.db.seo_analysis_results.find_one({"lead_id": lead_id}),
            "performance_analysis": await self.db.performance_analysis_results.find_one({"lead_id": lead_id})
        }
    
    async def _aggregate_performance_data(self, lead_id: str) -> Dict[str, Any]:
        """Aggregate performance-specific data"""
        return {
            "ai_analysis": await self._get_ai_analysis(lead_id),
            "performance_analysis": await self.db.performance_analysis_results.find_one({"lead_id": lead_id}),
            "performance_audit": await self._get_performance_audit(lead_id),
            "security_audit": await self._get_security_audit(lead_id),
            "seo_audit": await self._get_seo_audit(lead_id),
            "uiux_audit": await self._get_uiux_audit(lead_id),
            "seo_analysis": await self.db.seo_analysis_results.find_one({"lead_id": lead_id})
        }
    
    async def _aggregate_ui_ux_data(self, lead_id: str) -> Dict[str, Any]:
        """Aggregate UI/UX-specific data"""
        return {
            "ai_analysis": await self._get_ai_analysis(lead_id),
            "ui_ux_analysis": await self.db.ui_ux_analysis_results.find_one({"lead_id": lead_id}),
            "uiux_audit": await self._get_uiux_audit(lead_id),
            "security_analysis": await self.db.security_analysis_results.find_one({"lead_id": lead_id})
        }
    
    async def _aggregate_accessibility_data(self, lead_id: str) -> Dict[str, Any]:
        """Aggregate accessibility-specific data"""
        return {
            "ai_analysis": await self._get_ai_analysis(lead_id),
            "security_analysis": await self.db.security_analysis_results.find_one({"lead_id": lead_id}),
            "ui_ux_analysis": await self.db.ui_ux_analysis_results.find_one({"lead_id": lead_id})
        }
    
    async def _aggregate_security_data(self, lead_id: str) -> Dict[str, Any]:
        """Aggregate security-specific data"""
        return {
            "ai_analysis": await self._get_ai_analysis(lead_id),
            "security_analysis": await self.db.security_analysis_results.find_one({"lead_id": lead_id})
        }
    
    async def _aggregate_technology_data(self, lead_id: str) -> Dict[str, Any]:
        """Aggregate technology detection data"""
        return {
            "ai_analysis": await self._get_ai_analysis(lead_id),
            "technology_detection": await self._get_technology_detection(lead_id),
            "security_analysis": await self.db.security_analysis_results.find_one({"lead_id": lead_id})
        }
    
    async def _aggregate_contact_data(self, lead_id: str) -> Dict[str, Any]:
        """Aggregate contact discovery data"""
        return {
            "ai_analysis": await self._get_ai_analysis(lead_id),
            "contact_discovery": await self.db.contact_discovery_results.find_one({"lead_id": lead_id})
        }
    
    async def _aggregate_business_data(self, lead_id: str) -> Dict[str, Any]:
        """Aggregate business intelligence data"""
        return {
            "ai_analysis": await self._get_ai_analysis(lead_id),
            "business_intelligence": await self.db.business_intelligence_results.find_one({"lead_id": lead_id}),
            "seo_analysis": await self.db.seo_analysis_results.find_one({"lead_id": lead_id}),
            "performance_analysis": await self.db.performance_analysis_results.find_one({"lead_id": lead_id}),
            "ui_ux_analysis": await self.db.ui_ux_analysis_results.find_one({"lead_id": lead_id}),
            "security_analysis": await self.db.security_analysis_results.find_one({"lead_id": lead_id})
        }
    
    async def _aggregate_recommendations_data(self, lead_id: str) -> Dict[str, Any]:
        """Aggregate AI recommendations from all analyses"""
        return await self._aggregate_complete_audit(lead_id)
    
    async def _aggregate_proposal_data(self, lead_id: str) -> Dict[str, Any]:
        """Aggregate data for proposal/presentation"""
        return await self._aggregate_complete_audit(lead_id)
