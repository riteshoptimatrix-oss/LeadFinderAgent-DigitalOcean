"""
services/bounce_detector.py - Reusable IMAP Bounce Detection Engine.
"""
import email
from email.header import decode_header
from datetime import datetime, timedelta
import imaplib
import re
import config


BOUNCE_SUBJECT_KEYWORDS = [
    "delivery status notification",
    "undeliverable",
    "mail delivery failed",
    "delivery failure",
    "returned mail",
    "mailer-daemon",
    "failure notice",
    "non-delivery report",
    "bounced mail",
]

BOUNCE_BODY_KEYWORDS = [
    "action: failed",
    "status: 5.",
    "final recipient",
    "final-recipient",
    "5.1.1",
    "x-failed-recipients",
    "was undeliverable",
    "does not exist",
    "no such user",
    "user unknown",
    "invalid address",
    "account has been disabled",
    "mailbox not found",
    "mailbox unavailable",
]


def run_bounce_check(conn, check_recent_messages: bool = True) -> dict:
    """Scan outreach IMAP mailbox for bounce DSNs and update leads + email_events."""
    if not config.IMAP_USER or not config.IMAP_PASS:
        return {
            "success": False,
            "checked": 0,
            "marked": 0,
            "bounced_emails": [],
            "message": "IMAP credentials (IMAP_USER / IMAP_PASS) are not configured.",
        }

    try:
        mbox = imaplib.IMAP4_SSL(config.IMAP_HOST, config.IMAP_PORT)
        mbox.login(config.IMAP_USER, config.IMAP_PASS)
        mbox.select("INBOX")
    except Exception as exc:
        return {
            "success": False,
            "checked": 0,
            "marked": 0,
            "bounced_emails": [],
            "message": f"IMAP connection failed: {exc}",
        }

    msg_ids: set[bytes] = set()
    status, data = mbox.search(None, "UNSEEN")
    if status == "OK" and data and data[0]:
        msg_ids.update(data[0].split())

    if check_recent_messages:
        since_date = (datetime.now() - timedelta(days=7)).strftime("%d-%b-%Y")
        queries = [
            f'(SINCE "{since_date}" SUBJECT "Delivery Status Notification")',
            f'(SINCE "{since_date}" SUBJECT "Undeliverable")',
            f'(SINCE "{since_date}" SUBJECT "Mail delivery failed")',
            f'(SINCE "{since_date}" SUBJECT "Failure notice")',
            f'(SINCE "{since_date}" FROM "Mail Delivery System")',
            f'(SINCE "{since_date}" FROM "MAILER-DAEMON")',
        ]
        for q in queries:
            try:
                st, qdata = mbox.search(None, q)
                if st == "OK" and qdata and qdata[0]:
                    msg_ids.update(qdata[0].split())
            except Exception:
                continue

    if not msg_ids:
        mbox.logout()
        return {
            "success": True,
            "checked": 0,
            "marked": 0,
            "bounced_emails": [],
            "message": "No bounce failure notifications found in mailbox.",
        }

    checked = 0
    marked = 0
    bounced_emails: list[str] = []

    for msg_id in sorted(msg_ids, key=lambda x: int(x)):
        checked += 1
        st, msg_data = mbox.fetch(msg_id, "(RFC822)")
        if st != "OK" or not msg_data or not isinstance(msg_data[0], tuple):
            continue

        parsed = email.message_from_bytes(msg_data[0][1])
        subject = _decode_mime_header(parsed.get("Subject", ""))
        from_sender = f"{parsed.get('From', '')} {parsed.get('Sender', '')}"
        body_text = _extract_all_parts_text(parsed)

        subject_lower = subject.lower()
        from_lower = from_sender.lower()
        body_lower = body_text.lower()

        is_bounce = any(kw in subject_lower or kw in from_lower for kw in BOUNCE_SUBJECT_KEYWORDS)
        if not is_bounce:
            is_bounce = any(kw in body_lower for kw in BOUNCE_BODY_KEYWORDS)
        if not is_bounce:
            continue

        bounced_email = extract_bounced_email_smart(body_text, subject, conn)
        if not bounced_email:
            continue

        bounced_email = bounced_email.lower()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE leads SET status = 'bounced', updated_at = NOW() WHERE email = %s AND status != 'bounced'",
                (bounced_email,),
            )
            if cur.rowcount > 0:
                cur.execute("SELECT id FROM leads WHERE email = %s LIMIT 1", (bounced_email,))
                lead_row = cur.fetchone()
                if lead_row:
                    cur.execute(
                        "INSERT INTO email_events (lead_id, event_type, created_at) VALUES (%s, 'bounce', NOW())",
                        (int(lead_row["id"]),),
                    )
                marked += 1
                bounced_emails.append(bounced_email)

        mbox.store(msg_id, "+FLAGS", "\\Seen")

    mbox.logout()
    unique_bounced = sorted(set(bounced_emails))
    msg = f"Scanned {checked} message(s). Marked {marked} new bounce(s)."
    if unique_bounced:
        msg += f" ({', '.join(unique_bounced)})"

    return {
        "success": True,
        "checked": checked,
        "marked": marked,
        "bounced_emails": unique_bounced,
        "message": msg,
    }


def _decode_mime_header(value: str) -> str:
    parts = decode_header(value)
    out = []
    for part, charset in parts:
        if isinstance(part, bytes):
            out.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            out.append(part)
    return "".join(out)


def _extract_all_parts_text(msg) -> str:
    chunks = []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            if ctype in ("text/plain", "text/html", "message/delivery-status", "text/rfc822-headers"):
                payload = part.get_payload(decode=True)
                if payload:
                    chunks.append(payload.decode(part.get_content_charset() or "utf-8", errors="replace"))
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            chunks.append(payload.decode(msg.get_content_charset() or "utf-8", errors="replace"))
    return "\n".join(chunks)


def extract_bounced_email_smart(body: str, subject: str, conn=None) -> str:
    """Multi-strategy bounced email extractor supporting common MTA DSN formats."""
    patterns = [
        r"message\s+to\s*<([^>\s]+@[^>\s]+)>\s*was\s+undeliverable",
        r"final[\s\-_]*recipient:\s*(?:rfc822;)?\s*<?([^\s;<>]+@[^\s;<>]+)>?",
        r"original[\s\-_]*recipient:\s*(?:rfc822;)?\s*<?([^\s;<>]+@[^\s;<>]+)>?",
        r"x-failed-recipients:\s*<?([^\s,;<>]+@[^\s,;<>]+)>?",
        r"undeliverable\s+(?:to\s+)?<?([^\s,;<>]+@[^\s,;<>]+)>?",
        r"could\s+not\s+be\s+delivered\s+to:?\s*<?([^\s,;<>]+@[^\s,;<>]+)>?",
    ]
    for pat in patterns:
        m = re.search(pat, body, re.I)
        if m:
            return clean_bounce_email(m.group(1))

    if conn is not None:
        candidates = re.findall(r"[\w.+-]+@[\w.-]+\.[a-z]{2,}", body, re.I)
        with conn.cursor() as cur:
            for cand in candidates:
                cand = clean_bounce_email(cand)
                if not cand or is_bounce_system_email(cand):
                    continue
                cur.execute("SELECT email FROM leads WHERE email = %s LIMIT 1", (cand,))
                row = cur.fetchone()
                if row:
                    return row["email"].lower()
    return ""


def clean_bounce_email(em: str) -> str:
    return em.strip().strip("<>;\"',").lower()


def is_bounce_system_email(em: str) -> bool:
    em = em.lower()
    if config.IMAP_USER and em == config.IMAP_USER.lower():
        return True
    if config.MAIL_FROM_EMAIL and em == config.MAIL_FROM_EMAIL.lower():
        return True
    return any(em.startswith(p) for p in ("postmaster@", "mailer-daemon@", "noreply@", "no-reply@", "root@", "admin@"))
