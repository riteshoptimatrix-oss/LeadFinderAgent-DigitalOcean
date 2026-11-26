import pytest
from fastapi.testclient import TestClient

from app.services.email_ai.tracking_utils import (
    apply_email_tracking,
    build_message_id,
    generate_tracking_id,
    is_safe_redirect_url,
)
from app.services.email_ai.reply_worker import _extract_body_snippet
import email


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
    html = '<html><body><p>Hello <a href="https://clientwebsite.com/demo">Demo</a> and <a href="mailto:test@example.com">Mail</a></p></body></html>'
    tid = "abc123def456"
    out = apply_email_tracking(html, tid, open_tracking=True, click_tracking=True)
    assert f"/api/v1/tracking/open/{tid}" in out
    assert f"/api/v1/tracking/click/{tid}?url=https%3A%2F%2Fclientwebsite.com%2Fdemo" in out
    assert 'href="mailto:test@example.com"' in out


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
