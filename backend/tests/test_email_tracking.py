import email
from datetime import datetime, timezone

import pytest
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.dependencies import require_email_automation_access
from app.api.routes import tracking as tracking_routes
from app.db.database import get_db
from app.models.user import UserInDB
from app.services.email_ai.bounce_detector import extract_bounced_email_from_dsn
from app.services.email_ai.reply_worker import _extract_body_snippet
from app.services.email_ai.tracking_utils import (
    apply_email_tracking,
    build_message_id,
    build_unsubscribe_url,
    generate_tracking_id,
    is_safe_redirect_url,
)


def test_tracking_id_and_message_id_uniqueness():
    t1 = generate_tracking_id("u1", "c1", "l1", "j1")
    t2 = generate_tracking_id("u1", "c1", "l2", "j2")
    assert len(t1) == 32
    assert t1 != t2
    mid = build_message_id(t1)
    assert mid.startswith(f"<{t1}@") and mid.endswith(">")


def test_safe_redirect_url_validation():
    assert is_safe_redirect_url("https://clientwebsite.com/offer?a=1")
    assert is_safe_redirect_url("http://example.org")
    assert not is_safe_redirect_url("javascript:alert(1)")
    assert not is_safe_redirect_url("data:text/html,<script>alert(1)</script>")
    assert not is_safe_redirect_url("file:///etc/passwd")
    assert not is_safe_redirect_url("https://evil.com\r\nSet-Cookie: a=1")
    assert not is_safe_redirect_url("")


def test_apply_email_tracking_pixel_and_links():
    html = '<html><body style="margin:0;"><p>Hello <a href="https://clientwebsite.com/demo">Demo</a> and <a href="mailto:test@example.com">Mail</a></p></body></html>'
    tid = "abc123def456"
    out = apply_email_tracking(html, tid, open_tracking=True, click_tracking=True)
    assert f"/api/v1/tracking/open/{tid}" in out
    assert f"/api/v1/tracking/click/{tid}?url=https%3A%2F%2Fclientwebsite.com%2Fdemo" in out
    assert 'href="mailto:test@example.com"' in out
    # Verify proxy safety: no opacity:0 and pixel placed near top of body
    assert "opacity:0" not in out
    assert "display:block" in out
    assert out.index(f"/api/v1/tracking/open/{tid}") > out.index("<body")


def test_extract_body_snippet_strips_quotes():
    raw = (
        "From: lead@example.com\r\n"
        "Subject: Re: Proposal\r\n"
        "Content-Type: text/plain; charset=utf-8\r\n\r\n"
        "Yes, please share pricing and portfolio.\r\n"
        "> On Mon, wrote:\r\n"
        "> Original email text\r\n"
    )
    msg = email.message_from_string(raw)
    snippet = _extract_body_snippet(msg)
    assert "Yes, please share pricing and portfolio." in snippet
    assert "Original email text" not in snippet

    raw2 = (
        "From: ritesh.personal.1510@gmail.com\r\n"
        "Subject: Re: Test\r\n"
        "Content-Type: text/plain; charset=utf-8\r\n\r\n"
        "Okk\r\n\r\n"
        "On Thu, 26 Nov, 2026, 11:26 am Default Relay, <test@example.com> wrote:\r\n"
        "> Hello world\r\n"
    )
    msg2 = email.message_from_string(raw2)
    snippet2 = _extract_body_snippet(msg2)
    assert snippet2 == "Okk"


def test_apply_email_tracking_unsub_placeholder_and_bounce_dsn():
    tid = "deadbeef1234567890"
    html = '<html><body><a href="{{unsub_url}}">Unsub</a></body></html>'
    out = apply_email_tracking(html, tid, open_tracking=True, click_tracking=True)
    expected_unsub = build_unsubscribe_url(tid)
    assert expected_unsub in out or "unsubscribe" in out

    dsn_body = "Final-Recipient: rfc822; bounced.user@example.com\nAction: failed\nStatus: 5.1.1"
    assert extract_bounced_email_from_dsn(dsn_body, "Delivery Status Notification") == "bounced.user@example.com"


class _FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def sort(self, field, direction):
        self._docs.sort(key=lambda d: d.get(field) or datetime.min.replace(tzinfo=timezone.utc), reverse=(direction == -1))
        return self

    def skip(self, n):
        self._docs = self._docs[n:]
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, _n):
        return list(self._docs)

    def __aiter__(self):
        self._iter = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


class _FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs if docs is not None else []

    def _matches(self, doc, query):
        for k, v in query.items():
            if k == "$or":
                if not any(self._matches(doc, sub) for sub in v):
                    return False
            elif k == "$and":
                if not all(self._matches(doc, sub) for sub in v):
                    return False
            elif isinstance(v, dict):
                val = doc.get(k)
                if "$in" in v and val not in v["$in"]:
                    return False
                if "$ne" in v and val == v["$ne"]:
                    return False
                if "$gte" in v and (val is None or val < v["$gte"]):
                    return False
                if "$lt" in v and (val is None or val >= v["$lt"]):
                    return False
            else:
                if doc.get(k) != v:
                    return False
        return True

    async def find_one(self, query, sort=None):
        for d in self.docs:
            if self._matches(d, query):
                return d
        return None

    async def count_documents(self, query):
        return sum(1 for d in self.docs if self._matches(d, query))

    def find(self, query, _proj=None):
        return _FakeCursor([d for d in self.docs if self._matches(d, query)])

    async def update_one(self, query, update, upsert=False):
        doc = await self.find_one(query)
        if not doc and upsert:
            doc = {"_id": ObjectId()}
            self.docs.append(doc)
        if not doc:
            return
        for k, v in update.get("$set", {}).items():
            doc[k] = v
        for k, v in update.get("$inc", {}).items():
            doc[k] = int(doc.get(k, 0)) + v
        for k, v in update.get("$push", {}).items():
            arr = doc.setdefault(k, [])
            items = v["$each"] if isinstance(v, dict) and "$each" in v else [v]
            arr.extend(items)


class _FakeDB:
    def __init__(self, tracking_docs=None):
        self._cols = {
            "email_tracking": _FakeCollection(tracking_docs or []),
            "leads": _FakeCollection([]),
            "email_ai_campaigns": _FakeCollection([]),
        }

    def __getitem__(self, name):
        return self._cols.setdefault(name, _FakeCollection([]))


def test_tracking_routes_end_to_end():
    now = datetime.now(timezone.utc)
    tid = "0123456789abcdef0123456789abcdef"
    fake_db = _FakeDB([
        {
            "_id": ObjectId(),
            "tracking_id": tid,
            "user_id": "user1",
            "campaign_id": "camp1",
            "campaign_name": "Test Campaign",
            "lead_id": "lead1",
            "lead_name": "Acme Corp",
            "recipient_email": "lead@acme.com",
            "subject": "Hello",
            "status": "SENT",
            "sent_at": now,
            "opened": False,
            "open_count": 0,
            "clicked": False,
            "click_count": 0,
            "clicked_urls": [],
            "replied": False,
            "bounced": False,
            "unsubscribed": False,
            "followups_paused": False,
            "event_history": [{"type": "sent", "timestamp": now.isoformat()}],
        }
    ])

    app = FastAPI()
    app.include_router(tracking_routes.router, prefix="/api/v1/tracking")
    app.dependency_overrides[get_db] = lambda: fake_db
    app.dependency_overrides[require_email_automation_access] = lambda: UserInDB(
        _id="user1",
        email="owner@example.com",
        hashed_password="x",
        role="USER",
        email_automation_access=True,
    )

    client = TestClient(app)

    # 1. Open pixel (valid + invalid token, HEAD support, legacy /track alias, and proxy duplicate debouncing)
    r_open = client.get(f"/api/v1/tracking/open/{tid}", headers={"User-Agent": "TestMailClient/1.0"})
    assert r_open.status_code == 200
    assert r_open.headers["content-type"] == "image/gif"

    # Rapid second open from email client / Google Image Proxy should be debounced and not increment open_count
    r_open_duplicate = client.get(f"/api/v1/tracking/open/{tid}", headers={"User-Agent": "GoogleImageProxy"})
    assert r_open_duplicate.status_code == 200
    assert r_open_duplicate.headers["content-type"] == "image/gif"

    r_head = client.head(f"/api/v1/tracking/open/{tid}")
    assert r_head.status_code == 200
    r_legacy = client.get("/api/v1/tracking/track?t=other_token&e=open")
    assert r_legacy.status_code == 200
    assert r_legacy.headers["content-type"] == "image/gif"
    r_open_invalid = client.get("/api/v1/tracking/open/nonexistent")
    assert r_open_invalid.status_code == 200

    # 2. Click redirect (valid + invalid URL)
    r_click = client.get(
        f"/api/v1/tracking/click/{tid}?url=https://example.com/offer",
        follow_redirects=False,
    )
    assert r_click.status_code == 302
    assert r_click.headers["location"] == "https://example.com/offer"
    r_bad_click = client.get(f"/api/v1/tracking/click/{tid}?url=javascript:alert(1)")
    assert r_bad_click.status_code == 400

    # 3. Unsubscribe GET + POST
    r_unsub_get = client.get(f"/api/v1/tracking/unsubscribe/{tid}")
    assert r_unsub_get.status_code == 200
    assert "Confirm Unsubscribe" in r_unsub_get.text

    r_unsub_post = client.post(f"/api/v1/tracking/unsubscribe/{tid}")
    assert r_unsub_post.status_code == 200
    assert "Unsubscribed Successfully" in r_unsub_post.text

    # 4. Stats, Events, Daily Report
    r_stats = client.get("/api/v1/tracking/stats")
    assert r_stats.status_code == 200
    stats = r_stats.json()
    assert stats["total_sent"] == 1
    assert stats["total_opened"] == 1
    assert stats["total_clicked"] == 1
    assert stats["total_unsubscribed"] == 1

    r_events = client.get("/api/v1/tracking/events?status=UNSUBSCRIBED")
    assert r_events.status_code == 200
    items = r_events.json()["data"]
    assert len(items) == 1
    assert items[0]["open_count"] == 1
    assert items[0]["click_count"] == 1
    assert items[0]["unsubscribed"] is True
    assert len(items[0]["event_history"]) >= 4

    r_daily = client.get("/api/v1/tracking/daily-report")
    assert r_daily.status_code == 200
    assert r_daily.json()["totals"]["sent"] == 1
    assert r_daily.json()["totals"]["opened"] == 1


def test_smtp_worker_mime_building_and_inline_cid():
    """Verify that _send_email_sync constructs RFC-compliant multipart/related MIME with CID for images."""
    import base64
    from unittest.mock import MagicMock, patch
    from app.services.email_ai.smtp_worker import EmailAIQueueWorker

    worker = EmailAIQueueWorker(db=None)

    # 1x1 png base64
    sample_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    html_with_b64 = f'<p>Hello world</p><p><img src="data:image/png;base64,{sample_b64}" alt="test" /></p>'

    smtp_profile = {
        "host": "smtp.example.com",
        "port": 587,
        "username": "user@example.com",
        "password": "app_password_1234",
        "encryption": "TLS",
        "from_email": "sender@example.com",
        "from_name": "Sender Team",
    }

    sent_payload = {}

    def mock_sendmail(sender, recipients, raw_msg):
        sent_payload["sender"] = sender
        sent_payload["recipients"] = recipients
        sent_payload["raw"] = raw_msg

    mock_smtp = MagicMock()
    mock_smtp.sendmail.side_effect = mock_sendmail

    with patch("smtplib.SMTP", return_value=mock_smtp):
        success = worker._send_email_sync(
            smtp_profile=smtp_profile,
            to_email="recipient@example.com",
            subject="Test Subject with Image",
            html=html_with_b64,
            text="",  # Text is empty, should auto-generate
            message_id="<test-msg-123@example.com>",
        )

    assert success is True
    raw_text = sent_payload.get("raw", "")

    # Headers verification
    assert "Subject: Test Subject with Image" in raw_text
    assert "From: Sender Team <sender@example.com>" in raw_text
    assert "To: recipient@example.com" in raw_text
    assert "Date:" in raw_text
    assert "MIME-Version: 1.0" in raw_text
    assert "Message-ID: <test-msg-123@example.com>" in raw_text

    # Multipart structure verification
    assert "multipart/related" in raw_text
    assert "multipart/alternative" in raw_text
    assert "text/plain" in raw_text

    # Verify decoded MIME parts
    import email
    parsed_msg = email.message_from_string(raw_text)
    assert parsed_msg.is_multipart()

    # Find plain text part and verify decoded content
    plain_part = None
    html_part = None
    for part in parsed_msg.walk():
        if part.get_content_type() == "text/plain":
            plain_part = part
        elif part.get_content_type() == "text/html":
            html_part = part
    assert plain_part is not None
    assert "Hello world" in plain_part.get_payload(decode=True).decode()

    # Inline image verification (CID replacement in HTML)
    assert html_part is not None
    assert "cid:img_" in html_part.get_payload(decode=True).decode()
    assert "Content-ID: <img_" in raw_text
    assert "image/png" in raw_text

