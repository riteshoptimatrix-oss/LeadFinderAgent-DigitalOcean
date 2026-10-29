import asyncio
import time
import logging
import socket
from urllib.parse import urljoin, urlparse, urlunparse
from typing import Dict, Any, Set

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from bs4 import BeautifulSoup
import httpx

logger = logging.getLogger(__name__)

class WebsiteCrawler:
    def __init__(self, timeout: int = 15000, max_pages: int = 50, max_depth: int = 3):
        self.timeout = timeout
        self.max_pages = max_pages
        self.max_depth = max_depth

    def _normalize_url(self, url: str) -> str:
        """Normalize URL (remove fragments, standardize slashes, lowercase domain)"""
        if not url.startswith('http://') and not url.startswith('https://'):
            url = f'http://{url}'
        parsed = urlparse(url)
        netloc = parsed.netloc.lower()
        path = parsed.path
        if not path:
            path = '/'
        elif path != '/' and path.endswith('/'):
            path = path.rstrip('/')
        return urlunparse((parsed.scheme, netloc, path, parsed.params, parsed.query, ''))

    def _is_same_domain(self, base_url: str, target_url: str) -> bool:
        return urlparse(base_url).netloc == urlparse(target_url).netloc

    async def _verify_dns(self, domain: str) -> bool:
        loop = asyncio.get_running_loop()
        try:
            await loop.getaddrinfo(domain, None)
            return True
        except socket.gaierror:
            return False

    def _classify_page(self, url: str, title: str) -> str:
        path = urlparse(url).path.lower()
        title = title.lower()
        
        if path == "" or path == "/" or path == "/home": return "Home"
        if "contact" in path or "contact" in title: return "Contact"
        if "about" in path or "about" in title or "team" in path: return "About"
        if "service" in path or "service" in title: return "Service"
        if "product" in path or "solution" in path: return "Product"
        if "blog" in path or "article" in path or "news" in path: return "Blog"
        if "privacy" in path: return "Privacy"
        if "terms" in path or "condition" in path: return "Terms"
        if "career" in path or "job" in path: return "Career"
        if "support" in path or "help" in path: return "Support"
        if "faq" in path or "questions" in path: return "FAQ"
        
        return "Unknown"

    async def validate_start_url(self, url: str) -> Dict[str, Any]:
        normalized = self._normalize_url(url)
        parsed = urlparse(normalized)
        domain = parsed.netloc

        if not await self._verify_dns(domain):
            return {"valid": False, "error": f"DNS resolution failed for {domain}", "url": normalized}

        # Handle HTTP -> HTTPS and follow redirects
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, verify=False) as client:
                response = await client.head(normalized)
                final_url = self._normalize_url(str(response.url))
                return {"valid": True, "url": final_url, "status_code": response.status_code}
        except Exception:
            # Fallback to GET if HEAD is not allowed
            try:
                async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, verify=False) as client:
                    response = await client.get(normalized)
                    final_url = self._normalize_url(str(response.url))
                    return {"valid": True, "url": final_url, "status_code": response.status_code}
            except Exception as e2:
                return {"valid": False, "error": f"Server unavailable: {e2}", "url": normalized}

    async def _process_page(self, context, current_url: str, depth: int, start_url: str, on_update=None) -> Dict[str, Any]:
        result = {
            "url": current_url,
            "original_url": current_url,
            "depth": depth,
            "status_code": 0,
            "error": None,
            "html_content": "",
            "rendered_html": "",
            "text_content": "",
            "title": "",
            "meta_tags": {},
            "response_headers": {},
            "classification": "Unknown",
            "links": [],
            "assets": {"images": 0, "scripts": 0, "css": 0, "videos": 0},
            "redirected": False,
            "word_count": 0,
            "page_size": 0,
            "load_time": 0
        }
        
        page = None
        start_time = time.time()
        try:
            if on_update: await on_update("Crawling Page", current_url)
            
            page = await context.new_page()
            
            # Wait intelligently for SPAs
            response = await page.goto(current_url, timeout=self.timeout, wait_until="networkidle")
            
            if not response:
                result["status_code"] = 504
                result["error"] = "Timeout or empty response"
                return result
                
            if response.request.redirected_from:
                result["redirected"] = True
                result["url"] = self._normalize_url(page.url)
                
            result["status_code"] = response.status
            result["response_headers"] = await response.all_headers()
            
            if result["status_code"] >= 400:
                result["error"] = f"HTTP Error {result['status_code']}"
                return result

            # Scroll to trigger lazy loading
            await page.evaluate("""
                window.scrollTo(0, document.body.scrollHeight/2);
                setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 500);
            """)
            await asyncio.sleep(1)

            html_content = await page.content()
            result["rendered_html"] = html_content
            result["html_content"] = html_content # same for playwright
            result["page_size"] = len(html_content)
            
            soup = BeautifulSoup(html_content, 'html.parser')
            
            result["title"] = soup.title.string.strip() if soup.title and soup.title.string else ""
            result["classification"] = self._classify_page(result["url"], result["title"])
            
            meta_tags = {}
            for meta in soup.find_all('meta'):
                name = meta.get('name', meta.get('property'))
                if name and meta.get('content'):
                    meta_tags[name] = meta.get('content')
            result["meta_tags"] = meta_tags

            result["assets"]["images"] = len(soup.find_all('img'))
            result["assets"]["scripts"] = len(soup.find_all('script'))
            result["assets"]["css"] = len(soup.find_all('link', rel='stylesheet'))
            result["assets"]["videos"] = len(soup.find_all('video'))

            for script in soup(["script", "style", "noscript", "svg"]):
                script.extract()
            
            raw_text = soup.get_text(separator=' ')
            clean_text = ' '.join(raw_text.split())
            result["text_content"] = clean_text
            result["word_count"] = len(clean_text.split())
            
            links = []
            for a_tag in soup.find_all('a', href=True):
                href = a_tag['href']
                if href.startswith('mailto:') or href.startswith('tel:') or href.startswith('javascript:'):
                    continue
                link_text = a_tag.get_text(strip=True)
                target_url = urljoin(current_url, href).split('#')[0]
                target_url = self._normalize_url(target_url)
                links.append({"target": target_url, "text": link_text})
            
            result["links"] = links
            result["load_time"] = time.time() - start_time

        except PlaywrightTimeout:
            result["status_code"] = 504
            result["error"] = "Playwright Timeout"
        except Exception as e:
            result["status_code"] = 500
            result["error"] = str(e)
            logger.error(f"[Crawler] Error on {current_url}: {e}")
        finally:
            if page:
                try:
                    await page.close()
                except:
                    pass
                    
        return result

    async def crawl(self, start_url: str, on_update=None) -> Dict[str, Any]:
        logger.info(f"Starting crawler for {start_url}")
        if on_update: await on_update("Pre-flight Validation", start_url)
        
        validation = await self.validate_start_url(start_url)
        if not validation["valid"]:
            return {"success": False, "error": validation["error"], "metrics": {}}
            
        canonical_start_url = validation["url"]
        
        visited_urls: Set[str] = set()
        queue = [(canonical_start_url, 0)]
        
        priority_paths = [
            "/about", "/about-us", "/services", "/products", "/solutions", "/portfolio",
            "/projects", "/case-studies", "/pricing", "/blog", "/news", "/career", "/jobs",
            "/contact", "/contact-us", "/contact-us", "/support", "/faq", "/testimonials",
            "/privacy-policy", "/terms", "/refund-policy", "/shipping-policy", "/gallery",
            "/sitemap.xml", "/robots.txt"
        ]
        
        for path in priority_paths:
            full_url = self._normalize_url(urljoin(canonical_start_url, path))
            if full_url != canonical_start_url:
                queue.append((full_url, 1))
        
        pages_data = []
        links_data = []
        errors_data = []
        
        metrics = {
            "pages_discovered": 1 + len(priority_paths),
            "pages_crawled": 0,
            "internal_links_found": 0,
            "external_links_found": 0,
            "broken_links": 0,
            "redirects": 0,
            "start_time": time.time()
        }
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                ignore_https_errors=True,
                viewport={"width": 1920, "height": 1080}
            )
            
            while queue and metrics["pages_crawled"] < self.max_pages:
                current_url, depth = queue.pop(0)
                
                if current_url in visited_urls:
                    continue
                    
                visited_urls.add(current_url)
                
                if depth > self.max_depth:
                    continue
                    
                metrics["pages_crawled"] += 1
                result = await self._process_page(context, current_url, depth, canonical_start_url, on_update)
                
                if result["error"]:
                    metrics["broken_links"] += 1
                    errors_data.append({
                        "url": current_url,
                        "status_code": result["status_code"],
                        "error": result["error"],
                        "timestamp": time.time()
                    })
                    if on_update: await on_update("Error Recovery", current_url, metrics)
                    continue
                    
                if result.get("redirected"):
                    metrics["redirects"] += 1
                    
                # Store page data
                pages_data.append(result)
                
                # Process links
                for link in result["links"]:
                    target_url = link["target"]
                    links_data.append({
                        "source": current_url,
                        "target": target_url,
                        "text": link["text"]
                    })
                    
                    if not self._is_same_domain(canonical_start_url, target_url):
                        metrics["external_links_found"] += 1
                        continue

                    metrics["internal_links_found"] += 1
                    
                    if target_url not in visited_urls:
                        queue.append((target_url, depth + 1))
                        metrics["pages_discovered"] += 1
                        
                if on_update:
                    await on_update("Discovery", current_url, {
                        **metrics,
                        "current_depth": depth,
                        "queue_size": len(queue)
                    })
                        
            await browser.close()
            
        metrics["crawl_time_seconds"] = time.time() - metrics["start_time"]
        
        return {
            "success": True,
            "website": canonical_start_url,
            "pages": pages_data,
            "links": links_data,
            "errors": errors_data,
            "metrics": metrics
        }
