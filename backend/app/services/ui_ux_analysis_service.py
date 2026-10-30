import logging
import asyncio
import os
import uuid
from typing import List
from playwright.async_api import async_playwright

from app.models.ui_ux_analysis import (
    UiUxAnalysisResultCreate, UIUXScorecard, VisualIssue, ScreenshotRecord
)
from app.services.safe_scoring import safe_score, safe_float, safe_int, safe_get

logger = logging.getLogger(__name__)

class UiUxAnalysisService:
    def __init__(self):
        self.storage_dir = os.path.join(os.getcwd(), "storage", "screenshots")
        os.makedirs(self.storage_dir, exist_ok=True)
        
        self.viewports = {
            "Desktop": {"width": 1920, "height": 1080},
            "Tablet": {"width": 768, "height": 1024},
            "Mobile": {"width": 375, "height": 812}
        }

    async def _capture_screenshots(self, url: str, on_update=None) -> List[ScreenshotRecord]:
        from app.utils.async_loop_helper import run_in_proactor
        return await run_in_proactor(self._capture_screenshots_internal, url, on_update)

    async def _capture_screenshots_internal(self, url: str, on_update=None) -> List[ScreenshotRecord]:
        screenshots = []
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            
            for device, size in self.viewports.items():
                if on_update:
                    await on_update("Taking Screenshots", url, {"current_stage": f"Capturing {device} Viewport"})
                    
                context = await browser.new_context(
                    viewport=size,
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" if device == "Desktop" else "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
                )
                
                page = await context.new_page()
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    
                    # Force lazy loading
                    await page.evaluate("""
                        async () => {
                            await new Promise((resolve) => {
                                let totalHeight = 0;
                                let distance = 100;
                                let timer = setInterval(() => {
                                    let scrollHeight = document.body.scrollHeight;
                                    window.scrollBy(0, distance);
                                    totalHeight += distance;
                                    if(totalHeight >= scrollHeight - window.innerHeight){
                                        clearInterval(timer);
                                        resolve();
                                    }
                                }, 100);
                            });
                            window.scrollTo(0, 0);
                        }
                    """)
                    
                    await asyncio.sleep(1) # wait for animations
                    
                    filename = f"{uuid.uuid4()}_{device.lower()}.png"
                    filepath = os.path.join(self.storage_dir, filename)
                    
                    await page.screenshot(path=filepath, full_page=True)
                    
                    file_size = os.path.getsize(filepath)
                    screenshots.append(ScreenshotRecord(
                        url=url,
                        device=device,
                        file_path=filepath,
                        width=size["width"],
                        height=size["height"],
                        file_size_bytes=file_size
                    ))
                except Exception as e:
                    logger.error(f"Failed screenshot for {device}: {e}")
                finally:
                    await context.close()
                    
            await browser.close()
            
        return screenshots

    async def _evaluate_heuristics(self, html: str, url: str) -> tuple[List[VisualIssue], UIUXScorecard]:
        """Evaluate UI/UX heuristics from page HTML and URL."""
        from bs4 import BeautifulSoup
        
        issues = []
        
        # Parse HTML for heuristic analysis
        soup = BeautifulSoup(html, 'html.parser') if html else None
        
        # Base scores
        base_ui = 75
        base_ux = 70
        visual_quality = 70
        design_consistency = 80
        responsiveness = 75
        conversion_opt = 65
        accessibility_visual = 60
        navigation = 75
        typography = 80
        color_system = 70
        layout = 75
        component_quality = 70
        
        if soup:
            # Check for viewport meta tag (responsive design)
            viewport_meta = soup.find('meta', attrs={'name': 'viewport'})
            if viewport_meta:
                responsiveness += 10
            else:
                issues.append(VisualIssue(
                    issue_type="Missing Viewport Meta",
                    description="No viewport meta tag found. Site may not be mobile-responsive.",
                    severity="High",
                    affected_device="Mobile"
                ))
                responsiveness -= 15
            
            # Check for semantic HTML elements
            semantic_elements = ['header', 'nav', 'main', 'footer', 'article', 'section']
            found_semantic = sum(1 for tag in semantic_elements if soup.find(tag))
            if found_semantic >= 3:
                design_consistency += 5
                navigation += 5
            elif found_semantic == 0:
                issues.append(VisualIssue(
                    issue_type="Missing Semantic HTML",
                    description="No semantic HTML5 elements (header, nav, main, footer) found.",
                    severity="Medium",
                    affected_device="All"
                ))
                design_consistency -= 10
            
            # Check for forms and CTAs
            forms = soup.find_all('form')
            buttons = soup.find_all('button')
            inputs = soup.find_all('input')
            if forms or buttons:
                conversion_opt += 10
            else:
                issues.append(VisualIssue(
                    issue_type="Missing Call-to-Action",
                    description="No forms or buttons found for user interaction.",
                    severity="High",
                    affected_device="All"
                ))
                conversion_opt -= 15
            
            # Check image alt texts
            images = soup.find_all('img')
            images_without_alt = sum(1 for img in images if not img.get('alt'))
            if images and images_without_alt > 0:
                alt_ratio = images_without_alt / len(images)
                if alt_ratio > 0.5:
                    issues.append(VisualIssue(
                        issue_type="Poor Image Accessibility",
                        description=f"{images_without_alt} of {len(images)} images missing alt text.",
                        severity="Medium",
                        affected_device="All"
                    ))
                    accessibility_visual -= 10
            
            # Check for consistent heading structure
            headings = [f'h{i}' for i in range(1, 7)]
            heading_counts = {h: len(soup.find_all(h)) for h in headings}
            if heading_counts.get('h1', 0) == 0:
                issues.append(VisualIssue(
                    issue_type="Missing H1 Tag",
                    description="No H1 tag found on page.",
                    severity="High",
                    affected_device="All"
                ))
                navigation -= 10
            elif heading_counts.get('h1', 0) > 1:
                issues.append(VisualIssue(
                    issue_type="Multiple H1 Tags",
                    description=f"Found {heading_counts['h1']} H1 tags. Should have only one.",
                    severity="Medium",
                    affected_device="All"
                ))
                navigation -= 5
            
            # Check for inline styles (design consistency)
            inline_styles = soup.find_all(attrs={'style': True})
            if len(inline_styles) > 5:
                issues.append(VisualIssue(
                    issue_type="Excessive Inline Styles",
                    description=f"Found {len(inline_styles)} elements with inline styles.",
                    severity="Low",
                    affected_device="All"
                ))
                design_consistency -= 5
                color_system -= 5
            
            # Check for external CSS
            css_links = soup.find_all('link', rel='stylesheet')
            if css_links:
                visual_quality += 5
                color_system += 5
            
            # Typography analysis
            font_families = set()
            for tag in soup.find_all(style=True):
                style = tag.get('style', '')
                if 'font-family' in style:
                    font_families.add(style)
            if len(font_families) <= 2:
                typography += 5
            elif len(font_families) > 5:
                issues.append(VisualIssue(
                    issue_type="Inconsistent Typography",
                    description=f"Found {len(font_families)} different font declarations.",
                    severity="Medium",
                    affected_device="All"
                ))
                typography -= 10
        
        # Clamp all scores to [0, 100]
        base_ui = safe_score(base_ui)
        base_ux = safe_score(base_ux)
        visual_quality = safe_score(visual_quality)
        design_consistency = safe_score(design_consistency)
        responsiveness = safe_score(responsiveness)
        conversion_opt = safe_score(conversion_opt)
        accessibility_visual = safe_score(accessibility_visual)
        navigation = safe_score(navigation)
        typography = safe_score(typography)
        color_system = safe_score(color_system)
        layout = safe_score(layout)
        component_quality = safe_score(component_quality)
        
        scorecard = UIUXScorecard(
            overall_ui_score=base_ui,
            overall_ux_score=base_ux,
            visual_quality_score=visual_quality,
            design_consistency_score=design_consistency,
            responsiveness_score=responsiveness,
            conversion_optimization_score=conversion_opt,
            accessibility_visual_score=accessibility_visual,
            navigation_score=navigation,
            typography_score=typography,
            color_system_score=color_system,
            layout_score=layout,
            component_quality_score=component_quality
        )
        
        return issues, scorecard

    async def analyze_ui_ux(self, lead_id: str, website_url: str, on_update=None) -> UiUxAnalysisResultCreate:
        
        # 1. Capture Screenshots
        screenshots = await self._capture_screenshots(website_url, on_update)
        
        if on_update:
            await on_update("UI/UX Engine", website_url, {"current_stage": "Running Visual Heuristics"})
            
        # 2. Evaluate
        issues, scorecard = await self._evaluate_heuristics("", website_url)

        return UiUxAnalysisResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            scorecard=scorecard,
            issues=issues,
            screenshots=screenshots
        )
