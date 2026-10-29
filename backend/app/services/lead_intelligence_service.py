import logging
from typing import Dict, Any, List

from app.models.lead_intelligence import (
    LeadIntelligenceResult, BusinessProfile, OpportunityDetection, OpportunityScore,
    ServiceRecommendation, AISummary
)

logger = logging.getLogger(__name__)

class LeadIntelligenceService:
    def __init__(self, db):
        self.db = db

    async def execute_intelligence(self, lead_id: str, lead_data: Dict[str, Any], on_update=None) -> LeadIntelligenceResult:
        if on_update:
            await on_update("Website Intelligence Reader", "Extracting AI analysis data...")
            
        ai = lead_data.get("ai_analysis") or {}
        website = lead_data.get("website_information") or {}
        contacts = lead_data.get("contact_discovery") or {}
        
        # Base Data
        overall_score = ai.get("overall_score") or 0
        seo_score = ai.get("seo_score") or 0
        perf_score = ai.get("performance_score") or 0
        ui_score = ai.get("ui_score") or 0
        ux_score = ai.get("ux_score") or 0
        sec_score = ai.get("security_score") or 0
        acc_score = ai.get("accessibility_score") or 0
        
        has_ssl = ai.get("ssl") or False
        has_analytics = True if ai.get("analytics") else False
        has_forms = True if ai.get("forms") else False
        
        emails = ai.get("emails") or []
        phones = ai.get("phones") or []
        
        # 1. Digital Maturity Analyzer
        if on_update:
            await on_update("Digital Maturity Analyzer", "Evaluating digital presence...")
        
        # Calculate digital maturity based on combined scores
        digital_maturity = int((seo_score + perf_score + sec_score + acc_score) / 4)
        
        # 2. Business Profile Builder
        if on_update:
            await on_update("Business Profile Builder", "Profiling business category and reach...")
            
        profile = BusinessProfile(
            industry=lead_data.get("category") or "Unknown",
            sub_industry="Local Business",
            business_category=lead_data.get("category") or "Unknown",
            estimated_business_size="Small" if len(emails) < 3 else "Medium",
            digital_presence="Strong" if digital_maturity > 70 else ("Basic" if digital_maturity > 40 else "Weak")
        )
        
        # 3. Opportunity Detection
        if on_update:
            await on_update("Opportunity Detection", "Scanning for critical flaws...")
            
        ops_detected = []
        if seo_score < 60:
            ops_detected.append(OpportunityDetection(opportunity_type="Weak SEO", detected=True, severity="High", description="SEO score is critically low."))
        if perf_score < 50:
            ops_detected.append(OpportunityDetection(opportunity_type="Slow Website", detected=True, severity="High", description="Website load times are very high."))
        if ui_score < 60:
            ops_detected.append(OpportunityDetection(opportunity_type="Outdated Website", detected=True, severity="Critical", description="UI design is outdated and non-responsive."))
        if not has_ssl or sec_score < 50:
            ops_detected.append(OpportunityDetection(opportunity_type="Missing SSL / Security", detected=True, severity="Critical", description="Website lacks basic security or SSL."))
        if not has_analytics:
            ops_detected.append(OpportunityDetection(opportunity_type="Missing Analytics", detected=True, severity="Medium", description="No analytics tools detected."))
            
        # 4. Sales Readiness Analyzer
        if on_update:
            await on_update("Sales Readiness Analyzer", "Calculating sales probability...")
            
        sales_readiness_score = 0
        if len(ops_detected) >= 3:
            sales_readiness_score = 90
        elif len(ops_detected) >= 1:
            sales_readiness_score = 60
        else:
            sales_readiness_score = 20
            
        # 5. Risk Analyzer
        if on_update:
            await on_update("Risk Analyzer", "Identifying bounce risks...")
            
        risk_score = 0
        if not has_ssl:
            risk_score += 40
        if perf_score < 30:
            risk_score += 30
        if ui_score < 40:
            risk_score += 30
        risk_score = min(100, risk_score)
        
        # 6. Opportunity Scoring Engine
        if on_update:
            await on_update("Opportunity Scoring Engine", "Generating 0-100 opportunity scores...")
            
        op_scores = [
            OpportunityScore(category="SEO", score=100 - seo_score, reasoning="Based on technical SEO audit."),
            OpportunityScore(category="Performance", score=100 - perf_score, reasoning="Based on Lighthouse metrics."),
            OpportunityScore(category="Security", score=100 - sec_score, reasoning="Based on SSL and headers."),
            OpportunityScore(category="UI/UX", score=100 - int((ui_score + ux_score) / 2), reasoning="Based on layout and design tokens."),
        ]
        
        overall_op_score = int(sum(o.score for o in op_scores) / len(op_scores))
        
        # 7. Lead Priority
        if on_update:
            await on_update("Priority Classification", "Classifying priority level...")
            
        if overall_op_score > 80:
            priority = "Critical"
        elif overall_op_score > 60:
            priority = "High"
        elif overall_op_score > 40:
            priority = "Medium"
        elif overall_op_score > 20:
            priority = "Low"
        else:
            priority = "Very Low"
            
        # 8. Service Recommendation Engine
        if on_update:
            await on_update("Service Recommendation Engine", "Recommending tailored services...")
            
        recs = []
        if 100 - seo_score > 60:
            recs.append(ServiceRecommendation(service_name="SEO Retainer", priority="High", reason="Critically low search visibility.", estimated_business_impact="High"))
        if 100 - perf_score > 50:
            recs.append(ServiceRecommendation(service_name="Performance Optimization", priority="Medium", reason="Slow page loads increase bounce rates.", estimated_business_impact="Medium"))
        if 100 - sec_score > 50:
            recs.append(ServiceRecommendation(service_name="Security Hardening", priority="Critical", reason="Missing SSL affects trust and SEO.", estimated_business_impact="High"))
        if overall_op_score > 70:
            recs.append(ServiceRecommendation(service_name="Website Redesign", priority="Critical", reason="Multiple overlapping critical issues require a full rebuild.", estimated_business_impact="High"))
            
        # 9. AI Summary Generator
        if on_update:
            await on_update("AI Summary Generator", "Synthesizing business summary...")
            
        summary = AISummary(
            business_overview=f"{lead_data.get('name')} is a {profile.industry} business with {profile.digital_presence.lower()} digital presence.",
            website_strengths=[],
            website_weaknesses=[o.description for o in ops_detected],
            biggest_opportunities=[o.opportunity_type for o in ops_detected],
            recommended_services=[r.service_name for r in recs],
            sales_talking_points=[f"Your {r.service_name.lower()} could be vastly improved to drive more leads." for r in recs],
            objection_risks=["Budget constraints", "Lack of technical understanding"]
        )
        
        return LeadIntelligenceResult(
            digital_maturity_score=digital_maturity,
            sales_readiness_score=sales_readiness_score,
            risk_score=risk_score,
            overall_opportunity_score=overall_op_score,
            priority_classification=priority,
            business_profile=profile,
            opportunities_detected=ops_detected,
            opportunity_breakdown=op_scores,
            service_recommendations=recs,
            ai_summary=summary
        )
