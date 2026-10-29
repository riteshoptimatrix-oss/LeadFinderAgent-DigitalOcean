import urllib.parse
from typing import Optional
import re

def normalize_url(url: str, base_url: Optional[str] = None) -> str:
    """Normalize a URL for deduping."""
    if base_url and not url.startswith("http"):
        url = urllib.parse.urljoin(base_url, url)
        
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return ""
        
    # Remove fragments
    fragment_free = parsed._replace(fragment="")
    
    # Lowercase domain
    netloc = fragment_free.netloc.lower()
    
    # Remove trailing slash from path unless it's root
    path = fragment_free.path
    if path and path != "/" and path.endswith("/"):
        path = path.rstrip("/")
        
    # Filter tracking params
    query = fragment_free.query
    if query:
        params = urllib.parse.parse_qsl(query)
        filtered_params = [
            (k, v) for k, v in params 
            if not k.startswith("utm_") and not k.startswith("fbclid")
        ]
        query = urllib.parse.urlencode(sorted(filtered_params))
        
    normalized = urllib.parse.urlunparse(
        (fragment_free.scheme.lower(), netloc, path, fragment_free.params, query, "")
    )
    return normalized

def is_valid_crawl_url(url: str, base_domain: str) -> bool:
    """Check if URL is valid to crawl (same domain, no media)."""
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception:
        return False
        
    # Protocol
    if parsed.scheme not in ("http", "https"):
        return False
        
    # Domain
    if parsed.netloc.lower() != base_domain.lower() and not parsed.netloc.lower().endswith("." + base_domain.lower()):
        return False
        
    # Media extensions
    path = parsed.path.lower()
    ignored_exts = [
        ".pdf", ".zip", ".tar", ".gz", ".rar", 
        ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp",
        ".mp3", ".mp4", ".avi", ".mov",
        ".css", ".js", ".xml"
    ]
    if any(path.endswith(ext) for ext in ignored_exts):
        # Allow sitemap.xml
        if not path.endswith("sitemap.xml"):
            return False
            
    return True
