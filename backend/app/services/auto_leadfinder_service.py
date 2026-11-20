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


async def get_target_user(db = None) -> Optional[Dict[str, Any]]:
    """Dynamically look up kutchtourguide@gmail.com from the database without hardcoded IDs."""
    if db is None:
        db = get_raw_database()
    if db is None:
        return None
    user = await db["users"].find_one({"email": {"$regex": f"^{re.escape(TARGET_USER_EMAIL)}$", "$options": "i"}})
    return user


async def get_or_create_settings(db = None) -> Dict[str, Any]:
    """Retrieve or initialize default Auto LeadFinder settings for kutchtourguide@gmail.com."""
    if db is None:
        db = get_raw_database()
    if db is None:
        raise RuntimeError("Database connection unavailable")

    settings = await db["auto_leadfinder_settings"].find_one(
        {"user_email": {"$regex": f"^{re.escape(TARGET_USER_EMAIL)}$", "$options": "i"}}
    )

    if not settings:
        user = await get_target_user(db)
        user_id = str(user["_id"]) if user else None

        default_doc = {
            "user_email": TARGET_USER_EMAIL,
            "user_id": user_id,
            "is_active": True,
            "daily_limit": 100,
            "priority_region": "Kutch City & District",
            "country": "India",
            "country_code": "IN",
            "state": "Gujarat",
            "state_code": "GJ",
            "city": "Kutch district",
            "location_mode": "kutch_systematic",
            "target_cities": [
                {"country": "India", "country_code": "IN", "state": "Gujarat", "state_code": "GJ", "city": "Kutch district"}
            ],
            "current_locality_index": 0,
            "covered_localities": [],
            "industry_keywords": KUTCH_TOURISM_KEYWORDS.copy(),
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
    if "priority_region" not in settings:
        needs_backfill["priority_region"] = "Kutch City & District"
        needs_backfill["current_locality_index"] = 0
    if "country" not in settings:
        needs_backfill["country"] = "India"
        needs_backfill["country_code"] = "IN"
        needs_backfill["state"] = "Gujarat"
        needs_backfill["state_code"] = "GJ"
        needs_backfill["city"] = "Kutch district"
        needs_backfill["location_mode"] = "kutch_systematic"
        needs_backfill["target_cities"] = [
            {"country": "India", "country_code": "IN", "state": "Gujarat", "state_code": "GJ", "city": "Kutch district"}
        ]
    
    if needs_backfill:
        settings.update(needs_backfill)
        await db["auto_leadfinder_settings"].update_one(
            {"_id": settings["_id"]},
            {"$set": needs_backfill}
        )

    settings["_id"] = str(settings["_id"])
    return settings


async def update_settings(payload: Dict[str, Any], db = None) -> Dict[str, Any]:
    """Update settings (daily_limit, is_active, location, target_cities) for the authorized user."""
    if db is None:
        db = get_raw_database()
    if db is None:
        raise RuntimeError("Database connection unavailable")

    await get_or_create_settings(db)
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
        update_data["city"] = str(payload["city"]).strip()
    if "location_mode" in payload and payload["location_mode"]:
        update_data["location_mode"] = str(payload["location_mode"]).strip()

    if "target_cities" in payload and isinstance(payload["target_cities"], list):
        update_data["target_cities"] = payload["target_cities"]

    if "current_locality_index" in payload and payload["current_locality_index"] is not None:
        try:
            update_data["current_locality_index"] = max(0, int(payload["current_locality_index"]))
        except (ValueError, TypeError):
            pass

    if "industry_keywords" in payload and isinstance(payload["industry_keywords"], list):
        cleaned_kws = [str(k).strip() for k in payload["industry_keywords"] if str(k).strip()]
        if cleaned_kws:
            update_data["industry_keywords"] = cleaned_kws

    await db["auto_leadfinder_settings"].update_one(
        {"user_email": {"$regex": f"^{re.escape(TARGET_USER_EMAIL)}$", "$options": "i"}},
        {"$set": update_data}
    )

    return await get_or_create_settings(db)


async def get_kpi_stats(db = None) -> Dict[str, Any]:
    """Compute KPI metrics, coverage progress, status, and stats for the Auto LeadFinder dashboard."""
    if db is None:
        db = get_raw_database()
    if db is None:
        raise RuntimeError("Database connection unavailable")

    settings = await get_or_create_settings(db)
    user = await get_target_user(db)
    user_id = str(user["_id"]) if user else None

    today_midnight_utc = get_today_midnight_utc()

    total_leads_collected = 0
    today_leads_collected = 0

    if user_id:
        total_leads_collected = await db["leads"].count_documents({
            "user_id": user_id,
            "$or": [
                {"source": "auto_leadfinder"},
                {"requested_provider": "Auto LeadFinder"},
                {"is_auto_lead": True}
            ]
        })

        today_leads_collected = await db["leads"].count_documents({
            "user_id": user_id,
            "created_at": {"$gte": today_midnight_utc},
            "$or": [
                {"source": "auto_leadfinder"},
                {"requested_provider": "Auto LeadFinder"},
                {"is_auto_lead": True}
            ]
        })

    is_running = _scraping_lock.locked()
    if not is_running:
        active_run = await db["auto_leadfinder_runs"].find_one({"status": "RUNNING"})
        is_running = active_run is not None

    latest_run = await db["auto_leadfinder_runs"].find().sort("started_at", -1).limit(1).to_list(1)
    last_run_data = None
    if latest_run:
        lr = latest_run[0]
        lr["_id"] = str(lr["_id"])
        last_run_data = lr

    next_run_ist = get_next_scheduled_run_ist()
    curr_idx = settings.get("current_locality_index", 0) % len(KUTCH_LOCALITIES_CATALOG)
    current_locality = KUTCH_LOCALITIES_CATALOG[curr_idx]

    return {
        "user_email": TARGET_USER_EMAIL,
        "is_active": settings.get("is_active", True),
        "daily_limit": settings.get("daily_limit", 100),
        "priority_region": "Kutch City & District",
        "country": settings.get("country", "India"),
        "country_code": settings.get("country_code", "IN"),
        "state": settings.get("state", "Gujarat"),
        "state_code": settings.get("state_code", "GJ"),
        "city": settings.get("city", "Kutch district"),
        "location_mode": settings.get("location_mode", "kutch_systematic"),
        "target_cities": settings.get("target_cities", []),
        "current_locality_index": curr_idx,
        "current_locality_name": f"{current_locality['locality']}, {current_locality['city']}",
        "total_kutch_localities": len(KUTCH_LOCALITIES_CATALOG),
        "kutch_localities_catalog": KUTCH_LOCALITIES_CATALOG,
        "industry_keywords": settings.get("industry_keywords", KUTCH_TOURISM_KEYWORDS),
        "total_leads_collected": total_leads_collected,
        "today_leads_collected": today_leads_collected,
        "is_running": is_running,
        "next_run_ist": next_run_ist.strftime("%Y-%m-%d %I:%M %p IST"),
        "timezone": "Asia/Kolkata",
        "last_run": last_run_data,
        "updated_at": settings.get("updated_at")
    }


async def get_run_history(limit: int = 20, skip: int = 0, db = None) -> List[Dict[str, Any]]:
    """Retrieve history of automated and manual scraping runs."""
    if db is None:
        db = get_raw_database()
    if db is None:
        return []

    cursor = db["auto_leadfinder_runs"].find().sort("started_at", -1).skip(skip).limit(limit)
    runs = []
    async for run in cursor:
        run["_id"] = str(run["_id"])
        runs.append(run)
    return runs


async def run_auto_leadfinder_pipeline(trigger_type: str = "SCHEDULED") -> Dict[str, Any]:
    """
    Main systematic lead discovery pipeline for kutchtourguide@gmail.com.
    Prioritizes Kutch City and covers all its areas/localities systematically.
    Ensures 100 UNIQUE, newly verified leads daily, ignoring all duplicates.
    """
    db = get_raw_database()
    if db is None:
        logger.error("[AUTO_LEADFINDER] Database connection unavailable. Aborting.")
        return {"status": "error", "message": "Database unavailable"}

    user = await get_target_user(db)
    if not user:
        logger.warning(f"[AUTO_LEADFINDER] Target user {TARGET_USER_EMAIL} not found in database. Aborting run.")
        return {"status": "skipped", "message": f"User {TARGET_USER_EMAIL} not found in database."}

    user_id = str(user["_id"])

    if _scraping_lock.locked():
        logger.warning("[AUTO_LEADFINDER] A scraping process is already running. Skipping duplicate trigger.")
        return {"status": "skipped", "message": "Scraping process is already in progress."}

    async with _scraping_lock:
        settings = await get_or_create_settings(db)
        is_active = settings.get("is_active", True)
        daily_limit = settings.get("daily_limit", 100)
        start_locality_idx = settings.get("current_locality_index", 0)
        industry_keywords = settings.get("industry_keywords", KUTCH_TOURISM_KEYWORDS)

        if not is_active and trigger_type == "SCHEDULED":
            logger.info("[AUTO_LEADFINDER] Automation is toggled OFF by user. Skipping scheduled run.")
            return {"status": "skipped", "message": "Automation is currently inactive."}

        # Check today's quota already collected
        today_midnight = get_today_midnight_utc()
        today_already_collected = await db["leads"].count_documents({
            "user_id": user_id,
            "created_at": {"$gte": today_midnight},
            "$or": [
                {"source": "auto_leadfinder"},
                {"requested_provider": "Auto LeadFinder"},
                {"is_auto_lead": True}
            ]
        })

        quota_remaining = max(0, daily_limit - today_already_collected)
        if trigger_type == "SCHEDULED" and quota_remaining <= 0:
            logger.info(f"[AUTO_LEADFINDER] Daily target of {daily_limit} leads already achieved today ({today_already_collected} leads). Skipping.")
            return {
                "status": "skipped",
                "message": f"Daily target of {daily_limit} leads has already been satisfied for today."
            }

        target_for_this_run = quota_remaining if trigger_type == "SCHEDULED" else (daily_limit if quota_remaining <= 0 else quota_remaining)

        run_id = ObjectId()
        now_utc = datetime.now(timezone.utc)
        now_ist = datetime.now(KOLKATA_TZ)

        location_mode = settings.get("location_mode", "kutch_systematic")
        target_country = settings.get("country", "India")
        target_state = settings.get("state", "Gujarat")
        target_city = settings.get("city", "Kutch district")
        is_custom_city = location_mode == "custom_city" and target_city and "kutch" not in target_city.lower()

        run_doc = {
            "_id": run_id,
            "user_id": user_id,
            "user_email": TARGET_USER_EMAIL,
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
        logger.info(f"[AUTO_LEADFINDER] Started run {run_id} (Target: {target_for_this_run} unique leads for {TARGET_USER_EMAIL}, Mode: {'Custom City (' + target_city + ')' if is_custom_city else 'Kutch Systematic'})")

        total_collected = 0
        total_duplicates = 0
        localities_processed = []
        progress_service = Progress()
        search_service = SearchService()

        total_catalog_len = len(KUTCH_LOCALITIES_CATALOG)
        curr_idx = start_locality_idx % total_catalog_len

        try:
            if is_custom_city:
                # Custom City Mode: Scrape across user-selected city hubs
                custom_areas = [
                    f"{target_city} Center",
                    f"{target_city} Tourist Hub & Sightseeing",
                    f"{target_city} Railway Station & Transit Area",
                    f"{target_city} Heritage & Main Market",
                    f"{target_city} Resorts & Outskirts",
                    target_city
                ]
                logger.info(f"[AUTO_LEADFINDER] Scraping custom city: {target_city}, {target_state}, {target_country}")

                for area in custom_areas:
                    if total_collected >= target_for_this_run:
                        break

                    area_saved = 0
                    area_dups = 0

                    for keyword in industry_keywords:
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
                            user_id=user_id,
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
                                user_id=user_id,
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
                # Systematic Locality Loop: Cover all areas of Kutch until 100 unique leads are gathered
                iteration_steps = 0
                max_iterations = total_catalog_len * 2  # Cap iterations to protect resources

                while total_collected < target_for_this_run and iteration_steps < max_iterations:
                    locality_entry = KUTCH_LOCALITIES_CATALOG[curr_idx]
                    city = locality_entry["city"]
                    locality = locality_entry["locality"]
                    zone = locality_entry["zone"]

                    locality_saved = 0
                    locality_dups = 0

                    logger.info(f"[AUTO_LEADFINDER] Covering Kutch Locality [{curr_idx+1}/{total_catalog_len}]: {locality}, {city} ({zone})")

                    for keyword in industry_keywords:
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
                            user_id=user_id,
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
                                user_id=user_id,
                                exhaustive=True,
                                grid_size=3,
                                target_cap="ALL"
                            )
                        except Exception as exec_err:
                            logger.warning(f"[AUTO_LEADFINDER] Batch failed for {keyword} in {locality}, {city}: {exec_err}")

                        # Tag newly created leads with systematic Kutch metadata
                        tag_result = await db["leads"].update_many(
                            {"source_job_id": job_id},
                            {"$set": {
                                "is_auto_lead": True,
                                "source": "auto_leadfinder",
                                "requested_provider": "Auto LeadFinder",
                                "auto_scraped_city": city,
                                "auto_scraped_locality": locality,
                                "auto_scraped_zone": zone,
                                "auto_scraped_at": datetime.now(timezone.utc)
                            }}
                        )

                        newly_saved = tag_result.modified_count

                        # Fetch duplicate count from progress tracking
                        job_progress = await progress_service.get_job(job_id)
                        job_duplicates = job_progress.get("duplicates", 0) if job_progress else 0

                        locality_saved += newly_saved
                        locality_dups += job_duplicates
                        total_collected += newly_saved
                        total_duplicates += job_duplicates

                        logger.info(f"[AUTO_LEADFINDER] {locality}, {city}: Saved {newly_saved} unique, {job_duplicates} duplicates. Total so far: {total_collected}/{target_for_this_run}")

                        # Update live run document in DB
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

                    # Move systematically to the next locality in Kutch
                    curr_idx = (curr_idx + 1) % total_catalog_len
                    iteration_steps += 1

            # Update settings with next locality index for tomorrow's run
            end_utc = datetime.now(timezone.utc)
            await db["auto_leadfinder_settings"].update_one(
                {"user_email": {"$regex": f"^{re.escape(TARGET_USER_EMAIL)}$", "$options": "i"}},
                {"$set": {
                    "current_locality_index": curr_idx,
                    "last_run_at": end_utc,
                    "updated_at": end_utc
                }}
            )

            # Mark run as COMPLETED
            await db["auto_leadfinder_runs"].update_one(
                {"_id": run_id},
                {"$set": {
                    "status": "COMPLETED",
                    "completed_at": end_utc,
                    "total_collected": total_collected,
                    "duplicates_filtered": total_duplicates,
                    "localities_processed": localities_processed,
                    "next_start_locality_index": curr_idx,
                }}
            )

            logger.info(f"[AUTO_LEADFINDER] Systematic run {run_id} completed. Total unique collected: {total_collected}, Duplicates ignored: {total_duplicates}. Next locality index: {curr_idx}")
            return {
                "status": "success",
                "run_id": str(run_id),
                "total_collected": total_collected,
                "duplicates_filtered": total_duplicates,
                "localities_processed": localities_processed,
                "next_locality_index": curr_idx,
            }

        except Exception as e:
            logger.error(f"[AUTO_LEADFINDER] Error during systematic Kutch scraping run: {e}", exc_info=True)
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
