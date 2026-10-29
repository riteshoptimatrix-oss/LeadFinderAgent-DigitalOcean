import logging
from typing import Dict, Any

from app.models.business_intelligence import (
    BusinessIntelligenceResultCreate, MasterScorecard, ScoreEvidence,
    BusinessOpportunity, ScoreConfig
)
from app.services.safe_scoring import safe_score, safe_float, safe_int, safe_get, safe_list

logger = logging.getLogger(__name__)

class BusinessIntelligenceService:
    def __init__(self, db):
        self.db = db

    async def _get_or_create_config(self) -> ScoreConfig:
        config_doc = await self.db["score_configs"].find_one({"version": "1.0"})
        if not config_doc:
            config = ScoreConfig()
            await self.db["score_configs"].insert_one(config.dict())
            return config
        return ScoreConfig(**config_doc)

    async def compute_intelligence(self, lead_id: str, website_url: str, modules_data: Dict[str, Any], on_update=None) -> BusinessIntelligenceResultCreate:
        if on_update:
            await on_update("AI Scoring & BI Engine", website_url, {"current_stage": "Loading Configuration Weights"})
            
        config = await self._get_or_create_config()
        
        evidence = []
        overall_score_acc = 0.0
        
        # --- Safely Extract Previous Module Scores ---
        seo_score = safe_score(safe_get(safe_get(modules_data, "seo", {}), "scorecard", {}).get("overall_score", 0))
        perf_score = safe_score(safe_get(safe_get(modules_data, "performance", {}), "scorecard", {}).get("overall_desktop_score", 0))
        ui_score = safe_score(safe_get(safe_get(modules_data, "ui_ux", {}), "scorecard", {}).get("overall_ui_score", 0))
        sec_score = safe_score(safe_get(safe_get(modules_data, "security", {}), "scorecard", {}).get("overall_security_score", 0))
        
        contacts = safe_list(safe_get(safe_get(modules_data, "contacts", {}), "contacts", []))
        techs = safe_list(safe_get(safe_get(modules_data, "tech", {}), "technologies", []))
        
        # Calculate heuristics for modules that don't have absolute 0-100 scores
        contact_score = safe_score(min(100, len(contacts) * 20))
        tech_score = safe_score(min(100, len(techs) * 10))
        
        # New Extraction checking (Forms, Analytics, Maps, etc) from Phase 7
        forms_found = False
        social_found = False
        analytics_found = False
        for t in techs:
            name = (t.name if hasattr(t, 'name') else t.get("name", "")).lower()
            if "analytics" in name or "tag manager" in name or "pixel" in name:
                analytics_found = True
                break
        
        # We can loosely infer forms and socials from contacts data for now if not strictly in modules_data
        if len(contacts) > 1:
            social_found = True
        
        # --- Compute Weighted Overall Score ---
        if on_update:
            await on_update("AI Scoring & BI Engine", website_url, {"current_stage": "Computing Deterministic Aggregates"})
            
        def add_evidence(name: str, raw: float, weight: float, desc: str):
            nonlocal overall_score_acc
            weighted = raw * weight
            overall_score_acc += weighted
            evidence.append(ScoreEvidence(
                category_name=name, raw_value=raw, weighted_value=weighted,
                weight_percentage=weight * 100, reason=desc
            ))

        add_evidence("SEO Health", seo_score, config.seo_weight, "Calculated from technical and on-page SEO metrics.")
        add_evidence("Performance Health", perf_score, config.performance_weight, "Calculated from Desktop Lighthouse API.")
        add_evidence("UI/UX Quality", ui_score, config.ui_ux_weight, "Calculated from deterministic DOM measurements.")
        add_evidence("Security Posture", sec_score, config.security_weight, "Calculated from Headers and SSL configurations.")
        add_evidence("Contact Completeness", contact_score, config.contact_weight, "Calculated from extracted emails, phones, and socials.")
        add_evidence("Technology Stack", tech_score, config.tech_weight, "Calculated from detected libraries and frameworks.")
        
        overall_website_score = safe_score(overall_score_acc)
        
        # --- Business Opportunity Prediction ---
        opportunities = []
        
        # SEO opportunities - more nuanced detection
        if seo_score < 40:
            opportunities.append(BusinessOpportunity(
                opportunity_type="SEO Service", opportunity_score=100 - seo_score,
                confidence_score=98, estimated_business_impact="Critical", estimated_priority="Critical",
                reasoning=f"SEO Score is critically low ({seo_score}/100). The site has severe technical SEO issues that are actively hurting search rankings."
            ))
        elif seo_score < 60:
            opportunities.append(BusinessOpportunity(
                opportunity_type="SEO Service", opportunity_score=100 - seo_score,
                confidence_score=95, estimated_business_impact="High", estimated_priority="High",
                reasoning=f"SEO Score is extremely low ({seo_score}/100), indicating a highly receptive target for SEO retainers."
            ))
        elif seo_score < 75:
            opportunities.append(BusinessOpportunity(
                opportunity_type="SEO Optimization", opportunity_score=100 - seo_score,
                confidence_score=85, estimated_business_impact="Medium", estimated_priority="Medium",
                reasoning=f"SEO Score is below average ({seo_score}/100). There are clear opportunities for improvement in technical SEO and content optimization."
            ))
            
        # Performance opportunities
        if perf_score < 30:
            opportunities.append(BusinessOpportunity(
                opportunity_type="Performance Optimization", opportunity_score=100 - perf_score,
                confidence_score=95, estimated_business_impact="Critical", estimated_priority="Critical",
                reasoning=f"Performance Score is critically low ({perf_score}/100). The site is extremely slow, causing high bounce rates and lost conversions."
            ))
        elif perf_score < 50:
            opportunities.append(BusinessOpportunity(
                opportunity_type="Performance Optimization", opportunity_score=100 - perf_score,
                confidence_score=90, estimated_business_impact="High", estimated_priority="High",
                reasoning=f"Performance Score is {perf_score}/100. The site is visibly slow to users, providing a strong upsell angle."
            ))
        elif perf_score < 70:
            opportunities.append(BusinessOpportunity(
                opportunity_type="Performance Tuning", opportunity_score=100 - perf_score,
                confidence_score=80, estimated_business_impact="Medium", estimated_priority="Medium",
                reasoning=f"Performance Score is {perf_score}/100. There are moderate opportunities to improve page load times and Core Web Vitals."
            ))
            
        # UI/UX opportunities
        if ui_score < 50:
            opportunities.append(BusinessOpportunity(
                opportunity_type="Website Redesign", opportunity_score=100 - ui_score,
                confidence_score=90, estimated_business_impact="Critical", estimated_priority="Critical",
                reasoning=f"UI/UX Score is critically low ({ui_score}/100). The interface is outdated and needs a complete visual overhaul."
            ))
        elif ui_score < 70:
            opportunities.append(BusinessOpportunity(
                opportunity_type="Website Redesign", opportunity_score=100 - ui_score,
                confidence_score=85, estimated_business_impact="High", estimated_priority="High",
                reasoning=f"UI/UX Score is {ui_score}/100. The interface lacks modern design tokens, signaling an urgent need for a visual overhaul."
            ))
        elif ui_score < 85:
            opportunities.append(BusinessOpportunity(
                opportunity_type="UI Enhancement", opportunity_score=100 - ui_score,
                confidence_score=75, estimated_business_impact="Medium", estimated_priority="Medium",
                reasoning=f"UI/UX Score is {ui_score}/100. There are opportunities to modernize the design and improve user experience."
            ))
            
        # Security opportunities
        if sec_score < 40:
            opportunities.append(BusinessOpportunity(
                opportunity_type="Security Upgrades", opportunity_score=100 - sec_score,
                confidence_score=98, estimated_business_impact="Critical", estimated_priority="Critical",
                reasoning=f"Security Score is critically low ({sec_score}/100). The site has severe security vulnerabilities that need immediate attention."
            ))
        elif sec_score < 60:
            opportunities.append(BusinessOpportunity(
                opportunity_type="Security Upgrades", opportunity_score=100 - sec_score,
                confidence_score=95, estimated_business_impact="High", estimated_priority="High",
                reasoning=f"Security Score is {sec_score}/100. Missing basic security headers or SSL issues."
            ))
        elif sec_score < 80:
            opportunities.append(BusinessOpportunity(
                opportunity_type="Security Hardening", opportunity_score=100 - sec_score,
                confidence_score=85, estimated_business_impact="Medium", estimated_priority="Medium",
                reasoning=f"Security Score is {sec_score}/100. There are opportunities to improve security posture and compliance."
            ))
            
        # Analytics and tracking opportunities
        if not analytics_found:
            opportunities.append(BusinessOpportunity(
                opportunity_type="Analytics Integration", opportunity_score=80,
                confidence_score=100, estimated_business_impact="High", estimated_priority="High",
                reasoning="No Analytics tools were detected on the website. This is a critical gap for data-driven decision making."
            ))
            
        # Contact completeness opportunities
        if contact_score < 30:
            opportunities.append(BusinessOpportunity(
                opportunity_type="Contact Optimization", opportunity_score=100 - contact_score,
                confidence_score=95, estimated_business_impact="High", estimated_priority="High",
                reasoning="Very few contact methods found. Adding clear CTAs, contact forms, and visible phone/email can significantly improve conversions."
            ))
        elif contact_score < 60:
            opportunities.append(BusinessOpportunity(
                opportunity_type="Lead Generation", opportunity_score=100 - contact_score,
                confidence_score=85, estimated_business_impact="Medium", estimated_priority="Medium",
                reasoning="Limited contact information available. Adding more contact methods and lead capture forms can improve conversions."
            ))
            
        # --- Recommendation Engine ---
        recommendations = []
        
        if seo_score < 80:
            recommendations.append("Fix missing H1s, add meta descriptions, and ensure semantic HTML structure to boost search visibility.")
        if perf_score < 80:
            recommendations.append("Compress images, implement lazy loading, and minify CSS/JS to improve page load speed.")
        if sec_score < 80:
            recommendations.append("Enforce HTTPS and implement strict Content Security Policy (CSP) headers.")
        if ui_score < 80:
            recommendations.append("Modernize the design layout, increase contrast, and improve mobile responsiveness.")
        if not analytics_found:
            recommendations.append("Install Google Analytics and a Tag Manager to track visitor behavior and conversions.")
        if contact_score < 40:
            recommendations.append("Add clear Call-To-Action buttons, a prominent Contact Form, and list phone/email clearly.")
        business_opportunity_score = safe_score(
            sum(opp.opportunity_score for opp in opportunities) / max(1, len(opportunities))
        ) if opportunities else 0
        lead_priority_score = safe_score(min(100, int(business_opportunity_score * 0.7 + (100 - overall_website_score) * 0.3)))
        
        # More nuanced lead classification based on multiple factors
        lead_classification = "Cold Lead"
        priority_classification = "Low"
        
        # Consider both opportunity score and website quality
        if lead_priority_score >= 85:
            lead_classification = "Hot Lead"
            priority_classification = "Critical"
        elif lead_priority_score >= 70:
            lead_classification = "Warm Lead"
            priority_classification = "High"
        elif lead_priority_score >= 50:
            lead_classification = "Interested Lead"
            priority_classification = "Medium"
        elif lead_priority_score >= 30:
            lead_classification = "Potential Lead"
            priority_classification = "Low-Medium"
        else:
            lead_classification = "Cold Lead"
            priority_classification = "Low"
            
        scorecard = MasterScorecard(
            overall_website_score=safe_score(overall_website_score),
            business_opportunity_score=safe_score(business_opportunity_score),
            lead_priority_score=safe_score(lead_priority_score),
            website_quality_score=safe_score((ui_score + perf_score) / 2),
            website_health_score=safe_score((sec_score + perf_score) / 2),
            digital_maturity_score=safe_score((tech_score + seo_score) / 2),
            technical_quality_score=safe_score((sec_score + perf_score + tech_score) / 3),
            conversion_optimization_score=safe_score((ui_score + seo_score) / 2),
            evidence=evidence
        )
        
        return BusinessIntelligenceResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            scorecard=scorecard,
            opportunities=opportunities,
            lead_classification=lead_classification,
            priority_classification=priority_classification,
            recommendations=recommendations
        )
