import time
import httpx
import re
from typing import Dict, Any, List, Optional
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from datetime import datetime, timezone

from app.core.logger import logger
from app.db.database import get_db

class LeadEnrichmentEngine:
    """
    Independent Production-Grade Intelligent Lead Enrichment Engine.
    Transforms a raw Google Maps lead into a complete business profile.
    """
    
    def __init__(self, lead_data: Dict[str, Any]):
        self.lead = lead_data
        self.html_content = ""
        self.text_content = ""
        self.soup = None
        self.headers = {}
        self.final_url = ""
        self.status_code = None
        self.response_time = 0
        
        # Results
        self.website_info = {}
        self.contacts = {"emails": [], "phones": [], "whatsapp": []}
        self.technology = {}
        self.social = {}
        self.location = {}
        self.business_intel = {}
        self.scores = {}

    async def run_pipeline(self) -> Dict[str, Any]:
        """Execute the full enrichment pipeline."""
        start_time = time.time()
        
        await self._website_verification()
        
        if self.html_content:
            await self._contact_discovery()
            await self._technology_detection()
            await self._social_discovery()
            
        await self._location_engine()
        await self._business_intelligence()
        await self._quality_scoring()
        
        enrichment_data = {
            "website_verification": self.website_info,
            "contacts": self.contacts,
            "technology": self.technology,
            "social": self.social,
            "location_normalized": self.location,
            "business_intelligence": self.business_intel,
            "quality_scores": self.scores,
            "enrichment_metadata": {
                "version": "1.0",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "duration_seconds": round(time.time() - start_time, 2)
            }
        }
        
        return enrichment_data

    async def _website_verification(self):
        url = self.lead.get("website")
        if not url:
            self.website_info = {"exists": False, "status": "No Website"}
            return
            
        if not url.startswith("http"):
            url = f"https://{url}"
            
        start_t = time.time()
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/114.0.0.0 Safari/537.36"})
                
            self.status_code = response.status_code
            self.response_time = (time.time() - start_t) * 1000  # ms
            self.final_url = str(response.url)
            self.html_content = response.text
            self.headers = response.headers
            self.soup = BeautifulSoup(self.html_content, "html.parser")
            self.text_content = self.soup.get_text(separator=" ", strip=True)
            
            self.website_info = {
                "exists": True,
                "http_status": self.status_code,
                "https": self.final_url.startswith("https"),
                "canonical_url": self.final_url,
                "response_time_ms": round(self.response_time, 2),
                "homepage_title": self.soup.title.string.strip() if self.soup.title and self.soup.title.string else None,
                "language": self.soup.html.get("lang") if self.soup.html else None,
                "ssl_verified": True
            }
        except Exception as e:
            self.website_info = {
                "exists": False,
                "error": str(e),
                "http_status": 0
            }

    async def _contact_discovery(self):
        # Emails
        emails = re.findall(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', self.text_content)
        emails = [e for e in emails if not e.endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'))]
        self.contacts["emails"] = list(dict.fromkeys(emails))
        
        # Phones (Basic regex)
        phones = re.findall(r'\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{3,4}[-.\s]?\d{4}', self.text_content)
        clean_phones = []
        for p in phones:
            clean = re.sub(r'[^\d+]', '', p)
            if len(clean) >= 10:
                clean_phones.append(p.strip())
        self.contacts["phones"] = list(dict.fromkeys(clean_phones))
        
        # WhatsApp (wa.me links)
        wa_links = []
        if self.soup:
            for a in self.soup.find_all('a', href=True):
                href = a['href']
                if 'wa.me/' in href or 'api.whatsapp.com' in href:
                    wa_links.append(href)
        self.contacts["whatsapp"] = list(dict.fromkeys(wa_links))

    async def _technology_detection(self):
        tech = {
            "cms": None,
            "frontend_framework": None,
            "analytics": [],
            "tag_managers": [],
            "advertising": [],
            "marketing_tools": [],
            "security_headers": [],
            "confidence_score": 0
        }
        
        html_lower = self.html_content.lower()
        
        # CMS
        if 'wp-content' in html_lower or 'wordpress' in html_lower:
            tech["cms"] = "WordPress"
            tech["confidence_score"] += 20
        elif 'cdn.shopify.com' in html_lower:
            tech["cms"] = "Shopify"
            tech["confidence_score"] += 20
        elif 'wix.com' in html_lower:
            tech["cms"] = "Wix"
            tech["confidence_score"] += 20
            
        # Frontend
        if 'react' in html_lower or 'data-reactroot' in html_lower:
            tech["frontend_framework"] = "React"
            tech["confidence_score"] += 10
        elif 'ng-version' in html_lower:
            tech["frontend_framework"] = "Angular"
            tech["confidence_score"] += 10
        elif 'vue' in html_lower or 'data-v-' in html_lower:
            tech["frontend_framework"] = "Vue.js"
            tech["confidence_score"] += 10
            
        # Analytics
        if 'google-analytics.com' in html_lower or 'gtag(' in html_lower:
            tech["analytics"].append("Google Analytics")
        if 'googletagmanager.com' in html_lower:
            tech["tag_managers"].append("Google Tag Manager")
        if 'connect.facebook.net' in html_lower:
            tech["advertising"].append("Facebook Pixel")
            
        # Security Headers
        for h in ["strict-transport-security", "content-security-policy", "x-frame-options"]:
            if h in [k.lower() for k in self.headers.keys()]:
                tech["security_headers"].append(h)
                
        self.technology = tech

    async def _social_discovery(self):
        socials = {}
        patterns = {
            "facebook": r'facebook\.com/([^/]+)',
            "instagram": r'instagram\.com/([^/]+)',
            "linkedin": r'linkedin\.com/(company|in)/([^/]+)',
            "youtube": r'youtube\.com/([^/]+)',
            "twitter": r'(twitter\.com|x\.com)/([^/]+)',
            "tiktok": r'tiktok\.com/([^/]+)'
        }
        
        if self.soup:
            for a in self.soup.find_all('a', href=True):
                href = a['href']
                for platform, regex in patterns.items():
                    if re.search(regex, href, re.IGNORECASE):
                        if platform not in socials:
                            socials[platform] = href
                            
        self.social = socials

    async def _location_engine(self):
        addr = self.lead.get("address", "")
        self.location = {
            "original_address": addr,
            "country": self.lead.get("country"),
            "state": self.lead.get("state"),
            "city": self.lead.get("city"),
            "latitude": self.lead.get("latitude"),
            "longitude": self.lead.get("longitude")
        }
        
        # Simple extraction if city/state missing but address exists
        if addr and not self.location["city"]:
            parts = [p.strip() for p in addr.split(',')]
            if len(parts) >= 3:
                self.location["city"] = parts[-3]
                self.location["state"] = parts[-2]
                self.location["country"] = parts[-1]

    async def _business_intelligence(self):
        has_website = self.website_info.get("exists", False)
        has_socials = len(self.social) > 0
        has_analytics = len(self.technology.get("analytics", [])) > 0
        
        maturity = "Low"
        if has_website:
            maturity = "Medium"
        if has_website and has_socials and has_analytics:
            maturity = "High"
            
        self.business_intel = {
            "estimated_digital_maturity": maturity,
            "website_availability": "Available" if has_website else "Unavailable",
            "marketing_readiness": "Ready" if has_analytics else "Needs Setup",
            "primary_category": self.lead.get("category"),
            "industry": self.lead.get("category")
        }

    async def _quality_scoring(self):
        scores = {}
        
        # Contact Completeness (max 100)
        c_score = 0
        if self.contacts.get("emails"): c_score += 40
        if self.contacts.get("phones"): c_score += 40
        if self.contacts.get("whatsapp"): c_score += 20
        elif self.lead.get("phone"): c_score += 20  # from google maps
        scores["contact_completeness"] = min(100, c_score)
        
        # Website Quality (max 100)
        w_score = 0
        if self.website_info.get("exists"):
            w_score += 40
            if self.website_info.get("https"): w_score += 20
            if self.website_info.get("response_time_ms", 9999) < 2000: w_score += 20
            if self.website_info.get("homepage_title"): w_score += 20
        scores["website_quality"] = w_score
        
        # Tech Completeness (max 100)
        t_score = self.technology.get("confidence_score", 0)
        scores["technology_completeness"] = min(100, t_score)
        
        # Location Completeness (max 100)
        l_score = 0
        if self.location.get("latitude"): l_score += 30
        if self.location.get("city"): l_score += 30
        if self.location.get("original_address"): l_score += 40
        scores["location_completeness"] = l_score
        
        # Profile Completeness (max 100)
        p_score = 0
        if self.lead.get("name"): p_score += 20
        if self.lead.get("category"): p_score += 20
        if self.social: p_score += 30
        if self.lead.get("google_rating"): p_score += 30
        scores["business_profile_completeness"] = p_score
        
        # Overall Lead Completeness %
        total_weights = 5
        completeness = (
            scores["contact_completeness"] + 
            scores["website_quality"] + 
            scores["technology_completeness"] + 
            scores["location_completeness"] + 
            scores["business_profile_completeness"]
        ) / total_weights
        
        scores["lead_completeness_percent"] = round(completeness, 1)
        scores["overall_lead_quality"] = scores["lead_completeness_percent"]
        
        self.scores = scores
