"""
Lead Opportunity Service
========================
Aggregates every analysis module's output (SEO, performance, UI/UX,
security, social, mobile, content) into a single Lead Intelligence +
Sales Opportunity verdict. Runs inside the main AI analysis pipeline
so leads get a rich qualification snapshot immediately.
"""

import logging
from typing import Dict, Any, List

from app.models.lead_opportunity import (
    LeadOpportunityResultCreate,
    LeadOpportunitySignals,
    SalesOpportunityResult,
)
from app.services.safe_scoring import safe_score, safe_int, safe_get

logger = logging.getLogger(__name__)

SALES_READY_PLATFORMS = ["whatsapp", "phone", "email"]


class LeadOpportunityService:
    def __init__(self, db=None):
        self.db = db

    def _extract_score(self, modules_data: Dict[str, Any], module: str, *keys: str, default: int = 0) -> int:
        scorecard = safe_get(modules_data, module, {}) or {}
        if isinstance(scorecard, dict) and "scorecard" in scorecard:
            scorecard = scorecard.get("scorecard") or {}
        for key in keys:
            val = scorecard.get(key)
            if val is not None:
                return safe_score(val, default)
        return default

    def _signals_from_scores(self, scores: Dict[str, int]) -> List[str]:
        signals: List[str] = []
        if scores["seo"] < 60:
            signals.append("Poor SEO visibility — strong on-page optimization opportunity")
        if scores["performance"] < 50:
            signals.append("Slow page speed — likely losing mobile conversions")
        if scores["ui_ux"] < 65:
            signals.append("Outdated design/UX — strong redesign opportunity")
        if scores["security"] < 60:
            signals.append("Weak security posture — trust and compliance risks")
        if scores["social"] < 40:
            signals.append("Limited social presence — easy channel expansion win")
        if scores["mobile"] < 60:
            signals.append("Poor mobile experience — majority of local searches are mobile")
        if scores["content"] < 55:
            signals.append("Thin or unstructured content — content marketing opportunity")
        return signals

    def compute_lead_opportunity(
        self,
        lead_id: str,
        website_url: str,
        modules_data: Dict[str, Any],
        on_update=None,
    ) -> LeadOpportunityResultCreate:
        scores = {
            "seo": self._extract_score(modules_data, "seo", "overall_score", "seo_score"),
            "performance": self._extract_score(
                modules_data, "performance",
                "overall_desktop_score", "overall_mobile_score", "overall_score", "performance_score"
            ),
            "ui_ux": self._extract_score(modules_data, "ui_ux", "overall_ui_score", "ui_score"),
            "ux": self._extract_score(modules_data, "ui_ux", "overall_ux_score", "ux_score"),
            "security": self._extract_score(modules_data, "security", "overall_security_score", "security_score"),
            "accessibility": self._extract_score(modules_data, "security", "accessibility_score"),
            "social": self._extract_score(modules_data, "social_media", "overall_social_score", "overall_score"),
            "mobile": self._extract_score(modules_data, "mobile", "overall_mobile_score", "overall_score"),
            "content": self._extract_score(modules_data, "content", "overall_content_score", "overall_score"),
            "business": self._extract_score(modules_data, "business_intelligence", "overall_website_score", "overall_score"),
        }

        signals = self._signals_from_scores(scores)

        # ── Lead Intelligence ─────────────────────────────────────────
        lead_score = safe_score(
            (scores["business"] * 0.25)
            + (scores["seo"] * 0.15)
            + (scores["performance"] * 0.1)
            + ((scores["ui_ux"] + scores["ux"]) / 2 * 0.15)
            + (scores["security"] * 0.1)
            + (scores["mobile"] * 0.1)
            + (scores["content"] * 0.075)
            + (scores["social"] * 0.075)
        )

        if lead_score >= 80:
            lead_quality = "Excellent"
        elif lead_score >= 65:
            lead_quality = "Good"
        elif lead_score >= 45:
            lead_quality = "Fair"
        else:
            lead_quality = "Poor"

        # ── Sales Opportunity ─────────────────────────────────────────
        opportunity_delta = sum(
            1 for k, v in scores.items()
            if k in ("seo", "performance", "ui_ux", "security", "mobile", "content") and v < 65
        )
        opportunity_score = safe_score(
            25 + (opportunity_delta * 12) + max(0, int(100 - scores["business"]) // 3)
        )

        # Sales readiness: derived from presence of contact channels
        contacts = safe_get(modules_data, "contacts", {}) or {}
        contact_list = contacts.get("contacts") or []
        channels = {c.get("type") if isinstance(c, dict) else getattr(c, "type", "") for c in contact_list}
        channel_hits = [c for c in SALES_READY_PLATFORMS if c.title() in channels or c in channels]

        has_email = any(("email" in str(c).lower()) for c in channels)
        has_phone = any(("phone" in str(c).lower() or "whatsapp" in str(c).lower()) for c in channels)

        if has_phone and has_email:
            sales_ready = "Yes"
        elif has_phone or has_email:
            sales_ready = "Partial"
        else:
            sales_ready = "No"

        product_fit = "High" if opportunity_score >= 70 else ("Medium" if opportunity_score >= 50 else "Low")

        if opportunity_score >= 75:
            budget_estimate = "₹50k – ₹2L"
        elif opportunity_score >= 55:
            budget_estimate = "₹20k – ₹50k"
        elif opportunity_score >= 35:
            budget_estimate = "₹5k – ₹20k"
        else:
            budget_estimate = "Unknown"

        sales_channel = "WhatsApp" if "whatsapp" in str(channels).lower() else ("Phone" if has_phone else ("Email" if has_email else "WhatsApp"))

        if sales_ready == "Yes" and opportunity_score >= 60:
            next_best_action = "Send tailored proposal with prioritized fixes"
        elif opportunity_score >= 50:
            next_best_action = "Book discovery call focused on biggest pain point"
        elif scores["content"] < 50:
            next_best_action = "Warm them with content/SEO value before pitching"
        else:
            next_best_action = "Cold outreach with a free website health report"

        talking_points: List[str] = []
        if scores["performance"] < 60:
            talking_points.append(f"Your site scores {scores['performance']}/100 on speed — visitors likely leave before buying.")
        if scores["ui_ux"] < 65:
            talking_points.append(f"Design scores {scores['ui_ux']}/100; modernizing it will raise trust and conversions.")
        if scores["seo"] < 60:
            talking_points.append(f"SEO scores {scores['seo']}/100 — you're missing free local search traffic.")
        if scores["social"] < 40:
            talking_points.append(f"Only minimal social presence detected — easy wins on LinkedIn/Instagram.")
        if not talking_points:
            talking_points.append("Your site is in good shape — we can scale what already works.")
        talking_points = talking_points[:5]

        lead_intelligence = LeadOpportunitySignals(
            lead_score=lead_score,
            lead_quality=lead_quality,
            lead_category="Local Business",
            purchasing_power="Medium" if opportunity_score >= 50 else "Low",
            decision_maker="Owner",
            summary=(
                f"{lead_quality} lead with {opportunity_delta} clear service opportunity areas "
                f"({scores['seo']}/100 SEO, {scores['performance']}/100 performance, "
                f"{scores['ui_ux']}/100 UI). Contact readiness: {sales_ready}."
            ),
            signals=signals[:8],
        )

        sales_opportunity = SalesOpportunityResult(
            opportunity_score=opportunity_score,
            sales_ready=sales_ready,
            product_fit=product_fit,
            budget_estimate=budget_estimate,
            sales_channel=sales_channel,
            next_best_action=next_best_action,
            talking_points=talking_points,
        )

        return LeadOpportunityResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            lead_intelligence=lead_intelligence,
            sales_opportunity=sales_opportunity,
            metrics={"scores": scores},
        )
