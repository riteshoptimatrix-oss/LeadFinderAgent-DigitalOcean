"""
cli/send_mails.py - Daily email sender (cron script).
Usage: python cli/send_mails.py
"""
import random
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config
from db import get_db, settings_get, settings_set
from services.logger import AppLogger
from services.mailer_engine import send_lead_email
from services.template_helpers import get_default_template


def main() -> int:
    log = AppLogger("send_mails")
    conn = get_db()

    today = date.today().isoformat()
    if settings_get(conn, "send_last_run_date") == today:
        log.info(f"Emails already sent today ({today}). Skipping.")
        conn.close()
        return 0

    active_tpl = get_default_template(conn)
    template_html = active_tpl.get("body_html") or ""
    subject = active_tpl.get("subject") or "Grow Your Business with WhatsApp Marketing 🚀"

    if not template_html:
        if not config.EMAIL_TEMPLATE_PATH.exists():
            log.error(f"email_template.html not found at {config.EMAIL_TEMPLATE_PATH}. Aborting.")
            conn.close()
            return 1
        template_html = config.EMAIL_TEMPLATE_PATH.read_text(encoding="utf-8")

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, first_name, last_name, email, company, tracking_token
            FROM leads
            WHERE status = 'new'
            ORDER BY fetched_at ASC
            LIMIT %s
            """,
            (config.SEND_DAILY_LIMIT,),
        )
        leads = cur.fetchall()

    if not leads:
        log.info("No 'new' leads to send. Exiting.")
        settings_set(conn, "send_last_run_date", today)
        conn.close()
        return 0

    log.info(f"Sending to {len(leads)} leads (limit={config.SEND_DAILY_LIMIT})...")
    sent = 0
    failed = 0

    for idx, lead in enumerate(leads):
        res = send_lead_email(conn, lead, template_html, subject)
        if res["success"]:
            sent += 1
            log.info(f"  ✓ Sent #{sent} -> {lead['email']}")
        else:
            failed += 1
            log.error(f"  ✗ Failed -> {lead['email']}: {res.get('error')}")

        if idx < len(leads) - 1:
            delay = random.randint(config.SEND_DELAY_MIN, config.SEND_DELAY_MAX)
            log.info(f"  Waiting {delay}s before next mail...")
            time.sleep(delay)

    settings_set(conn, "send_last_run_date", today)
    log.info(f"Done. Sent={sent}, Failed={failed}.")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
