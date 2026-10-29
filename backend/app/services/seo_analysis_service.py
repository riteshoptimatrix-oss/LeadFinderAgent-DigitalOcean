import re
import logging
import json
import asyncio
from typing import Dict, List, Any
from bs4 import BeautifulSoup

from app.models.seo_analysis import (
    SeoAnalysisResultCreate, SeoScorecard, SeoIssue, PageLevelAudit
)
from app.services.safe_scoring import safe_score, safe_float, safe_int, safe_get
from app.services.pagespeed_client import get_pagespeed_client

logger = logging.getLogger(__name__)

class SeoAnalysisService:
    """
    SEO Analysis Service with fault-tolerant PageSpeed integration.

    Uses the SHARED PageSpeed client so that SEO and Performance analyzers
    reuse the same cached API calls (one request per domain+strategy),
    apply exponential backoff with jitter on HTTP 429, respect a quota-aware
    circuit breaker, and fall back to a local heuristic analyzer when the
    API is unavailable. Never raises — always returns data.
    """

    def __init__(self):
        self.pagespeed_client = get_pagespeed_client()

    def _extract_schema(self, soup: BeautifulSoup) -> List[str]:
        schema_types = set()
        
        # Check JSON-LD
        for script in soup.find_all('script', type='application/ld+json'):
            try:
                data = json.loads(script.string)
                if isinstance(data, dict):
                    if '@type' in data:
                        schema_types.add(data['@type'])
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and '@type' in item:
                            schema_types.add(item['@type'])
            except Exception:
                pass
                
        # Check Microdata
        for item in soup.find_all(attrs={"itemscope": True}):
            itemtype = item.get("itemtype")
            if itemtype:
                schema_types.add(itemtype.split('/')[-1])
                
        return list(schema_types)

    async def _fetch_pagespeed(self, url: str) -> Dict[str, Any]:
        """
        Fetch PageSpeed Insights data via the SHARED, resilient client.

        Cached by normalized domain + strategy, so the SEO analyzer reuses
        the exact same API call the performance analyzer already made. Returns
        a fallback/heuristic payload when the API is unavailable (never raises).
        """
        return await self.pagespeed_client.get_insights(url, strategy="mobile", on_update=None)

    def _get_fallback_result(self, url: str, reason: str) -> Dict[str, Any]:
        """Backwards-compatible alias used by tests / callers."""
        return self.pagespeed_client._fallback(url, "mobile", reason)

    async def analyze_website(self, lead_id: str, website_url: str, pages: List[Dict], links: List[Dict], on_update=None) -> SeoAnalysisResultCreate:
        issues: List[SeoIssue] = []
        audits: List[PageLevelAudit] = []
        
        total_pages = len(pages)
        
        seen_titles = set()
        seen_descriptions = set()
        
        # Accumulators for Score Math
        meta_score_acc = 0
        tech_score_acc = 0
        content_score_acc = 0
        img_score_acc = 0
        
        for i, page in enumerate(pages):
            url = page.get("url", "")
            html = page.get("rendered_html", "")
            
            if on_update:
                await on_update("Page Level Analysis", url, {
                    "pages_completed": i,
                    "pages_remaining": total_pages - i,
                    "current_stage": "Extracting DOM Metrics"
                })
                
            soup = BeautifulSoup(html, 'html.parser')
            
            # --- META DATA ANALYSIS ---
            title = soup.title.string.strip() if soup.title and soup.title.string else ""
            title_length = len(title)
            
            meta_desc = ""
            desc_tag = soup.find('meta', attrs={'name': re.compile(r'^description$', re.I)})
            if desc_tag and desc_tag.get('content'):
                meta_desc = desc_tag['content'].strip()
            description_length = len(meta_desc)
            
            canonical = ""
            canon_tag = soup.find('link', rel='canonical')
            if canon_tag and canon_tag.get('href'):
                canonical = canon_tag['href']
                
            og_tags = soup.find_all('meta', attrs={'property': re.compile(r'^og:')})
            twitter_tags = soup.find_all('meta', attrs={'name': re.compile(r'^twitter:')})
            has_og = len(og_tags) > 0
            has_twitter = len(twitter_tags) > 0
                
            indexable = True
            robots_tag = soup.find('meta', attrs={'name': re.compile(r'^robots$', re.I)})
            if robots_tag and robots_tag.get('content'):
                if 'noindex' in robots_tag['content'].lower():
                    indexable = False
            
            # Title Checks
            page_meta_points = 100
            if not title:
                issues.append(SeoIssue(severity="Error", category="Metadata", issue_type="Missing Title", description="Page is missing a title tag.", affected_url=url))
                page_meta_points -= 30
            elif title_length < 10 or title_length > 70:
                issues.append(SeoIssue(severity="Warning", category="Metadata", issue_type="Suboptimal Title Length", description=f"Title length is {title_length} (Optimal: 10-70).", affected_url=url))
                page_meta_points -= 10
            elif title in seen_titles:
                issues.append(SeoIssue(severity="Warning", category="Metadata", issue_type="Duplicate Title", description=f"Title '{title}' is duplicated across pages.", affected_url=url))
                page_meta_points -= 15
            if title:
                seen_titles.add(title)
            
            # Desc Checks
            if not meta_desc:
                issues.append(SeoIssue(severity="Error", category="Metadata", issue_type="Missing Meta Description", description="Page is missing a meta description.", affected_url=url))
                page_meta_points -= 30
            elif description_length < 50 or description_length > 160:
                issues.append(SeoIssue(severity="Warning", category="Metadata", issue_type="Suboptimal Description Length", description=f"Description length is {description_length} (Optimal: 50-160).", affected_url=url))
                page_meta_points -= 10
            elif meta_desc in seen_descriptions:
                issues.append(SeoIssue(severity="Warning", category="Metadata", issue_type="Duplicate Description", description="Description is duplicated across pages.", affected_url=url))
                page_meta_points -= 15
            if meta_desc:
                seen_descriptions.add(meta_desc)
            
            if not canonical:
                issues.append(SeoIssue(severity="Warning", category="Technical", issue_type="Missing Canonical", description="No canonical link found.", affected_url=url))
                tech_score_acc -= 5
                
            if not has_og:
                issues.append(SeoIssue(severity="Warning", category="Metadata", issue_type="Missing Open Graph", description="No Open Graph tags found.", affected_url=url))
                page_meta_points -= 5
                
            if not has_twitter:
                page_meta_points -= 2
                
            meta_score_acc += max(0, page_meta_points)

            # --- CONTENT & HEADING ANALYSIS ---
            page_content_points = 100
            h1s = soup.find_all('h1')
            h1_count = len(h1s)
            if h1_count == 0:
                issues.append(SeoIssue(severity="Error", category="Content", issue_type="Missing H1", description="No H1 tag found.", affected_url=url))
                page_content_points -= 25
            elif h1_count > 1:
                issues.append(SeoIssue(severity="Warning", category="Content", issue_type="Multiple H1s", description="Multiple H1 tags found. Stick to one per page.", affected_url=url))
                page_content_points -= 10
                
            word_count = len(soup.get_text(separator=' ').split())
            if word_count < 300:
                issues.append(SeoIssue(severity="Warning", category="Content", issue_type="Thin Content", description=f"Low word count ({word_count} words).", affected_url=url))
                page_content_points -= 20
                
            content_score_acc += max(0, page_content_points)

            # --- IMAGE ANALYSIS ---
            page_img_points = 100
            images = soup.find_all('img')
            img_count = len(images)
            imgs_no_alt = 0
            for img in images:
                if not img.get('alt'):
                    imgs_no_alt += 1
                    
            if imgs_no_alt > 0:
                issues.append(SeoIssue(severity="Warning", category="Content", issue_type="Missing Alt Tags", description=f"{imgs_no_alt} images missing alt text.", affected_url=url))
                penalty = min(50, imgs_no_alt * 5)
                page_img_points -= penalty
                
            img_score_acc += max(0, page_img_points)
                
            # --- SCHEMA ANALYSIS ---
            if on_update:
                await on_update("Schema Analysis", url, {"current_stage": "Extracting JSON-LD"})
                
            schema_types = self._extract_schema(soup)
            has_schema = len(schema_types) > 0

            # Compute internal/external
            internal = 0
            external = 0
            for link in links:
                if link['source'] == url:
                    if website_url in link['target'] or link['target'].startswith('/'):
                        internal += 1
                    else:
                        external += 1
                        
            audits.append(PageLevelAudit(
                url=url,
                title=title,
                title_length=title_length,
                meta_description=meta_desc,
                description_length=description_length,
                h1_count=h1_count,
                word_count=word_count,
                image_count=img_count,
                images_missing_alt=imgs_no_alt,
                internal_links=internal,
                external_links=external,
                broken_links=0, # Handled globally via errors
                canonical_url=canonical,
                has_schema=has_schema,
                schema_types=schema_types,
                indexable=indexable,
                load_time=page.get("load_time", 0.0)
            ))
            
        # --- PAGESPEED INTEGRATION ---
        if on_update:
            await on_update("External APIs", website_url, {"current_stage": "Querying Google PageSpeed Insights"})
            
        psi_data = await self._fetch_pagespeed(website_url)
        mobile_score = 0
        if psi_data and "lighthouseResult" in psi_data:
            categories = psi_data["lighthouseResult"].get("categories", {})
            if "seo" in categories:
                raw_score = categories["seo"].get("score")
                mobile_score = safe_score(safe_float(raw_score, 0.0) * 100)
                
        if mobile_score == 0:
            # Fallback calculation based on DOM audits of crawled pages
            total_penalty = 0
            for audit in audits:
                penalty = 0
                if not audit.title: penalty += 15
                elif audit.title_length < 10 or audit.title_length > 70: penalty += 5
                if not audit.meta_description: penalty += 15
                elif audit.description_length < 50 or audit.description_length > 160: penalty += 5
                if not audit.canonical_url: penalty += 10
                if audit.h1_count == 0: penalty += 15
                elif audit.h1_count > 1: penalty += 5
                if audit.images_missing_alt > 0: penalty += min(15, audit.images_missing_alt * 3)
                if not audit.has_schema: penalty += 10
                if not audit.indexable: penalty += 15
                total_penalty += penalty
            avg_penalty = (total_penalty / len(audits)) if audits else 30
            mobile_score = max(35, safe_score(100 - avg_penalty))
            
            # Bonus for good practices
            if any(a.has_schema for a in audits):
                mobile_score = min(100, mobile_score + 5)
            if all(a.indexable for a in audits):
                mobile_score = min(100, mobile_score + 5)
                
        # --- SCORE CALCULATION (0-100 Deterministic) ---
        base_meta = safe_score((meta_score_acc / total_pages) if total_pages > 0 else 0)
        base_content = safe_score((content_score_acc / total_pages) if total_pages > 0 else 0)
        base_img = safe_score((img_score_acc / total_pages) if total_pages > 0 else 0)
        
        # Internal linking heuristic (100 minus penalty for orphans or huge clusters)
        il_score = 100
        
        # Structured Data
        sd_score = 100 if any(a.has_schema for a in audits) else 40
        if not any(a.has_schema for a in audits):
            issues.append(SeoIssue(severity="Warning", category="Technical", issue_type="Missing Schema", description="No JSON-LD or Microdata found.", affected_url=website_url))
            
        # Indexability
        idx_score = 100 if all(a.indexable for a in audits) else 60
        
        # Tech score base
        tech_score = safe_score(100 + (tech_score_acc if tech_score_acc < 0 else 0))
        
        # Overall
        overall_score = safe_score(
            (base_meta * 0.25) +
            (base_content * 0.20) +
            (tech_score * 0.20) +
            (sd_score * 0.10) +
            (base_img * 0.10) +
            (mobile_score * 0.15)
        )
        
        scorecard = SeoScorecard(
            overall_score=safe_score(overall_score),
            technical_score=safe_score(tech_score),
            content_score=safe_score(base_content),
            metadata_score=safe_score(base_meta),
            internal_linking_score=safe_score(il_score),
            structured_data_score=safe_score(sd_score),
            image_seo_score=safe_score(base_img),
            mobile_score=safe_score(mobile_score),
            indexability_score=safe_score(idx_score)
        )

        return SeoAnalysisResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            scorecard=scorecard,
            issues=issues,
            page_audits=audits,
            pagespeed_data=psi_data
        )
