"""
services/mailer_engine.py - Shared Email Dispatcher using Python smtplib & imaplib.
"""
import hashlib
import html
import imaplib
import re
import secrets
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from urllib.parse import quote_plus

import config


def send_lead_email(conn, lead: dict, template_html: str, subject: str = "", cta_target: str = "") -> dict:
    """
    Send a personalized HTML + plain-text email to a lead with open/click/unsubscribe tracking.
    """
    lead_id = int(lead["id"])
    email_addr = (lead.get("email") or "").strip()
    first_name = (lead.get("first_name") or "").strip() or "there"

    lead_company_raw = (lead.get("company") or "").strip()
    if lead_company_raw == "" or re.search(r"opti\s*matrix|easy\s*msg|easy\s*message", lead_company_raw, re.I):
        company = "your business"
    else:
        company = lead_company_raw

    token = (lead.get("tracking_token") or "").strip()
    if token == "":
        raw = f"{lead_id}{email_addr}".encode("utf-8") + secrets.token_bytes(16)
        token = hashlib.sha256(raw).hexdigest()
        if lead_id > 0:
            with conn.cursor() as cur:
                cur.execute("UPDATE leads SET tracking_token = %s WHERE id = %s", (token, lead_id))

    if not cta_target:
        cta_target = "https://www.easymsgsender.com/pricing.php"
    if not subject:
        subject = "Grow Your Business with WhatsApp Marketing 🚀"

    last_name = (lead.get("last_name") or "").strip()
    full_name = f"{first_name} {last_name}".strip()
    title = (lead.get("title") or "").strip()
    city = (lead.get("city") or "").strip()
    phone = "+91 9725761116"

    unsub_url = f"{config.BASE_URL}/unsubscribe.php?t={quote_plus(token)}"
    pixel_url = f"{config.BASE_URL}/track.php?t={quote_plus(token)}&e=open"
    cta_url = f"{config.BASE_URL}/track.php?t={quote_plus(token)}&e=click&u={quote_plus(cta_target)}"

    replacements = {
        "{{first_name}}": html.escape(first_name, quote=True),
        "{{last_name}}": html.escape(last_name, quote=True),
        "{{name}}": html.escape(full_name or first_name, quote=True),
        "{{full_name}}": html.escape(full_name or first_name, quote=True),
        "{{company}}": html.escape(company, quote=True),
        "{{email}}": html.escape(email_addr, quote=True),
        "{{title}}": html.escape(title, quote=True),
        "{{city}}": html.escape(city, quote=True),
        "{{phone}}": phone,
        "{{unsub_url}}": unsub_url,
        "{{pixel_url}}": pixel_url,
        "{{cta_url}}": cta_url,
    }
    body_html = template_html
    for tag, val in replacements.items():
        body_html = body_html.replace(tag, val)

    plain_text = build_lead_plain_text(first_name, company, cta_target, unsub_url)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((config.MAIL_FROM_NAME, config.MAIL_FROM_EMAIL))
    msg["To"] = formataddr((full_name, email_addr)) if full_name else email_addr
    msg["Reply-To"] = formataddr((config.MAIL_FROM_NAME, config.MAIL_REPLY_TO))
    msg["List-Unsubscribe"] = f"<mailto:{config.MAIL_FROM_EMAIL}?subject=unsubscribe>, <{unsub_url}>"
    msg["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    msg["X-Mailer"] = "EasyMsgSender-PythonMailer/1.0"

    msg.attach(MIMEText(plain_text, "plain", "utf-8"))
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        is_local_relay = config.SMTP_HOST in ("localhost", "127.0.0.1") and config.SMTP_USER == ""
        if config.SMTP_SECURE == "ssl":
            with smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=25) as server:
                if config.SMTP_USER:
                    server.login(config.SMTP_USER, config.SMTP_PASS)
                server.sendmail(config.MAIL_FROM_EMAIL, [email_addr], msg.as_string())
        else:
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=25) as server:
                if not is_local_relay:
                    if config.SMTP_SECURE == "tls":
                        server.starttls()
                    if config.SMTP_USER:
                        server.login(config.SMTP_USER, config.SMTP_PASS)
                server.sendmail(config.MAIL_FROM_EMAIL, [email_addr], msg.as_string())

        if lead_id > 0:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE leads SET status='sent', sent_at=NOW(), updated_at=NOW() WHERE id=%s",
                    (lead_id,),
                )

        if config.SAVE_SENT_TO_IMAP:
            append_to_imap_sent(msg.as_bytes())

        return {
            "success": True,
            "lead_id": lead_id,
            "email": email_addr,
            "name": full_name or first_name,
            "company": company,
            "error": None,
        }
    except Exception as exc:
        if lead_id > 0:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE leads SET status='failed', failed_at=NOW(), updated_at=NOW() WHERE id=%s",
                    (lead_id,),
                )
        return {
            "success": False,
            "lead_id": lead_id,
            "email": email_addr,
            "name": full_name or first_name,
            "company": company,
            "error": str(exc),
        }


def append_to_imap_sent(raw_mime: bytes) -> bool:
    """Save a copy of the sent email to the IMAP Sent folder without failing SMTP delivery."""
    if not config.IMAP_USER or not config.IMAP_PASS:
        return False
    try:
        imap = imaplib.IMAP4_SSL(config.IMAP_HOST, config.IMAP_PORT)
        imap.login(config.IMAP_USER, config.IMAP_PASS)
        for folder in ("INBOX.Sent", "Sent", "INBOX/Sent", '"Sent Messages"'):
            status, _ = imap.append(folder, "\\Seen", imaplib.Time2Internaldate(time.time()), raw_mime)
            if status == "OK":
                imap.logout()
                return True
        imap.logout()
    except Exception:
        pass
    return False


def build_lead_plain_text(first_name: str, company: str, cta_url: str, unsub_url: str) -> str:
    return (
        f"Hi {first_name},\n\n"
        f"Supercharge {company}'s Growth with AI-Powered WhatsApp Marketing & Automation.\n\n"
        f"See Plans & Pricing: {cta_url}\n"
        f"Chat on WhatsApp: https://wa.me/919725761116\n"
        f"Direct Call: +91 9725761116\n\n"
        f"Best regards,\n"
        f"Optimatrix Solutions (Easy Message Sender)\n"
        f"https://www.easymsgsender.com\n\n"
        f"---\n"
        f"To unsubscribe from future emails, click here: {unsub_url}\n"
    )
