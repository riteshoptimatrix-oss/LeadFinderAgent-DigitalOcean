"""
cli/fetch_leads.py - Apollo.io lead fetcher (daily cron script).
Usage: python cli/fetch_leads.py
"""
import hashlib
import secrets
import sys
import time
from datetime import date
from pathlib import Path

import pymysql
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config
from db import get_db, settings_get, settings_set
from services.logger import AppLogger


def apollo_post(url: str, payload: dict, log: AppLogger) -> tuple[int, dict]:
    try:
        resp = requests.post(
            url,
            json=payload,
            timeout=30,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Api-Key": config.APOLLO_API_KEY,
            },
        )
        return resp.status_code, resp.json() if resp.text else {}
    except Exception as exc:
        log.error(f"HTTP error calling {url}: {exc}")
        return 0, {}


def lead_exists_by_apollo_id(conn, apollo_id: str) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM leads WHERE apollo_id = %s LIMIT 1", (apollo_id,))
        return bool(cur.fetchone())


def lead_exists_by_email(conn, email_addr: str) -> bool:
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM leads WHERE email = %s LIMIT 1", (email_addr,))
        return bool(cur.fetchone())


def main() -> int:
    log = AppLogger("fetch_leads")
    conn = get_db()

    today = date.today().isoformat()
    if settings_get(conn, "apollo_last_run_date") == today:
        log.info(f"Already fetched today ({today}). Skipping.")
        conn.close()
        return 0

    current_page = int(settings_get(conn, "apollo_last_page") or 1)
    if current_page < 1:
        current_page = 1

    search_payload = {
        "page": current_page,
        "per_page": config.APOLLO_PAGE_SIZE,
        "person_titles": [
            "Founder", "Co-Founder", "Owner", "Managing Director",
            "Director", "Marketing Manager", "Sales Manager", "Head of Marketing",
        ],
        "person_locations": ["Gujarat, India"],
        "q_organization_num_employees_ranges": ["11,200"],
    }

    log.info(f"Starting fetch. Page={current_page}, Limit={config.APOLLO_DAILY_LIMIT}")
    fetched = 0
    attempted = 0
    max_pages = 200

    while fetched < config.APOLLO_DAILY_LIMIT and current_page <= max_pages:
        search_payload["page"] = current_page
        log.info(f"Searching Apollo page {current_page}...")

        status, body = apollo_post(config.APOLLO_SEARCH_EP, search_payload, log)
        if status == 429:
            log.warn(f"Rate-limited (429). Sleeping {config.APOLLO_RATE_SLEEP}s...")
            time.sleep(config.APOLLO_RATE_SLEEP)
            continue

        people = body.get("people") or []
        if status != 200 or not people:
            log.warn(f"Search returned status={status} or empty people. Stopping.")
            break

        log.info(f"  Got {len(people)} people on page {current_page}.")

        halt = False
        for person in people:
            if fetched >= config.APOLLO_DAILY_LIMIT:
                break

            apollo_id = (person.get("id") or "").strip()
            if not apollo_id:
                continue
            attempted += 1

            if lead_exists_by_apollo_id(conn, apollo_id):
                log.info(f"  Skip (exists): apollo_id={apollo_id}")
                continue

            search_email = (person.get("email") or "").strip().lower()
            if search_email and lead_exists_by_email(conn, search_email):
                log.info(f"  Skip (email exists): {search_email}")
                continue

            log.info(f"  Enriching apollo_id={apollo_id}...")
            enrich_payload = {"id": apollo_id, "reveal_personal_emails": False}
            e_status, e_body = apollo_post(config.APOLLO_ENRICH_EP, enrich_payload, log)

            if e_status == 429:
                log.warn(f"  Rate-limited during enrichment. Sleeping {config.APOLLO_RATE_SLEEP}s...")
                time.sleep(config.APOLLO_RATE_SLEEP)
                e_status, e_body = apollo_post(config.APOLLO_ENRICH_EP, enrich_payload, log)

            if e_status != 200:
                log.warn(f"  Enrichment failed (status={e_status}). Skipping person.")
                continue

            err_msg = str(e_body.get("error") or "")
            if "credit" in err_msg.lower():
                log.error(f"Apollo credit exhaustion detected: {err_msg}. Halting.")
                halt = True
                break

            enriched = e_body.get("person")
            if not enriched:
                continue

            email_addr = (enriched.get("email") or "").strip().lower()
            if "@" not in email_addr or "." not in email_addr.split("@")[-1]:
                continue

            if lead_exists_by_email(conn, email_addr):
                continue

            token = hashlib.sha256(f"{apollo_id}{email_addr}".encode() + secrets.token_bytes(16)).hexdigest()
            org = enriched.get("organization") or {}

            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO leads
                            (apollo_id, first_name, last_name, email, title, company,
                             city, state, country, employees, tracking_token, status)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'new')
                        """,
                        (
                            apollo_id,
                            (enriched.get("first_name") or "").strip(),
                            (enriched.get("last_name") or "").strip(),
                            email_addr,
                            (enriched.get("title") or "").strip(),
                            (org.get("name") or enriched.get("organization_name") or "").strip(),
                            (enriched.get("city") or "").strip(),
                            (enriched.get("state") or "").strip(),
                            (enriched.get("country") or "").strip(),
                            int(org.get("num_employees") or 0),
                            token,
                        ),
                    )
                fetched += 1
                log.info(f"  ✓ Stored lead #{fetched}: {email_addr}")
            except pymysql.err.IntegrityError:
                log.info(f"  Duplicate key on insert – skipping: {email_addr}")

        if halt:
            break

        current_page += 1
        settings_set(conn, "apollo_last_page", str(current_page))
        if fetched < config.APOLLO_DAILY_LIMIT:
            time.sleep(2)

    settings_set(conn, "apollo_last_run_date", today)
    settings_set(conn, "apollo_last_page", str(current_page))
    log.info(f"Done. Fetched {fetched} new leads (attempted={attempted}). Next page={current_page}.")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
