"""
TikTok Profile Detection Service
=================================
Detects, validates, normalizes and deduplicates TikTok profile links found
on a lead's crawled website pages.

Fault tolerance:
  - Never raises. Any failure returns `found=False` so the analysis pipeline
    can never fail because of TikTok.
  - Reuses the already-crawled pages (crawl_pages) — no extra network calls.

Result shape (persisted to Lead.tiktok):
  {
    found: bool,
    url: str,            # normalized https://www.tiktok.com/@username
    username: str,       # bare handle without '@'
    sourcePage: str,     # page URL where the profile was found
    lastChecked: datetime,
  }

Validation rules:
  - Accepts: https://www.tiktok.com/@username, tiktok.com/@username,
    http://www.tiktok.com/@username, https://m.tiktok.com/@username
    (query strings, fragments and trailing slashes are tolerated).
  - Rejects: videos (/@user/video/...), music, hashtags (/tag/...),
    share links (vm.tiktok.com short links), ads and embeds.
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Only these host forms are accepted. `vm.` short links and other subdomains
# are share/redirect links and are deliberately rejected.
_TIKTOK_HOSTS = ("tiktok.com", "m.tiktok.com")

# Path must be exactly /@username (optionally a trailing slash).
_TIKTOK_PROFILE_RE = re.compile(r"^/@([A-Za-z0-9_.\-]{1,24})/?$")

# Full tiktok.com/@handle mention inside visible text.
_TIKTOK_URL_TEXT_RE = re.compile(
    r"(?:https?://)?(?:www\.|m\.)?tiktok\.com/@([A-Za-z0-9_.\-]{1,24})/?",
    re.IGNORECASE,
)

# Bare @handle mention inside visible text (fallback source).
_TIKTOK_HANDLE_RE = re.compile(r"@([A-Za-z0-9_.\-]{2,24})")

# Anchor elements that look like a TikTok social icon.
_TIKTOK_HINT_RE = re.compile(r"tiktok", re.IGNORECASE)


class TikTokDetectionResult(BaseModel):
    lead_id: str
    website_url: str
    found: bool = False
    url: Optional[str] = None
    username: Optional[str] = None
    sourcePage: Optional[str] = None
    lastChecked: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TikTokDetectionService:
    """Searches crawled pages for a valid, normalized TikTok profile link."""

    # ── Public API ──────────────────────────────────────────────────────

    async def detect_tiktok(
        self,
        lead_id: str,
        website_url: str,
        pages: List[Dict[str, Any]],
        on_update=None,
    ) -> TikTokDetectionResult:
        """Run the detection. Never raises — returns found=False on failure."""
        try:
            if on_update:
                await on_update(
                    "TikTok",
                    website_url,
                    {"current_stage": "Searching TikTok..."},
                )
            logger.info("Searching TikTok...")

            match = self._scan_pages(pages, website_url)
            if match:
                url, username, source_page = match
                logger.info(f"TikTok detected: @{username} (source: {source_page})")
                return TikTokDetectionResult(
                    lead_id=lead_id,
                    website_url=website_url,
                    found=True,
                    url=url,
                    username=username,
                    sourcePage=source_page,
                )

            logger.info("TikTok not found")
            return TikTokDetectionResult(
                lead_id=lead_id,
                website_url=website_url,
                found=False,
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.error(f"TikTok detection failed (never fails analysis): {exc}")
            return TikTokDetectionResult(
                lead_id=lead_id,
                website_url=website_url,
                found=False,
            )

    # ── Validation / normalization ──────────────────────────────────────

    @classmethod
    def _extract_username(cls, raw_url: Any) -> Optional[str]:
        """Return a validated bare TikTok username, or None for non-profile URLs."""
        if not raw_url or not isinstance(raw_url, str):
            return None
        url = raw_url.strip().strip("'\" ").rstrip(".,;:!?)]}>")
        if not url:
            return None

        if url.startswith("//"):
            url = "https:" + url
        # Query strings / fragments don't change the profile path.
        url = url.split("?", 1)[0].split("#", 1)[0]

        parsed = urlparse(url)
        host = (parsed.netloc or "").lower()
        if not host:
            # Scheme-less hrefs like 'www.tiktok.com/@user'
            if url.startswith("www.tiktok.com/") or url.startswith("tiktok.com/") or url.startswith("m.tiktok.com/"):
                parsed = urlparse("https://" + url)
                host = (parsed.netloc or "").lower()
            else:
                return None

        if host.startswith("www."):
            host = host[4:]
        if host not in _TIKTOK_HOSTS:
            return None

        match = _TIKTOK_PROFILE_RE.match(parsed.path or "")
        if not match:
            return None
        return match.group(1)

    def _candidate(
        self, raw_url: Any, source_page: str
    ) -> Optional[Tuple[str, str, str]]:
        """Validate + normalize a candidate URL → (url, username, sourcePage)."""
        username = self._extract_username(raw_url)
        if not username:
            return None
        normalized = f"https://www.tiktok.com/@{username}"
        logger.info(f"TikTok validated: {normalized}")
        return (normalized, username, source_page or "")

    # ── Page selection ──────────────────────────────────────────────────

    @staticmethod
    def _page_url(page: Dict[str, Any]) -> str:
        return page.get("url") or page.get("final_url") or ""

    @classmethod
    def _is_homepage(cls, page: Dict[str, Any], website_url: str) -> bool:
        if not page:
            return False
        url = cls._page_url(page)
        if not url:
            return False
        try:
            return urlparse(url).path.strip("/") == ""
        except Exception:
            return False

    @classmethod
    def _page_keyword(cls, page: Dict[str, Any]) -> str:
        if not page:
            return ""
        url = cls._page_url(page)
        if not url:
            return ""
        try:
            return urlparse(url).path.strip("/").lower().split("/")[0]
        except Exception:
            return ""

    # ── Extraction scanners (priority order) ────────────────────────────

    def _scan_pages(
        self, pages: List[Dict[str, Any]], website_url: str
    ) -> Optional[Tuple[str, str, str]]:
        page_list = list(pages or [])
        homepage = next((p for p in page_list if self._is_homepage(p, website_url)), None)
        contact_pages = [p for p in page_list if self._page_keyword(p) in ("contact", "contact-us", "contacts", "contactus")]
        about_pages = [p for p in page_list if self._page_keyword(p) in ("about", "about-us", "aboutus")]
        other_pages = [
            p for p in page_list
            if p is not homepage and p not in contact_pages and p not in about_pages
        ]

        scanners: List[Any] = [
            # 1–3. Homepage: header nav, footer, then every link.
            lambda: self._scan_nav(homepage),
            lambda: self._scan_footer(homepage),
            lambda: self._scan_links([homepage]),
            # 4–5. Contact page, then about page.
            lambda: self._scan_links(contact_pages),
            lambda: self._scan_links(about_pages),
            # 6. Social icon anchors (across all pages).
            lambda: self._scan_social_icons(page_list),
            # 7. All remaining anchor tags / external links.
            lambda: self._scan_links(other_pages),
            # 8. JS-rendered links.
            lambda: self._scan_rendered_links(page_list),
            # 9. JSON-LD structured data.
            lambda: self._scan_jsonld(page_list),
            # 10. Meta tags.
            lambda: self._scan_meta_tags(page_list),
            # Fallback: plain-text mentions.
            lambda: self._scan_visible_text(page_list),
        ]

        for scanner in scanners:
            try:
                found = scanner()
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning(f"TikTok scanner failed (continuing): {exc}")
                found = None
            if found:
                return found
        return None

    def _scan_nav(self, page: Dict[str, Any]) -> Optional[Tuple[str, str, str]]:
        if not page:
            return None
        soup = self._soup(page)
        if soup is None:
            return None
        nav = soup.find("nav")
        if not nav:
            return None
        for a in nav.find_all("a", href=True):
            found = self._candidate(a.get("href", "").strip(), self._page_url(page))
            if found:
                logger.info(f"TikTok source: header nav ({self._page_url(page)})")
                return found
        return None

    def _scan_footer(self, page: Dict[str, Any]) -> Optional[Tuple[str, str, str]]:
        if not page:
            return None
        soup = self._soup(page)
        if soup is None:
            return None
        footer = soup.find("footer")
        if not footer:
            return None
        for a in footer.find_all("a", href=True):
            found = self._candidate(a.get("href", "").strip(), self._page_url(page))
            if found:
                logger.info(f"TikTok source: footer ({self._page_url(page)})")
                return found
        return None

    def _scan_links(
        self, pages: List[Dict[str, Any]]
    ) -> Optional[Tuple[str, str, str]]:
        for page in pages or []:
            if not page:
                continue
            source = self._page_url(page)

            # The crawler already collected normalized external hrefs.
            for href in page.get("external_links") or []:
                found = self._candidate(href, source)
                if found:
                    logger.info(f"TikTok source: anchor tag ({source})")
                    return found

            soup = self._soup(page)
            if soup is None:
                continue
            for a in soup.find_all("a", href=True):
                found = self._candidate(a.get("href", "").strip(), source)
                if found:
                    logger.info(f"TikTok source: anchor tag ({source})")
                    return found
        return None

    def _scan_social_icons(
        self, pages: List[Dict[str, Any]]
    ) -> Optional[Tuple[str, str, str]]:
        for page in pages or []:
            if not page:
                continue
            soup = self._soup(page)
            if soup is None:
                continue
            for a in soup.find_all("a", href=True):
                if not self._is_social_icon(a):
                    continue
                found = self._candidate(a.get("href", "").strip(), self._page_url(page))
                if found:
                    logger.info(f"TikTok source: social icon ({self._page_url(page)})")
                    return found
        return None

    def _scan_rendered_links(
        self, pages: List[Dict[str, Any]]
    ) -> Optional[Tuple[str, str, str]]:
        for page in pages or []:
            if not page:
                continue
            rendered = page.get("rendered_html") or ""
            html = page.get("html") or ""
            if not rendered or rendered == html:
                continue
            soup = BeautifulSoup(rendered, "html.parser")
            for a in soup.find_all("a", href=True):
                found = self._candidate(a.get("href", "").strip(), self._page_url(page))
                if found:
                    logger.info(f"TikTok source: JS-rendered link ({self._page_url(page)})")
                    return found
        return None

    def _scan_jsonld(
        self, pages: List[Dict[str, Any]]
    ) -> Optional[Tuple[str, str, str]]:
        for page in pages or []:
            if not page:
                continue
            source = self._page_url(page)

            # Pre-parsed by the crawler.
            for block in page.get("schema_markup") or []:
                for value in self._iter_jsonld_urls(block):
                    found = self._candidate(value, source)
                    if found:
                        logger.info(f"TikTok source: JSON-LD ({source})")
                        return found

            # Fallback: re-parse raw HTML.
            soup = self._soup(page)
            if soup is None:
                continue
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    data = json.loads(script.string or "")
                except Exception:
                    continue
                for value in self._iter_jsonld_urls(data):
                    found = self._candidate(value, source)
                    if found:
                        logger.info(f"TikTok source: JSON-LD ({source})")
                        return found
        return None

    def _scan_meta_tags(
        self, pages: List[Dict[str, Any]]
    ) -> Optional[Tuple[str, str, str]]:
        for page in pages or []:
            if not page:
                continue
            soup = self._soup(page)
            if soup is None:
                continue
            for meta in soup.find_all("meta"):
                content = (meta.get("content") or "").strip()
                if not content or "tiktok.com" not in content.lower():
                    continue
                found = self._candidate(content, self._page_url(page))
                if found:
                    logger.info(f"TikTok source: meta tag ({self._page_url(page)})")
                    return found
        return None

    def _scan_visible_text(
        self, pages: List[Dict[str, Any]]
    ) -> Optional[Tuple[str, str, str]]:
        for page in pages or []:
            if not page:
                continue
            text = page.get("visible_text") or ""
            if not text:
                soup = self._soup(page)
                if soup is not None:
                    text = soup.get_text(" ", strip=True)
            if not text:
                continue
            text_lower = text.lower()
            source = self._page_url(page)

            # Full tiktok.com/@handle mentions.
            if "tiktok.com" in text_lower:
                for match in _TIKTOK_URL_TEXT_RE.finditer(text):
                    found = self._candidate(match.group(0), source)
                    if found:
                        logger.info(f"TikTok source: visible text ({source})")
                        return found

            # Bare @handle mention — only when the page actually talks about TikTok.
            if "tiktok" in text_lower:
                for match in _TIKTOK_HANDLE_RE.finditer(text):
                    username = match.group(1)
                    if self._looks_like_email(username):
                        continue
                    normalized = f"https://www.tiktok.com/@{username}"
                    logger.info(f"TikTok validated: {normalized}")
                    logger.info(f"TikTok source: visible text ({source})")
                    return (normalized, username, source)
        return None

    # ── Helpers ─────────────────────────────────────────────────────────

    @staticmethod
    def _soup(page: Dict[str, Any]) -> Optional[BeautifulSoup]:
        html = page.get("html") or page.get("rendered_html") or ""
        if not html:
            return None
        return BeautifulSoup(html, "html.parser")

    @classmethod
    def _iter_jsonld_urls(cls, data: Any, url_context: bool = False):
        """Yield every url-ish value inside a JSON-LD block (sameAs, url, ...).

        When `url_context` is True the container is known to hold URLs, so
        scalar items (e.g. a list under `sameAs`) are yielded directly.
        """
        if isinstance(data, list):
            for item in data:
                if url_context and not isinstance(item, (list, dict)):
                    yield item
                else:
                    yield from cls._iter_jsonld_urls(item, url_context)
        elif isinstance(data, dict):
            for key, value in data.items():
                if isinstance(key, str) and key.lower() in (
                    "url",
                    "sameas",
                    "contenturl",
                    "identifier",
                ):
                    yield from cls._iter_jsonld_urls(value, url_context=True)
                elif isinstance(value, (list, dict)):
                    yield from cls._iter_jsonld_urls(value, url_context=False)
        elif url_context:
            yield data

    @staticmethod
    def _is_social_icon(anchor) -> bool:
        aria = f"{anchor.get('aria-label') or ''} {anchor.get('title') or ''}"
        classes = anchor.get("class") or ""
        if isinstance(classes, list):
            classes = " ".join(classes)
        if _TIKTOK_HINT_RE.search(f"{aria} {classes}"):
            return True

        text = anchor.get_text(" ", strip=True)
        if _TIKTOK_HINT_RE.search(text):
            return True

        img = anchor.find("img")
        if img:
            hint = f"{img.get('alt') or ''} {img.get('src') or ''} {img.get('title') or ''}"
            if _TIKTOK_HINT_RE.search(hint):
                return True

        svg = anchor.find("svg")
        if svg:
            svg_title = svg.find("title")
            label = svg.get("aria-label") or (svg_title.get_text(strip=True) if svg_title else "")
            if _TIKTOK_HINT_RE.search(str(label)):
                return True
        return False

    @staticmethod
    def _looks_like_email(username: str) -> bool:
        """A bare @mention containing a dot+letters suffix is likely an email."""
        if "." not in username:
            return False
        suffix = username.rsplit(".", 1)[-1]
        return bool(suffix) and any(ch.isalpha() for ch in suffix)


tiktok_detection_service = TikTokDetectionService()
