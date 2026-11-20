import logging
import asyncio
import re
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from bson import ObjectId
import zoneinfo

from app.db.database import get_db, db_instance
from app.services.search_engine.progress import Progress
from app.services.search_engine.service import SearchService

logger = logging.getLogger(__name__)

TARGET_USER_EMAIL = "kutchtourguide@gmail.com"
KOLKATA_TZ = zoneinfo.ZoneInfo("Asia/Kolkata")

# Global async lock to ensure only one auto-scraping job runs at any time
_scraping_lock = asyncio.Lock()

# Comprehensive and systematic catalog of all areas and localities within Kutch
KUTCH_LOCALITIES_CATALOG = [
    # 1. Bhuj City (Primary Capital & Tourism Nerve Center)
    {"city": "Bhuj", "locality": "Station Road", "zone": "Central Bhuj"},
    {"city": "Bhuj", "locality": "Jubilee Ground & Hospital Road", "zone": "Central Bhuj"},
    {"city": "Bhuj", "locality": "Old City & Darbargadh", "zone": "Heritage Bhuj"},
    {"city": "Bhuj", "locality": "Madhapar Highway", "zone": "Greater Bhuj"},
    {"city": "Bhuj", "locality": "Mirzapar Highway", "zone": "Greater Bhuj"},
    {"city": "Bhuj", "locality": "Mundra Road & College Road", "zone": "South Bhuj"},
    {"city": "Bhuj", "locality": "Airport Road & Air Force Area", "zone": "North Bhuj"},
    {"city": "Bhuj", "locality": "RTO Circle & Kodki Road", "zone": "West Bhuj"},
    {"city": "Bhuj", "locality": "Sanskar Nagar & Pramukh Swami Nagar", "zone": "Residential Bhuj"},
    {"city": "Bhuj", "locality": "Vaniyawad & Shroff Bazar", "zone": "Commercial Bhuj"},

    # 2. Gandhidham & Kandla (Major Transport & Commercial Hub)
    {"city": "Gandhidham", "locality": "Tagore Road & Oslo Circle", "zone": "Commercial Gandhidham"},
    {"city": "Gandhidham", "locality": "Sector 1 to Sector 5", "zone": "Central Gandhidham"},
    {"city": "Gandhidham", "locality": "Sector 6 to Sector 10", "zone": "North Gandhidham"},
    {"city": "Gandhidham", "locality": "Main Market & DC-5", "zone": "Business Gandhidham"},
    {"city": "Gandhidham", "locality": "Kandla Port Area & New Kandla", "zone": "Kandla Port"},
    {"city": "Gandhidham", "locality": "Gopalpuri & Shinay", "zone": "East Gandhidham"},

    # 3. Mandvi (Prime Coastal & Beach Tourism Destination)
    {"city": "Mandvi", "locality": "Mandvi Beach & Windmill Beach", "zone": "Coastal Mandvi"},
    {"city": "Mandvi", "locality": "Topansar Lake & Palace Road", "zone": "Central Mandvi"},
    {"city": "Mandvi", "locality": "Salaya Port & Ship Building Yard", "zone": "Harbor Mandvi"},
    {"city": "Mandvi", "locality": "Maska & Asambhia", "zone": "Rural Mandvi"},
    {"city": "Mandvi", "locality": "Koday & Layja", "zone": "Greater Mandvi"},

    # 4. White Desert & Rann of Kutch (World-Famous Tourism Hub)
    {"city": "Kutch", "locality": "Dhordo (Tent City & White Desert)", "zone": "Great Rann of Kutch"},
    {"city": "Kutch", "locality": "Hodka (Rural Tourism & Sham-e-Sarhad)", "zone": "Banni Grasslands"},
    {"city": "Kutch", "locality": "Bhirandiyara (Handicrafts & Highway Hub)", "zone": "Banni Grasslands"},
    {"city": "Kutch", "locality": "Khavda & Kala Dungar (Black Hill)", "zone": "North Kutch"},
    {"city": "Kutch", "locality": "Ludiya & Gandhi Nu Gam", "zone": "Artisan Kutch"},

    # 5. Anjar & Adipur (Historic & Industrial Hub)
    {"city": "Anjar", "locality": "Devaliya Colony & Ganga Naka", "zone": "Old Anjar"},
    {"city": "Anjar", "locality": "Sorthi Bazar & Khambhla Gate", "zone": "Commercial Anjar"},
    {"city": "Anjar", "locality": "Meghpar Borichi & Varsana", "zone": "Greater Anjar"},
    {"city": "Adipur", "locality": "Main Market & Railway Station", "zone": "Central Adipur"},
    {"city": "Adipur", "locality": "Rambaug Road & Ward 2A/3B", "zone": "Adipur Suburbs"},

    # 6. Mundra (Coast & Port Region)
    {"city": "Mundra", "locality": "Baroi Road & Old Town", "zone": "Central Mundra"},
    {"city": "Mundra", "locality": "Mundra Port SEZ & Zero Point", "zone": "Industrial Mundra"},
    {"city": "Mundra", "locality": "Dhrub & Nana Kapaya", "zone": "Greater Mundra"},

    # 7. Western Kutch Heritage, Spiritual & Border Circuit
    {"city": "Nakhatrana", "locality": "Main Town & ST Bus Station", "zone": "Central Nakhatrana"},
    {"city": "Kutch", "locality": "Mata no Madh (Ashapura Dham)", "zone": "Spiritual Kutch"},
    {"city": "Kutch", "locality": "Narayan Sarovar & Koteshwar", "zone": "Coastal Pilgrimage"},
    {"city": "Kutch", "locality": "Lakhpat Fort & Gurudwara", "zone": "Border Heritage"},
    {"city": "Naliya", "locality": "Naliya Town & Abdasa", "zone": "West Kutch"},
    {"city": "Kothara", "locality": "Kothara & Jakhau Port", "zone": "South-West Kutch"},

    # 8. World Heritage & Eastern Kutch
    {"city": "Dholavira", "locality": "UNESCO Harappan Site & Khadir Bet", "zone": "World Heritage Circuit"},
    {"city": "Kutch", "locality": "Road to Heaven (White Rann Highway)", "zone": "Scenic Highway Tourism"},
    {"city": "Bhachau", "locality": "Main Bazar & National Highway", "zone": "East Kutch"},
    {"city": "Rapar", "locality": "Rapar Town & Pragpar", "zone": "East Kutch"}
]

# Targeted Tourism & Tour Guide keywords prioritized for Kutch
KUTCH_TOURISM_KEYWORDS = [
    "Tour Operators",
    "Travel Agency",
    "Tour Guides & Sightseeing",
    "Rann of Kutch Tour Organizers",
    "Travel Planners & Packages",
    "Car Rental & Taxi Service for Tourists",
    "Desert Safari & Tent Camp",
    "Resorts & Desert Camp Tour Desk",
    "Heritage & Cultural Tour Planners",
    "Holiday Booking Agents"
]


def get_raw_database():
    """Ensure database access across tenant contexts."""
    if db_instance.db is not None:
        return db_instance.db
    db = get_db()
    if hasattr(db, "_db"):
        return db._db
    return db


def get_today_midnight_utc() -> datetime:
    """Return today's 12:00 AM IST in UTC datetime."""
    now_ist = datetime.now(KOLKATA_TZ)
    midnight_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight_ist.astimezone(timezone.utc)


def get_next_scheduled_run_ist() -> datetime:
    """Calculate the next 12:00 AM IST run datetime."""
    now_ist = datetime.now(KOLKATA_TZ)
    next_run = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    if now_ist >= next_run:
        next_run += timedelta(days=1)
    return next_run


async def get_target_user(user_email: Optional[str] = None, db = None) -> Optional[Dict[str, Any]]:
    """Look up user from database by email (defaults to TARGET_USER_EMAIL)."""
    if db is None:
        db = get_raw_database()
    if db is None:
        return None
    target_email = (user_email or TARGET_USER_EMAIL).strip()
    user = await db["users"].find_one({"email": {"$regex": f"^{re.escape(target_email)}$", "$options": "i"}})
    return user


async def get_or_create_settings(user_email: Optional[str] = None, db = None) -> Dict[str, Any]:
    """Retrieve or initialize default isolated Auto LeadFinder settings for a specific user."""
    if db is None:
        db = get_raw_database()
    if db is None:
        raise RuntimeError("Database connection unavailable")

    clean_email = (user_email or TARGET_USER_EMAIL).strip().lower()
    user = await get_target_user(user_email=clean_email, db=db)
    user_id = str(user["_id"]) if user else None

    settings = await db["auto_leadfinder_settings"].find_one(
        {"user_email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}}
    )

    is_kutch_target = clean_email == TARGET_USER_EMAIL.lower()

    if not settings:
        if is_kutch_target:
            default_doc = {
                "user_email": TARGET_USER_EMAIL,
                "user_id": user_id,
                "is_active": True,
                "daily_limit": 500,
                "priority_region": "Kutch City & District",
                "country": "India",
                "country_code": "IN",
                "state": "Gujarat",
                "state_code": "GJ",
                "city": "Kutch district",
                "district": "Kachchh",
                "location_mode": "kutch_systematic",
                "target_cities": [
                    {"country": "India", "country_code": "IN", "state": "Gujarat", "state_code": "GJ", "city": "Kutch district"}
                ],
                "current_locality_index": 0,
                "covered_localities": [],
                "industry_keywords": ["Travel Agency"],
                "keyword": "Travel Agency",
                "assigned_user_id": user_id,
                "assigned_user_email": TARGET_USER_EMAIL,
                "default_visibility": "visible",
                "timezone": "Asia/Kolkata",
                "schedule_time": "00:00",
                "last_run_at": None,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        else:
            user_country = (user.get("country") or "India") if user else "India"
            user_state = (user.get("state") or "Gujarat") if user else "Gujarat"
            user_city = (user.get("city") or "Bhuj") if user else "Bhuj"
            user_kw = (user.get("auto_leadfinder_keyword") or (user.get("company_name") if user else None) or "Business").strip() if user else "Business"
            user_vis = (user.get("auto_leadfinder_visibility") or "visible") if user else "visible"

            default_doc = {
                "user_email": clean_email,
                "user_id": user_id,
                "is_active": True,
                "daily_limit": 100,
                "priority_region": f"{user_city} Priority Coverage",
                "country": user_country,
                "country_code": "IN",
                "state": user_state,
                "state_code": "GJ",
                "city": user_city,
                "district": user_city,
                "location_mode": "custom_city",
                "target_cities": [
                    {"country": user_country, "country_code": "IN", "state": user_state, "state_code": "GJ", "city": user_city}
                ],
                "current_locality_index": 0,
                "current_area_index": 0,
                "discovered_areas": [],
                "discovered_pincodes": [],
                "industry_keywords": [user_kw],
                "keyword": user_kw,
                "assigned_user_id": user_id,
                "assigned_user_email": clean_email,
                "default_visibility": user_vis,
                "timezone": "Asia/Kolkata",
                "schedule_time": "00:00",
                "last_run_at": None,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        res = await db["auto_leadfinder_settings"].insert_one(default_doc)
        default_doc["_id"] = str(res.inserted_id)
        return default_doc

    # Backfill defaults if missing in existing settings document
    needs_backfill = {}
    if not settings.get("user_id") and user_id:
        needs_backfill["user_id"] = user_id
        needs_backfill["assigned_user_id"] = user_id
    if not settings.get("assigned_user_email"):
        needs_backfill["assigned_user_email"] = clean_email

    if is_kutch_target:
        if settings.get("industry_keywords") != ["Travel Agency"] or settings.get("keyword") != "Travel Agency":
            needs_backfill["industry_keywords"] = ["Travel Agency"]
            needs_backfill["keyword"] = "Travel Agency"
    else:
        if "keyword" not in settings and settings.get("industry_keywords"):
            needs_backfill["keyword"] = settings["industry_keywords"][0]

    if "country" not in settings:
        needs_backfill["country"] = "India"
        needs_backfill["country_code"] = "IN"
        needs_backfill["state"] = "Gujarat"
        needs_backfill["state_code"] = "GJ"
        needs_backfill["city"] = "Bhuj"
        needs_backfill["location_mode"] = "custom_city"
        needs_backfill["target_cities"] = [
            {"country": "India", "country_code": "IN", "state": "Gujarat", "state_code": "GJ", "city": "Bhuj"}
        ]
    
    if needs_backfill:
        settings.update(needs_backfill)
        await db["auto_leadfinder_settings"].update_one(
            {"_id": settings["_id"]},
            {"$set": needs_backfill}
        )

    settings["_id"] = str(settings["_id"])
    return settings


async def update_settings(payload: Dict[str, Any], user_email: Optional[str] = None, db = None) -> Dict[str, Any]:
    """Update settings for a specific user account in an isolated manner."""
    if db is None:
        db = get_raw_database()
    if db is None:
        raise RuntimeError("Database connection unavailable")

    clean_email = (user_email or payload.get("assigned_user_email") or TARGET_USER_EMAIL).strip().lower()
    await get_or_create_settings(user_email=clean_email, db=db)
    update_data: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}

    if "is_active" in payload and payload["is_active"] is not None:
        update_data["is_active"] = bool(payload["is_active"])

    if "daily_limit" in payload and payload["daily_limit"] is not None:
        try:
            val = int(payload["daily_limit"])
            if val > 0:
                update_data["daily_limit"] = min(max(val, 10), 1000)
        except (ValueError, TypeError):
            pass

    if "country" in payload and payload["country"]:
        update_data["country"] = str(payload["country"]).strip()
    if "country_code" in payload and payload["country_code"]:
        update_data["country_code"] = str(payload["country_code"]).strip()
    if "state" in payload and payload["state"]:
        update_data["state"] = str(payload["state"]).strip()
    if "state_code" in payload and payload["state_code"]:
        update_data["state_code"] = str(payload["state_code"]).strip()
    if "city" in payload and payload["city"]:
        clean_city = str(payload["city"]).strip()
        if clean_city.lower().endswith(" district"):
            clean_city = clean_city[:-9].strip()
        update_data["city"] = clean_city or "Bhuj"
    if "district" in payload and payload["district"]:
        update_data["district"] = str(payload["district"]).strip()
    if "location_mode" in payload and payload["location_mode"]:
        update_data["location_mode"] = str(payload["location_mode"]).strip()

    if "target_cities" in payload and isinstance(payload["target_cities"], list):
        update_data["target_cities"] = payload["target_cities"]

    if "discovered_areas" in payload and isinstance(payload["discovered_areas"], list):
        update_data["discovered_areas"] = payload["discovered_areas"]
    if "discovered_pincodes" in payload and isinstance(payload["discovered_pincodes"], list):
        update_data["discovered_pincodes"] = payload["discovered_pincodes"]
    if "current_area_index" in payload and payload["current_area_index"] is not None:
        try:
            update_data["current_area_index"] = max(0, int(payload["current_area_index"]))
        except (ValueError, TypeError):
            pass

    if "current_locality_index" in payload and payload["current_locality_index"] is not None:
        try:
            update_data["current_locality_index"] = max(0, int(payload["current_locality_index"]))
        except (ValueError, TypeError):
            pass

    if "assigned_user_id" in payload:
        update_data["assigned_user_id"] = str(payload["assigned_user_id"]).strip() if payload["assigned_user_id"] else None
    if "assigned_user_email" in payload:
        update_data["assigned_user_email"] = str(payload["assigned_user_email"]).strip() if payload["assigned_user_email"] else None
    if "default_visibility" in payload and payload["default_visibility"]:
        update_data["default_visibility"] = str(payload["default_visibility"]).strip().lower()

    # Rule: For kutchtourguide user, the keyword "Travel Agency" must remain permanently fixed and non-editable.
    # For all other users, the keyword is fully editable and specific to their business.
    is_kutch_target = clean_email == TARGET_USER_EMAIL.lower()

    if is_kutch_target:
        update_data["industry_keywords"] = ["Travel Agency"]
        update_data["keyword"] = "Travel Agency"
    else:
        if "keyword" in payload and payload["keyword"]:
            kw = str(payload["keyword"]).strip()
            if kw:
                update_data["industry_keywords"] = [kw]
                update_data["keyword"] = kw
        elif "industry_keywords" in payload and isinstance(payload["industry_keywords"], list):
            cleaned_kws = [str(k).strip() for k in payload["industry_keywords"] if str(k).strip()]
            if cleaned_kws:
                update_data["industry_keywords"] = cleaned_kws
                update_data["keyword"] = cleaned_kws[0]

    await db["auto_leadfinder_settings"].update_one(
        {"user_email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}},
        {"$set": update_data}
    )

    return await get_or_create_settings(user_email=clean_email, db=db)


async def get_kpi_stats(user_email: Optional[str] = None, db = None) -> Dict[str, Any]:
    """Compute KPI metrics, coverage progress, status, and stats for a specific user."""
    if db is None:
        db = get_raw_database()
    if db is None:
        raise RuntimeError("Database connection unavailable")

    clean_email = (user_email or TARGET_USER_EMAIL).strip().lower()
    settings = await get_or_create_settings(user_email=clean_email, db=db)
    user = await get_target_user(user_email=clean_email, db=db)
    user_id = str(user["_id"]) if user else None

    today_midnight_utc = get_today_midnight_utc()

    total_leads_collected = 0
    today_leads_collected = 0

    lead_source_or = [
        {"source": "auto_leadfinder"},
        {"requested_provider": "Auto LeadFinder"},
        {"is_auto_lead": True}
    ]

    user_match_filters = [
        {"assigned_user_email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}}
    ]
    if user_id:
        user_match_filters.append({"user_id": user_id})
        user_match_filters.append({"assigned_to": user_id})

    total_leads_collected = await db["leads"].count_documents({
        "$or": user_match_filters,
        "$and": [{"$or": lead_source_or}]
    })

    today_leads_collected = await db["leads"].count_documents({
        "created_at": {"$gte": today_midnight_utc},
        "$or": user_match_filters,
        "$and": [{"$or": lead_source_or}]
    })

    is_running = _scraping_lock.locked()
    if not is_running:
        stale_threshold = datetime.now(timezone.utc) - timedelta(minutes=15)
        await db["auto_leadfinder_runs"].update_many(
            {"status": "RUNNING", "started_at": {"$lt": stale_threshold}},
            {"$set": {"status": "COMPLETED", "completed_at": datetime.now(timezone.utc)}}
        )
        active_run = await db["auto_leadfinder_runs"].find_one({
            "status": "RUNNING",
            "user_email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}
        })
        is_running = active_run is not None

    latest_run = await db["auto_leadfinder_runs"].find(
        {"user_email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}}
    ).sort("started_at", -1).limit(1).to_list(1)

    last_run_data = None
    if latest_run:
        lr = latest_run[0]
        lr["_id"] = str(lr["_id"])
        last_run_data = lr

    next_run_ist = get_next_scheduled_run_ist()
    curr_idx = settings.get("current_locality_index", 0) % len(KUTCH_LOCALITIES_CATALOG)
    current_locality = KUTCH_LOCALITIES_CATALOG[curr_idx]

    is_kutch_target = clean_email == TARGET_USER_EMAIL.lower()
    effective_keywords = ["Travel Agency"] if is_kutch_target else (settings.get("industry_keywords") or [settings.get("keyword") or "Business"])
    keyword_str = "Travel Agency" if is_kutch_target else (effective_keywords[0] if effective_keywords else "Business")

    user_display_name = user.get("full_name") or clean_email if user else clean_email

    return {
        "user_email": clean_email,
        "user_name": user_display_name,
        "is_active": settings.get("is_active", True),
        "daily_limit": settings.get("daily_limit", 500 if is_kutch_target else 100),
        "priority_region": settings.get("priority_region") or ("Kutch City & District" if is_kutch_target else f"{settings.get('city', 'City')} Priority Coverage"),
        "country": settings.get("country", "India"),
        "country_code": settings.get("country_code", "IN"),
        "state": settings.get("state", "Gujarat"),
        "state_code": settings.get("state_code", "GJ"),
        "city": settings.get("city", "Kutch district" if is_kutch_target else "Bhuj"),
        "district": settings.get("district", "Kachchh"),
        "location_mode": settings.get("location_mode", "kutch_systematic" if is_kutch_target else "custom_city"),
        "target_cities": settings.get("target_cities", []),
        "discovered_areas": settings.get("discovered_areas", []),
        "discovered_pincodes": settings.get("discovered_pincodes", []),
        "current_area_index": settings.get("current_area_index", 0),
        "current_locality_index": curr_idx,
        "current_locality_name": f"{current_locality['locality']}, {current_locality['city']}",
        "total_kutch_localities": len(KUTCH_LOCALITIES_CATALOG),
        "kutch_localities_catalog": KUTCH_LOCALITIES_CATALOG,
        "industry_keywords": effective_keywords,
        "keyword": keyword_str,
        "is_keyword_fixed": is_kutch_target,
        "fixed_keyword": "Travel Agency" if is_kutch_target else None,
        "assigned_user_id": user_id,
        "assigned_user_email": clean_email,
        "default_visibility": settings.get("default_visibility", "visible"),
        "total_leads_collected": total_leads_collected,
        "today_leads_collected": today_leads_collected,
        "is_running": is_running,
        "next_run_ist": next_run_ist.strftime("%Y-%m-%d %I:%M %p IST"),
        "timezone": "Asia/Kolkata",
        "last_run": last_run_data,
        "updated_at": settings.get("updated_at")
    }


async def get_run_history(user_email: Optional[str] = None, limit: int = 20, skip: int = 0, db = None) -> List[Dict[str, Any]]:
    """Retrieve history of automated and manual scraping runs for a specific user."""
    if db is None:
        db = get_raw_database()
    if db is None:
        return []

    filter_q: Dict[str, Any] = {}
    if user_email and user_email.strip():
        filter_q["user_email"] = {"$regex": f"^{re.escape(user_email.strip())}$", "$options": "i"}

    cursor = db["auto_leadfinder_runs"].find(filter_q).sort("started_at", -1).skip(skip).limit(limit)
    runs = []
    async for run in cursor:
        run["_id"] = str(run["_id"])
        runs.append(run)
    return runs


async def _run_single_user_pipeline(clean_email: str, trigger_type: str = "SCHEDULED", db = None) -> Dict[str, Any]:
    """Execute scraping pipeline specifically for a single user."""
    if db is None:
        db = get_raw_database()
    if db is None:
        logger.error(f"[AUTO_LEADFINDER] Database connection unavailable for {clean_email}")
        return {"status": "error", "message": "Database unavailable"}

    user = await get_target_user(user_email=clean_email, db=db)
    user_id = str(user["_id"]) if user else None

    settings = await get_or_create_settings(user_email=clean_email, db=db)
    is_active = settings.get("is_active", True)
    daily_limit = settings.get("daily_limit", 100)
    start_locality_idx = settings.get("current_locality_index", 0)

    # Lead Visibility
    default_visibility = settings.get("default_visibility", "visible")
    if user and user.get("auto_leadfinder_visibility"):
        default_visibility = user.get("auto_leadfinder_visibility")

    is_kutch_target = clean_email == TARGET_USER_EMAIL.lower()
    if is_kutch_target:
        active_keywords = ["Travel Agency"]
    elif user and user.get("auto_leadfinder_keyword"):
        active_keywords = [str(user.get("auto_leadfinder_keyword")).strip()]
    else:
        raw_kws = settings.get("industry_keywords")
        active_keywords = [str(k).strip() for k in raw_kws if str(k).strip()] if raw_kws else [settings.get("keyword", "Business")]

    if not is_active and trigger_type == "SCHEDULED":
        logger.info(f"[AUTO_LEADFINDER] Automation is toggled OFF for {clean_email}. Skipping scheduled run.")
        return {"status": "skipped", "message": "Automation is currently inactive."}

    # Check today's quota already collected for this user
    today_midnight = get_today_midnight_utc()
    user_match_filters = [
        {"assigned_user_email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}}
    ]
    if user_id:
        user_match_filters.append({"user_id": user_id})
        user_match_filters.append({"assigned_to": user_id})

    today_already_collected = await db["leads"].count_documents({
        "created_at": {"$gte": today_midnight},
        "$or": user_match_filters,
        "$and": [{
            "$or": [
                {"source": "auto_leadfinder"},
                {"requested_provider": "Auto LeadFinder"},
                {"is_auto_lead": True}
            ]
        }]
    })

    quota_remaining = max(0, daily_limit - today_already_collected)
    if trigger_type == "SCHEDULED" and quota_remaining <= 0:
        logger.info(f"[AUTO_LEADFINDER] Daily target of {daily_limit} leads already achieved today for {clean_email} ({today_already_collected} leads). Skipping.")
        return {
            "status": "skipped",
            "message": f"Daily target of {daily_limit} leads has already been satisfied for today."
        }

    target_for_this_run = quota_remaining if trigger_type == "SCHEDULED" else (daily_limit if quota_remaining <= 0 else quota_remaining)

    run_id = ObjectId()
    now_utc = datetime.now(timezone.utc)
    now_ist = datetime.now(KOLKATA_TZ)

    location_mode = settings.get("location_mode", "custom_city" if not is_kutch_target else "kutch_systematic")
    target_country = settings.get("country", "India")
    target_state = settings.get("state", "Gujarat")
    target_city = settings.get("city", "Kutch district" if is_kutch_target else "Bhuj")
    is_custom_city = location_mode == "custom_city" and target_city and "kutch" not in target_city.lower()

    run_doc = {
        "_id": run_id,
        "user_id": user_id,
        "user_email": clean_email,
        "run_date": now_ist.strftime("%Y-%m-%d"),
        "trigger_type": trigger_type,
        "status": "RUNNING",
        "started_at": now_utc,
        "completed_at": None,
        "daily_limit_target": daily_limit,
        "target_for_this_run": target_for_this_run,
        "location_mode": "custom_city" if is_custom_city else "kutch_systematic",
        "target_country": target_country,
        "target_state": target_state,
        "target_city": target_city,
        "total_collected": 0,
        "duplicates_filtered": 0,
        "localities_processed": [],
        "error_message": None,
    }
    await db["auto_leadfinder_runs"].insert_one(run_doc)
    logger.info(f"[AUTO_LEADFINDER] Started run {run_id} (Target: {target_for_this_run} unique leads for {clean_email}, City: {target_city}, Keywords: {active_keywords})")

    total_collected = 0
    total_duplicates = 0
    localities_processed = []
    progress_service = Progress()
    search_service = SearchService()

    discovered_areas = settings.get("discovered_areas") or []
    start_area_idx = settings.get("current_area_index", 0)
    target_district = settings.get("district") or ("Kachchh" if "bhuj" in target_city.lower() or "kutch" in target_city.lower() else target_city)

    # On the fly discovery if no areas exist yet for this user's target city
    if not discovered_areas and target_city:
        try:
            from app.services.postal_discovery_service import postal_discovery_service
            disco_res = await postal_discovery_service.discover_city_areas(
                city=target_city,
                state=target_state,
                country=target_country,
                district=target_district
            )
            if disco_res and disco_res.get("areas"):
                discovered_areas = disco_res["areas"]
                await db["auto_leadfinder_settings"].update_one(
                    {"user_email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}},
                    {"$set": {
                        "discovered_areas": discovered_areas,
                        "discovered_pincodes": disco_res.get("pincodes", []),
                        "current_area_index": 0
                    }}
                )
                logger.info(f"[AUTO_LEADFINDER] On-the-fly postal discovery completed for {clean_email}: {len(discovered_areas)} areas discovered.")
        except Exception as disco_err:
            logger.warning(f"[AUTO_LEADFINDER] On-the-fly area discovery error for {clean_email}: {disco_err}")

    total_catalog_len = len(KUTCH_LOCALITIES_CATALOG)
    curr_idx = start_locality_idx % total_catalog_len

    try:
        if discovered_areas:
            # Mode A: Discovered Postal Areas Execution (PIN Code API)
            total_areas_len = len(discovered_areas)
            area_idx = start_area_idx % total_areas_len
            iteration_steps = 0
            max_iterations = total_areas_len * 2
            logger.info(f"[AUTO_LEADFINDER] [{clean_email}] Iterating {total_areas_len} discovered postal areas for {target_city}, starting from index {area_idx}")

            while total_collected < target_for_this_run and iteration_steps < max_iterations:
                area_item = discovered_areas[area_idx]
                area_name = area_item["name"]
                area_pin = area_item.get("pincode", "")
                area_district = area_item.get("district") or target_district
                maps_query = area_item.get("maps_query") or f"{area_name}, {target_city}, {area_district}, {target_state}, {target_country}"

                area_saved = 0
                area_dups = 0

                for keyword in active_keywords:
                    needed = target_for_this_run - total_collected
                    if needed <= 0:
                        break

                    batch_limit = min(needed, 20)
                    search_query_keyword = f"{keyword}"
                    search_area = f"{area_name}"

                    job_id = await progress_service.create_job(
                        keyword=search_query_keyword,
                        area=search_area,
                        city=target_city,
                        state=target_state,
                        country=target_country,
                        limit=batch_limit,
                        provider="Google Maps",
                        user_id=user_id or "system",
                        exhaustive=True,
                        grid_size=3,
                        target_cap="ALL"
                    )

                    try:
                        await search_service.execute_job(
                            job_id=job_id,
                            keyword=search_query_keyword,
                            area=search_area,
                            city=target_city,
                            state=target_state,
                            country=target_country,
                            limit=batch_limit,
                            provider="Google Maps",
                            user_id=user_id or "system",
                            exhaustive=True,
                            grid_size=3,
                            target_cap="ALL"
                        )
                    except Exception as exec_err:
                        logger.warning(f"[AUTO_LEADFINDER] Postal area batch failed for {keyword} in {area_name}, {target_city}: {exec_err}")

                    tag_result = await db["leads"].update_many(
                        {"source_job_id": job_id},
                        {"$set": {
                            "is_auto_lead": True,
                            "source": "auto_leadfinder",
                            "requested_provider": "Auto LeadFinder",
                            "assigned_to": user_id,
                            "assigned_user_email": clean_email,
                            "user_id": user_id,
                            "visibility": default_visibility,
                            "assigned_at": datetime.now(timezone.utc),
                            "assigned_by": "AUTO_LEADFINDER",
                            "auto_scraped_area": area_name,
                            "auto_scraped_pincode": area_pin,
                            "auto_scraped_city": target_city,
                            "auto_scraped_district": area_district,
                            "auto_scraped_state": target_state,
                            "auto_scraped_country": target_country,
                            "auto_scraped_query": maps_query,
                            "auto_scraped_at": datetime.now(timezone.utc)
                        }}
                    )

                    newly_saved = tag_result.modified_count
                    job_progress = await progress_service.get_job(job_id)
                    job_duplicates = job_progress.get("duplicates", 0) if job_progress else 0

                    area_saved += newly_saved
                    area_dups += job_duplicates
                    total_collected += newly_saved
                    total_duplicates += job_duplicates

                    logger.info(f"[AUTO_LEADFINDER] [{clean_email}] {area_name} ({area_pin}): Collected {newly_saved} unique, {job_duplicates} dups. Progress: {total_collected}/{target_for_this_run}")

                    await db["auto_leadfinder_runs"].update_one(
                        {"_id": run_id},
                        {"$set": {
                            "total_collected": total_collected,
                            "duplicates_filtered": total_duplicates,
                        }}
                    )

                localities_processed.append({
                    "city": target_city,
                    "locality": area_name,
                    "pincode": area_pin,
                    "zone": f"PIN {area_pin}" if area_pin else "Discovered Postal Area",
                    "maps_query": maps_query,
                    "leads_collected": area_saved,
                    "duplicates": area_dups
                })

                area_idx = (area_idx + 1) % total_areas_len
                iteration_steps += 1

            # Update settings with next area index for future runs
            end_utc = datetime.now(timezone.utc)
            await db["auto_leadfinder_settings"].update_one(
                {"user_email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}},
                {"$set": {
                    "current_area_index": area_idx,
                    "last_run_at": end_utc,
                    "updated_at": end_utc
                }}
            )

        elif is_custom_city:
            # Mode B: Custom City Centers fallback
            custom_areas = [
                f"{target_city} Center",
                f"{target_city} Commercial Hub",
                f"{target_city} Railway Station & Transit Area",
                f"{target_city} Main Market & Business District",
                f"{target_city} Suburbs & Outskirts",
                target_city
            ]
            logger.info(f"[AUTO_LEADFINDER] [{clean_email}] Scraping custom city hubs: {target_city}, {target_state}, {target_country}")

            for area in custom_areas:
                if total_collected >= target_for_this_run:
                    break

                area_saved = 0
                area_dups = 0

                for keyword in active_keywords:
                    needed = target_for_this_run - total_collected
                    if needed <= 0:
                        break

                    batch_limit = min(needed, 20)
                    search_query_keyword = f"{keyword}"

                    job_id = await progress_service.create_job(
                        keyword=search_query_keyword,
                        area=area,
                        city=target_city,
                        state=target_state,
                        country=target_country,
                        limit=batch_limit,
                        provider="Google Maps",
                        user_id=user_id or "system",
                        exhaustive=True,
                        grid_size=3,
                        target_cap="ALL"
                    )

                    try:
                        await search_service.execute_job(
                            job_id=job_id,
                            keyword=search_query_keyword,
                            area=area,
                            city=target_city,
                            state=target_state,
                            country=target_country,
                            limit=batch_limit,
                            provider="Google Maps",
                            user_id=user_id or "system",
                            exhaustive=True,
                            grid_size=3,
                            target_cap="ALL"
                        )
                    except Exception as exec_err:
                        logger.warning(f"[AUTO_LEADFINDER] Custom batch failed for {keyword} in {area}, {target_city}: {exec_err}")

                    tag_result = await db["leads"].update_many(
                        {"source_job_id": job_id},
                        {"$set": {
                            "is_auto_lead": True,
                            "source": "auto_leadfinder",
                            "requested_provider": "Auto LeadFinder",
                            "assigned_to": user_id,
                            "assigned_user_email": clean_email,
                            "user_id": user_id,
                            "visibility": default_visibility,
                            "assigned_at": datetime.now(timezone.utc),
                            "assigned_by": "AUTO_LEADFINDER",
                            "auto_scraped_city": target_city,
                            "auto_scraped_state": target_state,
                            "auto_scraped_country": target_country,
                            "auto_scraped_locality": area,
                            "auto_scraped_zone": "Custom Selection",
                            "auto_scraped_at": datetime.now(timezone.utc)
                        }}
                    )

                    newly_saved = tag_result.modified_count
                    job_progress = await progress_service.get_job(job_id)
                    job_duplicates = job_progress.get("duplicates", 0) if job_progress else 0

                    area_saved += newly_saved
                    area_dups += job_duplicates
                    total_collected += newly_saved
                    total_duplicates += job_duplicates

                    await db["auto_leadfinder_runs"].update_one(
                        {"_id": run_id},
                        {"$set": {
                            "total_collected": total_collected,
                            "duplicates_filtered": total_duplicates,
                        }}
                    )

                localities_processed.append({
                    "city": target_city,
                    "locality": area,
                    "zone": "Custom Selection",
                    "leads_collected": area_saved,
                    "duplicates": area_dups
                })

        else:
            # Mode C: Kutch Localities Catalog (for Kutch Tour Guide)
            iteration_steps = 0
            max_iterations = total_catalog_len * 2

            while total_collected < target_for_this_run and iteration_steps < max_iterations:
                locality_entry = KUTCH_LOCALITIES_CATALOG[curr_idx]
                city = locality_entry["city"]
                locality = locality_entry["locality"]
                zone = locality_entry["zone"]

                locality_saved = 0
                locality_dups = 0

                logger.info(f"[AUTO_LEADFINDER] Covering Kutch Locality [{curr_idx+1}/{total_catalog_len}]: {locality}, {city} ({zone}) for {clean_email}")

                for keyword in active_keywords:
                    needed = target_for_this_run - total_collected
                    if needed <= 0:
                        break

                    batch_limit = min(needed, 20)
                    search_query_keyword = f"{keyword}"
                    search_area = f"{locality}"

                    job_id = await progress_service.create_job(
                        keyword=search_query_keyword,
                        area=search_area,
                        city=city,
                        state="Gujarat",
                        country="India",
                        limit=batch_limit,
                        provider="Google Maps",
                        user_id=user_id or "system",
                        exhaustive=True,
                        grid_size=3,
                        target_cap="ALL"
                    )

                    try:
                        await search_service.execute_job(
                            job_id=job_id,
                            keyword=search_query_keyword,
                            area=search_area,
                            city=city,
                            state="Gujarat",
                            country="India",
                            limit=batch_limit,
                            provider="Google Maps",
                            user_id=user_id or "system",
                            exhaustive=True,
                            grid_size=3,
                            target_cap="ALL"
                        )
                    except Exception as exec_err:
                        logger.warning(f"[AUTO_LEADFINDER] Batch failed for {keyword} in {locality}, {city}: {exec_err}")

                    tag_result = await db["leads"].update_many(
                        {"source_job_id": job_id},
                        {"$set": {
                            "is_auto_lead": True,
                            "source": "auto_leadfinder",
                            "requested_provider": "Auto LeadFinder",
                            "assigned_to": user_id,
                            "assigned_user_email": clean_email,
                            "user_id": user_id,
                            "visibility": default_visibility,
                            "assigned_at": datetime.now(timezone.utc),
                            "assigned_by": "AUTO_LEADFINDER",
                            "auto_scraped_city": city,
                            "auto_scraped_locality": locality,
                            "auto_scraped_zone": zone,
                            "auto_scraped_at": datetime.now(timezone.utc)
                        }}
                    )

                    newly_saved = tag_result.modified_count
                    job_progress = await progress_service.get_job(job_id)
                    job_duplicates = job_progress.get("duplicates", 0) if job_progress else 0

                    locality_saved += newly_saved
                    locality_dups += job_duplicates
                    total_collected += newly_saved
                    total_duplicates += job_duplicates

                    await db["auto_leadfinder_runs"].update_one(
                        {"_id": run_id},
                        {"$set": {
                            "total_collected": total_collected,
                            "duplicates_filtered": total_duplicates,
                        }}
                    )

                localities_processed.append({
                    "city": city,
                    "locality": locality,
                    "zone": zone,
                    "leads_collected": locality_saved,
                    "duplicates": locality_dups
                })

                curr_idx = (curr_idx + 1) % total_catalog_len
                iteration_steps += 1

            # Update settings with next locality index
            end_utc = datetime.now(timezone.utc)
            await db["auto_leadfinder_settings"].update_one(
                {"user_email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}},
                {"$set": {
                    "current_locality_index": curr_idx,
                    "last_run_at": end_utc,
                    "updated_at": end_utc
                }}
            )

        # Mark run as COMPLETED
        end_utc = datetime.now(timezone.utc)
        await db["auto_leadfinder_runs"].update_one(
            {"_id": run_id},
            {"$set": {
                "status": "COMPLETED",
                "completed_at": end_utc,
                "total_collected": total_collected,
                "duplicates_filtered": total_duplicates,
                "localities_processed": localities_processed,
            }}
        )

        logger.info(f"[AUTO_LEADFINDER] [{clean_email}] Systematic run {run_id} completed. Total unique: {total_collected}, Duplicates: {total_duplicates}.")
        return {
            "status": "success",
            "run_id": str(run_id),
            "user_email": clean_email,
            "total_collected": total_collected,
            "duplicates_filtered": total_duplicates,
            "localities_processed": localities_processed,
        }

    except Exception as e:
        logger.error(f"[AUTO_LEADFINDER] Error during scraping run for {clean_email}: {e}", exc_info=True)
        await db["auto_leadfinder_runs"].update_one(
            {"_id": run_id},
            {"$set": {
                "status": "FAILED",
                "completed_at": datetime.now(timezone.utc),
                "error_message": str(e),
                "total_collected": total_collected,
                "duplicates_filtered": total_duplicates,
                "localities_processed": localities_processed
            }}
        )
        return {"status": "error", "message": str(e)}


async def run_auto_leadfinder_pipeline(trigger_type: str = "SCHEDULED", target_user_email: Optional[str] = None) -> Dict[str, Any]:
    """
    Main lead discovery pipeline.
    If target_user_email is specified, runs specifically for that user.
    If target_user_email is None (e.g. midnight scheduled job), iterates over all active users with Auto LeadFinder enabled.
    """
    db = get_raw_database()
    if db is None:
        logger.error("[AUTO_LEADFINDER] Database connection unavailable. Aborting.")
        return {"status": "error", "message": "Database unavailable"}

    if _scraping_lock.locked():
        logger.warning("[AUTO_LEADFINDER] A scraping process is already running. Skipping duplicate trigger.")
        return {"status": "skipped", "message": "Scraping process is already in progress."}

    async with _scraping_lock:
        if target_user_email:
            return await _run_single_user_pipeline(
                clean_email=target_user_email.strip().lower(),
                trigger_type=trigger_type,
                db=db
            )

        # Multi-user scheduled execution at midnight IST:
        # Find all users eligible for Auto LeadFinder
        cursor = db["users"].find({
            "$or": [
                {"email": {"$regex": f"^{re.escape(TARGET_USER_EMAIL)}$", "$options": "i"}},
                {"auto_leadfinder_access": True}
            ],
            "account_status": {"$ne": "Deactivated"}
        })
        users = await cursor.to_list(length=200)

        emails_to_run = set()
        emails_to_run.add(TARGET_USER_EMAIL.lower())
        for u in users:
            em = (u.get("email") or "").strip().lower()
            if em:
                emails_to_run.add(em)

        logger.info(f"[AUTO_LEADFINDER] Executing scheduled multi-user pipeline for {len(emails_to_run)} accounts: {list(emails_to_run)}")
        results = {}
        for email in sorted(list(emails_to_run)):
            try:
                res = await _run_single_user_pipeline(clean_email=email, trigger_type=trigger_type, db=db)
                results[email] = res
            except Exception as e:
                logger.error(f"[AUTO_LEADFINDER] Pipeline execution failed for {email}: {e}", exc_info=True)
                results[email] = {"status": "error", "message": str(e)}

        return {"status": "completed", "results": results}
