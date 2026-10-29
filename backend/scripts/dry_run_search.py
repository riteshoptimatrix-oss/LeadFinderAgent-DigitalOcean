"""
Standalone dry-run for the rebuilt Google Maps Discovery Engine.

Offline (default): imports the new modules and asserts the pure logic
  - normalized query construction
  - page-type classification for every page variant
  - per-card business classification (genuine / area-name / out-of-area / locality)

Live (--live): launches a real Chromium browser and runs the full provider
  against a sample search, printing the production search report. Requires
  network access and Playwright browsers installed.

Usage:
    python backend/scripts/dry_run_search.py
    python backend/scripts/dry_run_search.py --live \
        --keyword "Salon" --area "Prahlad Nagar" \
        --city "Ahmedabad" --state "Gujarat" --country "India"
"""
import argparse
import asyncio

from app.modules.search.providers.google_maps.query_builder import (
    build_query,
    build_fallback_queries,
)
from app.modules.search.providers.google_maps.page_classifier import (
    classify_page_signals,
    PageType,
)
from app.services.scraper.engine.business_classifier import classify_card


def _assert(cond: bool, msg: str):
    if not cond:
        print(f"  [FAIL] {msg}")
        raise SystemExit(1)
    print(f"  [ok]   {msg}")


def run_offline_checks():
    print("\n== 1. Normalized query ==")
    q = build_query("Salon", "Prahlad Nagar", "Ahmedabad", "Gujarat", "India")
    _assert(
        q == "Salon in Prahlad Nagar, Ahmedabad, Gujarat, India",
        f"query built -> {q}",
    )
    fallbacks = build_fallback_queries(
        "Salon", "Prahlad Nagar", "Ahmedabad", "Gujarat", "India"
    )
    _assert(q not in fallbacks, "fallbacks exclude the original query")
    _assert(fallbacks[0] == "Salon in Ahmedabad, Gujarat, India", "first fallback drops area")

    print("\n== 2. Page-type classification ==")
    cases = {
        "business_listing": (
            {"url": "https://www.google.com/maps/search/Salon", "has_feed": True, "card_count": 9},
            PageType.BUSINESS_LISTING,
        ),
        "place_page": (
            {"url": "https://www.google.com/maps/place/John's+Salon", "category": "Beauty salon"},
            PageType.PLACE_PAGE,
        ),
        "locality": (
            {"url": "https://www.google.com/maps/place/Prahlad+Nagar", "category": "Neighborhood"},
            PageType.LOCALITY,
        ),
        "administrative": (
            {"url": "https://www.google.com/maps/place/Ahmedabad", "category": "City"},
            PageType.ADMINISTRATIVE,
        ),
        "autocomplete": (
            {"url": "https://www.google.com/maps/search/S", "has_autocomplete": True},
            PageType.AUTOCOMPLETE,
        ),
    }
    for name, (signals, expected) in cases.items():
        c = classify_page_signals(signals)
        _assert(c.page_type == expected, f"{name} -> {c.page_type.value}")
        _assert(
            c.is_scrapeable() == (expected in (PageType.BUSINESS_LISTING, PageType.PLACE_PAGE)),
            f"{name} scrapeable flag correct",
        )

    print("\n== 3. Per-card business classification ==")
    # Genuine in-area salon with full signals -> ACCEPT.
    ok = classify_card(
        name="Style Hub Unisex Salon", keyword="Salon",
        category="Beauty salon", rating=4.3, reviews=120,
        phone="+91 98250 12345", website="https://stylehub.com",
        address="Prahlad Nagar Road, Ahmedabad",
        maps_url="https://www.google.com/maps/place/Style+Hub/@23.0,72.5,15z",
        area="Prahlad Nagar", city="Ahmedabad", state="Gujarat", country="India",
    )
    _assert(ok.is_business, "genuine in-area salon ACCEPTED")

    # Area name itself returned as a result -> REJECT (locality).
    area = classify_card(
        name="Prahlad Nagar", keyword="Salon", category="Neighborhood",
        area="Prahlad Nagar", city="Ahmedabad", state="Gujarat", country="India",
    )
    _assert(not area.is_business, "area name REJECTED as locality")

    # Real business but in a different area -> REJECT (out-of-area).
    ooa = classify_card(
        name="Glamour Salon", keyword="Salon", category="Beauty salon",
        rating=4.1, reviews=80, address="Satellite Road, Ahmedabad",
        maps_url="https://www.google.com/maps/place/Glamour/@23.1,72.5,15z",
        area="Prahlad Nagar", city="Ahmedabad", state="Gujarat", country="India",
    )
    _assert(not ooa.is_business, "out-of-area salon REJECTED")

    # Name-only result (no signals) -> REJECT as locality.
    bare = classify_card(
        name="Some Nagar", keyword="Salon",
        area="Prahlad Nagar", city="Ahmedabad", state="Gujarat", country="India",
    )
    _assert(not bare.is_business, "name-only result REJECTED as locality")

    print("\nALL OFFLINE CHECKS PASSED.\n")


async def run_live(args):
    print("\n== LIVE MODE: driving a real browser ==")
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("Playwright is not installed; cannot run live mode.")
        raise SystemExit(1)

    from app.modules.search.telemetry.telemetry import TelemetryCollector
    from app.modules.search.providers.google_maps.google_maps_provider import (
        GoogleMapsProvider,
    )

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
            ),
        )
        page = await context.new_page()
        telemetry = TelemetryCollector(job_id="dry-run", worker_id="dry-run")

        provider = GoogleMapsProvider(page, telemetry, db=None)
        provider.configure_search(
            keyword=args.keyword, area=args.area, city=args.city,
            state=args.state, country=args.country,
        )

        started = await provider.reliable_startup()
        _assert(started, "reliable_startup succeeded")

        query = build_query(
            args.keyword, area=args.area, city=args.city,
            state=args.state, country=args.country,
        )
        searched = await provider.execute_human_search(query)
        print(f"  search '{query}' -> success={searched}, type={provider.search_type}")

        feed = await provider.detect_feed()
        if feed:
            leads = await provider.discover_businesses_feed(feed, args.max_leads)
            print(f"  discovered {len(leads)} genuine businesses "
                  f"(rejected {provider.locality_cards_rejected} localities)")
        else:
            print("  no feed detected (single result or redirect)")

        report = provider.build_search_report()
        print("\nSEARCH REPORT:")
        for k, v in report.items():
            print(f"  {k}: {v}")

        await browser.close()


def main():
    parser = argparse.ArgumentParser(description="Dry-run the Google Maps discovery engine")
    parser.add_argument("--live", action="store_true", help="run against a real browser")
    parser.add_argument("--keyword", default="Salon")
    parser.add_argument("--area", default="Prahlad Nagar")
    parser.add_argument("--city", default="Ahmedabad")
    parser.add_argument("--state", default="Gujarat")
    parser.add_argument("--country", default="India")
    parser.add_argument("--max_leads", type=int, default=20)
    args = parser.parse_args()

    run_offline_checks()

    if args.live:
        asyncio.run(run_live(args))


if __name__ == "__main__":
    main()
