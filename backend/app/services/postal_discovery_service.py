import logging
import asyncio
import re
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Set
import httpx

from app.db.database import get_db, db_instance

logger = logging.getLogger(__name__)

POSTAL_API_BASE = "https://api.postalpincode.in"

# Supplementary curated dictionary for Indian cities & districts to guarantee 100% PIN code coverage
# even if public postal search experiences network latency or partial string matches.
KNOWN_CITY_PINCODES: Dict[str, Dict[str, Any]] = {
    "bhuj": {
        "district": "Kachchh",
        "state": "Gujarat",
        "pincodes": ["370001", "370015", "370020", "370405"]
    },
    "kutch": {
        "district": "Kachchh",
        "state": "Gujarat",
        "pincodes": ["370001", "370015", "370020", "370201", "370465", "370110"]
    },
    "kutch district": {
        "district": "Kachchh",
        "state": "Gujarat",
        "pincodes": ["370001", "370015", "370020", "370201", "370465", "370110"]
    },
    "gandhidham": {
        "district": "Kachchh",
        "state": "Gujarat",
        "pincodes": ["370201", "370205", "370240"]
    },
    "mandvi": {
        "district": "Kachchh",
        "state": "Gujarat",
        "pincodes": ["370465", "370460"]
    },
    "anjar": {
        "district": "Kachchh",
        "state": "Gujarat",
        "pincodes": ["370110"]
    },
    "mundra": {
        "district": "Kachchh",
        "state": "Gujarat",
        "pincodes": ["370421", "370415"]
    },
    "ahmedabad": {
        "district": "Ahmedabad",
        "state": "Gujarat",
        "pincodes": ["380001", "380004", "380006", "380007", "380009", "380013", "380015", "380054"]
    },
    "jaipur": {
        "district": "Jaipur",
        "state": "Rajasthan",
        "pincodes": ["302001", "302002", "302003", "302004", "302006", "302015", "302020"]
    },
    "udaipur": {
        "district": "Udaipur",
        "state": "Rajasthan",
        "pincodes": ["313001", "313002", "313003", "313004"]
    }
}


def get_raw_database():
    """Ensure database access across tenant contexts safely."""
    try:
        if db_instance.db is not None:
            return db_instance.db
        db = get_db()
        if hasattr(db, "_db"):
            return db._db
        return db
    except Exception:
        return None


def normalize_string(val: Optional[str]) -> str:
    if not val:
        return ""
    return re.sub(r"[^a-zA-Z0-9]", "", val).lower()


def is_district_match(record_district: str, target_district: str, target_city: str) -> bool:
    """
    Intelligently checks whether the record district matches the target district.
    Handles Kutch <-> Kachchh equivalence and city-as-district equivalence.
    """
    r_norm = normalize_string(record_district)
    t_norm = normalize_string(target_district)
    c_norm = normalize_string(target_city)

    if not r_norm:
        return True

    # Kutch <-> Kachchh equivalence
    if ("kutch" in r_norm or "kachchh" in r_norm) and ("kutch" in t_norm or "kachchh" in t_norm or "kutch" in c_norm or "bhuj" in c_norm):
        return True

    if t_norm and (t_norm in r_norm or r_norm in t_norm):
        return True

    if c_norm and (c_norm in r_norm or r_norm in c_norm):
        return True

    return False


class PostalDiscoveryService:
    """
    Automatic City-Wise Area Discovery using the Indian Postal PIN Code API (api.postalpincode.in).
    Discovers all PIN codes for a city, extracts unique PostOffice names as Areas,
    and dynamically constructs Google Maps search queries in the format:
    {Area Name}, {City}, {District}, {State}, {Country}
    """

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) LeadFinderAgent/2.0",
            "Accept": "application/json"
        }

    async def _fetch_json_with_retry(self, client: httpx.AsyncClient, url: str, max_retries: int = 2) -> Optional[List[Dict[str, Any]]]:
        """Fetch JSON from public API with timeout handling and exponential retries."""
        for attempt in range(max_retries):
            try:
                resp = await client.get(url, timeout=10.0)
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list) and len(data) > 0 and data[0].get("Status") == "Success":
                        return data
                elif resp.status_code == 404:
                    return None
            except Exception as err:
                logger.warning(f"[POSTAL_API] Request to {url} failed (attempt {attempt+1}/{max_retries}): {err}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(1.0)
        return None

    async def discover_pincodes_for_city(
        self,
        city: str,
        state: str,
        district: Optional[str] = None
    ) -> List[str]:
        """
        Discovers all relevant 6-digit PIN codes for a city by combining:
        1. Querying https://api.postalpincode.in/postoffice/{city} filtered by state & district
        2. Known supplementary city PIN code mapping
        """
        discovered_pins: Set[str] = set()
        clean_city = city.strip()
        clean_city_lower = clean_city.lower()

        # 1. Check curated directory first for guaranteed coverage
        for key, entry in KNOWN_CITY_PINCODES.items():
            if key in clean_city_lower or clean_city_lower in key:
                if not state or state.lower() in entry["state"].lower():
                    for p in entry.get("pincodes", []):
                        discovered_pins.add(p)

        # 2. Query public postal API by post office name
        search_query = clean_city
        # Clean common suffixes like "district", "city"
        search_query = re.sub(r"\b(district|city|taluka)\b", "", search_query, flags=re.I).strip()
        if not search_query:
            search_query = clean_city

        api_url = f"{POSTAL_API_BASE}/postoffice/{search_query}"
        async with httpx.AsyncClient(headers=self.headers, follow_redirects=True) as client:
            data = await self._fetch_json_with_retry(client, api_url)
            if data and data[0].get("PostOffice"):
                offices = data[0]["PostOffice"]
                for po in offices:
                    po_state = po.get("State", "")
                    po_district = po.get("District", "")
                    pin = str(po.get("Pincode", "")).strip()

                    # Validate State
                    if state and po_state and po_state.lower() != state.lower():
                        continue

                    # Validate District if target district provided
                    if district and po_district and not is_district_match(po_district, district, clean_city):
                        continue

                    if pin and len(pin) == 6 and pin.isdigit():
                        discovered_pins.add(pin)

        # Return sorted list of valid 6-digit PIN codes
        result = sorted(list(discovered_pins))
        logger.info(f"[POSTAL_DISCOVERY] Discovered {len(result)} PIN codes for {clean_city}, {state}: {result}")
        return result

    async def fetch_areas_by_pincode(
        self,
        pincode: str,
        client: httpx.AsyncClient,
        target_state: str,
        target_district: Optional[str] = None,
        target_city: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Fetches all post offices under a specific PIN code using:
        https://api.postalpincode.in/pincode/{PINCODE}
        and extracts validated area records.
        """
        api_url = f"{POSTAL_API_BASE}/pincode/{pincode}"
        data = await self._fetch_json_with_retry(client, api_url)

        if not data or not data[0].get("PostOffice"):
            return []

        areas = []
        for po in data[0]["PostOffice"]:
            name = po.get("Name", "").strip()
            state = po.get("State", "").strip()
            district = po.get("District", "").strip()
            block = (po.get("Block") or "").strip()
            division = (po.get("Division") or "").strip()

            # State validation
            if target_state and state and state.lower() != target_state.lower():
                continue

            # District validation if district provided
            if target_district and district and not is_district_match(district, target_district, target_city or ""):
                continue

            if not name:
                continue

            areas.append({
                "name": name,
                "pincode": pincode,
                "block": block if block != "NA" else "",
                "district": district or target_district or "",
                "division": division,
                "state": state or target_state,
                "country": "India"
            })

        return areas

    async def discover_city_areas(
        self,
        city: str,
        state: str = "Gujarat",
        country: str = "India",
        district: Optional[str] = None,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Main end-to-end area discovery pipeline:
        1. Checks MongoDB cache (unless force_refresh is True)
        2. Discovers all PIN codes for the city
        3. Fetches postal records for each PIN code
        4. Extracts unique Area Names (PostOffice[].Name)
        5. Validates District, Block, State, and Country
        6. Generates individual Google Maps search queries:
           {Area Name}, {City}, {District}, {State}, {Country}
        7. Caches result in MongoDB and returns full structured discovery payload
        """
        db = get_raw_database()
        clean_city = city.strip()
        clean_state = state.strip()
        clean_country = country.strip()

        # Inferred default district for Kutch/Bhuj
        if not district:
            if "bhuj" in clean_city.lower() or "kutch" in clean_city.lower() or "mandvi" in clean_city.lower() or "gandhidham" in clean_city.lower():
                district = "Kachchh"
            else:
                district = clean_city

        clean_district = district.strip()
        cache_key = f"{normalize_string(clean_country)}:{normalize_string(clean_state)}:{normalize_string(clean_city)}"

        # 1. Check MongoDB Cache
        if db is not None and not force_refresh:
            cached_doc = await db["postal_areas_cache"].find_one({"cache_key": cache_key})
            if cached_doc and cached_doc.get("areas"):
                logger.info(f"[POSTAL_DISCOVERY] Cache HIT for {clean_city}, {clean_state} ({len(cached_doc['areas'])} areas)")
                cached_doc["_id"] = str(cached_doc["_id"])
                return cached_doc

        logger.info(f"[POSTAL_DISCOVERY] Cache MISS. Starting live discovery for {clean_city}, {clean_district}, {clean_state}, {clean_country}")

        # 2. Discover PIN codes
        pincodes = await self.discover_pincodes_for_city(clean_city, clean_state, clean_district)

        # Fallback if no PIN codes found
        if not pincodes:
            logger.warning(f"[POSTAL_DISCOVERY] No PIN codes discovered for {clean_city}. Generating central city area entry.")
            fallback_area = {
                "name": clean_city,
                "pincode": "",
                "block": clean_city,
                "district": clean_district,
                "state": clean_state,
                "country": clean_country,
                "maps_query": f"{clean_city}, {clean_district}, {clean_state}, {clean_country}",
                "travel_agency_query": f"Travel Agency in {clean_city}, {clean_district}, {clean_state}, {clean_country}"
            }
            return {
                "city": clean_city,
                "district": clean_district,
                "state": clean_state,
                "country": clean_country,
                "pincodes": [],
                "total_areas": 1,
                "areas": [fallback_area],
                "cached": False,
                "discovered_at": datetime.now(timezone.utc).isoformat()
            }

        # 3. Fetch postal records for all discovered PIN codes
        all_raw_areas: List[Dict[str, Any]] = []
        async with httpx.AsyncClient(headers=self.headers, follow_redirects=True) as client:
            for pin in pincodes:
                try:
                    records = await self.fetch_areas_by_pincode(
                        pincode=pin,
                        client=client,
                        target_state=clean_state,
                        target_district=clean_district,
                        target_city=clean_city
                    )
                    all_raw_areas.extend(records)
                except Exception as e:
                    logger.warning(f"[POSTAL_DISCOVERY] Error fetching PIN {pin}: {e}")

        # 4. Extract unique area names, remove duplicates, and build Google Maps queries
        unique_areas_map: Dict[str, Dict[str, Any]] = {}
        for record in all_raw_areas:
            area_name = record["name"].strip()
            norm_name = area_name.lower()

            if norm_name in unique_areas_map:
                continue

            # Format search query: {Area Name}, {City}, {District}, {State}, {Country}
            # Avoid repeating city if Area Name already contains City (e.g. "Bhuj Darbargadh Chowk")
            if clean_city.lower() in area_name.lower():
                maps_query = f"{area_name}, {clean_district}, {clean_state}, {clean_country}"
            else:
                maps_query = f"{area_name}, {clean_city}, {clean_district}, {clean_state}, {clean_country}"

            travel_agency_query = f"Travel Agency in {maps_query}"

            unique_areas_map[norm_name] = {
                "name": area_name,
                "pincode": record["pincode"],
                "block": record.get("block") or clean_city,
                "district": record.get("district") or clean_district,
                "state": record["state"],
                "country": record["country"],
                "maps_query": maps_query,
                "travel_agency_query": travel_agency_query
            }

        final_areas = list(unique_areas_map.values())
        # Sort alphabetically by area name
        final_areas.sort(key=lambda x: x["name"])

        logger.info(f"[POSTAL_DISCOVERY] Successfully discovered and validated {len(final_areas)} unique areas for {clean_city} across {len(pincodes)} PIN codes.")

        result_doc = {
            "cache_key": cache_key,
            "city": clean_city,
            "district": clean_district,
            "state": clean_state,
            "country": clean_country,
            "pincodes": pincodes,
            "total_areas": len(final_areas),
            "areas": final_areas,
            "cached": True,
            "discovered_at": datetime.now(timezone.utc).isoformat()
        }

        # 5. Persist to MongoDB cache
        if db is not None:
            try:
                await db["postal_areas_cache"].update_one(
                    {"cache_key": cache_key},
                    {"$set": result_doc},
                    upsert=True
                )
            except Exception as cache_err:
                logger.warning(f"[POSTAL_DISCOVERY] Failed to persist cache: {cache_err}")

        return result_doc


# Singleton instance
postal_discovery_service = PostalDiscoveryService()
