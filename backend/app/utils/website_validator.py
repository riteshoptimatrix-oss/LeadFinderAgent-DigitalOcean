import re
from urllib.parse import urlparse

# Extended list of non-website domains
NON_WEBSITE_DOMAINS = {
    # Social media
    "facebook.com", "instagram.com", "linkedin.com", "x.com", "twitter.com",
    "youtube.com", "tiktok.com", "pinterest.com", "snapchat.com", "reddit.com",
    "threads.net", "weibo.com", "tumblr.com", "quora.com",
    "fb.com", "t.co", "youtu.be", "lnkd.in", "instagr.am", "fb.watch", "m.me",
    "behance.net", "dribbble.com", "medium.com", "substack.com", "blogger.com",
    # Google Services / Maps / Business
    "maps.google.com", "business.google.com", "g.page",
    "plus.google.com", "search.google.com", "drive.google.com", "docs.google.com",
    "googleusercontent.com",
    # WhatsApp / Comm
    "wa.me", "whatsapp.com", "t.me", "telegram.me", "viber.com",
    "api.whatsapp.com", "chat.whatsapp.com", "wa.link",
    # Directory / Aggregators / Bookings / E-commerce
    "linktr.ee", "carrd.co", "yelp.com", "tripadvisor.com", "justdial.com",
    "indiamart.com", "trustpilot.com", "yellowpages.com", "about.me",
    "booking.com", "airbnb.com", "agoda.com", "alibaba.com", "amazon.com",
    "amazon.in", "ebay.com", "etsy.com",
    # Free Website Builders
    "wixsite.com", "myfreesites.com", "wordpress.com", "blogspot.com", 
    "weebly.com", "squarespace.com", "godaddysites.com", "webflow.io", 
    "notion.site", "shopify.com", "mystrikingly.com", "business.site"
}

def is_valid_website(url: str) -> bool:
    """
    Validates whether a given URL is a legitimate professional/business website.
    It aggressively rejects social media profiles, Google Maps links, phone numbers,
    email addresses, empty fields, and malformed inputs.
    """
    if not url:
        return False
        
    url = str(url).strip().lower()
    
    # 1. Empty or missing website fields
    if not url or url in ["-", "n/a", "none", "null", "no", "na", "unknown", "not available"]:
        return False
        
    # 2. Check for email addresses
    if "@" in url:
        return False
        
    # 3. Check for mobile or telephone numbers
    # Remove common phone characters and check if it's mostly digits
    phone_chars = re.sub(r'[\+\-\(\)\s\.]', '', url)
    if phone_chars.isdigit() and len(phone_chars) >= 7:
        return False
        
    # 4. Any non-website links or invalid URLs
    # Whitespace inside the string usually means it's not a URL
    if " " in url:
        return False
        
    # If the URL is just google.com, we should probably reject it unless it's genuinely Google's corporate lead
    # For now we'll handle the specific paths like /maps later.
        
    # Ensure scheme for parsing
    if not url.startswith(("http://", "https://")):
        # Basic heuristic for phone numbers that sneak past
        if re.fullmatch(r"[\+\d\-\(\)\s]+", url):
            return False
        url = "http://" + url
        
    try:
        parsed = urlparse(url)
        # Handle cases where urlparse doesn't parse netloc properly without //
        host = parsed.netloc or parsed.path.split('/')[0]
        path = parsed.path
    except ValueError:
        return False
        
    if not host:
        return False
        
    # Clean host
    host = host.removeprefix("www.")
    
    # Strip the mobile "m." prefix only when the remainder still looks like a host (e.g. m.facebook.com)
    # never when "m" is the whole label (like m.me)
    if host.startswith("m.") and "." in host[2:]:
        host = host[2:]

    # Remove basic auth if present in host (e.g., user:pass@host)
    if "@" in host:
        host = host.split("@")[-1]

    if not host or "." not in host or host.endswith("."):
        return False
        
    # Ensure it only has valid hostname characters
    if not re.fullmatch(r"[a-z0-9\-\.]+", host):
        return False

    # Check Google Maps links formatted as paths (google.com/maps)
    if "google.com" in host and "/maps" in path:
        return False
    if "maps.app.goo.gl" in host:
        return False

    # 5. Social media profile URLs, Google Business Profile links, WhatsApp numbers/links
    for domain in NON_WEBSITE_DOMAINS:
        if host == domain or host.endswith("." + domain):
            # Special exception: sites.google.com hosts real business websites.
            if host.startswith("sites.") and domain == "google.com":
                continue
            return False
            
    # Basic domain structure validation (e.g., must have a TLD of at least 2 chars)
    parts = host.split('.')
    if len(parts) >= 2:
        tld = parts[-1]
        if len(tld) < 2 or not tld.isalpha():
            return False

    return True
