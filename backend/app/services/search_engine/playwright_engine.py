import asyncio
import logging
import functools
import sys
import threading
from typing import AsyncGenerator, Dict, Any, Tuple, Optional, Callable
from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Playwright, Error as PlaywrightError

from app.core.search_config import search_config

logger = logging.getLogger(__name__)

def async_retry(retries=3, base_delay=2.0, max_delay=15.0):
    """Exponential backoff decorator for async functions."""
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            delay = base_delay
            last_exception = None
            for attempt in range(retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt < retries - 1:
                        logger.warning(f"[RETRY] Attempt {attempt + 1}/{retries} failed for {func.__name__}: {str(e)}. Retrying in {delay}s...")
                        await asyncio.sleep(delay)
                        delay = min(delay * 2, max_delay)
                    else:
                        logger.error(f"[RETRY] All {retries} attempts failed for {func.__name__}.")
            
            if last_exception is not None:
                raise last_exception
            raise Exception(f"Execution failed for {func.__name__}")
        return wrapper
    return decorator

class PlaywrightEngine:
    """
    Handles browser automation and navigation using Playwright.
    """
    def __init__(self):
        self.playwright: Playwright = None
        self.browser: Browser = None
        self.context: BrowserContext = None
        self.page: Page = None

        self._needs_proactor = False
        if sys.platform == "win32":
            try:
                loop = asyncio.get_running_loop()
                # On Windows, SelectorEventLoop raises NotImplementedError on subprocesses
                if not isinstance(loop, getattr(asyncio, "ProactorEventLoop", ())):
                    self._needs_proactor = True
            except RuntimeError:
                pass

        self._proactor_loop: Optional[asyncio.AbstractEventLoop] = None
        self._proactor_thread: Optional[threading.Thread] = None
        
    async def start_browser(self):
        """Launches Chromium in headless mode."""
        if self._needs_proactor:
            if not self._proactor_loop:
                self._proactor_loop = asyncio.ProactorEventLoop()
                ready = threading.Event()
                def _runner():
                    asyncio.set_event_loop(self._proactor_loop)
                    ready.set()
                    self._proactor_loop.run_forever()
                self._proactor_thread = threading.Thread(target=_runner, daemon=True, name="PlaywrightProactorThread")
                self._proactor_thread.start()
                ready.wait()

            fut = asyncio.run_coroutine_threadsafe(self._start_browser_internal(), self._proactor_loop)
            return await asyncio.wrap_future(fut)
        return await self._start_browser_internal()

    async def _start_browser_internal(self):
        logger.info("[ENGINE] Starting Playwright Chromium...")
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu"
            ]
        )
        self.context = await self.browser.new_context(
            viewport={'width': 1280, 'height': 800},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        self.page = await self.context.new_page()
        logger.info("[ENGINE] Browser started successfully.")
        
    async def close(self):
        """Closes every running resource: pages, context, browser and playwright."""
        if self._needs_proactor and self._proactor_loop:
            try:
                fut = asyncio.run_coroutine_threadsafe(self._close_internal(), self._proactor_loop)
                await asyncio.wrap_future(fut)
            except Exception as e:
                logger.warning(f"[ENGINE] Error during browser close in proactor thread: {e}")
            finally:
                if self._proactor_loop and self._proactor_loop.is_running():
                    self._proactor_loop.call_soon_threadsafe(self._proactor_loop.stop)
                if self._proactor_thread:
                    self._proactor_thread.join(timeout=3.0)
                self._proactor_loop = None
                self._proactor_thread = None
        else:
            await self._close_internal()

    async def _close_internal(self):
        if self.page:
            try:
                await self.page.close()
            except Exception:
                logger.debug("[ENGINE] Page already closed.")
            self.page = None

        if self.context:
            try:
                await self.context.close()
            except Exception:
                logger.debug("[ENGINE] Context already closed.")
            self.context = None

        if self.browser:
            try:
                await self.browser.close()
            except Exception:
                logger.warning("[ENGINE] Browser close raised; attempting to force-stop playwright.", exc_info=True)
            self.browser = None

        if self.playwright:
            try:
                await self.playwright.stop()
            except Exception:
                logger.warning("[ENGINE] Playwright stop raised.", exc_info=True)
            self.playwright = None

        await asyncio.sleep(0.05)
        logger.info("[ENGINE] Browser closed.")

    async def handle_popups(self):
        """Handles consent dialogs and sign-in popups.

        Waits briefly for the dialog to render before clicking, because the
        buttons may not exist in the DOM at the moment of the first check.
        """
        try:
            # Handle Google consent "Accept all" button if it exists
            accept_button = self.page.locator('button:has-text("Accept all"), button:has-text("Agree"), button:has-text("I agree"), button[aria-label*="Accept all"]')
            try:
                await accept_button.first.wait_for(timeout=3000)
                logger.info("[ENGINE] Found consent dialog, accepting...")
                await accept_button.first.click(timeout=3000)
                await asyncio.sleep(1.5)
            except PlaywrightError:
                pass

            # Handle sign-in popups ("No thanks" or dismiss)
            dismiss_button = self.page.locator('button:has-text("No thanks"), button:has-text("Dismiss"), button:has-text("Skip")')
            try:
                await dismiss_button.first.wait_for(timeout=2000)
                logger.info("[ENGINE] Found sign-in popup, dismissing...")
                await dismiss_button.first.click(timeout=3000)
                await asyncio.sleep(1.5)
            except PlaywrightError:
                pass
        except Exception as e:
            logger.debug(f"[ENGINE] No popups handled or skipped: {e}")

    async def _accept_consent_page(self):
        """Handles the dedicated Google consent redirect page (consent.google.com)."""
        if "consent.google" not in self.page.url:
            return False
        logger.info("[ENGINE] On Google consent page, accepting...")
        try:
            accept = self.page.locator('button[aria-label*="Accept all"], button:has-text("Accept all"), form button:has-text("Agree")')
            await accept.first.wait_for(timeout=10000)
            await accept.first.click(timeout=5000)
            await asyncio.sleep(2.0)
            return True
        except PlaywrightError as e:
            logger.warning(f"[ENGINE] Could not accept consent page: {e}")
            return False

    async def check_rate_limits(self):
        """Checks for CAPTCHAs or 429 Rate Limits."""
        page_content = await self.page.content()
        if "sorry/index" in self.page.url or "captcha" in page_content.lower() or "unusual traffic" in page_content.lower():
            logger.error("[ENGINE] CRITICAL: Google CAPTCHA or Rate Limit detected.")
            raise Exception("RATE_LIMIT_DETECTED: Google has temporarily blocked this IP address (CAPTCHA).")

    async def _wait_for_feed(self, timeout: float = 30.0) -> bool:
        """Waits for the results feed to appear using multiple selectors.

        Falls back to checking for place links and the main pane in case Google
        changes the ``role="feed"`` attribute, then reloads the page once as a
        last resort before giving up.
        """
        feed_selectors = [
            'div[role="feed"]',
            'a[href*="/maps/place"]',
        ]
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        last_error = None

        while loop.time() < deadline:
            for selector in feed_selectors:
                try:
                    await self.page.wait_for_selector(selector, timeout=5000)
                    return True
                except PlaywrightError as e:
                    last_error = e
            await asyncio.sleep(2.0)

        # Last resort: reload once and wait again for the feed
        logger.warning("[ENGINE] Feed not found on first load, reloading page and retrying...")
        try:
            await self.page.reload(wait_until="domcontentloaded", timeout=30000)
        except PlaywrightError as e:
            last_error = e
        await self.handle_popups()
        await asyncio.sleep(2.0)
        try:
            await self.page.wait_for_selector('div[role="feed"], a[href*="/maps/place"]', timeout=20000)
            return True
        except PlaywrightError as e:
            last_error = e

        logger.error(f"[ENGINE] Feed container not found. DOM might have changed or page didn't load properly: {last_error}")
        return False

    async def navigate_to_maps(self, query: str) -> bool:
        """Navigates to Google Maps and executes the query, with auto-recovery."""
        if self._needs_proactor and self._proactor_loop:
            fut = asyncio.run_coroutine_threadsafe(self._navigate_to_maps_internal(query), self._proactor_loop)
            return await asyncio.wrap_future(fut)
        return await self._navigate_to_maps_internal(query)

    @async_retry(retries=3, base_delay=2.0)
    async def _navigate_to_maps_internal(self, query: str) -> bool:
        url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"
        
        logger.info(f"[ENGINE] Navigating to Maps: {url}")
        try:
            await self.page.goto(url, wait_until="domcontentloaded", timeout=45000)
        except PlaywrightError as e:
            logger.warning(f"[ENGINE] Initial goto timed out, continuing anyway: {e}")

        # Handle the dedicated consent redirect page if it appears
        if "consent.google" in self.page.url:
            await self._accept_consent_page()
            if "consent.google" in self.page.url:
                # Still on consent; navigate to the actual maps URL again
                await self.page.goto(url, wait_until="domcontentloaded", timeout=30000)

        await self.handle_popups()
        await asyncio.sleep(0.5)
        await self.check_rate_limits()

        if not await self._wait_for_feed():
            raise Exception("FEED_NOT_FOUND: The results feed did not load in time.")
        logger.info("[ENGINE] Navigation successful, feed container found.")
        return True
                
    async def _snapshot_scroll_state(self) -> Optional[dict]:
        """
        Captures the scroll position of every plausible scroll container on the page
        (the feed element, its ancestors, and the document). Used to reliably detect
        whether scrolling actually moved the results list.
        """
        try:
            return await self.page.evaluate(
                '''() => {
                    const snapshot = {};
                    const candidates = [];
                    const feed = document.querySelector('div[role="feed"]');
                    if (feed) candidates.push(feed);
                    let p = feed ? feed.parentElement : null;
                    while (p) { candidates.push(p); p = p.parentElement; }
                    candidates.push(document.scrollingElement);
                    candidates.push(document.documentElement);
                    candidates.push(document.body);
                    candidates.forEach((el, idx) => {
                        if (el) snapshot["c" + idx] = [el.scrollTop, el.scrollHeight];
                    });
                    return snapshot;
                }'''
            )
        except PlaywrightError:
            return None

    async def _scroll_feed(self, feed_locator) -> bool:
        """
        Scrolls the Google Maps results feed using several independent strategies and
        returns True if the scroll position demonstrably moved (or could not be
        measured — callers treat an unknown state as "moved" to avoid false exhaustion).
        """
        before = await self._snapshot_scroll_state()

        # Strategy 1: scrollIntoView on the last place link (most reliable in Maps)
        try:
            await self.page.evaluate(
                '''() => {
                    const cards = document.querySelectorAll('div[role="feed"] a[href*="/maps/place"]');
                    if (cards.length > 0) {
                        cards[cards.length - 1].scrollIntoView({ behavior: "instant", block: "end" });
                    }
                }'''
            )
            await asyncio.sleep(0.4)
        except PlaywrightError:
            pass

        # Strategy 2: JS scroll on the feed element and every scrollable ancestor
        try:
            await feed_locator.evaluate(
                '''(el) => {
                    el.scrollTop = el.scrollHeight;
                    let parent = el.parentElement;
                    while (parent) {
                        if (parent.scrollHeight > parent.clientHeight) {
                            parent.scrollTop = parent.scrollHeight;
                        }
                        parent = parent.parentElement;
                    }
                }'''
            )
        except PlaywrightError:
            pass

        # Strategy 3: hover the feed and send a mouse wheel so Google's own
        # lazy-loading triggers on the correct container
        try:
            await feed_locator.hover(timeout=2000)
            await self.page.mouse.wheel(0, 5000)
        except PlaywrightError:
            pass

        # Strategy 4: keyboard End / PageDown on the last card
        try:
            last_card = self.page.locator('div[role="feed"] > div:has(a[href*="/maps/place"])').last
            if await last_card.count() > 0:
                await last_card.focus(timeout=2000)
                await self.page.keyboard.press("End")
                await self.page.keyboard.press("PageDown")
                await self.page.keyboard.press("PageDown")
        except PlaywrightError:
            pass

        after = await self._snapshot_scroll_state()
        if before is None or after is None:
            # Could not measure — do not treat as "unmoved" (avoids false exhaustion).
            return True

        for key, value in before.items():
            other = after.get(key)
            if other is None:
                continue
            try:
                if other[0] > value[0] or other[1] > value[1]:
                    return True
            except (IndexError, TypeError):
                continue
        return False

    async def scroll_results(self, limit: int, status_callback: Optional[Callable[[str], None]] = None) -> AsyncGenerator[Tuple[str, str], None]:
        """
        Continuous discovery loop over the Google Maps results feed.
        """
        if self._needs_proactor and self._proactor_loop:
            caller_loop = asyncio.get_running_loop()
            q: asyncio.Queue[Tuple[Optional[str], Optional[str], Optional[Exception]]] = asyncio.Queue()

            def safe_status_callback(stage: str):
                if status_callback:
                    try:
                        caller_loop.call_soon_threadsafe(status_callback, stage)
                    except Exception:
                        pass

            async def _producer():
                try:
                    async for detail_html, current_url in self._scroll_results_internal(limit, safe_status_callback):
                        caller_loop.call_soon_threadsafe(q.put_nowait, (detail_html, current_url, None))
                    caller_loop.call_soon_threadsafe(q.put_nowait, (None, None, None))
                except Exception as exc:
                    caller_loop.call_soon_threadsafe(q.put_nowait, (None, None, exc))

            asyncio.run_coroutine_threadsafe(_producer(), self._proactor_loop)

            while True:
                detail_html, current_url, exc = await q.get()
                if exc is not None:
                    raise exc
                if detail_html is None:
                    break
                yield detail_html, current_url
        else:
            async for item in self._scroll_results_internal(limit, status_callback):
                yield item

    async def _scroll_results_internal(self, limit: int, status_callback: Optional[Callable[[str], None]] = None) -> AsyncGenerator[Tuple[str, str], None]:
        """
        Continuous discovery loop over the Google Maps results feed.

        Yields (detail_html, current_url) for every newly discovered business.
        The loop does NOT stop when ``len(discovered) == limit`` — the consumer
        (SearchService) decides when the target of valid unique saved leads has
        been reached and stops pulling. This generator only terminates when:

        * Google Maps indicates the end of the list, or
        * several consecutive discovery cycles return no new unique businesses
          (multi-signal source exhaustion detection).

        ``limit`` is used purely for progress logging / discovery expectations.
        """
        if status_callback: status_callback("INITIALIZING")
        logger.info(f"[ENGINE] Starting continuous discovery. Target: {limit} valid leads.")

        feed_locator = self.page.locator('div[role="feed"]')
        processed_links = set()
        consecutive_empty_cycles = 0
        consecutive_unmoved_cycles = 0
        max_empty_cycles = max(1, int(getattr(search_config, "MAX_CONSECUTIVE_EMPTY_CYCLES", 6) or 6))
        max_unmoved_cycles = max(1, int(getattr(search_config, "MIN_UNMOVED_CYCLES", 3) or 3))

        while True:
            links = self.page.locator('div[role="feed"] a[href*="/maps/place"]')
            count = await links.count()
            new_links_found = False

            for i in range(count):
                link = links.nth(i)
                try:
                    href = await link.get_attribute("href")
                except PlaywrightError:
                    continue
                if not href or href in processed_links:
                    continue
                processed_links.add(href)
                new_links_found = True

                # Extract using a new tab to avoid losing search feed state
                new_page = None
                try:
                    new_page = await self.page.context.new_page()
                    await new_page.goto(href, wait_until="domcontentloaded", timeout=15000)

                    # Wait for the detail panel to load properly
                    try:
                        await new_page.wait_for_function('''() => {
                            const h1s = Array.from(document.querySelectorAll('h1'));
                            return h1s.some(h1 => h1.innerText.trim().toLowerCase() !== 'results' && h1.innerText.trim().length > 0);
                        }''', timeout=8000)
                        # Quick wait for dynamic content (phone, website, address) to populate
                        try:
                            await new_page.wait_for_selector('[data-item-id]', timeout=1500)
                        except PlaywrightError:
                            pass
                        await asyncio.sleep(0.3)
                    except PlaywrightError:
                        logger.warning("[ENGINE] Timeout waiting for detail panel h1 in new tab. Proceeding anyway.")
                        await asyncio.sleep(0.5)

                    current_url = new_page.url
                    detail_html = await new_page.content()
                    await new_page.close()
                    new_page = None

                    logger.info(f"[ENGINE] Discovered business {len(processed_links)} (target {limit}). Extracting details...")
                    yield detail_html, current_url
                except Exception as e:
                    logger.warning(f"[ENGINE] Failed to extract details for {href}: {e}")
                    if new_page is not None:
                        try:
                            await new_page.close()
                        except Exception:
                            pass

            # End-of-list marker: Google explicitly signals there are no more results
            try:
                end_marker = self.page.locator('text="You\'ve reached the end of the list."')
                if await end_marker.count() > 0 and await end_marker.is_visible():
                    logger.info("[ENGINE] 'End of list' marker detected. Source exhausted.")
                    break
            except PlaywrightError:
                pass

            if new_links_found:
                consecutive_empty_cycles = 0
            else:
                consecutive_empty_cycles += 1

            if status_callback: status_callback("SCROLLING")
            logger.info(
                f"[ENGINE] Scrolling for more results... "
                f"(consecutive empty cycles: {consecutive_empty_cycles}/{max_empty_cycles})"
            )

            scroll_moved = await self._scroll_feed(feed_locator)
            await asyncio.sleep(1.5)  # Wait for lazy loading

            if not scroll_moved:
                consecutive_unmoved_cycles += 1
            else:
                consecutive_unmoved_cycles = 0

            exhausted = consecutive_empty_cycles >= max_empty_cycles
            if not exhausted and consecutive_empty_cycles >= 4 and consecutive_unmoved_cycles >= max_unmoved_cycles:
                # Secondary multi-signal check: several empty cycles combined with a
                # feed whose scroll position no longer changes.
                exhausted = True

            if exhausted:
                logger.info(
                    f"[ENGINE] No new unique results after {consecutive_empty_cycles} consecutive scroll cycles "
                    f"(scroll moved: {scroll_moved}). Assuming source exhausted."
                )
                break

        logger.info(f"[ENGINE] Discovery finished. Discovered {len(processed_links)} unique businesses.")
