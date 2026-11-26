"""
EmailReplyWorker — Periodic IMAP Reply Detection & Automated Follow-Up Cancellation

Runs every ~5 minutes (300s) to:
1. Fetch recent incoming emails from connected users' IMAP inboxes.
2. Match replies against sent campaign emails using In-Reply-To, References,
   tracking Message-ID, and sender email address.
3. Prevent duplicate processing via `processed_imap_messages`.
4. Update tracking status to REPLIED, save reply details, pause/cancel pending
   automated follow-ups for that lead, and push a real-time WebSocket notification.
"""

import asyncio
import email
import imaplib
import re
import ssl
import traceback
from datetime import datetime, timedelta, timezone
from email.header import decode_header
from email.utils import parseaddr
from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.core.logger import logger
from app.core.security_crypto import decrypt_string
from app.core.websocket import manager
from app.services.email_provider_registry import detect_email_provider_async
from app.services.smtp_service import clean_app_password, get_user_smtp_config
from app.services.worker_manager import shutdown_event
from app.services.ws_manager import ws_manager

_MSG_ID_RE = re.compile(r"<([^<>\s]+)>")


def _decode_mime_header(raw_value: Optional[str]) -> str:
    if not raw_value:
        return ""
    parts = []
    for chunk, charset in decode_header(raw_value):
        if isinstance(chunk, bytes):
            try:
                parts.append(chunk.decode(charset or "utf-8", errors="replace"))
            except Exception:
                parts.append(chunk.decode("latin-1", errors="replace"))
        else:
            parts.append(str(chunk))
    return "".join(parts).strip()


def _extract_body_snippet(msg: email.message.Message, max_len: int = 300) -> str:
    """Extract a clean plain-text preview snippet from an email.message.Message."""
    text_body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp = str(part.get("Content-Disposition") or "").lower()
            if ctype == "text/plain" and "attachment" not in disp:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    text_body = payload.decode(charset, errors="replace")
                    break
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            text_body = payload.decode(charset, errors="replace")

    if not text_body:
        return ""
    # Strip quoted reply lines starting with '>' and collapse whitespace
    lines = [ln.strip() for ln in text_body.splitlines() if not ln.strip().startswith(">")]
    cleaned = " ".join(ln for ln in lines if ln)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:max_len]


def _fetch_recent_imap_messages_sync(
    host: str,
    port: int,
    encryption: str,
    username: str,
    password: str,
    since_days: int = 7,
    max_messages: int = 50,
    timeout: int = 20,
) -> List[Dict[str, Any]]:
    """Connect to IMAP, fetch recent INBOX messages, and return parsed metadata."""
    messages: List[Dict[str, Any]] = []
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

        since_date = (datetime.now(timezone.utc) - timedelta(days=since_days)).strftime("%d-%b-%Y")
        status, data = conn.search(None, f'(SINCE "{since_date}")')
        if status != "OK" or not data or not data[0]:
            return []

        msg_nums = data[0].split()
        # Process newest messages first, bounded by max_messages
        for num in reversed(msg_nums[-max_messages:]):
            try:
                f_status, f_data = conn.fetch(num, "(RFC822)")
                if f_status != "OK" or not f_data or not isinstance(f_data[0], tuple):
                    continue
                raw_bytes = f_data[0][1]
                parsed = email.message_from_bytes(raw_bytes)
                msg_id = (parsed.get("Message-ID") or "").strip()
                in_reply_to = (parsed.get("In-Reply-To") or "").strip()
                references = (parsed.get("References") or "").strip()
                _, from_addr = parseaddr(parsed.get("From") or "")
                from_addr = from_addr.strip().lower()
                subject = _decode_mime_header(parsed.get("Subject"))
                snippet = _extract_body_snippet(parsed)

                messages.append({
                    "imap_message_id": msg_id or f"uid:{num.decode(errors='ignore')}:{from_addr}:{subject[:40]}",
                    "in_reply_to": in_reply_to,
                    "references": references,
                    "from_email": from_addr,
                    "subject": subject,
                    "snippet": snippet,
                })
            except Exception as item_err:
                logger.warning(f"[EmailReplyWorker] Failed parsing IMAP message {num}: {item_err}")
                continue
    finally:
        if conn is not None:
            try:
                conn.logout()
            except Exception:
                pass
    return messages


class EmailReplyWorker:
    """Periodic background worker that polls IMAP inboxes for campaign replies."""

    def __init__(self, db, poll_interval_seconds: int = 300):
        self.db = db
        self.poll_interval_seconds = poll_interval_seconds
        self.is_running = False
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        self._task = asyncio.create_task(self._run_loop(), name="EmailAI-ReplyWorker")
        logger.info(f"EmailReplyWorker started (interval={self.poll_interval_seconds}s)")

    def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
            self._task = None
        logger.info("EmailReplyWorker stopped.")

    async def _run_loop(self):
        # Short initial delay so startup finishes cleanly before first IMAP poll
        try:
            await asyncio.sleep(15)
        except asyncio.CancelledError:
            return

        while self.is_running and not shutdown_event.is_set():
            try:
                await self.poll_all_users()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error(f"[EmailReplyWorker] Poll cycle error: {exc}\n{traceback.format_exc()}")

            try:
                await asyncio.sleep(self.poll_interval_seconds)
            except asyncio.CancelledError:
                break

    async def poll_all_users(self) -> Dict[str, Any]:
        """Check replies for all users who have active tracked emails."""
        user_ids = await self.db["email_tracking"].distinct(
            "user_id",
            {"replied": {"$ne": True}},
        )
        total_matched = 0
        users_checked = 0
        for uid in user_ids:
            if not uid:
                continue
            res = await self.check_user_replies(str(uid))
            users_checked += 1
            total_matched += int(res.get("replies_matched", 0))
        return {"users_checked": users_checked, "replies_matched": total_matched}

    async def _resolve_imap_credentials(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Resolve IMAP host, port, encryption, username, and decrypted password for a user."""
        cfg = await get_user_smtp_config(self.db, user_id, decrypt_pwd=True)
        username = (cfg.get("smtp_user") or "").strip().lower()
        password = (cfg.get("smtp_pass") or "").strip()
        imap_host = (cfg.get("imap_host") or "").strip()
        imap_port = int(cfg.get("imap_port") or 993)
        imap_enc = (cfg.get("imap_encryption") or "SSL").strip()

        if not password or not username:
            # Fallback to default email_ai_smtp profile
            prof = await self.db["email_ai_smtp"].find_one(
                {"user_id": user_id, "is_active": True},
                sort=[("is_default", -1), ("updated_at", -1)],
            )
            if prof and prof.get("password"):
                username = (prof.get("username") or "").strip().lower()
                password = decrypt_string(str(prof["password"]).strip())

        if not username or not password:
            return None

        if not imap_host:
            detected = await detect_email_provider_async(username, include_details=True)
            imap_info = (detected.get("provider") or {}).get("imap") or {}
            if imap_info.get("supported") and imap_info.get("host"):
                imap_host = imap_info["host"]
                imap_port = int(imap_info.get("port") or 993)
                imap_enc = imap_info.get("encryption") or "SSL"

        if not imap_host:
            return None

        return {
            "host": imap_host,
            "port": imap_port,
            "encryption": imap_enc,
            "username": username,
            "password": password,
        }

    async def check_user_replies(self, user_id: str) -> Dict[str, Any]:
        """Poll a single user's IMAP inbox and match replies to tracked campaign emails."""
        creds = await self._resolve_imap_credentials(user_id)
        if not creds:
            return {"status": "skipped", "reason": "IMAP credentials not configured", "replies_matched": 0}

        loop = asyncio.get_running_loop()
        try:
            incoming = await loop.run_in_executor(
                None,
                _fetch_recent_imap_messages_sync,
                creds["host"],
                creds["port"],
                creds["encryption"],
                creds["username"],
                creds["password"],
            )
        except imaplib.IMAP4.error as auth_err:
            logger.warning(f"[EmailReplyWorker] IMAP auth/protocol error for user {user_id}: {auth_err}")
            return {"status": "error", "error": f"IMAP error: {auth_err}", "replies_matched": 0}
        except Exception as conn_err:
            logger.warning(f"[EmailReplyWorker] IMAP connection failed for user {user_id}: {conn_err}")
            return {"status": "error", "error": f"IMAP connection failed: {conn_err}", "replies_matched": 0}

        matched_count = 0
        for msg in incoming:
            imap_msg_id = msg["imap_message_id"]
            # Duplicate prevention check
            already = await self.db["processed_imap_messages"].find_one(
                {"user_id": user_id, "imap_message_id": imap_msg_id}
            )
            if already:
                continue

            # Ignore messages sent by the user themselves
            if msg["from_email"] and msg["from_email"] == creds["username"]:
                await self._mark_imap_processed(user_id, imap_msg_id)
                continue

            tracked = await self._match_tracking_record(user_id, msg)
            if tracked:
                await self._handle_matched_reply(user_id, tracked, msg)
                matched_count += 1

            await self._mark_imap_processed(user_id, imap_msg_id)

        return {
            "status": "ok",
            "messages_scanned": len(incoming),
            "replies_matched": matched_count,
        }

    async def _mark_imap_processed(self, user_id: str, imap_message_id: str) -> None:
        try:
            await self.db["processed_imap_messages"].update_one(
                {"user_id": user_id, "imap_message_id": imap_message_id},
                {"$setOnInsert": {"processed_at": datetime.now(timezone.utc)}},
                upsert=True,
            )
        except Exception:
            pass

    async def _match_tracking_record(self, user_id: str, msg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Match incoming email via In-Reply-To, References, or sender email address."""
        ref_ids: List[str] = []
        for header_val in (msg.get("in_reply_to") or "", msg.get("references") or ""):
            for found in _MSG_ID_RE.findall(header_val):
                ref_ids.append(f"<{found}>")

        # 1. Exact Message-ID match in In-Reply-To / References
        if ref_ids:
            doc = await self.db["email_tracking"].find_one(
                {"user_id": user_id, "message_id": {"$in": ref_ids}},
                sort=[("sent_at", -1)],
            )
            if doc:
                return doc

            # 2. Match embedded tracking_id prefix (<tracking_id@domain>)
            candidate_tids = [rid.strip("<>").split("@")[0] for rid in ref_ids if "@" in rid]
            if candidate_tids:
                doc = await self.db["email_tracking"].find_one(
                    {"user_id": user_id, "tracking_id": {"$in": candidate_tids}},
                    sort=[("sent_at", -1)],
                )
                if doc:
                    return doc

        # 3. Fallback: sender email match for most recent unreplied tracked email
        from_email = (msg.get("from_email") or "").strip().lower()
        if from_email:
            doc = await self.db["email_tracking"].find_one(
                {"user_id": user_id, "recipient_email": from_email, "replied": {"$ne": True}},
                sort=[("sent_at", -1)],
            )
            if doc:
                return doc

        return None

    async def _handle_matched_reply(
        self,
        user_id: str,
        tracked: Dict[str, Any],
        msg: Dict[str, Any],
    ) -> None:
        """Update tracking, lead status, pause pending follow-ups, and broadcast WS event."""
        now = datetime.now(timezone.utc)
        lead_id = str(tracked.get("lead_id") or "")
        campaign_id = str(tracked.get("campaign_id") or "")
        lead_name = tracked.get("lead_name") or tracked.get("recipient_email") or "Lead"

        # 1. Update email_tracking record
        await self.db["email_tracking"].update_one(
            {"_id": tracked["_id"]},
            {
                "$set": {
                    "status": "REPLIED",
                    "replied": True,
                    "replied_at": now,
                    "reply_subject": msg.get("subject") or "",
                    "reply_snippet": msg.get("snippet") or "",
                    "reply_from": msg.get("from_email") or "",
                    "reply_message_id": msg.get("imap_message_id") or "",
                    "followups_paused": True,
                    "updated_at": now,
                },
                "$push": {
                    "event_history": {
                        "$each": [{
                            "type": "reply",
                            "timestamp": now.isoformat(),
                            "details": msg.get("subject") or "Reply received",
                        }],
                        "$slice": -100,
                    }
                },
            },
        )

        # 2. Update lead status in leads collection
        if ObjectId.is_valid(lead_id):
            await self.db["leads"].update_one(
                {"_id": ObjectId(lead_id)},
                {"$set": {"email_status": "REPLIED", "replied_at": now}},
            )

        # 3. Immediately pause/cancel any pending automated follow-ups for this lead
        cancel_res = await self.db["email_ai_queue"].update_many(
            {
                "user_id": user_id,
                "lead_id": lead_id,
                "status": {"$in": ["Pending", "Waiting"]},
            },
            {
                "$set": {
                    "status": "Cancelled",
                    "error_message": "Paused automatically: Lead replied",
                    "updated_at": now,
                },
                "$push": {"logs": f"Cancelled automatically at {now.isoformat()} due to lead reply"},
            },
        )

        logger.info(
            f"[EmailReplyWorker] Reply matched for lead {lead_id} ({tracked.get('recipient_email')}); "
            f"paused {cancel_res.modified_count} pending follow-up(s)."
        )

        # 4. Real-time WebSocket notification
        payload = {
            "type": "email_replied",
            "event_type": "email_replied",
            "tracking_id": tracked.get("tracking_id"),
            "user_id": user_id,
            "campaign_id": campaign_id,
            "lead_id": lead_id,
            "lead_name": lead_name,
            "email": tracked.get("recipient_email"),
            "reply_subject": msg.get("subject") or "",
            "reply_snippet": msg.get("snippet") or "",
            "followups_paused": cancel_res.modified_count,
            "message": f"{lead_name} has replied to your email!",
            "timestamp": now.isoformat(),
        }
        try:
            if campaign_id:
                await ws_manager.broadcast_to_job(campaign_id, payload)
            await ws_manager.broadcast(payload)
            await manager.broadcast(payload)
        except Exception as ws_err:
            logger.warning(f"[EmailReplyWorker] WebSocket broadcast failed: {ws_err}")
