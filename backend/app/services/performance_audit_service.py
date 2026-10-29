"""
Enterprise Website Performance Audit Engine
===========================================
A Lighthouse-style performance audit that runs entirely on already-crawled
page data (rendered HTML, response headers, navigation timing metrics). It
never performs extra network requests and never re-crawls.

Audit categories (spec-aligned):
  - Core Web Vitals        (LCP, FCP, INP, CLS, TTFB, TBT, Speed Index, TTI)
  - Website Speed          (load, DOM ready, fully loaded, response, idle)
  - Image Optimization     (counts, formats, lazy/responsive/alt)
  - JavaScript             (bundles, unused, minified, blocking)
  - CSS                    (unused, minified, critical, blocking)
  - Fonts                  (google/custom, loading strategy)
  - Compression            (gzip / brotli / none)
  - Browser Cache          (cache-control, etag, expires, immutable)
  - CDN                    (provider detection from headers / asset hosts)
  - Mobile / Desktop       (viewport, responsive, touch)
  - Resources              (requests + size breakdown)
  - Third-Party            (analytics, chat widgets, tracking)
  - Hosting                (response time, keep-alive, HTTP version)

Guarantees:
  - NEVER raises — any failure returns a partial audit so AI analysis continues.
  - NO network I/O — purely analyzes the passed page documents.
  - Modular per-category analyzers so failures are isolated per category.
  - Every metric is scored 0-100 with a status (Excellent/Good/Average/Poor)
    and a color, and an overall score + letter grade (A-F) is produced.
  - Every step is logged so the pipeline is fully auditable.
"""

import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from bs4 import BeautifulSoup

from app.models.performance_audit import (
    AuditMetric,
    CacheAudit,
    CDNAudit,
    CompressionAudit,
    CoreWebVitalsAudit,
    CSSAudit,
    DesktopAudit,
    FontAudit,
    HostingAudit,
    ImageAudit,
    JavaScriptAudit,
    MobileAudit,
    PerformanceAuditResultCreate,
    PerformanceRecommendation,
    ResourceAudit,
    ThirdPartyAudit,
    WebsiteSpeedAudit,
)
from app.services.safe_scoring import safe_score, safe_float, safe_int, safe_str

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Status palette + classification helpers
# ─────────────────────────────────────────────────────────────────────────────

GREEN = "#10b981"
BLUE = "#3b82f6"
ORANGE = "#f59e0b"
RED = "#ef4444"


def _status_of(value: float, excellent: float, good: float, average: float) -> Tuple[str, str]:
    """Classify a lower-is-better metric against tier boundaries."""
    if value <= excellent:
        return ("Excellent", GREEN)
    if value <= good:
        return ("Good", BLUE)
    if value <= average:
        return ("Average", ORANGE)
    return ("Poor", RED)


def _metric(value: float, unit: Optional[str] = None, status: Optional[str] = None,
            color: Optional[str] = None) -> AuditMetric:
    return AuditMetric(
        value=round(safe_float(value), 2),
        unit=unit,
        status=status,
        color=color,
        label=_fmt(value, unit),
    )


def _fmt(value: float, unit: Optional[str]) -> str:
    try:
        value = float(value)
    except (TypeError, ValueError):
        return ""
    if unit == "ms":
        return f"{value / 1000:.1f}s" if value >= 1000 else f"{value:.0f}ms"
    if unit == "s":
        return f"{value:.2f}s"
    if unit == "KB":
        return f"{value / 1024:.1f} MB" if value >= 1024 else f"{value:.0f} KB"
    if unit == "%":
        return f"{value:.0f}%"
    if unit == "score":
        return f"{value:.2f}"
    return f"{value:,.0f}" if value == int(value) else f"{value:.2f}"


# CWV tier boundaries: (excellent, good, average)
_CWV_TIERS = {
    "lcp": (1800, 2500, 4000),
    "fcp": (1200, 1800, 3000),
    "inp": (150, 200, 500),
    "cls": (0.05, 0.1, 0.25),
    "ttfb": (600, 800, 1800),
    "tbt": (150, 200, 600),
    "speed_index": (2400, 3400, 5800),
    "tti": (2800, 3800, 7300),
}

_LOAD_TIME_TIERS = (1.0, 2.0, 3.5)  # seconds


def _grade(score: int) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


# ─────────────────────────────────────────────────────────────────────────────
# Third-party provider fingerprint database
# ─────────────────────────────────────────────────────────────────────────────

_THIRD_PARTY_FINGERPRINTS = [
    (("google-analytics.com", "googletagmanager.com", "gtag", "ga("), "Google Analytics", "Analytics"),
    (("connect.facebook.net", "facebook.net", "fbq(", "fbq("), "Meta Pixel", "Tracking"),
    (("clarity.ms", "clarity"), "Microsoft Clarity", "Analytics"),
    (("static.hotjar.com", "hotjar.com", "hotjar"), "Hotjar", "Analytics"),
    (("googletagmanager.com", "gtm.start"), "Google Tag Manager", "Tag Manager"),
    (("js.hs-scripts.com", "js.hsforms.net", "hubspot"), "HubSpot", "Marketing"),
    (("widget.intercomcdn.com", "intercom"), "Intercom", "Chat"),
    (("static.zdassets.com", "ekr.zdassets.com", "zendesk"), "Zendesk", "Support"),
    (("app.lemonsqueezy", "tawk.to"), "Tawk.to", "Chat"),
    (("widget.crisp.chat", "crisp.chat"), "Crisp", "Chat"),
    (("js.driftt.com", "drift.com"), "Drift", "Chat"),
    (("mixpanel.com", "cdn.mxpnl.com"), "Mixpanel", "Analytics"),
    (("segment.io", "cdn.segment.com"), "Segment", "Analytics"),
    (("staticw2.yotpo.com", "yotpo.com"), "Yotpo", "Marketing"),
    (("js.tidio.com", "tidiochat.com"), "Tidio", "Chat"),
    (("cdn.livechatinc.com", "livechatinc.com"), "LiveChat", "Chat"),
    (("crisp",), "Crisp", "Chat"),
    (("plausible.io", "plausible"), "Plausible Analytics", "Analytics"),
    (("fathom",), "Fathom Analytics", "Analytics"),
    (("www.googletagmanager.com",), "Google Tag Manager", "Tag Manager"),
]

_CDN_HEADER_SIGNATURES = [
    ("cf-ray", "Cloudflare"),
    ("x-amz-cf-id", "CloudFront"),
    ("x-fastly-request-id", "Fastly"),
    ("x-akamai-transformed", "Akamai"),
    ("x-bunny", "BunnyCDN"),
    ("x-sucuri-id", "Sucuri"),
]

_CDN_SERVER_SIGNATURES = [
    ("cloudflare", "Cloudflare"),
    ("vercel", "Vercel Edge"),
    ("netlify", "Netlify"),
    ("bunnycdn", "BunnyCDN"),
    ("akamai", "Akamai"),
    ("fastly", "Fastly"),
    ("cloudfront", "CloudFront"),
]

_CDN_ASSET_HOSTS = [
    ("cdn.shopify.com", "Shopify CDN"),
    ("cloudfront.net", "CloudFront"),
    ("b-cdn.net", "BunnyCDN"),
    ("fastly.net", "Fastly"),
    ("akamaized.net", "Akamai"),
    ("googleusercontent.com", "Google Cloud CDN"),
]

# ─────────────────────────────────────────────────────────────────────────────
# Page signal extraction
# ─────────────────────────────────────────────────────────────────────────────

_MAX_PAGES = 20


def _normalize_headers(headers: Any) -> Dict[str, str]:
    if not headers:
        return {}
    if isinstance(headers, str):
        return {}
    normalized: Dict[str, str] = {}
    if isinstance(headers, dict):
        items = headers.items()
    elif isinstance(headers, (list, tuple)):
        items = []
        for item in headers:
            if isinstance(item, dict):
                items.extend(item.items())
            elif isinstance(item, (list, tuple)) and len(item) == 2:
                items.append((item[0], item[1]))
    else:
        return normalized
    for key, value in items:
        k = str(key).lower()
        if isinstance(value, (list, tuple)):
            value = ", ".join(str(v) for v in value)
        normalized[k] = str(value or "")
    return normalized


class _PageSignals:
    """Extracted signals from a single crawled page document."""

    __slots__ = ("url", "html", "headers", "timing", "size_bytes", "soup",
                 "scripts", "inline_scripts", "css_links", "images", "fonts",
                 "videos", "iframes", "preloads", "meta_viewport", "media_queries")

    def __init__(self, page: Any):
        if not isinstance(page, dict):
            page = {}
        self.url = str(page.get("url") or "")
        self.html = str(page.get("rendered_html") or page.get("html") or "")
        self.headers = _normalize_headers(page.get("response_headers"))
        timing = page.get("timing_metrics") or {}
        self.timing = timing if isinstance(timing, dict) else {}
        try:
            self.size_bytes = int(page.get("page_size_bytes") or page.get("content_length") or len(self.html))
        except (TypeError, ValueError):
            self.size_bytes = len(self.html)

        self.soup: Optional[BeautifulSoup] = None
        try:
            self.soup = BeautifulSoup(self.html, "html.parser")
        except Exception:
            pass

        self.scripts: List[Dict[str, Any]] = []
        self.inline_scripts: List[str] = []
        self.css_links: List[Dict[str, Any]] = []
        self.images: List[Dict[str, Any]] = []
        self.fonts: List[Dict[str, Any]] = []
        self.videos: List[str] = []
        self.iframes: List[str] = []
        self.preloads: List[str] = []
        self.meta_viewport: bool = False
        self.media_queries: int = 0

        self._extract()

    def _extract(self) -> None:
        soup = self.soup
        if soup is None:
            return

        for s in soup.find_all("script"):
            src = s.get("src")
            if src:
                self.scripts.append({
                    "src": str(src),
                    "async": bool(s.get("async") or s.get("defer")),
                    "inline": False,
                })
            elif s.string and s.string.strip():
                self.inline_scripts.append(s.string)

        for c in soup.find_all("link", rel="stylesheet"):
            self.css_links.append({
                "href": str(c.get("href") or ""),
                "media": str(c.get("media") or "all"),
            })

        for img in soup.find_all("img"):
            src = str(img.get("src") or img.get("data-src") or "")
            srcset = img.get("srcset")
            width = img.get("width")
            height = img.get("height")
            self.images.append({
                "src": src,
                "has_dimensions": bool(width and height),
                "lazy": bool(img.get("loading") == "lazy"),
                "responsive": bool(srcset),
                "alt": bool(img.get("alt")),
            })

        for f in soup.find_all("link", href=True):
            href = str(f.get("href") or "")
            lower = href.lower()
            if any(ext in lower for ext in (".woff2", ".woff", ".ttf", ".otf", ".eot")):
                self.fonts.append({"src": href, "type": "file"})
            elif "fonts.googleapis.com" in lower or "fonts.gstatic.com" in lower:
                self.fonts.append({"src": href, "type": "google"})
            rel = str(f.get("rel") or "").lower()
            if "preload" in rel and "font" in str(f.get("as") or "").lower():
                self.preloads.append(href)
            if "preload" in rel or "prefetch" in rel:
                self.preloads.append(href)

        for v in soup.find_all("video"):
            src = v.get("src")
            if src:
                self.videos.append(str(src))
            for source in v.find_all("source"):
                if source.get("src"):
                    self.videos.append(str(source.get("src")))

        for iframe in soup.find_all("iframe"):
            if iframe.get("src"):
                self.iframes.append(str(iframe.get("src")))

        viewport = soup.find("meta", attrs={"name": re.compile("^viewport$", re.I)})
        self.meta_viewport = viewport is not None

        for style in soup.find_all("style"):
            text = style.string or ""
            if "@media" in text:
                self.media_queries += len(re.findall(r"@media[^{]+", text))
            if "@font-face" in text:
                for _ in re.finditer(r"@font-face", text):
                    self.fonts.append({"src": "inline", "type": "custom"})


# ─────────────────────────────────────────────────────────────────────────────
# Performance Audit Service
# ─────────────────────────────────────────────────────────────────────────────

class PerformanceAuditService:
    """Local, Lighthouse-style website performance audit engine."""

    MAX_PAGES = _MAX_PAGES

    # Estimated transfer size (KB) per external resource of unknown size.
    _EST_JS_KB = 60.0
    _EST_CSS_KB = 25.0
    _EST_IMAGE_KB = 80.0
    _EST_IMAGE_SVG_KB = 4.0
    _EST_FONT_KB = 25.0
    _EST_VIDEO_KB = 800.0

    def __init__(self) -> None:
        pass

    # ── Public entrypoint ───────────────────────────────────────────────

    async def audit(self, lead_id: str, website_url: str, pages: List[Dict],
                    on_update=None) -> PerformanceAuditResultCreate:
        """Run a full performance audit. NEVER raises — returns a partial audit."""
        started = time.perf_counter()
        try:
            self._emit(on_update, "Performance Audit", website_url, {"stage": "started"})
            logger.info(f"[PerfAudit] Performance Audit Started: {lead_id} :: {website_url}")
            result = self._audit(lead_id, website_url, pages, on_update=on_update)
            result.auditTime = round((time.perf_counter() - started) * 1000, 1)
            logger.info(
                f"[PerfAudit] Performance Audit Finished: {lead_id} "
                f"score={result.overallScore} grade={result.grade} "
                f"auditTime={result.auditTime:.0f}ms"
            )
            return result
        except Exception as exc:  # pragma: no cover - defensive
            logger.error(f"[PerfAudit] Audit failed for lead {lead_id}: {exc!r}")
            empty = PerformanceAuditResultCreate(lead_id=lead_id, website_url=website_url)
            empty.auditTime = round((time.perf_counter() - started) * 1000, 1)
            return empty

    # ── Core audit orchestration ─────────────────────────────────────────

    def _audit(self, lead_id: str, website_url: str, pages: List[Any],
               on_update=None) -> PerformanceAuditResultCreate:
        if not isinstance(pages, list):
            pages = []

        signals: List[_PageSignals] = []
        for page in pages:
            if not isinstance(page, dict):
                continue
            try:
                signals.append(_PageSignals(page))
            except Exception:
                continue
        if not signals:
            logger.warning(f"[PerfAudit] No valid pages provided for lead {lead_id}; returning empty audit")
            return PerformanceAuditResultCreate(lead_id=lead_id, website_url=website_url)

        signals = signals[: self.MAX_PAGES]
        primary = signals[0]

        # ── Core Web Vitals (heuristic estimates) ──
        logger.info("[PerfAudit] Core Web Vitals Complete")
        cwv = self._audit_core_web_vitals(signals, primary)

        # ── Website Speed ──
        speed = self._audit_website_speed(signals, cwv)

        # ── Images ──
        images = self._audit_images(signals)
        logger.info("[PerfAudit] Image Audit Complete")

        # ── JavaScript ──
        javascript = self._audit_javascript(signals)
        logger.info("[PerfAudit] JavaScript Audit Complete")

        # ── CSS ──
        css = self._audit_css(signals)
        logger.info("[PerfAudit] CSS Audit Complete")

        # ── Fonts ──
        fonts = self._audit_fonts(signals)

        # ── Compression ──
        compression = self._audit_compression(primary)

        # ── Browser Cache ──
        cache = self._audit_cache(primary)

        # ── CDN ──
        cdn = self._audit_cdn(primary)
        logger.info("[PerfAudit] Compression Audit Complete")

        # ── Resources ──
        resources = self._audit_resources(signals)

        # ── Mobile / Desktop ──
        mobile = self._audit_mobile(signals, cwv)
        desktop = self._audit_desktop(cwv, speed, images, javascript, css, resources)

        # ── Hosting ──
        hosting = self._audit_hosting(primary, cwv)

        # ── Third party ──
        third_party = self._audit_third_party(signals)

        # ── Overall score + grade ──
        overall = self._overall_score(
            cwv, speed, images, javascript, css, compression, cache, cdn,
            mobile, desktop, resources, hosting, third_party,
        )
        grade = _grade(overall)

        # ── AI Recommendations ──
        recommendations = self._build_recommendations(
            images, javascript, css, fonts, compression, cache, cdn,
            hosting, third_party, cwv,
        )

        return PerformanceAuditResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            overallScore=overall,
            grade=grade,
            coreWebVitals=cwv,
            websiteSpeed=speed,
            images=images,
            javascript=javascript,
            css=css,
            fonts=fonts,
            compression=compression,
            cache=cache,
            cdn=cdn,
            resources=resources,
            mobile=mobile,
            desktop=desktop,
            hosting=hosting,
            thirdParty=third_party,
            recommendations=recommendations,
        )

    # ── Timing helpers ───────────────────────────────────────────────────

    @staticmethod
    def _avg_timing(signals: List[_PageSignals], key: str) -> float:
        values = [s.timing.get(key) for s in signals]
        values = [safe_float(v) for v in values if safe_float(v) > 0]
        if not values:
            return 0.0
        return sum(values) / len(values)

    def _estimate_ttfb(self, signals: List[_PageSignals], primary: _PageSignals) -> float:
        measured = self._avg_timing(signals, "ttfb")
        if measured > 0:
            return measured
        if primary.headers.get("cf-ray"):
            return 220.0
        if any(primary.headers.get(k) for k in ("x-amz-cf-id", "x-fastly-request-id")):
            return 260.0
        server = primary.headers.get("server", "").lower()
        if any(edge in server for edge in ("vercel", "netlify", "cloudflare")):
            return 250.0
        return 420.0

    # ── Category audits ──────────────────────────────────────────────────

    def _audit_core_web_vitals(self, signals: List[_PageSignals], primary: _PageSignals) -> CoreWebVitalsAudit:
        ttfb = self._estimate_ttfb(signals, primary)

        html_kb = (primary.size_bytes or len(primary.html)) / 1024.0
        blocking_scripts = [s for s in primary.scripts if not s["async"]]
        inline_js_kb = sum(len(x) for x in primary.inline_scripts) / 1024.0
        blocking_css = len(primary.css_links)
        image_bytes_kb = len(primary.images) * self._EST_IMAGE_KB
        font_count = len(primary.fonts)
        images_no_dimensions = sum(1 for i in primary.images if not i["has_dimensions"])
        lazy_missing = sum(1 for i in primary.images if not i["lazy"])

        parse_cost = min(600.0, html_kb * 4.0)
        blocking_js_cost = min(500.0, len(blocking_scripts) * 70.0 + inline_js_kb * 15.0)
        blocking_css_cost = min(400.0, blocking_css * 60.0)

        fcp = ttfb + parse_cost * 0.5 + blocking_css_cost * 0.6 + blocking_js_cost * 0.5
        lcp = fcp + min(1400.0, image_bytes_kb * 1.2) + min(400.0, font_count * 120.0)
        if lazy_missing == 0 and primary.images:
            lcp += 180.0

        cls = 0.02 + images_no_dimensions * 0.015 + font_count * 0.01
        if not any(f.get("type") == "google" for f in primary.fonts):
            cls += 0.02
        cls = round(min(0.30, cls), 3)

        total_js_kb = inline_js_kb + len(primary.scripts) * self._EST_JS_KB
        inp = min(600.0, 120.0 + len(blocking_scripts) * 20.0 + total_js_kb * 0.8)
        tbt = min(500.0, len(blocking_scripts) * 25.0 + inline_js_kb * 5.0)
        speed_index = fcp * 0.4 + lcp * 0.6
        tti = fcp + tbt + min(600.0, len(blocking_scripts) * 40.0 + 400.0)

        values = {
            "lcp": lcp, "fcp": fcp, "inp": inp, "cls": cls,
            "ttfb": ttfb, "tbt": tbt, "speed_index": speed_index, "tti": tti,
        }

        units = {"lcp": "ms", "fcp": "ms", "inp": "ms", "cls": "score",
                 "ttfb": "ms", "tbt": "ms", "speed_index": "ms", "tti": "ms"}

        metrics: Dict[str, AuditMetric] = {}
        for name, value in values.items():
            status, color = _status_of(value, *_CWV_TIERS[name])
            metrics[name] = _metric(value, units[name], status, color)

        penalties = {
            "lcp": (0, 10, 25, 45),
            "fcp": (0, 10, 25, 40),
            "inp": (0, 10, 20, 35),
            "cls": (0, 10, 20, 35),
            "ttfb": (0, 10, 20, 35),
            "tbt": (0, 10, 20, 30),
            "speed_index": (0, 10, 15, 25),
            "tti": (0, 10, 15, 25),
        }
        deduction = 0
        for name, value in values.items():
            ex, good, avg = _CWV_TIERS[name]
            if value > avg:
                deduction += penalties[name][3]
            elif value > good:
                deduction += penalties[name][2]
            elif value > ex:
                deduction += penalties[name][1]

        return CoreWebVitalsAudit(
            score=safe_score(100 - deduction),
            lcp=metrics["lcp"], fcp=metrics["fcp"], inp=metrics["inp"],
            cls=metrics["cls"], ttfb=metrics["ttfb"], tbt=metrics["tbt"],
            speedIndex=metrics["speed_index"], tti=metrics["tti"],
        )

    def _audit_website_speed(self, signals: List[_PageSignals], cwv: CoreWebVitalsAudit) -> WebsiteSpeedAudit:
        load_s = self._avg_timing(signals, "load_event") / 1000.0
        dom_s = self._avg_timing(signals, "dom_ready") / 1000.0
        full_s = self._avg_timing(signals, "full_load_time") / 1000.0
        idle_s = self._avg_timing(signals, "network_idle") / 1000.0
        ttfb_s = cwv.ttfb.value / 1000.0

        if load_s <= 0:
            load_s = cwv.lcp.value / 1000.0 + 0.3
        if dom_s <= 0:
            dom_s = load_s * 0.75
        if full_s <= 0:
            full_s = load_s * 1.15
        if idle_s <= 0:
            idle_s = full_s * 0.95

        load_metric = _metric(load_s, "s", *_status_of(load_s, *_LOAD_TIME_TIERS))
        dom_metric = _metric(dom_s, "s", *_status_of(dom_s, *_LOAD_TIME_TIERS))
        full_status, full_color = _status_of(full_s, 1.5, 3.0, 5.0)
        full_metric = _metric(full_s, "s", full_status, full_color)
        resp_metric = _metric(ttfb_s, "s", *_status_of(ttfb_s * 1000, *_CWV_TIERS["ttfb"]))
        idle_metric = _metric(idle_s, "s", *_status_of(idle_s, 1.5, 3.0, 5.0))

        if load_s <= _LOAD_TIME_TIERS[0]:
            score = 100
        elif load_s <= _LOAD_TIME_TIERS[1]:
            score = 85
        elif load_s <= _LOAD_TIME_TIERS[2]:
            score = 65
        else:
            score = 40
        if idle_s > 5.0:
            score = max(20, score - 10)

        return WebsiteSpeedAudit(
            score=safe_score(score),
            loadTime=load_metric,
            domReadyTime=dom_metric,
            fullyLoadedTime=full_metric,
            initialResponseTime=resp_metric,
            networkIdleTime=idle_metric,
        )

    def _audit_images(self, signals: List[_PageSignals]) -> ImageAudit:
        total = optimized = unoptimized = large = no_lazy = no_responsive = no_alt = 0
        formats: Dict[str, int] = {}

        for sig in signals:
            for img in sig.images:
                total += 1
                src = img["src"].split("?")[0].lower()
                ext = ""
                for candidate in (".webp", ".avif", ".jpeg", ".jpg", ".png", ".svg", ".gif"):
                    if src.endswith(candidate):
                        ext = candidate.lstrip(".") if candidate != ".jpeg" else "jpeg"
                        break
                ext = "jpeg" if ext == "jpg" else ext
                if not ext:
                    ext = "unknown"
                formats[ext] = formats.get(ext, 0) + 1

                is_optimized = img["lazy"] and img["has_dimensions"] and ext in ("webp", "avif", "svg")
                if not img["lazy"]:
                    no_lazy += 1
                if not img["has_dimensions"]:
                    large += 1
                if not img["responsive"]:
                    no_responsive += 1
                if not img["alt"]:
                    no_alt += 1
                if is_optimized:
                    optimized += 1
                else:
                    unoptimized += 1

        score = 100
        if total:
            unoptimized_ratio = unoptimized / total
            score -= unoptimized_ratio * 40
        score -= min(30, large * 8)
        score -= min(20, no_lazy * 4)
        score -= min(10, no_alt * 2)

        return ImageAudit(
            score=safe_score(score),
            total=total,
            optimized=optimized,
            unoptimized=unoptimized,
            largeImages=large,
            missingLazyLoading=no_lazy,
            missingResponsive=no_responsive,
            missingAlt=no_alt,
            formats=formats,
        )

    def _audit_javascript(self, signals: List[_PageSignals]) -> JavaScriptAudit:
        total_files = 0
        render_blocking = 0
        large_bundles = 0
        minified_count = 0
        inline_kb = 0.0
        dynamic_imports = 0

        chunk_pattern = re.compile(r"(chunk|bundle|vendor|_next/static/chunks|\.lazy\b|React\.lazy|import\s*\(|loadable)", re.I)
        min_pattern = re.compile(r"\.min\.(js|mjs)$", re.I)

        for sig in signals:
            inline_kb += sum(len(x) for x in sig.inline_scripts) / 1024.0
            for script in sig.scripts:
                total_files += 1
                src = script["src"]
                if not script["async"]:
                    render_blocking += 1
                if chunk_pattern.search(src):
                    large_bundles += 1
                if min_pattern.search(src):
                    minified_count += 1
            for inline in sig.inline_scripts:
                if chunk_pattern.search(inline):
                    dynamic_imports += 1

        external_minified = minified_count / total_files if total_files else 0.0
        inline_whitespace_ratio = 0.0
        total_inline_chars = sum(len(x) for x in (i for sig in signals for i in sig.inline_scripts))
        if total_inline_chars:
            ws = sum(sig.inline_scripts and sum(1 for ch in s if ch.isspace()) for sig in signals for s in sig.inline_scripts)
            inline_whitespace_ratio = ws / total_inline_chars
        minified = external_minified >= 0.5 or inline_whitespace_ratio < 0.15

        bundle_kb = inline_kb + total_files * self._EST_JS_KB
        unused_pct = min(45.0, (len([s for sig in signals for s in sig.scripts]) * 4.0) + (inline_kb * 0.5))
        unused_pct = round(max(0.0, unused_pct), 1)
        if total_files == 0 and inline_kb == 0:
            unused_pct = 0.0

        score = 100
        score -= min(30, render_blocking * 8)
        score -= min(30, large_bundles * 8)
        if not minified and total_files:
            score -= 10
        score -= min(20, unused_pct * 0.5)

        return JavaScriptAudit(
            score=safe_score(score),
            totalFiles=total_files,
            bundleSize=_metric(bundle_kb, "KB",
                               "Good" if bundle_kb <= 500 else "Average" if bundle_kb <= 1200 else "Poor",
                               BLUE if bundle_kb <= 500 else ORANGE if bundle_kb <= 1200 else RED),
            unusedJS=_metric(unused_pct, "%",
                             "Good" if unused_pct <= 10 else "Average" if unused_pct <= 25 else "Poor",
                             BLUE if unused_pct <= 10 else ORANGE if unused_pct <= 25 else RED),
            largeBundles=large_bundles,
            minified=minified,
            treeShaking=bool(dynamic_imports) or any("_next/static/chunks" in s["src"] for sig in signals for s in sig.scripts) or None,
            codeSplitting=bool(dynamic_imports),
            renderBlocking=render_blocking,
        )

    def _audit_css(self, signals: List[_PageSignals]) -> CSSAudit:
        total_files = 0
        render_blocking = 0
        minified_files = 0
        inline_css_kb = 0.0
        has_inline_head_css = False
        media_count = 0

        min_pattern = re.compile(r"\.min\.css$", re.I)

        for sig in signals:
            for css in sig.css_links:
                total_files += 1
                if css["media"] in ("all", "", "screen"):
                    render_blocking += 1
                if min_pattern.search(css["href"]):
                    minified_files += 1
            for style in (sig.soup.find_all("style") if sig.soup else []):
                text = style.string or ""
                inline_css_kb += len(text) / 1024.0
                if "@media" in text:
                    media_count += len(re.findall(r"@media[^{]+", text))
            head = sig.soup.find("head") if sig.soup else None
            if head is not None and head.find("style"):
                has_inline_head_css = True

        minified = (minified_files / total_files >= 0.5 if total_files else inline_css_kb > 0) or (inline_css_kb > 0 and False)
        if total_files and minified_files / total_files >= 0.5:
            minified = True

        # Unused CSS heuristic: larger stylesheet footprints imply more dead rules.
        unused_pct = 0.0
        if total_files:
            unused_pct = min(45.0, 10.0 + (total_files - 1) * 5.0 + inline_css_kb * 0.4)
        unused_pct = round(unused_pct, 1)

        score = 100
        score -= min(35, render_blocking * 12)
        score -= min(25, unused_pct * 0.5)
        if not minified and (total_files or inline_css_kb):
            score -= 10
        if not has_inline_head_css and total_files > 2:
            score -= 8

        return CSSAudit(
            score=safe_score(score),
            totalFiles=total_files,
            unusedCSS=_metric(unused_pct, "%",
                              "Good" if unused_pct <= 15 else "Average" if unused_pct <= 30 else "Poor",
                              BLUE if unused_pct <= 15 else ORANGE if unused_pct <= 30 else RED),
            minified=minified,
            criticalCSS=has_inline_head_css,
            renderBlocking=render_blocking,
        )

    def _audit_fonts(self, signals: List[_PageSignals]) -> FontAudit:
        google = 0
        custom = 0
        font_files = 0
        font_display_swap = False
        font_display_block = False
        has_inline_font_face = False

        for sig in signals:
            for font in sig.fonts:
                if font["type"] == "google":
                    google += 1
                elif font["type"] == "custom":
                    custom += 1
                if "file" in font["type"]:
                    font_files += 1
            for style in (sig.soup.find_all("style") if sig.soup else []):
                text = style.string or ""
                if "@font-face" in text:
                    has_inline_font_face = True
                if "font-display: swap" in text:
                    font_display_swap = True
                if "font-display: block" in text:
                    font_display_block = True
            for pre in sig.preloads:
                if "font" in pre.lower():
                    font_files += 1

        # Google fonts often inject multiple families from a single link.
        total = google + custom
        too_many = total > 4

        if font_display_swap:
            font_display = "swap"
        elif font_display_block:
            font_display = "block"
        else:
            font_display = "auto"

        font_loading = "preload" if any("font" in p.lower() for sig in signals for p in sig.preloads) else font_display

        score = 100
        if total == 0:
            score = 100
        else:
            if too_many:
                score -= 25
            if font_display in ("block", "auto") and google > 0:
                score -= 20
            if has_inline_font_face and not font_display_swap:
                score -= 15

        return FontAudit(
            score=safe_score(score),
            googleFonts=google,
            customFonts=custom,
            total=total,
            tooManyFonts=too_many,
            fontLoading=font_loading,
            fontDisplay=font_display,
        )

    def _audit_compression(self, primary: _PageSignals) -> CompressionAudit:
        encoding = primary.headers.get("content-encoding", "").lower()
        gzip = "gzip" in encoding
        brotli = "br" in encoding
        vary = primary.headers.get("vary", "").lower()
        if not brotli and "br" in vary and "gzip" in vary:
            brotli = True
        if not gzip and "gzip" in vary:
            gzip = True

        no_compression = not gzip and not brotli

        if brotli:
            score = 100
        elif gzip:
            score = 75
        else:
            score = 40

        return CompressionAudit(score=score, gzip=gzip, brotli=brotli, noCompression=no_compression)

    def _audit_cache(self, primary: _PageSignals) -> CacheAudit:
        headers = primary.headers
        cache_control = headers.get("cache-control", "").lower()
        etag = bool(headers.get("etag"))
        expires = bool(headers.get("expires"))
        has_cache_control = bool(cache_control)
        has_max_age = "max-age" in cache_control or "s-maxage" in cache_control
        immutable = "immutable" in cache_control or bool(re.search(r"max-age=\d{7,}", cache_control))

        score = 0
        if has_cache_control:
            score += 50
            if has_max_age:
                score += 20
            if immutable:
                score += 10
        if etag:
            score += 15
        if expires:
            score += 10
        if not has_cache_control and not etag and not expires:
            score = 25

        return CacheAudit(
            score=safe_score(score),
            cacheControl=has_cache_control,
            etag=etag,
            expires=expires,
            immutableAssets=immutable,
        )

    def _audit_cdn(self, primary: _PageSignals) -> CDNAudit:
        headers = primary.headers
        provider = None

        for header_key, name in _CDN_HEADER_SIGNATURES:
            if headers.get(header_key):
                provider = name
                break

        if not provider:
            server = headers.get("server", "").lower()
            for signature, name in _CDN_SERVER_SIGNATURES:
                if signature in server:
                    provider = name
                    break

        if not provider:
            html_lower = primary.html.lower()
            for host, name in _CDN_ASSET_HOSTS:
                if host in html_lower:
                    provider = name
                    break

        detected = provider is not None
        return CDNAudit(
            score=100 if detected else 40,
            detected=detected,
            provider=provider,
        )

    def _audit_resources(self, signals: List[_PageSignals]) -> ResourceAudit:
        total_requests = 0
        html_kb = js_kb = css_kb = image_kb = video_kb = font_kb = 0.0

        for sig in signals:
            html_kb += max(len(sig.html), sig.size_bytes) / 1024.0
            js_kb += len(sig.scripts) * self._EST_JS_KB + sum(len(x) for x in sig.inline_scripts) / 1024.0
            css_kb += len(sig.css_links) * self._EST_CSS_KB
            for img in sig.images:
                ext = img["src"].split("?")[0].lower()
                image_kb += self._EST_IMAGE_SVG_KB if ext.endswith(".svg") else self._EST_IMAGE_KB
            video_kb += len(sig.videos) * self._EST_VIDEO_KB
            font_kb += len(sig.fonts) * self._EST_FONT_KB

            total_requests += (
                len(sig.scripts)
                + len(sig.css_links)
                + len(sig.images)
                + len(sig.videos)
                + len(sig.iframes)
                + len(sig.fonts)
                + len(sig.preloads)
            )

        total_kb = html_kb + js_kb + css_kb + image_kb + video_kb + font_kb

        score = 100
        if total_requests > 60:
            score -= min(25, (total_requests - 60) * 0.5)
        if total_kb > 2500:
            score -= min(20, (total_kb - 2500) / 200)
        if total_requests <= 3 and total_kb <= 200:
            score = 100

        def _kb(v):
            return round(v, 1)

        return ResourceAudit(
            score=safe_score(score),
            totalRequests=total_requests,
            htmlSize=_metric(_kb(html_kb), "KB"),
            cssSize=_metric(_kb(css_kb), "KB"),
            jsSize=_metric(_kb(js_kb), "KB"),
            imageSize=_metric(_kb(image_kb), "KB"),
            videoSize=_metric(_kb(video_kb), "KB"),
            fontSize=_metric(_kb(font_kb), "KB"),
            totalDownloadSize=_metric(_kb(total_kb), "KB"),
        )

    def _audit_mobile(self, signals: List[_PageSignals], cwv: CoreWebVitalsAudit) -> MobileAudit:
        has_viewport = any(s.meta_viewport for s in signals)
        has_media_queries = any(s.media_queries > 0 for s in signals)

        body = signals[0].soup.find("body") if signals[0].soup else None
        small_text = False
        if body is not None:
            for style in body.find_all("style"):
                for match in re.finditer(r"font-size\s*:\s*(\d+)px", style.string or ""):
                    if int(match.group(1)) < 14:
                        small_text = True
                        break

        viewport_content = ""
        viewport_meta = signals[0].soup.find("meta", attrs={"name": re.compile("^viewport$", re.I)}) if signals[0].soup else None
        if viewport_meta is not None:
            viewport_content = str(viewport_meta.get("content") or "")
        touch_friendly = has_viewport and has_media_queries and not small_text and "user-scalable=no" not in viewport_content.lower()

        score = 0
        if has_viewport:
            score += 30
        if has_media_queries:
            score += 30
        if touch_friendly:
            score += 25
        score += safe_score(min(15, cwv.score // 7))

        return MobileAudit(
            score=safe_score(score),
            viewport=has_viewport,
            responsiveLayout=has_media_queries,
            touchFriendly=touch_friendly,
        )

    def _audit_desktop(self, cwv: CoreWebVitalsAudit, speed: WebsiteSpeedAudit, images: ImageAudit,
                       javascript: JavaScriptAudit, css: CSSAudit, resources: ResourceAudit) -> DesktopAudit:
        weighted = (
            cwv.score * 0.30
            + speed.score * 0.20
            + images.score * 0.15
            + javascript.score * 0.15
            + css.score * 0.10
            + resources.score * 0.10
        )
        return DesktopAudit(score=safe_score(weighted))

    def _audit_hosting(self, primary: _PageSignals, cwv: CoreWebVitalsAudit) -> HostingAudit:
        ttfb = cwv.ttfb.value
        headers = primary.headers

        score = 0
        if ttfb <= 600:
            score += 40
        elif ttfb <= 800:
            score += 32
        elif ttfb <= 1800:
            score += 22
        else:
            score += 12

        connection = headers.get("connection", "").lower()
        keep_alive = connection != "close"
        if keep_alive:
            score += 15

        server = headers.get("server")
        if server:
            score += 15

        http_version = str(primary.timing.get("http_version") or "") or headers.get("x-http-version") or None
        http2 = False
        http3 = False
        if headers.get("alt-svc"):
            http3 = True
            http_version = http_version or "HTTP/3"
        elif http_version:
            http2 = "2" in http_version
        elif any(edge in (server or "").lower() for edge in ("cloudflare", "vercel", "netlify", "akamai", "fastly")):
            http2 = True
            http_version = "HTTP/2"
        else:
            http2 = True
            http_version = http_version or "HTTP/1.1" if server else "HTTP/1.1"

        if http3:
            score += 25
        elif http2:
            score += 20
        else:
            score += 8

        return HostingAudit(
            score=safe_score(score),
            responseTime=_metric(ttfb, "ms", *_status_of(ttfb, *_CWV_TIERS["ttfb"])),
            serverHeaders=server,
            connectionKeepAlive=keep_alive,
            httpVersion=http_version,
            http2=http2,
            http3=http3,
        )

    def _audit_third_party(self, signals: List[_PageSignals]) -> ThirdPartyAudit:
        found: Dict[str, str] = {}
        tracking = 0
        chat_widgets = 0

        haystack = " ".join(
            [s.url for s in signals]
            + [s["src"] for sig in signals for s in sig.scripts]
            + [f["src"] for sig in signals for f in sig.fonts]
            + [i["src"] for sig in signals for i in sig.images]
            + [sig.html for sig in signals]
        ).lower()

        for fingerprints, name, category in _THIRD_PARTY_FINGERPRINTS:
            if any(fp in haystack for fp in fingerprints) and name not in found:
                found[name] = category
                if category in ("Analytics", "Tag Manager", "Tracking"):
                    tracking += 1
                if category in ("Chat", "Support"):
                    chat_widgets += 1

        # De-duplicate google analytics / gtm overlaps.
        if "Google Analytics" in found and "Google Tag Manager" in found:
            tracking = max(1, tracking - 1)

        count = len(found)
        score = 100 - min(40, count * 8) - min(15, tracking * 3)
        if count == 0:
            score = 100

        return ThirdPartyAudit(
            score=safe_score(score),
            count=count,
            trackingScripts=tracking,
            chatWidgets=chat_widgets,
            providers=[{"name": name, "category": category} for name, category in found.items()],
        )

    # ── Overall score ────────────────────────────────────────────────────

    def _overall_score(self, cwv: CoreWebVitalsAudit, speed: WebsiteSpeedAudit, images: ImageAudit,
                       javascript: JavaScriptAudit, css: CSSAudit, compression: CompressionAudit,
                       cache: CacheAudit, cdn: CDNAudit, mobile: MobileAudit, desktop: DesktopAudit,
                       resources: ResourceAudit, hosting: HostingAudit,
                       third_party: ThirdPartyAudit) -> int:
        weighted = (
            cwv.score * 0.24
            + speed.score * 0.13
            + images.score * 0.10
            + javascript.score * 0.10
            + css.score * 0.08
            + compression.score * 0.07
            + cache.score * 0.07
            + cdn.score * 0.04
            + mobile.score * 0.04
            + desktop.score * 0.04
            + resources.score * 0.03
            + hosting.score * 0.03
            + third_party.score * 0.03
        )
        return safe_score(weighted)

    # ── AI Recommendations ───────────────────────────────────────────────

    def _build_recommendations(self, images: ImageAudit, javascript: JavaScriptAudit, css: CSSAudit,
                               fonts: FontAudit, compression: CompressionAudit, cache: CacheAudit,
                               cdn: CDNAudit, hosting: HostingAudit, third_party: ThirdPartyAudit,
                               cwv: CoreWebVitalsAudit) -> List[PerformanceRecommendation]:
        recs: List[PerformanceRecommendation] = []

        def add(title: str, description: str, priority: str, category: str) -> None:
            recs.append(PerformanceRecommendation(title=title, description=description, priority=priority, category=category))

        if images.unoptimized > 0 and images.total > 0:
            ratio = round(images.unoptimized / images.total * 100)
            add("Compress Images", f"{images.unoptimized} of {images.total} images are unoptimized ({ratio}%). Compress and re-encode them to reduce page weight.", "High", "Images")
        if images.formats.get("webp", 0) == 0 and images.formats.get("avif", 0) == 0 and images.total > 0:
            add("Use WebP", "No WebP or AVIF images detected. Modern formats cut image weight by up to 50% without visible quality loss.", "Medium", "Images")
        if images.missingLazyLoading > 0:
            add("Lazy Load Images", f"{images.missingLazyLoading} images lack loading=\"lazy\". Lazy loading below-the-fold images speeds up LCP.", "Medium", "Images")
        if images.largeImages > 0:
            add("Optimize Hero Image", f"{images.largeImages} images have no explicit dimensions. Set width/height and serve a compressed hero image to improve LCP and CLS.", "High", "Images")

        if javascript.totalFiles == 0 and javascript.bundleSize.value <= 10:
            pass
        elif javascript.bundleSize.value > 500:
            add("Reduce JavaScript", f"Estimated JS payload is {javascript.bundleSize.label or ''}. Split bundles and remove dead code to cut Total Blocking Time.", "High", "JavaScript")
        if javascript.renderBlocking > 0:
            add("Reduce Render Blocking Resources", f"{javascript.renderBlocking} render-blocking scripts delay First Contentful Paint. Add async/defer where possible.", "High", "JavaScript")
        if javascript.unusedJS.value and javascript.unusedJS.value > 15:
            add("Remove Unused JavaScript", f"Estimated {javascript.unusedJS.value:.0f}% of JS is unused. Remove dead bundles to speed up main-thread execution.", "Medium", "JavaScript")

        if css.renderBlocking > 0:
            add("Reduce Render Blocking CSS", f"{css.renderBlocking} stylesheets block rendering. Inline critical CSS and defer the rest.", "Medium", "CSS")
        if css.unusedCSS.value and css.unusedCSS.value > 15:
            add("Remove Unused CSS", f"Estimated {css.unusedCSS.value:.0f}% of CSS rules are unused. Purge dead styles to shrink the payload.", "Medium", "CSS")
        if not css.criticalCSS and css.totalFiles > 2:
            add("Inline Critical CSS", "Inline above-the-fold critical CSS and defer non-critical stylesheets.", "Low", "CSS")

        if fonts.total > 4:
            add("Optimize Fonts", f"{fonts.total} font families detected. Limit to 2-3 families and subset to used glyphs.", "Medium", "Fonts")
        if fonts.googleFonts > 0 and fonts.fontDisplay in ("block", "auto"):
            add("Optimize Font Loading", "Google Fonts load synchronously. Use font-display: swap and preload to avoid invisible text.", "Medium", "Fonts")

        if not compression.brotli:
            add("Enable Brotli", "Enable Brotli compression (or GZIP) on your origin server to shrink HTML/CSS/JS transfers by 60-70%.", "High", "Compression")
        elif compression.noCompression:
            add("Enable GZIP", "Enable GZIP compression for older clients that do not support Brotli.", "Low", "Compression")

        if not cache.cacheControl and not cache.etag and not cache.expires:
            add("Enable Browser Cache", "No cache headers detected. Set Cache-Control and ETag so repeat visits load instantly.", "High", "Caching")
        elif not cache.immutableAssets:
            add("Cache Static Assets", "Add immutable, long-lived cache headers (max-age=31536000, immutable) to fingerprinted assets.", "Medium", "Caching")

        if not cdn.detected:
            add("Enable CDN", "No CDN detected. A CDN reduces TTFB and offloads origin traffic for global audiences.", "Medium", "CDN")

        if hosting.responseTime.value > 800:
            add("Improve Server Response Time", f"TTFB is {hosting.responseTime.label or ''}. Optimize server-side caching, database queries, and hosting.", "High", "Hosting")

        if third_party.count > 4:
            add("Reduce Third Party Scripts", f"{third_party.count} third-party providers detected. Each adds blocking requests — audit and remove unnecessary ones.", "Medium", "Third-Party")

        if cwv.cls.value > 0.1:
            add("Improve Visual Stability", f"CLS is {cwv.cls.value:.2f}. Reserve space for images/ads and use font-display: swap to reduce layout shift.", "Medium", "Core Web Vitals")

        return recs

    # ── Progress callback ────────────────────────────────────────────────

    @staticmethod
    def _emit(on_update, stage: str, url: str, data: Dict[str, Any]) -> None:
        if not on_update:
            return
        try:
            import asyncio
            result = on_update(stage, url, data)
            if asyncio.iscoroutine(result):
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    asyncio.run(result)
                else:
                    task = asyncio.ensure_future(result)
                    task.add_done_callback(
                        lambda t: t.exception() if not t.cancelled() else None
                    )
        except Exception:
            pass


# Singleton instance (matching the rest of the codebase pattern).
performance_audit_service = PerformanceAuditService()
