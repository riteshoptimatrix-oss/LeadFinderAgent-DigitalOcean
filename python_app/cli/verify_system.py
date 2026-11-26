"""
cli/verify_system.py - Diagnostics & Verification Script.
Usage:
    python cli/verify_system.py
    python cli/verify_system.py send your_email@gmail.com
"""
import imaplib
import smtplib
import sys
from datetime import datetime
from email.mime.text import MIMEText
from email.utils import formataddr
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config
from db import get_db


def main() -> int:
    print("\n=========================================================")
    print("    EASY MESSAGE SENDER (PYTHON) – SYSTEM DIAGNOSTICS    ")
    print("=========================================================\n")

    print("[1/4] Checking Database Connection...")
    try:
        conn = get_db()
        print(f"  ✓ Connected to database '{config.DB_NAME}' successfully.")
        with conn.cursor() as cur:
            for tbl in ("leads", "email_events", "settings", "admin_users", "login_attempts", "email_templates"):
                cur.execute("SHOW TABLES LIKE %s", (tbl,))
                if cur.fetchone():
                    cur.execute(f"SELECT COUNT(*) AS c FROM `{tbl}`")
                    print(f"  ✓ Table `{tbl}` exists ({cur.fetchone()['c']} rows).")
                else:
                    print(f"  ✗ Table `{tbl}` is MISSING!")
        conn.close()
    except Exception as exc:
        print(f"  ✗ DB Connection FAILED: {exc}")

    print("\n[2/4] Checking Apollo.io API Key...")
    if not config.APOLLO_API_KEY or config.APOLLO_API_KEY == "YOUR_APOLLO_API_KEY_HERE":
        print("  ✗ APOLLO_API_KEY is not configured.")
    else:
        try:
            r = requests.get(
                "https://api.apollo.io/api/v1/auth/health",
                timeout=10,
                headers={"X-Api-Key": config.APOLLO_API_KEY},
            )
            print(f"  {'✓' if r.status_code == 200 else '✗'} Apollo auth health HTTP {r.status_code}")
        except Exception as exc:
            print(f"  ✗ Apollo check error: {exc}")

    print("\n[3/4] Checking IMAP Mailbox...")
    try:
        mbox = imaplib.IMAP4_SSL(config.IMAP_HOST, config.IMAP_PORT)
        mbox.login(config.IMAP_USER, config.IMAP_PASS)
        st, data = mbox.select("INBOX")
        print(f"  ✓ IMAP Connected! INBOX messages: {data[0].decode() if data and data[0] else '?'}")
        mbox.logout()
    except Exception as exc:
        print(f"  ✗ IMAP Connection Failed: {exc}")

    print("\n[4/4] Checking SMTP & Outgoing Mail...")
    if len(sys.argv) >= 3 and sys.argv[1] == "send":
        target = sys.argv[2]
        msg = MIMEText(f"Test verification from Easy Message Sender (Python) at {datetime.now()}.", "plain", "utf-8")
        msg["Subject"] = "Easy Message Sender – Python Test Email ✓"
        msg["From"] = formataddr((config.MAIL_FROM_NAME, config.MAIL_FROM_EMAIL))
        msg["To"] = target
        try:
            if config.SMTP_SECURE == "ssl":
                with smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as s:
                    if config.SMTP_USER:
                        s.login(config.SMTP_USER, config.SMTP_PASS)
                    s.sendmail(config.MAIL_FROM_EMAIL, [target], msg.as_string())
            else:
                with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as s:
                    if config.SMTP_SECURE == "tls":
                        s.starttls()
                    if config.SMTP_USER:
                        s.login(config.SMTP_USER, config.SMTP_PASS)
                    s.sendmail(config.MAIL_FROM_EMAIL, [target], msg.as_string())
            print(f"  ✓ TEST EMAIL SENT SUCCESSFULLY to {target}!")
        except Exception as exc:
            print(f"  ✗ Test email send FAILED: {exc}")
    else:
        print("  Run `python cli/verify_system.py send your_email@example.com` to test SMTP delivery.")

    print("\n=========================================================\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
