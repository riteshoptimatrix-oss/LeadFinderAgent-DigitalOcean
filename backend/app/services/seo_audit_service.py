import httpx
import logging
from typing import Dict, List, Optional
from app.models.crawl_graph import WebsiteStructureCreate, CrawlNode
from app.models.seo_audit import PageSEOMetrics, LighthouseMetrics, Recommendation, WebsiteSEOAuditCreate
import os

logger = logging.getLogger(__name__)

class SEOAuditService:
    def __init__(self):
        self.pagespeed_api_key = os.getenv("GOOGLE_PAGESPEED_API_KEY")
        self.pagespeed_api_url = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
        
    def _evaluate_page(self, node: CrawlNode) -> PageSEOMetrics:
        seo_data = node.seo_data or {}
        
        has_title = bool(node.title)
        title_length = len(node.title) if node.title else 0
        has_meta_desc = bool(node.meta_description)
        meta_desc_length = len(node.meta_description) if node.meta_description else 0
        
        return PageSEOMetrics(
            url=node.url,
            has_title=has_title,
            title_length=title_length,
            has_meta_description=has_meta_desc,
            meta_description_length=meta_desc_length,
            h1_count=seo_data.get("h1_count", 0),
            h2_count=seo_data.get("h2_count", 0),
            has_canonical=bool(node.canonical_url),
            has_open_graph=seo_data.get("has_open_graph", False),
            has_twitter_card=seo_data.get("has_twitter_card", False),
            schema_types=seo_data.get("schema_types", []),
            images_count=seo_data.get("images_count", 0),
            images_without_alt=seo_data.get("images_without_alt", 0),
            status_code=node.status_code,
            is_indexable=seo_data.get("is_indexable", True)
        )

    async def _fetch_pagespeed(self, url: str) -> Optional[LighthouseMetrics]:
        if not self.pagespeed_api_key:
            logger.info(f"Skipping PageSpeed Insights for {url}: No API key configured.")
            return None
            
        try:
            params = {
                "url": url,
                "key": self.pagespeed_api_key,
                "category": ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"],
                "strategy": "mobile"
            }
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(self.pagespeed_api_url, params=params)
                if response.status_code != 200:
                    logger.warning(f"PageSpeed API returned {response.status_code} for {url}")
                    return None
                    
                data = response.json()
                lighthouse = data.get("lighthouseResult", {})
                categories = lighthouse.get("categories", {})
                audits = lighthouse.get("audits", {})
                
                def get_score(cat_name):
                    return int(categories.get(cat_name, {}).get("score", 0) * 100) if categories.get(cat_name, {}).get("score") is not None else None
                    
                def get_metric(audit_name):
                    return audits.get(audit_name, {}).get("displayValue")
                
                return LighthouseMetrics(
                    performance_score=get_score("performance"),
                    accessibility_score=get_score("accessibility"),
                    best_practices_score=get_score("best-practices"),
                    seo_score=get_score("seo"),
                    first_contentful_paint=get_metric("first-contentful-paint"),
                    largest_contentful_paint=get_metric("largest-contentful-paint"),
                    cumulative_layout_shift=get_metric("cumulative-layout-shift"),
                    total_blocking_time=get_metric("total-blocking-time")
                )
        except Exception as e:
            logger.error(f"Error fetching PageSpeed Insights for {url}: {e}")
            return None

    def _generate_recommendations_and_score(self, base_url: str, page_metrics: List[PageSEOMetrics], lighthouse: Optional[LighthouseMetrics], structure: WebsiteStructureCreate, has_sitemap: bool) -> tuple[Dict[str, int], List[Recommendation]]:
        recommendations = []
        scores = {
            "seo_score": 100,
            "technical_seo_score": 100,
            "accessibility_score": 100,
            "best_practices_score": 100
        }
        
        # Technical SEO
        if not structure.nodes:
            scores["technical_seo_score"] -= 50
            recommendations.append(Recommendation(issue="No pages crawled", impact="High", action="Ensure the website is accessible and not blocking crawlers."))
        else:
            if len(structure.broken_links) > 0:
                scores["technical_seo_score"] -= min(30, len(structure.broken_links) * 5)
                recommendations.append(Recommendation(issue=f"Found {len(structure.broken_links)} broken links", impact="High", action="Fix or remove broken internal links to improve crawlability."))
        
        if not has_sitemap:
            scores["technical_seo_score"] -= 10
            recommendations.append(Recommendation(issue="Missing sitemap.xml", impact="Medium", action="Add an XML sitemap at the root directory to help search engines crawl your site."))
            
        missing_canonical = sum(1 for p in page_metrics if not p.has_canonical)
        if page_metrics and missing_canonical > len(page_metrics) * 0.5:
            scores["technical_seo_score"] -= 15
            recommendations.append(Recommendation(issue="Most pages missing canonical tags", impact="Medium", action="Implement self-referencing canonical tags to prevent duplicate content issues."))

        # On-Page SEO
        if page_metrics:
            missing_titles = sum(1 for p in page_metrics if not p.has_title)
            if missing_titles > 0:
                scores["seo_score"] -= min(25, (missing_titles / len(page_metrics)) * 30)
                recommendations.append(Recommendation(issue=f"{missing_titles} pages missing title tags", impact="High", action="Add descriptive <title> tags to all pages."))
                
            missing_meta = sum(1 for p in page_metrics if not p.has_meta_description)
            if missing_meta > 0:
                scores["seo_score"] -= min(20, (missing_meta / len(page_metrics)) * 25)
                recommendations.append(Recommendation(issue=f"{missing_meta} pages missing meta descriptions", impact="Medium", action="Add unique meta descriptions to improve CTR."))
                
            missing_h1 = sum(1 for p in page_metrics if p.h1_count == 0)
            if missing_h1 > 0:
                scores["seo_score"] -= min(15, (missing_h1 / len(page_metrics)) * 20)
                recommendations.append(Recommendation(issue=f"{missing_h1} pages missing H1 headings", impact="High", action="Ensure every page has exactly one H1 heading."))
                
            multiple_h1 = sum(1 for p in page_metrics if p.h1_count > 1)
            if multiple_h1 > 0:
                scores["seo_score"] -= 5
                recommendations.append(Recommendation(issue=f"{multiple_h1} pages have multiple H1 headings", impact="Low", action="Restrict H1 tags to one per page for clearer hierarchy."))
                
            # Accessibility
            images_no_alt = sum(p.images_without_alt for p in page_metrics)
            if images_no_alt > 0:
                scores["accessibility_score"] -= min(20, (images_no_alt / max(1, sum(p.images_count for p in page_metrics))) * 30)
                recommendations.append(Recommendation(issue=f"Found {images_no_alt} images without alt attributes", impact="Medium", action="Add descriptive alt text to all informative images."))

        # Best Practices
        is_https = base_url.startswith("https://")
        if not is_https:
            scores["best_practices_score"] -= 30
            scores["technical_seo_score"] -= 20
            recommendations.append(Recommendation(issue="Website not using HTTPS", impact="High", action="Install an SSL certificate and enforce HTTPS redirects."))

        # Lighthouse Adjustments
        if lighthouse:
            if lighthouse.performance_score is not None:
                if lighthouse.performance_score < 50:
                    scores["best_practices_score"] -= 20
                    recommendations.append(Recommendation(issue="Poor mobile performance score", impact="High", action="Optimize images, minify CSS/JS, and improve server response time."))
                elif lighthouse.performance_score < 90:
                    scores["best_practices_score"] -= 5
                    
            if lighthouse.seo_score is not None:
                if lighthouse.seo_score < 90:
                    scores["seo_score"] = min(scores["seo_score"], lighthouse.seo_score)
                    recommendations.append(Recommendation(issue="Lighthouse SEO checks failed", impact="Medium", action="Review Lighthouse report for specific SEO optimizations."))
                    
            if lighthouse.accessibility_score is not None:
                scores["accessibility_score"] = min(scores["accessibility_score"], lighthouse.accessibility_score)
                if lighthouse.accessibility_score < 90:
                    recommendations.append(Recommendation(issue="Accessibility issues detected", impact="Medium", action="Improve contrast, ARIA labels, and keyboard navigation based on Lighthouse."))
                    
            if lighthouse.best_practices_score is not None:
                scores["best_practices_score"] = min(scores["best_practices_score"], lighthouse.best_practices_score)

        # Normalize boundaries
        for k in scores:
            scores[k] = max(0, min(100, int(scores[k])))

        return scores, recommendations

    async def perform_audit(self, lead_id: str, base_url: str, structure: WebsiteStructureCreate, has_sitemap: bool = False) -> WebsiteSEOAuditCreate:
        page_metrics = []
        for node in structure.nodes:
            page_metrics.append(self._evaluate_page(node))
            
        # Fetch PageSpeed Insights for the homepage to save time
        lighthouse = await self._fetch_pagespeed(base_url)
        
        # Calculate Score
        scores, recommendations = self._generate_recommendations_and_score(base_url, page_metrics, lighthouse, structure, has_sitemap)
        
        # Calculate overall normalized score
        overall_score = int(sum(scores.values()) / 4)
        
        return WebsiteSEOAuditCreate(
            lead_id=lead_id,
            base_url=base_url,
            normalized_score=overall_score,
            seo_score=scores["seo_score"],
            technical_seo_score=scores["technical_seo_score"],
            accessibility_score=scores["accessibility_score"],
            best_practices_score=scores["best_practices_score"],
            page_metrics=page_metrics,
            lighthouse_metrics=lighthouse,
            has_robots_txt=True, # Assumed checked by crawler
            has_sitemap_xml=has_sitemap,
            is_https_enforced=base_url.startswith("https://"),
            recommendations=recommendations
        )
