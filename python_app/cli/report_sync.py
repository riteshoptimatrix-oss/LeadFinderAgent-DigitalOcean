"""
cli/report_sync.py - Daily stats reporter (cron script).
Usage: python cli/report_sync.py
"""
import json
import sys
from datetime import date, datetime
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config
from db import get_db, settings_get, settings_set
from services.logger import AppLogger


def main() -> int:
    log = AppLogger("report_sync")
    conn = get_db()

    today = date.today().isoformat()
    if settings_get(conn, "last_report_date") == today:
        log.info(f"Report already posted today ({today}). Skipping.")
        conn.close()
        return 0

    log.info(f"Building report for {today}...")
    with conn.cursor() as cur:
        cur.execute("SELECT status, COUNT(*) AS cnt FROM leads GROUP BY status")
        status_rows = {r["status"]: int(r["cnt"]) for r in cur.fetchall()}

        total_leads = sum(status_rows.values())
        total_sent = status_rows.get("sent", 0)
        total_bounced = status_rows.get("bounced", 0)
        total_unsub = status_rows.get("unsubscribed", 0)
        total_new = status_rows.get("new", 0)

        cur.execute("SELECT COUNT(*) AS c FROM leads WHERE status='sent' AND DATE(sent_at) = CURDATE()")
        sent_today = int(cur.fetchone()["c"])

        cur.execute("SELECT COUNT(DISTINCT lead_id) AS c FROM email_events WHERE event_type='open' AND DATE(created_at) = CURDATE()")
        opened_today = int(cur.fetchone()["c"])

        cur.execute("SELECT COUNT(DISTINCT lead_id) AS c FROM email_events WHERE event_type='click' AND DATE(created_at) = CURDATE()")
        clicked_today = int(cur.fetchone()["c"])

        cur.execute("SELECT COUNT(*) AS c FROM email_events WHERE event_type='bounce' AND DATE(created_at) = CURDATE()")
        bounced_today = int(cur.fetchone()["c"])

        cur.execute("SELECT COUNT(*) AS c FROM email_events WHERE event_type='unsubscribe' AND DATE(created_at) = CURDATE()")
        unsub_today = int(cur.fetchone()["c"])

        cur.execute("SELECT COUNT(DISTINCT lead_id) AS c FROM email_events WHERE event_type='open'")
        total_opened = int(cur.fetchone()["c"])

        cur.execute("SELECT COUNT(DISTINCT lead_id) AS c FROM email_events WHERE event_type='click'")
        total_clicked = int(cur.fetchone()["c"])

    payload = {
        "report_date": today,
        "generated_at": datetime.now().astimezone().isoformat(),
        "today": {
            "sent": sent_today,
            "opened": opened_today,
            "clicked": clicked_today,
            "bounced": bounced_today,
            "unsubscribed": unsub_today,
            "open_rate": round(opened_today / sent_today * 100, 2) if sent_today > 0 else 0,
            "click_rate": round(clicked_today / sent_today * 100, 2) if sent_today > 0 else 0,
        },
        "all_time": {
            "total_leads": total_leads,
            "new": total_new,
            "sent": total_sent,
            "opened": total_opened,
            "clicked": total_clicked,
            "bounced": total_bounced,
            "unsubscribed": total_unsub,
            "open_rate": round(total_opened / total_sent * 100, 2) if total_sent > 0 else 0,
            "click_rate": round(total_clicked / total_sent * 100, 2) if total_sent > 0 else 0,
            "bounce_rate": round(total_bounced / total_sent * 100, 2) if total_sent > 0 else 0,
            "unsubscribe_rate": round(total_unsub / total_sent * 100, 2) if total_sent > 0 else 0,
        },
    }

    log.info("Payload:\n" + json.dumps(payload, indent=2))

    if not config.REPORT_SYNC_URL or config.REPORT_SYNC_URL == "https://your-dashboard.example.com/api/email-report":
        log.warn("REPORT_SYNC_URL is not configured. Skipping HTTP post.")
    else:
        try:
            resp = requests.post(
                config.REPORT_SYNC_URL,
                json=payload,
                timeout=20,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Authorization": f"Bearer {config.REPORT_SYNC_SECRET}",
                },
            )
            if 200 <= resp.status_code < 300:
                log.info(f"Report posted successfully. HTTP {resp.status_code}. Response: {resp.text}")
            else:
                log.error(f"Report post failed. HTTP {resp.status_code}. Response: {resp.text}")
        except Exception as exc:
            log.error(f"HTTP error posting report: {exc}")

    settings_set(conn, "last_report_date", today)
    log.info("Done.")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
