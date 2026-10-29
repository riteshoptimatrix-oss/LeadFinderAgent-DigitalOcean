import asyncio
import time
from typing import Dict, Any, Optional
from playwright.async_api import async_playwright, Browser, BrowserContext, Page, TimeoutError as PlaywrightTimeout
from app.core.logger import logger

class BrowserManager:
    def __init__(self):
        self.playwright = None
        self.browser: Optional[Browser] = None

    async def start(self):
        if not self.playwright:
            self.playwright = await async_playwright().start()
        if not self.browser:
            self.browser = await self.playwright.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            )

    async def stop(self):
        if self.browser:
            await self.browser.close()
            self.browser = None
        if self.playwright:
            await self.playwright.stop()
            self.playwright = None

    async def create_context(self) -> BrowserContext:
        if not self.browser:
            await self.start()
        
        context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        return context

    async def close_context(self, context: BrowserContext):
        try:
            await context.close()
        except Exception as e:
            logger.error(f"Error closing browser context: {repr(e)}")

    async def navigate_and_extract(self, page: Page, url: str) -> Dict[str, Any]:
        """Navigate to a URL and extract timing, headers and raw HTML."""
        start_time = time.time()
        result = {
            "url": url,
            "final_url": url,
            "html": "",
            "status_code": 0,
            "response_headers": {},
            "timing_metrics": {},
            "redirect_chain": [],
            "error": None
        }
        
        try:
            response = await page.goto(url, timeout=20000, wait_until="domcontentloaded")
            
            if response:
                result["status_code"] = response.status
                result["final_url"] = page.url
                try:
                    result["response_headers"] = {
                        k.lower(): v for k, v in (response.headers or {}).items()
                    }
                except Exception:
                    pass
                
                chain = []
                req = response.request
                while req.redirected_from:
                    req = req.redirected_from
                    chain.append(req.url)
                result["redirect_chain"] = chain[::-1] # Reverse to get chronological
                
            # Scroll to trigger lazy load
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight/2);")
            await asyncio.sleep(0.5)
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
            
            # Wait for network idle
            try:
                await page.wait_for_load_state("networkidle", timeout=5000)
            except PlaywrightTimeout:
                pass # Proceed anyway
                
            result["html"] = await page.content()
            
            # Extract basic timing
            metrics = await page.evaluate("""() => {
                const timing = performance.getEntriesByType('navigation')[0];
                if (!timing) return {};
                return {
                    dns_lookup: timing.domainLookupEnd - timing.domainLookupStart,
                    tcp_connection: timing.connectEnd - timing.connectStart,
                    ttfb: timing.responseStart - timing.requestStart,
                    dom_ready: timing.domContentLoadedEventEnd - timing.startTime,
                    load_event: timing.loadEventEnd - timing.startTime,
                    full_load_time: timing.duration
                };
            }""")
            
            result["timing_metrics"] = metrics
            
        except PlaywrightTimeout:
            result["error"] = "Timeout"
            result["status_code"] = 504
        except Exception as e:
            result["error"] = str(e)
            result["status_code"] = 500
            
        return result

browser_manager = BrowserManager()
