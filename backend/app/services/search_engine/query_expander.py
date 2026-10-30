import logging
import re
from typing import List, Optional, Set

logger = logging.getLogger(__name__)

# Comprehensive industry ontology and Google Maps sub-categories / synonyms
INDUSTRY_SYNONYMS = {
    "tech": [
        "Software Company",
        "IT Services",
        "Information Technology Service",
        "Computer Support and Services",
        "IT Consultant",
        "Web Development Company",
        "Software Development",
        "Cyber Security Company",
        "Cloud Computing Services",
        "Managed IT Services",
        "Computer Consultant",
        "Network Solutions",
        "Tech Support",
        "Computer Repair Service",
        "App Development Company",
        "Digital Marketing Agency",
        "Technology Solutions Provider",
        "Data Analytics Company",
        "Internet Service Provider",
        "Website Designer",
    ],
    "restaurant": [
        "Restaurant",
        "Cafe",
        "Bistro",
        "Fine Dining Restaurant",
        "Bar and Grill",
        "Bakery",
        "Catering Food Service",
        "Diner",
        "Pizzeria",
        "Coffee Shop",
        "Lounge",
        "Seafood Restaurant",
        "Steak House",
        "Family Restaurant",
        "Brunch Restaurant",
        "Fast Food Restaurant",
    ],
    "real_estate": [
        "Real Estate Agency",
        "Real Estate Consultant",
        "Property Management Company",
        "Commercial Real Estate Agency",
        "Realtor",
        "Real Estate Appraiser",
        "Apartment Rental Agency",
        "Real Estate Developers",
        "Mortgage Broker",
        "Title Company",
        "Home Inspector",
    ],
    "healthcare": [
        "Medical Clinic",
        "Doctor",
        "Dental Clinic",
        "Dentist",
        "Hospital",
        "Physician",
        "Physical Therapy Clinic",
        "Urgent Care Center",
        "Pediatrician",
        "Chiropractor",
        "Dermatologist",
        "Optometrist",
        "Pharmacy",
        "Orthopedic Surgeon",
        "Wellness Center",
    ],
    "legal": [
        "Law Firm",
        "Lawyer",
        "Attorney",
        "Legal Services",
        "Corporate Law Firm",
        "Criminal Justice Attorney",
        "Personal Injury Attorney",
        "Employment Attorney",
        "Family Law Attorney",
        "Estate Planning Attorney",
        "Tax Attorney",
        "Immigration Attorney",
    ],
    "finance": [
        "Accounting Firm",
        "Accountant",
        "Certified Public Accountant",
        "Bookkeeping Service",
        "Tax Preparation Service",
        "Financial Planner",
        "Wealth Management",
        "Investment Firm",
        "Insurance Agency",
        "Financial Consultant",
        "Loan Agency",
        "Credit Union",
    ],
    "construction": [
        "General Contractor",
        "Plumber",
        "Electrician",
        "HVAC Contractor",
        "Roofing Contractor",
        "Painting Contractor",
        "Landscaping Service",
        "Flooring Contractor",
        "Home Builder",
        "Handyman Service",
        "Remodeling Contractor",
        "Carpentry Contractor",
        "Masonry Contractor",
    ],
    "automotive": [
        "Auto Repair Shop",
        "Car Dealer",
        "Used Car Dealer",
        "Auto Body Shop",
        "Tire Shop",
        "Mechanic",
        "Car Wash",
        "Car Rental Agency",
        "Auto Detailing",
        "Brake Shop",
        "Transmission Shop",
        "Oil Change Service",
    ],
    "fitness": [
        "Gym",
        "Fitness Center",
        "Personal Trainer",
        "Yoga Studio",
        "Pilates Studio",
        "Martial Arts School",
        "Crossfit Gym",
        "Boxing Gym",
        "Health Club",
        "Physical Fitness Program",
    ],
    "beauty": [
        "Hair Salon",
        "Beauty Salon",
        "Barber Shop",
        "Day Spa",
        "Nail Salon",
        "Massage Therapist",
        "Skin Care Clinic",
        "Waxing Hair Removal Service",
        "Eyelash Salon",
        "Tattoo Shop",
    ],
    "retail": [
        "Clothing Store",
        "Boutique",
        "Shoe Store",
        "Electronics Store",
        "Furniture Store",
        "Jewelry Store",
        "Supermarket",
        "Wholesaler",
        "Department Store",
        "Home Goods Store",
        "Gift Shop",
    ],
    "education": [
        "School",
        "Tutoring Service",
        "Language School",
        "Training Center",
        "Coaching Institute",
        "Music School",
        "Dance School",
        "Driving School",
        "Preschool",
    ],
    "manufacturing": [
        "Manufacturer",
        "Supplier",
        "Industrial Equipment Supplier",
        "Fabrication Engineer",
        "Warehouse",
        "Packaging Company",
        "Distribution Center",
        "Machine Shop",
    ],
    "marketing": [
        "Digital Marketing Agency",
        "Advertising Agency",
        "SEO Agency",
        "Social Media Marketing",
        "Public Relations Firm",
        "Branding Agency",
        "Graphic Designer",
        "Video Production Service",
        "Marketing Consultant",
    ],
}

# Industry keyword trigger patterns
CATEGORY_TRIGGERS = {
    "tech": ["it", "software", "tech", "computer", "developer", "development", "data", "cloud", "cyber", "web", "network", "system", "programming", "ai", "hardware", "internet"],
    "restaurant": ["restaurant", "food", "cafe", "bistro", "dining", "bar", "bakery", "diner", "pizza", "coffee", "eatery", "burger", "taco", "pub", "grill", "hotel"],
    "real_estate": ["real estate", "realtor", "property", "apartment", "housing", "broker", "mortgage", "rental", "homes", "condo", "estate"],
    "healthcare": ["doctor", "clinic", "hospital", "dentist", "dental", "medical", "physician", "health", "care", "therapy", "chiropractor", "pharmacy", "dermatologist"],
    "legal": ["law", "lawyer", "attorney", "legal", "advocate", "counsel", "court", "justice", "solicitor"],
    "finance": ["accountant", "accounting", "cpa", "tax", "finance", "financial", "bookkeeping", "wealth", "investment", "insurance", "bank", "loan"],
    "construction": ["contractor", "construction", "plumber", "plumbing", "electrician", "electrical", "hvac", "roofing", "painter", "painting", "builder", "flooring", "handyman", "landscaping"],
    "automotive": ["auto", "car", "mechanic", "vehicle", "tire", "motor", "garage", "dealer", "repair", "body shop"],
    "fitness": ["gym", "fitness", "yoga", "trainer", "workout", "crossfit", "pilates", "martial arts", "boxing"],
    "beauty": ["salon", "spa", "barber", "hair", "nail", "beauty", "massage", "skin", "makeup", "cosmetics"],
    "retail": ["store", "shop", "clothing", "boutique", "retail", "supermarket", "grocery", "mall", "market"],
    "education": ["school", "college", "tutoring", "tutor", "academy", "training", "coaching", "institute", "classes"],
    "manufacturing": ["manufacturer", "manufacturing", "factory", "industrial", "fabrication", "producer", "warehouse", "wholesaler"],
    "marketing": ["marketing", "advertising", "seo", "branding", "digital agency", "pr", "media"],
}

# Metro & surrounding cities dictionary for common clusters
METRO_NEIGHBORS = {
    # New Jersey & NY Metro
    "west new york": [
        "Union City", "North Bergen", "Weehawken", "Guttenberg", "Hoboken",
        "Jersey City", "Secaucus", "Fairview", "Cliffside Park", "Edgewater",
        "Bayonne", "Fort Lee", "Newark", "Hackensack", "Kearny", "Passaic",
        "Rutherford", "Clifton", "Englewood", "Paramus", "Hudson County", "Bergen County"
    ],
    "jersey city": [
        "Hoboken", "Union City", "West New York", "North Bergen", "Bayonne",
        "Newark", "Secaucus", "Weehawken", "Kearny", "Harrison", "Hudson County"
    ],
    "hoboken": [
        "Jersey City", "Weehawken", "Union City", "West New York", "North Bergen",
        "Bayonne", "Secaucus", "Newark", "Hudson County"
    ],
    "newark": [
        "Jersey City", "Harrison", "Kearny", "Elizabeth", "East Orange",
        "Irvington", "Bloomfield", "Belleville", "Union City", "Essex County", "Hudson County"
    ],
    "union city": [
        "West New York", "North Bergen", "Weehawken", "Hoboken", "Jersey City",
        "Secaucus", "Guttenberg", "Fairview", "Hudson County"
    ],
    "north bergen": [
        "West New York", "Union City", "Guttenberg", "Fairview", "Cliffside Park",
        "Secaucus", "Weehawken", "Jersey City", "Hudson County", "Bergen County"
    ],
    "new york": [
        "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island",
        "Midtown", "Downtown", "Long Island City", "Astoria", "Flushing", "Williamsburg"
    ],
    "new york city": [
        "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island",
        "Midtown", "Downtown", "Long Island City", "Astoria", "Flushing", "Williamsburg"
    ],

    # New Mexico
    "albuquerque": [
        "Rio Rancho", "Corrales", "Bernalillo", "Los Ranchos de Albuquerque",
        "South Valley", "North Valley", "Los Lunas", "Belen", "Bernalillo County"
    ],

    # California
    "los angeles": [
        "Santa Monica", "Pasadena", "Glendale", "Burbank", "Long Beach",
        "Torrance", "Inglewood", "Culver City", "Beverly Hills", "Downey", "El Monte", "West Hollywood"
    ],
    "san francisco": [
        "Oakland", "Berkeley", "San Jose", "Sunnyvale", "Santa Clara",
        "San Mateo", "Fremont", "Palo Alto", "Redwood City", "Mountain View"
    ],
    "san diego": [
        "Chula Vista", "Oceanside", "Escondido", "Carlsbad", "El Cajon",
        "Vista", "San Marcos", "Encinitas", "La Jolla"
    ],

    # Texas
    "dallas": [
        "Fort Worth", "Arlington", "Plano", "Irving", "Garland",
        "Frisco", "McKinney", "Grand Prairie", "Denton", "Richardson", "Carrollton"
    ],
    "houston": [
        "Pasadena", "Pearland", "Sugar Land", "The Woodlands", "Baytown",
        "Conroe", "League City", "Katy", "Spring", "Harris County"
    ],
    "austin": [
        "Round Rock", "Cedar Park", "Pflugerville", "Georgetown", "San Marcos", "Kyle", "Leander", "Travis County"
    ],

    # Florida
    "miami": [
        "Miami Beach", "Coral Gables", "Hialeah", "Fort Lauderdale", "Hollywood",
        "Doral", "Kendall", "Aventura", "Homestead", "Miami-Dade County", "Broward County"
    ],
    "orlando": [
        "Kissimmee", "Sanford", "Altamonte Springs", "Winter Park", "Winter Garden", "Orange County"
    ],

    # India
    "ahmedabad": [
        "Gandhinagar", "Sanand", "Changodar", "Bavla", "Dholka", "Kalol",
        "Prahlad Nagar", "SG Highway", "Bopal", "Science City", "Gota", "Naroda", "Vatva"
    ],
    "gandhinagar": [
        "Ahmedabad", "InfoCity", "Kudasan", "Sargasan", "Raysan", "Kalol", "GIFT City", "Pethapur"
    ],
    "mumbai": [
        "Thane", "Navi Mumbai", "Kalyan", "Dombivli", "Mira Bhayandar",
        "Andheri", "Bandra", "Borivali", "Goregaon", "Powai", "BKC", "Lower Parel"
    ],
    "bangalore": [
        "Whitefield", "Electronic City", "Koramangala", "Indiranagar", "HSR Layout",
        "Jayanagar", "Marathahalli", "BTM Layout", "Yelahanka", "Hebbal"
    ],
    "delhi": [
        "Noida", "Greater Noida", "Gurgaon", "Ghaziabad", "Faridabad",
        "South Delhi", "West Delhi", "North Delhi", "Connaught Place", "Nehru Place"
    ],
    "pune": [
        "Pimpri-Chinchwad", "Hinjewadi", "Kothrud", "Hadapsar", "Viman Nagar", "Baner", "Wakad", "Magarpatta"
    ],
}


class QueryExpander:
    """
    Intelligently generates ordered, multi-tier search queries for Google Maps
    to guarantee high extraction targets (e.g. 100, 340, 500+ leads) are fully met
    without premature exhaustion.
    """

    @classmethod
    def get_synonyms_for_keyword(cls, keyword: str) -> List[str]:
        """Finds industry-specific subcategories and synonyms for a keyword."""
        kw_lower = keyword.lower().strip()
        matched_category = None

        # Check keyword against category triggers
        for cat, triggers in CATEGORY_TRIGGERS.items():
            if any(t in kw_lower for t in triggers):
                matched_category = cat
                break

        results = []
        if matched_category and matched_category in INDUSTRY_SYNONYMS:
            for syn in INDUSTRY_SYNONYMS[matched_category]:
                if syn.lower() != kw_lower and syn not in results:
                    results.append(syn)

        # Generic fallbacks
        generic_terms = [
            f"{keyword} Services",
            f"{keyword} Solutions",
            f"{keyword} Agency",
            f"{keyword} Consultant",
            f"{keyword} Provider",
            f"{keyword} Specialists",
            f"Best {keyword}",
            f"Top {keyword}",
            f"Local {keyword}",
        ]
        for term in generic_terms:
            if term.lower() != kw_lower and term not in results:
                results.append(term)

        return results

    @classmethod
    def get_neighboring_cities(cls, city: str) -> List[str]:
        """Looks up nearby surrounding cities and towns for a given city."""
        city_clean = city.lower().strip()
        return METRO_NEIGHBORS.get(city_clean, [])

    @classmethod
    def generate_query_plan(
        cls,
        keyword: str,
        area: Optional[str] = None,
        city: Optional[str] = None,
        state: Optional[str] = None,
        country: Optional[str] = None,
        target_limit: int = 50,
        exhaustive: bool = False,
    ) -> List[str]:
        """
        Builds a comprehensive, prioritized list of search queries.

        Queries are ordered by geographical proximity and relevance:
        Tier 1: Exact Primary Query & Direct Variations
        Tier 2: Industry Synonyms & Subcategories in the Target City
        Tier 3: Directional Sub-zones of the Target City (North, South, East, West, Downtown)
        Tier 4: Surrounding & Neighboring Cities in the Same Metro/County
        Tier 5: Neighboring Cities with Top Industry Synonyms
        Tier 6: County / Metro Region
        Tier 7: Broader State-wide / Regional search (for high targets)
        """
        queries: List[str] = []
        seen: Set[str] = set()

        def add_query(q: str):
            clean = " ".join(q.strip().split())
            if clean and clean.lower() not in seen:
                seen.add(clean.lower())
                queries.append(clean)

        loc_parts = [p.strip() for p in (area, city, state, country) if p and p.strip()]
        loc_str = ", ".join(loc_parts)

        # ---------------- Tier 1: Primary Exact Queries ----------------
        if area and city and state:
            add_query(f"{keyword} in {area}, {city}, {state}")
            add_query(f"{keyword} near {area}, {city}, {state}")
        if city and state:
            add_query(f"{keyword} in {city}, {state}")
            add_query(f"{keyword} near {city}, {state}")
            add_query(f"{keyword} {city} {state}")
        elif loc_str:
            add_query(f"{keyword} near {loc_str}")
            add_query(f"{keyword} in {loc_str}")
        else:
            add_query(keyword)

        # If target limit is small (e.g. <= 20) and not exhaustive, Tier 1 might be enough
        if target_limit <= 20 and not exhaustive:
            return queries

        # ---------------- Tier 2: Industry Synonyms in Target City ----------------
        synonyms = cls.get_synonyms_for_keyword(keyword)
        # For city-level synonym searches
        base_loc = f"{city}, {state}" if (city and state) else (city or loc_str)

        if base_loc:
            # Add top synonyms in this exact city
            for syn in synonyms[:15]:
                add_query(f"{syn} in {base_loc}")
                add_query(f"{syn} near {base_loc}")

        # ---------------- Tier 3: Directional / Sub-zones in Target City ----------------
        if city:
            sub_zones = ["North", "South", "East", "West", "Central", "Downtown", "Greater"]
            for zone in sub_zones:
                if state:
                    add_query(f"{keyword} in {zone} {city}, {state}")
                    add_query(f"{keyword} {city} {zone}, {state}")
                else:
                    add_query(f"{keyword} in {zone} {city}")

        # ---------------- Tier 4: Neighboring / Adjacent Cities ----------------
        neighbors = cls.get_neighboring_cities(city or "") if city else []
        if neighbors:
            logger.info(f"[EXPANDER] Found {len(neighbors)} neighboring cities for {city}: {neighbors[:5]}...")
            for neighbor in neighbors:
                if state:
                    add_query(f"{keyword} in {neighbor}, {state}")
                    add_query(f"{keyword} near {neighbor}, {state}")
                else:
                    add_query(f"{keyword} in {neighbor}")

            # ---------------- Tier 5: Neighboring Cities with Top Synonyms ----------------
            # If target limit is large (> 100), also query top synonyms in neighboring cities
            if target_limit > 100 or exhaustive:
                for neighbor in neighbors[:8]:
                    for syn in synonyms[:4]:
                        if state:
                            add_query(f"{syn} in {neighbor}, {state}")
                        else:
                            add_query(f"{syn} in {neighbor}")

        # ---------------- Tier 6: County / Regional Queries ----------------
        if city and state:
            add_query(f"{keyword} in {city} Metro Area, {state}")
            add_query(f"{keyword} near {city} Area, {state}")

        # ---------------- Tier 7: Broader State / Country Queries ----------------
        if target_limit > 150 or exhaustive:
            if state:
                add_query(f"{keyword} in {state}")
                for syn in synonyms[:5]:
                    add_query(f"{syn} in {state}")
            if country and target_limit > 300:
                add_query(f"{keyword} in {country}")

        logger.info(f"[EXPANDER] Generated {len(queries)} prioritized search queries for target limit {target_limit}.")
        return queries
