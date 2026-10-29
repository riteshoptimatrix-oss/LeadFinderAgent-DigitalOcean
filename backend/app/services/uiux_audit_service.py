"""
Enterprise Website UI/UX Intelligence Engine
============================================
A Lighthouse-style UI/UX audit that runs entirely on already-crawled page
data (rendered HTML + DOM). It never performs extra network requests and
never re-crawls.

Audit modules (spec-aligned):
  - Visual Design      (hero, hierarchy, whitespace, consistency, styling)
  - Colors             (palette, accent, consistency, contrast)
  - Typography         (fonts, sizes, readability, heading consistency)
  - Layout             (grid/flex, container, columns, fixed widths)
  - Navigation         (menu, header/footer nav, breadcrumbs, search)
  - CTA                (primary CTA, strong CTA text, hero CTA)
  - Responsive         (viewport, media queries, fluid widths)
  - Mobile             (viewport, touch targets, mobile menu)
  - Forms              (labels, placeholders, required, submit)
  - UX                 (journey, clarity, readability, friction)
  - Content            (word counts, thin pages, blog, structure)
  - Images             (alt text, lazy loading, dimensions)
  - Icons              (svg, icon fonts, social/feature icons)
  - Branding           (logo, favicon, tagline, consistency)
  - Accessibility      (lang, alt coverage, labels, aria, semantics)
  - Modern Design      (frameworks, css vars, animations, dark mode)
  - Trust              (testimonials, reviews, badges, certifications)

Guarantees:
  - NEVER raises — any failure returns a partial audit so AI analysis continues.
  - NO network I/O — purely analyzes the passed page documents.
  - Independent modules run CONCURRENTLY so one module never blocks the rest,
    and a failure in one never stops the others.
  - Every module is scored 0-100 with a visual status
    (Excellent/Good/Average/Poor/Critical) and color, an overall score and a
    letter grade (A-F), plus per-module issue + recommendation counts.
  - Produces visual issues, AI-style recommendations, a redesign opportunity
    and a sales opportunity evaluation.
  - Every step is logged so the pipeline is fully auditable.
"""

import asyncio
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from app.models.uiux_audit import (
    UIUXAuditResultCreate,
    UIUXModuleAudit,
    UIUXVisualIssue,
    UIUXRecommendation,
    VisualDesignAudit,
    ColorsAudit,
    TypographyAudit,
    LayoutAudit,
    NavigationAudit,
    CtaAudit,
    ResponsiveAudit,
    MobileAudit,
    FormsAudit,
    UxAudit,
    ContentAudit,
    ImagesAudit,
    IconsAudit,
    BrandingAudit,
    AccessibilityAudit,
    ModernDesignAudit,
    TrustAudit,
    RedesignOpportunity,
    SalesOpportunity,
)
from app.services.safe_scoring import safe_score, safe_int, safe_dict

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Status palette + classification helpers
# ─────────────────────────────────────────────────────────────────────────────

GREEN = "#10b981"        # Excellent
BLUE = "#3b82f6"         # Good
ORANGE = "#f59e0b"       # Average
RED = "#ef4444"          # Poor
CRITICAL = "#b91c1c"     # Critical

_MAX_PAGES = 12

# CTA phrases commonly used on conversion-focused sites.
_STRONG_CTA = (
    "contact", "get started", "start now", "free quote", "free estimate",
    "call now", "call today", "book now", "book a", "schedule", "request",
    "get a quote", "buy now", "order now", "sign up", "signup", "subscribe",
    "learn more", "get in touch", "talk to", "get started today", "join now",
    "download", "try now", "free trial", "make an appointment", "apply now",
    "get a free", "start your",
)

# Social platform hosts used to spot social links.
_SOCIAL_HOSTS = (
    "facebook.com", "linkedin.com", "twitter.com", "x.com", "instagram.com",
    "youtube.com", "youtu.be", "tiktok.com", "pinterest.com", "threads.net",
    "whatsapp.com", "telegram.org", "medium.com", "github.com",
)

_ICON_FONT_KEYWORDS = (
    "font-awesome", "fontawesome", "bootstrap-icons", "material-icons",
    "remixicon", "remix-icon", "feather", "themify", "simple-line-icons",
    "boxicons", "flaticon", "line-awesome",
)

_TRUST_KEYWORDS = (
    "testimonial", "review", "rating", "trusted", "trust", "award",
    "certified", "certification", "accredit", "verified", "secure",
    "guarantee", "warranty", "money-back", "est.", "since 20",
    "client", "partner", "member of",
)

_EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\U00002700-\U000027BF\U0001F1E6-\U0001F1FF"
    "\U00002600-\U000026FF\U00002B00-\U00002BFF\U0000FE0F]"
)


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
CAT_VISUAL = "Visual Design"
CAT_COLORS = "Colors"
CAT_TYPOGRAPHY = "Typography"
CAT_LAYOUT = "Layout"
CAT_NAV = "Navigation"
CAT_CTA = "CTA"
CAT_RESPONSIVE = "Responsive"
CAT_MOBILE = "Mobile"
CAT_FORMS = "Forms"
CAT_UX = "UX"
CAT_CONTENT = "Content"
CAT_IMAGES = "Images"
CAT_ICONS = "Icons"
CAT_BRANDING = "Branding"
CAT_ACCESSIBILITY = "Accessibility"
CAT_MODERN = "Modern Design"
CAT_TRUST = "Trust"

_CATEGORY_ORDER = [
    CAT_VISUAL, CAT_COLORS, CAT_TYPOGRAPHY, CAT_LAYOUT, CAT_NAV, CAT_CTA,
    CAT_RESPONSIVE, CAT_MOBILE, CAT_FORMS, CAT_UX, CAT_CONTENT, CAT_IMAGES,
    CAT_ICONS, CAT_BRANDING, CAT_ACCESSIBILITY, CAT_MODERN, CAT_TRUST,
]


# ─────────────────────────────────────────────────────────────────────────────
# Page signals — everything the modules need, extracted once per page
# ─────────────────────────────────────────────────────────────────────────────

class _PageSignals:
    """UI/UX-relevant signals extracted from a single crawled page document."""

    def __init__(self, page: Any):
        if not isinstance(page, dict):
            page = {}
        self.url = str(page.get("url") or "")
        try:
            self.host = urlparse(self.url).netloc or ""
        except Exception:
            self.host = ""
        self.html = str(page.get("rendered_html") or page.get("html") or "")

        self.soup: Optional[BeautifulSoup] = None
        try:
            self.soup = BeautifulSoup(self.html, "html.parser")
        except Exception:
            pass

        self.title = ""
        self.lang = ""
        self.viewport = False
        self.theme_color = ""
        self.has_apple_touch_icon = False
        self.favicon_url = ""

        self.h1s: List[str] = []
        self.h2s: List[str] = []
        self.h3s: List[str] = []
        self.heading_issues = 0

        self.images: List[Dict[str, Any]] = []
        self.anchors: List[Dict[str, Any]] = []
        self.buttons: List[Dict[str, Any]] = []
        self.inputs: List[Dict[str, Any]] = []
        self.forms: List[Dict[str, Any]] = []
        self.navs: List[Dict[str, Any]] = []
        self.svg_icons = 0
        self.emoji_count = 0

        self.style_blocks: List[str] = []
        self.inline_styles: List[str] = []
        self.class_tokens: set = set()
        self.font_families: set = set()
        self.font_sizes: set = set()
        self.colors: set = set()
        self.css_vars_used: set = set()
        self.media_queries: List[str] = []
        self.media_query_count = 0
        self.grid_flex_tokens = 0
        self.has_css_variables = False

        self.word_count = 0
        self.text_content = ""
        self.lists = 0
        self.paragraphs = 0
        self.tables = 0
        self.has_breadcrumbs = False
        self.has_search = False
        self.has_mobile_menu = False
        self.has_logo = False
        self.has_hero = False
        self.has_tagline = False
        self.outdated_elements: List[str] = []

        self.hero_cta = False
        self.social_links: List[str] = []
        self.blog_links = 0
        self.contact_links = 0
        self.privacy_link = False
        self.about_link = False
        self.testimonial_signals = 0
        self.review_signals = 0
        self.trust_badge_signals = 0
        self.certification_signals = 0
        self.guarantee_signals = 0
        self.contact_info_signals = 0
        self.secure_site = False
        self.skip_link = False
        self.semantic_structure = 0
        self.aria_attributes = 0
        self.form_labels = 0
        self.pagination = False
        self.last_updated = False
        self.prefers_dark = False
        self.animations = 0
        self.gradients = 0
        self.rounded_corners = 0
        self.smooth_scroll = False
        self.light_text_on_light = 0
        self.contrast_suspects = 0
        self.keyframes = 0
        self.modern_framework_tokens = 0
        self.fixed_pixel_widths = 0

        self._extract()

    # ── helpers ─────────────────────────────────────────────────────────

    def _text(self, el: Any) -> str:
        try:
            return " ".join(el.get_text(" ", strip=True).split())
        except Exception:
            return ""

    def _classes(self, el: Any) -> str:
        try:
            return " ".join(el.get("class") or [])
        except Exception:
            return ""

    # ── main extraction ─────────────────────────────────────────────────

    def _extract(self) -> None:
        soup = self.soup
        if soup is None:
            return

        html_tag = soup.find("html")
        if html_tag and html_tag.get("lang"):
            self.lang = str(html_tag.get("lang") or "")

        if soup.title and soup.title.string:
            self.title = soup.title.string.strip()

        self.viewport = soup.find("meta", attrs={"name": re.compile("^viewport$", re.I)}) is not None

        theme = soup.find("meta", attrs={"name": re.compile("^theme-color$", re.I)})
        if theme and theme.get("content"):
            self.theme_color = str(theme.get("content") or "").strip()

        apple = soup.find("link", rel=re.compile("apple-touch-icon", re.I))
        self.has_apple_touch_icon = apple is not None

        favicon = soup.find("link", rel=re.compile("(^|\\s)icon($|\\s)", re.I)) or \
            soup.find("link", rel=re.compile("shortcut icon", re.I))
        if favicon and favicon.get("href"):
            self.favicon_url = str(favicon.get("href") or "")

        for tag in soup.find_all("script"):
            if tag.string and tag.string.strip():
                text = tag.string
                if "@media" in text or re.search(r"@keyframes", text):
                    self.style_blocks.append(text)
                if "@keyframes" in text:
                    self.keyframes += len(re.findall(r"@keyframes\s+[^{]+", text))

        for style in soup.find_all("style"):
            text = style.string or ""
            if text.strip():
                self.style_blocks.append(text)

        for el in soup.find_all(attrs={"style": True}):
            self.inline_styles.append(str(el.get("style") or ""))

        for el in soup.find_all(class_=True):
            for token in (el.get("class") or []):
                self.class_tokens.add(str(token).strip())

        for heading, store in (
            ("h1", self.h1s), ("h2", self.h2s), ("h3", self.h3s),
        ):
            for h in soup.find_all(heading):
                text = self._text(h)
                if text:
                    store.append(text)

        self._extract_headings_issues()
        self._extract_images(soup)
        self._extract_links(soup)
        self._extract_forms(soup)
        self._extract_style_signals()
        self._extract_content(soup)
        self._extract_navs(soup)
        self._extract_hero(soup)
        self._extract_branding(soup)
        self._extract_trust(soup)
        self._extract_accessibility(soup)
        self._extract_icons(soup)
        self._extract_modern_signals()

    def _extract_headings_issues(self) -> None:
        soup = self.soup
        if soup is None:
            return
        seen: List[str] = []
        for h in soup.find_all(re.compile("^h[1-6]$")):
            level = int(h.name[1])
            text = self._text(h).lower()
            while seen and seen[-1] >= level:
                seen.pop()
            seen.append(level)
            if text in ("home", "home page", "read more", "continue reading"):
                self.heading_issues += 1

    def _extract_images(self, soup: BeautifulSoup) -> None:
        for img in soup.find_all("img"):
            src = str(img.get("src") or img.get("data-src") or "")
            alt = str(img.get("alt") or "")
            width = img.get("width")
            height = img.get("height")
            self.images.append({
                "src": src,
                "alt": alt,
                "has_alt": bool(alt.strip()),
                "lazy": bool(img.get("loading") == "lazy"),
                "has_dimensions": bool(width and height),
                "decorative": bool((not alt.strip()) and (src or img.get("data-src"))),
            })

    def _extract_links(self, soup: BeautifulSoup) -> None:
        for a in soup.find_all("a", href=True):
            href = str(a.get("href") or "")
            text = self._text(a)
            classes = self._classes(a)
            lower_href = href.lower()
            self.anchors.append({
                "text": text,
                "href": href,
                "classes": classes,
                "external": lower_href.startswith(("http://", "https://")) and self.host not in href,
            })

            if any(h in lower_href for h in ("/blog", "/news", "/articles", "/insights")):
                self.blog_links += 1
            if any(h in lower_href for h in ("/contact", "/about-us", "mailto:", "tel:")):
                self.contact_links += 1
            if any(h in lower_href for h in ("/privacy", "/privacy-policy", "/terms")):
                self.privacy_link = True
            if re.search(r"/(about|company|who-we-are)(/|$|\\?|#)", lower_href) or "about us" in text.lower():
                self.about_link = True
            if "breadcrumb" in classes.lower():
                self.has_breadcrumbs = True
            if re.search(r"(search|query)", classes.lower()) or (
                "search" in text.lower() and len(text) < 20
            ):
                self.has_search = True
            if any(host in lower_href for host in _SOCIAL_HOSTS):
                self.social_links.append(href)
            if re.search(r"skip(-|to )?(main|content)", classes.lower()):
                self.skip_link = True

        for btn in soup.find_all("button"):
            text = self._text(btn)
            self.buttons.append({
                "text": text,
                "classes": self._classes(btn),
                "type": str(btn.get("type") or "submit"),
                "aria": bool(btn.get("aria-label")),
            })

        for inp in soup.find_all("input"):
            inp_type = str(inp.get("type") or "text").lower()
            self.inputs.append({
                "type": inp_type,
                "placeholder": str(inp.get("placeholder") or ""),
                "aria_label": str(inp.get("aria-label") or ""),
                "aria_labelledby": str(inp.get("aria-labelledby") or ""),
                "required": bool(inp.get("required") or inp.get("aria-required")),
                "name": str(inp.get("name") or ""),
            })

    def _extract_forms(self, soup: BeautifulSoup) -> None:
        for form in soup.find_all("form"):
            action = form.get("action")
            labels = []
            for field in form.find_all(["input", "textarea", "select"]):
                field_id = field.get("id")
                if field_id:
                    if form.find("label", attrs={"for": field_id}):
                        labels.append(field_id)
                        self.form_labels += 1
                if field.find_parent("label"):
                    self.form_labels += 1
            submit = form.find(["button", "input"], attrs={"type": re.compile("^submit$", re.I)}) is not None
            self.forms.append({
                "action": str(action or ""),
                "has_action": bool(action),
                "has_submit": submit,
                "labeled": len(labels),
            })

    def _extract_style_signals(self) -> None:
        all_css = "\n".join(self.style_blocks)
        for m in re.finditer(r"@media[^{]+", all_css):
            query = m.group(0)
            self.media_queries.append(query.strip())
            self.media_query_count += 1
        if re.search(r"prefers-color-scheme\s*:\s*dark", all_css):
            self.prefers_dark = True
        if re.search(r"scroll-behavior\s*:\s*smooth", all_css):
            self.smooth_scroll = True
        if "@keyframes" in all_css:
            self.keyframes += len(re.findall(r"@keyframes\s+[^{]+", all_css))
        self.animations += self.keyframes
        if re.search(r"linear-gradient|radial-gradient|conic-gradient", all_css):
            self.gradients += len(re.findall(r"linear-gradient|radial-gradient|conic-gradient", all_css))
        if re.search(r"border-radius", all_css):
            self.rounded_corners += len(re.findall(r"border-radius", all_css))

        for style in [*self.inline_styles, all_css]:
            for m in re.finditer(r"font-family\s*:\s*([^;]+)", style):
                self.font_families.add(m.group(1).strip().strip("'\""))
            for m in re.finditer(r"font-size\s*:\s*([^;]+)", style):
                self.font_sizes.add(m.group(1).strip())
            for m in re.finditer(r"color\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))", style):
                self.colors.add(self._normalize_color(m.group(1)))
            for m in re.finditer(r"background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))", style):
                self.colors.add(self._normalize_color(m.group(1)))
            for m in re.finditer(r"var\(--([\w-]+)", style):
                self.css_vars_used.add(m.group(1))
                self.has_css_variables = True
            for m in re.finditer(r"grid-template-columns|display\s*:\s*grid", style):
                self.grid_flex_tokens += 1
            for m in re.finditer(r"display\s*:\s*flex", style):
                self.grid_flex_tokens += 1
            for m in re.finditer(r"width\s*:\s*\d+px", style):
                self.fixed_pixel_widths += 1
            if re.search(r"#[0-9a-fA-F]{3,8}", style):
                pass

        if self.theme_color:
            self.colors.add(self._normalize_color(self.theme_color))

    @staticmethod
    def _normalize_color(value: str) -> str:
        value = value.strip()
        match = re.match(r"#([0-9a-fA-F]{3,8})", value)
        if match:
            hex_part = match.group(1)
            if len(hex_part) == 3:
                hex_part = "".join(ch * 2 for ch in hex_part)
            return f"#{hex_part[:6].upper()}"
        match = re.match(r"rgba?\(([^)]+)\)", value)
        if match:
            return f"rgba({match.group(1).strip()})"
        return value[:30]

    def _extract_content(self, soup: BeautifulSoup) -> None:
        text = self._text(soup)
        self.text_content = text
        self.word_count = len(text.split())
        self.lists = len(soup.find_all(["ul", "ol"]))
        self.paragraphs = len(soup.find_all("p"))
        self.tables = len(soup.find_all("table"))
        if re.search(r"last updated|updated on|published on|\\d{1,2}/\\d{1,2}/20", text, re.I) or soup.find("time"):
            self.last_updated = True
        if soup.find(class_=re.compile("pagination|page-numbers")):
            self.pagination = True
        self.emoji_count = len(_EMOJI_RE.findall(text))

    def _extract_navs(self, soup: BeautifulSoup) -> None:
        for nav in soup.find_all("nav"):
            links = nav.find_all("a", href=True)
            in_header = nav.find_parent("header") is not None
            in_footer = nav.find_parent("footer") is not None
            self.navs.append({
                "links": [str(a.get("href") or "") for a in links],
                "texts": [self._text(a) for a in links],
                "in_header": in_header,
                "in_footer": in_footer,
            })
        if re.search(r"navbar-toggler|menu-toggle|hamburger|toggle-menu", self.html, re.I):
            self.has_mobile_menu = True
        for cls in ("nav", "menu", "navigation", "navbar"):
            if cls in self.class_tokens:
                self.navs.append({"links": [], "texts": [], "in_header": False, "in_footer": False})
                break

    def _extract_hero(self, soup: BeautifulSoup) -> None:
        hero = soup.find(class_=re.compile(r"hero|jumbotron|banner|intro", re.I))
        if hero is None and self.h1s and soup.find("h1").find_parent("section"):
            hero = soup.find("h1").find_parent("section")
        if hero is not None:
            self.has_hero = True
            text = self._text(hero)
            if any(kw in text.lower() for kw in _STRONG_CTA):
                self.hero_cta = True

    def _extract_branding(self, soup: BeautifulSoup) -> None:
        header = soup.find("header")
        if header is None:
            header = soup.body
        if header is not None:
            header_img = header.find("img") if header else None
            logo = soup.find(class_=re.compile(r"logo|brand|site-title", re.I)) or header_img
            if logo is not None:
                self.has_logo = True
                if logo.name == "a" or logo.find_parent("a"):
                    if self._text(logo).strip():
                        self.has_tagline = True
        if re.search(r"tagline|slogan", self.html, re.I):
            self.has_tagline = True

    def _extract_trust(self, soup: BeautifulSoup) -> None:
        text = self.text_content.lower()
        for token in ("testimonial", "what our clients say", "client stories", "what people say"):
            if re.search(token, text):
                self.testimonial_signals += 1
        for token in ("reviews", "ratings", "rated 4", "rated 5", "star rating", "star review"):
            if re.search(token, text):
                self.review_signals += 1
        for token in ("trusted by", "trust badge", "secure payment", "ssl secured", "we accept"):
            if re.search(token, text):
                self.trust_badge_signals += 1
        for token in ("certified", "certification", "accredited", "iso 9001", "award-winning", "winner"):
            if re.search(token, text):
                self.certification_signals += 1
        for token in ("guarantee", "warranty", "money-back", "100% satisfaction"):
            if re.search(token, text):
                self.guarantee_signals += 1
        for token in ("years of experience", "customers", "clients served", "since "):
            if re.search(token, text):
                self.trust_badge_signals += 1
        if soup.find(class_=re.compile(r"rating|star-rating|stars", re.I)):
            self.review_signals += 1
        if soup.find(class_=re.compile(r"trust|badge|secure", re.I)):
            self.trust_badge_signals += 1
        if soup.find(class_=re.compile(r"certif|award|accred", re.I)):
            self.certification_signals += 1
        if re.search(r"tel:|\\bphone\\b|\\bemail\\b|\\baddress\\b|\\blocated at\\b", text):
            self.contact_info_signals += 1
        if self.url.lower().startswith("https://"):
            self.secure_site = True
        elif "https://" in self.html:
            self.secure_site = True

    def _extract_accessibility(self, soup: BeautifulSoup) -> None:
        for header in ("header", "main", "footer", "nav", "article", "aside", "section"):
            if soup.find(header):
                self.semantic_structure += 1
        self.aria_attributes = len(soup.find_all(attrs={"aria-label": True})) + \
            len(soup.find_all(attrs={"aria-labelledby": True})) + \
            len(soup.find_all(attrs={"role": True}))
        if re.search(r"contrast", self.html, re.I):
            self.contrast_suspects += 1
        self.light_text_on_light = 0

    def _extract_icons(self, soup: BeautifulSoup) -> None:
        self.svg_icons = len(soup.find_all("svg"))
        for link in soup.find_all("link", href=True):
            href = str(link.get("href") or "").lower()
            if any(kw in href for kw in _ICON_FONT_KEYWORDS):
                self.style_blocks.append("")
        for i_tag in soup.find_all("i", class_=True):
            classes = self._classes(i_tag).lower()
            if any(kw in classes for kw in ("fa-", "icon", "material-icons", "ri-", "bi-")):
                self.svg_icons += 0

    def _extract_modern_signals(self) -> None:
        tokens = " ".join(self.class_tokens)
        for token in ("grid", "grid-cols", "flex", "flex-wrap", "items-center", "justify-center",
                      "px-", "py-", "mt-", "mb-", "rounded", "shadow", "transition",
                      "d-flex", "container", "row", "col-", "md:", "lg:", "sm:", "xl:"):
            if re.search(re.escape(token), tokens):
                self.modern_framework_tokens += 1


# ─────────────────────────────────────────────────────────────────────────────
# UI/UX Audit Service
# ─────────────────────────────────────────────────────────────────────────────

class UIUXAuditService:
    """Local, professional-grade website UI/UX audit engine."""

    MAX_PAGES = _MAX_PAGES

    def __init__(self) -> None:
        pass

    # ── Public entrypoint ───────────────────────────────────────────────

    async def audit(self, lead_id: str, website_url: str, pages: List[Dict],
                    on_update=None) -> UIUXAuditResultCreate:
        """Run a full UI/UX audit. NEVER raises — returns a partial audit."""
        started = time.perf_counter()
        try:
            self._emit(on_update, "UI/UX Audit", website_url, {"stage": "started"})
            logger.info(f"[UiuxAudit] Audit Started: {lead_id} :: {website_url}")
            result = await self._audit(lead_id, website_url, pages, on_update=on_update)
            result.auditTime = round((time.perf_counter() - started) * 1000, 1)
            logger.info(
                f"[UiuxAudit] Audit Finished: {lead_id} "
                f"score={result.overallScore} grade={result.grade} "
                f"issues={len(result.issues)} recs={len(result.recommendations)} "
                f"auditTime={result.auditTime:.0f}ms"
            )
            return result
        except Exception as exc:  # pragma: no cover - defensive
            logger.error(f"[UiuxAudit] Audit failed for lead {lead_id}: {exc!r}")
            empty = UIUXAuditResultCreate(lead_id=lead_id, website_url=website_url)
            empty.auditTime = round((time.perf_counter() - started) * 1000, 1)
            return empty

    # ── Core audit orchestration ─────────────────────────────────────────

    async def _audit(self, lead_id: str, website_url: str, pages: List[Any],
                     on_update=None) -> UIUXAuditResultCreate:
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
            logger.warning(f"[UiuxAudit] No valid pages provided for lead {lead_id}; returning empty audit")
            return UIUXAuditResultCreate(lead_id=lead_id, website_url=website_url)

        signals = signals[: self.MAX_PAGES]

        # Modules run concurrently (CPU-bound → to_thread) so one module
        # never blocks the others and a failure never stops the rest.
        module_tasks = {
            name: asyncio.to_thread(fn)
            for name, fn in (
                ("visualDesign", lambda: self._audit_visual_design(signals)),
                ("colors", lambda: self._audit_colors(signals)),
                ("typography", lambda: self._audit_typography(signals)),
                ("layout", lambda: self._audit_layout(signals)),
                ("navigation", lambda: self._audit_navigation(signals)),
                ("cta", lambda: self._audit_cta(signals)),
                ("responsive", lambda: self._audit_responsive(signals)),
                ("mobile", lambda: self._audit_mobile(signals)),
                ("forms", lambda: self._audit_forms(signals)),
                ("ux", lambda: self._audit_ux(signals)),
                ("content", lambda: self._audit_content(signals)),
                ("images", lambda: self._audit_images(signals)),
                ("icons", lambda: self._audit_icons(signals)),
                ("branding", lambda: self._audit_branding(signals)),
                ("accessibility", lambda: self._audit_accessibility(signals)),
                ("modernDesign", lambda: self._audit_modern_design(signals)),
                ("trust", lambda: self._audit_trust(signals)),
            )
        }

        completed = await asyncio.gather(*module_tasks.values(), return_exceptions=True)

        results: Dict[str, Optional[UIUXModuleAudit]] = {}
        issues: List[UIUXVisualIssue] = []
        recommendations: List[UIUXRecommendation] = []
        for name, outcome in zip(module_tasks.keys(), completed):
            if isinstance(outcome, Exception):
                logger.error(f"[UiuxAudit] {name} analyzer failed: {outcome!r}")
                results[name] = None
                continue
            module_audit, module_issues, module_recs = outcome
            results[name] = module_audit or None
            issues.extend(module_issues)
            recommendations.extend(module_recs)

        overall = self._overall_score(results)
        grade = _grade(overall)
        overall_status, overall_color = _status_of_score(overall)

        redesign = self._build_redesign_opportunity(results)
        sales = self._build_sales_opportunity(results, website_url)

        result = UIUXAuditResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            overallScore=overall,
            grade=grade,
            overallStatus=overall_status,
            overallColor=overall_color,
            visualDesign=results.get("visualDesign") or VisualDesignAudit(),
            colors=results.get("colors") or ColorsAudit(),
            typography=results.get("typography") or TypographyAudit(),
            layout=results.get("layout") or LayoutAudit(),
            navigation=results.get("navigation") or NavigationAudit(),
            cta=results.get("cta") or CtaAudit(),
            responsive=results.get("responsive") or ResponsiveAudit(),
            mobile=results.get("mobile") or MobileAudit(),
            forms=results.get("forms") or FormsAudit(),
            ux=results.get("ux") or UxAudit(),
            content=results.get("content") or ContentAudit(),
            images=results.get("images") or ImagesAudit(),
            icons=results.get("icons") or IconsAudit(),
            branding=results.get("branding") or BrandingAudit(),
            accessibility=results.get("accessibility") or AccessibilityAudit(),
            modernDesign=results.get("modernDesign") or ModernDesignAudit(),
            trust=results.get("trust") or TrustAudit(),
            issues=issues[:60],
            recommendations=recommendations[:40],
            redesignOpportunity=redesign,
            salesOpportunity=sales,
        )
        return result

    # ── Scoring ───────────────────────────────────────────────────────────

    _WEIGHTS = {
        "visualDesign": 0.09,
        "colors": 0.06,
        "typography": 0.06,
        "layout": 0.07,
        "navigation": 0.07,
        "cta": 0.08,
        "responsive": 0.07,
        "mobile": 0.07,
        "forms": 0.04,
        "ux": 0.08,
        "content": 0.05,
        "images": 0.05,
        "icons": 0.03,
        "branding": 0.05,
        "accessibility": 0.06,
        "modernDesign": 0.05,
        "trust": 0.04,
    }

    def _overall_score(self, results: Dict[str, Optional[UIUXModuleAudit]]) -> int:
        total_weight = 0.0
        weighted = 0.0
        for name, weight in self._WEIGHTS.items():
            audit = results.get(name)
            if audit is None:
                continue
            score = safe_score(getattr(audit, "score", 0))
            weighted += score * weight
            total_weight += weight
        if total_weight == 0:
            return 0
        return _round_score(weighted / total_weight)

    def _module(self, audit: UIUXModuleAudit, issues: int, recs: int, score: int,
                status: Optional[str] = None, color: Optional[str] = None) -> UIUXModuleAudit:
        status = status or _status_of_score(score)[0]
        color = color or _status_of_score(score)[1]
        audit.score = safe_score(score)
        audit.status = status
        audit.color = color
        audit.issueCount = safe_int(issues)
        audit.recommendationCount = safe_int(recs)
        return audit

    # ── Issue / recommendation helpers ───────────────────────────────────

    def _issue(self, category: str, title: str, description: str,
               severity: str = "Info", status: Optional[str] = None) -> UIUXVisualIssue:
        return UIUXVisualIssue(
            category=category,
            severity=severity,
            status=status,
            title=title,
            description=description,
        )

    def _rec(self, category: str, title: str, description: str,
             priority: str = "Medium") -> UIUXRecommendation:
        return UIUXRecommendation(
            category=category,
            title=title,
            description=description,
            priority=priority,
        )

    def _emit(self, on_update, stage: str, website_url: str, data: Dict[str, Any]) -> None:
        try:
            if on_update is not None:
                on_update(stage, data)
        except Exception:
            pass

    # ═════════════════════════════════════════════════════════════════════
    # Module: Visual Design
    # ═════════════════════════════════════════════════════════════════════

    def _audit_visual_design(self, signals: List[_PageSignals]) -> Tuple[VisualDesignAudit, List, List]:
        audit = VisualDesignAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        heroes = sum(1 for s in signals if s.has_hero)
        hero_ratio = heroes / max(len(signals), 1)
        audit.hasHeroSection = heroes > 0
        audit.heroQuality = "Strong" if heroes and sum(1 for s in signals if s.hero_cta) > 0 else \
            ("Moderate" if heroes else "Weak")

        hierarchy = sum(1 for s in signals if s.h1s)
        audit.hasVisualHierarchy = hierarchy / max(len(signals), 1) >= 0.6

        whitespace_tokens = sum(1 for s in signals if any(t in s.class_tokens for t in (
            "py-", "pt-", "pb-", "my-", "mt-", "mb-", "space-y", "gap-", "section")))
        audit.goodWhitespace = whitespace_tokens / max(len(signals), 1) >= 0.4

        rounded = sum(1 for s in signals if s.rounded_corners > 0)
        shadows = sum(1 for s in signals if any("shadow" in t for t in s.class_tokens))
        gradients = sum(1 for s in signals if s.gradients > 0)
        modern_marks = rounded + shadows + gradients
        audit.modernStyling = modern_marks / max(len(signals), 1) >= 0.5

        total_imgs = sum(len(s.images) for s in signals)
        photo_like = sum(
            1 for s in signals
            for img in s.images
            if re.search(r"unsplash|shutterstock|gettyimages|istock|stock-photo|pixabay|pexels|/images/.+(photo|bg|slide|gallery)",
                         img["src"], re.I)
        )
        audit.stockPhotoHeavy = total_imgs > 0 and (photo_like / total_imgs) >= 0.5

        outdated: set = set()
        for s in signals:
            if s.soup is None:
                continue
            if s.soup.find("table") and len(s.soup.find_all("table")) > 3:
                outdated.add("Table-based layout")
            if s.soup.find("frameset") or s.soup.find("iframe"):
                outdated.add("Frames / iframes")
            if s.soup.find("marquee") or s.soup.find("blink"):
                outdated.add("Marquee / blink")
            if s.soup.find("font"):
                outdated.add("Legacy <font> tags")
            if s.soup.find("center"):
                outdated.add("Legacy <center> tags")
        audit.outdatedElements = sorted(outdated)[:8]
        for item in list(outdated)[:4]:
            issues.append(self._issue(CAT_VISUAL, f"Outdated element: {item}",
                                      f"Found {item.lower()} in the page markup, which dates the design.",
                                      severity="Warning", status="Poor"))

        score = 100
        if not audit.hasHeroSection:
            score -= 12
            issues.append(self._issue(CAT_VISUAL, "Missing hero section",
                                      "No clear hero/banner section introduces the page's main value proposition.",
                                      severity="Warning"))
        if not audit.hasVisualHierarchy:
            score -= 12
            issues.append(self._issue(CAT_VISUAL, "Weak visual hierarchy",
                                      "Pages do not consistently start with an H1 to establish hierarchy.",
                                      severity="Warning"))
        if not audit.goodWhitespace:
            score -= 10
        if not audit.modernStyling:
            score -= 12
            issues.append(self._issue(CAT_VISUAL, "Dated visual styling",
                                      "No modern styling signals (rounded corners, shadows, gradients) detected.",
                                      severity="Warning"))
        if audit.stockPhotoHeavy:
            score -= 10
            issues.append(self._issue(CAT_VISUAL, "Heavy reliance on stock imagery",
                                      "Many photos appear stock-sourced, reducing authenticity.",
                                      severity="Info"))
        if len(outdated) > 0:
            score -= min(15, len(outdated) * 5)
        if audit.heroQuality == "Strong":
            score += 5
        elif audit.heroQuality == "Weak":
            score -= 5

        if score < 70:
            recs.append(self._rec(CAT_VISUAL, "Refresh the visual design",
                                  "Add a strong hero section, modern styling and a consistent visual hierarchy to make a better first impression.",
                                  priority="High"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: Colors
    # ═════════════════════════════════════════════════════════════════════

    def _audit_colors(self, signals: List[_PageSignals]) -> Tuple[ColorsAudit, List, List]:
        audit = ColorsAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        all_colors: set = set()
        dominant: Dict[str, int] = {}
        for s in signals:
            for color in s.colors:
                all_colors.add(color)
                dominant[color] = dominant.get(color, 0) + 1
        audit.distinctColors = len(all_colors)
        audit.brandColors = len([c for c, count in dominant.items() if count >= max(2, len(signals) // 2)])
        audit.hasColorPalette = audit.distinctColors >= 3 and audit.brandColors >= 1
        ranked = sorted(dominant.items(), key=lambda kv: kv[1], reverse=True)
        audit.dominantColors = [c for c, _ in ranked[:6]]
        audit.primaryColorHex = ranked[0][0] if ranked else None
        if len(ranked) >= 2 and ranked[1][0] != ranked[0][0]:
            audit.accentColor = ranked[1][0]

        # Heuristic contrast check: suspect very light text colors on light backgrounds.
        suspects = 0
        for s in signals:
            text_colors = [c for c in s.colors if c.startswith("#")]
            if text_colors and self._is_light(text_colors[0]) and s.theme_color and self._is_light(s.theme_color):
                suspects += 1
        audit.contrastIssues = suspects

        score = 100
        if not audit.hasColorPalette:
            score -= 18
            issues.append(self._issue(CAT_COLORS, "No consistent color palette",
                                      "Few or no repeating brand colors were detected across pages.",
                                      severity="Warning"))
        if audit.distinctColors > 40:
            score -= 12
            issues.append(self._issue(CAT_COLORS, "Too many distinct colors",
                                      f"{audit.distinctColors} distinct colors weaken brand recognition.",
                                      severity="Warning"))
        if audit.contrastIssues:
            score -= 15
            issues.append(self._issue(CAT_COLORS, "Possible low-contrast text",
                                      "Some text colors may not contrast enough with the background.",
                                      severity="Error"))
        if not audit.accentColor:
            score -= 8
            issues.append(self._issue(CAT_COLORS, "No distinct accent color",
                                      "A single accent color guides users toward important actions.",
                                      severity="Info"))
        if audit.brandColors >= 2 and audit.distinctColors <= 25:
            score += 5

        if score < 70:
            recs.append(self._rec(CAT_COLORS, "Establish a consistent color system",
                                  "Define a small brand palette with a primary color and a single accent, and apply it consistently across pages.",
                                  priority="High"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    @staticmethod
    def _is_light(color: str) -> bool:
        try:
            hex_part = color.lstrip("#")
            if len(hex_part) != 6:
                return False
            r, g, b = (int(hex_part[i:i + 2], 16) for i in (0, 2, 4))
            return (0.299 * r + 0.587 * g + 0.114 * b) > 200
        except Exception:
            return False

    # ═════════════════════════════════════════════════════════════════════
    # Module: Typography
    # ═════════════════════════════════════════════════════════════════════

    def _audit_typography(self, signals: List[_PageSignals]) -> Tuple[TypographyAudit, List, List]:
        audit = TypographyAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        families: set = set()
        sizes: set = set()
        google = 0
        custom = 0
        for s in signals:
            families.update(s.font_families)
            sizes.update(s.font_sizes)
            for link in (s.soup.find_all("link", href=True) if s.soup else []):
                href = str(link.get("href") or "").lower()
                if "fonts.googleapis.com" in href:
                    google += 1
            for block in s.style_blocks:
                if "@font-face" in block:
                    custom += 1

        audit.fontCount = len(families)
        audit.googleFonts = google
        audit.customFonts = custom
        audit.fontFamilies = sorted(families)[:8]
        audit.fontSizes = sorted(sizes, key=lambda v: safe_int(re.search(r"\\d+", v).group(0)) if re.search(r"\\d+", v) else 0)[:8]

        readable = any(re.search(r"1[4-9]px|1[4-9]\\s*pt|2[0-9]px|\\d+\\s*rem", size, re.I) for size in sizes)
        if not sizes:
            readable = True  # no inline sizes detected → assume default
        audit.readableFontSize = readable
        audit.consistentHeadings = audit.fontCount <= 4
        audit.textContrastIssues = sum(1 for s in signals if s.contrast_suspects)

        score = 100
        if audit.fontCount > 6:
            score -= 15
            issues.append(self._issue(CAT_TYPOGRAPHY, "Too many font families",
                                      f"{audit.fontCount} font families reduce visual consistency.",
                                      severity="Warning"))
        elif audit.fontCount > 4:
            score -= 8
        if not audit.readableFontSize:
            score -= 12
            issues.append(self._issue(CAT_TYPOGRAPHY, "Small base font size",
                                      "Body text appears to use a small font size, hurting readability.",
                                      severity="Warning"))
        if not audit.consistentHeadings:
            score -= 10
        if audit.customFonts == 0 and google == 0 and audit.fontCount == 0:
            score -= 8
            issues.append(self._issue(CAT_TYPOGRAPHY, "No custom typography",
                                      "Site appears to rely on default system fonts.",
                                      severity="Info"))

        if score < 70:
            recs.append(self._rec(CAT_TYPOGRAPHY, "Improve typographic hierarchy",
                                  "Limit to 2-3 font families and ensure body text is at least 14-16px with clear heading contrast.",
                                  priority="Medium"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: Layout
    # ═════════════════════════════════════════════════════════════════════

    def _audit_layout(self, signals: List[_PageSignals]) -> Tuple[LayoutAudit, List, List]:
        audit = LayoutAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        grid = sum(1 for s in signals if any(t in s.class_tokens for t in ("grid", "grid-cols", "row", "col-")) or s.grid_flex_tokens > 0)
        flex = sum(1 for s in signals if any(t in s.class_tokens for t in ("flex", "d-flex")) or s.grid_flex_tokens > 0)
        container = sum(1 for s in signals if any(t in s.class_tokens for t in ("container", "wrapper", "max-w-")))
        sidebar = sum(1 for s in signals if "sidebar" in s.class_tokens or (s.soup and s.soup.find("aside")))
        fixed = sum(s.fixed_pixel_widths for s in signals)

        audit.usesCssGrid = grid / max(len(signals), 1) >= 0.5
        audit.usesFlexbox = flex / max(len(signals), 1) >= 0.5
        audit.hasContainerLayout = container / max(len(signals), 1) >= 0.4
        audit.hasSidebar = sidebar > 0
        audit.fixedWidthElements = fixed
        audit.contentWidthOk = fixed <= max(4, len(signals) * 2)
        audit.balancedColumns = grid > 0 or flex > 0
        audit.centeredContent = any("mx-auto" in s.class_tokens or "text-center" in s.class_tokens or
                                    re.search(r"margin\\s*:\\s*0\\s+auto", " ".join(s.inline_styles)) for s in signals)

        score = 100
        if not audit.hasContainerLayout:
            score -= 12
            issues.append(self._issue(CAT_LAYOUT, "No clear content container",
                                      "Content does not appear to be wrapped in a consistent container.",
                                      severity="Warning"))
        if not audit.usesCssGrid and not audit.usesFlexbox:
            score -= 12
            issues.append(self._issue(CAT_LAYOUT, "Rigid / legacy layout",
                                      "No modern grid or flexbox layout primitives were detected.",
                                      severity="Warning"))
        if not audit.contentWidthOk:
            score -= 12
            issues.append(self._issue(CAT_LAYOUT, "Fixed-width layout risk",
                                      f"{fixed} fixed-pixel widths can break on smaller screens.",
                                      severity="Warning"))
        if not audit.balancedColumns:
            score -= 8
        if not audit.centeredContent:
            score -= 6

        if score < 70:
            recs.append(self._rec(CAT_LAYOUT, "Modernize the page layout",
                                  "Move to a responsive grid/flexbox layout with a consistent container and fluid widths.",
                                  priority="High"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: Navigation
    # ═════════════════════════════════════════════════════════════════════

    def _audit_navigation(self, signals: List[_PageSignals]) -> Tuple[NavigationAudit, List, List]:
        audit = NavigationAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        all_menu_links: List[str] = []
        header_nav = 0
        footer_nav = 0
        has_nav = 0
        for s in signals:
            for nav in s.navs:
                if nav["links"]:
                    has_nav += 1
                    all_menu_links.extend(nav["texts"])
                if nav["in_header"]:
                    header_nav += 1
                if nav["in_footer"]:
                    footer_nav += 1

        audit.hasNavMenu = has_nav > 0
        audit.menuLinks = len(set(all_menu_links))
        audit.hasHeaderNav = header_nav > 0
        audit.hasFooterNav = footer_nav > 0
        audit.hasBreadcrumbs = any(s.has_breadcrumbs for s in signals)
        audit.hasSearch = any(s.has_search for s in signals)
        audit.mobileMenu = any(s.has_mobile_menu for s in signals)
        audit.navItems = [t for t in dict.fromkeys(t for t in all_menu_links if t)][:10]
        audit.brokenMenuLinks = 0

        score = 100
        if not audit.hasNavMenu:
            score -= 25
            issues.append(self._issue(CAT_NAV, "No navigation menu detected",
                                      "Users cannot easily explore the site — a primary navigation menu is essential.",
                                      severity="Error"))
        elif audit.menuLinks < 4:
            score -= 12
            issues.append(self._issue(CAT_NAV, "Very few menu links",
                                      f"Only {audit.menuLinks} unique menu items make it hard to discover content.",
                                      severity="Warning"))
        if not audit.hasHeaderNav:
            score -= 10
            issues.append(self._issue(CAT_NAV, "No header navigation",
                                      "Menu should sit in the page header for constant access.",
                                      severity="Warning"))
        if not audit.hasFooterNav:
            score -= 6
            issues.append(self._issue(CAT_NAV, "No footer navigation",
                                      "A footer menu improves orientation on long pages.",
                                      severity="Info"))
        if not audit.mobileMenu:
            score -= 6
            issues.append(self._issue(CAT_NAV, "No mobile menu pattern detected",
                                      "A hamburger-style menu is expected on smaller screens.",
                                      severity="Info"))
        if not audit.hasBreadcrumbs:
            score -= 4
        if not audit.hasSearch and audit.menuLinks >= 6:
            score -= 4

        if score < 70:
            recs.append(self._rec(CAT_NAV, "Improve site navigation",
                                  "Add a clear header menu with descriptive links, a footer menu and a mobile hamburger menu.",
                                  priority="High"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: CTA
    # ═════════════════════════════════════════════════════════════════════

    def _audit_cta(self, signals: List[_PageSignals]) -> Tuple[CtaAudit, List, List]:
        audit = CtaAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        cta_texts: List[str] = []
        button_style = 0
        hero_cta = 0
        contact_cta = 0
        no_action = 0
        for s in signals:
            candidates = [b["text"] for b in s.buttons if b["text"]]
            candidates += [a["text"] for a in s.anchors if a["text"] and re.search(r"btn|button|cta", a["classes"], re.I)]
            for text in candidates:
                cta_texts.append(text)
            for b in s.buttons:
                if "btn" in b["classes"] or "button" in b["classes"]:
                    button_style += 1
                if b["type"] != "submit" and not b["aria"] and not b["text"]:
                    no_action += 1
            if s.hero_cta:
                hero_cta += 1
            if s.contact_links:
                contact_cta += 1

        unique_texts = [t for t in dict.fromkeys(cta_texts) if t]
        strong = [t for t in unique_texts if any(kw in t.lower() for kw in _STRONG_CTA)]
        audit.totalCtas = len(unique_texts)
        audit.strongCtaText = len(strong)
        audit.hasPrimaryCta = len(strong) >= 1
        audit.hasHeroCta = hero_cta > 0
        audit.hasContactCta = contact_cta > 0
        audit.ctaTexts = unique_texts[:10]
        audit.buttonStylePresent = button_style > 0
        audit.ctasWithoutAction = no_action

        score = 100
        if not audit.hasPrimaryCta:
            score -= 25
            issues.append(self._issue(CAT_CTA, "No strong call-to-action",
                                      "No action-oriented CTA such as 'Get Started' or 'Contact Us' was found.",
                                      severity="Error"))
        if not audit.hasHeroCta:
            score -= 12
            issues.append(self._issue(CAT_CTA, "Hero has no CTA",
                                      "A hero section should drive users to a single primary action.",
                                      severity="Warning"))
        if not audit.hasContactCta:
            score -= 10
            issues.append(self._issue(CAT_CTA, "No contact CTA",
                                      "Users cannot easily find a way to reach the business.",
                                      severity="Warning"))
        if audit.ctasWithoutAction:
            score -= 6
        if not audit.buttonStylePresent and audit.totalCtas > 0:
            score -= 6
        if audit.totalCtas == 0:
            score = max(0, score - 10)
            issues.append(self._issue(CAT_CTA, "No CTAs at all",
                                      "The site has no obvious conversion actions.",
                                      severity="Error"))

        if score < 70:
            recs.append(self._rec(CAT_CTA, "Strengthen calls-to-action",
                                  "Add a clear primary CTA in the hero and repeated contact/quote CTAs throughout the page.",
                                  priority="High"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: Responsive
    # ═════════════════════════════════════════════════════════════════════

    def _audit_responsive(self, signals: List[_PageSignals]) -> Tuple[ResponsiveAudit, List, List]:
        audit = ResponsiveAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        viewport = sum(1 for s in signals if s.viewport)
        queries = sum(s.media_query_count for s in signals)
        breakpoints: set = set()
        for s in signals:
            for q in s.media_queries:
                for bp in re.findall(r"(min-width|max-width)\\s*:\\s*(\\d+)(px|rem|em)", q):
                    breakpoints.add(f"{bp[0]} {bp[1]}{bp[2]}")
        responsive_classes = sum(1 for s in signals if any(t in s.class_tokens for t in (
            "md:", "lg:", "sm:", "xl:", "col-md", "col-lg", "col-sm")))
        fluid = sum(1 for s in signals if s.fixed_pixel_widths == 0 or responsive_classes > 0)

        audit.hasViewport = viewport / max(len(signals), 1) >= 0.9
        audit.mediaQueries = queries
        audit.breakpoints = sorted(breakpoints)[:8]
        audit.fluidWidths = fluid / max(len(signals), 1) >= 0.5
        audit.responsiveLayout = audit.hasViewport and (queries > 0 or responsive_classes > 0)
        audit.horizontalScrollRisk = sum(s.fixed_pixel_widths for s in signals)

        score = 100
        if not audit.hasViewport:
            score -= 30
            issues.append(self._issue(CAT_RESPONSIVE, "Missing viewport meta tag",
                                      "Without a viewport meta tag the page cannot scale correctly on mobile.",
                                      severity="Error"))
        if queries == 0 and responsive_classes == 0:
            score -= 20
            issues.append(self._issue(CAT_RESPONSIVE, "No responsive breakpoints detected",
                                      "No media queries or responsive utility classes were found — the layout likely does not adapt.",
                                      severity="Error"))
        if not audit.fluidWidths:
            score -= 10
            issues.append(self._issue(CAT_RESPONSIVE, "Fixed-width layout",
                                      "Fixed pixel widths prevent the layout from resizing fluidly.",
                                      severity="Warning"))
        if audit.horizontalScrollRisk:
            score -= min(10, audit.horizontalScrollRisk * 2)

        if score < 70:
            recs.append(self._rec(CAT_RESPONSIVE, "Make the site fully responsive",
                                  "Add a viewport meta tag and responsive breakpoints so content adapts to every screen size.",
                                  priority="High"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: Mobile
    # ═════════════════════════════════════════════════════════════════════

    def _audit_mobile(self, signals: List[_PageSignals]) -> Tuple[MobileAudit, List, List]:
        audit = MobileAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        viewport = sum(1 for s in signals if s.viewport)
        mobile_menu = sum(1 for s in signals if s.has_mobile_menu)
        apple = sum(1 for s in signals if s.has_apple_touch_icon)
        theme = sum(1 for s in signals if s.theme_color)

        small_targets = 0
        for s in signals:
            for b in s.buttons:
                if re.search(r"padding:\\s*[0-5]px", " ".join(s.inline_styles), re.I):
                    small_targets += 1
                    break
            if "hamburger" in s.html.lower() or "menu-toggle" in s.html.lower():
                mobile_menu += 1

        audit.hasViewport = viewport / max(len(signals), 1) >= 0.9
        audit.hasMobileMenu = mobile_menu > 0
        audit.hasAppleTouchIcon = apple > 0
        audit.hasThemeColor = theme > 0
        audit.tapTargetSizeOk = small_targets <= max(1, len(signals))
        audit.mobileOptimized = audit.hasViewport and (audit.hasMobileMenu or small_targets == 0)

        score = 100
        if not audit.hasViewport:
            score -= 25
            issues.append(self._issue(CAT_MOBILE, "Not mobile-optimized",
                                      "Viewport is missing so mobile rendering is not controlled.",
                                      severity="Error"))
        if not audit.hasMobileMenu:
            score -= 10
            issues.append(self._issue(CAT_MOBILE, "No mobile navigation pattern",
                                      "A dedicated mobile menu improves the small-screen experience.",
                                      severity="Warning"))
        if not audit.tapTargetSizeOk:
            score -= 10
            issues.append(self._issue(CAT_MOBILE, "Small tap targets",
                                      "Buttons or links may be too small to tap comfortably on mobile.",
                                      severity="Warning"))
        if not audit.hasAppleTouchIcon:
            score -= 4
        if not audit.hasThemeColor:
            score -= 3

        if score < 70:
            recs.append(self._rec(CAT_MOBILE, "Optimize the mobile experience",
                                  "Ensure touch-friendly tap targets, a mobile menu, apple-touch-icon and a theme color.",
                                  priority="High"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: Forms
    # ═════════════════════════════════════════════════════════════════════

    def _audit_forms(self, signals: List[_PageSignals]) -> Tuple[FormsAudit, List, List]:
        audit = FormsAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        total_forms = sum(len(s.forms) for s in signals)
        inputs = [i for s in signals for i in s.inputs if i["type"] not in ("hidden", "submit", "button")]
        total_inputs = len(inputs)
        labeled = sum(1 for i in inputs if i["aria_label"] or i["aria_labelledby"]) + sum(s.form_labels for s in signals)
        placeholder_only = sum(1 for i in inputs if i["placeholder"] and not i["aria_label"] and not i["aria_labelledby"])
        required = sum(1 for i in inputs if i["required"])
        has_submit = sum(1 for s in signals for f in s.forms if f["has_submit"])
        actions = sum(1 for s in signals for f in s.forms if f["has_action"])

        audit.totalForms = total_forms
        audit.totalInputs = total_inputs
        audit.labeledInputs = labeled
        audit.unlabeledInputs = max(0, total_inputs - labeled)
        audit.placeholderOnly = placeholder_only
        audit.requiredFields = required
        audit.hasSubmitButton = has_submit > 0
        audit.formActions = actions

        score = 100
        if total_forms > 0:
            if audit.unlabeledInputs > 0:
                score -= min(20, audit.unlabeledInputs * 5)
                issues.append(self._issue(CAT_FORMS, "Form fields without labels",
                                          f"{audit.unlabeledInputs} field(s) have no label — placeholder is not a substitute.",
                                          severity="Warning"))
            if placeholder_only > 0:
                score -= 8
                issues.append(self._issue(CAT_FORMS, "Placeholder-only fields",
                                          "Some fields rely on placeholder text alone, which disappears on input.",
                                          severity="Info"))
            if not audit.hasSubmitButton:
                score -= 10
                issues.append(self._issue(CAT_FORMS, "Form missing submit button",
                                          "No submit button was detected on the form(s).",
                                          severity="Error"))
            if actions < total_forms:
                score -= 6
        else:
            score -= 5  # no forms = fewer conversion paths

        if score < 70 and total_forms > 0:
            recs.append(self._rec(CAT_FORMS, "Improve form usability",
                                  "Give every field a visible label, keep placeholders as hints only, and add a clear submit button.",
                                  priority="Medium"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: UX
    # ═════════════════════════════════════════════════════════════════════

    def _audit_ux(self, signals: List[_PageSignals]) -> Tuple[UxAudit, List, List]:
        audit = UxAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        nav = sum(1 for s in signals if s.navs)
        hero = sum(1 for s in signals if s.has_hero)
        strong_cta = 0
        contact = sum(1 for s in signals if s.contact_links > 0)
        for s in signals:
            for a in s.anchors:
                if a["text"] and any(kw in a["text"].lower() for kw in _STRONG_CTA):
                    strong_cta += 1
                    break

        words = sum(s.word_count for s in signals)
        paragraphs = sum(s.paragraphs for s in signals)
        avg_words = words / max(len(signals), 1)
        readability = 100
        if avg_words < 50:
            readability = 40
        elif avg_words < 100:
            readability = 60
        elif avg_words < 250:
            readability = 80
        elif avg_words < 800:
            readability = 90
        else:
            readability = 95
        if paragraphs == 0 and words > 0:
            readability = max(0, readability - 15)
        audit.readabilityScore = readability

        audit.navigationClarity = nav / max(len(signals), 1) >= 0.6
        audit.ctaVisibility = strong_cta / max(len(signals), 1) >= 0.4
        audit.userJourney = (hero > 0 and strong_cta > 0 and contact > 0)
        audit.hasBreadcrumbs = any(s.has_breadcrumbs for s in signals)
        audit.hasContactAccess = contact > 0
        audit.hasSearchFeature = any(s.has_search for s in signals)

        friction = 0
        for s in signals:
            if "modal" in s.class_tokens or "popup" in s.class_tokens or "lightbox" in s.class_tokens:
                friction += 1
            if s.emoji_count > 20:
                friction += 1
        audit.frictionSignals = friction

        score = 100
        if not audit.navigationClarity:
            score -= 12
            issues.append(self._issue(CAT_UX, "Unclear navigation",
                                      "Users may struggle to find their way around the site.",
                                      severity="Warning"))
        if not audit.ctaVisibility:
            score -= 12
            issues.append(self._issue(CAT_UX, "CTAs not visible",
                                      "Strong, action-oriented CTAs are not consistently visible.",
                                      severity="Warning"))
        if not audit.userJourney:
            score -= 12
            issues.append(self._issue(CAT_UX, "Incomplete user journey",
                                      "Hero, CTAs and contact access are not all present to guide visitors to conversion.",
                                      severity="Warning"))
        if readability < 60:
            score -= 10
            issues.append(self._issue(CAT_UX, "Thin content",
                                      "Pages have very little readable content, limiting engagement and SEO.",
                                      severity="Warning"))
        if friction:
            score -= min(10, friction * 3)
            issues.append(self._issue(CAT_UX, "Friction signals detected",
                                      "Popups/modals or heavy emoji usage may distract users from core content.",
                                      severity="Info"))

        if score < 70:
            recs.append(self._rec(CAT_UX, "Smooth the user journey",
                                  "Connect navigation, content and CTAs into a clear path from first visit to conversion.",
                                  priority="High"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: Content
    # ═════════════════════════════════════════════════════════════════════

    def _audit_content(self, signals: List[_PageSignals]) -> Tuple[ContentAudit, List, List]:
        audit = ContentAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        words = sum(s.word_count for s in signals)
        pages = max(len(signals), 1)
        avg = words // pages
        thin = sum(1 for s in signals if s.word_count < 300)
        lists = sum(s.lists for s in signals)
        blog = sum(s.blog_links for s in signals)
        pagination = any(s.pagination for s in signals)
        updated = any(s.last_updated for s in signals)
        structured = sum(1 for s in signals if s.paragraphs >= 2 or s.lists >= 1)

        audit.totalWords = words
        audit.averageWordsPerPage = avg
        audit.thinPages = thin
        audit.hasBlogOrNews = blog > 0
        audit.listsUsed = lists
        audit.hasPagination = pagination
        audit.lastUpdatedSignal = updated
        audit.structuredContent = structured / pages >= 0.6

        score = 100
        if avg < 100:
            score -= 20
            issues.append(self._issue(CAT_CONTENT, "Thin page content",
                                      f"Average of {avg} words per page is far below the ~300-word guideline.",
                                      severity="Warning"))
        elif avg < 300:
            score -= 10
        if thin > 0:
            score -= min(10, thin * 2)
            issues.append(self._issue(CAT_CONTENT, "Thin pages detected",
                                      f"{thin} page(s) contain fewer than 300 words.",
                                      severity="Info"))
        if not audit.hasBlogOrNews:
            score -= 8
            issues.append(self._issue(CAT_CONTENT, "No blog or news section",
                                      "Fresh content (blog/news) is a strong engagement and SEO signal.",
                                      severity="Info"))
        if not audit.structuredContent:
            score -= 10
            issues.append(self._issue(CAT_CONTENT, "Unstructured content",
                                      "Content rarely uses paragraphs, lists or subheadings.",
                                      severity="Warning"))
        if not audit.hasPagination and blog == 0 and pages >= 8:
            score -= 4
        if not audit.lastUpdatedSignal:
            score -= 3

        if score < 70:
            recs.append(self._rec(CAT_CONTENT, "Add depth to content",
                                  "Expand each page with 300+ words of structured, scannable content and add a blog/news section.",
                                  priority="Medium"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: Images
    # ═════════════════════════════════════════════════════════════════════

    def _audit_images(self, signals: List[_PageSignals]) -> Tuple[ImagesAudit, List, List]:
        audit = ImagesAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        imgs = [i for s in signals for i in s.images]
        total = len(imgs)
        with_alt = sum(1 for i in imgs if i["has_alt"])
        lazy = sum(1 for i in imgs if i["lazy"])
        dims = sum(1 for i in imgs if i["has_dimensions"])
        decorative = sum(1 for i in imgs if i["decorative"])

        audit.total = total
        audit.withAlt = with_alt
        audit.missingAlt = total - with_alt
        audit.lazyLoaded = lazy
        audit.missingLazyLoading = max(0, total - lazy)
        audit.missingDimensions = total - dims
        audit.decorativeImages = decorative

        score = 100
        if total > 0:
            missing_ratio = audit.missingAlt / total
            if missing_ratio > 0.3:
                score -= 20
                issues.append(self._issue(CAT_IMAGES, "Images missing alt text",
                                          f"{audit.missingAlt} of {total} images lack descriptive alt text (accessibility + SEO).",
                                          severity="Warning"))
            elif missing_ratio > 0:
                score -= 10
            if audit.missingLazyLoading / total > 0.5:
                score -= 10
                issues.append(self._issue(CAT_IMAGES, "Missing lazy-loading",
                                          f"{audit.missingLazyLoading} images below the fold are not lazy-loaded.",
                                          severity="Info"))
            if audit.missingDimensions / total > 0.5:
                score -= 8
                issues.append(self._issue(CAT_IMAGES, "Images missing dimensions",
                                          "Images without width/height can cause layout shift while loading.",
                                          severity="Info"))
        else:
            score = 80

        if score < 70:
            recs.append(self._rec(CAT_IMAGES, "Fix image best practices",
                                  "Add descriptive alt text, lazy-load below-the-fold images and specify dimensions.",
                                  priority="Medium"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: Icons
    # ═════════════════════════════════════════════════════════════════════

    def _audit_icons(self, signals: List[_PageSignals]) -> Tuple[IconsAudit, List, List]:
        audit = IconsAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        svg = sum(s.svg_icons for s in signals)
        icon_fonts = 0
        social_icons = 0
        feature_icons = 0
        for s in signals:
            if s.soup is None:
                continue
            for link in s.soup.find_all("link", href=True):
                if any(kw in str(link.get("href") or "").lower() for kw in _ICON_FONT_KEYWORDS):
                    icon_fonts += 1
            for a in s.anchors:
                classes = a["classes"].lower()
                if any(kw in classes for kw in ("icon", "fa-", "ri-", "bi-", "material-icons")):
                    feature_icons += 1
                if a["external"] and any(host in a["href"] for host in _SOCIAL_HOSTS):
                    social_icons += 1
            for i_tag in s.soup.find_all("i", class_=True):
                classes = " ".join(i_tag.get("class") or []).lower()
                if any(kw in classes for kw in ("fa-", "icon", "material-icons", "ri-", "bi-", "lni")):
                    feature_icons += 1
            for span in s.soup.find_all("span", class_=True):
                classes = " ".join(span.get("class") or []).lower()
                if any(kw in classes for kw in ("icon", "fa-", "ri-", "bi-", "material-icons")):
                    feature_icons += 1

        audit.totalIcons = svg + icon_fonts + feature_icons
        audit.svgIcons = svg
        audit.iconFonts = icon_fonts
        audit.socialIcons = social_icons
        audit.featureIcons = feature_icons
        audit.emojiIcons = sum(s.emoji_count for s in signals)

        score = 100
        if audit.totalIcons == 0:
            score -= 15
            issues.append(self._issue(CAT_ICONS, "No iconography detected",
                                      "Icons improve scannability and visual interest — none were detected.",
                                      severity="Info"))
        elif audit.emojiIcons > 20 and audit.svgIcons == 0:
            score -= 10
            issues.append(self._issue(CAT_ICONS, "Heavy emoji usage as icons",
                                      "Using emojis as icons looks unprofessional — prefer an icon set.",
                                      severity="Info"))
        if audit.socialIcons == 0:
            score -= 6
        if audit.featureIcons == 0 and audit.totalIcons > 0:
            score -= 6

        if score < 70:
            recs.append(self._rec(CAT_ICONS, "Use a professional icon set",
                                  "Add consistent SVG icons for features, services and social links instead of emojis.",
                                  priority="Low"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: Branding
    # ═════════════════════════════════════════════════════════════════════

    def _audit_branding(self, signals: List[_PageSignals]) -> Tuple[BrandingAudit, List, List]:
        audit = BrandingAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        logo = sum(1 for s in signals if s.has_logo)
        favicon = sum(1 for s in signals if s.favicon_url)
        social = sum(len(s.social_links) for s in signals)
        tagline = sum(1 for s in signals if s.has_tagline)

        host_parts = [s.host for s in signals if s.host]
        brand_hint = ""
        if host_parts:
            host = host_parts[0]
            brand_hint = host.split(".")[0].replace("-", " ").replace("_", " ").strip()
        brand_in_title = sum(
            1 for s in signals
            if brand_hint and brand_hint.lower() in s.title.lower()
            or (s.title and "home" in s.title.lower() and len(s.title) > 8)
        )

        audit.hasLogo = logo / max(len(signals), 1) >= 0.5
        audit.hasFavicon = favicon / max(len(signals), 1) >= 0.5
        audit.socialLinks = social
        audit.hasTagline = tagline > 0
        audit.brandInTitle = brand_in_title / max(len(signals), 1) >= 0.5
        audit.logoText = True
        audit.consistentBranding = audit.brandInTitle and audit.hasLogo

        score = 100
        if not audit.hasLogo:
            score -= 20
            issues.append(self._issue(CAT_BRANDING, "No logo detected",
                                      "A recognizable logo in the header builds brand trust.",
                                      severity="Warning"))
        if not audit.hasFavicon:
            score -= 10
            issues.append(self._issue(CAT_BRANDING, "Missing favicon",
                                      "The browser tab shows no brand icon.",
                                      severity="Info"))
        if not audit.brandInTitle:
            score -= 12
            issues.append(self._issue(CAT_BRANDING, "Brand not in page title",
                                      "Page titles should include the business name for recognition and SEO.",
                                      severity="Warning"))
        if not audit.hasTagline:
            score -= 6
        if audit.socialLinks == 0:
            score -= 6

        if score < 70:
            recs.append(self._rec(CAT_BRANDING, "Strengthen brand identity",
                                  "Ensure a consistent logo, favicon and brand name in titles across all pages.",
                                  priority="Medium"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: Accessibility
    # ═════════════════════════════════════════════════════════════════════

    def _audit_accessibility(self, signals: List[_PageSignals]) -> Tuple[AccessibilityAudit, List, List]:
        audit = AccessibilityAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        lang = sum(1 for s in signals if s.lang)
        imgs = [i for s in signals for i in s.images]
        total_imgs = len(imgs)
        with_alt = sum(1 for i in imgs if i["has_alt"])
        alt_coverage = int((with_alt / total_imgs) * 100) if total_imgs else 100
        aria = sum(s.aria_attributes for s in signals)
        semantic = sum(1 for s in signals if s.semantic_structure >= 3)
        skip = sum(1 for s in signals if s.skip_link)
        labels = sum(s.form_labels for s in signals)
        heading_issues = sum(s.heading_issues for s in signals)
        contrast = sum(s.contrast_suspects for s in signals)

        audit.hasLang = lang / max(len(signals), 1) >= 0.8
        audit.altCoverage = alt_coverage
        audit.formLabels = labels
        audit.ariaAttributes = aria
        audit.semanticStructure = semantic / max(len(signals), 1) >= 0.6
        audit.skipLink = skip > 0
        audit.headingOrderIssues = heading_issues
        audit.contrastIssues = contrast

        score = 100
        if not audit.hasLang:
            score -= 10
            issues.append(self._issue(CAT_ACCESSIBILITY, "Missing lang attribute",
                                      "The <html> element should declare a language for screen readers.",
                                      severity="Warning"))
        if alt_coverage < 70:
            score -= 15
            issues.append(self._issue(CAT_ACCESSIBILITY, "Low alt-text coverage",
                                      f"Only {alt_coverage}% of images have alt text.",
                                      severity="Warning"))
        elif alt_coverage < 100:
            score -= 8
        if labels == 0 and any(len(s.forms) > 0 for s in signals):
            score -= 8
            issues.append(self._issue(CAT_ACCESSIBILITY, "Form fields may be unlabeled",
                                      "Forms should label every field for assistive technology.",
                                      severity="Warning"))
        if not audit.semanticStructure:
            score -= 12
            issues.append(self._issue(CAT_ACCESSIBILITY, "Weak semantic structure",
                                      "Landmark elements (header/main/footer/nav) are not consistently used.",
                                      severity="Warning"))
        if heading_issues:
            score -= min(10, heading_issues * 2)
            issues.append(self._issue(CAT_ACCESSIBILITY, "Heading order issues",
                                      f"{heading_issues} heading(s) break the natural H1→H2→H3 hierarchy.",
                                      severity="Info"))
        if contrast:
            score -= min(10, contrast * 3)
        if not audit.skipLink:
            score -= 4
        if aria == 0 and total_imgs == 0:
            score -= 3

        if score < 70:
            recs.append(self._rec(CAT_ACCESSIBILITY, "Improve accessibility (WCAG)",
                                  "Add lang attribute, descriptive alt text, form labels, ARIA landmarks and a skip link.",
                                  priority="High"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: Modern Design
    # ═════════════════════════════════════════════════════════════════════

    def _audit_modern_design(self, signals: List[_PageSignals]) -> Tuple[ModernDesignAudit, List, List]:
        audit = ModernDesignAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        framework = sum(1 for s in signals if s.modern_framework_tokens >= 3)
        css_vars = sum(1 for s in signals if s.has_css_variables)
        animations = sum(1 for s in signals if s.animations > 0)
        gradients = sum(1 for s in signals if s.gradients > 0)
        rounded = sum(1 for s in signals if s.rounded_corners > 0)
        dark = sum(1 for s in signals if s.prefers_dark)
        smooth = sum(1 for s in signals if s.smooth_scroll)
        fonts = sum(1 for s in signals if len(s.font_families) > 0)

        audit.modernFramework = framework / max(len(signals), 1) >= 0.5
        audit.usesCssVariables = css_vars / max(len(signals), 1) >= 0.3
        audit.hasAnimations = animations > 0
        audit.hasGradients = gradients > 0
        audit.hasRoundedCorners = rounded > 0
        audit.hasDarkMode = dark > 0
        audit.smoothScrolling = smooth > 0
        audit.modernFonts = fonts / max(len(signals), 1) >= 0.3

        score = 100
        if not audit.modernFramework:
            score -= 18
            issues.append(self._issue(CAT_MODERN, "No modern CSS framework usage",
                                      "Modern layouts use grid/flexbox frameworks or utility CSS — none detected.",
                                      severity="Warning"))
        if not audit.hasRoundedCorners and not audit.hasGradients:
            score -= 12
            issues.append(self._issue(CAT_MODERN, "Flat / dated styling",
                                      "No rounded corners, gradients or other modern visual cues were detected.",
                                      severity="Info"))
        if not audit.hasAnimations:
            score -= 8
        if not audit.usesCssVariables:
            score -= 6
        if not audit.modernFonts:
            score -= 6
        if not audit.hasDarkMode:
            score -= 3
        if not audit.smoothScrolling:
            score -= 2

        if score < 70:
            recs.append(self._rec(CAT_MODERN, "Adopt modern design patterns",
                                  "Modernize the interface with current CSS techniques, motion and updated typography.",
                                  priority="Medium"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Module: Trust
    # ═════════════════════════════════════════════════════════════════════

    def _audit_trust(self, signals: List[_PageSignals]) -> Tuple[TrustAudit, List, List]:
        audit = TrustAudit()
        issues: List[UIUXVisualIssue] = []
        recs: List[UIUXRecommendation] = []

        testimonial = sum(s.testimonial_signals for s in signals)
        review = sum(s.review_signals for s in signals)
        badge = sum(s.trust_badge_signals for s in signals)
        cert = sum(s.certification_signals for s in signals)
        guarantee = sum(s.guarantee_signals for s in signals)
        contact = sum(s.contact_info_signals for s in signals)
        privacy = any(s.privacy_link for s in signals)
        about = any(s.about_link for s in signals)
        secure = any(s.secure_site for s in signals)

        audit.hasTestimonials = testimonial > 0
        audit.hasReviews = review > 0
        audit.hasTrustBadges = badge > 0
        audit.hasCertifications = cert > 0
        audit.hasGuarantee = guarantee > 0
        audit.hasContactInfo = contact > 0
        audit.hasPrivacyPolicy = privacy
        audit.hasAboutPage = about
        audit.secureSite = secure

        score = 100
        if not audit.hasContactInfo:
            score -= 15
            issues.append(self._issue(CAT_TRUST, "No visible contact information",
                                      "Phone, email or address signals were not found — users may not trust the business.",
                                      severity="Warning"))
        if not audit.hasTestimonials and not audit.hasReviews:
            score -= 12
            issues.append(self._issue(CAT_TRUST, "No social proof",
                                      "No testimonials, reviews or ratings were detected.",
                                      severity="Info"))
        if not audit.hasTrustBadges:
            score -= 8
        if not audit.hasCertifications:
            score -= 6
        if not audit.hasPrivacyPolicy:
            score -= 8
            issues.append(self._issue(CAT_TRUST, "No privacy policy link",
                                      "A privacy policy is expected for user trust (and often legal compliance).",
                                      severity="Info"))
        if not audit.hasAboutPage:
            score -= 6
        if not audit.secureSite:
            score -= 10
            issues.append(self._issue(CAT_TRUST, "Site may not be served over HTTPS",
                                      "Secure connections are a baseline trust requirement.",
                                      severity="Error"))
        if audit.hasTestimonials or audit.hasReviews:
            score += 5

        if score < 70:
            recs.append(self._rec(CAT_TRUST, "Build trust signals",
                                  "Add testimonials, reviews, trust badges, certifications, contact info and a privacy policy.",
                                  priority="Medium"))
        return self._module(audit, len(issues), len(recs), score), issues, recs

    # ═════════════════════════════════════════════════════════════════════
    # Redesign + Sales opportunity
    # ═════════════════════════════════════════════════════════════════════

    def _build_redesign_opportunity(self, results: Dict[str, Optional[UIUXModuleAudit]]) -> RedesignOpportunity:
        weak = []
        for name, audit in results.items():
            if audit is None:
                continue
            score = safe_score(getattr(audit, "score", 0))
            if score < 60:
                weak.append((name, score))
        redesign_score = _round_score(self._overall_score(results))
        if redesign_score >= 80:
            level = "Low"
        elif redesign_score >= 60:
            level = "Medium"
        else:
            level = "High"

        changes: List[str] = []
        change_map = {
            "visualDesign": "Modernize the visual design with a fresh hero and consistent hierarchy",
            "colors": "Introduce a consistent brand color palette",
            "typography": "Upgrade typography for readability and hierarchy",
            "layout": "Rebuild the layout on a responsive grid system",
            "navigation": "Redesign the navigation for clarity and mobile use",
            "cta": "Place clear, action-oriented CTAs across key pages",
            "responsive": "Make the site fully responsive across devices",
            "mobile": "Optimize the mobile experience and tap targets",
            "forms": "Improve form design and labeling",
            "ux": "Simplify the user journey toward conversion",
            "content": "Rebuild pages with richer, structured content",
            "images": "Refresh imagery and fix image best practices",
            "icons": "Adopt a professional icon set",
            "branding": "Strengthen brand identity and consistency",
            "accessibility": "Meet WCAG accessibility guidelines",
            "modernDesign": "Adopt modern design trends and motion",
            "trust": "Add trust signals and social proof",
        }
        for name in dict.fromkeys([w for w, _ in sorted(weak, key=lambda kv: kv[1])]):
            if name in change_map:
                changes.append(change_map[name])

        return RedesignOpportunity(
            score=redesign_score,
            opportunityLevel=level,
            rationale=(
                "The site is dated and underperforming on several core UI/UX dimensions, "
                "making it a strong candidate for a redesign."
                if level == "High" else
                "The site is functional but has clear room for visual and UX improvement."
                if level == "Medium" else
                "The site is already well-designed; only incremental polish is recommended."
            ),
            estimatedImpact="High" if level == "High" else ("Moderate" if level == "Medium" else "Low"),
            suggestedChanges=changes[:8],
            payoff="A modern redesign typically lifts conversion and engagement significantly.",
        )

    def _build_sales_opportunity(self, results: Dict[str, Optional[UIUXModuleAudit]],
                                 website_url: str) -> SalesOpportunity:
        scores = {
            name: safe_score(getattr(audit, "score", 0))
            for name, audit in results.items()
            if audit is not None
        }
        opportunity_score = _round_score(self._overall_score(results))
        if opportunity_score >= 80:
            level = "Low"
        elif opportunity_score >= 60:
            level = "Medium"
        else:
            level = "High"

        selling_points = []
        if scores.get("mobile", 0) >= 70:
            selling_points.append("Solid mobile experience")
        if scores.get("responsive", 0) >= 70:
            selling_points.append("Responsive layout in place")
        if scores.get("trust", 0) >= 70:
            selling_points.append("Good trust signals and social proof")
        if scores.get("content", 0) >= 70:
            selling_points.append("Decent content depth")
        if scores.get("accessibility", 0) >= 70:
            selling_points.append("Reasonable accessibility baseline")

        pain_points = []
        if scores.get("visualDesign", 0) < 60:
            pain_points.append("Outdated visual design and weak first impression")
        if scores.get("cta", 0) < 60:
            pain_points.append("Missing or weak calls-to-action hurting conversions")
        if scores.get("responsive", 0) < 60:
            pain_points.append("Poor responsiveness across devices")
        if scores.get("navigation", 0) < 60:
            pain_points.append("Navigation is unclear or hard to use")
        if scores.get("modernDesign", 0) < 60:
            pain_points.append("Site looks dated compared to competitors")
        if scores.get("forms", 0) < 60:
            pain_points.append("Forms are unlabeled or hard to complete")
        if scores.get("accessibility", 0) < 60:
            pain_points.append("Accessibility gaps (WCAG compliance)")
        if not pain_points:
            pain_points.append("Incremental polish opportunities remain")

        services = []
        if scores.get("visualDesign", 0) < 65 or scores.get("modernDesign", 0) < 65:
            services.append("Website Redesign")
        if scores.get("responsive", 0) < 65 or scores.get("mobile", 0) < 65:
            services.append("Responsive / Mobile Optimization")
        if scores.get("navigation", 0) < 65 or scores.get("ux", 0) < 65:
            services.append("UX & Conversion Optimization")
        if scores.get("cta", 0) < 65:
            services.append("CTA & Conversion Strategy")
        if scores.get("accessibility", 0) < 65:
            services.append("Accessibility Remediation")
        if scores.get("content", 0) < 65:
            services.append("Content Strategy & Refresh")
        if not services:
            services.append("Ongoing UI/UX Optimization")

        pitch = (
            f"We reviewed {website_url} against modern UI/UX and conversion benchmarks. "
            f"Its current score is {opportunity_score}/100. "
            + ("We can modernize the design and significantly lift conversions."
               if level == "High" else
               "We can help close the remaining UX gaps and increase conversion."
               if level == "Medium" else
               "We can help with incremental polish and ongoing optimization.")
        )

        return SalesOpportunity(
            score=opportunity_score,
            opportunityLevel=level,
            sellingPoints=selling_points[:6],
            painPoints=pain_points[:6],
            suggestedServices=services[:6],
            pitchSummary=pitch,
        )


uiux_audit_service = UIUXAuditService()
