import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.models.user import UserInDB
from app.services.auto_leadfinder_service import (
    TARGET_USER_EMAIL,
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
    Enforce strict user-level authorization at the API layer.
    Exclusively permits kutchtourguide@gmail.com.
    """
    user_email = (getattr(current_user, "email", "") or "").strip().lower()
    if user_email != TARGET_USER_EMAIL.lower():
        logger.warning(f"[AUTO_LEADFINDER_AUTH] Unauthorized access attempt by {user_email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access restricted. This feature is exclusively available for kutchtourguide@gmail.com."
        )
    return current_user


class SettingsUpdateRequest(BaseModel):
    is_active: Optional[bool] = None
    daily_limit: Optional[int] = Field(None, ge=10, le=1000)
    target_cities: Optional[List[Any]] = None
    industry_keywords: Optional[List[str]] = None
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


class DiscoverAreasRequest(BaseModel):
    city: str
    state: Optional[str] = "Gujarat"
    country: Optional[str] = "India"
    district: Optional[str] = None
    force_refresh: Optional[bool] = False


@router.get("/settings")
async def get_settings_and_stats(
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Fetch current Auto LeadFinder settings, KPI metrics, status, and next scheduled run.
    """
    try:
        stats = await get_kpi_stats()
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
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Update Auto LeadFinder configuration (daily limit, active state, target cities).
    """
    try:
        updated = await update_settings(payload.model_dump(exclude_unset=True))
        stats = await get_kpi_stats()
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
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Real-time monitoring of all scheduled tasks, next execution times, live execution statuses, and history.
    """
    try:
        from app.services.scheduled_tasks_service import get_live_scheduled_tasks
        data = await get_live_scheduled_tasks()
        return data
    except Exception as e:
        logger.error(f"[SCHEDULED_TASKS_API] Failed to fetch scheduled tasks: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch scheduled tasks: {str(e)}"
        )


@router.get("/history")
async def get_history_endpoint(
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Retrieve activity history for automated and manual scraping runs.
    """
    try:
        runs = await get_run_history(limit=limit, skip=skip)
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
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Automatic City-Wise Area Discovery using the Indian Postal PIN Code API (api.postalpincode.in).
    Discovers all PIN codes for the city, extracts unique PostOffice names as Areas,
    and dynamically constructs Google Maps search queries in the format:
    {Area Name}, {City}, {District}, {State}, {Country}
    """
    try:
        from app.services.postal_discovery_service import postal_discovery_service
        from app.services.auto_leadfinder_service import update_settings

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
        })

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
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Retrieve currently loaded discovered postal areas and their Google Maps queries.
    """
    try:
        stats = await get_kpi_stats()
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
    current_user: UserInDB = Depends(require_kutch_tour_guide)
) -> Any:
    """
    Manually trigger an immediate scraping run in the background.
    """
    try:
        # Schedule via FastAPI BackgroundTasks
        background_tasks.add_task(run_auto_leadfinder_pipeline, trigger_type="MANUAL")
        return {
            "success": True,
            "message": "Automated scraping process initiated in background. You can track progress in real-time."
        }
    except Exception as e:
        logger.error(f"[AUTO_LEADFINDER_API] Failed to trigger manual run: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start scraping: {str(e)}"
        )
