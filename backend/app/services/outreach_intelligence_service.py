import logging
from typing import Dict, Any
from urllib.parse import urlparse

from app.models.outreach_intelligence import (
    OutreachIntelligenceResultCreate, ExecutiveSummary, EmailSequence,
    WhatsAppCampaign, Quotation, LineItem, ProposalDocument
)

logger = logging.getLogger(__name__)

class OutreachIntelligenceService:
    def __init__(self, db):
        self.db = db
        self.price_book = {
            "Core Web Vitals Optimization": {"hours": 15, "cost": 1500},
            "Website Redesign": {"hours": 40, "cost": 4500},
            "Technical SEO": {"hours": 20, "cost": 2000},
            "WhatsApp Automation": {"hours": 5, "cost": 500},
            "Analytics Setup": {"hours": 3, "cost": 300},
            "Security Hardening": {"hours": 10, "cost": 1200},
            "Accessibility Improvements": {"hours": 15, "cost": 1500},
            "Hosting Migration": {"hours": 8, "cost": 800}
        }

    async def generate_outreach(self, lead_id: str, website_url: str, modules_data: Dict[str, Any], on_update=None) -> OutreachIntelligenceResultCreate:
        if on_update:
            await on_update("Outreach Intelligence", website_url, {"current_stage": "Synthesizing Executive Summary"})
            
        domain = urlparse(website_url).netloc.replace('www.', '')
        business_name = domain.split('.')[0].capitalize()
        
        # --- Extract Final Intelligence ---
        bi_data = modules_data.get("business_intelligence", {})
        master_score = bi_data.get("scorecard", {}).get("overall_website_score", 0)
        opp_score = bi_data.get("scorecard", {}).get("business_opportunity_score", 0)
        lead_priority = bi_data.get("lead_classification", "Cold Lead")
        
        sales_data = modules_data.get("sales_intelligence", {})
        services = sales_data.get("service_opportunities", [])
        packages = sales_data.get("recommended_packages", [])
        pain_points = sales_data.get("client_pain_points", [])
        
        # 1. Executive Summary
        top_weaknesses = [p["issue"] for p in pain_points[:3]]
        top_opportunities = [s["service_name"] for s in services[:3]]
        
        exec_summary = ExecutiveSummary(
            business_name=business_name,
            website=website_url,
            industry="Digital Business", # Would be classified by AI in v2
            overall_website_score=master_score,
            business_opportunity_score=opp_score,
            lead_priority=lead_priority,
            top_strengths=["Functional Domain", "Existing Market Presence"] if master_score > 30 else ["Active Domain"],
            top_weaknesses=top_weaknesses if top_weaknesses else ["Minor optimizations needed"],
            top_risks=["Competitor Outranking", "Lost Mobile Conversions"] if opp_score > 70 else ["Slow organic growth"],
            top_opportunities=top_opportunities if top_opportunities else ["General Maintenance"]
        )
        
        # 2. Email Sequence Generation
        if on_update:
            await on_update("Outreach Intelligence", website_url, {"current_stage": "Generating Dynamic Email Sequences"})
            
        primary_issue = top_weaknesses[0] if top_weaknesses else "optimization"
        primary_fix = top_opportunities[0] if top_opportunities else "digital upgrade"
        
        emails = EmailSequence(
            initial_cold_email_subject=f"Question about {domain}'s {primary_issue.lower()}",
            initial_cold_email_body=f"Hi Team,\n\nI was browsing {domain} and noticed a critical issue with your {primary_issue.lower()}. Based on our audit, this is actively costing you conversions.\n\nWe specialize in {primary_fix}. Are you open to a quick 5-min chat this week to see how we can fix this?\n\nBest,\nLead Finder Agent",
            followup_1_subject=f"Re: Question about {domain}'s {primary_issue.lower()}",
            followup_1_body=f"Hi Team,\n\nJust bumping this up. Fixing the {primary_issue.lower()} on {domain} can yield immediate ROI. I have a technical audit report ready for you. Let me know if you want me to send it over.\n\nBest,\nLead Finder Agent",
            followup_2_subject=f"Quick idea for {business_name}",
            followup_2_body=f"Hi again,\n\nIf you implement {primary_fix}, our models predict a strong increase in your conversion rates. Have you guys considered this for Q3?\n\nThanks,\nLead Finder Agent",
            final_followup_subject=f"Final follow-up regarding {domain}",
            final_followup_body=f"Hi Team,\n\nI won't keep bugging you. If you ever want to resolve the {primary_issue.lower()} and scale {business_name}, you have my contact info.\n\nCheers,\nLead Finder Agent"
        )
        
        # 3. WhatsApp Campaign Generation
        if on_update:
            await on_update("Outreach Intelligence", website_url, {"current_stage": "Generating WhatsApp Templates"})
            
        whatsapp = WhatsAppCampaign(
            short_version=f"Hi! Found a quick issue with {domain}'s {primary_issue.lower()}. Can I send over a free audit?",
            medium_version=f"Hey team at {business_name}! We ran an automated audit on {domain} and found it's losing traffic due to {primary_issue.lower()}. We can fix this with {primary_fix}. Open to a quick chat?",
            long_version=f"Hello {business_name} team,\n\nI'm reaching out because our systems flagged {domain} for {primary_issue.lower()}.\nOur agency specializes in {primary_fix}, and we believe this is severely impacting your ROI.\n\nWould you be open to reviewing a free technical proposal we built for you?",
            friendly_version=f"Hey! Love the business model at {business_name}. I did notice a small {primary_issue.lower()} issue on the site though! Let me know if you want the report :)",
            professional_version=f"Hello. We have compiled a technical audit of {domain} regarding its {primary_issue.lower()}. Please advise if you are the correct person to review this.",
            executive_version=f"To the Founder of {business_name}: Your {primary_issue.lower()} is bottlenecking revenue. We provide {primary_fix} to resolve this. Are you available Tuesday?",
            followup_version=f"Hey! Just following up on the {primary_issue.lower()} report for {domain}. Did you have a chance to look?",
            reminder_version=f"Quick reminder that the {primary_fix} offer for {domain} is still on the table. Let's chat!"
        )
        
        # 4. Quotation Math
        if on_update:
            await on_update("Outreach Intelligence", website_url, {"current_stage": "Calculating Quotations & Scope"})
            
        quotations = []
        for pkg in packages:
            line_items = []
            total_cost = 0
            for s_name in pkg["services_included"]:
                pricing = self.price_book.get(s_name, {"hours": 10, "cost": 1000})
                line_items.append(LineItem(
                    service_name=s_name,
                    estimated_hours=pricing["hours"],
                    estimated_cost=pricing["cost"]
                ))
                total_cost += pricing["cost"]
                
            quotations.append(Quotation(
                recommended_package=pkg["package_name"],
                line_items=line_items,
                total_estimated_cost=total_cost,
                priority=pkg["priority"]
            ))
            
        # 5. Proposal
        proposal = ProposalDocument(
            project_overview=f"Comprehensive digital upgrade for {domain} focusing on {primary_fix}.",
            problems_identified=top_weaknesses,
            recommended_solution=f"Implementation of {primary_fix} alongside core system upgrades.",
            scope_of_work=[s["service_name"] for s in services] if services else ["General Audit"],
            expected_benefits=["Increased Conversion Rate", "Higher SERP Ranking", "Improved Brand Trust"],
            deliverables=["Technical Audit", "Implementation", "30-Day Monitoring"],
            timeline_weeks=4 if total_cost > 3000 else 2,
            support_maintenance="30 days post-launch warranty."
        )

        return OutreachIntelligenceResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            executive_summary=exec_summary,
            email_sequence=emails,
            whatsapp_campaign=whatsapp,
            quotations=quotations,
            proposal=proposal
        )
