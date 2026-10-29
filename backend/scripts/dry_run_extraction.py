"""
Standalone dry-run for the redesigned Business Extraction Engine.

Offline (default): asserts the authoritative taxonomy, verify-before-save logic,
and per-rejection validation logging using synthetic candidates:

    * Domino's Pizza            -> ACCEPTED (Restaurant)
    * Prahlad Nagar             -> REJECTED (Administrative Locality)
    * Satellite                 -> REJECTED (Neighborhood)
    * A business missing Place ID -> REJECTED
    * An area name (== Area)    -> REJECTED, name == area

Live (--live): drives a real browser, opens a sample business details panel,
extracts the 14 fields, verifies, and prints the outcome.  Requires network
access and Playwright browsers installed.

Usage:
    python backend/scripts/dry_run_extraction.py
    python backend/scripts/dry_run_extraction.py --live \
        --url "https://www.google.com/maps/place/Dominos/@..."
"""
import argparse
import asyncio

from app.modules.search.extraction.taxonomy import classify_entity
from app.modules.search.extraction.verification import verify_business
from app.modules.search.extraction.validation_logger import log_rejection


CTX = {"area": "Prahlad Nagar", "city": "Ahmedabad", "state": "Gujarat", "country": "India"}


def _assert(cond, msg):
    if not cond:
        print(f"  [FAIL] {msg}")
        raise SystemExit(1)
    print(f"  [ok]   {msg}")


def run_offline_checks():
    print("\n== 1. Taxonomy / classification ==")
    dom = classify_entity("Domino's Pizza", "Restaurant", CTX)
    _assert(dom.is_business and dom.entity_type == "Restaurant", "Domino's Pizza ACCEPTED as Restaurant")

    prahlad = classify_entity("Prahlad Nagar", "Administrative Locality", CTX)
    _assert(not prahlad.is_business and prahlad.entity_type == "Administrative Locality",
            "Prahlad Nagar REJECTED as Administrative Locality")

    satellite = classify_entity("Satellite", "Neighborhood", CTX)
    _assert(not satellite.is_business and satellite.entity_type == "Neighborhood",
            "Satellite REJECTED as Neighborhood")

    print("\n== 2. Verify before save ==")
    good = {
        "name": "Domino's Pizza", "category": "Restaurant",
        "address": "Streetside, Prahlad Nagar, Ahmedabad, Gujarat, India",
        "area": "Prahlad Nagar", "city": "Ahmedabad", "state": "Gujarat", "country": "India",
        "phone": "+91 98250 00000", "website": "https://dominos.in",
        "rating": 4.2, "reviews": 150, "place_id": "ChIJ_example", "maps_url": "x",
    }
    _assert(verify_business(good, CTX).accepted, "valid business ACCEPTED")

    no_pid = dict(good)
    no_pid["place_id"] = None
    _assert(not verify_business(no_pid, CTX).accepted, "missing Place ID REJECTED")

    area_name = dict(good)
    area_name["name"] = "Prahlad Nagar"
    area_name["category"] = "Administrative Locality"
    r = verify_business(area_name, CTX)
    _assert(not r.accepted and r.entity_type == "Administrative Locality", "area name == Area REJECTED")

    print("\n== 3. Validation logging for every reject ==")
    logged = []

    class _Coll:
        @staticmethod
        async def insert_one(doc):
            logged.append(doc)

    class _DB:
        validation_logs = _Coll()

        def __getitem__(self, key):
            return self.validation_logs

    asyncio.run(log_rejection(
        _DB(), "job_x", "user_x",
        name="Prahlad Nagar", entity_type="Administrative Locality",
        reason="Administrative Locality", source_url="https://maps.google.com/?cid=1",
        search_context=CTX,
    ))
    _assert(len(logged) == 1 and logged[0]["decision"] == "REJECTED",
            "rejection written to validation_logs")

    print("\nALL OFFLINE CHECKS PASSED.\n")


async def run_live(args):
    print("\n== LIVE MODE: opening a real details panel ==")
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("Playwright is not installed; cannot run live mode.")
        raise SystemExit(1)

    from app.modules.search.extraction.detail_extractor import DetailExtractor

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"),
        )
        page = await context.new_page()
        extractor = DetailExtractor(page)
        opened = await extractor.open(args.url)
        _assert(opened, "details panel opened")
        fields = await extractor.extract_all(args.url, CTX)
        print("\nEXTRACTED FIELDS:")
        for k, v in fields.items():
            print(f"  {k}: {v}")
        result = verify_business(fields, CTX)
        print(f"\nVERIFICATION: accepted={result.accepted} type={result.entity_type} reason={result.reason}")
        await browser.close()


def main():
    parser = argparse.ArgumentParser(description="Dry-run the Business Extraction Engine")
    parser.add_argument("--live", action="store_true", help="drive a real browser")
    parser.add_argument("--url", default="")
    args = parser.parse_args()

    run_offline_checks()
    if args.live:
        asyncio.run(run_live(args))


if __name__ == "__main__":
    main()
