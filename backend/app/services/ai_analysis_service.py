"""
AI Analysis Service
Handles generation and retrieval of AI analysis for leads
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from typing import Dict, Any
import time
from app.models.ai import AIAnalysisDetailResponse, AIAnalysisData, AIRecommendations
from app.core.logger import logger

class AIAnalysisService:
    """Service for AI analysis operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db["ai_analysis"]
    
    async def get_or_generate_analysis(
        self, 
        lead_id: str, 
        user_id: str,
        lead: Dict[str, Any]
    ) -> AIAnalysisDetailResponse:
        """
        Get existing analysis or generate a new one.
        Never returns None - always returns valid analysis.
        """
        # Try to get existing analysis
        existing = await self.collection.find_one({
            "lead_id": lead_id,
            "user_id": user_id
        })
        
        if existing:
            return self._format_analysis_response(existing, lead)
        
        # Generate new analysis
        return await self.generate_analysis(lead_id, user_id, lead)
    
    async def generate_analysis(
        self, 
        lead_id: str, 
        user_id: str,
        lead: Dict[str, Any]
    ) -> AIAnalysisDetailResponse:
        """
        Generate a new AI analysis for a lead.
        Creates analysis data based on lead information.
        """
        start_time = time.time()
        
        # Extract lead data
        business_name = lead.get("name", "Unknown Business")
        website = lead.get("website", "")
        category = lead.get("category", "")
        lead.get("google_rating", 0)
        
        # Generate analysis data
        analysis_data = self._generate_analysis_data(lead)
        
        # Calculate scores
        lead_score = self._calculate_lead_score(lead, analysis_data)
        website_score = self._calculate_website_score(lead)
        opportunity_score = self._calculate_opportunity_score(lead, analysis_data)
        seo_score = self._calculate_seo_score(lead)
        
        # Detect technologies
        technology_detected = self._detect_technologies(website)
        
        # Extract recommendations
        recommendations = self._extract_recommendations(analysis_data)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Create analysis document
        analysis_doc = {
            "lead_id": lead_id,
            "user_id": user_id,
            "business_name": business_name,
            "website": website,
            "category": category,
            "lead_score": lead_score,
            "website_score": website_score,
            "opportunity_score": opportunity_score,
            "seo_score": lead.get("_seo_score", seo_score),
            "ui_score": lead.get("_ui_score", 0),
            "ux_score": lead.get("_ux_score", 0),
            "performance_score": lead.get("_performance_score", 0),
            "technology_detected": technology_detected,
            "ssl_enabled": self._check_ssl(website),
            "mobile_friendly": None,  # Would require actual testing
            "page_speed": None,  # Would require actual testing
            "recommendations": recommendations,
            "analysis_data": analysis_data.dict(),
            "analyzed_at": datetime.utcnow(),
            "processing_time_ms": processing_time,
            "model": "internal",
            "prompt_version": "1.0"
        }
        
        # Save to database
        result = await self.collection.insert_one(analysis_doc)
        analysis_doc["_id"] = str(result.inserted_id)
        
        logger.info(f"Generated AI analysis for lead {lead_id} in {processing_time}ms")
        
        return self._format_analysis_response(analysis_doc, lead)
    
    def _generate_analysis_data(self, lead: Dict[str, Any]) -> AIAnalysisData:
        """Generate AI analysis data based on lead information"""
        business_name = lead.get("name", "Unknown Business")
        website = lead.get("website", "")
        category = lead.get("category", "General")
        google_rating = lead.get("google_rating", 0)
        address = lead.get("address", "")
        
        # Generate analysis based on available data
        strengths = []
        weaknesses = []
        opportunities = []
        seo_issues = []
        trust_signals = []
        
        # Analyze Google rating
        if google_rating >= 4.0:
            strengths.append(f"High Google rating ({google_rating}/5.0)")
            trust_signals.append("Positive customer reviews")
        elif google_rating > 0:
            weaknesses.append(f"Below average Google rating ({google_rating}/5.0)")
        
        # Analyze website presence
        if website:
            strengths.append("Has online presence with website")
            if not website.startswith("https://"):
                seo_issues.append("Website not using HTTPS")
                weaknesses.append("No SSL certificate")
                
            crawled_text = lead.get("_crawled_text")
            if crawled_text:
                if len(crawled_text) > 500:
                    strengths.append("Website has substantial textual content")
                else:
                    weaknesses.append("Website has thin content")
                    
            seo_summary = lead.get("_seo_summary")
            if seo_summary:
                if "Technical SEO Score:" in seo_summary:
                    try:
                        score_str = seo_summary.split("Score:")[1].split("/")[0].split(".")[0].strip()
                        if int(score_str) > 80:
                            strengths.append(f"Excellent technical SEO (Score: {score_str})")
                        elif int(score_str) < 50:
                            weaknesses.append(f"Poor technical SEO (Score: {score_str})")
                    except:
                        pass
                        
            design_summary = lead.get("_design_summary")
            if design_summary:
                try:
                    ux_score_str = design_summary.split("UX Score:")[1].split(",")[0].strip()
                    if int(ux_score_str) < 50:
                        weaknesses.append("Poor UX and missing CTAs")
                    ui_score_str = design_summary.split("UI Score:")[1].split(",")[0].strip()
                    if int(ui_score_str) < 50:
                        weaknesses.append("Poor visual hierarchy and UI")
                except:
                    pass
                    
            contact_summary = lead.get("_contact_summary")
            if contact_summary:
                try:
                    emails = int(contact_summary.split("Emails:")[1].split(",")[0].strip())
                    if emails > 0:
                        strengths.append(f"Multiple contact emails found ({emails})")
                except:
                    pass
        else:
            weaknesses.append("No website found")
            opportunities.append("Website development")
            seo_issues.append("No online presence")
        
        # Analyze location
        if address:
            trust_signals.append("Physical address verified")
        
        # Generate priority
        priority = "Cold"
        if not website:
            priority = "Hot"
            priority_reason = "No website - high potential for web development services"
        elif google_rating < 3.0 and google_rating > 0:
            priority = "Warm"
            priority_reason = "Low ratings indicate need for reputation management and digital improvement"
        else:
            priority_reason = "Established business with good digital presence"
        
        # Generate recommendations
        services = []
        technologies = []
        expected_value = "$0"
        
        if not website:
            services.extend(["Website Development", "SEO Setup", "Google Business Optimization"])
            technologies.extend(["WordPress", "React", "Next.js"])
            expected_value = "$3,000-$10,000"
        elif website and not website.startswith("https://"):
            services.extend(["SSL Certificate Installation", "Security Audit", "SEO Optimization"])
            expected_value = "$500-$2,000"
        else:
            services.extend(["SEO Optimization", "Performance Improvement"])
            expected_value = "$1,000-$5,000"
        
        recommendations = AIRecommendations(
            services=services,
            technologies=technologies,
            priority_level="High" if priority in ["Hot", "Warm"] else "Medium",
            expected_value=expected_value,
            reasoning=f"Based on analysis of {category} business with current digital maturity"
        )
        
        # Create analysis data
        return AIAnalysisData(
            business_summary=f"{business_name} is a {category} business with {'a strong' if google_rating >= 4.0 else 'moderate'} online reputation.",
            strengths=strengths,
            weaknesses=weaknesses,
            opportunities=opportunities,
            website_quality="Good" if website and website.startswith("https://") else "Poor" if website else "None",
            seo_issues=seo_issues,
            trust_signals=trust_signals,
            lead_priority=priority,
            priority_reason=priority_reason,
            recommendations=recommendations
        )
    
    def _calculate_lead_score(self, lead: Dict[str, Any], analysis: AIAnalysisData) -> int:
        """Calculate lead score (0-100)"""
        score = 50  # Base score
        
        # Website presence
        if lead.get("website"):
            score += 10
            if lead["website"].startswith("https://"):
                score += 10
        else:
            score += 20  # No website = high opportunity
        
        # Google rating
        rating = lead.get("google_rating", 0)
        if rating >= 4.0:
            score += 15
        elif rating >= 3.0:
            score += 10
        elif rating < 3.0 and rating > 0:
            score += 20  # Low ratings = opportunity
        
        # Contact info
        if lead.get("phone"):
            score += 5
        if lead.get("email"):
            score += 5
        
        return min(100, max(0, score))
    
    def _calculate_website_score(self, lead: Dict[str, Any]) -> int:
        """Calculate website score (0-100)"""
        if not lead.get("website"):
            return 0
        
        score = 40  # Base score for having a website
        
        # SSL
        if lead["website"].startswith("https://"):
            score += 30
        
        # Domain quality (simple heuristic)
        if "." in lead["website"]:
            score += 15
        
        # Professional TLD
        if any(tld in lead["website"] for tld in [".com", ".net", ".org", ".io"]):
            score += 15
        
        return min(100, max(0, score))
    
    def _calculate_opportunity_score(self, lead: Dict[str, Any], analysis: AIAnalysisData) -> int:
        """Calculate opportunity score (0-100)"""
        score = 50  # Base score
        
        # More opportunities = higher score
        score += len(analysis.opportunities) * 10
        
        # Weaknesses indicate opportunity
        score += len(analysis.weaknesses) * 5
        
        # Priority affects opportunity
        if analysis.lead_priority == "Hot":
            score += 30
        elif analysis.lead_priority == "Warm":
            score += 20
        
        return min(100, max(0, score))
    
    def _calculate_seo_score(self, lead: Dict[str, Any]) -> int:
        """Calculate SEO score (0-100)"""
        if not lead.get("website"):
            return 0
        
        score = 30  # Base score
        
        # HTTPS
        if lead["website"].startswith("https://"):
            score += 20
        
        # Domain age (can't determine, give average)
        score += 15
        
        # Google Business presence (has rating)
        if lead.get("google_rating", 0) > 0:
            score += 20
        
        # Address = local SEO
        if lead.get("address"):
            score += 15
        
        return min(100, max(0, score))
    
    def _detect_technologies(self, website: str) -> list:
        """Detect technologies from website URL"""
        if not website:
            return []
        
        technologies = []
        
        # Simple detection based on common patterns
        # In production, this would scan the actual website
        if "wordpress" in website.lower():
            technologies.append("WordPress")
        if "shopify" in website.lower():
            technologies.append("Shopify")
        if "wix" in website.lower():
            technologies.append("Wix")
        
        # Default if nothing detected
        if not technologies:
            technologies.append("Custom")
        
        return technologies
    
    def _check_ssl(self, website: str) -> bool:
        """Check if website has SSL"""
        if not website:
            return False
        return website.startswith("https://")
    
    def _extract_recommendations(self, analysis: AIAnalysisData) -> list:
        """Extract recommendations as list of strings"""
        recommendations = []
        
        if analysis.recommendations:
            for service in analysis.recommendations.services:
                recommendations.append(service)
        
        # Add recommendations based on weaknesses
        if "No website" in str(analysis.weaknesses):
            recommendations.append("Develop professional website")
        if "No SSL" in str(analysis.weaknesses):
            recommendations.append("Install SSL certificate")
        
        return recommendations[:5]  # Limit to top 5
    
    def _format_analysis_response(
        self, 
        analysis_doc: Dict[str, Any],
        lead: Dict[str, Any]
    ) -> AIAnalysisDetailResponse:
        """Format analysis document as response model. The model_validator handles flattening."""
        analysis_data = None
        if "analysis_data" in analysis_doc:
            analysis_data = AIAnalysisData(**analysis_doc["analysis_data"])

        return AIAnalysisDetailResponse(
            lead_id=analysis_doc["lead_id"],
            business_name=analysis_doc.get("business_name", lead.get("name")),
            lead_score=analysis_doc.get("lead_score", 0),
            website_score=analysis_doc.get("website_score", 0),
            opportunity_score=analysis_doc.get("opportunity_score", 0),
            technology_detected=analysis_doc.get("technology_detected", []),
            seo_score=analysis_doc.get("seo_score", 0),
            ui_score=analysis_doc.get("ui_score", 0),
            ux_score=analysis_doc.get("ux_score", 0),
            performance_score=analysis_doc.get("performance_score", 0),
            ssl_enabled=analysis_doc.get("ssl_enabled", False),
            mobile_friendly=analysis_doc.get("mobile_friendly"),
            page_speed=analysis_doc.get("page_speed"),
            recommendations=analysis_doc.get("recommendations", []),
            analyzed_at=analysis_doc.get("analyzed_at", datetime.utcnow()),
            analysis_data=analysis_data,
        )
