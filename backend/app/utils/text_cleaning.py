import re
from typing import Optional

def clean_business_or_lead_name(raw_name: Optional[str], max_chars: int = 40) -> str:
    """
    Cleans up noisy, long Google Maps / directory business titles into crisp, human-friendly names.
    Removes slogans, taglines, colon descriptions, keywords, pipes, and excessive descriptors
    so that messages (e.g. WhatsApp / Email) sound natural, concise, and professional.

    Examples:
      'LIT Independent Training Gym: Independent trainer\'s gym. A place to train your clients'
      -> 'LIT Independent Training Gym'

      'ABC Bakery - Best Cakes, Pastries, Birthday Cakes in Ahmedabad'
      -> 'ABC Bakery'

      'Dr. Sharma Dental Clinic | Top Rated Dentist | Root Canal & Teeth Whitening'
      -> 'Dr. Sharma Dental Clinic'

      'Sweet Delights Bakery (Best Birthday Cakes & Pastries in Town)'
      -> 'Sweet Delights Bakery'
    """
    if not raw_name:
        return ""
        
    name = str(raw_name).strip()
    # Remove leading/trailing quotation marks or decorative brackets
    name = re.sub(r'^["\'`“”]+|["\'`“”]+$', '', name).strip()
    
    # 1. Colon delimiter: 'Brand Name: Slogan / Keywords / Long Description'
    if ":" in name:
        parts = [p.strip() for p in name.split(":") if p.strip()]
        if parts and len(parts[0]) >= 3:
            name = parts[0]
            
    # 2. Pipe delimiter: 'Brand Name | Keywords | Doctor Name'
    if "|" in name:
        parts = [p.strip() for p in name.split("|") if p.strip()]
        if parts and len(parts[0]) >= 3:
            name = parts[0]
            
    # 3. Dashes with surrounding spaces: ' - ', ' – ', ' — ', '--'
    dash_split = re.split(r'\s+[-–—]\s+|--', name)
    if len(dash_split) > 1 and len(dash_split[0].strip()) >= 3:
        name = dash_split[0].strip()
        
    # 4. Slashes with surrounding spaces: ' / '
    slash_split = re.split(r'\s+/\s+', name)
    if len(slash_split) > 1 and len(slash_split[0].strip()) >= 3:
        name = slash_split[0].strip()
        
    # 5. Tilde delimiter: ' ~ '
    if "~" in name:
        parts = [p.strip() for p in name.split("~") if p.strip()]
        if parts and len(parts[0]) >= 3:
            name = parts[0]

    # 6. Remove trailing parenthetical taglines e.g. '(Best Gym in Town)', '(Wholesale & Retail)'
    name = re.sub(
        r'\s*\([^)]*(?:best|tagline|unit|floor|opp|near|behind|branch|estd|since|trainer|gym|shop|service|hub|wholesal|retail)[^)]*\)$', 
        '', 
        name, 
        flags=re.IGNORECASE
    ).strip()
    name = re.sub(r'\s*\([^)]*[\w\s]{15,}\)$', '', name).strip()

    # 7. Sentence separation with descriptive slogan starter
    sentence_tagline_match = re.search(
        r'\.\s+(?:A\s+|The\s+|We\s+|Your\s+|Best\s+|Top\s+|One-stop\s+|Leading\s+|Complete\s+)', 
        name, 
        flags=re.IGNORECASE
    )
    if sentence_tagline_match:
        cand = name[:sentence_tagline_match.start()].strip()
        if len(cand) >= 3:
            name = cand

    # 8. Clean trailing/leading punctuation and normalize spaces
    name = re.sub(r'[\s,.;:\-–—|/]+$', '', name).strip()
    name = re.sub(r'^[\s,.;:\-–—|/]+', '', name).strip()
    name = re.sub(r'\s+', ' ', name)

    # 9. Clean truncate at word boundary if still excessively long
    if len(name) > max_chars:
        truncated = name[:max_chars].rsplit(' ', 1)[0]
        if len(truncated) >= 8:
            name = truncated.rstrip(' ,.;:-')
            
    return name
