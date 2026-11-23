import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.models.user import UserInDB
from app.db.database import get_db, db_instance
from app.services.auto_leadfinder_service import (
    TARGET_USER_EMAIL,
    KOLKATA_TZ,
    get_or_create_settings,
    update_settings,
    get_kpi_stats,
    get_run_history,
    run_auto_leadfinder_pipeline,
)

logger = logging.getLogger(__name__)

router = APIRouter()


async def require_kutch_tour_guide(current_user: UserInDB = Depends(get_current_user)) -> UserInDB:
    """
    Enforce authorization at the API layer.
    Permits Administrators, authorized accounts (kutchtourguide@gmail.com),
    and users granted Auto LeadFinder access by an Administrator.
    """
    user_email = (getattr(current_user, "email", "") or "").strip().lower()
    user_role = (getattr(current_user, "role", "") or "").strip().upper()
    is_admin = user_role == "ADMIN" or getattr(current_user, "is_superuser", False) is True
    has_access = getattr(current_user, "auto_leadfinder_access", False) is True

    if is_admin or has_access or (user_email == TARGET_USER_EMAIL.lower() and getattr(current_user, "auto_leadfinder_access", None) is not False):
        return current_user

    logger.warning(f"[AUTO_LEADFINDER_AUTH] Unauthorized access attempt by {user_email}")
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access restricted. Auto LeadFinder feature permission required."
    )


def resolve_target_user_email(current_user: UserInDB, requested_email: Optional[str] = None) -> str:
    """
    Determine the target user context.
    Administrators may switch between user accounts using requested_email.
    Regular users are strictly isolated to their own authenticated email.
    """
    user_email = (getattr(current_user, "email", "") or "").strip().lower()
    user_role = (getattr(current_user, "role", "") or "").strip().upper()
    is_admin = user_role == "ADMIN" or getattr(current_user, "is_superuser", False) is True

    if is_admin and requested_email and requested_email.strip():
        return requested_email.strip().lower()

    if user_email:
        return user_email
    return TARGET_USER_EMAIL.lower()


class SettingsUpdateRequest(BaseModel):
    is_configured: Optional[bool] = None
    is_active: Optional[bool] = None
    daily_limit: Optional[int] = Field(None, ge=100, le=1000)
    target_cities: Optional[List[Any]] = None
    industry_keywords: Optional[List[str]] = None
    keyword: Optional[str] = None
    niche: Optional[str] = None
    category: Optional[str] = None
    country: Optional[str] = None
    country_code: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    location_mode: Optional[str] = None
    discovered_areas: Optional[List[Dict[str, Any]]] = None
    discovered_pincodes: Optional[List[str]] = None
    current_area_index: Optional[int] = None
    assigned_user_id: Optional[str] = None
    assigned_user_email: Optional[str] = None
    default_visibility: Optional[str] = None
    schedule_time: Optional[str] = None
    auto_send_eas: Optional[bool] = None


class DiscoverAreasRequest(BaseModel):
    city: str
    state: Optional[str] = "Gujarat"
    country: Optional[str] = "India"
    district: Optional[str] = None
    force_refresh: Optional[bool] = False
    user_email: Optional[str] = None


@router.get("/users-with-access")
async def get_users_with_auto_leadfinder_access(
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    List all users who have Auto LeadFinder access enabled, so Admin can switch between user contexts.
    """
    try:
        from app.db.database import get_db, db_instance
        db = db_instance.db if db_instance.db is not None else get_db()
        if hasattr(db, "_db"):
            db = db._db

        curr_admin_email = (getattr(current_user, "email", "") or "").strip().lower()
        cursor = db["users"].find({
            "$or": [
                {"role": {"$regex": "^admin$", "$options": "i"}},
                {"email": {"$regex": f"^{re.escape(TARGET_USER_EMAIL)}$", "$options": "i"}},
                {"email": {"$regex": f"^{re.escape(curr_admin_email)}$", "$options": "i"}},
                {"auto_leadfinder_access": True}
            ],
            "account_status": {"$ne": "Deactivated"}
        }).sort("full_name", 1)
        users = await cursor.to_list(length=200)

        result = []
        for u in users:
            email = u.get("email", "")
            is_kutch = email.lower() == TARGET_USER_EMAIL.lower()
            keyword = "Travel Agency" if is_kutch else (u.get("auto_leadfinder_keyword") or "")
            result.append({
                "id": str(u["_id"]),
                "email": email,
                "full_name": u.get("full_name") or email,
                "role": u.get("role", "USER"),
                "company_name": u.get("company_name", ""),
                "city": u.get("city", ""),
                "state": u.get("state", ""),
                "country": u.get("country", ""),
                "keyword": keyword,
                "is_kutch": is_kutch,
                "visibility": u.get("auto_leadfinder_visibility", "visible")
            })

        # Ensure current admin is in the list
        if curr_admin_email and not any(x["email"].lower() == curr_admin_email for x in result):
            result.insert(0, {
                "id": str(getattr(current_user, "id", "") or "admin_curr"),
                "email": curr_admin_email,
                "full_name": getattr(current_user, "full_name", "") or curr_admin_email,
                "role": "ADMIN",
                "company_name": getattr(current_user, "company_name", ""),
                "city": "",
                "state": "",
                "country": "India",
                "keyword": "",
                "is_kutch": False,
                "visibility": "visible"
            })

        # Ensure kutchtourguide is always present in list even if not yet in users table
        if not any(x["email"].lower() == TARGET_USER_EMAIL.lower() for x in result):
            result.append({
                "id": "kutch_default",
                "email": TARGET_USER_EMAIL,
                "full_name": "Kutch Tour Guide (Default)",
                "role": "USER",
                "company_name": "Kutch Tour Guide",
                "city": "Bhuj",
                "state": "Gujarat",
                "country": "India",
                "keyword": "Travel Agency",
                "is_kutch": True,
                "visibility": "visible"
            })

        return {
            "success": True,
            "data": result
        }
    except Exception as e:
        logger.error(f"[AUTO_LEADFINDER_API] Failed to fetch users with access: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch users: {str(e)}"
        )


@router.get("/settings")
async def get_settings_and_stats(
    user_email: Optional[str] = Query(None),
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Fetch Auto LeadFinder settings, KPI metrics, status, and next scheduled run for the specified user context.
    """
    try:
        target_email = resolve_target_user_email(current_user, user_email)
        stats = await get_kpi_stats(user_email=target_email)
        return {
            "success": True,
            "data": stats
        }
    except Exception as e:
        logger.error(f"[AUTO_LEADFINDER_API] Failed to fetch settings/stats: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load Auto LeadFinder settings: {str(e)}"
        )


@router.put("/settings")
async def update_settings_endpoint(
    payload: SettingsUpdateRequest,
    user_email: Optional[str] = Query(None),
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Update Auto LeadFinder configuration (daily limit, active state, target cities, keyword) for user context.
    """
    try:
        target_email = resolve_target_user_email(current_user, user_email or payload.assigned_user_email)
        await update_settings(payload.model_dump(exclude_unset=True), user_email=target_email)
        stats = await get_kpi_stats(user_email=target_email)

        # Synchronize live APScheduler job for this user's Auto LeadFinder schedule
        try:
            from app.main import scheduler
            from app.services.scheduled_tasks_service import schedule_auto_leadfinder_job
            sched_time = payload.schedule_time or (stats.get("schedule_time") if stats else "00:00")
            is_act = payload.is_active if payload.is_active is not None else (stats.get("is_active", True) if stats else True)
            schedule_auto_leadfinder_job(scheduler, user_email=target_email, schedule_time=sched_time, is_active=is_act)
        except Exception as sched_err:
            logger.warning(f"[AUTO_LEADFINDER_API] Failed to update live APScheduler job for {target_email}: {sched_err}")

        return {
            "success": True,
            "message": "Auto LeadFinder settings updated successfully.",
            "data": stats
        }
    except Exception as e:
        logger.error(f"[AUTO_LEADFINDER_API] Failed to update settings: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update settings: {str(e)}"
        )


@router.get("/scheduled-tasks")
async def get_scheduled_tasks_monitor(
    user_email: Optional[str] = Query(None),
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Real-time monitoring of all scheduled tasks, next execution times, live execution statuses, and history
    strictly isolated to the current/selected user context.
    """
    try:
        target_email = resolve_target_user_email(current_user, user_email)
        from app.services.scheduled_tasks_service import get_live_scheduled_tasks
        data = await get_live_scheduled_tasks(user_email=target_email)
        return data
    except Exception as e:
        logger.error(f"[SCHEDULED_TASKS_API] Failed to fetch scheduled tasks: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch scheduled tasks: {str(e)}"
        )


@router.delete("/schedules")
async def delete_all_user_schedules(
    user_email: Optional[str] = Query(None),
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Delete all schedules and execution runs belonging to the currently selected user only.
    Must NOT delete schedules belonging to other users.
    Scoped strictly to the user's ID/email.
    """
    try:
        target_email = resolve_target_user_email(current_user, user_email)
        from app.services.auto_leadfinder_service import delete_user_schedules
        res = await delete_user_schedules(user_email=target_email)
        return {
            "success": True,
            "message": f"All schedules and execution records for {target_email} have been deleted successfully.",
            "data": res
        }
    except Exception as e:
        logger.error(f"[AUTO_LEADFINDER_API] Failed to delete user schedules: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete schedules: {str(e)}"
        )


@router.get("/history")
async def get_history_endpoint(
    user_email: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Retrieve activity history for automated and manual scraping runs for the target user.
    """
    try:
        target_email = resolve_target_user_email(current_user, user_email)
        runs = await get_run_history(user_email=target_email, limit=limit, skip=skip)
        return {
            "success": True,
            "data": runs
        }
    except Exception as e:
        logger.error(f"[AUTO_LEADFINDER_API] Failed to fetch history: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load run history: {str(e)}"
        )


@router.post("/discover-areas")
async def discover_city_postal_areas(
    payload: DiscoverAreasRequest,
    user_email: Optional[str] = Query(None),
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Automatic City-Wise Area Discovery using the Indian Postal PIN Code API (api.postalpincode.in).
    Discovers all PIN codes for the city, extracts unique PostOffice names as Areas,
    and dynamically constructs Google Maps search queries.
    """
    try:
        from app.services.postal_discovery_service import postal_discovery_service
        target_email = resolve_target_user_email(current_user, user_email or payload.user_email)

        result = await postal_discovery_service.discover_city_areas(
            city=payload.city,
            state=payload.state or "Gujarat",
            country=payload.country or "India",
            district=payload.district,
            force_refresh=bool(payload.force_refresh)
        )

        # Automatically update settings with the discovered areas for the active scraping pipeline
        await update_settings({
            "city": payload.city,
            "state": payload.state or "Gujarat",
            "country": payload.country or "India",
            "district": result.get("district") or payload.district or payload.city,
            "discovered_areas": result.get("areas", []),
            "discovered_pincodes": result.get("pincodes", []),
            "current_area_index": 0,
            "location_mode": "custom_city" if payload.city.lower() != "kutch district" else "kutch_systematic"
        }, user_email=target_email)

        return {
            "success": True,
            "message": f"Successfully discovered {result.get('total_areas', 0)} areas across {len(result.get('pincodes', []))} PIN codes for {payload.city}.",
            "data": result
        }
    except Exception as e:
        logger.error(f"[AUTO_LEADFINDER_API] Area discovery failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Area discovery failed: {str(e)}"
        )


@router.get("/discovered-areas")
async def get_active_discovered_areas(
    user_email: Optional[str] = Query(None),
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Retrieve currently loaded discovered postal areas and their Google Maps queries for the target user.
    """
    try:
        target_email = resolve_target_user_email(current_user, user_email)
        stats = await get_kpi_stats(user_email=target_email)
        return {
            "success": True,
            "city": stats.get("city", "Bhuj"),
            "district": stats.get("district", "Kachchh"),
            "state": stats.get("state", "Gujarat"),
            "country": stats.get("country", "India"),
            "pincodes": stats.get("discovered_pincodes", []),
            "total_areas": len(stats.get("discovered_areas", [])),
            "current_area_index": stats.get("current_area_index", 0),
            "areas": stats.get("discovered_areas", [])
        }
    except Exception as e:
        logger.error(f"[AUTO_LEADFINDER_API] Failed to get discovered areas: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch discovered areas: {str(e)}"
        )


@router.post("/run-now")
async def trigger_manual_run(
    background_tasks: BackgroundTasks,
    user_email: Optional[str] = Query(None),
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Manually trigger an immediate scraping run in the background for the target user.
    Synchronously creates the RUNNING record in MongoDB so UI metrics and trackers update with 0 latency.
    """
    try:
        db = db_instance.db if db_instance.db is not None else get_db()
        target_email = resolve_target_user_email(current_user, user_email).strip().lower()

        # Check if scraping is already actively running for this user
        active_run = await db["auto_leadfinder_runs"].find_one({
            "status": "RUNNING",
            "user_email": {"$regex": f"^{re.escape(target_email)}$", "$options": "i"}
        })
        now_utc = datetime.now(timezone.utc)
        if active_run:
            run_start = active_run.get("started_at") or now_utc
            if run_start.tzinfo is None:
                run_start = run_start.replace(tzinfo=timezone.utc)
            last_hb = active_run.get("last_heartbeat") or run_start
            if last_hb.tzinfo is None:
                last_hb = last_hb.replace(tzinfo=timezone.utc)

            if (now_utc - run_start) < timedelta(minutes=40) and (now_utc - last_hb) < timedelta(minutes=15):
                return {
                    "success": True,
                    "already_running": True,
                    "run_id": str(active_run["_id"]),
                    "message": f"Scraping is already active for {target_email}."
                }

        # Check user settings
        settings = await get_or_create_settings(user_email=target_email, db=db)
        is_kutch_target = target_email == TARGET_USER_EMAIL.lower()
        target_city = (settings.get("city") or "").strip()
        target_kw = (settings.get("keyword") or "").strip()

        if not is_kutch_target and (not target_city or not target_kw):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target city and search keyword must be configured before starting Auto LeadFinder."
            )

        # Synchronously pre-create RUNNING document in DB
        run_id = ObjectId()
        now_ist = datetime.now(KOLKATA_TZ)
        daily_limit = settings.get("daily_limit", 100)
        target_country = settings.get("country") or ("India" if is_kutch_target else "")
        target_state = settings.get("state") or ("Gujarat" if is_kutch_target else "")
        location_mode = settings.get("location_mode", "custom_city" if not is_kutch_target else "kutch_systematic")
        is_custom_city = location_mode == "custom_city" and target_city and "kutch" not in target_city.lower()

        user_id_val = str(getattr(current_user, "id", None) or getattr(current_user, "_id", ""))

        run_doc = {
            "_id": run_id,
            "user_id": user_id_val if user_id_val else None,
            "user_email": target_email,
            "run_date": now_ist.strftime("%Y-%m-%d"),
            "trigger_type": "MANUAL",
            "status": "RUNNING",
            "started_at": now_utc,
            "last_heartbeat": now_utc,
            "completed_at": None,
            "daily_limit_target": daily_limit,
            "target_for_this_run": max(daily_limit, 100),
            "location_mode": "custom_city" if is_custom_city else "kutch_systematic",
            "target_country": target_country,
            "target_state": target_state,
            "target_city": target_city or ("Kutch district" if is_kutch_target else ""),
            "total_collected": 0,
            "duplicates_filtered": 0,
            "localities_processed": [],
            "error_message": None,
        }
        await db["auto_leadfinder_runs"].insert_one(run_doc)
        await db["auto_leadfinder_settings"].update_one(
            {"user_email": {"$regex": f"^{re.escape(target_email)}$", "$options": "i"}},
            {"$set": {"is_running": True, "active_run_id": str(run_id)}}
        )

        background_tasks.add_task(
            run_auto_leadfinder_pipeline,
            trigger_type="MANUAL",
            target_user_email=target_email,
            run_id=run_id
        )
        return {
            "success": True,
            "run_id": str(run_id),
            "message": f"Lead scraping started for {target_city or target_email}!"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AUTO_LEADFINDER_API] Failed to trigger manual run: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start scraping: {str(e)}"
        )


@router.get("/assignable-users")
async def get_assignable_users(
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    List registered users for Admin context switcher and assignment.
    """
    try:
        from app.db.database import get_db, db_instance
        db = db_instance.db if db_instance.db is not None else get_db()
        if hasattr(db, "_db"):
            db = db._db

        cursor = db["users"].find({"account_status": {"$ne": "Deactivated"}}).sort("full_name", 1)
        users = await cursor.to_list(length=300)
        return {
            "success": True,
            "data": [
                {
                    "id": str(u["_id"]),
                    "email": u.get("email", ""),
                    "full_name": u.get("full_name") or u.get("email", ""),
                    "role": u.get("role", "USER"),
                    "company_name": u.get("company_name", "")
                }
                for u in users
            ]
        }
    except Exception as e:
        logger.error(f"[AUTO_LEADFINDER_API] Failed to fetch assignable users: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch assignable users: {str(e)}"
        )
