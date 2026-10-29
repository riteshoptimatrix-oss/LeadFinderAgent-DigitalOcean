import re
from typing import List, Dict, Any
from app.models.contact import ContactExtracted

class ContactExtractor:
    def __init__(self):
        # RFC 5322 Email Regex
        self.email_regex = re.compile(r"""(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])""", re.IGNORECASE)
        # E.164 and generic phone Regex
        self.phone_regex = re.compile(r'(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?')
        
        # Social media / messaging URL patterns for text scanning
        self._social_patterns = {
            "LinkedIn": re.compile(r'linkedin\.com/(?:company|in)/[a-zA-Z0-9_-]+', re.IGNORECASE),
            "Twitter": re.compile(r'(?:twitter\.com|x\.com)/[a-zA-Z0-9_]+', re.IGNORECASE),
            "Facebook": re.compile(r'facebook\.com/[a-zA-Z0-9_.]+', re.IGNORECASE),
            "Instagram": re.compile(r'instagram\.com/[a-zA-Z0-9_.]+', re.IGNORECASE),
            "YouTube": re.compile(r'youtube\.com/(?:channel|c|user|@)/[a-zA-Z0-9_-]+', re.IGNORECASE),
            "GitHub": re.compile(r'github\.com/[a-zA-Z0-9_-]+', re.IGNORECASE),
            "Pinterest": re.compile(r'pinterest\.com/[a-zA-Z0-9_]+', re.IGNORECASE),
            "Threads": re.compile(r'threads\.net/@?[a-zA-Z0-9_.]+', re.IGNORECASE),
            "Telegram": re.compile(r'(?:t\.me|telegram\.me)/[a-zA-Z0-9_]+', re.IGNORECASE),
            "Medium": re.compile(r'(?:medium\.com/@?[a-zA-Z0-9_-]+|@[\w-]+/medium\.com)', re.IGNORECASE),
            "TikTok": re.compile(r'tiktok\.com/@[a-zA-Z0-9_.]+', re.IGNORECASE),
            "WhatsApp": re.compile(r'(?:wa\.me|api\.whatsapp\.com)/[0-9]+', re.IGNORECASE),
            "Google Maps": re.compile(r'(?:maps\.google\.com|goo\.gl/maps|google\.com/maps)', re.IGNORECASE),
        }

        # Business-hours pattern: "Mon-Fri: 9am - 6pm" / "9:00 AM – 5:00 PM"
        self._hours_pattern = re.compile(
            r'(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)'
            r'(?:\s*[-–]\s*(?:mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday))?'
            r'\s*[:\-]\s*'
            r'\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?',
            re.IGNORECASE,
        )

        # Address pattern: street + number, optionally with city/state/zip
        self._address_pattern = re.compile(
            r'\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl)\b'
            r'(?:[,\s]+[A-Z][a-zA-Z]+(?:[,\s]+[A-Z]{2})?(?:\s+\d{5})?)?',
            re.IGNORECASE,
        )
        
        # Email classification keywords
        self._email_classifiers = {
            "support": ["support", "help", "helpdesk", "assistance"],
            "sales": ["sales", "biz", "business", "inquiry", "enquiry"],
            "hr": ["hr", "human", "career", "careers", "jobs", "recruit"],
            "marketing": ["marketing", "promo", "media", "press"],
            "info": ["info", "general", "contact", "hello", "hi"],
        }

    def _classify_email(self, email: str) -> str:
        """Classify email based on local part."""
        local = email.split("@")[0].lower()
        for classification, keywords in self._email_classifiers.items():
            if any(kw in local for kw in keywords):
                return classification
        return "general"

    def extract_from_text(self, text: str, source_url: str) -> List[ContactExtracted]:
        extracted = []
        
        # Emails - use simplified regex for reliable extraction
        simple_email_regex = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
        found_emails = simple_email_regex.findall(text)
        for email in set(found_emails):
            # Filter out common false positives
            email_lower = email.lower()
            if email_lower.endswith(('.png', '.jpg', '.gif', '.svg', '.css', '.js')):
                continue
            if 'example.com' in email_lower or 'test.com' in email_lower:
                continue
            
            classification = self._classify_email(email_lower)
            extracted.append(ContactExtracted(
                type="Email",
                value=email_lower,
                source_url=source_url,
                confidence_score=95
            ))
            
        # Phones
        for match in self.phone_regex.finditer(text):
            phone = "".join([g for g in match.groups() if g])
            if len(phone) >= 10:
                formatted = match.group(0).strip()
                extracted.append(ContactExtracted(
                    type="Phone",
                    value=formatted,
                    source_url=source_url,
                    confidence_score=80
                ))
        
        # Social media links found in text content
        for social_type, pattern in self._social_patterns.items():
            matches = pattern.findall(text)
            for match in set(matches):
                url = match if match.startswith("http") else f"https://{match}"
                extracted.append(ContactExtracted(
                    type=social_type,
                    value=url,
                    source_url=source_url,
                    confidence_score=90
                ))

        # Business hours found in text content
        for hours in self._hours_pattern.findall(text):
            hours = hours.strip()
            if hours:
                extracted.append(ContactExtracted(
                    type="BusinessHours",
                    value=hours,
                    source_url=source_url,
                    confidence_score=85
                ))

        # Physical address found in text content
        for addr in self._address_pattern.findall(text):
            addr = addr.strip()
            if len(addr) >= 8:
                extracted.append(ContactExtracted(
                    type="Address",
                    value=addr,
                    source_url=source_url,
                    confidence_score=85
                ))

        return extracted

    def extract_from_html(self, html: str, source_url: str) -> List[ContactExtracted]:
        from bs4 import BeautifulSoup
        extracted = []
        soup = BeautifulSoup(html, 'html.parser')

        for a in soup.find_all('a', href=True):
            href = a['href']
            href_lower = href.lower()

            if href_lower.startswith('mailto:'):
                email = href.replace('mailto:', '').split('?')[0].strip()
                if email:
                    extracted.append(ContactExtracted(
                        type="Email", value=email, source_url=source_url, confidence_score=100
                    ))
            elif href_lower.startswith('tel:'):
                phone = href.replace('tel:', '').strip()
                if phone:
                    extracted.append(ContactExtracted(
                        type="Phone", value=phone, source_url=source_url, confidence_score=100
                    ))
            elif 'whatsapp.com' in href_lower or 'wa.me' in href_lower:
                extracted.append(ContactExtracted(
                    type="WhatsApp", value=href, source_url=source_url, confidence_score=100
                ))
            elif 't.me' in href_lower or 'telegram.me' in href_lower:
                extracted.append(ContactExtracted(
                    type="Telegram", value=href, source_url=source_url, confidence_score=100
                ))
            elif 'linkedin.com/company' in href_lower or 'linkedin.com/in' in href_lower:
                extracted.append(ContactExtracted(
                    type="LinkedIn", value=href, source_url=source_url, confidence_score=100
                ))
            elif 'twitter.com' in href_lower or 'x.com' in href_lower:
                extracted.append(ContactExtracted(
                    type="Twitter", value=href, source_url=source_url, confidence_score=100
                ))
            elif 'facebook.com' in href_lower or 'fb.com' in href_lower or 'fb.me' in href_lower:
                extracted.append(ContactExtracted(
                    type="Facebook", value=href, source_url=source_url, confidence_score=100
                ))
            elif 'instagram.com' in href_lower:
                extracted.append(ContactExtracted(
                    type="Instagram", value=href, source_url=source_url, confidence_score=100
                ))
            elif 'youtube.com' in href_lower or 'youtu.be' in href_lower:
                extracted.append(ContactExtracted(
                    type="YouTube", value=href, source_url=source_url, confidence_score=100
                ))
            elif 'github.com' in href_lower:
                extracted.append(ContactExtracted(
                    type="GitHub", value=href, source_url=source_url, confidence_score=100
                ))
            elif 'pinterest.com' in href_lower:
                extracted.append(ContactExtracted(
                    type="Pinterest", value=href, source_url=source_url, confidence_score=100
                ))
            elif 'threads.net' in href_lower:
                extracted.append(ContactExtracted(
                    type="Threads", value=href, source_url=source_url, confidence_score=100
                ))
            elif 'medium.com' in href_lower:
                extracted.append(ContactExtracted(
                    type="Medium", value=href, source_url=source_url, confidence_score=100
                ))
            elif 'tiktok.com' in href_lower:
                extracted.append(ContactExtracted(
                    type="TikTok", value=href, source_url=source_url, confidence_score=100
                ))
            elif 'maps.google.com' in href_lower or 'goo.gl/maps' in href_lower or 'google.com/maps' in href_lower:
                extracted.append(ContactExtracted(
                    type="GoogleMaps", value=href, source_url=source_url, confidence_score=100
                ))
        
        # Extract from meta tags
        for meta in soup.find_all('meta'):
            name = (meta.get('name') or '').lower()
            content = meta.get('content', '')
            if name in ['author', 'contact'] and content:
                # Check if it looks like an email
                if '@' in content and '.' in content.split('@')[-1]:
                    extracted.append(ContactExtracted(
                        type="Email", value=content.lower(), source_url=source_url, confidence_score=95
                    ))
        
        # Extract from structured data (JSON-LD)
        for script in soup.find_all('script', type='application/ld+json'):
            try:
                import json
                data = json.loads(script.string)
                if isinstance(data, dict):
                    self._extract_from_structured_data(data, source_url, extracted)
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict):
                            self._extract_from_structured_data(item, source_url, extracted)
            except Exception:
                pass

        # Contact form detection (Phase 4 — contact forms)
        for form in soup.find_all('form'):
            action = (form.get('action') or '').lower()
            form_text = form.get_text(' ', strip=True).lower()
            is_contact = (
                'contact' in action
                or 'contact' in form_text
                or any(k in action for k in ['/message', '/enquiry', '/inquiry', '/support', '/get-in-touch'])
                or any(inp.get('type') == 'email' for inp in form.find_all('input'))
                or any('email' in (inp.get('name') or '').lower() for inp in form.find_all('input'))
            )
            if is_contact:
                form_url = form.get('action') or source_url
                if not form_url.startswith('http'):
                    from urllib.parse import urljoin
                    form_url = urljoin(source_url, form_url) if form_url else source_url
                extracted.append(ContactExtracted(
                    type="ContactForm",
                    value=form_url,
                    source_url=source_url,
                    confidence_score=90
                ))

        # Business hours + address from visible page text (Phase 4)
        page_text = soup.get_text(' ', strip=True)
        for hours in self._hours_pattern.findall(page_text):
            hours = hours.strip()
            if hours:
                extracted.append(ContactExtracted(
                    type="BusinessHours", value=hours, source_url=source_url, confidence_score=85
                ))
        for addr in self._address_pattern.findall(page_text):
            addr = addr.strip()
            if len(addr) >= 8:
                extracted.append(ContactExtracted(
                    type="Address", value=addr, source_url=source_url, confidence_score=85
                ))

        return extracted
    
    def _extract_from_structured_data(self, data: dict, source_url: str, extracted: List[ContactExtracted]):
        """Extract contacts from JSON-LD structured data."""
        # Owner / founder detection (Phase 4)
        for owner_key in ("founder", "founders", "author", "creator", "ownershipPerson"):
            owner = data.get(owner_key)
            if isinstance(owner, dict):
                name = owner.get("name")
                if name:
                    extracted.append(ContactExtracted(
                        type="Owner", value=name, source_url=source_url, confidence_score=90
                    ))
            elif isinstance(owner, list):
                for o in owner:
                    if isinstance(o, dict) and o.get("name"):
                        extracted.append(ContactExtracted(
                            type="Owner", value=o.get("name"), source_url=source_url, confidence_score=90
                        ))
            elif isinstance(owner, str) and owner:
                extracted.append(ContactExtracted(
                    type="Owner", value=owner, source_url=source_url, confidence_score=90
                ))

        # Check for contactpoint
        contact_point = data.get("contactPoint") or data.get("contactPoint")
        if isinstance(contact_point, dict):
            email = contact_point.get("email")
            if email:
                extracted.append(ContactExtracted(
                    type="Email", value=email.lower(), source_url=source_url, confidence_score=100
                ))
            phone = contact_point.get("telephone")
            if phone:
                extracted.append(ContactExtracted(
                    type="Phone", value=phone, source_url=source_url, confidence_score=100
                ))
        
        # Check for sameAs (social links)
        same_as = data.get("sameAs") or []
        if isinstance(same_as, str):
            same_as = [same_as]
        for url in same_as:
            if isinstance(url, str):
                url_lower = url.lower()
                if 'linkedin.com' in url_lower:
                    extracted.append(ContactExtracted(type="LinkedIn", value=url, source_url=source_url, confidence_score=100))
                elif 'twitter.com' in url_lower or 'x.com' in url_lower:
                    extracted.append(ContactExtracted(type="Twitter", value=url, source_url=source_url, confidence_score=100))
                elif 'facebook.com' in url_lower:
                    extracted.append(ContactExtracted(type="Facebook", value=url, source_url=source_url, confidence_score=100))
                elif 'instagram.com' in url_lower:
                    extracted.append(ContactExtracted(type="Instagram", value=url, source_url=source_url, confidence_score=100))
                elif 'youtube.com' in url_lower:
                    extracted.append(ContactExtracted(type="YouTube", value=url, source_url=source_url, confidence_score=100))
                elif 'github.com' in url_lower:
                    extracted.append(ContactExtracted(type="GitHub", value=url, source_url=source_url, confidence_score=100))
