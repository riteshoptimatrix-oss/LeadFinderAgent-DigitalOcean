"""
Content Quality Analysis Service
================================
Evaluates the depth, structure, freshness and engagement of the
website's content from the crawled pages.
"""

import logging
import re
from typing import Dict, List, Any
from bs4 import BeautifulSoup

from app.models.content_analysis import (
    ContentAnalysisResultCreate,
    ContentScorecard,
    ContentIssue,
    ContentPageMetric,
)
from app.services.safe_scoring import safe_score, safe_int

logger = logging.getLogger(__name__)

THIN_CONTENT_THRESHOLD = 300


class ContentAnalysisService:
    def __init__(self):
        pass

    def _extract_text(self, page: Dict) -> str:
        return page.get("rendered_html") or page.get("html") or ""

    def _analyze_page(self, page: Dict) -> ContentPageMetric:
        html = self._extract_text(page)
        url = page.get("url") or ""
        soup = BeautifulSoup(html, "html.parser") if html else None

        word_count = 0
        heading_count = 0
        image_count = 0
        video_count = 0
        has_cta = False
        has_blog_link = False
        has_testimonial = False
        title = ""

        if soup:
            title_tag = soup.find("title")
            title = title_tag.get_text(strip=True) if title_tag else ""

            text = soup.get_text(" ", strip=True)
            words = re.findall(r"\b\w+\b", text)
            word_count = len(words)

            heading_count = sum(len(soup.find_all(f"h{i}")) for i in range(1, 7))
            image_count = len(soup.find_all("img"))
            video_count = len(soup.find_all(["video", "iframe"])) + len(
                soup.find_all("source", attrs={"src": re.compile(r"\.(mp4|webm)", re.I)})
            )

            cta_keywords = re.compile(
                r"(contact us|get started|book now|buy now|request a quote|free quote|schedule|enquire|learn more|call us|join now|sign up|subscribe|order now)",
                re.I,
            )
            page_text_lower = text.lower()
            if cta_keywords.search(text):
                has_cta = True

            if re.search(r"\b(blog|news|insights|articles?|resources)\b", page_text_lower):
                has_blog_link = True

            testimonial_keywords = re.compile(
                r"(testimonial|reviews?|our clients|case stud(y|ies)|what our customers say|trusted by|success stories)",
                re.I,
            )
            if testimonial_keywords.search(text):
                has_testimonial = True

        return ContentPageMetric(
            url=url,
            title=title,
            word_count=word_count,
            heading_count=heading_count,
            image_count=image_count,
            video_count=video_count,
            has_cta=has_cta,
            has_blog_link=has_blog_link,
            has_testimonial=has_testimonial,
            is_thin_content=word_count > 0 and word_count < THIN_CONTENT_THRESHOLD,
        )

    def _score(self, metrics: List[ContentPageMetric]) -> ContentScorecard:
        if not metrics:
            return ContentScorecard(
                overall_content_score=0,
                depth_score=0,
                structure_score=0,
                freshness_score=0,
                engagement_score=0,
            )

        n = len(metrics)
        word_counts = [m.word_count for m in metrics if m.word_count > 0]
        avg_words = sum(word_counts) / len(word_counts) if word_counts else 0

        thin_count = sum(1 for m in metrics if m.is_thin_content)
        structure_count = sum(1 for m in metrics if m.heading_count >= 2)
        cta_count = sum(1 for m in metrics if m.has_cta)
        blog_count = sum(1 for m in metrics if m.has_blog_link)
        testimonial_count = sum(1 for m in metrics if m.has_testimonial)

        if avg_words >= 1200:
            depth_score = 90
        elif avg_words >= 700:
            depth_score = 75
        elif avg_words >= 300:
            depth_score = 55
        else:
            depth_score = 30

        structure_score = safe_score((structure_count / n) * 80 + (20 if any(m.title for m in metrics) else 0))
        engagement_score = safe_score(
            (cta_count / n) * 55 + (min(25, int((blog_count / n) * 25))) + (min(20, int((testimonial_count / n) * 20)))
        )
        freshness_score = safe_score(max(40, 100 - (thin_count * 15)))

        overall = safe_score(
            (depth_score * 0.35)
            + (structure_score * 0.25)
            + (engagement_score * 0.25)
            + (freshness_score * 0.15)
        )

        return ContentScorecard(
            overall_content_score=overall,
            depth_score=depth_score,
            structure_score=structure_score,
            freshness_score=freshness_score,
            engagement_score=engagement_score,
        )

    def _build_issues(self, metrics: List[ContentPageMetric]) -> List[ContentIssue]:
        issues: List[ContentIssue] = []
        if not metrics:
            return issues

        thin = [m for m in metrics if m.is_thin_content]
        if thin:
            issues.append(
                ContentIssue(
                    issue_type="Thin Content",
                    description=f"{len(thin)} page(s) have fewer than {THIN_CONTENT_THRESHOLD} words.",
                    severity="Medium",
                    affected_url=thin[0].url or None,
                )
            )

        if not any(m.has_cta for m in metrics):
            issues.append(
                ContentIssue(
                    issue_type="Missing Call-to-Action",
                    description="No clear call-to-action detected on any page.",
                    severity="High",
                )
            )

        if not any(m.has_blog_link for m in metrics):
            issues.append(
                ContentIssue(
                    issue_type="No Blog or Resources",
                    description="No blog, news or resources section detected.",
                    severity="Low",
                )
            )

        if not any(m.has_testimonial for m in metrics):
            issues.append(
                ContentIssue(
                    issue_type="No Social Proof",
                    description="No testimonials, reviews or case studies detected.",
                    severity="Medium",
                )
            )

        if not any(m.heading_count >= 2 for m in metrics):
            issues.append(
                ContentIssue(
                    issue_type="Poor Content Structure",
                    description="Pages lack a clear heading hierarchy (H1/H2/H3).",
                    severity="Medium",
                )
            )

        return issues[:8]

    def _build_suggestions(self, issues: List[ContentIssue]) -> List[str]:
        suggestions: List[str] = []
        for issue in issues:
            if issue.issue_type == "Thin Content":
                suggestions.append("Expand thin pages to at least 700 words with valuable, keyword-rich copy.")
            elif issue.issue_type == "Missing Call-to-Action":
                suggestions.append("Add clear CTAs (contact us, request a quote) on every page.")
            elif issue.issue_type == "No Blog or Resources":
                suggestions.append("Start a blog or resources section to boost SEO and credibility.")
            elif issue.issue_type == "No Social Proof":
                suggestions.append("Add testimonials or case studies to build trust.")
            elif issue.issue_type == "Poor Content Structure":
                suggestions.append("Use a clear heading hierarchy (one H1, logical H2/H3) on each page.")
        return suggestions[:6]

    async def analyze_content(
        self,
        lead_id: str,
        website_url: str,
        pages: List[Dict],
        on_update=None,
    ) -> ContentAnalysisResultCreate:
        if on_update:
            await on_update("Content Analysis", website_url, {"current_stage": "Evaluating content quality"})

        metrics = [self._analyze_page(p) for p in (pages or [])]
        scorecard = self._score(metrics)
        issues = self._build_issues(metrics)
        suggestions = self._build_suggestions(issues)

        avg_words = (
            sum(m.word_count for m in metrics) / len(metrics)
            if metrics
            else 0
        )
        meta = {
            "pages_analyzed": len(metrics),
            "avg_word_count": round(avg_words, 1),
            "thin_pages": sum(1 for m in metrics if m.is_thin_content),
            "pages_with_cta": sum(1 for m in metrics if m.has_cta),
            "pages_with_blog": sum(1 for m in metrics if m.has_blog_link),
            "pages_with_testimonial": sum(1 for m in metrics if m.has_testimonial),
        }

        return ContentAnalysisResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            scorecard=scorecard,
            issues=issues,
            page_metrics=metrics,
            suggestions=suggestions,
            metrics=meta,
        )
