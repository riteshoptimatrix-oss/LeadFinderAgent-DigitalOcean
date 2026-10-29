"""
Social Media Presence Analysis Service
=======================================
Scans all crawled pages for links to social media profiles and scores
the lead's social presence across the major platforms.
"""

import logging
from typing import Dict, List, Any
from urllib.parse import urlparse
from bs4 import BeautifulSoup

from app.models.social_media_analysis import (
    SocialMediaAnalysisResultCreate,
    SocialMediaScorecard,
    SocialProfile,
    SocialMediaIssue,
)
from app.services.safe_scoring import safe_score, safe_get, safe_int

logger = logging.getLogger(__name__)

# Platform → tuple of (canonical name, domains to match)
SOCIAL_PLATFORMS: Dict[str, List[str]] = {
    "linkedin": ["linkedin.com", "linkedin.co.in", "linkedin.in"],
    "facebook": ["facebook.com", "fb.com", "fb.me", "m.facebook.com"],
    "instagram": ["instagram.com", "instagr.am"],
    "twitter": ["twitter.com", "x.com"],
    "youtube": ["youtube.com", "youtu.be"],
    "threads": ["threads.net"],
    "telegram": ["telegram.me", "t.me"],
    "github": ["github.com"],
    "pinterest": ["pinterest.com", "pin.it"],
    "medium": ["medium.com"],
    "tiktok": ["tiktok.com"],
    "whatsapp": ["wa.me", "whatsapp.com"],
    "behance": ["behance.net"],
    "dribbble": ["dribbble.com"],
}

CORE_PLATFORMS = ["linkedin", "facebook", "instagram", "twitter", "youtube"]


def classify_social_url(url: str) -> str:
    """Return the canonical platform key for a URL, or '' if not social."""
    if not url:
        return ""
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return ""
    if host.startswith("www."):
        host = host[4:]
    for platform, domains in SOCIAL_PLATFORMS.items():
        for domain in domains:
            if host == domain or host.endswith("." + domain):
                return platform
    return ""


class SocialMediaAnalysisService:
    def __init__(self):
        pass

    def _collect_urls(self, pages: List[Dict]) -> List[str]:
        urls: List[str] = []
        for page in pages or []:
            html = page.get("rendered_html") or page.get("html") or ""
            if not html:
                continue
            soup = BeautifulSoup(html, "html.parser")
            for a in soup.find_all("a", href=True):
                href = a.get("href", "").strip()
                if href and href.startswith("http"):
                    urls.append(href)
        return urls

    def _find_profiles(self, urls: List[str], website_url: str) -> List[SocialProfile]:
        profiles: List[SocialProfile] = []
        seen: Dict[str, str] = {}

        own_domain = ""
        try:
            own_domain = urlparse(website_url).netloc.lower()
        except Exception:
            pass

        for url in urls:
            platform = classify_social_url(url)
            if not platform:
                continue
            if platform not in seen:
                seen[platform] = url
                handle = ""
                try:
                    parts = urlparse(url).path.strip("/").split("/")
                    if parts and parts[0] and parts[0] not in ("in", "pub", "company", "user", "channel", "c", "u"):
                        handle = parts[0]
                except Exception:
                    handle = ""
                profiles.append(
                    SocialProfile(
                        platform=platform,
                        url=url,
                        handle=handle or None,
                        source_page=own_domain or None,
                    )
                )

        # Detect the site's own domain profiles (e.g. /linkedin links) separately
        for profile in profiles:
            pass

        return profiles

    def _score_presence(self, profiles: List[SocialProfile]) -> SocialMediaScorecard:
        present = {p.platform for p in profiles}

        platform_scores = {
            "linkedin": 100 if "linkedin" in present else 0,
            "facebook": 100 if "facebook" in present else 0,
            "instagram": 100 if "instagram" in present else 0,
            "twitter": 100 if "twitter" in present else 0,
            "youtube": 100 if "youtube" in present else 0,
        }
        others_present = [p for p in profiles if p.platform not in CORE_PLATFORMS]
        others_score = safe_score(50 + (15 * len(others_present))) if others_present else 0

        core_weights = [0.25, 0.2, 0.2, 0.2, 0.15]
        presence_raw = sum(
            safe_score(v) * w for v, w in zip(platform_scores.values(), core_weights)
        )
        presence_score = safe_score(presence_raw)
        overall = safe_score((presence_score * 0.7) + (others_score * 0.3))

        return SocialMediaScorecard(
            overall_social_score=overall,
            presence_score=presence_score,
            linkedin_score=safe_score(platform_scores["linkedin"]),
            facebook_score=safe_score(platform_scores["facebook"]),
            instagram_score=safe_score(platform_scores["instagram"]),
            twitter_score=safe_score(platform_scores["twitter"]),
            youtube_score=safe_score(platform_scores["youtube"]),
            others_score=safe_score(others_score),
        )

    def _build_issues(
        self, profiles: List[SocialProfile], scorecard: SocialMediaScorecard
    ) -> List[SocialMediaIssue]:
        present = {p.platform for p in profiles}
        issues: List[SocialMediaIssue] = []

        missing = [p for p in CORE_PLATFORMS if p not in present]
        if len(present) == 0:
            issues.append(
                SocialMediaIssue(
                    issue_type="No Social Presence",
                    description="No social media profiles were discovered on the website.",
                    severity="Critical",
                )
            )
        else:
            for platform in missing:
                issues.append(
                    SocialMediaIssue(
                        issue_type=f"Missing {platform.title()}",
                        platform=platform,
                        description=f"No {platform.title()} profile found on the website.",
                        severity="Medium" if platform in ("linkedin", "facebook", "instagram") else "Low",
                    )
                )

        if len(present) <= 1 and len(present) > 0:
            issues.append(
                SocialMediaIssue(
                    issue_type="Limited Social Presence",
                    description="Only one social platform was detected. Businesses typically use 3+ channels.",
                    severity="Medium",
                )
            )

        return issues

    def _build_suggestions(self, issues: List[SocialMediaIssue]) -> List[str]:
        suggestions: List[str] = []
        for issue in issues:
            if issue.issue_type == "No Social Presence":
                suggestions.append("Create profiles on LinkedIn, Facebook, Instagram and YouTube and link them from the website.")
            elif issue.issue_type.startswith("Missing"):
                suggestions.append(f"Add a {issue.platform.title()} profile link to the website footer and contact page.")
            elif issue.issue_type == "Limited Social Presence":
                suggestions.append("Expand social presence to at least 3 platforms to improve reach and trust.")
        return suggestions[:6]

    async def analyze_social_media(
        self,
        lead_id: str,
        website_url: str,
        pages: List[Dict],
        on_update=None,
    ) -> SocialMediaAnalysisResultCreate:
        if on_update:
            await on_update("Social Media Analysis", website_url, {"current_stage": "Scanning pages for social profiles"})

        urls = self._collect_urls(pages)
        profiles = self._find_profiles(urls, website_url)
        scorecard = self._score_presence(profiles)
        issues = self._build_issues(profiles, scorecard)
        suggestions = self._build_suggestions(issues)

        return SocialMediaAnalysisResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            scorecard=scorecard,
            profiles=profiles,
            issues=issues,
            suggestions=suggestions,
        )
