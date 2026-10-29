"""
Analysis Result Mapper
======================
Translates raw outputs from each analysis service into the canonical
Lead sub-document structure defined in `app/models/lead.py`.

This is the translation layer between:
  AnalysisService outputs  →  Lead.sub_document fields

Usage:
    mapper = AnalysisResultMapper()
    wi = mapper.map_crawl_result(crawl_result)
    cd = mapper.map_contact_result(contact_result)
    ...
    enrichment.website_information = wi
    enrichment.contact_discovery = cd
"""

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from app.services.lead_enrichment_service import LeadEnrichmentData
from app.services.contact_deduplication import (
    compute_metrics,
    deduplicate_contacts,
    log_contacts_metrics,
    normalize_email,
    normalize_phone,
)

logger = logging.getLogger(__name__)


class AnalysisResultMapper:
    """
    Maps raw analysis service results into Lead sub-document dicts.

    Every method returns a plain dict that maps 1:1 with the
    corresponding Pydantic model in `app/models/lead.py`.
    Returns only the fields that were actually extracted — no null padding.
    """

    # ── Crawl / Website ───────────────────────────────────────────────────

    def map_crawl_result(
        self,
        crawl_result: Dict[str, Any],
        website_url: str,
    ) -> Dict[str, Any]:
        """
        Maps CrawlEngine output → WebsiteInformation + WebsiteStructure dicts.
        Returns a tuple: (website_information_dict, website_structure_dict)
        """
        pass  # implemented below as two methods

    def map_website_information(
        self,
        crawl_result: Dict[str, Any],
        website_url: str,
    ) -> Dict[str, Any]:
        """Maps crawl result → Lead.website_information sub-document."""
        info: Dict[str, Any] = {}

        final_url = crawl_result.get("website") or website_url
        if final_url:
            info["website_url"] = website_url
            info["final_url"] = final_url

            parsed = urlparse(final_url)
            info["domain"] = parsed.netloc or parsed.path.split("/")[0]
            info["https"] = final_url.startswith("https://")
            info["ssl"] = final_url.startswith("https://")

        metrics = crawl_result.get("metrics") or {}
        pages = crawl_result.get("pages") or []

        # HTTP status from the first page
        if pages:
            first_page = pages[0]
            status = first_page.get("status_code") or first_page.get("http_status")
            if status:
                info["http_status"] = int(status)

            # Server header
            headers = first_page.get("headers") or {}
            if isinstance(headers, dict):
                server = headers.get("server") or headers.get("Server")
                if server:
                    info["server"] = str(server)

        # Response time
        rt = metrics.get("avg_response_time") or metrics.get("response_time")
        if rt is not None:
            info["response_time"] = float(rt)

        # Robots / Sitemap / Favicon
        info["robots_txt"] = bool(metrics.get("has_robots_txt", crawl_result.get("has_robots_txt")))
        info["sitemap"] = bool(metrics.get("has_sitemap", crawl_result.get("has_sitemap")))
        info["favicon"] = bool(metrics.get("has_favicon", crawl_result.get("has_favicon")))

        # Language / Country
        lang = metrics.get("language") or crawl_result.get("language")
        if lang:
            info["language"] = str(lang)
        country = metrics.get("country") or crawl_result.get("country")
        if country:
            info["country"] = str(country)

        return info

    def map_website_structure(
        self,
        crawl_result: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Maps crawl result → Lead.website_structure sub-document."""
        structure: Dict[str, Any] = {}

        metrics = crawl_result.get("metrics") or {}
        pages = crawl_result.get("pages") or []
        links = crawl_result.get("links") or []

        pages_crawled = (
            metrics.get("pages_crawled")
            or crawl_result.get("pages_crawled")
            or len(pages)
        )
        if pages_crawled is not None:
            structure["total_pages"] = int(pages_crawled)
            structure["internal_pages"] = int(pages_crawled)

        ext_links = (
            metrics.get("external_links")
            or metrics.get("external_links_count")
            or len([l for l in links if not l.get("is_internal", True)])
        )
        if ext_links is not None:
            structure["external_links"] = int(ext_links)

        nav_depth = metrics.get("max_depth") or metrics.get("navigation_depth") or crawl_result.get("max_depth")
        if nav_depth is not None:
            structure["navigation_depth"] = int(nav_depth)

        broken = metrics.get("broken_links") or metrics.get("broken_links_count") or crawl_result.get("broken_links", 0)
        structure["broken_links"] = int(broken)

        redirects = metrics.get("redirects") or metrics.get("redirects_count") or crawl_result.get("redirects", 0)
        structure["redirects"] = int(redirects)

        canonical_count = metrics.get("canonical_urls") or len(
            [p for p in pages if p.get("canonical_url")]
        )
        if canonical_count is not None:
            structure["canonical_urls"] = int(canonical_count)

        # Crawl graph (node-edge representation for visualization)
        crawl_graph = crawl_result.get("crawl_graph")
        if not crawl_graph and pages:
            # Build a compact graph from pages
            crawl_graph = {
                "nodes": [{"url": p.get("url", ""), "depth": p.get("depth", 0)} for p in pages[:50]],
                "total_nodes": len(pages),
                "total_edges": len(links),
            }
        if crawl_graph:
            structure["crawl_graph"] = crawl_graph

        return structure

    # ── Contact Discovery ─────────────────────────────────────────────────

    def map_contact_result(
        self,
        contact_result: Any,
        default_country: Any = None,
    ) -> Dict[str, Any]:
        """
        Maps ContactDiscoveryResult → Lead.contact_discovery sub-document.

        Handles both:
          - ContactDiscoveryResult objects (from contact_discovery_service)
          - Raw dicts (from advanced_analysis_worker)

        Every email/phone is normalized (E.164 when a country hint is known)
        and deduplicated in a single pass; uniqueness metrics are stored on
        the returned dict so they persist to the Lead document.
        """
        cd: Dict[str, Any] = {}

        # Normalise to dict
        if hasattr(contact_result, "model_dump"):
            data = contact_result.model_dump()
        elif hasattr(contact_result, "dict"):
            data = contact_result.dict()
        elif isinstance(contact_result, dict):
            data = contact_result
        else:
            logger.warning("[Mapper] Unknown contact_result type — skipping")
            return cd

        if default_country is None:
            default_country = data.get("country")

        contacts = data.get("contacts") or []

        # ── Email Classification ─────────────────────────────────
        all_emails: List[str] = []
        primary_email: Optional[str] = None
        support_email: Optional[str] = None
        sales_email: Optional[str] = None
        hr_email: Optional[str] = None
        marketing_email: Optional[str] = None
        secondary_emails: List[str] = []
        raw_emails: List[str] = []
        seen_emails = set()

        for c in contacts:
            if isinstance(c, dict):
                ctype = c.get("type", "")
                cval = c.get("value", "")
                classification = (c.get("classification") or "").lower()
            else:
                ctype = getattr(c, "type", "")
                cval = getattr(c, "value", "")
                classification = (getattr(c, "classification", "") or "").lower()

            if ctype != "Email" or not cval:
                continue

            raw_emails.append(cval)
            norm = normalize_email(cval)
            if not norm:
                continue
            if norm in seen_emails:
                continue
            seen_emails.add(norm)
            cval = norm
            cval_lower = cval.lower()
            all_emails.append(cval)

            if not primary_email:
                primary_email = cval
            elif "support" in classification or "support" in cval_lower:
                support_email = support_email or cval
            elif "sales" in classification or "sales" in cval_lower:
                sales_email = sales_email or cval
            elif "hr" in classification or "career" in classification or "hr@" in cval_lower or "career" in cval_lower:
                hr_email = hr_email or cval
            elif "marketing" in classification or "marketing" in cval_lower:
                marketing_email = marketing_email or cval
            elif cval != primary_email:
                secondary_emails.append(cval)

        # Prefer result-level primary if available
        result_email = data.get("primary_email")
        if result_email:
            primary_email = normalize_email(result_email) or result_email

        if primary_email:
            cd["primary_email"] = primary_email
        if secondary_emails:
            cd["secondary_emails"] = list(dict.fromkeys(secondary_emails))
        if support_email:
            cd["support_email"] = support_email
        if sales_email:
            cd["sales_email"] = sales_email
        if hr_email:
            cd["hr_email"] = hr_email
        if marketing_email:
            cd["marketing_email"] = marketing_email
        if all_emails:
            cd["all_emails"] = list(dict.fromkeys(all_emails))

        # ── Phone Classification ─────────────────────────────────
        all_phones: List[str] = []
        primary_phone: Optional[str] = None
        secondary_phones: List[str] = []
        whatsapp_numbers: List[str] = []
        raw_phones: List[str] = []
        seen_phones = set()

        for c in contacts:
            if isinstance(c, dict):
                ctype = c.get("type", "")
                cval = c.get("value", "")
            else:
                ctype = getattr(c, "type", "")
                cval = getattr(c, "value", "")

            if ctype == "Phone" and cval:
                raw_phones.append(cval)
                norm = normalize_phone(cval, default_country=default_country)
                if not norm or norm in seen_phones:
                    continue
                seen_phones.add(norm)
                cval = norm
                if not primary_phone:
                    primary_phone = cval
                else:
                    secondary_phones.append(cval)
                all_phones.append(cval)
            elif ctype == "WhatsApp" and cval:
                norm = normalize_phone(cval, default_country=default_country)
                if norm:
                    whatsapp_numbers.append(norm)
                    raw_phones.append(cval)
                    if norm not in seen_phones:
                        seen_phones.add(norm)

        result_phone = data.get("primary_phone")
        if result_phone:
            primary_phone = normalize_phone(result_phone, default_country=default_country) or result_phone

        if primary_phone:
            cd["primary_phone"] = primary_phone
        if secondary_phones:
            cd["secondary_phones"] = list(dict.fromkeys(secondary_phones))
        if whatsapp_numbers:
            cd["whatsapp_numbers"] = list(dict.fromkeys(whatsapp_numbers))

        # ── Contact Pages & Forms ────────────────────────────────
        contact_pages = data.get("contact_pages") or [
            c.get("source_url") if isinstance(c, dict) else getattr(c, "source_url", None)
            for c in contacts
            if (c.get("page_type") == "contact" if isinstance(c, dict) else getattr(c, "page_type", None) == "contact")
        ]
        if contact_pages:
            cd["contact_pages"] = list(dict.fromkeys(filter(None, contact_pages)))

        # ── Address ─────────────────────────────────────────────
        for c in contacts:
            ctype = c.get("type", "") if isinstance(c, dict) else getattr(c, "type", "")
            cval = c.get("value", "") if isinstance(c, dict) else getattr(c, "value", "")
            if ctype == "Address" and cval:
                cd["office_address"] = cval
                break

        # ── Uniqueness metrics + [CONTACTS] log ─────────────────
        metrics = compute_metrics(raw_emails, all_emails, raw_phones, all_phones)
        cd["emails_found"] = metrics.emails_found
        cd["unique_emails"] = metrics.unique_emails
        cd["duplicate_emails_removed"] = metrics.duplicate_emails_removed
        cd["phones_found"] = metrics.phones_found
        cd["unique_phones"] = metrics.unique_phones
        cd["duplicate_phones_removed"] = metrics.duplicate_phones_removed
        log_contacts_metrics(metrics, context="mapper")

        return cd

    def map_social_media(self, contact_result: Any) -> Dict[str, Any]:
        """
        Maps social media contacts → Lead.social_media sub-document.
        """
        sm: Dict[str, Any] = {}

        if hasattr(contact_result, "model_dump"):
            data = contact_result.model_dump()
        elif hasattr(contact_result, "dict"):
            data = contact_result.dict()
        elif isinstance(contact_result, dict):
            data = contact_result
        else:
            return sm

        contacts = data.get("contacts") or []

        SOCIAL_MAP = {
            "LinkedIn": "linkedin",
            "Twitter": "twitter",
            "Facebook": "facebook",
            "Instagram": "instagram",
            "YouTube": "youtube",
            "Threads": "threads",
            "Telegram": "telegram",
            "GitHub": "github",
            "Github": "github",
            "Pinterest": "pinterest",
            "Medium": "medium",
            "TikTok": "tiktok",
            "GoogleMaps": "google_maps",
            "Google Maps": "google_maps",
        }

        for c in contacts:
            if isinstance(c, dict):
                ctype = c.get("type", "")
                cval = c.get("value", "")
            else:
                ctype = getattr(c, "type", "")
                cval = getattr(c, "value", "")

            field = SOCIAL_MAP.get(ctype)
            if field and cval and field not in sm:
                sm[field] = cval

        # Also check result-level social fields (from old contact_discovery_service)
        for social_key, lead_key in [
            ("social_linkedin", "linkedin"),
            ("social_twitter", "twitter"),
            ("social_facebook", "facebook"),
            ("social_instagram", "instagram"),
        ]:
            val = data.get(social_key)
            if val and lead_key not in sm:
                sm[lead_key] = val

        return sm

    # ── Technology Detection ──────────────────────────────────────────────

    def map_tech_result(self, tech_result: Any) -> Dict[str, Any]:
        """Maps TechnologyDetectionResult → Lead.technology_detection sub-document."""
        td: Dict[str, Any] = {}

        if hasattr(tech_result, "model_dump"):
            data = tech_result.model_dump()
        elif hasattr(tech_result, "dict"):
            data = tech_result.dict()
        elif isinstance(tech_result, dict):
            data = tech_result
        else:
            return td

        technologies = data.get("technologies") or []

        CATEGORY_MAP = {
            "Frontend Framework": "frontend_framework",
            "JavaScript Framework": "javascript_framework",
            "JavaScript Library": "javascript_framework",
            "CSS Framework": "css_framework",
            "UI Library": "ui_library",
            "Fonts": "fonts",
            "Backend Framework": "backend_framework",
            "CMS": "cms",
            "E-Commerce": "cms",  # Shopify/WooCommerce → cms
            "Hosting": "hosting",
            "Cloud Provider": "cloud_provider",
            "Deployment Platform": "deployment_platform",
            "CDN": "cdn",
            "Analytics": "analytics",
            "Marketing Tools": "marketing_tools",
            "Chat Widget": "chat_widget",
            "Payment Gateway": "payment_gateway",
            "Server": "server_stack",
            "Programming Language": "backend_framework",
            "Database": "database",
            "Build Tool": "build_tool",
            "Security": "security_headers",
            "SEO Tools": "seo_tools",
            "PWA": "pwa",
            "Other": "other",
        }

        for tech in technologies:
            if isinstance(tech, dict):
                category = tech.get("category", "")
                name = tech.get("name", "")
            else:
                category = getattr(tech, "category", "")
                name = getattr(tech, "name", "")

            field = CATEGORY_MAP.get(category)
            if field and name and field not in td:
                td[field] = name

        # Preserve the full per-technology details and the spec-aligned
        # websiteTechnologies representation for reports / UI consumers.
        if technologies:
            td["technologies"] = [t if isinstance(t, dict) else t.model_dump() for t in technologies]
        website_technologies = data.get("websiteTechnologies")
        if website_technologies:
            td["websiteTechnologies"] = website_technologies
        insights = data.get("insights")
        if insights:
            td["insights"] = insights

        return td

    # ── SEO Analysis ──────────────────────────────────────────────────────

    def map_seo_result(self, seo_result: Any) -> Dict[str, Any]:
        """Maps SeoAnalysisResult → Lead.seo sub-document."""
        seo: Dict[str, Any] = {}

        if hasattr(seo_result, "model_dump"):
            data = seo_result.model_dump()
        elif hasattr(seo_result, "dict"):
            data = seo_result.dict()
        elif isinstance(seo_result, dict):
            data = seo_result
        else:
            return seo

        scorecard = data.get("scorecard") or {}

        overall = scorecard.get("overall_score") or scorecard.get("seo_score")
        if overall is not None:
            seo["seo_score"] = int(overall)

        # Page-level signals from scorecard
        seo["titles"] = bool(scorecard.get("has_title_tags", True))
        seo["meta_description"] = bool(scorecard.get("has_meta_descriptions", True))
        seo["headings"] = bool(scorecard.get("has_proper_headings", True))
        seo["schema_markup"] = bool(scorecard.get("has_schema_markup", False))
        seo["open_graph"] = bool(scorecard.get("has_open_graph", False))
        seo["twitter_cards"] = bool(scorecard.get("has_twitter_cards", False))
        seo["robots"] = bool(scorecard.get("has_robots_txt", False))
        seo["sitemap"] = bool(scorecard.get("has_sitemap", False))

        # Issue counts
        issues = data.get("issues") or []
        seo["images_without_alt"] = sum(
            1 for i in issues
            if isinstance(i, dict) and "alt" in str(i.get("issue", "")).lower()
        )
        seo["duplicate_titles"] = sum(
            1 for i in issues
            if isinstance(i, dict) and "duplicate title" in str(i.get("issue", "")).lower()
        )
        seo["duplicate_meta"] = sum(
            1 for i in issues
            if isinstance(i, dict) and "duplicate meta" in str(i.get("issue", "")).lower()
        )
        seo["broken_internal_links"] = int(scorecard.get("broken_links_count", 0))

        return seo

    # ── Performance Analysis ──────────────────────────────────────────────

    def map_performance_result(self, perf_result: Any) -> Dict[str, Any]:
        """Maps PerformanceAnalysisResult → Lead.performance sub-document."""
        perf: Dict[str, Any] = {}

        if hasattr(perf_result, "model_dump"):
            data = perf_result.model_dump()
        elif hasattr(perf_result, "dict"):
            data = perf_result.dict()
        elif isinstance(perf_result, dict):
            data = perf_result
        else:
            return perf

        scorecard = data.get("scorecard") or {}

        overall = (
            scorecard.get("overall_desktop_score")
            or scorecard.get("overall_mobile_score")
            or scorecard.get("overall_score")
            or scorecard.get("performance_score")
        )
        if overall is not None:
            perf["performance_score"] = int(overall)

        # PageSpeed score (mobile)
        pagespeed = scorecard.get("overall_mobile_score") or scorecard.get("pagespeed")
        if pagespeed is not None:
            perf["pagespeed"] = int(pagespeed)

        # Core Web Vitals — from nested cwv or scorecard
        cwv = data.get("core_web_vitals") or scorecard.get("core_web_vitals") or {}
        if isinstance(cwv, dict):
            fcp = cwv.get("fcp_ms") or cwv.get("fcp")
            if fcp is not None:
                perf["fcp"] = float(fcp) / 1000 if float(fcp) > 100 else float(fcp)
            lcp = cwv.get("lcp_ms") or cwv.get("lcp")
            if lcp is not None:
                perf["lcp"] = float(lcp) / 1000 if float(lcp) > 100 else float(lcp)
            cls = cwv.get("cls_score") or cwv.get("cls")
            if cls is not None:
                perf["cls"] = float(cls)
            ttfb = cwv.get("ttfb_ms") or cwv.get("ttfb")
            if ttfb is not None:
                perf["ttfb"] = float(ttfb) / 1000 if float(ttfb) > 100 else float(ttfb)
            tbt = cwv.get("tbt_ms") or cwv.get("tbt")
            if tbt is not None:
                perf["tbt"] = float(tbt) / 1000 if float(tbt) > 100 else float(tbt)
        si = scorecard.get("speed_index")
        if si is not None:
            perf["speed_index"] = float(si)

        return perf

    def map_performance_audit(self, audit_result: Any) -> Dict[str, Any]:
        """Maps a PerformanceAuditResult → Lead.performanceAudit sub-document.

        The audit model uses camelCase field names, so model_dump() already
        matches the spec's DB shape. The mapped dict is stored verbatim so the
        AI Analysis API response can return it unchanged.
        """
        audit: Dict[str, Any] = {}

        if hasattr(audit_result, "model_dump"):
            data = audit_result.model_dump()
        elif hasattr(audit_result, "dict"):
            data = audit_result.dict()
        elif isinstance(audit_result, dict):
            data = audit_result
        else:
            return audit

        if not isinstance(data, dict):
            return audit

        # Exclude storage-only / metadata keys that are not part of the spec.
        for key in ("id", "_id", "lead_id", "website_url", "user_id", "created_at"):
            data.pop(key, None)

        for key in (
            "overallScore",
            "grade",
            "coreWebVitals",
            "websiteSpeed",
            "images",
            "javascript",
            "css",
            "fonts",
            "compression",
            "cache",
            "cdn",
            "resources",
            "mobile",
            "desktop",
            "hosting",
            "thirdParty",
            "recommendations",
            "auditTime",
        ):
            if data.get(key) is not None:
                audit[key] = data[key]

        return audit

    def map_security_audit(self, audit_result: Any) -> Dict[str, Any]:
        """Maps a SecurityAuditResult → Lead.securityAudit sub-document.

        The audit model uses camelCase field names, so model_dump() already
        matches the spec's DB shape. The mapped dict is stored verbatim so the
        AI Analysis API response can return it unchanged.
        """
        audit: Dict[str, Any] = {}

        if hasattr(audit_result, "model_dump"):
            data = audit_result.model_dump()
        elif hasattr(audit_result, "dict"):
            data = audit_result.dict()
        elif isinstance(audit_result, dict):
            data = audit_result
        else:
            return audit

        if not isinstance(data, dict):
            return audit

        # Exclude storage-only / metadata keys that are not part of the spec.
        for key in ("id", "_id", "lead_id", "website_url", "user_id", "created_at"):
            data.pop(key, None)

        for key in (
            "overallScore",
            "grade",
            "ssl",
            "headers",
            "cookies",
            "server",
            "forms",
            "content",
            "authentication",
            "domain",
            "recommendations",
            "auditTime",
        ):
            if data.get(key) is not None:
                audit[key] = data[key]

        return audit

    def map_seo_audit(self, audit_result: Any) -> Dict[str, Any]:
        """Maps a SEOAuditResultCreate → Lead.seoAudit sub-document.

        The audit model uses camelCase field names and exposes the schema
        module under the `schema` alias (the Python field is `schema_markup`
        to avoid shadowing BaseModel), so `model_dump(by_alias=True)` matches
        the spec's DB shape. The mapped dict is stored verbatim so the AI
        Analysis API response can return it unchanged.
        """
        audit: Dict[str, Any] = {}

        if hasattr(audit_result, "model_dump"):
            data = audit_result.model_dump(mode="json", by_alias=True)
        elif hasattr(audit_result, "dict"):
            data = audit_result.dict()
        elif isinstance(audit_result, dict):
            data = audit_result
        else:
            return audit

        if not isinstance(data, dict):
            return audit

        # Exclude storage-only / metadata keys that are not part of the spec.
        for key in ("id", "_id", "lead_id", "website_url", "user_id", "created_at"):
            data.pop(key, None)

        for key in (
            "overallScore",
            "grade",
            "overallStatus",
            "overallColor",
            "meta",
            "headings",
            "images",
            "urls",
            "indexability",
            "openGraph",
            "twitterCards",
            "schema",
            "internalLinks",
            "externalLinks",
            "content",
            "mobile",
            "pages",
            "localSEO",
            "socialSEO",
            "favicon",
            "issues",
            "recommendations",
            "auditTime",
        ):
            if data.get(key) is not None:
                audit[key] = data[key]

        return audit

    def map_uiux_audit(self, audit_result: Any) -> Dict[str, Any]:
        """Maps a UIUXAuditResultCreate → Lead.uiuxAudit sub-document.

        The audit model uses camelCase field names, so model_dump() already
        matches the spec's DB shape. The mapped dict is stored verbatim so the
        AI Analysis API response can return it unchanged.
        """
        audit: Dict[str, Any] = {}

        if hasattr(audit_result, "model_dump"):
            data = audit_result.model_dump()
        elif hasattr(audit_result, "dict"):
            data = audit_result.dict()
        elif isinstance(audit_result, dict):
            data = audit_result
        else:
            return audit

        if not isinstance(data, dict):
            return audit

        # Exclude storage-only / metadata keys that are not part of the spec.
        for key in ("id", "_id", "lead_id", "website_url", "user_id", "created_at"):
            data.pop(key, None)

        for key in (
            "overallScore",
            "grade",
            "overallStatus",
            "overallColor",
            "visualDesign",
            "colors",
            "typography",
            "layout",
            "navigation",
            "cta",
            "responsive",
            "mobile",
            "forms",
            "ux",
            "content",
            "images",
            "icons",
            "branding",
            "accessibility",
            "modernDesign",
            "trust",
            "issues",
            "recommendations",
            "redesignOpportunity",
            "salesOpportunity",
            "auditTime",
        ):
            if data.get(key) is not None:
                audit[key] = data[key]

        return audit

    # ── Design / UI / UX / Security ──────────────────────────────────────

    def map_design_result(
        self,
        uiux_result: Any = None,
        security_result: Any = None,
        design_audit_result: Any = None,
    ) -> Dict[str, Any]:
        """
        Maps UI/UX and Security results → Lead.design sub-document.
        Any combination of results can be provided.
        """
        design: Dict[str, Any] = {}

        # ── UI/UX scores ─────────────────────────────────
        for result in [uiux_result, design_audit_result]:
            if result is None:
                continue
            if hasattr(result, "model_dump"):
                data = result.model_dump()
            elif hasattr(result, "dict"):
                data = result.dict()
            elif isinstance(result, dict):
                data = result
            else:
                continue

            scorecard = data.get("scorecard") or {}

            ui = scorecard.get("overall_ui_score") or scorecard.get("ui_score") or data.get("ui_score")
            if ui is not None and "ui_score" not in design:
                design["ui_score"] = int(ui)

            ux = scorecard.get("overall_ux_score") or scorecard.get("ux_score") or data.get("ux_score")
            if ux is not None and "ux_score" not in design:
                design["ux_score"] = int(ux)

            mobile = (
                scorecard.get("mobile_score")
                or scorecard.get("overall_mobile_score")
                or data.get("mobile_score")
            )
            if mobile is not None and "mobile_score" not in design:
                design["mobile_score"] = int(mobile)

            desktop = (
                scorecard.get("desktop_score")
                or scorecard.get("overall_desktop_score")
                or data.get("desktop_score")
            )
            if desktop is not None and "desktop_score" not in design:
                design["desktop_score"] = int(desktop)

            branding = scorecard.get("branding_score") or data.get("branding_score")
            if branding is not None and "branding_score" not in design:
                design["branding_score"] = int(branding)

        # ── Security / Accessibility ─────────────────────
        if security_result is not None:
            if hasattr(security_result, "model_dump"):
                sec_data = security_result.model_dump()
            elif hasattr(security_result, "dict"):
                sec_data = security_result.dict()
            elif isinstance(security_result, dict):
                sec_data = security_result
            else:
                sec_data = {}

            sec_scorecard = sec_data.get("scorecard") or {}

            sec_score = (
                sec_scorecard.get("overall_security_score")
                or sec_scorecard.get("security_score")
                or sec_data.get("security_score")
            )
            if sec_score is not None:
                design["security_score"] = int(sec_score)

            acc_score = (
                sec_scorecard.get("accessibility_score")
                or sec_data.get("accessibility_score")
            )
            if acc_score is not None:
                design["accessibility_score"] = int(acc_score)

        return design

    # ── Business Intelligence ─────────────────────────────────────────────

    def map_business_result(
        self,
        bi_result: Any = None,
        sales_result: Any = None,
        overall_score: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Maps BusinessIntelligenceResult + SalesIntelligenceResult
        → Lead.business sub-document.
        """
        biz: Dict[str, Any] = {}

        if overall_score is not None:
            biz["overall_score"] = int(overall_score)

        if bi_result is not None:
            if hasattr(bi_result, "model_dump"):
                bi_data = bi_result.model_dump()
            elif hasattr(bi_result, "dict"):
                bi_data = bi_result.dict()
            elif isinstance(bi_result, dict):
                bi_data = bi_result
            else:
                bi_data = {}

            bi_scorecard = bi_data.get("scorecard") or {}

            master = bi_scorecard.get("overall_website_score") or bi_data.get("overall_score")
            if master is not None:
                biz["overall_score"] = int(master)

            opp_score = bi_scorecard.get("business_opportunity_score") or bi_data.get("business_opportunity_score")
            if opp_score is not None:
                biz["business_opportunity"] = str(opp_score)

            classification = bi_data.get("lead_classification") or bi_data.get("lead_priority")
            if classification:
                biz["lead_priority"] = str(classification)

            conv_prob = bi_data.get("conversion_probability")
            if conv_prob is not None:
                biz["conversion_probability"] = float(conv_prob)

        if sales_result is not None:
            if hasattr(sales_result, "model_dump"):
                sales_data = sales_result.model_dump()
            elif hasattr(sales_result, "dict"):
                sales_data = sales_result.dict()
            elif isinstance(sales_result, dict):
                sales_data = sales_result
            else:
                sales_data = {}

            # Recommended services
            services = []
            for pkg in (sales_data.get("recommended_packages") or []):
                name = pkg.get("name") if isinstance(pkg, dict) else getattr(pkg, "name", None)
                if name:
                    services.append(str(name))
            for opp in (sales_data.get("service_opportunities") or []):
                svc = opp.get("service") if isinstance(opp, dict) else getattr(opp, "service", None)
                if svc and svc not in services:
                    services.append(str(svc))
            if services:
                biz["recommended_services"] = services[:8]  # cap at 8

            # Estimated project value
            for key in ("estimated_value", "estimated_project_value", "total_value"):
                val = sales_data.get(key)
                if val is not None:
                    try:
                        biz["estimated_project_value"] = float(str(val).replace("$", "").replace(",", "").split("-")[0].strip())
                    except (ValueError, AttributeError):
                        pass
                    break

        return biz

    # ── New Modules: Social, Mobile, Content, Lead Opportunity ────────────

    def map_social_media_analysis(self, social_result: Any) -> Dict[str, Any]:
        """Maps SocialMediaAnalysisResult → Lead.social_media_analysis sub-document."""
        out: Dict[str, Any] = {}

        if hasattr(social_result, "model_dump"):
            data = social_result.model_dump()
        elif hasattr(social_result, "dict"):
            data = social_result.dict()
        elif isinstance(social_result, dict):
            data = social_result
        else:
            return out

        scorecard = data.get("scorecard") or {}
        overall = scorecard.get("overall_social_score") or data.get("overall_social_score")
        if overall is not None:
            out["overall_social_score"] = int(overall)
        presence = scorecard.get("presence_score") or data.get("presence_score")
        if presence is not None:
            out["presence_score"] = int(presence)

        profiles = data.get("profiles") or []
        profile_map: Dict[str, str] = {}
        for p in profiles:
            if isinstance(p, dict):
                platform, url = p.get("platform"), p.get("url")
            else:
                platform, url = getattr(p, "platform", None), getattr(p, "url", None)
            if platform and url and platform not in profile_map:
                profile_map[str(platform)] = str(url)
        if profile_map:
            out["profiles"] = profile_map
            out["platforms_detected"] = len(profile_map)

        present = set(profile_map.keys())
        missing = [p for p in ("linkedin", "facebook", "instagram", "twitter", "youtube") if p not in present]
        out["missing_platforms"] = missing

        issues = data.get("issues") or []
        out["issues"] = [
            (i.get("description") if isinstance(i, dict) else str(i))
            for i in issues[:6]
        ]
        return out

    def map_tiktok_result(self, tiktok_result: Any) -> Dict[str, Any]:
        """Maps TikTokDetectionResult → Lead.tiktok sub-document.

        Always returns a dict; never raises. On any non-match it returns
        `{"found": False}` so the presence field is always persisted.
        """
        out: Dict[str, Any] = {"found": False}

        if hasattr(tiktok_result, "model_dump"):
            data = tiktok_result.model_dump()
        elif hasattr(tiktok_result, "dict"):
            data = tiktok_result.dict()
        elif isinstance(tiktok_result, dict):
            data = tiktok_result
        else:
            return out

        if not data.get("found"):
            return out

        url = data.get("url")
        username = data.get("username")
        if not url or not username:
            return out

        out["found"] = True
        out["url"] = str(url)
        out["username"] = str(username).lstrip("@")
        source = data.get("sourcePage") or data.get("source_page")
        if source:
            out["source_page"] = str(source)
        checked = data.get("lastChecked") or data.get("last_checked")
        if checked:
            out["last_checked"] = checked
        return out

    def map_mobile_result(self, mobile_result: Any) -> Dict[str, Any]:
        """Maps MobileAnalysisResult → Lead.mobile sub-document."""
        out: Dict[str, Any] = {}

        if hasattr(mobile_result, "model_dump"):
            data = mobile_result.model_dump()
        elif hasattr(mobile_result, "dict"):
            data = mobile_result.dict()
        elif isinstance(mobile_result, dict):
            data = mobile_result
        else:
            return out

        scorecard = data.get("scorecard") or {}
        for key, out_key in [
            ("overall_mobile_score", "overall_mobile_score"),
            ("viewport_score", "viewport_score"),
            ("responsive_score", "responsive_score"),
        ]:
            val = scorecard.get(key) or data.get(key)
            if val is not None:
                out[out_key] = int(val)

        metrics = data.get("page_metrics") or []
        if metrics:
            out["has_viewport"] = bool(metrics and any(m.get("has_viewport") for m in metrics if isinstance(m, dict)))
            out["media_queries"] = int(sum(m.get("media_queries", 0) for m in metrics if isinstance(m, dict)))

        issues = data.get("issues") or []
        out["issues"] = [
            (i.get("description") if isinstance(i, dict) else str(i))
            for i in issues[:6]
        ]
        return out

    def map_content_result(self, content_result: Any) -> Dict[str, Any]:
        """Maps ContentAnalysisResult → Lead.content sub-document."""
        out: Dict[str, Any] = {}

        if hasattr(content_result, "model_dump"):
            data = content_result.model_dump()
        elif hasattr(content_result, "dict"):
            data = content_result.dict()
        elif isinstance(content_result, dict):
            data = content_result
        else:
            return out

        scorecard = data.get("scorecard") or {}
        for key, out_key in [
            ("overall_content_score", "overall_content_score"),
            ("depth_score", "depth_score"),
            ("structure_score", "structure_score"),
            ("freshness_score", "freshness_score"),
            ("engagement_score", "engagement_score"),
        ]:
            val = scorecard.get(key) or data.get(key)
            if val is not None:
                out[out_key] = int(val)

        metrics = data.get("metrics") or data.get("page_metrics") or []
        if isinstance(metrics, dict):
            if metrics.get("avg_word_count") is not None:
                out["avg_word_count"] = float(metrics["avg_word_count"])
            if metrics.get("thin_pages") is not None:
                out["thin_pages"] = int(metrics["thin_pages"])
            if metrics.get("has_blog") is not None:
                out["has_blog"] = bool(metrics["has_blog"])

        issues = data.get("issues") or []
        out["issues"] = [
            (i.get("description") if isinstance(i, dict) else str(i))
            for i in issues[:6]
        ]
        return out

    def map_lead_opportunity(self, opportunity_result: Any) -> Dict[str, Any]:
        """Maps LeadOpportunityResult → (Lead.lead_intelligence, Lead.sales_opportunity)."""
        li: Dict[str, Any] = {}
        so: Dict[str, Any] = {}

        if hasattr(opportunity_result, "model_dump"):
            data = opportunity_result.model_dump()
        elif hasattr(opportunity_result, "dict"):
            data = opportunity_result.dict()
        elif isinstance(opportunity_result, dict):
            data = opportunity_result
        else:
            return {}, {}

        intel = data.get("lead_intelligence") or {}
        if isinstance(intel, dict):
            for key, out_key in [
                ("lead_score", "lead_score"),
                ("lead_quality", "lead_quality"),
                ("lead_category", "lead_category"),
                ("purchasing_power", "purchasing_power"),
                ("decision_maker", "decision_maker"),
                ("summary", "summary"),
            ]:
                if intel.get(key) is not None:
                    li[out_key] = intel[key]
            signals = intel.get("signals") or []
            if signals:
                li["signals"] = [str(s) for s in signals[:8]]

        opp = data.get("sales_opportunity") or {}
        if isinstance(opp, dict):
            for key, out_key in [
                ("opportunity_score", "opportunity_score"),
                ("sales_ready", "sales_ready"),
                ("product_fit", "product_fit"),
                ("budget_estimate", "budget_estimate"),
                ("sales_channel", "sales_channel"),
                ("next_best_action", "next_best_action"),
            ]:
                if opp.get(key) is not None:
                    so[out_key] = opp[key]
            talking = opp.get("talking_points") or []
            if talking:
                so["talking_points"] = [str(t) for t in talking[:6]]

        return li, so

    # ── AI Metadata ───────────────────────────────────────────────────────

    def map_ai_metadata(
        self,
        started_at: datetime,
        completed_at: datetime,
        prev_count: int = 0,
        analysis_version: str = "2.0",
        status: str = "COMPLETED",
    ) -> Dict[str, Any]:
        """Builds the ai_analysis sub-document for a completed analysis run."""
        duration = (completed_at - started_at).total_seconds()
        return {
            "analysis_status": status,
            "analysis_started_at": started_at,
            "analysis_completed_at": completed_at,
            "analysis_version": analysis_version,
            "analysis_duration": round(duration, 2),
            "last_analysis_date": completed_at,
            "analysis_count": prev_count + 1,
        }

    # ── Convenience: build full LeadEnrichmentData from all results ───────

    def build_enrichment(
        self,
        *,
        lead_id: str,
        started_at: datetime,
        completed_at: datetime,
        prev_analysis_count: int = 0,
        website_url: str = "",
        crawl_result: Optional[Dict[str, Any]] = None,
        contact_result: Any = None,
        tech_result: Any = None,
        seo_result: Any = None,
        perf_result: Any = None,
        uiux_result: Any = None,
        security_result: Any = None,
        bi_result: Any = None,
        sales_result: Any = None,
        social_result: Any = None,
        mobile_result: Any = None,
        content_result: Any = None,
        opportunity_result: Any = None,
        overall_score: Optional[int] = None,
    ) -> LeadEnrichmentData:
        """
        Convenience method that builds a complete LeadEnrichmentData
        from all available analysis results in a single call.
        """
        enrichment = LeadEnrichmentData()

        # AI metadata
        enrichment.ai_analysis = self.map_ai_metadata(
            started_at=started_at,
            completed_at=completed_at,
            prev_count=prev_analysis_count,
        )

        # Website
        if crawl_result:
            enrichment.website_information = self.map_website_information(crawl_result, website_url)
            enrichment.website_structure = self.map_website_structure(crawl_result)

        # Contacts & Social
        if contact_result:
            enrichment.contact_discovery = self.map_contact_result(contact_result)
            enrichment.social_media = self.map_social_media(contact_result)

            # Top-level lead fields (filled only if empty in existing lead)
            cd = enrichment.contact_discovery
            if cd.get("primary_email"):
                enrichment.primary_email = cd["primary_email"]
            if cd.get("primary_phone"):
                enrichment.primary_phone = cd["primary_phone"]
            if cd.get("office_address"):
                enrichment.primary_address = cd["office_address"]

        # Technology
        if tech_result:
            enrichment.technology_detection = self.map_tech_result(tech_result)

        # SEO
        if seo_result:
            enrichment.seo = self.map_seo_result(seo_result)

        # Performance
        if perf_result:
            enrichment.performance = self.map_performance_result(perf_result)

        # Design
        if uiux_result or security_result:
            enrichment.design = self.map_design_result(
                uiux_result=uiux_result,
                security_result=security_result,
            )

        # New modules
        if social_result:
            enrichment.social_media_analysis = self.map_social_media_analysis(social_result)

        if mobile_result:
            enrichment.mobile = self.map_mobile_result(mobile_result)

        if content_result:
            enrichment.content = self.map_content_result(content_result)

        if opportunity_result:
            li, so = self.map_lead_opportunity(opportunity_result)
            if li:
                enrichment.lead_intelligence = li
            if so:
                enrichment.sales_opportunity = so

        # Business
        if bi_result or sales_result or overall_score is not None:
            enrichment.business = self.map_business_result(
                bi_result=bi_result,
                sales_result=sales_result,
                overall_score=overall_score,
            )

        return enrichment


# ── Singleton ─────────────────────────────────────────────────────────────
analysis_result_mapper = AnalysisResultMapper()
