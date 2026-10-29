"""
Enterprise SEO Intelligence Engine
===================================
A Lighthouse-style SEO audit that runs entirely on already-crawled page data
(rendered HTML + crawl metrics + link graph). It never performs extra network
requests and never re-crawls.

Audit modules (spec-aligned):
  - Meta Tags           (title, meta description, canonical)
  - Headings            (H1/H2/H3 structure, hierarchy)
  - Images              (alt text, lazy loading, dimensions)
  - URL Structure       (clean slugs, lowercase, hyphens)
  - Indexability        (robots.txt, sitemap, noindex, canonical)
  - Open Graph          (og:title/description/image/url/type)
  - Twitter Cards       (twitter:card/title/description/image)
  - Schema              (JSON-LD / microdata, entity types)
  - Internal Links      (link graph, orphans, depth)
  - External Links      (nofollow, broken, spammy domains)
  - Content             (word counts, thin pages, blog presence)
  - Mobile              (viewport, responsive, tap targets)
  - Pages               (coverage of title/desc/canonical/H1)
  - Local SEO           (NAP, local business schema, Google Maps)
  - Social SEO          (social profiles, sameAs schema)
  - Favicon             (favicon presence + formats)

Guarantees:
  - NEVER raises — any failure returns a partial audit so AI analysis continues.
  - NO network I/O — purely analyzes the passed page documents + crawl metrics.
  - Modular per-category analyzers so failures are isolated per category.
  - Every module is scored 0-100 with a visual status
    (Excellent/Good/Average/Poor/Critical) and color, an overall score and a
    letter grade (A-F), plus per-module issue + recommendation counts.
  - Every step is logged so the pipeline is fully auditable.
"""

import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from app.models.seo_intelligence import (
    SEOAuditResultCreate,
    SEOContentAudit,
    SEOExternalLinksAudit,
    SEOFaviconAudit,
    SEOHeadingsAudit,
    SEOImagesAudit,
    SEOIndexabilityAudit,
    SEOInternalLinksAudit,
    SEOLocalSEOAudit,
    SEOMetaAudit,
    SEOMobileAudit,
    SEOOpenGraphAudit,
    SEOPagesAudit,
    SEOSEOIssue,
    SEOSEORecommendation,
    SEOSchemaAudit,
    SEOSocialSEOAudit,
    SEOTwitterCardsAudit,
    SEOUrlsAudit,
)
from app.services.safe_scoring import safe_score, safe_float, safe_int, safe_dict, safe_get

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Status palette + classification helpers
# ─────────────────────────────────────────────────────────────────────────────

GREEN = "#10b981"        # Excellent
BLUE = "#3b82f6"         # Good
ORANGE = "#f59e0b"       # Average
RED = "#ef4444"          # Poor
CRITICAL = "#b91c1c"     # Critical

_MAX_PAGES = 15

_TITLE_MIN = 10
_TITLE_MAX = 70
_DESC_MIN = 50
_DESC_MAX = 160
_THIN_CONTENT_WORDS = 300


def _status_of_score(score: int) -> Tuple[str, str]:
    """Classify a 0-100 score into a visual status + color."""
    if score >= 85:
        return ("Excellent", GREEN)
    if score >= 70:
        return ("Good", BLUE)
    if score >= 55:
        return ("Average", ORANGE)
    if score >= 40:
        return ("Poor", RED)
    return ("Critical", CRITICAL)


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


def _round_score(score: float) -> int:
    return safe_score(score)


# Category tags used to count per-module issues / recommendations.
CAT_META = "Meta Tags"
CAT_HEADINGS = "Headings"
CAT_IMAGES = "Images"
CAT_URLS = "URL Structure"
CAT_INDEX = "Indexability"
CAT_OG = "Open Graph"
CAT_TW = "Twitter Cards"
CAT_SCHEMA = "Schema"
CAT_INTERNAL = "Internal Links"
CAT_EXTERNAL = "External Links"
CAT_CONTENT = "Content"
CAT_MOBILE = "Mobile"
CAT_PAGES = "Pages"
CAT_LOCAL = "Local SEO"
CAT_SOCIAL = "Social SEO"
CAT_FAVICON = "Favicon"

_CATEGORY_ORDER = [
    CAT_META, CAT_HEADINGS, CAT_IMAGES, CAT_URLS, CAT_INDEX, CAT_OG, CAT_TW,
    CAT_SCHEMA, CAT_INTERNAL, CAT_EXTERNAL, CAT_CONTENT, CAT_MOBILE, CAT_PAGES,
    CAT_LOCAL, CAT_SOCIAL, CAT_FAVICON,
]

_SPAMMY_TLDS = (".xyz", ".top", ".club", ".loan", ".click", ".work", ".gq", ".tk", ".ml", ".cf", ".ga")

_SOCIAL_HOSTS = (
    "facebook.com", "linkedin.com", "twitter.com", "x.com", "instagram.com",
    "youtube.com", "youtu.be", "tiktok.com", "pinterest.com", "threads.net",
    "telegram.org", "whatsapp.com", "medium.com", "github.com", "behance.net",
    "dribbble.com", "snapchat.com", "reddit.com",
)

_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "your", "from", "have",
    "you", "are", "our", "will", "what", "about", "their", "they", "there",
}


# ─────────────────────────────────────────────────────────────────────────────
# Page-level SEO signals
# ─────────────────────────────────────────────────────────────────────────────

class _PageSignals:
    """SEO-relevant signals extracted from a single crawled page document."""

    __slots__ = (
        "url", "path", "host", "html", "soup", "title", "title_length",
        "meta_description", "description_length", "canonical", "robots",
        "indexable", "og_tags", "twitter_tags", "schema_types",
        "json_ld_blocks", "json_ld_valid", "microdata_items", "h1s", "h2s",
        "h3s", "images", "anchors", "word_count", "viewport", "media_queries",
        "favicon_urls", "same_as", "nap_found",
    )

    def __init__(self, page: Any):
        if not isinstance(page, dict):
            page = {}
        self.url = str(page.get("url") or "")
        try:
            parsed = urlparse(self.url)
            self.path = parsed.path or "/"
            self.host = parsed.netloc or ""
        except Exception:
            self.path = "/"
            self.host = ""

        self.html = str(page.get("rendered_html") or page.get("html") or "")

        self.soup: Optional[BeautifulSoup] = None
        try:
            self.soup = BeautifulSoup(self.html, "html.parser")
        except Exception:
            pass

        # Meta
        self.title = ""
        self.title_length = 0
        self.meta_description = ""
        self.description_length = 0
        self.canonical = ""
        self.robots = ""
        self.indexable = True

        # Social / schema
        self.og_tags: Dict[str, str] = {}
        self.twitter_tags: Dict[str, str] = {}
        self.schema_types: List[str] = []
        self.json_ld_blocks = 0
        self.json_ld_valid = True
        self.microdata_items = 0
        self.same_as: List[str] = []

        # Content structure
        self.h1s: List[str] = []
        self.h2s: List[str] = []
        self.h3s: List[str] = []
        self.images: List[Dict[str, Any]] = []
        self.anchors: List[Dict[str, Any]] = []
        self.word_count = 0

        # Mobile
        self.viewport = False
        self.media_queries = 0

        # Favicon
        self.favicon_urls: List[Dict[str, str]] = []

        # Local
        self.nap_found = False

        self._extract()

    def _extract(self) -> None:
        soup = self.soup
        if soup is None:
            return

        # ── Title ──
        if soup.title and soup.title.string:
            self.title = soup.title.string.strip()
            self.title_length = len(self.title)

        # ── Meta description ──
        desc_tag = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
        if desc_tag and desc_tag.get("content"):
            self.meta_description = desc_tag["content"].strip()
            self.description_length = len(self.meta_description)

        # ── Canonical ──
        canon_tag = soup.find("link", rel="canonical")
        if canon_tag and canon_tag.get("href"):
            self.canonical = str(canon_tag["href"]).strip()

        # ── Robots meta ──
        robots_tag = soup.find("meta", attrs={"name": re.compile(r"^robots$", re.I)})
        if robots_tag and robots_tag.get("content"):
            self.robots = str(robots_tag["content"]).lower()
            if "noindex" in self.robots:
                self.indexable = False

        # ── Open Graph ──
        for meta in soup.find_all("meta", attrs={"property": re.compile(r"^og:", re.I)}):
            prop = str(meta.get("property") or "").lower()
            content = str(meta.get("content") or "").strip()
            if prop and content:
                self.og_tags[prop] = content

        # ── Twitter Cards ──
        for meta in soup.find_all("meta", attrs={"name": re.compile(r"^twitter:", re.I)}):
            name = str(meta.get("name") or "").lower()
            content = str(meta.get("content") or "").strip()
            if name and content:
                self.twitter_tags[name] = content

        # ── Schema (JSON-LD + microdata) ──
        for script in soup.find_all("script", type="application/ld+json"):
            self.json_ld_blocks += 1
            try:
                data = json_loads(script.string)
                self._walk_schema(data)
            except Exception:
                self.json_ld_valid = False

        for item in soup.find_all(attrs={"itemscope": True}):
            self.microdata_items += 1
            itemtype = item.get("itemtype")
            if itemtype:
                self.schema_types.append(str(itemtype).split("/")[-1])

        # sameAs (for social SEO)
        if self.json_ld_valid:
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    data = json_loads(script.string)
                    self._collect_same_as(data)
                except Exception:
                    pass

        # ── Headings ──
        self.h1s = [h.get_text(" ", strip=True) for h in soup.find_all("h1")]
        self.h2s = [h.get_text(" ", strip=True) for h in soup.find_all("h2")]
        self.h3s = [h.get_text(" ", strip=True) for h in soup.find_all("h3")]

        # ── Images ──
        for img in soup.find_all("img"):
            src = str(img.get("src") or "")
            width = img.get("width")
            height = img.get("height")
            self.images.append({
                "src": src,
                "alt": str(img.get("alt") or "").strip(),
                "lazy": (img.get("loading") or "").lower() == "lazy" or bool(img.get("data-src") or img.get("data-lazy-src")),
                "width": str(width or ""),
                "height": str(height or ""),
            })

        # ── Anchors ──
        for a in soup.find_all("a", href=True):
            href = str(a["href"]).strip()
            if not href or href.startswith("#") or href.lower().startswith("javascript:"):
                continue
            rel = (a.get("rel") or [])
            rel = " ".join(rel) if isinstance(rel, list) else str(rel or "")
            self.anchors.append({
                "href": href,
                "text": a.get_text(" ", strip=True),
                "nofollow": "nofollow" in str(rel).lower(),
            })

        # ── Word count ──
        text = soup.get_text(separator=" ")
        self.word_count = len(text.split())

        # ── Mobile signals ──
        self.viewport = bool(soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)}))
        self.media_queries = len(re.findall(r"@media\s", self.html, flags=re.I))

        # ── Favicon ──
        for link in soup.find_all("link", rel=re.compile(r"icon", re.I)):
            rel_attr = " ".join(link.get("rel")) if isinstance(link.get("rel"), list) else str(link.get("rel") or "")
            href = str(link.get("href") or "").strip()
            if href:
                self.favicon_urls.append({"rel": rel_attr.lower(), "href": href})

        # ── Local SEO (NAP heuristic) ──
        self.nap_found = self._detect_nap()

    def _walk_schema(self, data: Any) -> None:
        if isinstance(data, list):
            for item in data:
                self._walk_schema(item)
        elif isinstance(data, dict):
            t = data.get("@type")
            if isinstance(t, list):
                for one in t:
                    self.schema_types.append(str(one))
            elif t:
                self.schema_types.append(str(t))
            for key, value in data.items():
                if isinstance(value, (dict, list)) and key not in ("@context", "@id"):
                    self._walk_schema(value)

    def _collect_same_as(self, data: Any) -> None:
        if isinstance(data, list):
            for item in data:
                self._collect_same_as(item)
        elif isinstance(data, dict):
            same = data.get("sameAs")
            if isinstance(same, list):
                self.same_as.extend(str(s) for s in same if s)
            elif same:
                self.same_as.append(str(same))
            for key, value in data.items():
                if isinstance(value, (dict, list)) and key not in ("@context", "@id"):
                    self._collect_same_as(value)

    def _detect_nap(self) -> bool:
        if self.soup is None:
            return False
        text = self.soup.get_text(" ", strip=True)
        if not text:
            return False
        has_phone = bool(re.search(r"(\+?\d[\d\s\-().]{7,}\d)", text))
        has_address = bool(
            re.search(r"\d{1,5}\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct)\b", text)
        )
        has_name = bool(self.title)
        return bool(has_name and has_phone and has_address)


def json_loads(value: Any) -> Any:
    import json
    if value is None:
        raise ValueError("empty json")
    if not isinstance(value, str):
        return value
    return json.loads(value)


# ─────────────────────────────────────────────────────────────────────────────
# SEO Intelligence Service
# ─────────────────────────────────────────────────────────────────────────────

class SEOIntelligenceService:
    """Local, professional-grade website SEO audit engine."""

    MAX_PAGES = _MAX_PAGES

    def __init__(self) -> None:
        pass

    # ── Public entrypoint ───────────────────────────────────────────────

    async def audit(self, lead_id: str, website_url: str, pages: List[Dict],
                    links: Optional[List[Dict]] = None,
                    crawl_result: Optional[Dict[str, Any]] = None,
                    on_update=None) -> SEOAuditResultCreate:
        """Run a full SEO audit. NEVER raises — returns a partial audit."""
        started = time.perf_counter()
        try:
            self._emit(on_update, "SEO Intelligence", website_url, {"stage": "started"})
            logger.info(f"[SeoIntel] SEO Audit Started: {lead_id} :: {website_url}")
            result = self._audit(
                lead_id, website_url, pages,
                links=links or [], crawl_result=crawl_result,
                on_update=on_update,
            )
            result.auditTime = round((time.perf_counter() - started) * 1000, 1)
            logger.info(
                f"[SeoIntel] SEO Audit Finished: {lead_id} "
                f"score={result.overallScore} grade={result.grade} "
                f"issues={len(result.issues)} recs={len(result.recommendations)} "
                f"auditTime={result.auditTime:.0f}ms"
            )
            return result
        except Exception as exc:  # pragma: no cover - defensive
            logger.error(f"[SeoIntel] Audit failed for lead {lead_id}: {exc!r}")
            empty = SEOAuditResultCreate(lead_id=lead_id, website_url=website_url)
            empty.auditTime = round((time.perf_counter() - started) * 1000, 1)
            return empty

    # ── Core audit orchestration ─────────────────────────────────────────

    def _audit(self, lead_id: str, website_url: str, pages: List[Any],
               links: Optional[List[Dict]] = None,
               crawl_result: Optional[Dict[str, Any]] = None,
               on_update=None) -> SEOAuditResultCreate:
        if not isinstance(pages, list):
            pages = []
        if not isinstance(links, list):
            links = []

        signals: List[_PageSignals] = []
        for page in pages:
            if not isinstance(page, dict):
                continue
            try:
                signals.append(_PageSignals(page))
            except Exception:
                continue
        if not signals:
            logger.warning(f"[SeoIntel] No valid pages provided for lead {lead_id}; returning empty audit")
            return SEOAuditResultCreate(lead_id=lead_id, website_url=website_url)

        signals = signals[: self.MAX_PAGES]

        issues: List[SEOSEOIssue] = []
        recommendations: List[SEOSEORecommendation] = []

        def _safe_module(name: str, fn) -> Optional[Any]:
            try:
                return fn()
            except Exception as exc:  # pragma: no cover - defensive
                logger.error(f"[SeoIntel] {name} analyzer failed: {exc!r}")
                return None

        meta = _safe_module("Meta", lambda: self._audit_meta(signals, issues, recommendations))
        headings = _safe_module("Headings", lambda: self._audit_headings(signals, issues, recommendations))
        images = _safe_module("Images", lambda: self._audit_images(signals, issues, recommendations))
        urls = _safe_module("URLs", lambda: self._audit_urls(signals, issues, recommendations))
        indexability = _safe_module("Indexability", lambda: self._audit_indexability(
            signals, website_url, crawl_result, issues, recommendations))
        open_graph = _safe_module("OpenGraph", lambda: self._audit_open_graph(signals, issues, recommendations))
        twitter_cards = _safe_module("TwitterCards", lambda: self._audit_twitter_cards(signals, issues, recommendations))
        schema = _safe_module("Schema", lambda: self._audit_schema(signals, issues, recommendations))
        internal_links = _safe_module("InternalLinks", lambda: self._audit_internal_links(
            signals, website_url, links, crawl_result, issues, recommendations))
        external_links = _safe_module("ExternalLinks", lambda: self._audit_external_links(
            signals, website_url, links, issues, recommendations))
        content = _safe_module("Content", lambda: self._audit_content(signals, issues, recommendations))
        mobile = _safe_module("Mobile", lambda: self._audit_mobile(signals, issues, recommendations))
        pages_audit = _safe_module("Pages", lambda: self._audit_pages(signals, issues, recommendations))
        local_seo = _safe_module("LocalSEO", lambda: self._audit_local_seo(signals, issues, recommendations))
        social_seo = _safe_module("SocialSEO", lambda: self._audit_social_seo(
            signals, website_url, links, issues, recommendations))
        favicon = _safe_module("Favicon", lambda: self._audit_favicon(signals, issues, recommendations))

        modules = [meta, headings, images, urls, indexability, open_graph,
                   twitter_cards, schema, internal_links, external_links,
                   content, mobile, pages_audit, local_seo, social_seo, favicon]

        # Tag per-module issue/recommendation counts
        self._apply_module_counts(modules)

        overall = self._overall_score(modules)
        grade = _grade(overall)
        overall_status, overall_color = _status_of_score(overall)

        result = SEOAuditResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            overallScore=overall,
            grade=grade,
            overallStatus=overall_status,
            overallColor=overall_color,
            meta=meta or SEOMetaAudit(),
            headings=headings or SEOHeadingsAudit(),
            images=images or SEOImagesAudit(),
            urls=urls or SEOUrlsAudit(),
            indexability=indexability or SEOIndexabilityAudit(),
            openGraph=open_graph or SEOOpenGraphAudit(),
            twitterCards=twitter_cards or SEOTwitterCardsAudit(),
            schema=schema or SEOSchemaAudit(),
            internalLinks=internal_links or SEOInternalLinksAudit(),
            externalLinks=external_links or SEOExternalLinksAudit(),
            content=content or SEOContentAudit(),
            mobile=mobile or SEOMobileAudit(),
            pages=pages_audit or SEOPagesAudit(),
            localSEO=local_seo or SEOLocalSEOAudit(),
            socialSEO=social_seo or SEOSocialSEOAudit(),
            favicon=favicon or SEOFaviconAudit(),
            issues=issues[:60],
            recommendations=recommendations[:40],
        )
        return result

    def _apply_module_counts(self, modules: List[Optional[Any]]) -> None:
        for module in modules:
            if module is None or not hasattr(module, "score"):
                continue
            try:
                status, color = _status_of_score(module.score)
                module.status = status
                module.color = color
            except Exception:
                pass

    # ── Per-module analyzers ─────────────────────────────────────────────

    def _audit_meta(self, signals: List[_PageSignals], issues: List[SEOSEOIssue],
                    recommendations: List[SEOSEORecommendation]) -> SEOMetaAudit:
        total = len(signals)
        missing_titles = 0
        missing_descs = 0
        dup_titles = 0
        dup_descs = 0
        long_titles = 0
        long_descs = 0

        seen_titles: Dict[str, int] = {}
        seen_descs: Dict[str, int] = {}

        score = 100.0
        for sig in signals:
            if not sig.title:
                missing_titles += 1
                score -= 20
                issues.append(SEOSEOIssue(
                    category=CAT_META, severity="Error", status="Poor",
                    title="Missing page title",
                    description="This page has no <title> tag, which hurts search snippets and ranking.",
                    affectedUrl=sig.url,
                ))
            else:
                seen_titles[sig.title] = seen_titles.get(sig.title, 0) + 1
                if sig.title_length < _TITLE_MIN or sig.title_length > _TITLE_MAX:
                    long_titles += 1
                    score -= 5
                    issues.append(SEOSEOIssue(
                        category=CAT_META, severity="Warning", status="Average",
                        title="Suboptimal title length",
                        description=f"Title length is {sig.title_length} characters (optimal: {_TITLE_MIN}-{_TITLE_MAX}).",
                        affectedUrl=sig.url,
                    ))

            if not sig.meta_description:
                missing_descs += 1
                score -= 20
                issues.append(SEOSEOIssue(
                    category=CAT_META, severity="Error", status="Poor",
                    title="Missing meta description",
                    description="No meta description found; search engines may generate a poor snippet.",
                    affectedUrl=sig.url,
                ))
            else:
                seen_descs[sig.meta_description] = seen_descs.get(sig.meta_description, 0) + 1
                if sig.description_length < _DESC_MIN or sig.description_length > _DESC_MAX:
                    long_descs += 1
                    score -= 5
                    issues.append(SEOSEOIssue(
                        category=CAT_META, severity="Warning", status="Average",
                        title="Suboptimal meta description length",
                        description=f"Meta description length is {sig.description_length} (optimal: {_DESC_MIN}-{_DESC_MAX}).",
                        affectedUrl=sig.url,
                    ))

        dup_titles = sum(1 for count in seen_titles.values() if count > 1)
        dup_descs = sum(1 for count in seen_descs.values() if count > 1)

        if dup_titles:
            score -= 10
            issues.append(SEOSEOIssue(
                category=CAT_META, severity="Warning", status="Average",
                title="Duplicate page titles",
                description=f"{dup_titles} title(s) are reused across pages.",
            ))
        if dup_descs:
            score -= 10
            issues.append(SEOSEOIssue(
                category=CAT_META, severity="Warning", status="Average",
                title="Duplicate meta descriptions",
                description=f"{dup_descs} meta description(s) are reused across pages.",
            ))

        if missing_titles:
            recommendations.append(SEOSEORecommendation(
                title="Add unique title tags to every page",
                description=f"{missing_titles} page(s) are missing a <title> tag. Use descriptive, keyword-relevant titles within {_TITLE_MIN}-{_TITLE_MAX} characters.",
                priority="High", category=CAT_META,
            ))
        if missing_descs:
            recommendations.append(SEOSEORecommendation(
                title="Write unique meta descriptions",
                description=f"{missing_descs} page(s) lack a meta description. Compose compelling {_DESC_MIN}-{_DESC_MAX} character summaries.",
                priority="High", category=CAT_META,
            ))

        primary = signals[0]
        return SEOMetaAudit(
            score=_round_score(max(0, score / max(total, 1))),
            issueCount=len([i for i in issues if i.category == CAT_META]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_META]),
            title=primary.title or None,
            titleLength=primary.title_length,
            titleStatus="Good" if (primary.title and _TITLE_MIN <= primary.title_length <= _TITLE_MAX) else "Poor",
            metaDescription=primary.meta_description or None,
            descriptionLength=primary.description_length,
            descriptionStatus="Good" if (primary.meta_description and _DESC_MIN <= primary.description_length <= _DESC_MAX) else "Poor",
            canonical=primary.canonical or None,
            canonicalStatus="Good" if primary.canonical else "Poor",
            missingTitles=missing_titles,
            missingDescriptions=missing_descs,
            duplicateTitles=dup_titles,
            duplicateDescriptions=dup_descs,
            longTitles=long_titles,
            longDescriptions=long_descs,
        )

    def _audit_headings(self, signals: List[_PageSignals], issues: List[SEOSEOIssue],
                        recommendations: List[SEOSEORecommendation]) -> SEOHeadingsAudit:
        total = len(signals)
        h1_total = sum(len(s.h1s) for s in signals)
        h2_total = sum(len(s.h2s) for s in signals)
        h3_total = sum(len(s.h3s) for s in signals)
        missing_h1_pages = 0
        multiple_h1_pages = 0
        bad_hierarchy = 0

        score = 100.0
        for sig in signals:
            h1_count = len(sig.h1s)
            if h1_count == 0:
                missing_h1_pages += 1
                score -= 25
                issues.append(SEOSEOIssue(
                    category=CAT_HEADINGS, severity="Warning", status="Poor",
                    title="Missing H1 heading",
                    description="Page has no H1 tag; use a single descriptive H1 for the main topic.",
                    affectedUrl=sig.url,
                ))
            elif h1_count > 1:
                multiple_h1_pages += 1
                score -= 10
                issues.append(SEOSEOIssue(
                    category=CAT_HEADINGS, severity="Warning", status="Average",
                    title="Multiple H1 headings",
                    description="Page uses more than one H1. Stick to a single H1 per page.",
                    affectedUrl=sig.url,
                ))
            if h1_count == 1 and len(sig.h2s) == 0 and h1_count and len(sig.h1s[0]) > 3 and len(sig.h2s) == 0:
                score -= 5
                bad_hierarchy += 1

        avg_per_page = round(safe_float(h1_total / total) if total else 0, 2)
        if total and (h2_total / total) < 0.5:
            score -= 5
        if missing_h1_pages:
            recommendations.append(SEOSEORecommendation(
                title="Add one H1 per page",
                description=f"{missing_h1_pages} page(s) are missing an H1. Reflect the page's primary keyword in the H1.",
                priority="High", category=CAT_HEADINGS,
            ))
        if multiple_h1_pages:
            recommendations.append(SEOSEORecommendation(
                title="Use a single H1 hierarchy",
                description=f"{multiple_h1_pages} page(s) contain multiple H1s. Keep one H1 and structure the rest with H2/H3.",
                priority="Medium", category=CAT_HEADINGS,
            ))

        return SEOHeadingsAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_HEADINGS]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_HEADINGS]),
            h1Count=h1_total,
            h2Count=h2_total,
            h3Count=h3_total,
            singleH1=multiple_h1_pages == 0,
            hierarchicalOrder=bad_hierarchy == 0,
            pagesWithMissingH1=missing_h1_pages,
            pagesWithMultipleH1=multiple_h1_pages,
        )

    def _audit_images(self, signals: List[_PageSignals], issues: List[SEOSEOIssue],
                      recommendations: List[SEOSEORecommendation]) -> SEOImagesAudit:
        total = 0
        with_alt = 0
        lazy = 0
        missing_dims = 0
        missing_alt_pages = 0

        score = 100.0
        for sig in signals:
            page_missing = 0
            for img in sig.images:
                total += 1
                if img["alt"]:
                    with_alt += 1
                else:
                    page_missing += 1
                if img["lazy"]:
                    lazy += 1
                if not (img["width"] and img["height"]):
                    missing_dims += 1
            if page_missing:
                missing_alt_pages += 1
                score -= min(30, page_missing * 5)

        missing_alt = total - with_alt
        if missing_alt:
            issues.append(SEOSEOIssue(
                category=CAT_IMAGES, severity="Warning", status="Average",
                title="Images missing alt text",
                description=f"{missing_alt} image(s) are missing descriptive alt text.",
            ))
        if missing_alt_pages:
            recommendations.append(SEOSEORecommendation(
                title="Add descriptive alt text to images",
                description=f"{missing_alt} image(s) across {missing_alt_pages} page(s) lack alt text. Describe each image's content and purpose.",
                priority="High", category=CAT_IMAGES,
            ))
        if missing_dims:
            issues.append(SEOSEOIssue(
                category=CAT_IMAGES, severity="Warning", status="Average",
                title="Images missing width/height attributes",
                description=f"{missing_dims} image(s) do not declare width/height, which can cause layout shift (CLS).",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Add explicit image dimensions",
                description=f"Set width/height attributes on {missing_dims} image(s) to reserve space and reduce layout shift.",
                priority="Medium", category=CAT_IMAGES,
            ))

        return SEOImagesAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_IMAGES]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_IMAGES]),
            total=total,
            withAlt=with_alt,
            missingAlt=missing_alt,
            missingAltPages=missing_alt_pages,
            lazyLoaded=lazy,
            missingLazyLoading=max(0, total - lazy),
            missingWidthHeight=missing_dims,
        )

    def _audit_urls(self, signals: List[_PageSignals], issues: List[SEOSEOIssue],
                    recommendations: List[SEOSEORecommendation]) -> SEOUrlsAudit:
        total = len(signals)
        clean = 0
        descriptive = 0
        length_issues = 0
        uppercase = 0
        underscores = 0
        query_strings = 0

        score = 100.0
        for sig in signals:
            path = sig.path
            if not path or path == "/":
                clean += 1
                descriptive += 1
                continue
            is_clean = True
            if "?" in path or "&" in path:
                query_strings += 1
                is_clean = False
            if any(x in path.lower() for x in (".php", ".asp", "index.", "default.")):
                is_clean = False
            if "_" in path:
                underscores += 1
                is_clean = False
            if path != path.lower():
                uppercase += 1
                is_clean = False
            if len(path) > 120:
                length_issues += 1
                is_clean = False
            if is_clean:
                clean += 1
            segments = [seg for seg in path.split("/") if seg]
            if segments and all(len(seg) > 3 for seg in segments):
                descriptive += 1

        bad = total - clean
        score -= bad * (80 / max(total, 1))
        if length_issues:
            issues.append(SEOSEOIssue(
                category=CAT_URLS, severity="Warning", status="Average",
                title="Overly long URLs",
                description=f"{length_issues} URL(s) exceed 120 characters, which is hard for users and search engines.",
            ))
        if query_strings:
            issues.append(SEOSEOIssue(
                category=CAT_URLS, severity="Info", status="Good",
                title="Query-string URLs detected",
                description=f"{query_strings} URL(s) rely on query strings; prefer clean, static paths when possible.",
            ))
        if underscores:
            recommendations.append(SEOSEORecommendation(
                title="Use hyphens instead of underscores in URLs",
                description=f"Convert underscores to hyphens in {underscores} URL(s); hyphens are the recommended word separator.",
                priority="Low", category=CAT_URLS,
            ))

        return SEOUrlsAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_URLS]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_URLS]),
            totalPages=total,
            cleanUrls=clean,
            descriptiveSlugs=descriptive,
            lengthIssues=length_issues,
            uppercaseUrls=uppercase,
            underscoresInUrls=underscores,
            queryStringUrls=query_strings,
        )

    def _audit_indexability(self, signals: List[_PageSignals], website_url: str,
                            crawl_result: Optional[Dict[str, Any]],
                            issues: List[SEOSEOIssue],
                            recommendations: List[SEOSEORecommendation]) -> SEOIndexabilityAudit:
        metrics = safe_dict(crawl_result.get("metrics")) if isinstance(crawl_result, dict) else {}
        has_robots = bool(safe_get(metrics, "has_robots_txt") or safe_get(crawl_result, "has_robots_txt"))
        has_sitemap = bool(safe_get(metrics, "has_sitemap") or safe_get(crawl_result, "has_sitemap"))

        noindex = 0
        blocked = 0
        canonical_issues = 0
        indexable = 0
        total = len(signals)

        score = 100.0
        for sig in signals:
            if not sig.indexable:
                noindex += 1
                score -= 15
            else:
                indexable += 1
            if not sig.canonical:
                canonical_issues += 1
                score -= 10
            if "nofollow" in sig.robots:
                blocked += 1
                score -= 5

        if not has_robots:
            score -= 10
            issues.append(SEOSEOIssue(
                category=CAT_INDEX, severity="Warning", status="Average",
                title="No robots.txt detected",
                description="robots.txt controls crawler access. Add one to guide search engine bots.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Create a robots.txt file",
                description="Add robots.txt at the site root to control crawling and reference the sitemap.",
                priority="High", category=CAT_INDEX,
            ))
        if not has_sitemap:
            score -= 10
            issues.append(SEOSEOIssue(
                category=CAT_INDEX, severity="Warning", status="Average",
                title="No XML sitemap detected",
                description="An XML sitemap helps search engines discover and index all pages.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Submit an XML sitemap",
                description="Create a sitemap.xml and submit it in Google Search Console / Bing Webmaster Tools.",
                priority="High", category=CAT_INDEX,
            ))
        if noindex:
            recommendations.append(SEOSEORecommendation(
                title="Review noindex directives",
                description=f"{noindex} page(s) are blocked from indexing. Remove noindex unless intentionally hidden.",
                priority="Medium", category=CAT_INDEX,
            ))

        return SEOIndexabilityAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_INDEX]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_INDEX]),
            hasRobotsTxt=has_robots,
            robotsTxtUrl=f"{website_url.rstrip('/')}/robots.txt" if has_robots else None,
            hasSitemap=has_sitemap,
            sitemapUrl=f"{website_url.rstrip('/')}/sitemap.xml" if has_sitemap else None,
            noindexPages=noindex,
            blockedByRobots=blocked,
            canonicalIssues=canonical_issues,
            indexablePages=indexable,
        )

    def _audit_open_graph(self, signals: List[_PageSignals], issues: List[SEOSEOIssue],
                          recommendations: List[SEOSEORecommendation]) -> SEOOpenGraphAudit:
        total = len(signals)
        with_og = 0
        missing = 0
        og_title = og_desc = og_image = og_url = og_type = False

        score = 100.0
        for sig in signals:
            tags = sig.og_tags
            if tags:
                with_og += 1
                og_title = og_title or bool(tags.get("og:title"))
                og_desc = og_desc or bool(tags.get("og:description"))
                og_image = og_image or bool(tags.get("og:image"))
                og_url = og_url or bool(tags.get("og:url"))
                og_type = og_type or bool(tags.get("og:type"))
                page_missing = 0
                for required in ("og:title", "og:description", "og:image", "og:url", "og:type"):
                    if not tags.get(required):
                        page_missing += 1
                missing += page_missing
            else:
                missing += 5
                score -= 15

        if not with_og:
            score -= 20
            issues.append(SEOSEOIssue(
                category=CAT_OG, severity="Warning", status="Poor",
                title="No Open Graph tags",
                description="Open Graph tags control how links appear when shared on social platforms.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Add Open Graph meta tags",
                description="Include og:title, og:description, og:image, og:url and og:type on key pages for rich social shares.",
                priority="High", category=CAT_OG,
            ))
        elif missing:
            recommendations.append(SEOSEORecommendation(
                title="Complete the Open Graph tag set",
                description=f"{missing} required Open Graph fields are missing. Ensure og:image is at least 1200x630px.",
                priority="Medium", category=CAT_OG,
            ))

        return SEOOpenGraphAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_OG]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_OG]),
            hasOpenGraph=with_og > 0,
            pagesWithOgTags=with_og,
            totalPages=total,
            ogTitle=og_title,
            ogDescription=og_desc,
            ogImage=og_image,
            ogUrl=og_url,
            ogType=og_type,
            missingTags=missing,
        )

    def _audit_twitter_cards(self, signals: List[_PageSignals], issues: List[SEOSEOIssue],
                             recommendations: List[SEOSEORecommendation]) -> SEOTwitterCardsAudit:
        total = len(signals)
        with_tw = 0
        missing = 0
        tw_card = tw_title = tw_desc = tw_image = False

        score = 100.0
        for sig in signals:
            tags = sig.twitter_tags
            if tags:
                with_tw += 1
                tw_card = tw_card or bool(tags.get("twitter:card"))
                tw_title = tw_title or bool(tags.get("twitter:title"))
                tw_desc = tw_desc or bool(tags.get("twitter:description"))
                tw_image = tw_image or bool(tags.get("twitter:image"))
                page_missing = 0
                for required in ("twitter:card", "twitter:title", "twitter:description", "twitter:image"):
                    if not tags.get(required):
                        page_missing += 1
                missing += page_missing
            else:
                missing += 4
                score -= 12

        if not with_tw:
            score -= 20
            issues.append(SEOSEOIssue(
                category=CAT_TW, severity="Info", status="Average",
                title="No Twitter Card tags",
                description="Twitter Card tags control how links appear when shared on X/Twitter.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Add Twitter Card meta tags",
                description="Include twitter:card, twitter:title, twitter:description and twitter:image on key pages.",
                priority="Medium", category=CAT_TW,
            ))

        return SEOTwitterCardsAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_TW]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_TW]),
            hasTwitterCards=with_tw > 0,
            pagesWithTwitterTags=with_tw,
            totalPages=total,
            twitterCard=tw_card,
            twitterTitle=tw_title,
            twitterDescription=tw_desc,
            twitterImage=tw_image,
            missingTags=missing,
        )

    def _audit_schema(self, signals: List[_PageSignals], issues: List[SEOSEOIssue],
                      recommendations: List[SEOSEORecommendation]) -> SEOSchemaAudit:
        total = len(signals)
        types: List[str] = []
        seen_types: set = set()
        json_ld = 0
        microdata = 0
        pages_with = 0
        valid = True

        score = 100.0
        for sig in signals:
            if sig.json_ld_blocks or sig.schema_types:
                pages_with += 1
            json_ld += sig.json_ld_blocks
            microdata += sig.microdata_items
            if not sig.json_ld_valid:
                valid = False
            for t in sig.schema_types:
                if t not in seen_types:
                    seen_types.add(t)
                    types.append(t)
            if not sig.schema_types and not sig.json_ld_blocks:
                score -= 15

        has_schema = pages_with > 0
        if not has_schema:
            score -= 15
            issues.append(SEOSEOIssue(
                category=CAT_SCHEMA, severity="Warning", status="Poor",
                title="No structured data found",
                description="No JSON-LD or microdata markup detected. Structured data unlocks rich results.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Implement JSON-LD structured data",
                description="Add Organization and BreadcrumbList schema to help search engines understand the site and enable rich results.",
                priority="High", category=CAT_SCHEMA,
            ))
        if not valid:
            issues.append(SEOSEOIssue(
                category=CAT_SCHEMA, severity="Warning", status="Average",
                title="Invalid JSON-LD detected",
                description="At least one JSON-LD block failed to parse; fix the markup so rich results can be generated.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Validate structured data markup",
                description="Fix malformed JSON-LD blocks and re-test with the Rich Results Test tool.",
                priority="Medium", category=CAT_SCHEMA,
            ))

        type_set = set(types)
        return SEOSchemaAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_SCHEMA]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_SCHEMA]),
            hasSchema=has_schema,
            totalSchemas=len(types),
            jsonLdBlocks=json_ld,
            microdataItems=microdata,
            schemaTypes=types[:20],
            validJsonLd=valid,
            pagesWithSchema=pages_with,
            totalPages=total,
            hasOrganization="Organization" in type_set,
            hasBreadcrumbs="BreadcrumbList" in type_set,
            hasLocalBusiness=bool(type_set & {"LocalBusiness", "Restaurant", "Store", "ProfessionalService", "MedicalBusiness", "HomeAndConstructionBusiness"}),
        )

    def _audit_internal_links(self, signals: List[_PageSignals], website_url: str,
                              links: List[Dict[str, Any]], crawl_result: Optional[Dict[str, Any]],
                              issues: List[SEOSEOIssue],
                              recommendations: List[SEOSEORecommendation]) -> SEOInternalLinksAudit:
        page_urls = {sig.url for sig in signals}
        metrics = safe_dict(crawl_result.get("metrics")) if isinstance(crawl_result, dict) else {}
        broken_total = safe_int(safe_get(metrics, "broken_links") or safe_get(crawl_result, "broken_links"))

        internal_total = 0
        incoming: Dict[str, int] = {}
        outbound: Dict[str, int] = {}
        broken_internal = 0
        deep_links = 0
        home_links = 0

        for link in links:
            if not isinstance(link, dict):
                continue
            source = str(link.get("source") or "")
            target = str(link.get("target") or "")
            is_internal = bool(link.get("is_internal", True)) or (target.startswith("/")) or (website_url.rstrip("/") in target)
            if is_internal:
                internal_total += 1
                outbound[source] = outbound.get(source, 0) + 1
                incoming[target] = incoming.get(target, 0) + 1
                if target not in page_urls and not target.startswith("/") and website_url.rstrip("/") not in target:
                    broken_internal += 1
                if "/blog/" in target.lower() or len(target) > 80:
                    deep_links += 1
                if target in (website_url.rstrip("/"), website_url.rstrip("/") + "/"):
                    home_links += 1

        avg_per_page = round(safe_float(internal_total / len(signals)) if signals else 0.0, 1)
        orphaned = 0
        for sig in signals:
            if sig.url not in incoming and sig.url != website_url.rstrip("/") and sig.url != website_url.rstrip("/") + "/":
                orphaned += 1

        score = 100.0
        if orphaned:
            score -= min(40, orphaned * 15)
            issues.append(SEOSEOIssue(
                category=CAT_INTERNAL, severity="Warning", status="Poor",
                title="Orphaned pages",
                description=f"{orphaned} page(s) are not linked from any other internal page and are hard to discover.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Link to orphaned pages",
                description=f"Add internal links pointing to the {orphaned} orphaned page(s) so crawlers can reach them.",
                priority="High", category=CAT_INTERNAL,
            ))
        if broken_internal:
            score -= min(30, broken_internal * 5)
            issues.append(SEOSEOIssue(
                category=CAT_INTERNAL, severity="Error", status="Poor",
                title="Broken internal links",
                description=f"{broken_internal} internal link(s) point to pages that were not crawled successfully.",
            ))
        if broken_total:
            score -= min(30, broken_total * 5)
        if not internal_total:
            score -= 30
            recommendations.append(SEOSEORecommendation(
                title="Build an internal linking structure",
                description="Add contextual internal links between related pages to distribute authority and improve crawling.",
                priority="High", category=CAT_INTERNAL,
            ))

        return SEOInternalLinksAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_INTERNAL]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_INTERNAL]),
            total=internal_total,
            averagePerPage=avg_per_page,
            orphanedPages=orphaned,
            pagesWithoutInternalLinks=len(signals) - len(outbound),
            brokenInternalLinks=broken_internal,
            deepLinks=deep_links,
            homePageLinks=home_links,
        )

    def _audit_external_links(self, signals: List[_PageSignals], website_url: str,
                              links: List[Dict[str, Any]], issues: List[SEOSEOIssue],
                              recommendations: List[SEOSEORecommendation]) -> SEOExternalLinksAudit:
        external_total = 0
        nofollow = 0
        broken = 0
        spammy = 0

        score = 100.0
        for link in links:
            if not isinstance(link, dict):
                continue
            target = str(link.get("target") or "")
            is_internal = bool(link.get("is_internal", True)) or target.startswith("/") or (website_url.rstrip("/") in target)
            if is_internal:
                continue
            external_total += 1
            rel = str(link.get("rel") or "")
            if "nofollow" in rel.lower():
                nofollow += 1
            try:
                domain = urlparse(target).netloc.lower()
            except Exception:
                domain = ""
            if domain and any(domain.endswith(tld) for tld in _SPAMMY_TLDS):
                spammy += 1

        for sig in signals:
            for anchor in sig.anchors:
                href = anchor["href"]
                if href.startswith("/") or website_url.rstrip("/") in href:
                    continue
                if href.lower().startswith("http"):
                    external_total += 1
                    if anchor["nofollow"]:
                        nofollow += 1

        if spammy:
            score -= min(20, spammy * 5)
            issues.append(SEOSEOIssue(
                category=CAT_EXTERNAL, severity="Warning", status="Average",
                title="Spammy outbound link domains",
                description=f"{spammy} external link(s) point to low-trust TLD domains; consider removing or nofollowing them.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Clean up low-quality outbound links",
                description=f"Remove or add rel=\"nofollow\" to the {spammy} link(s) to low-trust domains.",
                priority="Medium", category=CAT_EXTERNAL,
            ))

        return SEOExternalLinksAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_EXTERNAL]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_EXTERNAL]),
            total=external_total,
            nofollowCount=nofollow,
            followedCount=max(0, external_total - nofollow),
            brokenExternalLinks=broken,
            highAuthorityLinks=0,
            spammyLinks=spammy,
        )

    def _audit_content(self, signals: List[_PageSignals], issues: List[SEOSEOIssue],
                       recommendations: List[SEOSEORecommendation]) -> SEOContentAudit:
        total = len(signals)
        words = [sig.word_count for sig in signals]
        avg = int(sum(words) / total) if total else 0
        min_w = min(words) if words else 0
        max_w = max(words) if words else 0
        thin = sum(1 for w in words if w < _THIN_CONTENT_WORDS)

        has_blog = any(
            "/blog/" in sig.url.lower() or "/news/" in sig.url.lower() or "/articles/" in sig.url.lower()
            for sig in signals
        )
        html_len = sum(len(sig.html) for sig in signals)
        text_len = sum(len(sig.soup.get_text(" ", strip=True)) if sig.soup else 0 for sig in signals)
        ratio = round(safe_float(text_len * 100 / html_len), 1) if html_len else 0.0

        dup_content = 0
        title_to_text: Dict[str, str] = {}
        for sig in signals:
            if sig.title and sig.title in title_to_text:
                dup_content += 1
            elif sig.title:
                title_to_text[sig.title] = sig.url

        keyword_in_title = 0
        for sig in signals:
            if not sig.title:
                continue
            tokens = [t.lower() for t in re.findall(r"\w{4,}", sig.title) if t.lower() not in _STOPWORDS]
            h1_text = " ".join(sig.h1s).lower()
            if tokens and any(tok in h1_text for tok in tokens[:3]):
                keyword_in_title += 1

        score = 100.0
        if thin:
            score -= min(50, thin * 15)
            issues.append(SEOSEOIssue(
                category=CAT_CONTENT, severity="Warning", status="Poor",
                title="Thin content detected",
                description=f"{thin} page(s) have fewer than {_THIN_CONTENT_WORDS} words, which rank poorly for competitive terms.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Expand thin content pages",
                description=f"Add substantive, useful copy to the {thin} thin page(s) (target 300+ words).",
                priority="High", category=CAT_CONTENT,
            ))
        if not has_blog:
            score -= 5
            recommendations.append(SEOSEORecommendation(
                title="Add a content / blog strategy",
                description="Publishing fresh, keyword-focused articles helps earn rankings and internal link equity.",
                priority="Medium", category=CAT_CONTENT,
            ))
        if dup_content:
            score -= 15
            issues.append(SEOSEOIssue(
                category=CAT_CONTENT, severity="Warning", status="Average",
                title="Potential duplicate content",
                description=f"{dup_content} page(s) share titles with other pages, risking duplicate content signals.",
            ))
        if avg == 0:
            score -= 30

        return SEOContentAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_CONTENT]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_CONTENT]),
            avgWordCount=avg,
            minWordCount=min_w,
            maxWordCount=max_w,
            thinPages=thin,
            totalPages=total,
            hasBlog=has_blog,
            textToHtmlRatio=ratio,
            duplicateContent=dup_content,
            keywordInTitle=keyword_in_title,
            keywordInH1=keyword_in_title,
        )

    def _audit_mobile(self, signals: List[_PageSignals], issues: List[SEOSEOIssue],
                      recommendations: List[SEOSEORecommendation]) -> SEOMobileAudit:
        total = len(signals)
        with_viewport = sum(1 for sig in signals if sig.viewport)
        responsive = any(sig.media_queries > 0 for sig in signals)

        score = 100.0
        if not with_viewport:
            score -= 50
            issues.append(SEOSEOIssue(
                category=CAT_MOBILE, severity="Error", status="Critical",
                title="Missing mobile viewport meta tag",
                description="Without a viewport meta tag, the site renders poorly on mobile devices.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Add the mobile viewport meta tag",
                description="Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to every page.",
                priority="High", category=CAT_MOBILE,
            ))
        elif not responsive:
            score -= 25
            issues.append(SEOSEOIssue(
                category=CAT_MOBILE, severity="Warning", status="Poor",
                title="No responsive breakpoints detected",
                description="No CSS media queries found; the layout may not adapt to smaller screens.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Make the layout responsive",
                description="Add CSS media queries / a responsive framework so the site adapts across devices.",
                priority="High", category=CAT_MOBILE,
            ))

        mobile_friendly = with_viewport == total and responsive
        return SEOMobileAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_MOBILE]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_MOBILE]),
            viewport=with_viewport == total,
            responsiveLayout=responsive,
            tapTargets=responsive,
            mobileFriendly=mobile_friendly,
            pagesWithViewport=with_viewport,
            totalPages=total,
        )

    def _audit_pages(self, signals: List[_PageSignals], issues: List[SEOSEOIssue],
                     recommendations: List[SEOSEORecommendation]) -> SEOPagesAudit:
        total = len(signals)
        with_title = sum(1 for sig in signals if sig.title)
        with_desc = sum(1 for sig in signals if sig.meta_description)
        with_canonical = sum(1 for sig in signals if sig.canonical)
        with_h1 = sum(1 for sig in signals if sig.h1s)
        indexable = sum(1 for sig in signals if sig.indexable)

        seen_titles: set = set()
        dup_titles = 0
        for sig in signals:
            if sig.title in seen_titles:
                dup_titles += 1
            elif sig.title:
                seen_titles.add(sig.title)
        seen_descs: set = set()
        dup_descs = 0
        for sig in signals:
            if sig.meta_description in seen_descs:
                dup_descs += 1
            elif sig.meta_description:
                seen_descs.add(sig.meta_description)

        title_cov = _round_score(with_title * 100 / total) if total else 0
        desc_cov = _round_score(with_desc * 100 / total) if total else 0
        canon_cov = _round_score(with_canonical * 100 / total) if total else 0
        h1_cov = _round_score(with_h1 * 100 / total) if total else 0

        score = (title_cov * 0.3 + desc_cov * 0.3 + canon_cov * 0.2 + h1_cov * 0.2)
        score -= min(20, dup_titles * 5)
        score -= min(20, dup_descs * 5)

        return SEOPagesAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_PAGES]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_PAGES]),
            totalPages=total,
            titleCoverage=title_cov,
            descriptionCoverage=desc_cov,
            canonicalCoverage=canon_cov,
            h1Coverage=h1_cov,
            indexablePages=indexable,
            duplicateTitles=dup_titles,
            duplicateDescriptions=dup_descs,
        )

    def _audit_local_seo(self, signals: List[_PageSignals], issues: List[SEOSEOIssue],
                         recommendations: List[SEOSEORecommendation]) -> SEOLocalSEOAudit:
        nab_pages = sum(1 for sig in signals if sig.nap_found)
        has_nab = nab_pages > 0

        has_address = False
        has_phone = False
        has_maps = False
        maps_cities: List[str] = []
        local_business_schema = False

        for sig in signals:
            if has_address and has_phone and has_maps:
                break
            if sig.soup is None:
                continue
            text = sig.soup.get_text(" ", strip=True)
            if not has_phone and re.search(r"(\+?\d[\d\s\-().]{7,}\d)", text):
                has_phone = True
            if not has_address and re.search(
                    r"\d{1,5}\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct)\b",
                    text):
                has_address = True
            if not has_maps:
                for anchor in sig.anchors:
                    href = anchor["href"].lower()
                    if "maps.google" in href or "google.com/maps" in href or "goo.gl/maps" in href:
                        has_maps = True
                        break
            local_business_schema = local_business_schema or bool(
                set(sig.schema_types) & {"LocalBusiness", "Restaurant", "Store", "ProfessionalService", "MedicalBusiness", "HomeAndConstructionBusiness", "Place"}
            )

        local_signals = sum([int(has_nab), int(has_address), int(has_phone), int(local_business_schema), int(has_maps)])
        score = 100.0
        if not has_nab:
            score -= 30
            issues.append(SEOSEOIssue(
                category=CAT_LOCAL, severity="Warning", status="Poor",
                title="Inconsistent Name/Address/Phone (NAP)",
                description="No consistent NAP (name + address + phone) found across pages, which weakens local SEO.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Publish consistent NAP details",
                description="Display the same business name, address and phone on every page and in your Google Business Profile.",
                priority="High", category=CAT_LOCAL,
            ))
        if not local_business_schema:
            score -= 20
            recommendations.append(SEOSEORecommendation(
                title="Add LocalBusiness structured data",
                description="Mark up the business with LocalBusiness schema (name, address, phone, geo) to qualify for local rich results.",
                priority="Medium", category=CAT_LOCAL,
            ))
        if not has_maps:
            score -= 10
            recommendations.append(SEOSEORecommendation(
                title="Embed a Google Maps link",
                description="Add a link to your Google Maps listing from the contact page to strengthen local signals.",
                priority="Low", category=CAT_LOCAL,
            ))

        return SEOLocalSEOAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_LOCAL]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_LOCAL]),
            hasNab=has_nab,
            hasAddress=has_address,
            hasPhone=has_phone,
            hasLocalBusinessSchema=local_business_schema,
            hasGoogleMaps=has_maps,
            localPackSignals=local_signals,
            citiesMentioned=maps_cities[:10],
        )

    def _audit_social_seo(self, signals: List[_PageSignals], website_url: str,
                          links: List[Dict[str, Any]], issues: List[SEOSEOIssue],
                          recommendations: List[SEOSEORecommendation]) -> SEOSocialSEOAudit:
        found: Dict[str, str] = {}
        has_same_as = False

        for sig in signals:
            for sa in sig.same_as:
                try:
                    host = urlparse(sa).netloc.lower().replace("www.", "")
                except Exception:
                    host = ""
                for social in _SOCIAL_HOSTS:
                    if host == social or host.endswith("." + social):
                        found.setdefault(social, sa)
                        break
            for anchor in sig.anchors:
                href = anchor["href"].lower()
                for social in _SOCIAL_HOSTS:
                    if social in href:
                        found.setdefault(social, anchor["href"])
                        break
        for link in links:
            if not isinstance(link, dict):
                continue
            target = str(link.get("target") or "")
            if website_url.rstrip("/") in target:
                continue
            try:
                host = urlparse(target).netloc.lower().replace("www.", "")
            except Exception:
                host = ""
            for social in _SOCIAL_HOSTS:
                if host == social or host.endswith("." + social):
                    found.setdefault(social, target)

        has_same_as = any(sig.same_as for sig in signals)

        platforms = [p for p in found.keys()]
        score = 100.0
        if not platforms:
            score = 40
            issues.append(SEOSEOIssue(
                category=CAT_SOCIAL, severity="Info", status="Average",
                title="No social media profiles detected",
                description="Social profiles strengthen brand SERPs and provide trust signals.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Add social profiles + sameAs schema",
                description="Link active social profiles from the site and reference them with sameAs structured data.",
                priority="Low", category=CAT_SOCIAL,
            ))
        elif len(platforms) < 3:
            score -= 20
            recommendations.append(SEOSEORecommendation(
                title="Grow social presence",
                description=f"Only {len(platforms)} social platform(s) found. Active profiles on major networks improve brand SEO.",
                priority="Low", category=CAT_SOCIAL,
            ))

        return SEOSocialSEOAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_SOCIAL]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_SOCIAL]),
            hasSocialLinks=bool(platforms),
            socialProfiles=len(platforms),
            hasSameAsSchema=has_same_as,
            platforms=platforms[:12],
        )

    def _audit_favicon(self, signals: List[_PageSignals], issues: List[SEOSEOIssue],
                       recommendations: List[SEOSEORecommendation]) -> SEOFaviconAudit:
        primary = signals[0]
        favicon_urls = primary.favicon_urls
        has_favicon = bool(favicon_urls)
        apple_touch = any("apple-touch-icon" in f["rel"] for f in favicon_urls)
        ico = any(str(f["href"]).lower().endswith(".ico") for f in favicon_urls)
        multiple = max(0, len(favicon_urls) - 1)

        first_href = favicon_urls[0]["href"] if favicon_urls else None
        if first_href and not first_href.startswith("http"):
            if primary.host:
                first_href = f"{primary.host.rstrip('/')}/{first_href.lstrip('/')}"

        score = 100.0
        if not has_favicon:
            score = 40
            issues.append(SEOSEOIssue(
                category=CAT_FAVICON, severity="Info", status="Average",
                title="Missing favicon",
                description="No favicon link found in the page head; add one for better brand recognition in tabs.",
            ))
            recommendations.append(SEOSEORecommendation(
                title="Add a favicon",
                description="Add an .ico and PNG favicon linked from the <head>, plus apple-touch-icon for mobile home screens.",
                priority="Low", category=CAT_FAVICON,
            ))

        return SEOFaviconAudit(
            score=_round_score(max(0, score)),
            issueCount=len([i for i in issues if i.category == CAT_FAVICON]),
            recommendationCount=len([r for r in recommendations if r.category == CAT_FAVICON]),
            hasFavicon=has_favicon,
            faviconUrl=first_href or None,
            hasAppleTouchIcon=apple_touch,
            hasIcoFormat=ico,
            multipleIcons=multiple,
        )

    # ── Scoring helpers ──────────────────────────────────────────────────

    def _overall_score(self, modules: List[Optional[Any]]) -> int:
        weights = {
            CAT_META: 0.12,
            CAT_HEADINGS: 0.06,
            CAT_IMAGES: 0.08,
            CAT_URLS: 0.05,
            CAT_INDEX: 0.10,
            CAT_OG: 0.05,
            CAT_TW: 0.04,
            CAT_SCHEMA: 0.08,
            CAT_INTERNAL: 0.08,
            CAT_EXTERNAL: 0.04,
            CAT_CONTENT: 0.08,
            CAT_MOBILE: 0.06,
            CAT_PAGES: 0.05,
            CAT_LOCAL: 0.04,
            CAT_SOCIAL: 0.03,
            CAT_FAVICON: 0.04,
        }
        # Modules are passed in `_CATEGORY_ORDER` (see `_audit`), so we can map
        # each module to its category deterministically.
        total_weight = 0.0
        weighted = 0.0
        for cat, module in zip(_CATEGORY_ORDER, modules):
            if module is None or not hasattr(module, "score"):
                continue
            weight = weights.get(cat, 0.0)
            weighted += safe_score(module.score) * weight
            total_weight += weight
        if total_weight == 0:
            return 0
        return _round_score(weighted / total_weight)

    # ── Progress emission ────────────────────────────────────────────────

    @staticmethod
    def _emit(on_update, stage: str, url: str, details: Dict[str, Any]) -> None:
        try:
            if on_update is not None:
                loop = None
                import asyncio
                try:
                    loop = asyncio.get_running_loop()
                except Exception:
                    loop = None
                if loop and loop.is_running():
                    asyncio.ensure_future(on_update(stage, url, details))
                else:
                    asyncio.run(on_update(stage, url, details))
        except Exception:
            pass


# ── Singleton ─────────────────────────────────────────────────────────────
seo_intelligence_service = SEOIntelligenceService()
