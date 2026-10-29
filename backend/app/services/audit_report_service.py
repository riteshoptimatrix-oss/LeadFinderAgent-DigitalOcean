"""
Audit Report Service
====================
Builds a comprehensive, structured "Enterprise Website Audit Report"
from the enriched Lead document. It is purely a read-side aggregation —
no writes are performed.
"""

import logging
from typing import Any, Dict, List, Optional

from app.services.safe_scoring import safe_score, safe_int

logger = logging.getLogger(__name__)


class AuditReportService:
    def __init__(self):
        pass

    def _score_from(self, sub_doc: Any, *keys: str) -> Optional[int]:
        if not isinstance(sub_doc, dict):
            return None
        for key in keys:
            val = sub_doc.get(key)
            if val is not None:
                try:
                    return safe_score(val)
                except Exception:
                    continue
        return None

    def build_report(self, lead: Dict[str, Any]) -> Dict[str, Any]:
        ai = lead.get("ai_analysis") or {}
        website_info = lead.get("website_information") or {}
        structure = lead.get("website_structure") or {}
        contacts = lead.get("contact_discovery") or {}
        tech = lead.get("technology_detection") or {}
        seo = lead.get("seo") or {}
        perf = lead.get("performance") or {}
        design = lead.get("design") or {}
        business = lead.get("business") or {}
        social_meta = lead.get("social_media") or {}
        social_analysis = lead.get("social_media_analysis") or {}
        mobile = lead.get("mobile") or {}
        content = lead.get("content") or {}
        lead_intel = lead.get("lead_intelligence") or {}
        sales_opp = lead.get("sales_opportunity") or {}

        scores = {
            "overall": safe_score(
                business.get("overall_score")
                or ai.get("overall_score")
                or ai.get("overall_ai_score")
            ),
            "seo": self._score_from(seo, "seo_score") or safe_score(ai.get("seo_score")),
            "performance": self._score_from(perf, "performance_score", "pagespeed") or safe_score(ai.get("performance_score")),
            "ui": self._score_from(design, "ui_score") or safe_score(ai.get("ui_score")),
            "ux": self._score_from(design, "ux_score") or safe_score(ai.get("ux_score")),
            "security": self._score_from(design, "security_score") or safe_score(ai.get("security_score")),
            "accessibility": self._score_from(design, "accessibility_score") or safe_score(ai.get("accessibility_score")),
            "mobile": self._score_from(mobile, "overall_mobile_score") or self._score_from(design, "mobile_score") or safe_score(ai.get("mobile_score")),
            "social": self._score_from(social_analysis, "overall_social_score") or safe_score(ai.get("social_media_score")),
            "content": self._score_from(content, "overall_content_score") or safe_score(ai.get("content_score")),
            "business_opportunity": self._score_from(business, "business_opportunity") or safe_score(ai.get("business_opportunity")),
            "lead_intelligence": self._score_from(lead_intel, "lead_score") or safe_score(ai.get("lead_intelligence_score")),
            "sales_opportunity": self._score_from(sales_opp, "opportunity_score") or safe_score(ai.get("sales_opportunity_score")),
        }

        cwv = {
            "fcp": perf.get("fcp"),
            "lcp": perf.get("lcp"),
            "cls": perf.get("cls"),
            "ttfb": perf.get("ttfb"),
            "tbt": perf.get("tbt"),
        }

        social_profiles = {}
        if isinstance(social_meta, dict):
            for k, v in social_meta.items():
                if v and k not in ("model_config",):
                    social_profiles[k] = v
        if isinstance(social_analysis, dict):
            for profile in social_analysis.get("profiles") or []:
                if isinstance(profile, dict) and profile.get("platform") and profile.get("url"):
                    social_profiles[profile["platform"]] = profile["url"]

        module_summaries = {
            "seo": self._module_summary(
                scores["seo"],
                seo,
                "SEO",
                ["seo_score", "titles", "meta_description", "schema_markup", "broken_internal_links"],
            ),
            "performance": self._module_summary(
                scores["performance"], perf, "Performance", ["performance_score", "pagespeed", "fcp", "lcp", "cls"]
            ),
            "ui_ux": self._module_summary(
                max(scores["ui"], scores["ux"]), design, "UI/UX", ["ui_score", "ux_score", "mobile_score", "desktop_score"]
            ),
            "security": self._module_summary(
                scores["security"], design, "Security", ["security_score", "accessibility_score"]
            ),
            "social": self._module_summary(scores["social"], social_analysis, "Social Media", ["overall_social_score", "presence_score"]),
            "mobile": self._module_summary(scores["mobile"], mobile, "Mobile", ["overall_mobile_score", "viewport_score", "responsive_score"]),
            "content": self._module_summary(scores["content"], content, "Content", ["overall_content_score", "depth_score", "engagement_score"]),
        }

        # Prioritized recommendations, ordered by weakest score
        recommendations: List[Dict[str, Any]] = []
        rec_map = {
            "seo": ("SEO Improvement", "Improve on-page SEO, metadata and internal linking"),
            "performance": ("Performance Optimization", "Improve Core Web Vitals and page speed"),
            "security": ("Security Hardening", "Add missing security headers and HTTPS enforcement"),
            "ui_ux": ("Website Redesign", "Modernize UI/UX for better conversions"),
            "mobile": ("Mobile Optimization", "Fix viewport and responsive layout issues"),
            "content": ("Content Strategy", "Add depth, structure and CTAs to pages"),
            "social": ("Social Presence", "Link profiles on all major social platforms"),
        }
        ordered = sorted(rec_map.items(), key=lambda kv: scores.get(kv[0], 0))
        for key, (title, action) in ordered:
            if scores.get(key, 0) < 70:
                recommendations.append({
                    "priority": "High" if scores.get(key, 0) < 40 else "Medium",
                    "category": key.replace("_", " ").title(),
                    "title": title,
                    "action": action,
                    "current_score": scores.get(key, 0),
                })

        return {
            "lead_id": str(lead.get("_id")),
            "business_name": lead.get("name") or lead.get("business_name"),
            "website": lead.get("website") or website_info.get("website_url"),
            "domain": website_info.get("domain") or ai.get("domain"),
            "analysis_status": ai.get("analysis_status"),
            "analysis_version": ai.get("analysis_version"),
            "analysis_started_at": ai.get("analysis_started_at"),
            "analysis_completed_at": ai.get("analysis_completed_at"),
            "analysis_duration": ai.get("analysis_duration"),
            "last_analysis_date": ai.get("last_analysis_date"),
            "analysis_count": ai.get("analysis_count", 0),
            "summary": {
                "overall_score": scores["overall"],
                "module_scores": scores,
                "web_vitals": cwv,
                "pages_crawled": structure.get("total_pages"),
                "broken_links": structure.get("broken_links"),
                "emails_found": len(ai.get("emails") or []) or len(contacts.get("all_emails") or []),
                "phones_found": len(ai.get("phones") or []) or len(contacts.get("secondary_phones") or []) + (1 if contacts.get("primary_phone") else 0),
                "social_profiles_detected": len(social_profiles),
                "technology_stack": {
                    "cms": tech.get("cms"),
                    "frontend": tech.get("frontend_framework") or tech.get("javascript_framework"),
                    "backend": tech.get("backend_framework"),
                    "hosting": tech.get("hosting"),
                    "cdn": tech.get("cdn"),
                    "analytics": tech.get("analytics"),
                },
            },
            "module_summaries": module_summaries,
            "website_information": website_info,
            "website_structure": structure,
            "contact_discovery": contacts,
            "technology_detection": tech,
            "seo": seo,
            "performance": perf,
            "design": design,
            "business": business,
            "social_media": {"profiles": social_profiles},
            "social_media_analysis": social_analysis,
            "mobile": mobile,
            "content": content,
            "lead_intelligence": lead_intel,
            "sales_opportunity": sales_opp,
            "top_issues": (ai.get("top_seo_issues") or [])[:5] + (ai.get("top_ui_issues") or [])[:3],
            "recommendations": recommendations[:8],
            "next_steps": (
                sales_opp.get("next_best_action")
                or (recommendations[0]["action"] if recommendations else None)
                or "Reach out with tailored proposal"
            ),
        }

    def _module_summary(self, score: int, sub_doc: Dict[str, Any], label: str, keys: List[str]) -> Dict[str, Any]:
        status = "Excellent" if score >= 80 else ("Good" if score >= 60 else ("Fair" if score >= 40 else "Poor"))
        return {
            "label": label,
            "score": safe_score(score),
            "status": status,
            "details": {k: sub_doc.get(k) for k in keys if sub_doc.get(k) is not None},
        }


audit_report_service = AuditReportService()
