import logging
import asyncio
from typing import Dict, List, Any

from app.models.performance_analysis import (
    PerformanceAnalysisResultCreate, PerformanceScorecard, PerformanceIssue,
    CoreWebVitals, LighthouseMetrics, ServerMetrics, NetworkMetrics
)
from app.services.safe_scoring import safe_score, safe_float, safe_int, safe_get
from app.services.pagespeed_client import get_pagespeed_client

logger = logging.getLogger(__name__)

class PerformanceAnalysisService:
    """
    Performance Analysis Service with fault-tolerant PageSpeed integration.

    Uses the SHARED PageSpeed client (``get_pagespeed_client``) so that:
    - Results are cached by normalized domain and shared with the SEO analyzer.
    - Exponential backoff with full jitter handles HTTP 429 rate limits.
    - A quota-aware circuit breaker prevents cascading failures.
    - A local heuristic analyzer guarantees scores are never empty.
    - The analysis pipeline NEVER blocks on the external API.
    """

    def __init__(self):
        self.pagespeed_client = get_pagespeed_client()

    async def _fetch_pagespeed(self, url: str, strategy: str) -> Dict[str, Any]:
        """
        Fetch PageSpeed Insights data via the shared, resilient client.

        The client caches by normalized domain + strategy, so the SEO analyzer
        and this performance analyzer share the same real API call. Returns a
        fallback/heuristic payload when the API is unavailable (never raises).
        """
        return await self.pagespeed_client.get_insights(url, strategy=strategy, on_update=None)

    def _get_fallback_result(self, url: str, reason: str) -> Dict[str, Any]:
        """Backwards-compatible alias used by tests / callers."""
        return self.pagespeed_client._fallback(url, "mobile", reason)

    def _extract_metrics(self, psi_data: Dict[str, Any]) -> tuple[CoreWebVitals, LighthouseMetrics, ServerMetrics, NetworkMetrics]:
        cwv = CoreWebVitals()
        lh = LighthouseMetrics()
        srv = ServerMetrics()
        net = NetworkMetrics()
        
        if not psi_data or "lighthouseResult" not in psi_data:
            return cwv, lh, srv, net
            
        audits = psi_data["lighthouseResult"].get("audits", {})
        
        cwv.fcp_ms = float(audits.get("first-contentful-paint", {}).get("numericValue", 0))
        cwv.lcp_ms = float(audits.get("largest-contentful-paint", {}).get("numericValue", 0))
        cwv.cls_score = float(audits.get("cumulative-layout-shift", {}).get("numericValue", 0))
        cwv.ttfb_ms = float(audits.get("server-response-time", {}).get("numericValue", 0))
        cwv.inp_ms = float(audits.get("interactive", {}).get("numericValue", 0))
        
        lh.speed_index_ms = float(audits.get("speed-index", {}).get("numericValue", 0))
        lh.tti_ms = float(audits.get("interactive", {}).get("numericValue", 0))
        lh.tbt_ms = float(audits.get("total-blocking-time", {}).get("numericValue", 0))
        lh.first_meaningful_paint_ms = float(audits.get("first-meaningful-paint", {}).get("numericValue", 0))
        
        # Server metrics proxy
        srv.server_response_time_ms = cwv.ttfb_ms
        
        # Diagnostics
        diagnostics = audits.get("diagnostics", {}).get("details", {}).get("items", [])
        if diagnostics and len(diagnostics) > 0:
            diag = diagnostics[0]
            net.total_requests = int(diag.get("numRequests", 0))
            net.js_requests = int(diag.get("numScripts", 0))
            net.css_requests = int(diag.get("numStylesheets", 0))
            net.font_requests = int(diag.get("numFonts", 0))
            net.total_byte_weight = int(diag.get("totalByteWeight", 0))
            
        # Deep Network Requests Parse
        network_reqs = audits.get("network-requests", {}).get("details", {}).get("items", [])
        for req in network_reqs:
            rt = req.get("resourceType", "").lower()
            ts = int(req.get("transferSize", 0))
            if rt == "script": net.js_byte_weight += ts
            elif rt == "stylesheet": net.css_byte_weight += ts
            elif rt == "image": 
                net.image_byte_weight += ts
                net.image_requests += 1
            elif rt == "document":
                srv.http_version = req.get("protocol", "unknown")
                srv.dns_lookup_ms = float(req.get("networkRequestTime", 0)) # Proxy
                
        return cwv, lh, srv, net

    async def analyze_performance(self, lead_id: str, website_url: str, pages: List[Dict] = None, on_update=None) -> PerformanceAnalysisResultCreate:
        issues: List[PerformanceIssue] = []
        
        if on_update:
            await on_update("Performance Engine", website_url, {"current_stage": "Querying Mobile APIs"})
        mobile_data = await self._fetch_pagespeed(website_url, "mobile")
        
        if on_update:
            await on_update("Performance Engine", website_url, {"current_stage": "Querying Desktop APIs"})
        desktop_data = await self._fetch_pagespeed(website_url, "desktop")
        
        mobile_cwv, mobile_lh, mobile_srv, mobile_net = self._extract_metrics(mobile_data)
        desktop_cwv, desktop_lh, desktop_srv, desktop_net = self._extract_metrics(desktop_data)

        # Use local heuristic analyzer results directly when the API was unavailable
        # so scores are NEVER empty (Phase 1 requirement).
        if mobile_data.get("heuristic_scores"):
            mobile_score = safe_score(mobile_data["heuristic_scores"].get("performance", 0))
        else:
            mobile_score = safe_score(safe_float(mobile_data.get("lighthouseResult", {}).get("categories", {}).get("performance", {}).get("score", 0)) * 100) if mobile_data else 0

        if desktop_data.get("heuristic_scores"):
            desktop_score = safe_score(desktop_data["heuristic_scores"].get("performance", 0))
        else:
            desktop_score = safe_score(safe_float(desktop_data.get("lighthouseResult", {}).get("categories", {}).get("performance", {}).get("score", 0)) * 100) if desktop_data else 0
            
        audits = desktop_data.get("lighthouseResult", {}).get("audits", {}) if desktop_data else {}
        
        # Caching
        cache_audit = audits.get("uses-long-cache-ttl", {})
        caching_score = safe_score(safe_float(cache_audit.get("score", 0)) * 100) if cache_audit else 0
        if caching_score < 100:
            issues.append(PerformanceIssue(
                issue_type="Missing Cache Headers", problem="Static assets do not have efficient cache policies.",
                root_cause="Server is not returning Cache-Control or Expires headers.", impact="Repeat visits are slower.",
                priority="Medium", difficulty="Easy", estimated_gain="High"
            ))
            
        # JS Optimization
        js_audit = audits.get("unused-javascript", {})
        js_score = safe_score(safe_float(js_audit.get("score", 0)) * 100) if js_audit else 0
        if js_score < 100:
            issues.append(PerformanceIssue(
                issue_type="Oversized JavaScript", problem="High amount of unused JavaScript detected.",
                root_cause="Bundles are not code-split.", impact="High Total Blocking Time (TBT).",
                priority="High", difficulty="Hard", estimated_gain="Very High"
            ))
            
        # CSS Optimization
        css_audit = audits.get("unused-css-rules", {})
        css_score = safe_score(safe_float(css_audit.get("score", 0)) * 100) if css_audit else 0
        if css_score < 100:
            issues.append(PerformanceIssue(
                issue_type="Unused CSS", problem="High amount of unused CSS rules detected.",
                root_cause="Global stylesheets loaded unnecessarily.", impact="Render blocking delay.",
                priority="Medium", difficulty="Moderate", estimated_gain="Medium"
            ))
            
        # Image Optimization
        img_audit = audits.get("uses-optimized-images", {})
        webp_audit = audits.get("uses-webp-images", {})
        img_score1 = safe_score(safe_float(img_audit.get("score", 0)) * 100) if img_audit else 0
        img_score2 = safe_score(safe_float(webp_audit.get("score", 0)) * 100) if webp_audit else 0
        image_score = safe_score((img_score1 + img_score2) / 2) if img_audit and webp_audit else 100
        
        if image_score < 100:
            issues.append(PerformanceIssue(
                issue_type="Large Images", problem="Images are not compressed or modern formats (WebP).",
                root_cause="Missing server-side image optimization pipeline.", impact="Massive delays in LCP.",
                priority="High", difficulty="Easy", estimated_gain="Very High"
            ))
            
        # Server Performance
        ttfb = desktop_cwv.ttfb_ms
        server_score = 100
        if ttfb > 600:
            server_score = 50
            issues.append(PerformanceIssue(
                issue_type="Slow Server", problem=f"Time To First Byte (TTFB) is very slow ({ttfb}ms).",
                root_cause="Slow database queries or missing server caching.", impact="Delays every metric (FCP, LCP).",
                priority="High", difficulty="Moderate", estimated_gain="Very High"
            ))
        elif ttfb > 200:
            server_score = 80
            
        # Text Compression
        text_comp_audit = audits.get("uses-text-compression", {})
        if text_comp_audit and safe_score(safe_float(text_comp_audit.get("score", 0)) * 100) < 100:
            issues.append(PerformanceIssue(
                issue_type="Missing Compression", problem="Text-based resources are not compressed.",
                root_cause="GZIP or Brotli is disabled on the origin server.", impact="Increased network payload.",
                priority="High", difficulty="Easy", estimated_gain="High"
            ))
            
        # Compute fallbacks if PageSpeed APIs returned empty/limited results.
        # Also applies when the local heuristic analyzer was used.
        using_heuristic = bool(mobile_data.get("heuristic_scores") or desktop_data.get("heuristic_scores"))
        if mobile_score == 0 or desktop_score == 0 or using_heuristic:
            page_list = pages or []
            avg_load_time = 0.0
            if page_list:
                avg_load_time = sum(p.get("load_time", 0.0) for p in page_list) / len(page_list)
            
            if avg_load_time == 0:
                fallback_perf = 85
            elif avg_load_time < 0.8:
                fallback_perf = 98
            elif avg_load_time < 1.5:
                fallback_perf = 90
            elif avg_load_time < 2.5:
                fallback_perf = 80
            elif avg_load_time < 4.0:
                fallback_perf = 65
            else:
                fallback_perf = 45

            # Resource counts penalty
            res_penalty = 0
            if page_list:
                first_page = page_list[0]
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(first_page.get("rendered_html", ""), "html.parser")
                script_count = len(soup.find_all("script"))
                css_count = len(soup.find_all("link", rel="stylesheet"))
                img_count = len(soup.find_all("img"))
                res_penalty = min(25, (script_count * 0.5) + (css_count * 0.5) + (img_count * 0.2))
            
            fallback_perf = max(35, safe_score(fallback_perf - res_penalty))
            
            # Keep heuristic-derived scores when present; otherwise fill zeros.
            if mobile_score == 0:
                mobile_score = max(35, safe_score(fallback_perf * 0.95))
            if desktop_score == 0:
                desktop_score = safe_score(fallback_perf)
                
            if js_score == 0: js_score = max(40, safe_score(100 - int(res_penalty * 2)))
            if css_score == 0: css_score = max(45, safe_score(100 - int(res_penalty * 1.5)))
            if caching_score == 0: caching_score = 75
            if server_score == 100 and avg_load_time > 0:
                server_score = max(40, safe_score(100 - int(avg_load_time * 12)))
            
            # Bonus for clean pages
            if page_list:
                first_page = page_list[0]
                soup = BeautifulSoup(first_page.get("rendered_html", ""), "html.parser")
                # Check for async/defer scripts
                scripts = soup.find_all("script", src=True)
                async_scripts = sum(1 for s in scripts if s.get("async") or s.get("defer"))
                if scripts and async_scripts / len(scripts) > 0.5:
                    js_score = min(100, js_score + 10)

        # CWV Score logic
        cwv_score = 100
        if desktop_cwv.lcp_ms > 2500: cwv_score -= 30
        if desktop_cwv.cls_score > 0.1: cwv_score -= 30
        if desktop_cwv.fcp_ms > 1800: cwv_score -= 20
        cwv_score = safe_score(max(0, cwv_score))
            
        scorecard = PerformanceScorecard(
            overall_desktop_score=safe_score(desktop_score),
            overall_mobile_score=safe_score(mobile_score),
            server_score=safe_score(server_score),
            frontend_score=safe_score((js_score + css_score + image_score) / 3),
            network_score=safe_score((caching_score + server_score) / 2),
            core_web_vitals_score=safe_score(cwv_score),
            caching_score=safe_score(caching_score),
            image_optimization_score=safe_score(image_score),
            javascript_optimization_score=safe_score(js_score),
            css_optimization_score=safe_score(css_score)
        )

        return PerformanceAnalysisResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            scorecard=scorecard,
            issues=issues,
            desktop_cwv=desktop_cwv,
            mobile_cwv=mobile_cwv,
            desktop_metrics=desktop_lh,
            mobile_metrics=mobile_lh,
            server_metrics=desktop_srv,
            network_metrics=desktop_net,
            raw_desktop_psi=desktop_data,
            raw_mobile_psi=mobile_data,
            performance_status=(
                "HEURISTIC" if (mobile_data.get("heuristic_scores") or desktop_data.get("heuristic_scores"))
                else "AVAILABLE" if (mobile_data and desktop_data) else "UNAVAILABLE"
            )
        )
