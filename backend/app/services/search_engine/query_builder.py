class QueryBuilder:
    """
    Translates user intent into structured search terms for the browser.
    """
    
    @staticmethod
    def build_query(keyword: str, area: str, city: str, state: str, country: str) -> str:
        """
        Builds a Google Maps search query string.
        Format: <Keyword> near <Area>, <City>, <State>, <Country>
        """
        parts = []
        if area:
            parts.append(area)
        if city:
            parts.append(city)
        if state:
            parts.append(state)
        if country:
            parts.append(country)
            
        location = ", ".join(parts)
        if location:
            return f"{keyword} near {location}"
        return keyword
