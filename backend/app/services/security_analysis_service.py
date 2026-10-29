import logging
from typing import Dict, List, Any
import httpx
from bs4 import BeautifulSoup

from app.models.security_analysis import (
    SecurityAnalysisResultCreate, SecurityScorecard, SecurityIssue, ComplianceAudit
)
from app.services.safe_scoring import safe_score, safe_float, safe_int, safe_get

logger = logging.getLogger(__name__)

class SecurityAnalysisService:
    def __init__(self):
        pass

    async def _fetch_headers_and_cookies(self, url: str) -> tuple[Dict[str, str], List[Dict[str, Any]]]:
        headers = {}
        cookies = []
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(url)
                headers = dict(resp.headers)
                
                for name, cookie in resp.cookies.jar._cookies.items():
                    for domain, path_cookies in cookie.items():
                        for path, c in path_cookies.items():
                            cookies.append({
                                "name": c.name,
                                "domain": c.domain,
                                "secure": c.secure,
                                "has_nonstandard_attr": c.has_nonstandard_attr('HttpOnly'),
                                "value": "REDACTED"
                            })
        except Exception as e:
            logger.error(f"Failed to fetch security headers for {url}: {e}")
            
        return headers, cookies

    def _analyze_headers(self, headers: Dict[str, str], url: str) -> tuple[List[SecurityIssue], int, int]:
        issues = []
        http_score = 100
        ssl_score = 100
        
        # HTTPS Check
        if not url.startswith("https"):
            issues.append(SecurityIssue(
                issue_type="Insecure Protocol", category="Security",
                description="Website does not enforce HTTPS.", risk_level="Critical",
                developer_notes="Install an SSL certificate and force port 80 to 443 redirects.",
                affected_url=url
            ))
            ssl_score = 0
            
        # HSTS
        hsts = headers.get("strict-transport-security")
        if not hsts:
            issues.append(SecurityIssue(
                issue_type="Missing HSTS", category="Security",
                description="Strict-Transport-Security header is missing.", risk_level="High",
                developer_notes="Add 'Strict-Transport-Security: max-age=31536000; includeSubDomains' to response headers.",
                affected_url=url
            ))
            http_score -= 25
            
        # CSP
        csp = headers.get("content-security-policy")
        if not csp:
            issues.append(SecurityIssue(
                issue_type="Missing CSP", category="Security",
                description="Content-Security-Policy header is missing.", risk_level="High",
                developer_notes="Define a strict CSP to prevent XSS attacks.",
                affected_url=url
            ))
            http_score -= 25
            
        # X-Frame-Options
        x_frame = headers.get("x-frame-options")
        if not x_frame:
            issues.append(SecurityIssue(
                issue_type="Missing X-Frame-Options", category="Security",
                description="X-Frame-Options is missing, exposing site to Clickjacking.", risk_level="Medium",
                developer_notes="Set 'X-Frame-Options: DENY' or 'SAMEORIGIN'.",
                affected_url=url
            ))
            http_score -= 15
            
        # X-Content-Type-Options
        x_content = headers.get("x-content-type-options")
        if not x_content:
            issues.append(SecurityIssue(
                issue_type="Missing X-Content-Type-Options", category="Security",
                description="X-Content-Type-Options is missing.", risk_level="Medium",
                developer_notes="Set 'X-Content-Type-Options: nosniff'.",
                affected_url=url
            ))
            http_score -= 15
            
        # Information Leakage
        server = headers.get("server")
        x_powered = headers.get("x-powered-by")
        if server or x_powered:
            issues.append(SecurityIssue(
                issue_type="Server Information Leakage", category="Security",
                description=f"Server headers expose technology versions (Server: {server}, X-Powered-By: {x_powered}).", risk_level="Low",
                developer_notes="Mask or remove the Server and X-Powered-By headers.",
                affected_url=url
            ))
            http_score -= 5
            
        return issues, max(0, http_score), ssl_score

    def _analyze_wcag_and_compliance(self, pages: List[Dict], url: str) -> tuple[List[SecurityIssue], ComplianceAudit, int, int]:
        issues = []
        wcag_score_acc = 0
        
        audit = ComplianceAudit()
        
        total_pages = len(pages)
        if total_pages == 0:
            return issues, audit, 0, 0
            
        for page in pages:
            html = page.get("rendered_html", "")
            page_url = page.get("url", "")
            soup = BeautifulSoup(html, 'html.parser')
            
            page_wcag = 100
            
            # 1. Missing Image Alt Text
            images = soup.find_all('img')
            missing_alts = sum(1 for img in images if not img.get('alt'))
            if missing_alts > 0:
                issues.append(SecurityIssue(
                    issue_type="Missing Alt Text", category="Accessibility",
                    description=f"Found {missing_alts} images missing alt attributes.", risk_level="Medium",
                    affected_url=page_url
                ))
                page_wcag -= min(30, missing_alts * 5)
                
            # 2. Form Labels
            inputs = soup.find_all('input', type=['text', 'email', 'password'])
            for inp in inputs:
                if not inp.get('id'):
                    continue
                label = soup.find('label', attrs={'for': inp['id']})
                if not label and not inp.get('aria-label'):
                    issues.append(SecurityIssue(
                        issue_type="Missing Form Labels", category="Accessibility",
                        description="Input fields lack associated labels or aria-labels.", risk_level="High",
                        affected_url=page_url
                    ))
                    page_wcag -= 10
                    break
                    
            # 3. Compliance Pattern Matching
            text = soup.get_text().lower()
            if "privacy policy" in text or "privacy-policy" in page_url:
                audit.has_privacy_policy = True
            if "terms of service" in text or "terms and conditions" in text or "terms" in page_url:
                audit.has_terms = True
            if "cookie" in text and ("accept" in text or "consent" in text):
                audit.has_cookie_banner = True
            if "refund" in text or "refund-policy" in page_url:
                audit.has_refund_policy = True
            if "gdpr" in text:
                audit.gdpr_indicators = True
            if "ccpa" in text:
                audit.ccpa_indicators = True
                
            wcag_score_acc += max(0, page_wcag)
            
        # Finalize Legal Compliance Score
        legal_score = 100
        if not audit.has_privacy_policy:
            issues.append(SecurityIssue(
                issue_type="Missing Privacy Policy", category="Compliance",
                description="No clear Privacy Policy detected.", risk_level="High",
                developer_notes="Draft and link a Privacy Policy in the global footer."
            ))
            legal_score -= 40
            
        if not audit.has_cookie_banner:
            issues.append(SecurityIssue(
                issue_type="Missing Cookie Banner", category="Compliance",
                description="No explicit cookie consent banner detected.", risk_level="Medium",
                developer_notes="Implement a compliant cookie banner if tracking scripts are used."
            ))
            legal_score -= 20
            
        if not audit.has_terms:
            legal_score -= 20
            
        wcag_score = int(wcag_score_acc / total_pages)
            
        return issues, audit, wcag_score, max(0, legal_score)

    async def analyze_security(self, lead_id: str, website_url: str, pages: List[Dict], on_update=None) -> SecurityAnalysisResultCreate:
        if on_update:
            await on_update("Security & Compliance Engine", website_url, {"current_stage": "Testing HTTP Security Headers"})
            
        headers, cookies = await self._fetch_headers_and_cookies(website_url)
        
        issues, http_score, ssl_score = self._analyze_headers(headers, website_url)
        
        # Cookie Security
        cookie_score = 100
        for cookie in cookies:
            if not cookie.get("secure") or not cookie.get("has_nonstandard_attr"): # Simplified heuristic
                issues.append(SecurityIssue(
                    issue_type="Insecure Cookies", category="Security",
                    description=f"Cookie {cookie['name']} is missing Secure or HttpOnly flags.", risk_level="Medium",
                    developer_notes="Ensure all sensitive cookies are flagged Secure and HttpOnly."
                ))
                cookie_score -= 20
        cookie_score = max(0, cookie_score)
        
        if on_update:
            await on_update("Security & Compliance Engine", website_url, {"current_stage": "Analyzing WCAG & Legal Compliance"})
            
        wcag_issues, audit, wcag_score, legal_score = self._analyze_wcag_and_compliance(pages, website_url)
        issues.extend(wcag_issues)
        
        overall_score = safe_score(
            (http_score * 0.3) + (ssl_score * 0.3) + (cookie_score * 0.1) + (wcag_score * 0.15) + (legal_score * 0.15)
        )

        scorecard = SecurityScorecard(
            overall_security_score=safe_score(overall_score),
            ssl_score=safe_score(ssl_score),
            http_security_score=safe_score(http_score),
            cookie_security_score=safe_score(cookie_score),
            accessibility_score=safe_score(wcag_score),
            wcag_compliance_score=safe_score(wcag_score),
            privacy_compliance_score=safe_score(legal_score),
            legal_compliance_score=safe_score(legal_score)
        )

        return SecurityAnalysisResultCreate(
            lead_id=lead_id,
            website_url=website_url,
            scorecard=scorecard,
            issues=issues,
            compliance_audit=audit,
            raw_headers=headers,
            raw_cookies=cookies
        )
