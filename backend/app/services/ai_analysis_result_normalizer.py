from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from app.core.logger import logger
from app.services.safe_scoring import safe_score, safe_float, safe_int, safe_get, safe_list, safe_dict, safe_bool
from app.services.contact_deduplication import (
    compute_metrics,
    deduplicate_contacts,
    deduplicate_emails,
    deduplicate_phones,
    log_contacts_metrics,
)


class AIAnalysisResultNormalizer:
    """Normalizes raw AI analysis outputs into the canonical Lead ai_analysis payload."""

    def normalize(
        self,
        *,
        started_at: datetime,
        completed_at: datetime,
        website_url: str = "",
        crawl_result: Optional[Dict[str, Any]] = None,
        contact_result: Optional[Any] = None,
        tech_result: Optional[Any] = None,
        seo_result: Optional[Any] = None,
        perf_result: Optional[Any] = None,
        uiux_result: Optional[Any] = None,
        security_result: Optional[Any] = None,
        bi_result: Optional[Any] = None,
        social_result: Optional[Any] = None,
        mobile_result: Optional[Any] = None,
        content_result: Optional[Any] = None,
        opportunity_result: Optional[Any] = None,
        overall_score: Optional[int] = None,
        seo_score: Optional[int] = None,
        perf_score: Optional[int] = None,
        ui_score: Optional[int] = None,
        ux_score: Optional[int] = None,
        sec_score: Optional[int] = None,
        acc_score: Optional[int] = None,
        prev_count: int = 0,
        analysis_version: str = "2.0",
        status: str = "COMPLETED",
    ) -> Dict[str, Any]:
        logger.info(
            "[AI Analysis] Normalizing analysis results",
            extra={"event": "analysis_normalization", "status": status, "website": website_url},
        )

        crawl_data = self._to_dict(crawl_result)
        contact_data = self._to_dict(contact_result)
        tech_data = self._to_dict(tech_result)
        seo_data = self._to_dict(seo_result)
        perf_data = self._to_dict(perf_result)
        uiux_data = self._to_dict(uiux_result)
        security_data = self._to_dict(security_result)
        bi_data = self._to_dict(bi_result)
        social_data = self._to_dict(social_result)
        mobile_data = self._to_dict(mobile_result)
        content_data = self._to_dict(content_result)
        opportunity_data = self._to_dict(opportunity_result)

        metrics = crawl_data.get("metrics") or {}
        pages = crawl_data.get("pages") or []
        links = crawl_data.get("links") or []
        scorecard = seo_data.get("scorecard") or {}
        perf_scorecard = perf_data.get("scorecard") or {}
        uiux_scorecard = uiux_data.get("scorecard") or {}
        security_scorecard = security_data.get("scorecard") or {}
        bi_scorecard = bi_data.get("scorecard") or {}
        social_scorecard = social_data.get("scorecard") or {}
        mobile_scorecard = mobile_data.get("scorecard") or {}
        content_scorecard = content_data.get("scorecard") or {}
        opportunity_intel = opportunity_data.get("lead_intelligence") or {}
        opportunity_sales = opportunity_data.get("sales_opportunity") or {}

        overall = overall_score
        if overall is None:
            overall = int(
                (seo_score or 0) * 0.3
                + (perf_score or 0) * 0.25
                + (ui_score or 0) * 0.2
                + (ux_score or 0) * 0.15
                + (sec_score or 0) * 0.1
            )

        normalized = {
            "analysis_status": status,
            "analysis_started_at": started_at,
            "analysis_completed_at": completed_at,
            "analysis_version": analysis_version,
            "analysis_duration": round((completed_at - started_at).total_seconds(), 2),
            "last_analysis_date": completed_at,
            "analysis_count": prev_count + 1,
            "website_url": website_url,
            "domain": self._extract_domain(website_url),
            "overall_score": int(overall or 0),
            "website_score": self._derive_website_score(website_url, crawl_data, overall),
            "seo_score": int(seo_score or scorecard.get("overall_score") or 0),
            "performance_score": int(perf_score or perf_scorecard.get("overall_mobile_score") or perf_scorecard.get("overall_desktop_score") or perf_scorecard.get("overall_score") or 0),
            "ui_score": int(ui_score or uiux_scorecard.get("overall_ui_score") or uiux_scorecard.get("ui_score") or 0),
            "ux_score": int(ux_score or uiux_scorecard.get("overall_ux_score") or uiux_scorecard.get("ux_score") or 0),
            "accessibility_score": int(acc_score or security_scorecard.get("accessibility_score") or 0),
            "security_score": int(sec_score or security_scorecard.get("overall_security_score") or security_scorecard.get("security_score") or 0),
            "business_opportunity": self._coerce_int(
                bi_scorecard.get("business_opportunity_score")
                or bi_data.get("business_opportunity_score")
                or bi_data.get("business_opportunity")
                or bi_data.get("lead_classification")
            ),
            "mobile_score": int(mobile_scorecard.get("overall_mobile_score") or 0),
            "social_media_score": int(social_scorecard.get("overall_social_score") or 0),
            "content_score": int(content_scorecard.get("overall_content_score") or 0),
            "lead_intelligence_score": self._coerce_int(opportunity_intel.get("lead_score")),
            "sales_opportunity_score": self._coerce_int(opportunity_sales.get("opportunity_score")),
            "cms": self._pick_technology(tech_data, "CMS"),
            "frontend": self._pick_technology(tech_data, "Frontend Framework") or self._pick_technology(tech_data, "JavaScript Framework") or self._pick_technology(tech_data, "CSS Framework"),
            "backend": self._pick_technology(tech_data, "Backend Framework") or self._pick_technology(tech_data, "Programming Language"),
            "hosting": self._pick_technology(tech_data, "Hosting"),
            "cdn": self._pick_technology(tech_data, "CDN"),
            "analytics": self._pick_technology(tech_data, "Analytics"),
            "websiteTechnologies": tech_data.get("websiteTechnologies") or [],
            "pages": int(crawl_data.get("pages_crawled") or len(pages) or 0),
            "internal_links": self._count_internal_links(links),
            "broken_links": self._coerce_int(metrics.get("broken_links") or metrics.get("broken_links_count") or crawl_data.get("broken_links") or 0),
            "robots": self._normalize_bool(
                metrics.get("has_robots_txt")
                or crawl_data.get("has_robots_txt")
                or scorecard.get("has_robots_txt")
                or scorecard.get("has_robots")
            ),
            "sitemap": self._normalize_bool(
                metrics.get("has_sitemap")
                or crawl_data.get("has_sitemap")
                or scorecard.get("has_sitemap")
            ),
            "response_time": self._coerce_float(metrics.get("avg_response_time") or metrics.get("response_time") or crawl_data.get("response_time") or 0.0),
            "ssl": bool(website_url and website_url.startswith("https://")),
            "recommendations": self._build_recommendations(
                website_url=website_url,
                seo_data=seo_data,
                uiux_data=uiux_data,
                security_data=security_data,
                perf_data=perf_data,
                bi_data=bi_data,
            ),
            "top_seo_issues": self._extract_issue_titles(seo_data.get("issues") or [], prefix="SEO"),
            "top_ui_issues": self._extract_issue_titles(uiux_data.get("issues") or [], prefix="UI"),
            "top_ux_issues": self._extract_issue_titles(uiux_data.get("issues") or [], prefix="UX"),
            "performance_suggestions": self._extract_suggestions(perf_data.get("suggestions") or perf_data.get("issues") or []),
            "security_suggestions": self._extract_suggestions(security_data.get("suggestions") or security_data.get("issues") or []),
            "accessibility_suggestions": self._extract_suggestions(security_data.get("accessibility_suggestions") or security_data.get("suggestions") or []),
            "social_links": self._extract_social_links(contact_data),
            "emails": self._extract_contact_values(contact_data, "Email"),
            "phones": self._extract_contact_values(contact_data, "Phone"),
            "addresses": self._extract_contact_values(contact_data, "Address"),
            "google_maps": contact_data.get("google_maps") or contact_data.get("google_map_url") or None,
            "contacts": self._normalize_contacts(contact_data),
        }

        validated = self._validate_payload(normalized, default_country=contact_data.get("country"))

        # Uniqueness metrics for the final emails/phones/contacts payload.
        raw_emails = self._raw_contact_values(contact_data, "Email")
        raw_phones = self._raw_contact_values(contact_data, "Phone")
        metrics = compute_metrics(
            raw_emails,
            validated.get("emails") or [],
            raw_phones,
            validated.get("phones") or [],
        )
        validated["emails_found"] = metrics.emails_found
        validated["unique_emails"] = metrics.unique_emails
        validated["duplicate_emails_removed"] = metrics.duplicate_emails_removed
        validated["phones_found"] = metrics.phones_found
        validated["unique_phones"] = metrics.unique_phones
        validated["duplicate_phones_removed"] = metrics.duplicate_phones_removed
        log_contacts_metrics(metrics, context="ai_normalizer")

        logger.info(
            f"[AI Analysis] ✓ Analysis payload normalized\n"
            f"  Overall Score: {validated.get('overall_score')}\n"
            f"  SEO Score: {validated.get('seo_score')}\n"
            f"  Performance Score: {validated.get('performance_score')}\n"
            f"  UI Score: {validated.get('ui_score')}\n"
            f"  UX Score: {validated.get('ux_score')}\n"
            f"  Security Score: {validated.get('security_score')}\n"
            f"  Accessibility Score: {validated.get('accessibility_score')}\n"
            f"  Business Opportunity: {validated.get('business_opportunity')}\n"
            f"  Mobile Score: {validated.get('mobile_score')}\n"
            f"  Social Media Score: {validated.get('social_media_score')}\n"
            f"  Content Score: {validated.get('content_score')}\n"
            f"  Lead Intelligence Score: {validated.get('lead_intelligence_score')}\n"
            f"  Sales Opportunity Score: {validated.get('sales_opportunity_score')}\n"
            f"  CMS: {validated.get('cms')}\n"
            f"  Frontend: {validated.get('frontend')}\n"
            f"  Backend: {validated.get('backend')}\n"
            f"  Hosting: {validated.get('hosting')}\n"
            f"  Pages: {validated.get('pages')}\n"
            f"  Internal Links: {validated.get('internal_links')}\n"
            f"  Broken Links: {validated.get('broken_links')}\n"
            f"  Robots: {validated.get('robots')}\n"
            f"  Sitemap: {validated.get('sitemap')}\n"
            f"  SSL: {validated.get('ssl')}\n"
            f"  Recommendations: {len(validated.get('recommendations', []))}\n"
            f"  Top SEO Issues: {len(validated.get('top_seo_issues', []))}\n"
            f"  Top UI Issues: {len(validated.get('top_ui_issues', []))}\n"
            f"  Top UX Issues: {len(validated.get('top_ux_issues', []))}\n"
            f"  Emails: {len(validated.get('emails', []))}\n"
            f"  Phones: {len(validated.get('phones', []))}\n"
            f"  Analysis Status: {validated.get('analysis_status')}\n"
            f"  Analysis Version: {validated.get('analysis_version')}\n"
            f"  Duration: {validated.get('analysis_duration')}s"
        )
        return validated

    def _validate_payload(self, payload: Dict[str, Any], default_country: Any = None) -> Dict[str, Any]:
        validated = dict(payload)
        validated["overall_score"] = safe_score(validated.get("overall_score"))
        validated["website_score"] = safe_score(validated.get("website_score"))
        validated["seo_score"] = safe_score(validated.get("seo_score"))
        validated["performance_score"] = safe_score(validated.get("performance_score"))
        validated["ui_score"] = safe_score(validated.get("ui_score"))
        validated["ux_score"] = safe_score(validated.get("ux_score"))
        validated["accessibility_score"] = safe_score(validated.get("accessibility_score"))
        validated["security_score"] = safe_score(validated.get("security_score"))
        validated["business_opportunity"] = safe_score(validated.get("business_opportunity"))
        validated["mobile_score"] = safe_score(validated.get("mobile_score"))
        validated["social_media_score"] = safe_score(validated.get("social_media_score"))
        validated["content_score"] = safe_score(validated.get("content_score"))
        validated["lead_intelligence_score"] = safe_score(validated.get("lead_intelligence_score"))
        validated["sales_opportunity_score"] = safe_score(validated.get("sales_opportunity_score"))
        validated["pages"] = safe_int(validated.get("pages"))
        validated["internal_links"] = safe_int(validated.get("internal_links"))
        validated["broken_links"] = safe_int(validated.get("broken_links"))
        validated["response_time"] = safe_float(validated.get("response_time"))
        validated["recommendations"] = self._flatten_to_strings(safe_list(validated.get("recommendations")))
        validated["top_seo_issues"] = [str(item) for item in safe_list(validated.get("top_seo_issues")) if item]
        validated["top_ui_issues"] = [str(item) for item in safe_list(validated.get("top_ui_issues")) if item]
        validated["top_ux_issues"] = [str(item) for item in safe_list(validated.get("top_ux_issues")) if item]
        validated["performance_suggestions"] = [str(item) for item in safe_list(validated.get("performance_suggestions")) if item]
        validated["security_suggestions"] = [str(item) for item in safe_list(validated.get("security_suggestions")) if item]
        validated["accessibility_suggestions"] = [str(item) for item in safe_list(validated.get("accessibility_suggestions")) if item]
        validated["emails"], _ = deduplicate_emails(
            [str(item) for item in safe_list(validated.get("emails")) if item]
        )
        validated["phones"], _ = deduplicate_phones(
            [str(item) for item in safe_list(validated.get("phones")) if item],
            default_country=default_country,
        )
        validated["addresses"] = list(dict.fromkeys([str(item) for item in safe_list(validated.get("addresses")) if item]))
        validated["social_links"] = {str(k): str(v) for k, v in safe_dict(validated.get("social_links")).items() if v}
        validated["contacts"] = deduplicate_contacts(
            [item for item in safe_list(validated.get("contacts")) if item],
            default_country=default_country,
        )
        validated["overall_ai_score"] = validated["overall_score"]
        return validated

    def _to_dict(self, value: Any) -> Dict[str, Any]:
        if value is None:
            return {}
        if hasattr(value, "model_dump"):
            return value.model_dump()
        if hasattr(value, "dict"):
            return value.dict()
        if isinstance(value, dict):
            return value
        return {}

    def _extract_domain(self, website_url: str) -> Optional[str]:
        if not website_url:
            return None
        try:
            return urlparse(website_url).netloc or urlparse(website_url).path
        except Exception:
            return None

    def _derive_website_score(self, website_url: str, crawl_data: Dict[str, Any], overall_score: Optional[int]) -> int:
        if not website_url:
            return 0
        score = 40
        if website_url.startswith("https://"):
            score += 25
        if "." in website_url:
            score += 15
        if any(tld in website_url for tld in [".com", ".net", ".org", ".io"]):
            score += 5
        if crawl_data.get("pages"):
            score += 5
        return int(min(100, max(0, score if overall_score is None else min(100, max(score, int(overall_score) - 10)))))

    def _pick_technology(self, tech_data: Dict[str, Any], category: str) -> Optional[str]:
        technologies = tech_data.get("technologies") or []
        matches = []
        for tech in technologies:
            if isinstance(tech, dict):
                if tech.get("category") == category:
                    name = tech.get("name")
                    if name: matches.append(name)
            elif getattr(tech, "category", None) == category:
                name = getattr(tech, "name", None)
                if name: matches.append(name)
        return ", ".join(matches) if matches else None

    def _count_internal_links(self, links: List[Dict[str, Any]]) -> int:
        return sum(1 for item in links if isinstance(item, dict) and item.get("is_internal"))

    def _normalize_bool(self, value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        return bool(value)

    def _coerce_int(self, value: Any) -> int:
        if value is None or value == "":
            return 0
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0

    def _coerce_float(self, value: Any) -> float:
        if value is None or value == "":
            return 0.0
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def _build_recommendations(self, *, website_url: str, seo_data: Dict[str, Any], uiux_data: Dict[str, Any], security_data: Dict[str, Any], perf_data: Dict[str, Any], bi_data: Dict[str, Any]) -> List[Any]:
        # Prefer the newly generated recommendation objects from BI phase
        if bi_data.get("recommendations"):
            return bi_data["recommendations"]
            
        # Fallback to string heuristics if not available
        recommendations: List[str] = []
        if not website_url:
            recommendations.append("Create or improve website presence")
        if not website_url.startswith("https://"):
            recommendations.append("Enable HTTPS and secure the site")
        if seo_data.get("issues"):
            recommendations.append("Address SEO issues found during analysis")
        if uiux_data.get("issues"):
            recommendations.append("Improve UI/UX structure and clarity")
        if security_data.get("issues"):
            recommendations.append("Strengthen security and accessibility")
        if perf_data.get("issues"):
            recommendations.append("Improve performance and page speed")
        if bi_data.get("lead_classification"):
            recommendations.append(f"Prioritize {bi_data.get('lead_classification')} lead outreach")
        return recommendations[:6]

    @staticmethod
    def _flatten_to_strings(items: List[Any]) -> List[str]:
        """Coerce each item to a flat recommendation string, extracting text from dicts."""
        result: List[str] = []
        for item in items:
            if item is None:
                continue
            if isinstance(item, str):
                result.append(item)
            elif isinstance(item, dict):
                text = (
                    item.get("recommendation")
                    or item.get("description")
                    or item.get("action")
                    or item.get("issue")
                    or item.get("summary")
                    or item.get("text")
                    or item.get("suggestion")
                    or item.get("title")
                    or item.get("name")
                )
                if text:
                    result.append(str(text))
            else:
                result.append(str(item))
        return result

    def _extract_issue_titles(self, issues: List[Any], prefix: str) -> List[str]:
        titles: List[str] = []
        for issue in issues:
            if isinstance(issue, dict):
                title = issue.get("issue") or issue.get("title") or issue.get("name")
                if title:
                    titles.append(f"{prefix}: {title}")
            else:
                title = str(issue)
                if title:
                    titles.append(f"{prefix}: {title}")
        return titles[:5]

    def _extract_suggestions(self, values: List[Any]) -> List[str]:
        suggestions: List[str] = []
        for value in values:
            if isinstance(value, dict):
                suggestion = value.get("suggestion") or value.get("title") or value.get("name") or value.get("issue")
            else:
                suggestion = str(value)
            if suggestion:
                suggestions.append(str(suggestion))
        return suggestions[:5]

    def _extract_social_links(self, contact_data: Dict[str, Any]) -> Dict[str, str]:
        social_links: Dict[str, str] = {}

        # 1. Try top-level keys first (e.g. from ContactDiscoveryService output)
        for key in ["linkedin", "facebook", "instagram", "twitter", "youtube", "threads", "telegram", "github"]:
            value = contact_data.get(key)
            if value:
                social_links[key] = str(value)

        # 2. Also scan the contacts list for entries whose type matches a social network
        _SOCIAL_TYPE_MAP: Dict[str, str] = {
            "linkedin":  "linkedin",
            "facebook":  "facebook",
            "instagram": "instagram",
            "twitter":   "twitter",
            "youtube":   "youtube",
            "threads":   "threads",
            "telegram":  "telegram",
            "github":    "github",
            "pinterest": "pinterest",
            "medium":    "medium",
            "tiktok":    "tiktok",
            "googlemaps": "google_maps",
            "google maps": "google_maps",
            "whatsapp":  "whatsapp",
        }
        for contact in contact_data.get("contacts") or []:
            if isinstance(contact, dict):
                ctype = str(contact.get("type") or "").lower()
                cval  = contact.get("value")
            else:
                ctype = str(getattr(contact, "type", "") or "").lower()
                cval  = getattr(contact, "value", None)
            key = _SOCIAL_TYPE_MAP.get(ctype)
            if key and cval and key not in social_links:
                social_links[key] = str(cval)

        return social_links

    def _extract_contact_values(self, contact_data: Dict[str, Any], value_type: str) -> List[str]:
        contacts = contact_data.get("contacts") or []
        values: List[str] = []
        for contact in contacts:
            if isinstance(contact, dict) and contact.get("type") == value_type and contact.get("value"):
                values.append(str(contact.get("value")))
            elif hasattr(contact, "type") and getattr(contact, "type", None) == value_type and getattr(contact, "value", None):
                values.append(str(getattr(contact, "value")))
        return list(dict.fromkeys(values))

    @staticmethod
    def _raw_contact_values(contact_data: Dict[str, Any], value_type: str) -> List[str]:
        """All raw values of a contact type, before any dedup (for metrics)."""
        contacts = contact_data.get("contacts") or []
        values: List[str] = []
        for contact in contacts:
            if isinstance(contact, dict) and contact.get("type") == value_type and contact.get("value"):
                values.append(str(contact.get("value")))
            elif hasattr(contact, "type") and getattr(contact, "type", None) == value_type and getattr(contact, "value", None):
                values.append(str(getattr(contact, "value")))
        return values

    def _normalize_contacts(self, contact_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        contacts = contact_data.get("contacts") or []
        normalized: List[Dict[str, Any]] = []
        for contact in contacts:
            if isinstance(contact, dict):
                normalized.append(
                    {
                        "type": contact.get("type"),
                        "value": contact.get("value"),
                        "classification": contact.get("classification"),
                        "source_url": contact.get("source_url"),
                    }
                )
            elif hasattr(contact, "type"):
                normalized.append(
                    {
                        "type": getattr(contact, "type", None),
                        "value": getattr(contact, "value", None),
                        "classification": getattr(contact, "classification", None),
                        "source_url": getattr(contact, "source_url", None),
                    }
                )
        return normalized


analysis_result_normalizer = AIAnalysisResultNormalizer()
