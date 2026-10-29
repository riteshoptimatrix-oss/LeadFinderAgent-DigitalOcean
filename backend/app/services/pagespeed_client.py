"""
Shared Google PageSpeed Insights Client
========================================

A single, process-wide client used by BOTH the SEO and Performance analyzers
so that PageSpeed results are cached by normalized domain and never requested
twice for the same analysis run (and optionally persisted across runs).

Resilience features
-------------------
- In-memory + MongoDB cache keyed by (normalized_domain, strategy).
- Exponential backoff WITH FULL JITTER (avoids the thundering-herd retry
  storms that produced the repeated HTTP 429 responses).
- A quota-aware circuit breaker that trips after repeated failures and
  stays open for a cool-down window, so we never hammer the API.
- Local heuristic analyzer fallback so the pipeline NEVER blocks and scores
  are NEVER left empty when the API is unavailable.
- One API call (all categories) is shared between SEO and Performance.

Public API
----------
    client = get_pagespeed_client()
    data = await client.get_insights(url, strategy="mobile", on_update=cb)
    heuristic = client.heuristic_from_crawl(pages, strategy="mobile")
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import random
import time
from typing import Any, Dict, List, Optional

import httpx

from app.core.logger import logger
from app.db.database import get_db

logger = logging.getLogger(__name__)

PAGESPEED_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

# Categories are requested once and cached; both SEO and Performance read them.
DEFAULT_CATEGORIES = ["performance", "best-practices", "seo"]

# ── Retry / backoff tuning ──────────────────────────────────────────────────
MAX_RETRIES = 4
BASE_BACKOFF = 1.5        # seconds
MAX_BACKOFF = 30.0       # seconds ceiling
JITTER_FRACTION = 1.0    # full jitter -> sleep = random(0, exp_backoff)
REQUEST_TIMEOUT = 25.0   # seconds per request

# ── Circuit breaker (quota protection) ─────────────────────────────────────
CB_FAILURE_THRESHOLD = 4
CB_COOLDOWN_SECONDS = 300  # 5 minutes before half-open retry


def _normalize_domain(url: str) -> str:
    """Normalize a URL to its bare registrable domain for cache keys."""
    from urllib.parse import urlparse
    try:
        netloc = urlparse(url).netloc or urlparse(url).path
    except Exception:
        netloc = url
    netloc = netloc.lower().split("@")[-1].split(":")[0]
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc


class PageSpeedClient:
    """Process-wide, shared PageSpeed client with caching + resilience."""

    def __init__(self):
        # In-memory cache: (domain, strategy) -> (timestamp, payload)
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl = 60 * 60 * 24  # 24h in-memory validity

        # Circuit breaker state (class-wide quota protection)
        self._cb_failures = 0
        self._cb_open_until = 0.0  # epoch seconds; 0 = closed

        # Local heuristic cache so we don't recompute for both strategies
        self._heuristic_cache: Dict[str, Dict[str, Any]] = {}

        # Shared HTTP session (connection pooling across SEO + Performance).
        self._client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        """Lazily create (and reuse) a single AsyncClient for connection pooling."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=REQUEST_TIMEOUT)
        return self._client

    # ── Circuit breaker ───────────────────────────────────────────────────
    def _cb_is_open(self) -> bool:
        if self._cb_open_until and time.time() < self._cb_open_until:
            return True
        # Cool-down elapsed -> allow a half-open attempt
        if self._cb_open_until and time.time() >= self._cb_open_until:
            self._cb_open_until = 0.0
            self._cb_failures = 0
        return False

    def _cb_record_failure(self) -> None:
        self._cb_failures += 1
        if self._cb_failures >= CB_FAILURE_THRESHOLD:
            self._cb_open_until = time.time() + CB_COOLDOWN_SECONDS
            logger.error(
                f"PAGESPEED_CIRCUIT_BREAKER_OPEN: tripped after "
                f"{self._cb_failures} failures; cooling down "
                f"{CB_COOLDOWN_SECONDS}s"
            )

    def _cb_record_success(self) -> None:
        if self._cb_failures:
            self._cb_failures = 0
        self._cb_open_until = 0.0

    # ── Cache helpers ─────────────────────────────────────────────────────
    def _cache_key(self, url: str, strategy: str) -> str:
        return f"{_normalize_domain(url)}|{strategy}"

    async def _load_persisted(self, domain: str, strategy: str) -> Optional[Dict[str, Any]]:
        """Load a previously persisted PageSpeed result from MongoDB."""
        try:
            db = get_db()
            if db is None:
                return None
            doc = await db["pagespeed_cache"].find_one(
                {"domain": domain, "strategy": strategy}
            )
            if not doc:
                return None
            if time.time() - float(doc.get("cached_at", 0)) > self._cache_ttl:
                return None
            return doc.get("payload")
        except Exception as e:
            logger.debug(f"PAGESPEED_CACHE_LOAD_FAILED: {e}")
            return None

    async def _persist(self, domain: str, strategy: str, payload: Dict[str, Any]) -> None:
        try:
            db = get_db()
            if db is None:
                return
            await db["pagespeed_cache"].update_one(
                {"domain": domain, "strategy": strategy},
                {"$set": {
                    "domain": domain,
                    "strategy": strategy,
                    "payload": payload,
                    "cached_at": time.time(),
                }},
                upsert=True,
            )
        except Exception as e:
            logger.debug(f"PAGESPEED_CACHE_PERSIST_FAILED: {e}")

    # ── Public API ────────────────────────────────────────────────────────
    async def get_insights(
        self,
        url: str,
        strategy: str = "mobile",
        categories: Optional[List[str]] = None,
        on_update=None,
    ) -> Dict[str, Any]:
        """
        Return PageSpeed Insights data for a URL + strategy.

        Results are cached by normalized domain + strategy. Consecutive
        calls within the same analysis (and across runs via MongoDB) reuse
        the cached payload, so the SEO and Performance analyzers share one
        real API call per strategy.

        On any failure or when the circuit breaker is open, returns a
        heuristic fallback payload (never raises, never returns None).
        """
        if not url:
            return self._fallback(url, strategy, "No URL provided")

        key = self._cache_key(url, strategy)
        domain = _normalize_domain(url)

        # 1) In-memory cache
        if key in self._cache:
            entry = self._cache[key]
            if time.time() - entry["ts"] < self._cache_ttl:
                logger.info(f"PAGESPEED_CACHE_HIT (memory): {key}")
                return entry["payload"]

        # 2) Persisted cache
        persisted = await self._load_persisted(domain, strategy)
        if persisted is not None:
            self._cache[key] = {"ts": time.time(), "payload": persisted}
            logger.info(f"PAGESPEED_CACHE_HIT (mongo): {key}")
            return persisted

        # 3) Circuit breaker open -> skip the network entirely
        if self._cb_is_open():
            logger.warning(
                f"PAGESPEED_CIRCUIT_OPEN: skipping network for {url} "
                f"(strategy={strategy})"
            )
            return self._fallback(url, strategy, "Circuit breaker open")

        # 4) Real API call with exponential backoff + jitter
        cats = categories or DEFAULT_CATEGORIES
        payload = await self._fetch_with_backoff(url, strategy, cats, on_update)
        if payload is None or payload.get("_fallback"):
            # _fetch_with_backoff already returns a fallback dict on exhaustion
            if payload is None:
                payload = self._fallback(url, strategy, "Unknown error")
        else:
            self._cache[key] = {"ts": time.time(), "payload": payload}
            await self._persist(domain, strategy, payload)

        return payload

    async def _fetch_with_backoff(
        self,
        url: str,
        strategy: str,
        categories: List[str],
        on_update=None,
    ) -> Dict[str, Any]:
        last_error = "Unknown error"
        for attempt in range(MAX_RETRIES):
            try:
                client = self._get_client()
                resp = await client.get(
                    PAGESPEED_ENDPOINT,
                    params={
                        "url": url,
                        "strategy": strategy,
                        "category": categories,
                    },
                )

                if resp.status_code == 200:
                    self._cb_record_success()
                    return resp.json()

                if resp.status_code == 429:
                    last_error = "Rate limited (HTTP 429)"
                    if attempt == MAX_RETRIES - 1:
                        self._cb_record_failure()
                        break
                    # Exponential backoff WITH FULL JITTER
                    sleep = min(MAX_BACKOFF, BASE_BACKOFF * (2 ** attempt))
                    sleep = random.uniform(0, sleep)
                    logger.warning(
                        f"PAGESPEED_RATE_LIMIT (429) {url} [{strategy}] "
                        f"attempt {attempt + 1}/{MAX_RETRIES}; "
                        f"backing off {sleep:.2f}s"
                    )
                    await asyncio.sleep(sleep)
                    continue

                if resp.status_code in (400, 404):
                    # Unrecoverable for this URL
                    return self._fallback(url, strategy, f"HTTP {resp.status_code}")

                # Other server errors -> retry with backoff
                last_error = f"HTTP {resp.status_code}"
                if attempt == MAX_RETRIES - 1:
                    self._cb_record_failure()
                    break
                sleep = min(MAX_BACKOFF, BASE_BACKOFF * (2 ** attempt))
                sleep = random.uniform(0, sleep)
                logger.warning(
                    f"PAGESPEED_SERVER_ERROR {last_error} {url} [{strategy}] "
                    f"attempt {attempt + 1}/{MAX_RETRIES}; backing off {sleep:.2f}s"
                )
                await asyncio.sleep(sleep)

            except asyncio.TimeoutError:
                last_error = "Request timeout"
                if attempt == MAX_RETRIES - 1:
                    self._cb_record_failure()
                    break
                sleep = min(MAX_BACKOFF, BASE_BACKOFF * (2 ** attempt))
                sleep = random.uniform(0, sleep)
                logger.warning(
                    f"PAGESPEED_TIMEOUT {url} [{strategy}] attempt "
                    f"{attempt + 1}/{MAX_RETRIES}; backing off {sleep:.2f}s"
                )
                await asyncio.sleep(sleep)

            except httpx.RequestError as e:
                last_error = f"Request error: {e}"
                if attempt == MAX_RETRIES - 1:
                    self._cb_record_failure()
                    break
                sleep = min(MAX_BACKOFF, BASE_BACKOFF * (2 ** attempt))
                sleep = random.uniform(0, sleep)
                logger.warning(
                    f"PAGESPEED_REQUEST_ERROR {url} [{strategy}] attempt "
                    f"{attempt + 1}/{MAX_RETRIES}; backing off {sleep:.2f}s"
                )
                await asyncio.sleep(sleep)

            except Exception as e:  # pragma: no cover - defensive
                last_error = f"Unexpected: {e}"
                logger.error(f"PAGESPEED_UNEXPECTED {url}: {e}")
                break

        logger.warning(
            f"PAGESPEED_FALLBACK {url} [{strategy}]: {last_error}"
        )
        return self._fallback(url, strategy, last_error)

    # ── Local heuristic analyzer (fallback) ───────────────────────────────
    def _fallback(self, url: str, strategy: str, reason: str) -> Dict[str, Any]:
        return {
            "lighthouseResult": {
                "requestedUrl": url,
                "finalUrl": url,
                "audits": {},
                "categories": {
                    "performance": {"score": None},
                    "best-practices": {"score": None},
                    "seo": {"score": None},
                },
            },
            "_fallback": True,
            "_fallback_reason": reason,
            "_strategy": strategy,
        }

    def heuristic_from_crawl(
        self,
        pages: List[Dict[str, Any]],
        strategy: str = "mobile",
    ) -> Dict[str, Any]:
        """
        Local heuristic analyzer used when the PageSpeed API is unavailable.

        Derives a plausible performance profile from the crawled pages
        (load times, resource counts) so scores are never empty. Returns a
        payload shaped like a (lightly populated) PageSpeed response, with a
        `heuristic_scores` block the analyzers can read.
        """
        cache_key = f"heur|{strategy}"
        if cache_key in self._heuristic_cache:
            return self._heuristic_cache[cache_key]

        page_list = pages or []
        avg_load = 0.0
        if page_list:
            avg_load = sum(p.get("load_time", 0.0) or 0.0 for p in page_list) / max(1, len(page_list))

        if avg_load == 0:
            base = 85
        elif avg_load < 0.8:
            base = 98
        elif avg_load < 1.5:
            base = 90
        elif avg_load < 2.5:
            base = 80
        elif avg_load < 4.0:
            base = 65
        else:
            base = 45

        resource_penalty = 0
        if page_list:
            first = page_list[0]
            html = first.get("rendered_html") or first.get("html") or ""
            try:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(html, "html.parser")
                script_count = len(soup.find_all("script"))
                css_count = len(soup.find_all("link", rel="stylesheet"))
                img_count = len(soup.find_all("img"))
                resource_penalty = min(25, script_count * 0.5 + css_count * 0.5 + img_count * 0.2)
            except Exception:
                pass

        mobile_factor = 0.95 if strategy == "mobile" else 1.0
        perf_score = int(max(35, base - resource_penalty) * mobile_factor)
        seo_score = int(base)
        bp_score = int(max(50, base - resource_penalty * 0.5))

        result = {
            "lighthouseResult": {
                "requestedUrl": page_list[0].get("url") if page_list else "",
                "finalUrl": page_list[0].get("url") if page_list else "",
                "audits": {},
                "categories": {
                    "performance": {"score": perf_score / 100.0},
                    "best-practices": {"score": bp_score / 100.0},
                    "seo": {"score": seo_score / 100.0},
                },
            },
            "_heuristic": True,
            "_fallback_reason": "Local heuristic analyzer (API unavailable)",
            "_strategy": strategy,
            "heuristic_scores": {
                "performance": perf_score,
                "seo": seo_score,
                "best_practices": bp_score,
            },
        }
        self._heuristic_cache[cache_key] = result
        return result

    def reset(self) -> None:
        """Clear in-memory caches (used by tests / manual recovery)."""
        self._cache.clear()
        self._heuristic_cache.clear()
        self._cb_failures = 0
        self._cb_open_until = 0.0


_client: Optional[PageSpeedClient] = None


def get_pagespeed_client() -> PageSpeedClient:
    global _client
    if _client is None:
        _client = PageSpeedClient()
    return _client
