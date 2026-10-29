import logging
from typing import Dict, Any

from app.models.sales_intelligence import (
    SalesIntelligenceResultCreate, ServiceOpportunity, ROIEstimate,
    ClientPainPoint, RecommendedPackage
)

logger = logging.getLogger(__name__)

class SalesIntelligenceService:
    def __init__(self, db):
        self.db = db

    async def compute_sales_intelligence(self, lead_id: str, website_url: str, modules_data: Dict[str, Any], on_update=None) -> SalesIntelligenceResultCreate:
        if on_update:
            await on_update("Sales Intelligence Engine", website_url, {"current_stage": "Extracting Client Pain Points"})
            
        # Extract underlying data
        seo_score = modules_data.get("seo", {}).get("scorecard", {}).get("overall_score", 100)
        perf_score = modules_data.get("performance", {}).get("scorecard", {}).get("overall_desktop_score", 100)
        ui_score = modules_data.get("ui_ux", {}).get("scorecard", {}).get("overall_ui_score", 100)
        sec_score = modules_data.get("security", {}).get("scorecard", {}).get("overall_security_score", 100)
        acc_score = modules_data.get("security", {}).get("scorecard", {}).get("accessibility_score", 100)
        
        contacts = modules_data.get("contacts", {}).get("contacts", [])
        has_whatsapp = any(c.get("type") == "WhatsApp" for c in contacts)
        has_phone = any(c.get("type") == "Phone" for c in contacts)
        
        tech_list = [t.get("name", "").lower() for t in modules_data.get("tech", {}).get("technologies", [])]
        is_wordpress = any("wordpress" in t for t in tech_list)
        has_analytics = any("google analytics" in t or "gtm" in t for t in tech_list)

        pain_points = []
        services = []
        packages = []
        
        # 1. Performance & Core Web Vitals
        if perf_score < 60:
            pain_points.append(ClientPainPoint(category="Performance", issue="Slow Website", severity="Critical"))
            services.append(ServiceOpportunity(
                service_name="Core Web Vitals Optimization",
                opportunity_score=100 - perf_score,
                confidence_score=95,
                business_impact="High",
                technical_justification=f"Lighthouse Performance score is critically low ({perf_score}/100), violating Google's CWV metrics.",
                commercial_justification="Slow websites abandon carts and bounce visitors. Fixing speed directly increases conversions.",
                expected_outcome="Sub-2 second load times and passing Core Web Vitals."
            ))
            
            if is_wordpress:
                services.append(ServiceOpportunity(
                    service_name="Hosting Migration",
                    opportunity_score=80,
                    confidence_score=85,
                    business_impact="Medium",
                    technical_justification="WordPress detected running on a slow origin server.",
                    commercial_justification="Migrating to a managed, edge-cached server instantly boosts speed.",
                    expected_outcome="High-availability hosting with global CDN caching."
                ))

        # 2. UI/UX & Redesign
        if ui_score < 70:
            pain_points.append(ClientPainPoint(category="Design", issue="Outdated Design", severity="High"))
            services.append(ServiceOpportunity(
                service_name="Website Redesign",
                opportunity_score=100 - ui_score,
                confidence_score=90,
                business_impact="Critical",
                technical_justification="DOM structural heuristics indicate poor visual hierarchy and tiny touch targets.",
                commercial_justification="An outdated interface destroys brand trust. A modern redesign re-establishes authority.",
                expected_outcome="A modern, high-converting, fully responsive web presence."
            ))

        # 3. SEO Services
        if seo_score < 70:
            pain_points.append(ClientPainPoint(category="Marketing", issue="Weak SEO", severity="High"))
            services.append(ServiceOpportunity(
                service_name="Technical SEO",
                opportunity_score=100 - seo_score,
                confidence_score=90,
                business_impact="High",
                technical_justification=f"On-page metadata and schema validations failed (Score: {seo_score}/100).",
                commercial_justification="Invisible to Google means invisible to customers. Fixing SEO brings free, recurring traffic.",
                expected_outcome="Higher SERP rankings and increased organic traffic."
            ))

        # 4. Automation & Conversions
        if not has_whatsapp and has_phone:
            pain_points.append(ClientPainPoint(category="Conversion", issue="Missing WhatsApp Chat", severity="Medium"))
            services.append(ServiceOpportunity(
                service_name="WhatsApp Automation",
                opportunity_score=90,
                confidence_score=95,
                business_impact="High",
                technical_justification="Phone numbers exist in the DOM but no WhatsApp click-to-chat API links are present.",
                commercial_justification="Customers prefer WhatsApp over calling. Adding automated chat instantly captures lost leads.",
                expected_outcome="Instant lead capture via automated WhatsApp funnels."
            ))
            
        if not has_analytics:
            pain_points.append(ClientPainPoint(category="Analytics", issue="No Analytics", severity="High"))
            services.append(ServiceOpportunity(
                service_name="Analytics Setup",
                opportunity_score=100,
                confidence_score=99,
                business_impact="Medium",
                technical_justification="No Google Analytics or Tag Manager snippets detected in the `<head>`.",
                commercial_justification="You can't grow what you can't measure. Analytics setup is a mandatory foundational step.",
                expected_outcome="Full visibility into traffic, sources, and conversion rates."
            ))

        # 5. Security & Accessibility
        if sec_score < 80:
            pain_points.append(ClientPainPoint(category="Security", issue="Weak Security", severity="Critical"))
            services.append(ServiceOpportunity(
                service_name="Security Hardening",
                opportunity_score=100 - sec_score,
                confidence_score=95,
                business_impact="Critical",
                technical_justification="Missing critical HTTP security headers or secure cookie flags.",
                commercial_justification="A hacked website destroys businesses and invites GDPR fines. Hardening is non-negotiable.",
                expected_outcome="Enterprise-grade server and DOM security layers."
            ))
            
        if acc_score < 80:
            pain_points.append(ClientPainPoint(category="Compliance", issue="Poor Accessibility", severity="Medium"))
            services.append(ServiceOpportunity(
                service_name="Accessibility Improvements",
                opportunity_score=100 - acc_score,
                confidence_score=90,
                business_impact="Medium",
                technical_justification="Failed WCAG checks (missing ARIA, labels, or alt text).",
                commercial_justification="Inaccessible websites lose 20% of audiences and invite ADA/WCAG compliance lawsuits.",
                expected_outcome="Full WCAG 2.1 compliance."
            ))

        # ROI Engine
        if on_update:
            await on_update("Sales Intelligence Engine", website_url, {"current_stage": "Calculating ROI & Packages"})
            
        total_opp_score = sum(s.opportunity_score for s in services)
        expected_roi = 50 + (total_opp_score * 0.5) if services else 10
        
        roi_estimate = ROIEstimate(
            expected_roi_percentage=min(1000, int(expected_roi)),
            business_growth_potential="Exponential" if len(services) > 4 else "Steady",
            lead_generation_improvement="High" if ui_score < 70 or not has_whatsapp else "Low",
            conversion_improvement="High" if perf_score < 60 else "Low",
            maintenance_savings="High" if is_wordpress else "Low"
        )
        
        # Package Engine
        if len(services) > 4:
            packages.append(RecommendedPackage(
                package_name="Complete Digital Transformation",
                services_included=[s.service_name for s in services],
                priority="Critical",
                reason="The website fails across Performance, SEO, Security, and UI metrics.",
                business_value="Total overhaul of digital presence leading to maximum ROI."
            ))
        elif any(s.service_name == "Technical SEO" for s in services) and any(s.service_name == "Core Web Vitals Optimization" for s in services):
            packages.append(RecommendedPackage(
                package_name="SEO & Performance Package",
                services_included=["Technical SEO", "Core Web Vitals Optimization", "Analytics Setup"],
                priority="High",
                reason="Google heavily penalizes slow sites. Fixing both yields compounded organic growth.",
                business_value="Massive boost in Google SERP rankings and organic traffic."
            ))

        return SalesIntelligenceResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            service_opportunities=services,
            roi_estimate=roi_estimate,
            client_pain_points=pain_points,
            recommended_packages=packages
        )
