"""
Website Audit Service
Handles generation and retrieval of website audits for leads
"""

from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from typing import Dict, Any
import time
import re
import httpx
from urllib.parse import urlparse
from app.models.audit import (
    WebsiteAuditResponse, WebsiteAuditData, TechnologyStack,
    SEOMetrics, SecurityMetrics, PerformanceMetrics, AccessibilityMetrics,
    AuditIssues, GlobalAuditResponse, GlobalAuditStats
)
from app.core.logger import logger

class AuditService:
    """Service for website audit operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db["website_audits"]
    
    async def get_or_generate_audit(
        self, 
        lead_id: str, 
        user_id: str,
        lead: Dict[str, Any]
    ) -> WebsiteAuditResponse:
        """
        Get existing audit or generate a new one.
        Never returns None - always returns valid audit.
        """
        # Try to get existing audit
        existing = await self.collection.find_one({
            "lead_id": lead_id,
            "user_id": user_id
        })
        
        if existing:
            existing["_id"] = str(existing["_id"])
            return WebsiteAuditResponse(**existing)
        
        # Generate new audit
        return await self.generate_audit(lead_id, user_id, lead)
    
    async def generate_audit(
        self, 
        lead_id: str, 
        user_id: str,
        lead: Dict[str, Any]
    ) -> WebsiteAuditResponse:
        """
        Generate a new website audit for a lead.
        Performs comprehensive website analysis.
        """
        start_time = time.time()
        
        website = lead.get("website", "")
        business_name = lead.get("name", "Unknown Business")
        
        # If no website, return minimal audit
        if not website:
            audit_data = self._generate_no_website_audit()
        else:
            # Ensure URL has protocol
            if not website.startswith(("http://", "https://")):
                website = f"https://{website}"
            
            # Perform audit
            audit_data = await self._perform_website_audit(website)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Create audit document
        audit_doc = {
            "lead_id": lead_id,
            "user_id": user_id,
            "business_name": business_name,
            "website": website or "No website",
            "audit_data": audit_data.dict(),
            "audited_at": datetime.utcnow(),
            "processing_time_ms": processing_time
        }
        
        # Save to database
        result = await self.collection.insert_one(audit_doc)
        audit_doc["_id"] = str(result.inserted_id)
        
        logger.info(f"Generated audit for lead {lead_id} in {processing_time}ms")
        
        return WebsiteAuditResponse(**audit_doc)
    
    def _generate_no_website_audit(self) -> WebsiteAuditData:
        """Generate audit data for lead with no website"""
        issues = AuditIssues(
            critical=["No website found"],
            suggestions=[
                "Create a professional website",
                "Register a domain name",
                "Set up hosting",
                "Implement basic SEO"
            ]
        )
        
        return WebsiteAuditData(
            url="No website",
            http_status=None,
            issues=issues,
            overall_score=0
        )
    
    async def _perform_website_audit(self, url: str) -> WebsiteAuditData:
        """
        Perform comprehensive website audit.
        Checks SSL, HTTP status, meta tags, performance, etc.
        """
        audit_data = WebsiteAuditData(url=url)
        start_time = time.time()
        
        try:
            # Perform HTTP request
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(url)
                
                audit_data.http_status = response.status_code
                audit_data.response_time_ms = int((time.time() - start_time) * 1000)
                
                content = response.text
                headers = response.headers
                
                # Parse URL
                parsed_url = urlparse(url)
                
                # Security Audit
                audit_data.security = self._audit_security(parsed_url, headers, content)
                
                # SEO Audit
                audit_data.seo = self._audit_seo(content, headers)
                
                # Technology Detection
                audit_data.technology = self._detect_technology(content, headers)
                
                # Performance Audit
                audit_data.performance = self._audit_performance(response, content)
                
                # Accessibility Audit
                audit_data.accessibility = self._audit_accessibility(content)
                
                # Collect issues
                audit_data.issues = self._collect_issues(audit_data)
                
                # Calculate scores
                audit_data.security_score = self._calculate_security_score(audit_data.security)
                audit_data.seo_score = self._calculate_seo_score(audit_data.seo)
                audit_data.performance_score = self._calculate_performance_score(audit_data.performance)
                audit_data.accessibility_score = self._calculate_accessibility_score(audit_data.accessibility)
                
                # Overall score (weighted average)
                audit_data.overall_score = int(
                    audit_data.security_score * 0.3 +
                    audit_data.seo_score * 0.3 +
                    audit_data.performance_score * 0.2 +
                    audit_data.accessibility_score * 0.2
                )
                
        except httpx.TimeoutException:
            audit_data.issues.critical.append("Website timeout - server not responding")
            audit_data.http_status = 0
        except httpx.HTTPError as e:
            audit_data.issues.critical.append(f"HTTP error: {str(e)}")
            audit_data.http_status = 0
        except Exception as e:
            logger.error(f"Error auditing website {url}: {str(e)}")
            audit_data.issues.critical.append(f"Audit error: {str(e)}")
        
        return audit_data
    
    def _audit_security(self, parsed_url, headers: Dict, content: str) -> SecurityMetrics:
        """Audit website security"""
        security = SecurityMetrics()
        
        # Check SSL
        security.ssl_enabled = parsed_url.scheme == "https"
        security.ssl_valid = security.ssl_enabled  # Simplified
        
        # Check security headers
        security.security_headers = {
            "Strict-Transport-Security": "strict-transport-security" in headers,
            "X-Content-Type-Options": "x-content-type-options" in headers,
            "X-Frame-Options": "x-frame-options" in headers,
            "X-XSS-Protection": "x-xss-protection" in headers,
            "Content-Security-Policy": "content-security-policy" in headers
        }
        
        # Check mixed content
        if security.ssl_enabled and ('http://' in content):
            security.mixed_content = True
        
        return security
    
    def _audit_seo(self, content: str, headers: Dict) -> SEOMetrics:
        """Audit SEO elements"""
        seo = SEOMetrics()
        
        # Extract title
        title_match = re.search(r'<title[^>]*>([^<]+)</title>', content, re.IGNORECASE)
        if title_match:
            seo.title = title_match.group(1).strip()
        
        # Extract meta description
        meta_match = re.search(
            r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']',
            content,
            re.IGNORECASE
        )
        if meta_match:
            seo.meta_description = meta_match.group(1).strip()
        
        # Count headings
        seo.h1_count = len(re.findall(r'<h1[^>]*>', content, re.IGNORECASE))
        seo.h2_count = len(re.findall(r'<h2[^>]*>', content, re.IGNORECASE))
        seo.h3_count = len(re.findall(r'<h3[^>]*>', content, re.IGNORECASE))
        seo.total_headings = seo.h1_count + seo.h2_count + seo.h3_count
        
        # Count images and alt tags
        img_tags = re.findall(r'<img[^>]*>', content, re.IGNORECASE)
        seo.total_images = len(img_tags)
        seo.missing_alt_images = len([img for img in img_tags if 'alt=' not in img.lower()])
        
        return seo
    
    def _detect_technology(self, content: str, headers: Dict) -> TechnologyStack:
        """Detect technologies used on the website"""
        tech = TechnologyStack()
        
        content_lower = content.lower()
        
        # Detect CMS
        if 'wp-content' in content_lower or 'wordpress' in content_lower:
            tech.cms = "WordPress"
        elif 'shopify' in content_lower or 'cdn.shopify.com' in content_lower:
            tech.cms = "Shopify"
        elif 'wix.com' in content_lower:
            tech.cms = "Wix"
        elif 'squarespace' in content_lower:
            tech.cms = "Squarespace"
        else:
            tech.cms = "Custom"
        
        # Detect framework
        if 'react' in content_lower or '_next' in content_lower:
            if '_next' in content_lower:
                tech.framework = "Next.js"
            else:
                tech.framework = "React"
        elif 'angular' in content_lower or 'ng-' in content_lower:
            tech.framework = "Angular"
        elif 'vue' in content_lower or 'v-' in content_lower:
            tech.framework = "Vue.js"
        
        # Detect analytics
        if 'google-analytics' in content_lower or 'gtag' in content_lower:
            tech.analytics.append("Google Analytics")
        if 'facebook.com/tr' in content_lower:
            tech.analytics.append("Facebook Pixel")
        
        # Server header
        server_header = headers.get("server", "")
        if server_header:
            tech.hosting = server_header
        
        return tech
    
    def _audit_performance(self, response, content: str) -> PerformanceMetrics:
        """Audit performance metrics"""
        perf = PerformanceMetrics()
        
        # Page size
        perf.page_size_kb = len(content.encode('utf-8')) // 1024
        
        # Response time is already set in parent function
        
        # Count requests (simplified - just count resource tags)
        perf.total_requests = (
            len(re.findall(r'<script', content, re.IGNORECASE)) +
            len(re.findall(r'<link', content, re.IGNORECASE)) +
            len(re.findall(r'<img', content, re.IGNORECASE))
        )
        
        # Mobile friendly (check viewport meta tag)
        perf.mobile_friendly = bool(re.search(
            r'<meta[^>]*name=["\']viewport["\']',
            content,
            re.IGNORECASE
        ))
        
        return perf
    
    def _audit_accessibility(self, content: str) -> AccessibilityMetrics:
        """Audit accessibility"""
        access = AccessibilityMetrics()
        
        # Check lang attribute
        access.has_lang_attribute = bool(re.search(r'<html[^>]*lang=', content, re.IGNORECASE))
        
        # Check viewport
        access.has_viewport_meta = bool(re.search(
            r'<meta[^>]*name=["\']viewport["\']',
            content,
            re.IGNORECASE
        ))
        
        # Check for ARIA
        access.aria_labels_present = 'aria-' in content.lower()
        
        return access
    
    def _collect_issues(self, audit_data: WebsiteAuditData) -> AuditIssues:
        """Collect all issues from audit"""
        issues = AuditIssues()
        
        # Critical issues
        if not audit_data.security.ssl_enabled:
            issues.critical.append("No SSL certificate - website is not secure")
        if audit_data.http_status and audit_data.http_status >= 400:
            issues.critical.append(f"HTTP error: {audit_data.http_status}")
        if audit_data.security.mixed_content:
            issues.critical.append("Mixed content detected (HTTP resources on HTTPS page)")
        
        # Warnings
        if not audit_data.seo.title:
            issues.warnings.append("Missing page title")
        if not audit_data.seo.meta_description:
            issues.warnings.append("Missing meta description")
        if audit_data.seo.h1_count == 0:
            issues.warnings.append("No H1 heading found")
        if audit_data.seo.h1_count > 1:
            issues.warnings.append("Multiple H1 headings found")
        if audit_data.seo.missing_alt_images > 0:
            issues.warnings.append(f"{audit_data.seo.missing_alt_images} images missing alt text")
        if not audit_data.accessibility.has_lang_attribute:
            issues.warnings.append("Missing lang attribute on HTML tag")
        
        # Suggestions
        if audit_data.performance.page_size_kb and audit_data.performance.page_size_kb > 1000:
            issues.suggestions.append("Page size is large - consider optimization")
        if not audit_data.performance.mobile_friendly:
            issues.suggestions.append("Add viewport meta tag for mobile responsiveness")
        if not audit_data.accessibility.aria_labels_present:
            issues.suggestions.append("Add ARIA labels for better accessibility")
        if not any(audit_data.security.security_headers.values()):
            issues.suggestions.append("Add security headers for better protection")
        
        return issues
    
    def _calculate_security_score(self, security: SecurityMetrics) -> int:
        """Calculate security score (0-100)"""
        score = 0
        
        if security.ssl_enabled:
            score += 50
        if security.ssl_valid:
            score += 10
        
        # Security headers (8 points each)
        for header_present in security.security_headers.values():
            if header_present:
                score += 8
        
        if not security.mixed_content:
            score += 10
        
        return min(100, score)
    
    def _calculate_seo_score(self, seo: SEOMetrics) -> int:
        """Calculate SEO score (0-100)"""
        score = 0
        
        if seo.title:
            score += 20
        if seo.meta_description:
            score += 20
        if seo.h1_count == 1:  # Exactly one H1
            score += 20
        if seo.total_headings > 0:
            score += 15
        
        # Alt tags
        if seo.total_images > 0:
            alt_ratio = (seo.total_images - seo.missing_alt_images) / seo.total_images
            score += int(25 * alt_ratio)
        else:
            score += 25  # No images is OK
        
        return min(100, score)
    
    def _calculate_performance_score(self, perf: PerformanceMetrics) -> int:
        """Calculate performance score (0-100)"""
        score = 50  # Base score
        
        # Page size
        if perf.page_size_kb:
            if perf.page_size_kb < 500:
                score += 20
            elif perf.page_size_kb < 1000:
                score += 10
        
        # Mobile friendly
        if perf.mobile_friendly:
            score += 20
        
        # Request count
        if perf.total_requests:
            if perf.total_requests < 50:
                score += 10
        
        return min(100, score)
    
    def _calculate_accessibility_score(self, access: AccessibilityMetrics) -> int:
        """Calculate accessibility score (0-100)"""
        score = 0
        
        if access.has_lang_attribute:
            score += 30
        if access.has_viewport_meta:
            score += 30
        if access.aria_labels_present:
            score += 40
        
        return min(100, score)
    
    async def get_global_audit_stats(self, user_id: str) -> GlobalAuditResponse:
        """Get global audit statistics for all user's leads"""
        
        # Get all audits for user
        cursor = self.collection.find({"user_id": user_id})
        audits = await cursor.to_list(length=None)
        
        if not audits:
            # Return empty stats
            return GlobalAuditResponse(
                user_id=user_id,
                stats=GlobalAuditStats(),
                generated_at=datetime.utcnow()
            )
        
        # Calculate statistics
        stats = GlobalAuditStats()
        stats.total_audits = len(audits)
        
        # Score averages
        scores = {
            "overall": [],
            "seo": [],
            "security": [],
            "performance": [],
            "accessibility": []
        }
        
        # Technology distribution
        cms_count = {}
        framework_count = {}
        
        # Security stats
        ssl_count = 0
        mobile_count = 0
        page_load_times = []
        
        # Process each audit
        for audit in audits:
            audit_data = audit.get("audit_data", {})
            
            # Scores
            scores["overall"].append(audit_data.get("overall_score", 0))
            scores["seo"].append(audit_data.get("seo_score", 0))
            scores["security"].append(audit_data.get("security_score", 0))
            scores["performance"].append(audit_data.get("performance_score", 0))
            scores["accessibility"].append(audit_data.get("accessibility_score", 0))
            
            # Technology
            tech = audit_data.get("technology", {})
            cms = tech.get("cms", "Unknown")
            framework = tech.get("framework")
            
            cms_count[cms] = cms_count.get(cms, 0) + 1
            if framework:
                framework_count[framework] = framework_count.get(framework, 0) + 1
            
            # Security
            security = audit_data.get("security", {})
            if security.get("ssl_enabled"):
                ssl_count += 1
            
            # Performance
            perf = audit_data.get("performance", {})
            if perf.get("mobile_friendly"):
                mobile_count += 1
            if perf.get("page_load_time_ms"):
                page_load_times.append(perf["page_load_time_ms"])
        
        # Calculate averages
        stats.avg_overall_score = sum(scores["overall"]) / len(scores["overall"]) if scores["overall"] else 0
        stats.avg_seo_score = sum(scores["seo"]) / len(scores["seo"]) if scores["seo"] else 0
        stats.avg_security_score = sum(scores["security"]) / len(scores["security"]) if scores["security"] else 0
        stats.avg_performance_score = sum(scores["performance"]) / len(scores["performance"]) if scores["performance"] else 0
        stats.avg_accessibility_score = sum(scores["accessibility"]) / len(scores["accessibility"]) if scores["accessibility"] else 0
        
        # Technology distribution
        stats.cms_distribution = cms_count
        stats.technology_distribution = {**cms_count, **framework_count}
        
        # Security percentages
        stats.ssl_enabled_count = ssl_count
        stats.ssl_enabled_percentage = (ssl_count / stats.total_audits * 100) if stats.total_audits > 0 else 0
        
        # Performance
        stats.mobile_friendly_count = mobile_count
        stats.mobile_friendly_percentage = (mobile_count / stats.total_audits * 100) if stats.total_audits > 0 else 0
        stats.avg_page_load_time_ms = sum(page_load_times) / len(page_load_times) if page_load_times else None
        
        # Most common issues (simplified)
        stats.most_common_issues = [
            {"issue": "No SSL certificate", "count": stats.total_audits - ssl_count},
            {"issue": "Not mobile friendly", "count": stats.total_audits - mobile_count}
        ]
        
        return GlobalAuditResponse(
            user_id=user_id,
            stats=stats,
            generated_at=datetime.utcnow()
        )
