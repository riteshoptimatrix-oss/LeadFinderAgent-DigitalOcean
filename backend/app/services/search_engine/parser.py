import re
from typing import Dict, Any, Optional
from bs4 import BeautifulSoup
import logging

logger = logging.getLogger(__name__)

class ParsingError(Exception):
    """Raised when critical elements cannot be parsed from the DOM."""
    pass

class Parser:
    """
    Handles DOM parsing and extraction of rich lead data from Google Maps detailed views.
    """
    
    @staticmethod
    def extract_business_cards(html: str, current_url: str) -> Optional[Dict[str, Any]]:
        """
        Parses the detail view HTML and extracts structured data.
        Returns a dict or None if invalid.
        """
        soup = BeautifulSoup(html, 'html.parser')
        
        # In detail view, the main title is usually an h1
        h1_tags = soup.find_all('h1')
        name = None
        for h1 in h1_tags:
            text = h1.get_text(strip=True)
            if text and text.lower() != "results":
                name = text
                break
                
        if not name:
            raise ParsingError("Missing critical element: valid h1 (Business Name) not found in DOM.")
            
        url = current_url
        
        # Coordinates from URL: .../@lat,lng,zoom...
        coordinates = None
        lat_lng_match = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', current_url)
        if lat_lng_match:
            coordinates = {
                "latitude": float(lat_lng_match.group(1)),
                "longitude": float(lat_lng_match.group(2))
            }
            
        # Try to find rating and reviews
        rating = None
        reviews_count = None
        # Usually looking for "4.5 stars" or similar text near reviews like "(123)"
        rating_span = soup.find('span', string=re.compile(r'^\d\.\d$'))
        if rating_span:
            try:
                rating = float(rating_span.text)
            except ValueError:
                pass
                
        # Reviews count is often right after the rating in parentheses
        review_button = soup.find('button', string=re.compile(r'^\([\d,]+\)$'))
        if review_button:
            try:
                reviews_count = int(review_button.text.replace('(', '').replace(')', '').replace(',', ''))
            except ValueError:
                pass

        # Category is often a button near the top after reviews
        category = None
        category_button = soup.find('button', class_=re.compile('fontBodyMedium'))
        if category_button and category_button.text and not category_button.find('span'):
             # A heuristic: categories don't usually have spans inside them in the header row
             pass
        
        # Better heuristic for category: Google maps usually has it as a primary button text under the name
        # Let's extract all text from the top section and look for common patterns or just grab the second/third line.
        # Actually, let's grab it by finding the button that follows the rating/reviews.
        # For a more robust approach without perfect DOM selectors, we can find the button whose text is not a number.
        top_buttons = soup.select('button[class*="fontBodyMedium"]')
        for btn in top_buttons:
            text = btn.get_text(strip=True)
            if text and not re.match(r'^[\d.,()]+$', text) and '·' not in text:
                # Potential category
                if not category and len(text) > 3 and len(text) < 40:
                    category = text
                    break

        address = None
        phone = None
        website = None
        
        # Look for elements with data-item-id (buttons or anchor tags)
        for el in soup.select('[data-item-id]'):
            item_id = el.get('data-item-id', '')
            text = el.get_text(separator=' ', strip=True)
            
            if item_id.startswith('address:'):
                address = text
            elif item_id.startswith('phone:'):
                phone = text.replace('Phone:', '').strip()
            elif item_id.startswith('authority:'):
                # Websites are typically anchor tags with hrefs
                website = el.get('href')
                if not website:
                    website = text.replace('Website:', '').strip()
                
        if not website:
            for a in soup.find_all('a', href=True):
                href = a['href']
                if not href.startswith('http') or 'google.com' in href or 'gstatic' in href:
                    continue
                aria = a.get('aria-label', '').lower()
                text = a.get_text(separator=' ', strip=True).lower()
                if 'website' in aria or 'website' in text or 'visit' in aria:
                    website = href
                    break

        # Fallbacks using aria-labels
        if not phone:
            phone_btn = soup.find(attrs={'aria-label': re.compile(r'^Phone', re.IGNORECASE)})
            if phone_btn:
                # Prioritize the aria-label text over innerText to avoid unicode icons
                phone_label = phone_btn.get('aria-label', '')
                phone = phone_label.replace('Phone:', '').replace('Phone', '').strip()
                if not phone:
                    phone = phone_btn.get_text(separator=' ', strip=True)

        if not address:
            address_btn = soup.find(attrs={'aria-label': re.compile(r'^Address:', re.IGNORECASE)})
            if address_btn:
                # Prioritize the aria-label text over innerText to avoid unicode icons
                addr_label = address_btn.get('aria-label', '')
                address = addr_label.replace('Address:', '').strip()
                if not address:
                    address = address_btn.get_text(separator=' ', strip=True)
                    
        # Final cleanup of any rogue icons
        if phone:
            phone = phone.replace('\ue0b0', '').strip()
        if address:
            address = address.replace('\ue0c8', '').strip()

        # Opening Hours
        opening_hours = []
        hours_table = soup.find('table')
        if hours_table:
            for row in hours_table.find_all('tr'):
                cols = row.find_all('td')
                if len(cols) >= 2:
                    day = cols[0].get_text(strip=True)
                    hours = cols[1].get_text(strip=True)
                    opening_hours.append(f"{day}: {hours}")
                    
        # Images (usually in a specific button or div)
        images = []
        img_tags = soup.select('img[src*="ggpht.com"]')
        for img in img_tags:
            src = img.get('src')
            if src and src not in images:
                images.append(src)

        return {
            "name": name,
            "category": category,
            "url": url,
            "rating": rating,
            "reviews_count": reviews_count,
            "phone": phone,
            "website": website,
            "address": address,
            "coordinates": coordinates,
            "opening_hours": opening_hours,
            "images": images[:5] # keep top 5
        }
