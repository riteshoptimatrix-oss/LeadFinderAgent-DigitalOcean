"""
EmailBounceDetector — IMAP Bounce Detection Engine (adapted for async MongoDB & multi-user IMAP).

Scans a user's configured IMAP INBOX for Delivery Status Notification (DSN) / bounce messages,
extracts the bounced recipient email address, and marks matching `email_tracking` records
as `BOUNCED` while pausing automated follow-ups and broadcasting WebSocket notifications.
"""

import asyncio
import email
import imaplib
import re
import ssl
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from typing import Any, Dict, List, Optional, Set

from app.core.logger import logger
from app.core.websocket import manager
from app.services.email_ai.reply_worker import EmailReplyWorker
from app.services.smtp_service import clean_app_password
from app.services.ws_manager import ws_manager

BOUNCE_SUBJECT_KEYWORDS = (
    "delivery status notification",
    "undeliverable",
    "mail delivery failed",
    "delivery failure",
    "returned mail",
    "mailer-daemon",
    "failure notice",
    "non-delivery report",
    "bounced mail",
)

BOUNCE_BODY_KEYWORDS = (
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
)

_BOUNCE_EMAIL_PATTERNS = (
    r"message\s+to\s*<([^>\s]+@[^>\s]+)>\s*was\s+undeliverable",
    r"final[\s\-_]*recipient:\s*(?:rfc822;)?\s*<?([^\s;<>]+@[^\s;<>]+)>?",
    r"original[\s\-_]*recipient:\s*(?:rfc822;)?\s*<?([^\s;<>]+@[^\s;<>]+)>?",
    r"x-failed-recipients:\s*<?([^\s,;<>]+@[^\s,;<>]+)>?",
    r"undeliverable\s+(?:to\s+)?<?([^\s,;<>]+@[^\s,;<>]+)>?",
    r"could\s+not\s+be\s+delivered\s+to:?\s*<?([^\s,;<>]+@[^\s,;<>]+)>?",
)


def _decode_mime_header(value: str) -> str:
    if not value:
        return ""
    parts = []
    for part, charset in decode_header(value):
        if isinstance(part, bytes):
            parts.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            parts.append(str(part))
    return "".join(parts)


def _extract_all_parts_text(msg: email.message.Message) -> str:
    chunks: List[str] = []
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


def _clean_bounce_email(addr: str) -> str:
    return addr.strip().strip("<>;\"',").lower()


def _is_system_email(addr: str, imap_user: str) -> bool:
    em = addr.lower()
    if imap_user and em == imap_user.lower():
        return True
    return any(
        em.startswith(prefix)
        for prefix in ("postmaster@", "mailer-daemon@", "noreply@", "no-reply@", "root@", "admin@")
    )


def extract_bounced_email_from_dsn(body: str, subject: str, imap_user: str = "") -> str:
    """Extract bounced recipient email from DSN body/subject using multi-strategy regexes."""
    combined = f"{subject}\n{body}"
    for pat in _BOUNCE_EMAIL_PATTERNS:
        m = re.search(pat, combined, re.IGNORECASE)
        if m:
            cand = _clean_bounce_email(m.group(1))
            if cand and "@" in cand and not _is_system_email(cand, imap_user):
                return cand
    return ""


def _fetch_bounce_candidates_sync(
    host: str,
    port: int,
    encryption: str,
    username: str,
    password: str,
    since_days: int = 7,
    max_messages: int = 100,
    timeout: int = 20,
) -> List[Dict[str, Any]]:
    """Connect to IMAP INBOX and fetch recent DSN / bounce candidate messages."""
    results: List[Dict[str, Any]] = []
    conn = None
    try:
        enc = (encryption or "SSL").upper().strip()
        context = ssl.create_default_context()
        if enc in ("SSL", "TLS_IMPLICIT") or port == 993:
            conn = imaplib.IMAP4_SSL(host, port, ssl_context=context, timeout=timeout)
        else:
            conn = imaplib.IMAP4(host, port, timeout=timeout)
            if enc in ("TLS", "STARTTLS"):
                conn.starttls(ssl_context=context)

        clean_pwd = clean_app_password(password, host)
        conn.login(username, clean_pwd or password)
        conn.select("INBOX", readonly=True)

        msg_ids: Set[bytes] = set()
        st_unseen, data_unseen = conn.search(None, "UNSEEN")
        if st_unseen == "OK" and data_unseen and data_unseen[0]:
            msg_ids.update(data_unseen[0].split())

        since_date = (datetime.now(timezone.utc) - timedelta(days=since_days)).strftime("%d-%b-%Y")
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
                st_q, qdata = conn.search(None, q)
                if st_q == "OK" and qdata and qdata[0]:
                    msg_ids.update(qdata[0].split())
            except Exception:
                continue

        if not msg_ids:
            return []

        sorted_ids = sorted(msg_ids, key=lambda x: int(x))[-max_messages:]
        for msg_id in sorted_ids:
            try:
                st_f, msg_data = conn.fetch(msg_id, "(RFC822)")
                if st_f != "OK" or not msg_data or not isinstance(msg_data[0], tuple):
                    continue
                parsed = email.message_from_bytes(msg_data[0][1])
                subject = _decode_mime_header(parsed.get("Subject", ""))
                from_sender = f"{parsed.get('From', '')} {parsed.get('Sender', '')}"
                body_text = _extract_all_parts_text(parsed)
                imap_msg_id = (parsed.get("Message-ID") or "").strip() or f"bounce:{msg_id.decode(errors='ignore')}:{subject[:40]}"

                subj_l = subject.lower()
                from_l = from_sender.lower()
                body_l = body_text.lower()

                is_bounce = any(kw in subj_l or kw in from_l for kw in BOUNCE_SUBJECT_KEYWORDS)
                if not is_bounce:
                    is_bounce = any(kw in body_l for kw in BOUNCE_BODY_KEYWORDS)
                if not is_bounce:
                    continue

                bounced_email = extract_bounced_email_from_dsn(body_text, subject, username)
                candidate_emails: List[str] = []
                if not bounced_email:
                    for cand in re.findall(r"[\w.+-]+@[\w.-]+\.[a-z]{2,}", body_text, re.IGNORECASE):
                        cleaned = _clean_bounce_email(cand)
                        if cleaned and not _is_system_email(cleaned, username) and cleaned not in candidate_emails:
                            candidate_emails.append(cleaned)

                results.append({
                    "imap_message_id": imap_msg_id,
                    "subject": subject,
                    "bounced_email": bounced_email,
                    "candidate_emails": candidate_emails[:20],
                })
            except Exception as item_err:
                logger.warning(f"[EmailBounceDetector] Failed parsing IMAP message {msg_id}: {item_err}")
                continue
    finally:
        if conn is not None:
            try:
                conn.logout()
            except Exception:
                pass
    return results


class EmailBounceDetector:
    """Async bounce detection service backed by MongoDB & user IMAP settings."""

    def __init__(self, db):
        self.db = db

    async def check_user_bounces(self, user_id: str) -> Dict[str, Any]:
        reply_helper = EmailReplyWorker(self.db)
        creds = await reply_helper._resolve_imap_credentials(user_id)
        if not creds:
            return {
                "status": "skipped",
                "reason": "IMAP/SMTP credentials not configured.",
                "messages_scanned": 0,
                "bounces_matched": 0,
                "bounced_emails": [],
            }

        loop = asyncio.get_running_loop()
        try:
            candidates = await loop.run_in_executor(
                None,
                _fetch_bounce_candidates_sync,
                creds["host"],
                creds["port"],
                creds["encryption"],
                creds["username"],
                creds["password"],
            )
        except Exception as exc:
            logger.error(f"[EmailBounceDetector] IMAP error for user {user_id}: {exc}")
            return {
                "status": "error",
                "error": str(exc),
                "messages_scanned": 0,
                "bounces_matched": 0,
                "bounced_emails": [],
            }

        bounces_matched = 0
        bounced_emails: List[str] = []
        now = datetime.now(timezone.utc)

        for item in candidates:
            imap_msg_id = item["imap_message_id"]
            already = await self.db["processed_imap_messages"].find_one({
                "user_id": user_id,
                "imap_message_id": imap_msg_id,
                "kind": "bounce",
            })
            if already:
                continue

            target_email = item["bounced_email"]
            if not target_email and item["candidate_emails"]:
                matched_doc = await self.db["email_tracking"].find_one({
                    "user_id": user_id,
                    "recipient_email": {"$in": item["candidate_emails"]},
                })
                if matched_doc:
                    target_email = str(matched_doc.get("recipient_email") or "").lower()

            if not target_email:
                continue

            tracking_docs = await self.db["email_tracking"].find({
                "user_id": user_id,
                "recipient_email": target_email,
                "bounced": {"$ne": True},
            }).to_list(50)

            for doc in tracking_docs:
                await self.db["email_tracking"].update_one(
                    {"_id": doc["_id"]},
                    {
                        "$set": {
                            "bounced": True,
                            "bounced_at": now,
                            "status": "BOUNCED",
                            "followups_paused": True,
                            "updated_at": now,
                        },
                        "$push": {
                            "event_history": {
                                "$each": [{
                                    "type": "bounce",
                                    "timestamp": now.isoformat(),
                                    "details": f"DSN bounce detected ({item['subject'][:120]})",
                                }],
                                "$slice": -100,
                            }
                        },
                    },
                )
                bounces_matched += 1
                if target_email not in bounced_emails:
                    bounced_emails.append(target_email)

                payload = {
                    "type": "email_bounced",
                    "event_type": "email_bounced",
                    "tracking_id": doc.get("tracking_id"),
                    "user_id": user_id,
                    "campaign_id": doc.get("campaign_id"),
                    "lead_id": doc.get("lead_id"),
                    "lead_name": doc.get("lead_name"),
                    "email": target_email,
                    "timestamp": now.isoformat(),
                }
                try:
                    if doc.get("campaign_id"):
                        await ws_manager.broadcast_to_job(doc["campaign_id"], payload)
                    await ws_manager.broadcast(payload)
                    await manager.broadcast(payload)
                except Exception:
                    pass

            await self.db["processed_imap_messages"].update_one(
                {"user_id": user_id, "imap_message_id": imap_msg_id, "kind": "bounce"},
                {
                    "$set": {
                        "user_id": user_id,
                        "imap_message_id": imap_msg_id,
                        "kind": "bounce",
                        "bounced_email": target_email,
                        "processed_at": now,
                    }
                },
                upsert=True,
            )

        return {
            "status": "ok",
            "messages_scanned": len(candidates),
            "bounces_matched": bounces_matched,
            "bounced_emails": sorted(bounced_emails),
        }
