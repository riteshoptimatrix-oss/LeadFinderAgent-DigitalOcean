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

from fastapi import Request

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

# In-memory storage for last detected active public base URL from incoming requests
_DETECTED_PUBLIC_BASE_URL: Optional[str] = None
PRODUCTION_DOMAIN_FALLBACK: str = "https://leadfinder.easymsgsender.com"


def record_detected_public_base_url(url: Optional[str]) -> None:
    """Record a known public base URL observed from an active request."""
    global _DETECTED_PUBLIC_BASE_URL
    if not url or not isinstance(url, str):
        return
    clean = url.strip().rstrip("/")
    if clean.startswith("http://") or clean.startswith("https://"):
        try:
            parsed = urlparse(clean)
            host = (parsed.hostname or "").lower()
            if host and host not in ("localhost", "127.0.0.1", "0.0.0.0", "testserver"):
                _DETECTED_PUBLIC_BASE_URL = clean
        except Exception:
            pass


def resolve_request_base_url(request: Request) -> str:
    """Intelligently detect the real external base URL from incoming HTTP Request headers.

    Checks (in priority order):
    1. Origin header (e.g. https://leadfinder.easymsgsender.com)
    2. Referer header (e.g. https://leadfinder.easymsgsender.com/dashboard/email-ai)
    3. X-Forwarded-Proto + X-Forwarded-Host
    4. Host header (if not localhost)
    5. Fallback to get_tracking_base_url()
    """
    if not request:
        return get_tracking_base_url()

    # 1. Origin header
    origin = (request.headers.get("origin") or "").strip().rstrip("/")
    if origin and "localhost" not in origin and "127.0.0.1" not in origin:
        record_detected_public_base_url(origin)
        return origin

    # 2. Referer header
    referer = (request.headers.get("referer") or "").strip()
    if referer:
        try:
            parsed = urlparse(referer)
            if parsed.scheme and parsed.netloc and "localhost" not in parsed.netloc and "127.0.0.1" not in parsed.netloc:
                detected = f"{parsed.scheme}://{parsed.netloc}"
                record_detected_public_base_url(detected)
                return detected
        except Exception:
            pass

    # 3. X-Forwarded-Proto + X-Forwarded-Host
    fwd_proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
    fwd_host = (request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    if fwd_host and "localhost" not in fwd_host and "127.0.0.1" not in fwd_host:
        detected = f"{fwd_proto}://{fwd_host}"
        record_detected_public_base_url(detected)
        return detected

    # 4. Host header
    host_hdr = (request.headers.get("host") or "").split(",")[0].strip()
    if host_hdr and "localhost" not in host_hdr and "127.0.0.1" not in host_hdr:
        detected = f"{fwd_proto}://{host_hdr}"
        record_detected_public_base_url(detected)
        return detected

    # 5. Fall back to resolved tracking base URL
    return get_tracking_base_url(str(request.base_url).rstrip("/") if request.base_url else None)


def get_tracking_base_url(request_base_url: Optional[str] = None) -> str:
    """Return normalized backend public URL without trailing slash.

    Priority:
    1. Explicit non-localhost BACKEND_PUBLIC_URL from config/.env
    2. request_base_url (if not localhost)
    3. Last detected public base URL observed from authenticated frontend requests
    4. Non-localhost FRONTEND_BASE_URL (when API is reverse-proxied on same domain)
    5. Production domain fallback (https://leadfinder.easymsgsender.com)
    6. BACKEND_PUBLIC_URL fallback (http://localhost:8000 only in local testing)
    """
    configured = (app_settings.BACKEND_PUBLIC_URL or "").strip().rstrip("/")
    if configured and "localhost" not in configured and "127.0.0.1" not in configured:
        return configured

    if request_base_url:
        req_clean = request_base_url.strip().rstrip("/")
        if req_clean and "localhost" not in req_clean and "127.0.0.1" not in req_clean:
            record_detected_public_base_url(req_clean)
            return req_clean

    if _DETECTED_PUBLIC_BASE_URL:
        return _DETECTED_PUBLIC_BASE_URL

    frontend = (app_settings.FRONTEND_BASE_URL or "").strip().rstrip("/")
    if frontend and "localhost" not in frontend and "127.0.0.1" not in frontend:
        return frontend

    # If running in production or production domain fallback
    if getattr(app_settings, "ENVIRONMENT", "").lower() != "development":
        return PRODUCTION_DOMAIN_FALLBACK

    # In development, prefer explicit request_base_url even if localhost (for testclient / local tests)
    if request_base_url:
        return request_base_url.strip().rstrip("/")

    return configured or PRODUCTION_DOMAIN_FALLBACK


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


def get_client_ip_from_request(request: Request) -> str:
    """Extract real client IP from proxy headers or socket connection."""
    for hdr in ("cf-connecting-ip", "x-forwarded-for", "x-real-ip"):
        val = request.headers.get(hdr, "")
        if val:
            return val.split(",")[0].strip()[:64]
    if request.client and request.client.host:
        return str(request.client.host)[:64]
    return ""


def build_unsubscribe_url(tracking_id: str, base_url: Optional[str] = None) -> str:
    """Build public unsubscribe URL for a tracked email."""
    resolved_base = get_tracking_base_url(base_url)
    api_prefix = (app_settings.API_V1_STR or "/api/v1").rstrip("/")
    return f"{resolved_base}{api_prefix}/tracking/unsubscribe/{tracking_id}"


def build_pixel_url(tracking_id: str, base_url: Optional[str] = None) -> str:
    """Build public 1x1 open-tracking pixel URL."""
    resolved_base = get_tracking_base_url(base_url)
    api_prefix = (app_settings.API_V1_STR or "/api/v1").rstrip("/")
    return f"{resolved_base}{api_prefix}/tracking/open/{tracking_id}"


def inject_tracking_pixel(html: str, tracking_id: str, base_url: Optional[str] = None) -> str:
    """Inject an invisible, proxy-compliant 1x1 tracking pixel into HTML email body."""
    if not html or not tracking_id:
        return html
    pixel_url = build_pixel_url(tracking_id, base_url=base_url)
    if pixel_url in html:
        return html
    # Standard email-safe 1x1 tracking pixel:
    # Important: Do NOT use opacity:0, display:none, or visibility:hidden because
    # Gmail's Image Proxy and spam filters strip/block images with hidden styling.
    pixel_tag = (
        f'<img src="{pixel_url}" width="1" height="1" border="0" alt="" '
        f'style="display:block;width:1px;min-width:1px;height:1px;min-height:1px;border:0;outline:none;padding:0;margin:0;" />'
    )
    # Inject immediately after opening <body...> so it loads immediately even on long/clipped messages
    body_match = re.search(r"<body\b[^>]*>", html, re.IGNORECASE)
    if body_match:
        idx = body_match.end()
        return f"{html[:idx]}\n{pixel_tag}\n{html[idx:]}"
    if "</body>" in html.lower():
        return re.sub(r"</body>", f"{pixel_tag}\n</body>", html, count=1, flags=re.IGNORECASE)
    return f"{pixel_tag}\n{html}"


def apply_email_tracking(
    html: str,
    tracking_id: str,
    open_tracking: bool = True,
    click_tracking: bool = True,
    base_url: Optional[str] = None,
) -> str:
    """Apply tracking placeholders, click-tracking link wrapping, and open-tracking pixel to HTML."""
    if not html:
        return html
    result = html
    if tracking_id:
        unsub_url = build_unsubscribe_url(tracking_id, base_url=base_url)
        pixel_url = build_pixel_url(tracking_id, base_url=base_url)
        result = result.replace("{{unsub_url}}", unsub_url)
        result = result.replace("{{pixel_url}}", pixel_url if open_tracking else "")
    if click_tracking:
        result = wrap_links_for_click_tracking(result, tracking_id, base_url=base_url)
    if open_tracking:
        result = inject_tracking_pixel(result, tracking_id, base_url=base_url)
    return result
