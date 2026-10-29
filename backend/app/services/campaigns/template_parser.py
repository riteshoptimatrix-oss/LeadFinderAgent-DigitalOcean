import re
from typing import Dict, Any

class TemplateParser:
    """Parses and interpolates {{Variables}} in campaign templates."""

    @staticmethod
    def parse(template_content: str, lead_data: Dict[str, Any]) -> str:
        """
        Replaces {{VariableName}} with the corresponding value from lead_data.
        E.g. {{BusinessName}} -> lead_data.get("name")
        """
        
        # Mapping from template variable name to standard Lead model keys
        key_mapping = {
            "business_name": "name",
            "businessname": "name",
            "owner_name": "owner_name",
            "city": "city",
            "state": "state",
            "country": "country",
            "industry": "category",
            "category": "category",
            "website": "website",
            "email": "email",
            "phone": "phone",
            "address": "address",
            "lead_score": "lead_score",
            "leadscore": "lead_score",
            "seo_score": "seo_score",
            "performance_score": "performance_score",
            "ui_score": "ui_score",
            "ux_score": "ux_score",
            "business_opportunity": "business_opportunity",
            "analysis_summary": "analysis_summary"
        }

        from datetime import datetime
        now = datetime.now()

        def replacer(match):
            var_name = match.group(1).strip()
            normalized_var = var_name.lower()
            
            # Handle dynamic time variables
            if normalized_var == "current_date":
                return now.strftime("%Y-%m-%d")
            elif normalized_var == "current_time":
                return now.strftime("%H:%M")
            
            # Find the actual dictionary key
            dict_key = key_mapping.get(normalized_var, normalized_var)
            
            # Fetch the value, fallback to empty string if missing or None
            value = lead_data.get(dict_key, "")
            return str(value) if value is not None else ""

        # Regex to find {{ Anything }}
        parsed_content = re.sub(r'\{\{(.*?)\}\}', replacer, template_content)
        return parsed_content

    @staticmethod
    def wrap_links_for_tracking(content: str, track_log_id: str) -> str:
        """
        Finds all <a href="URL"> tags and replaces the URL with a tracking redirect.
        """
        if not track_log_id:
            return content
            
        import urllib.parse
        
        def link_replacer(match):
            url = match.group(1)
            # Encode original url
            encoded_url = urllib.parse.quote(url, safe='')
            # Construct tracking url
            tracking_url = f"http://localhost:8000/api/v1/tracking/click/{track_log_id}?url={encoded_url}"
            return f'href="{tracking_url}"'
            
        return re.sub(r'href="(http[s]?://.*?)"', link_replacer, content)
