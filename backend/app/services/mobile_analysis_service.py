"""
Mobile-Friendliness Analysis Service
====================================
Analyzes crawled page HTML for mobile-friendliness signals:
viewport meta tags, responsive CSS, tap-target sizing, typography
and layout issues.
"""

import logging
import re
from typing import Dict, List, Any
from bs4 import BeautifulSoup

from app.models.mobile_analysis import (
    MobileAnalysisResultCreate,
    MobileScorecard,
    MobileIssue,
    MobilePageMetric,
)
from app.services.safe_scoring import safe_score, safe_int

logger = logging.getLogger(__name__)

TAP_TARGET_MIN_PX = 44
TINY_FONT_MIN_PX = 12


class MobileAnalysisService:
    def __init__(self):
        pass

    def _extract_page_text(self, page: Dict) -> str:
        return page.get("rendered_html") or page.get("html") or ""

    def _analyze_page(self, page: Dict) -> MobilePageMetric:
        html = self._extract_page_text(page)
        url = page.get("url") or ""
        soup = BeautifulSoup(html, "html.parser") if html else None

        has_viewport = False
        viewport_content = ""
        if soup:
            viewport_meta = soup.find("meta", attrs={"name": re.compile("viewport", re.I)})
            if viewport_meta:
                has_viewport = True
                viewport_content = viewport_meta.get("content", "")

        media_queries = 0
        css_breakpoints = 0
        if soup:
            for style_tag in soup.find_all("style"):
                css = style_tag.get_text() or ""
                media_queries += len(re.findall(r"@media", css, re.I))
                css_breakpoints += len(re.findall(r"@media\s+[^{]+", css, re.I))

        small_tap_targets = 0
        tiny_fonts = 0
        oversized_images = 0
        if soup:
            for el in soup.find_all(["a", "button", "input", "select", "summary"]):
                style = el.get("style") or ""
                cls = el.get("class") or []
                size_m = re.search(r"(?:width|height)\s*:\s*(\d+(?:\.\d+)?)\s*px", style)
                if size_m and float(size_m.group(1)) < TAP_TARGET_MIN_PX:
                    small_tap_targets += 1

            for el in soup.find_all(style=True):
                style = el.get("style", "")
                font_m = re.search(r"font-size\s*:\s*(\d+(?:\.\d+)?)\s*px", style)
                if font_m and float(font_m.group(1)) < TINY_FONT_MIN_PX:
                    tiny_fonts += 1

            for img in soup.find_all("img"):
                w = img.get("width")
                if w and re.fullmatch(r"\d{4,}", str(w)):
                    oversized_images += 1

        horizontal_scroll_risk = False
        for tag in soup.find_all() if soup else []:
            style = tag.get("style") or ""
            if re.search(r"width\s*:\s*\d{4,}px", style):
                horizontal_scroll_risk = True
                break

        return MobilePageMetric(
            url=url,
            has_viewport=has_viewport,
            viewport_content=viewport_content or None,
            has_responsive_meta=bool(media_queries > 0),
            css_breakpoints=css_breakpoints,
            media_queries=media_queries,
            small_tap_targets=small_tap_targets,
            tiny_fonts=tiny_fonts,
            horizontal_scroll_risk=horizontal_scroll_risk,
            oversized_images=oversized_images,
        )

    def _score_pages(self, metrics: List[MobilePageMetric]) -> MobileScorecard:
        if not metrics:
            return MobileScorecard(
                overall_mobile_score=0,
                viewport_score=0,
                responsive_score=0,
                tap_target_score=0,
                typography_score=0,
                layout_score=0,
            )

        n = len(metrics)

        viewport_ratio = sum(1 for m in metrics if m.has_viewport) / n
        responsive_ratio = sum(1 for m in metrics if m.has_responsive_meta) / n
        target_ratio = sum(1 for m in metrics if m.small_tap_targets == 0) / n
        font_ratio = sum(1 for m in metrics if m.tiny_fonts == 0) / n
        layout_ratio = sum(1 for m in metrics if not m.horizontal_scroll_risk) / n

        viewport_score = safe_score(viewport_ratio * 100)
        responsive_score = safe_score(60 + (responsive_ratio * 40))
        tap_target_score = safe_score(target_ratio * 100)
        typography_score = safe_score(font_ratio * 100)
        layout_score = safe_score(layout_ratio * 100)

        overall = safe_score(
            (viewport_score * 0.25)
            + (responsive_score * 0.25)
            + (tap_target_score * 0.2)
            + (typography_score * 0.15)
            + (layout_score * 0.15)
        )

        return MobileScorecard(
            overall_mobile_score=overall,
            viewport_score=viewport_score,
            responsive_score=responsive_score,
            tap_target_score=tap_target_score,
            typography_score=typography_score,
            layout_score=layout_score,
        )

    def _build_issues(self, metrics: List[MobilePageMetric], scorecard: MobileScorecard) -> List[MobileIssue]:
        issues: List[MobileIssue] = []
        if not metrics:
            return issues

        no_viewport = [m for m in metrics if not m.has_viewport]
        if no_viewport:
            issues.append(
                MobileIssue(
                    issue_type="Missing Viewport Meta",
                    description=f"{len(no_viewport)} page(s) lack a viewport meta tag, breaking mobile rendering.",
                    severity="Critical",
                    affected_url=no_viewport[0].url or None,
                )
            )

        scroll_risk = [m for m in metrics if m.horizontal_scroll_risk]
        if scroll_risk:
            issues.append(
                MobileIssue(
                    issue_type="Horizontal Scroll Risk",
                    description=f"{len(scroll_risk)} page(s) use fixed widths wider than typical mobile screens.",
                    severity="High",
                    affected_url=scroll_risk[0].url or None,
                )
            )

        tap_issues = sum(m.small_tap_targets for m in metrics)
        if tap_issues:
            issues.append(
                MobileIssue(
                    issue_type="Small Tap Targets",
                    description=f"Found {tap_issues} clickable element(s) smaller than {TAP_TARGET_MIN_PX}px.",
                    severity="Medium",
                )
            )

        tiny_fonts = sum(m.tiny_fonts for m in metrics)
        if tiny_fonts:
            issues.append(
                MobileIssue(
                    issue_type="Tiny Font Sizes",
                    description=f"Found {tiny_fonts} element(s) with font sizes below {TINY_FONT_MIN_PX}px.",
                    severity="Medium",
                )
            )

        if scorecard.responsive_score < 60:
            issues.append(
                MobileIssue(
                    issue_type="Limited Responsive CSS",
                    description="Few or no responsive media queries detected; layout may not adapt to small screens.",
                    severity="Medium",
                )
            )

        return issues[:8]

    def _build_suggestions(self, issues: List[MobileIssue]) -> List[str]:
        suggestions: List[str] = []
        for issue in issues:
            if issue.issue_type == "Missing Viewport Meta":
                suggestions.append("Add `<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">` to every page.")
            elif issue.issue_type == "Horizontal Scroll Risk":
                suggestions.append("Replace fixed pixel widths with fluid layout (`max-width: 100%`).")
            elif issue.issue_type == "Small Tap Targets":
                suggestions.append(f"Ensure all tap targets are at least {TAP_TARGET_MIN_PX}px square.")
            elif issue.issue_type == "Tiny Font Sizes":
                suggestions.append(f"Use font sizes of at least {TINY_FONT_MIN_PX}px for comfortable mobile reading.")
            elif issue.issue_type == "Limited Responsive CSS":
                suggestions.append("Adopt a responsive framework or add media queries for mobile breakpoints.")
        return suggestions[:6]

    async def analyze_mobile(
        self,
        lead_id: str,
        website_url: str,
        pages: List[Dict],
        on_update=None,
    ) -> MobileAnalysisResultCreate:
        if on_update:
            await on_update("Mobile Analysis", website_url, {"current_stage": "Evaluating mobile-friendliness"})

        metrics = [self._analyze_page(p) for p in (pages or [])]
        scorecard = self._score_pages(metrics)
        issues = self._build_issues(metrics, scorecard)
        suggestions = self._build_suggestions(issues)

        return MobileAnalysisResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            scorecard=scorecard,
            issues=issues,
            page_metrics=metrics,
            suggestions=suggestions,
        )
