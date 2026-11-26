"""
config.py - Central configuration for the Python Email Marketing Automation.
Reads overrides from environment variables if set, falling back to defaults.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PARENT_DIR = BASE_DIR.parent

# ── Apollo.io ─────────────────────────────────────────────────────────────────
APOLLO_API_KEY = os.getenv("APOLLO_API_KEY", "YOUR_APOLLO_API_KEY_HERE")
APOLLO_SEARCH_EP = "https://api.apollo.io/api/v1/mixed_people/api_search"
APOLLO_ENRICH_EP = "https://api.apollo.io/api/v1/people/match"
APOLLO_DAILY_LIMIT = int(os.getenv("APOLLO_DAILY_LIMIT", "50"))
APOLLO_PAGE_SIZE = int(os.getenv("APOLLO_PAGE_SIZE", "25"))
APOLLO_RATE_SLEEP = int(os.getenv("APOLLO_RATE_SLEEP", "65"))

# ── Database (MySQL / MariaDB via PyMySQL) ────────────────────────────────────
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_NAME = os.getenv("DB_NAME", "easymsgs_leads")
DB_USER = os.getenv("DB_USER", "easymsgs_leads")
DB_PASS = os.getenv("DB_PASS", "")
DB_CHARSET = "utf8mb4"

# ── SMTP ──────────────────────────────────────────────────────────────────────
SMTP_HOST = os.getenv("SMTP_HOST", "localhost")
SMTP_PORT = int(os.getenv("SMTP_PORT", "25"))
SMTP_SECURE = os.getenv("SMTP_SECURE", "")  # '' for local relay, 'tls' for STARTTLS, 'ssl' for SMTPS
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
MAIL_FROM_EMAIL = os.getenv("MAIL_FROM_EMAIL", "info@easymsgsender.com")
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Easy Message Sender")
MAIL_REPLY_TO = os.getenv("MAIL_REPLY_TO", "info@easymsgsender.com")

# ── Email sending limits ──────────────────────────────────────────────────────
SEND_DAILY_LIMIT = int(os.getenv("SEND_DAILY_LIMIT", "50"))
SEND_DELAY_MIN = int(os.getenv("SEND_DELAY_MIN", "20"))
SEND_DELAY_MAX = int(os.getenv("SEND_DELAY_MAX", "30"))

# ── Application base URL (no trailing slash) ──────────────────────────────────
BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:5000").rstrip("/")

# ── IMAP (for bounce detection & Sent folder sync) ────────────────────────────
IMAP_HOST = os.getenv("IMAP_HOST", "mail.easymsgsender.com")
IMAP_PORT = int(os.getenv("IMAP_PORT", "993"))
IMAP_USER = os.getenv("IMAP_USER", "info@easymsgsender.com")
IMAP_PASS = os.getenv("IMAP_PASS", "")
SAVE_SENT_TO_IMAP = os.getenv("SAVE_SENT_TO_IMAP", "true").lower() == "true"

# ── Report sync endpoint ──────────────────────────────────────────────────────
REPORT_SYNC_URL = os.getenv("REPORT_SYNC_URL", "https://your-dashboard.example.com/api/email-report")
REPORT_SYNC_SECRET = os.getenv("REPORT_SYNC_SECRET", "your_report_sync_secret_token")

# ── Flask Secret & Storage Paths ──────────────────────────────────────────────
SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "change-this-to-a-random-64-char-secret-in-production")
LOG_DIR = Path(os.getenv("LOG_DIR", str(BASE_DIR / "logs")))
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))
EMAIL_TEMPLATE_PATH = PARENT_DIR / "email_template.html"
