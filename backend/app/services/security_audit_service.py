"""Enterprise Website Security Audit Engine
==========================================
A professional-grade security audit that runs entirely on already-crawled
page data (URL scheme, response headers, rendered HTML). It never performs
extra network requests and never re-crawls — reusing the HTTP responses the
crawler already collected.

Audit sections (spec-aligned):
  - SSL            (HTTPS enabled, cert valid/expiry/issuer/version/days,
                    self-signed, weak, HTTP redirect, mixed content)
  - Headers        (CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
                    Referrer-Policy, Permissions-Policy, COOP, CORP, cache)
  - Cookies        (secure, HttpOnly, SameSite, session, insecure)
  - Server         (Server / X-Powered-By exposure, PHP/ASP.NET/Apache/Nginx
                    version leaks, information leakage)
  - Forms          (CSRF, autocomplete on sensitive fields, password fields,
                    HTTPS submit, captcha protection)
  - Content        (mixed content, unsafe resources, external scripts,
                    unsafe iframes)
  - Authentication (login, password reset, registration, admin pages)
  - Domain         (DNSSEC signing, WHOIS: registrar, domain expiry, days
                    remaining, nameservers)

Guarantees:
  - NEVER raises — any failure returns a partial audit so AI analysis continues.
  - The core audit performs NO network I/O — it purely analyzes the passed
    page documents. The only network work is the optional Domain Security
    section: bounded (≤4s per lookup, cached 1h), run off the event loop via
    ``asyncio.to_thread``, and skipped entirely on any failure.
  - Modular per-category analyzers so failures are isolated per category.
  - Every step is logged so the pipeline is fully auditable.
"""
import asyncio
import logging
import re
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from app.models.security_audit import (
    AuthenticationAudit,
    ContentAudit,
    CookieAudit,
    DomainAudit,
    FormAudit,
    SecurityAuditResultCreate,
    SecurityHeaderAudit,
    SecurityHeaderItem,
    SecurityRecommendation,
    ServerAudit,
    SSLAudit,
)
from app.services.safe_scoring import safe_score

logger = logging.getLogger(__name__)

GREEN = "#10b981"
BLUE = "#3b82f6"
ORANGE = "#f59e0b"
RED = "#ef4444"
CRITICAL = "#7f1d1d"

_HEADER_CHECKS = [
    ("content-security-policy", "CSP"),
    ("strict-transport-security", "HSTS"),
    ("x-frame-options", "X-Frame-Options"),
    ("x-content-type-options", "X-Content-Type-Options"),
    ("referrer-policy", "Referrer-Policy"),
    ("permissions-policy", "Permissions-Policy"),
    ("cross-origin-opener-policy", "Cross-Origin-Opener-Policy"),
    ("cross-origin-resource-policy", "Cross-Origin-Resource-Policy"),
    ("cache-control", "Cache-Control"),
]

_HEADER_IMPORTANCE = {
    "content-security-policy": 25,
    "strict-transport-security": 20,
    "x-frame-options": 10,
    "x-content-type-options": 10,
    "referrer-policy": 5,
    "permissions-policy": 5,
    "cross-origin-opener-policy": 5,
    "cross-origin-resource-policy": 5,
    "cache-control": 5,
}

_CSRF_NAMES = (
    "csrf", "csrf_token", "_token", "csrfmiddlewaretoken", "authenticity_token",
    "__requestverificationtoken", "token", "_csrf", "xsrf", "xsrf-token",
    "csrf-token",
)

_LOGIN_HINTS = ("login", "sign-in", "signin", "log-in", "log_in", "/login", "auth")
_RESET_HINTS = ("forgot", "reset-password", "forgot-password", "password/reset", "password_reset")
_REGISTER_HINTS = ("sign-up", "signup", "register", "create-account", "create_account")
_ADMIN_HINTS = ("/admin", "/wp-admin", "/administrator", "/dashboard", "/control-panel", "/manage")

# Fallback WHOIS servers per TLD, used when the IANA bootstrap referral fails.
_WHOIS_FALLBACK = {
    "com": "whois.verisign-grs.com",
    "net": "whois.verisign-grs.com",
    "org": "whois.pir.org",
    "info": "whois.afilias.net",
    "biz": "whois.nic.biz",
    "us": "whois.nic.us",
    "io": "whois.nic.io",
    "co": "whois.nic.co",
    "me": "whois.nic.me",
    "ai": "whois.nic.ai",
    "app": "whois.nic.google",
    "dev": "whois.nic.google",
    "page": "whois.nic.google",
    "xyz": "whois.nic.xyz",
    "uk": "whois.nic.uk",
    "ca": "whois.cira.ca",
    "de": "whois.denic.de",
}

# Two-part country-code top-level suffixes; a host that ends in one keeps
# three labels (e.g. blog.example.co.uk → example.co.uk).
_TWO_PART_SUFFIXES = {
    "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "sch.uk",
    "com.au", "net.au", "org.au", "edu.au", "gov.au", "asn.au", "id.au",
    "co.nz", "net.nz", "org.nz", "govt.nz",
    "co.jp", "ne.jp", "or.jp", "ac.jp", "go.jp",
    "co.in", "net.in", "org.in", "gen.in", "firm.in", "ind.in",
    "co.za", "org.za", "net.za", "gov.za",
    "com.br", "net.br", "org.br", "gov.br",
    "com.mx", "org.mx", "net.mx",
    "com.ar", "org.ar", "net.ar",
    "com.co", "net.co",
    "com.cn", "net.cn", "org.cn", "gov.cn",
    "com.sg", "com.my", "com.ph", "com.tr",
    "co.kr", "or.kr", "ne.kr", "re.kr",
    "com.tw", "com.hk", "com.ng", "com.ke",
    "com.eg", "com.sa", "com.ae",
}

# DNSSEC + WHOIS lookups are cached per-domain for an hour so repeated audits
# of the same lead never re-query DNS / port 43.
_DOMAIN_CACHE: Dict[str, Tuple[float, Optional[Dict[str, Any]]]] = {}
_DOMAIN_CACHE_TTL = 3600.0
_DOMAIN_CACHE_LOCK = threading.Lock()

_DNS_TIMEOUT = 3.0        # seconds per DNS resolver query
_WHOIS_TIMEOUT = 3.0      # seconds per socket read
_DOMAIN_LOOKUP_TIMEOUT = 4.0  # seconds budget for each lookup before giving up


def _grade(score: int) -> str:
    """A/B/C/D/F letter grade for a 0-100 security score."""
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


def _clamp(value: int, low: int = 0, high: int = 100) -> int:
    return max(low, min(high, value))


def _normalize_headers(headers: Any) -> Dict[str, str]:
    if not headers:
        return {}
    if isinstance(headers, str):
        return {}
    normalized: Dict[str, str] = {}
    if isinstance(headers, dict):
        items = headers.items()
    elif isinstance(headers, (list, tuple)):
        items = []
        for item in headers:
            if isinstance(item, dict):
                items.extend(item.items())
            elif isinstance(item, (list, tuple)) and len(item) == 2:
                items.append((item[0], item[1]))
    else:
        return normalized
    for key, value in items:
        k = str(key).lower()
        if isinstance(value, (list, tuple)):
            value = ", ".join(str(v) for v in value)
        normalized[k] = str(value or "")
    return normalized


# ─────────────────────────────────────────────────────────────────────────────
# Page signal extraction
# ─────────────────────────────────────────────────────────────────────────────

_MAX_PAGES = 20


class _PageSignals:
    """Security-relevant signals extracted from a single crawled page document."""

    __slots__ = ("url", "scheme", "final_url", "html", "headers", "soup", "ssl_info",
                 "external_scripts", "http_resources", "iframes", "forms",
                 "login_hints", "reset_hints", "register_hints", "admin_hints",
                 "captcha_hints", "recaptcha", "turnstile", "has_password_form")

    def __init__(self, page: Any):
        if not isinstance(page, dict):
            page = {}
        self.url = str(page.get("url") or "")
        try:
            self.scheme = urlparse(self.url).scheme.lower()
        except Exception:
            self.scheme = ""
        self.final_url = str(page.get("final_url") or "")
        self.html = str(page.get("rendered_html") or page.get("html") or "")
        self.headers = _normalize_headers(page.get("response_headers"))

        ssl_info = page.get("ssl_info") or page.get("ssl") or page.get("certificate") or page.get("tls_info")
        self.ssl_info = ssl_info if isinstance(ssl_info, dict) else {}

        self.soup: Optional[BeautifulSoup] = None
        try:
            self.soup = BeautifulSoup(self.html, "html.parser")
        except Exception:
            pass

        self.external_scripts: List[str] = []
        self.http_resources: List[str] = []
        self.iframes: List[Dict[str, Any]] = []
        self.forms: List[Dict[str, Any]] = []
        self.login_hints: List[str] = []
        self.reset_hints: List[str] = []
        self.register_hints: List[str] = []
        self.admin_hints: List[str] = []
        self.captcha_hints: List[str] = []
        self.recaptcha = False
        self.turnstile = False
        self.has_password_form = False

        self._extract()

    @staticmethod
    def _is_http(url: str) -> bool:
        return url.lower().startswith("http://")

    @staticmethod
    def _is_external(url: str, page_host: str) -> bool:
        if not url:
            return False
        try:
            parsed = urlparse(url)
        except Exception:
            return False
        if not parsed.scheme:
            return False
        if not page_host:
            return parsed.scheme in ("http", "https")
        return bool(parsed.netloc) and parsed.netloc != page_host

    def _extract(self) -> None:
        soup = self.soup
        if soup is None:
            return

        host = ""
        try:
            host = urlparse(self.url).netloc
        except Exception:
            host = ""

        for s in soup.find_all("script"):
            src = s.get("src")
            if not src:
                continue
            src = str(src)
            if self._is_http(src):
                self.http_resources.append(src)
            if self._is_external(src, host):
                self.external_scripts.append(src)

        for selector in ("link", "img", "video", "audio", "embed", "source", "object"):
            for el in soup.find_all(selector):
                for attr in ("src", "href"):
                    val = el.get(attr)
                    if val and self._is_http(str(val)):
                        self.http_resources.append(str(val))

        for iframe in soup.find_all("iframe"):
            src = str(iframe.get("src") or "")
            sandboxed = bool(iframe.get("sandbox"))
            http_src = self._is_http(src)
            if http_src:
                self.http_resources.append(src)
            self.iframes.append({"src": src, "sandboxed": sandboxed, "http_src": http_src})

        for form in soup.find_all("form"):
            form_info = self._extract_form(form)
            self.forms.append(form_info)
            if form_info["password_fields"] > 0:
                self.has_password_form = True

        html_lower = self.html.lower()
        for s in soup.find_all("script"):
            src = str(s.get("src") or "").lower()
            if "recaptcha" in src or "google.com/recaptcha" in html_lower:
                self.recaptcha = True
            if "turnstile" in src or "challenges.cloudflare.com" in src or "turnstile" in html_lower:
                self.turnstile = True
        for div in soup.find_all(class_=re.compile("g-recaptcha|cf-turnstile|recaptcha|h-captcha", re.I)):
            self.captcha_hints.append(str(div.get("class")))

        for a in soup.find_all("a"):
            href = str(a.get("href") or "").lower()
            text = (a.get_text(" ", strip=True) or "").lower()
            combined = f"{href} {text}"
            if any(h in combined for h in _LOGIN_HINTS):
                self.login_hints.append(href)
            if any(h in combined for h in _RESET_HINTS):
                self.reset_hints.append(href)
            if any(h in combined for h in _REGISTER_HINTS):
                self.register_hints.append(href)
            if any(h in combined for h in _ADMIN_HINTS):
                self.admin_hints.append(href)
        if not self.login_hints:
            for h in _LOGIN_HINTS:
                if h in html_lower:
                    self.login_hints.append(h)

    def _extract_form(self, form: Any) -> Dict[str, Any]:
        action = str(form.get("action") or "")
        password_fields = 0
        autocomplete_sensitive = 0
        has_csrf = False
        https_action = True

        for inp in form.find_all("input"):
            input_type = (inp.get("type") or "text").lower()
            name = str(inp.get("name") or "").lower()
            auto = str(inp.get("autocomplete") or "").lower()

            if input_type == "password" or name in ("password", "passwd", "pwd"):
                password_fields += 1
                if auto not in ("off", "current-password", "new-password"):
                    autocomplete_sensitive += 1

            if name in _CSRF_NAMES or (inp.get("name") and str(inp.get("name")).lower().endswith("token")):
                if (inp.get("type") or "text").lower() == "hidden":
                    has_csrf = True

        if action:
            if action.startswith("https://"):
                https_action = True
            elif action.startswith("http://"):
                https_action = False
            else:
                https_action = True  # relative — inherits page scheme

        return {
            "action": action,
            "password_fields": password_fields,
            "autocomplete_sensitive": autocomplete_sensitive,
            "has_csrf": has_csrf,
            "https_action": https_action,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Security Audit Service
# ─────────────────────────────────────────────────────────────────────────────

class SecurityAuditService:
    """Local, professional-grade website security audit engine."""

    MAX_PAGES = _MAX_PAGES

    def __init__(self) -> None:
        pass

    # ── Public entrypoint ───────────────────────────────────────────────

    async def audit(self, lead_id: str, website_url: str, pages: List[Dict],
                    on_update=None) -> SecurityAuditResultCreate:
        """Run a full security audit. NEVER raises — returns a partial audit."""
        started = time.perf_counter()
        try:
            self._emit(on_update, "Security Audit", website_url, {"stage": "started"})
            logger.info(f"[SecAudit] Security Audit Started: {lead_id} :: {website_url}")
            # DNSSEC / WHOIS lookups run in a worker thread so they never block
            # the event loop; they are bounded and cached, and return None on
            # any failure so the rest of the audit always completes.
            try:
                domain_data = await asyncio.to_thread(self._collect_domain_data, website_url)
            except Exception:
                logger.warning(f"[SecAudit] Domain lookups unavailable for {website_url}")
                domain_data = None
            result = self._audit(lead_id, website_url, pages, domain_data=domain_data, on_update=on_update)
            result.auditTime = round((time.perf_counter() - started) * 1000, 1)
            logger.info(
                f"[SecAudit] Security Audit Finished: {lead_id} "
                f"score={result.overallScore} grade={result.grade} "
                f"auditTime={result.auditTime:.0f}ms"
            )
            return result
        except Exception as exc:  # pragma: no cover - defensive
            logger.error(f"[SecAudit] Audit failed for lead {lead_id}: {exc!r}")
            empty = SecurityAuditResultCreate(lead_id=lead_id, website_url=website_url)
            empty.auditTime = round((time.perf_counter() - started) * 1000, 1)
            return empty

    # ── Core audit orchestration ─────────────────────────────────────────

    def _audit(self, lead_id: str, website_url: str, pages: List[Any],
               domain_data: Optional[Dict[str, Any]] = None,
               on_update=None) -> SecurityAuditResultCreate:
        if not isinstance(pages, list):
            pages = []

        signals: List[_PageSignals] = []
        for page in pages:
            if not isinstance(page, dict):
                continue
            try:
                signals.append(_PageSignals(page))
            except Exception:
                continue
        if not signals:
            logger.warning(f"[SecAudit] No valid pages provided for lead {lead_id}; returning empty audit")
            return SecurityAuditResultCreate(lead_id=lead_id, website_url=website_url)

        signals = signals[: self.MAX_PAGES]
        primary = signals[0]

        ssl = self._audit_ssl(primary, signals)
        logger.info("[SecAudit] SSL Audit Complete")

        headers = self._audit_headers(primary)
        logger.info("[SecAudit] Security Headers Audit Complete")

        cookies = self._audit_cookies(signals)
        logger.info("[SecAudit] Cookie Audit Complete")

        server = self._audit_server(primary)
        logger.info("[SecAudit] Server Audit Complete")

        forms = self._audit_forms(signals)
        logger.info("[SecAudit] Form Audit Complete")

        content = self._audit_content(signals)
        logger.info("[SecAudit] Content Audit Complete")

        authentication = self._audit_authentication(signals)
        logger.info("[SecAudit] Authentication Audit Complete")

        domain = self._audit_domain(website_url, domain_data)
        logger.info("[SecAudit] Domain Audit Complete")

        overall = self._overall_score(ssl, headers, cookies, server, forms, content, authentication, domain)
        grade = _grade(overall)

        recommendations = self._build_recommendations(
            ssl, headers, cookies, server, forms, content, authentication, domain
        )

        return SecurityAuditResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            overallScore=overall,
            grade=grade,
            ssl=ssl,
            headers=headers,
            cookies=cookies,
            server=server,
            forms=forms,
            content=content,
            authentication=authentication,
            domain=domain,
            recommendations=recommendations,
        )

    # ── SSL / HTTPS ──────────────────────────────────────────────────────

    def _audit_ssl(self, primary: _PageSignals, signals: List[_PageSignals]) -> SSLAudit:
        info = primary.ssl_info or {}
        https_enabled = primary.scheme == "https" or any(p.scheme == "https" for p in signals)

        http_redirect = False
        for sig in signals:
            if sig.scheme == "http" and sig.final_url.lower().startswith("https://"):
                http_redirect = True
        if not http_redirect and not https_enabled:
            if primary.headers.get("strict-transport-security"):
                http_redirect = True

        days_remaining = info.get("days_remaining", info.get("daysRemaining", info.get("days_left")))
        expired = bool(info.get("expired", False))
        if days_remaining is not None:
            try:
                days_remaining = int(days_remaining)
            except (TypeError, ValueError):
                days_remaining = None
            if days_remaining is not None and days_remaining < 0:
                expired = True

        self_signed = bool(info.get("self_signed", info.get("selfSigned", False)))
        version = info.get("version") or info.get("protocol")
        protocol_lower = str(version or "").lower()
        weak = bool(info.get("weak", False))
        if any(p in protocol_lower for p in ("ssl/3", "tls/1.0", "tls1.0", "tls/1.1", "tls1.1")):
            weak = True

        issuer = info.get("issuer")
        expiry = info.get("expiry") or info.get("expires") or info.get("not_after") or info.get("valid_to")
        valid = bool(info.get("valid", True)) if info else https_enabled
        if expired:
            valid = False

        mixed_content = any(
            sig.scheme == "https" and sig.http_resources for sig in signals
        )

        secure_connection = https_enabled and not expired and not weak and not self_signed and not mixed_content

        score = 0
        if https_enabled:
            score = 100
            if not http_redirect:
                score -= 10
            if expired:
                score -= 35
            if weak:
                score -= 20
            if self_signed:
                score -= 20
            if mixed_content:
                score -= 25

        return SSLAudit(
            score=safe_score(score),
            enabled=https_enabled,
            valid=valid,
            expiry=str(expiry) if expiry else None,
            issuer=str(issuer) if issuer else None,
            version=str(version) if version else None,
            daysRemaining=days_remaining,
            expired=expired,
            selfSigned=self_signed,
            weak=weak,
            httpRedirect=http_redirect,
            mixedContent=mixed_content,
            secureConnection=secure_connection,
        )

    # ── Security Headers ─────────────────────────────────────────────────

    def _audit_headers(self, primary: _PageSignals) -> SecurityHeaderAudit:
        headers = primary.headers
        items: List[SecurityHeaderItem] = []
        score = 100

        for header_key, header_name in _HEADER_CHECKS:
            value = headers.get(header_key)
            importance = _HEADER_IMPORTANCE.get(header_key, 5)
            status, item_value = self._classify_header(header_key, value)
            items.append(SecurityHeaderItem(name=header_name, status=status, value=item_value))
            if status == "Missing":
                score -= importance
            elif status == "Weak":
                score -= importance // 2

        return SecurityHeaderAudit(
            score=safe_score(score),
            present=sum(1 for i in items if i.status in ("Present", "Configured", "Weak")),
            missing=sum(1 for i in items if i.status == "Missing"),
            weak=sum(1 for i in items if i.status == "Weak"),
            total=len(items),
            headers=items,
        )

    @staticmethod
    def _classify_header(key: str, value: Optional[str]) -> Tuple[str, Optional[str]]:
        if not value:
            return ("Missing", None)
        v = value.lower()
        if key == "content-security-policy":
            if "unsafe-inline" in v or "unsafe-eval" in v:
                return ("Weak", value)
            return ("Configured", value)
        if key == "strict-transport-security":
            if "includesubdomains" in v and "max-age" in v:
                return ("Configured", value)
            return ("Weak", value)
        if key == "x-frame-options":
            return ("Configured", value) if v in ("deny", "sameorigin") else ("Weak", value)
        if key == "x-content-type-options":
            return ("Configured", value) if "nosniff" in v else ("Weak", value)
        if key == "referrer-policy":
            if "unsafe-url" in v or "no-referrer-when-downgrade" in v:
                return ("Weak", value)
            return ("Configured", value)
        if key in ("permissions-policy", "cross-origin-opener-policy", "cross-origin-resource-policy"):
            return ("Configured", value)
        if key == "cache-control":
            if "no-store" in v or "no-cache" in v:
                return ("Configured", value)
            return ("Weak", value)
        return ("Present", value)

    # ── Cookies ──────────────────────────────────────────────────────────

    def _audit_cookies(self, signals: List[_PageSignals]) -> CookieAudit:
        cookies: List[Dict[str, Any]] = []
        for sig in signals:
            raw = sig.headers.get("set-cookie")
            if not raw:
                continue
            for chunk in re.split(r",\s*(?=[A-Za-z0-9_\-\.]+=)", raw):
                if "=" not in chunk:
                    continue
                parts = [p.strip().lower() for p in chunk.split(";")]
                name = parts[0].split("=")[0]
                if not name:
                    continue
                attrs = set(parts[1:])
                cookies.append({
                    "name": name,
                    "secure": "secure" in attrs,
                    "httponly": "httponly" in attrs,
                    "samesite": any("samesite" in a for a in attrs),
                    "session": not any("expires" in a or "max-age" in a for a in attrs),
                })

        total = len(cookies)
        secure = sum(1 for c in cookies if c["secure"])
        httponly = sum(1 for c in cookies if c["httponly"])
        samesite = sum(1 for c in cookies if c["samesite"])
        session = sum(1 for c in cookies if c["session"])
        insecure = sum(1 for c in cookies if not c["secure"])

        if total == 0:
            score = 60
        else:
            score = 100
            score -= (total - secure) * 25
            score -= (total - httponly) * 15
            score -= (total - samesite) * 15
            score -= insecure * 10

        return CookieAudit(
            score=safe_score(score),
            totalCookies=total,
            secureCookies=secure,
            httpOnlyCookies=httponly,
            sameSiteCookies=samesite,
            sessionCookies=session,
            insecureCookies=insecure,
        )

    # ── Server ───────────────────────────────────────────────────────────

    def _audit_server(self, primary: _PageSignals) -> ServerAudit:
        headers = primary.headers
        server = headers.get("server") or None
        x_powered = headers.get("x-powered-by") or None

        server_exposed = bool(server)
        x_powered_exposed = bool(x_powered)

        combined = f"{server} {x_powered}".lower()
        php = bool(re.search(r"php(/[\d.]+)?", f"{combined} {primary.html[:2000]}".lower()))
        aspnet = bool(re.search(r"asp\.net(/[\d.]+)?", combined))
        apache = bool(re.search(r"apache(/[\d.]+)?", (server or "").lower()))
        nginx = bool(re.search(r"nginx(/[\d.]+)?", (server or "").lower()))

        information_leakage = server_exposed or x_powered_exposed or php or aspnet

        score = 100
        if server_exposed:
            if re.search(r"apache/[\d.]|nginx/[\d.]|php/[\d.]", (server or "").lower()):
                score -= 30
            else:
                score -= 20
        if x_powered_exposed:
            score -= 30
        if aspnet:
            score -= 15

        return ServerAudit(
            score=safe_score(score),
            server=server,
            serverHeaderExposed=server_exposed,
            xPoweredBy=x_powered,
            xPoweredByExposed=x_powered_exposed,
            phpVersionExposed=php,
            aspNetVersionExposed=aspnet,
            apacheVersionExposed=apache,
            nginxVersionExposed=nginx,
            informationLeakage=information_leakage,
        )

    # ── Forms ────────────────────────────────────────────────────────────

    def _audit_forms(self, signals: List[_PageSignals]) -> FormAudit:
        total_forms = 0
        forms_with_csrf = 0
        password_fields = 0
        autocomplete_sensitive = 0
        any_http_submit = False

        for sig in signals:
            for form in sig.forms:
                total_forms += 1
                if form["has_csrf"]:
                    forms_with_csrf += 1
                password_fields += form["password_fields"]
                autocomplete_sensitive += form["autocomplete_sensitive"]
                if not form["https_action"]:
                    any_http_submit = True

        recaptcha = any(s.recaptcha for s in signals)
        turnstile = any(s.turnstile for s in signals)
        captcha_protected = recaptcha or turnstile or any(s.captcha_hints for s in signals)

        csrf_protected = total_forms > 0 and forms_with_csrf >= total_forms
        https_submit = not any_http_submit if total_forms > 0 else True

        if total_forms == 0:
            score = 100
        else:
            score = 100
            if not csrf_protected:
                score -= 40
            if not https_submit:
                score -= 20
            score -= min(30, autocomplete_sensitive * 10)

        return FormAudit(
            score=safe_score(score),
            totalForms=total_forms,
            formsWithCsrf=forms_with_csrf,
            csrfProtected=csrf_protected,
            passwordFields=password_fields,
            autocompleteSensitive=autocomplete_sensitive,
            httpsSubmit=https_submit,
            captchaProtected=captcha_protected,
            recaptcha=recaptcha,
            turnstile=turnstile,
        )

    # ── Content ──────────────────────────────────────────────────────────

    def _audit_content(self, signals: List[_PageSignals]) -> ContentAudit:
        mixed_content = False
        unsafe_resources = 0
        external_scripts = 0
        unsafe_iframes = 0
        total_iframes = 0

        for sig in signals:
            if sig.scheme == "https":
                unsafe_resources += len(sig.http_resources)
                if sig.http_resources:
                    mixed_content = True
            external_scripts += len(sig.external_scripts)
            total_iframes += len(sig.iframes)
            for iframe in sig.iframes:
                if not iframe["sandboxed"] or iframe["http_src"]:
                    unsafe_iframes += 1

        score = 100
        if mixed_content:
            score -= 25
        score -= min(30, unsafe_resources * 10)
        score -= min(20, external_scripts * 5)
        if unsafe_iframes:
            score -= min(20, unsafe_iframes * 10)

        return ContentAudit(
            score=safe_score(score),
            mixedContent=mixed_content,
            unsafeResources=unsafe_resources,
            externalScripts=external_scripts,
            unsafeIframes=unsafe_iframes,
            totalIframes=total_iframes,
        )

    # ── Authentication ───────────────────────────────────────────────────

    def _audit_authentication(self, signals: List[_PageSignals]) -> AuthenticationAudit:
        login_page = any(s.has_password_form or s.login_hints for s in signals)
        password_reset = any(s.reset_hints for s in signals)
        registration = any(s.register_hints for s in signals)
        protected_admin = any(s.admin_hints for s in signals)
        insecure_login = any(s.has_password_form and s.scheme != "https" for s in signals)

        score = 100
        if insecure_login:
            score -= 35
        if protected_admin:
            score -= 20
        if login_page and score == 100:
            score = 90

        return AuthenticationAudit(
            score=safe_score(score),
            loginPage=login_page,
            passwordReset=password_reset,
            registration=registration,
            protectedAdminPages=protected_admin,
        )

    # ── Domain (DNSSEC + WHOIS) ──────────────────────────────────────────

    @staticmethod
    def _extract_domain(website_url: str) -> str:
        """Extract a bare registrable host (minus scheme, port, subdomains).

        Handles IP literals and two-part country-code TLDs (e.g. ``co.uk``) so
        ``https://www.example.com`` → ``example.com`` and
        ``https://blog.example.co.uk`` → ``example.co.uk``.
        """
        try:
            host = urlparse(str(website_url or "")).netloc
        except Exception:
            return ""
        host = (host or "").split(":")[0].strip().lower()
        if not host:
            return ""

        labels = host.split(".")
        if len(labels) <= 2:
            return host
        if all(label.isdigit() for label in labels):
            return host

        # Two-part country-code suffixes keep three labels: a.b.co.uk → b.co.uk
        if ".".join(labels[-2:]) in _TWO_PART_SUFFIXES:
            return ".".join(labels[-3:])
        return ".".join(labels[-2:])

    def _collect_domain_data(self, website_url: str) -> Optional[Dict[str, Any]]:
        """Run DNSSEC + WHOIS lookups with bounded timeouts, cached 1h.

        Returns a dict of the form:
            {"dnssec": bool|None, "whois": {..}|None}
        Never raises; on catastrophic failure returns None. Because this is
        invoked through ``asyncio.to_thread`` it never blocks the event loop.
        """
        domain = self._extract_domain(website_url)
        if not domain:
            return None

        now = time.time()
        with _DOMAIN_CACHE_LOCK:
            cached = _DOMAIN_CACHE.get(domain)
            if cached and now - cached[0] < _DOMAIN_CACHE_TTL:
                return cached[1]

        data: Optional[Dict[str, Any]] = None
        try:
            with ThreadPoolExecutor(max_workers=2) as executor:
                dns_future = executor.submit(self._lookup_dnssec, domain)
                whois_future = executor.submit(self._lookup_whois, domain)
                try:
                    dnssec = dns_future.result(timeout=_DOMAIN_LOOKUP_TIMEOUT)
                except Exception:
                    dnssec = None
                try:
                    whois = whois_future.result(timeout=_DOMAIN_LOOKUP_TIMEOUT)
                except Exception:
                    whois = None
            data = {"dnssec": dnssec, "whois": whois}
        except Exception:  # pragma: no cover - defensive
            logger.warning(f"[SecAudit] Domain lookups failed for {domain}")
            data = None

        with _DOMAIN_CACHE_LOCK:
            _DOMAIN_CACHE[domain] = (time.time(), data)
        return data

    @staticmethod
    def _lookup_dnssec(domain: str) -> Optional[bool]:
        """True if the zone publishes DNSKEY records (DNSSEC signed).

        First tries the configured recursive resolver (the fastest path on a
        normal server). If that fails — e.g. a stub resolver that SERVFAILs
        DNSKEY queries — it falls back to querying the zone's authoritative
        nameservers directly over UDP.

        Returns None only when every query failed (network / resolver
        problem), which the scorer treats as "unable to verify" rather than a
        finding.
        """
        try:
            import dns.resolver
        except Exception:
            return None

        recursive: Optional[dns.resolver.Resolver] = None
        try:
            resolver = dns.resolver.Resolver()
            resolver.lifetime = _DNS_TIMEOUT
            resolver.timeout = _DNS_TIMEOUT
            recursive = resolver
        except Exception:
            pass

        if recursive is not None:
            try:
                recursive.resolve(domain, "DNSKEY")
                return True
            except dns.resolver.NoAnswer:
                return False
            except dns.resolver.NXDOMAIN:
                return False
            except Exception:
                pass  # fall through to authoritative query

        # Authoritative fallback: find the zone's NS records (stub resolvers
        # usually answer these), resolve them to IPs, and query DNSKEY there.
        if recursive is not None:
            try:
                import dns.message
                import dns.name
                import dns.query
                import dns.rdatatype

                nameservers: List[str] = []
                for ns in recursive.resolve(domain, "NS"):
                    host = str(ns).rstrip(".")
                    for rdtype in ("A", "AAAA"):
                        try:
                            for addr in recursive.resolve(host, rdtype):
                                nameservers.append(str(addr))
                        except Exception:
                            continue

                for ip in nameservers:
                    try:
                        q = dns.message.make_query(dns.name.from_text(domain), dns.rdatatype.DNSKEY)
                        resp = dns.query.udp(q, ip, timeout=_DNS_TIMEOUT)
                        if any(rrset.rdtype == dns.rdatatype.DNSKEY for rrset in resp.answer):
                            return True
                        # Authoritative NOERROR/NXDOMAIN without a DNSKEY
                        # RRset means the zone is unsigned.
                        return False
                    except Exception:
                        continue
            except Exception:
                pass

        return None

    @staticmethod
    def _lookup_whois(domain: str) -> Optional[Dict[str, Any]]:
        """Query the domain via raw WHOIS (port 43) using the IANA bootstrap
        referral, with per-TLD fallbacks. Returns parsed fields or None."""
        def query(server: str, payload: str) -> str:
            with socket.create_connection((server, 43), timeout=_WHOIS_TIMEOUT) as sock:
                sock.sendall(f"{payload}\r\n".encode("ascii", "ignore"))
                chunks = []
                while True:
                    chunk = sock.recv(4096)
                    if not chunk:
                        break
                    chunks.append(chunk)
                    if len(chunk) < 4096:
                        break
            return b"".join(chunks).decode("utf-8", "ignore")

        text = ""
        try:
            text = query("whois.iana.org", domain)
        except Exception:
            text = ""

        server = None
        match = re.search(r"(?im)^refer:\s*(\S+)", text)
        if match:
            server = match.group(1).strip()
        if not server:
            server = _WHOIS_FALLBACK.get(domain.rpartition(".")[2].lower())

        if server:
            try:
                text = query(server, domain)
            except Exception:
                return None
        if not text.strip():
            return None

        def field(*patterns: str) -> Optional[str]:
            for pattern in patterns:
                match = re.search(rf"(?im)^{re.escape(pattern)}\s*(.*)$", text)
                if match and match.group(1).strip():
                    return match.group(1).strip()
            return None

        return {
            "registrar": field("Registrar:", "registrar:", "Sponsoring Registrar:"),
            "creation": field("Creation Date:", "Registered On:", "created:", "Domain Registration Date:"),
            "expiry": field("Registry Expiry Date:", "Registrar Registration Expiration Date:", "Expiration Date:", "Expiry Date:"),
            "name_servers": re.findall(r"(?im)^(?:Name Server|nserver):\s*(\S+)", text),
        }

    @staticmethod
    def _parse_date(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        match = re.search(r"\d{4}-\d{2}-\d{2}", str(value))
        if not match:
            return None
        try:
            return datetime.strptime(match.group(0), "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            return None

    def _audit_domain(self, website_url: str, domain_data: Optional[Dict[str, Any]]) -> DomainAudit:
        domain = self._extract_domain(website_url)
        info = domain_data or {}
        dnssec = info.get("dnssec")
        whois = info.get("whois") or {}
        whois_available = bool(whois.get("expiry") or whois.get("registrar") or whois.get("name_servers"))

        expiry_date = self._parse_date(whois.get("expiry"))
        days_to_expiry = None
        expired = False
        if expiry_date is not None:
            days_to_expiry = (expiry_date - datetime.now(timezone.utc)).days
            expired = days_to_expiry < 0

        score = 100
        if dnssec is False:          # confirmed unsigned — a real finding
            score -= 30
        if whois_available:
            if expired:
                score -= 40
            elif days_to_expiry is not None and days_to_expiry < 30:
                score -= 15
            if not whois.get("registrar"):
                score -= 10

        return DomainAudit(
            score=safe_score(score),
            domain=domain,
            dnssecEnabled=dnssec,
            dnssecValid=dnssec is True,
            whoisAvailable=whois_available,
            registrar=whois.get("registrar") or None,
            creationDate=whois.get("creation") or None,
            expiryDate=whois.get("expiry") or None,
            daysToExpiry=days_to_expiry,
            expired=expired,
            nameServers=whois.get("name_servers") or [],
        )

    # ── Overall score ────────────────────────────────────────────────────

    @staticmethod
    def _overall_score(ssl: SSLAudit, headers: SecurityHeaderAudit, cookies: CookieAudit,
                       server: ServerAudit, forms: FormAudit, content: ContentAudit,
                       authentication: AuthenticationAudit, domain: DomainAudit) -> int:
        score = (
            ssl.score * 0.25
            + headers.score * 0.20
            + cookies.score * 0.10
            + server.score * 0.10
            + forms.score * 0.10
            + content.score * 0.10
            + authentication.score * 0.05
            + domain.score * 0.10
        )
        return int(round(_clamp(score)))

    # ── AI Recommendations ───────────────────────────────────────────────

    def _build_recommendations(
        self, ssl: SSLAudit, headers: SecurityHeaderAudit, cookies: CookieAudit,
        server: ServerAudit, forms: FormAudit, content: ContentAudit,
        authentication: AuthenticationAudit, domain: DomainAudit,
    ) -> List[SecurityRecommendation]:
        recs: List[SecurityRecommendation] = []
        seen = set()

        def add(title: str, description: str, priority: str, category: str = "Security") -> None:
            key = title.lower()
            if key in seen:
                return
            seen.add(key)
            recs.append(SecurityRecommendation(title=title, description=description, priority=priority, category=category))

        if not ssl.enabled:
            add("Enable HTTPS", "The website is served over plain HTTP. Redirect all traffic to HTTPS with a valid SSL certificate.", "High")
        elif not ssl.httpRedirect:
            add("Force HTTP → HTTPS Redirect", "Add 301 redirects (and HSTS) so every HTTP request upgrades to HTTPS.", "High")
        if ssl.expired:
            add("Renew SSL Certificate", "The SSL certificate has expired. Renew it immediately to restore trust and secure connections.", "Critical")
        if ssl.selfSigned:
            add("Replace Self-Signed Certificate", "Install a certificate from a trusted CA so visitors are not shown security warnings.", "High")
        if ssl.weak:
            add("Upgrade TLS Version", "The site uses a deprecated TLS/SSL protocol. Upgrade to TLS 1.2 or TLS 1.3.", "High")
        if ssl.mixedContent:
            add("Remove Mixed Content", "The HTTPS page loads insecure HTTP resources. Serve every resource over HTTPS.", "High")

        header_by_name = {h.name: h.status for h in headers.headers}
        if header_by_name.get("HSTS") == "Missing":
            add("Enable HSTS", "Add Strict-Transport-Security with a long max-age and includeSubDomains to force secure connections.", "High", "Security Headers")
        elif header_by_name.get("HSTS") == "Weak":
            add("Strengthen HSTS", "Set Strict-Transport-Security with max-age>=31536000 and includeSubDomains.", "Medium", "Security Headers")
        if header_by_name.get("CSP") == "Missing":
            add("Enable CSP", "Add a Content-Security-Policy header to mitigate XSS and injection attacks.", "High", "Security Headers")
        elif header_by_name.get("CSP") == "Weak":
            add("Tighten CSP", "Remove unsafe-inline / unsafe-eval directives from the Content-Security-Policy header.", "Medium", "Security Headers")
        if header_by_name.get("X-Frame-Options") == "Missing":
            add("Enable X-Frame-Options", "Set X-Frame-Options: DENY or SAMEORIGIN to prevent clickjacking.", "Medium", "Security Headers")
        if header_by_name.get("X-Content-Type-Options") == "Missing":
            add("Enable X-Content-Type-Options", "Set X-Content-Type-Options: nosniff to stop MIME-sniffing attacks.", "Medium", "Security Headers")
        if header_by_name.get("Referrer-Policy") == "Missing":
            add("Set Referrer-Policy", "Configure Referrer-Policy to limit how much referrer information is leaked.", "Low", "Security Headers")

        if cookies.totalCookies > 0:
            if cookies.insecureCookies == cookies.totalCookies:
                add("Enable Secure Cookies", "Set the Secure flag on all cookies so they are only sent over HTTPS.", "High", "Cookies")
            else:
                add("Secure Remaining Cookies", f"{cookies.insecureCookies} cookie(s) lack the Secure flag. Mark all cookies Secure.", "Medium", "Cookies")
            if cookies.httpOnlyCookies < cookies.totalCookies:
                add("Mark Cookies HttpOnly", "Set the HttpOnly flag on cookies to prevent JavaScript access and XSS theft.", "Medium", "Cookies")
            if cookies.sameSiteCookies < cookies.totalCookies:
                add("Add SameSite Attribute", "Set SameSite=Lax or Strict on cookies to mitigate CSRF attacks.", "Low", "Cookies")

        if server.serverHeaderExposed or server.xPoweredByExposed or server.informationLeakage:
            add("Hide Server Headers", "Remove or mask the Server and X-Powered-By headers so attackers cannot fingerprint your stack.", "Medium", "Server")
        if server.xPoweredByExposed:
            add("Disable X-Powered-By", "Turn off the X-Powered-By header in your framework to stop technology disclosure.", "Medium", "Server")
        if server.phpVersionExposed or server.apacheVersionExposed or server.nginxVersionExposed:
            add("Hide Version Numbers", "Strip version numbers from Server headers to prevent targeted exploit attempts.", "Medium", "Server")

        if forms.totalForms > 0 and not forms.csrfProtected:
            add("Add CSRF Protection", "Include a CSRF token in every form to protect users from cross-site request forgery.", "High", "Forms")
        if forms.autocompleteSensitive > 0:
            add("Disable Autocomplete on Sensitive Fields", "Set autocomplete=off on password and personal-data fields.", "Medium", "Forms")
        if forms.totalForms > 0 and not forms.httpsSubmit:
            add("Enforce HTTPS Form Submissions", "Ensure every form submits over HTTPS to protect submitted data in transit.", "High", "Forms")
        if forms.totalForms > 0 and not forms.captchaProtected and forms.passwordFields > 0:
            add("Add Bot Protection", "Add reCAPTCHA or Cloudflare Turnstile to login/registration forms to block automated abuse.", "Low", "Forms")

        if content.mixedContent:
            add("Fix Mixed Content", "Update insecure HTTP resources to HTTPS so the browser marks the page fully secure.", "High", "Content")
        if content.unsafeIframes:
            add("Sandbox Iframes", "Add the sandbox attribute to iframes and remove unencrypted iframe sources.", "Medium", "Content")

        if authentication.protectedAdminPages:
            add("Protect Admin Pages", "Restrict admin/dashboard pages behind authentication and avoid exposing admin URLs.", "High", "Authentication")
        if authentication.loginPage and not ssl.secureConnection:
            add("Secure Login Pages", "Serve login pages exclusively over HTTPS with a valid certificate.", "Critical", "Authentication")

        if domain.dnssecEnabled is False:
            add("Enable DNSSEC", "Sign the domain with DNSSEC (publish DNSKEY records and a DS record at the registrar) to protect DNS lookups from spoofing and cache poisoning.", "Medium", "Domain")
        if domain.expired:
            add("Renew Domain", "The domain has expired. Renew it immediately to avoid losing the website and email services.", "Critical", "Domain")
        elif domain.daysToExpiry is not None and 0 <= domain.daysToExpiry < 30:
            add("Renew Domain Soon", f"The domain expires in {domain.daysToExpiry} day(s). Renew now to avoid an interruption or a grace-period scramble.", "High", "Domain")

        return recs

    # ── Event helper ─────────────────────────────────────────────────────

    @staticmethod
    def _emit(on_update, stage: str, url: str, data: Dict[str, Any]) -> None:
        if not on_update:
            return
        try:
            import asyncio
            result = on_update(stage, url, data)
            if asyncio.iscoroutine(result):
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    asyncio.run(result)
                else:
                    task = asyncio.ensure_future(result)
                    task.add_done_callback(
                        lambda t: t.exception() if not t.cancelled() else None
                    )
        except Exception:
            pass


# Singleton instance (matching the rest of the codebase pattern).
security_audit_service = SecurityAuditService()
