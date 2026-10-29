import asyncio
import json
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Set
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import httpx
import logging

from app.db.database import get_db
from app.models.crawler import CrawlPage, CrawlSession, PerformanceMetrics
from app.services.crawler_engine.url_utils import normalize_url, is_valid_crawl_url
from app.services.crawler_engine.browser_manager import browser_manager

logger = logging.getLogger(__name__)

# High-value page paths crawled explicitly (Phase 2 — multi-page intelligence).
PRIORITY_PATHS = [
    "",             # home "/"
    "about",
    "about-us",
    "contact",
    "contact-us",
    "services",
    "products",
    "pricing",
    "team",
    "our-team",
    "portfolio",
    "blog",
    "faq",
    "careers",
    "privacy",
    "privacy-policy",
    "terms",
    "terms-of-service",
]

CONCURRENT_PAGE_WORKERS = 4
PAGE_NAVIGATE_TIMEOUT = 20000


class CrawlEngine:
    def __init__(self, max_pages: int = 50, max_depth: int = 3):
        self.max_pages = max_pages
        self.max_depth = max_depth

    async def execute_crawl(self, job_id: str, queue_id: str, lead_id: str, start_url: str, on_update=None) -> Dict[str, Any]:
        db = get_db()
        session_collection = db["crawl_sessions"]
        page_collection = db["crawl_pages"]

        normalized_start = normalize_url(start_url)
        if not normalized_start:
            return {"success": False, "error": "Invalid start URL"}

        session = CrawlSession(
            job_id=job_id,
            queue_id=queue_id,
            lead_id=lead_id,
            website_url=normalized_start,
            status="RUNNING"
        )
        session_dict = session.model_dump()
        await session_collection.insert_one(session_dict)

        parsed_start = urlparse(normalized_start)
        base_domain = f"{parsed_start.scheme}://{parsed_start.netloc}"

        # ── Pre-Crawl: Robots.txt & Sitemap discovery ──
        robots_rules: Dict[str, Any] = {}
        sitemap_urls: List[str] = []
        sitemap_page_urls: List[str] = []
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                robots_resp = await client.get(f"{base_domain}/robots.txt")
                if robots_resp.status_code == 200:
                    for line in robots_resp.text.splitlines():
                        low = line.lower()
                        if low.startswith("sitemap:"):
                            sitemap_urls.append(line.split(":", 1)[1].strip())
                        elif low.startswith("user-agent:"):
                            robots_rules.setdefault("allowed", True)
                    robots_rules["has_robots_txt"] = True
                else:
                    robots_rules["has_robots_txt"] = False

            # Fetch each discovered sitemap and collect URLs
            for sm in sitemap_urls:
                try:
                    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                        sm_resp = await client.get(sm)
                    if sm_resp.status_code == 200:
                        sitemap_page_urls.extend(self._parse_sitemap(sm_resp.text))
                except Exception as sm_err:
                    logger.warning(f"Failed to fetch sitemap {sm}: {sm_err}")
        except Exception as e:
            logger.warning(f"Failed robots/sitemap discovery for {normalized_start}: {e}")
            robots_rules["has_robots_txt"] = False

        # De-duplicate + cap sitemap-derived URLs to the same domain
        sitemap_page_urls = list(dict.fromkeys(
            u for u in sitemap_page_urls
            if is_valid_crawl_url(u, base_domain=normalized_start)
        ))[: self.max_pages]

        session_dict["robots_rules"] = {
            "status": "checked",
            "has_robots_txt": robots_rules.get("has_robots_txt", False),
            "has_sitemap": len(sitemap_urls) > 0,
        }
        session_dict["sitemap_urls"] = sitemap_urls
        await session_collection.update_one(
            {"_id": session_dict["_id"]},
            {"$set": {
                "robots_rules": session_dict["robots_rules"],
                "sitemap_urls": sitemap_urls,
            }},
        )

        visited: Set[str] = set()
        # Seed the queue: priority paths first, then sitemap URLs, then home.
        queue: List[tuple] = []
        seen_seed: Set[str] = set()
        for path in PRIORITY_PATHS:
            target = normalize_url(f"{base_domain}/{path}") if path else normalize_url(base_domain)
            if target and target not in seen_seed:
                seen_seed.add(target)
                # priority paths get depth 0
                queue.append((target, 0))
        for sm_url in sitemap_page_urls:
            if sm_url not in seen_seed:
                seen_seed.add(sm_url)
                queue.append((sm_url, 0))

        context = await browser_manager.create_context()

        try:
            # Concurrent crawl workers (Phase 9 — concurrent crawling)
            sem = asyncio.Semaphore(CONCURRENT_PAGE_WORKERS)

            async def crawl_one(url: str, depth: int):
                async with sem:
                    if url in visited or len(visited) >= self.max_pages:
                        return
                    visited.add(url)
                    if depth > self.max_depth:
                        return
                    if on_update:
                        await on_update("Crawling Page", url, {"pages_crawled": len(visited), "current_depth": depth})
                    try:
                        page_instance = await context.new_page()
                        try:
                            result = await browser_manager.navigate_and_extract(page_instance, url)
                        finally:
                            await page_instance.close()
                    except Exception as nav_err:
                        logger.warning(f"Navigation failed for {url}: {nav_err}")
                        return
                    page_doc = self._build_page_doc(
                        job_id, queue_id, lead_id, normalized_start, url, result, base_domain
                    )
                    if page_doc:
                        await page_collection.insert_one(page_doc)

            pending: Set[asyncio.Task] = set()
            while queue and len(visited) < self.max_pages:
                url, depth = queue.pop(0)
                if url in visited:
                    continue
                task = asyncio.create_task(crawl_one(url, depth))
                pending.add(task)
                task.add_done_callback(pending.discard)

                # Bound the in-flight set so we don't open unbounded pages.
                if len(pending) >= CONCURRENT_PAGE_WORKERS * 2:
                    done, pending = await asyncio.wait(pending, timeout=0.5)

                # Discover links from the most-recently crawled page to extend the queue.
                # (Discovery is also done inside _build_page_doc; we re-read links here.)
                # To avoid duplicate heavy parsing, we rely on stored links via callback.
                # Simple approach: discover by re-using result if available. We instead
                # discover links lazily after each task completes below.

            # Await remaining tasks
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)

            # ── Link discovery pass: extend the queue from crawled pages ──
            # We re-run discovery so newly found internal links are crawled too,
            # up to max_pages, with depth-limited BFS.
            crawled_docs = await page_collection.find({"job_id": job_id}).to_list(length=None)
            link_queue: List[tuple] = []
            for doc in crawled_docs:
                for link in doc.get("internal_links", []):
                    link_queue.append((link, 1))
            # De-dup preserving order
            seen_links: Set[str] = set(visited)
            link_queue = [t for t in link_queue if not (t[0] in seen_links or seen_links.add(t[0]))]

            link_tasks: Set[asyncio.Task] = set()
            for link, depth in link_queue:
                if len(visited) >= self.max_pages:
                    break
                if link in visited:
                    continue
                task = asyncio.create_task(crawl_one(link, depth))
                link_tasks.add(task)
                task.add_done_callback(link_tasks.discard)
                if len(link_tasks) >= CONCURRENT_PAGE_WORKERS * 2:
                    done, link_tasks = await asyncio.wait(link_tasks, timeout=0.5)
            if link_tasks:
                await asyncio.gather(*link_tasks, return_exceptions=True)

        except Exception as e:
            logger.error(f"Error crawling {start_url}: {repr(e)}")
        finally:
            await browser_manager.close_context(context)

        await session_collection.update_one(
            {"_id": session_dict["_id"]},
            {"$set": {
                "status": "COMPLETED",
                "total_pages_crawled": len(visited),
                "pages_discovered": len(visited),
            }}
        )

        return {"success": True, "pages_crawled": len(visited)}

    # ── Helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def _parse_sitemap(xml_text: str) -> List[str]:
        """Parse a sitemap (or sitemap index) and return discovered URLs."""
        urls: List[str] = []
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError:
            # Sitemap index may use <loc> too; fall back to regex on <loc>
            import re
            for m in re.findall(r"<loc>(.*?)</loc>", xml_text, re.IGNORECASE):
                urls.append(m.strip())
            return urls[:200]

        # Handle sitemap namespace
        ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        for loc in root.findall(".//sm:url/sm:loc", ns):
            if loc.text:
                urls.append(loc.text.strip())
        # Sitemap index
        for loc in root.findall(".//sm:sitemap/sm:loc", ns):
            if loc.text:
                urls.append(loc.text.strip())
        if not urls:
            for loc in root.iter():
                if loc.tag.endswith("loc") and loc.text:
                    urls.append(loc.text.strip())
        return urls[:200]

    def _build_page_doc(
        self,
        job_id: str,
        queue_id: str,
        lead_id: str,
        base_domain: str,
        current_url: str,
        result: Dict[str, Any],
        start_domain: str,
    ) -> Dict[str, Any]:
        html_content = result.get("html", "")
        final_url = result.get("final_url", current_url)

        soup = BeautifulSoup(html_content, 'html.parser')
        title = soup.title.string.strip() if soup.title and soup.title.string else ""

        meta_desc = ""
        meta_tag = soup.find('meta', attrs={'name': 'description'}) or soup.find('meta', attrs={'property': 'og:description'})
        if meta_tag:
            meta_desc = meta_tag.get('content', '')

        # Capture response headers + meta generator for technology detection
        response_headers = result.get("response_headers") or {}
        meta_tags: Dict[str, Any] = {}
        gen = soup.find('meta', attrs={'name': 'generator'})
        if gen and gen.get('content'):
            meta_tags['generator'] = gen.get('content')

        internal_links: List[str] = []
        external_links: List[str] = []
        for a_tag in soup.find_all('a', href=True):
            href = a_tag['href']
            target_url = normalize_url(href, base_url=final_url)
            if not target_url:
                continue
            if is_valid_crawl_url(target_url, base_domain=start_domain):
                internal_links.append(target_url)
                # Prioritize high-value pages in the queue
            else:
                external_links.append(target_url)

        internal_links = list(dict.fromkeys(internal_links))
        external_links = list(dict.fromkeys(external_links))

        forms = []
        for form in soup.find_all('form'):
            forms.append({
                "action": form.get("action", ""),
                "method": form.get("method", "get"),
                "inputs": len(form.find_all("input")),
            })

        buttons = [b.get_text(strip=True) for b in soup.find_all('button')]
        nav_links = []
        nav = soup.find('nav')
        if nav:
            nav_links = [a.get_text(strip=True) for a in nav.find_all('a', href=True) if a.get_text(strip=True)]
        footer_links = []
        footer = soup.find('footer')
        if footer:
            footer_links = [a.get_text(strip=True) for a in footer.find_all('a', href=True) if a.get_text(strip=True)]

        embedded_maps = []
        for iframe in soup.find_all('iframe'):
            src = iframe.get('src', '')
            if 'google.com/maps' in src or 'maps.google.com' in src:
                embedded_maps.append(src)

        schema_markup = []
        for script in soup.find_all('script', type='application/ld+json'):
            try:
                data = json.loads(script.string)
                if isinstance(data, dict):
                    schema_markup.append(data)
                elif isinstance(data, list):
                    schema_markup.extend(data)
            except Exception:
                pass

        for script in soup(["script", "style", "noscript"]):
            script.extract()
        visible_text = ' '.join(soup.get_text(separator=' ').split())

        # Append discovered high-value links to the queue dynamically is handled
        # by the link-discovery pass; here we just store them.

        return CrawlPage(
            job_id=job_id,
            queue_id=queue_id,
            lead_id=lead_id,
            domain=base_domain,
            url=current_url,
            final_url=final_url,
            redirect_chain=result.get("redirect_chain", []),
            title=title,
            meta_description=meta_desc,
            response_headers=response_headers,
            meta_tags=meta_tags,
            html=html_content,
            rendered_html=html_content,
            visible_text=visible_text,
            internal_links=internal_links,
            external_links=external_links,
            forms=forms,
            buttons=buttons,
            nav_links=nav_links,
            footer_links=footer_links,
            embedded_maps=embedded_maps,
            schema_markup=schema_markup,
            status_code=result.get("status_code", 0),
            timing_metrics=PerformanceMetrics(**result.get("timing_metrics", {})),
            page_size_bytes=len(html_content.encode('utf-8')),
        ).model_dump()


crawl_engine = CrawlEngine()
