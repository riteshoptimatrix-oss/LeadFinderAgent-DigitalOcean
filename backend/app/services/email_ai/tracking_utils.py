"""
Email Tracking Utilities:
- Deterministic/unique tracking_id generation
- Message-ID header formatting
- Safe URL validation (anti-open-redirect / anti-XSS)
- HTML tracking pixel injection and link click wrapping
"""

import hashlib
import re
import uuid
from typing import Optional
from urllib.parse import quote, urlparse

from app.core.config import settings as app_settings

# 1x1 transparent GIF (43 bytes)
TRANSPARENT_1X1_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff"
    b"\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00"
    b"\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)

_HREF_RE = re.compile(
    r'(<a\b[^>]*?\bhref\s*=\s*)(["\'])(.*?)\2',
    re.IGNORECASE | re.DOTALL,
)


def get_tracking_base_url(request_base_url: Optional[str] = None) -> str:
    """Return normalized backend public URL without trailing slash.

    Priority:
    1. Explicit non-localhost BACKEND_PUBLIC_URL from config/.env
    2. request_base_url (from incoming HTTP Request / X-Forwarded-* headers)
    3. Non-localhost FRONTEND_BASE_URL (when API is reverse-proxied on same domain)
    4. BACKEND_PUBLIC_URL fallback (http://localhost:8000)
    """
    configured = (app_settings.BACKEND_PUBLIC_URL or "").strip().rstrip("/")
    if configured and "localhost" not in configured and "127.0.0.1" not in configured:
        return configured
    if request_base_url:
        req_clean = request_base_url.strip().rstrip("/")
        if req_clean and "localhost" not in req_clean and "127.0.0.1" not in req_clean:
            return req_clean
    frontend = (app_settings.FRONTEND_BASE_URL or "").strip().rstrip("/")
    if frontend and "localhost" not in frontend and "127.0.0.1" not in frontend:
        return frontend
    return configured or "http://localhost:8000"


def get_tracking_domain() -> str:
    """Return domain used in outgoing Message-ID headers."""
    domain = (app_settings.TRACKING_DOMAIN or "").strip()
    if domain:
        return domain
    parsed = urlparse(get_tracking_base_url())
    return parsed.hostname or "leadfinder.local"


def generate_tracking_id(user_id: str, campaign_id: str, lead_id: str, job_id: Optional[str] = None) -> str:
    """Generate a unique, collision-resistant 32-char hex tracking ID."""
    salt = job_id or uuid.uuid4().hex
    raw = f"{user_id}:{campaign_id}:{lead_id}:{salt}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def build_message_id(tracking_id: str) -> str:
    """Build RFC-5322 Message-ID header value embedding the tracking ID."""
    return f"<{tracking_id}@{get_tracking_domain()}>"


def is_safe_redirect_url(url: str) -> bool:
    """Validate that a redirect URL uses http/https and has a valid host (prevents XSS & unsafe schemes)."""
    if not url or not isinstance(url, str):
        return False
    stripped = url.strip()
    if any(ch in stripped for ch in ("\r", "\n", "\x00")):
        return False
    try:
        parsed = urlparse(stripped)
    except Exception:
        return False
    if parsed.scheme.lower() not in ("http", "https"):
        return False
    if not parsed.netloc:
        return False
    return True


def wrap_links_for_click_tracking(html: str, tracking_id: str, base_url: Optional[str] = None) -> str:
    """Rewrite http/https <a href="..."> links in HTML to route through click tracking endpoint."""
    if not html or not tracking_id:
        return html
    resolved_base = get_tracking_base_url(base_url)
    api_prefix = (app_settings.API_V1_STR or "/api/v1").rstrip("/")
    tracking_prefix = f"{resolved_base}{api_prefix}/tracking/click/{tracking_id}"

    def _replace_href(match: re.Match) -> str:
        prefix, quote_char, orig_url = match.group(1), match.group(2), match.group(3).strip()
        if not orig_url or orig_url.startswith("#"):
            return match.group(0)
        lower_url = orig_url.lower()
        if lower_url.startswith(("mailto:", "tel:", "sms:", "javascript:", "data:")):
            return match.group(0)
        if "/tracking/click/" in lower_url:
            return match.group(0)
        if not is_safe_redirect_url(orig_url):
            return match.group(0)
        encoded = quote(orig_url, safe="")
        return f"{prefix}{quote_char}{tracking_prefix}?url={encoded}{quote_char}"

    return _HREF_RE.sub(_replace_href, html)


def inject_tracking_pixel(html: str, tracking_id: str, base_url: Optional[str] = None) -> str:
    """Append an invisible 1x1 tracking pixel to HTML email body."""
    if not html or not tracking_id:
        return html
    resolved_base = get_tracking_base_url(base_url)
    api_prefix = (app_settings.API_V1_STR or "/api/v1").rstrip("/")
    pixel_url = f"{resolved_base}{api_prefix}/tracking/open/{tracking_id}"
    pixel_tag = (
        f'<img src="{pixel_url}" width="1" height="1" border="0" '
        f'style="width:1px;height:1px;opacity:0;border:0;outline:none;text-decoration:none;" alt="" />'
    )
    if "</body>" in html.lower():
        return re.sub(r"</body>", f"{pixel_tag}</body>", html, count=1, flags=re.IGNORECASE)
    return f"{html}\n{pixel_tag}"


def apply_email_tracking(
    html: str,
    tracking_id: str,
    open_tracking: bool = True,
    click_tracking: bool = True,
    base_url: Optional[str] = None,
) -> str:
    """Apply click-tracking link wrapping and open-tracking pixel to HTML content."""
    if not html:
        return html
    result = html
    if click_tracking:
        result = wrap_links_for_click_tracking(result, tracking_id, base_url=base_url)
    if open_tracking:
        result = inject_tracking_pixel(result, tracking_id, base_url=base_url)
    return result
