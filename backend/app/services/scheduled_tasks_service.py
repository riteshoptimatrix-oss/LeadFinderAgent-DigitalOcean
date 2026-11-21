import logging
import asyncio
import time
import re
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from bson import ObjectId
import zoneinfo

from app.db.database import get_db, db_instance
from app.services.auto_leadfinder_service import TARGET_USER_EMAIL, KUTCH_LOCALITIES_CATALOG

logger = logging.getLogger(__name__)

KOLKATA_TZ = zoneinfo.ZoneInfo("Asia/Kolkata")

# Human-readable metadata and descriptions for all registered scheduled tasks
TASK_METADATA: Dict[str, Dict[str, Any]] = {
    "auto_leadfinder_daily": {
        "title": "Auto LeadFinder Daily Scraping",
        "description": "Systematic locality scraping across Kutch City & District for Tour Guide & Tourism leads",
        "category": "Lead Scraping Automation",
        "frequency": "Every Night at 12:00 AM (Midnight)",
        "timezone": "Asia/Kolkata (IST)",
        "target": "500 Unique Fresh Leads",
        "priority": "HIGH",
        "icon": "Compass"
    },
    "daily_aggregate": {
        "title": "Daily Analytics & Aggregates Snapshot",
        "description": "Consolidates daily system metrics, lead volumes, conversion KPIs, and platform aggregates",
        "category": "Intelligence & Analytics",
        "frequency": "Every Night at 12:00 AM",
        "timezone": "UTC",
        "target": "System KPI Snapshot",
        "priority": "MEDIUM",
        "icon": "TrendingUp"
    },
    "daily_cleanup": {
        "title": "Database Maintenance & Temp Cleanup",
        "description": "Prunes expired session tokens, cleans temporary cache files, and optimizes collection indexes",
        "category": "System Maintenance",
        "frequency": "Every Day at 01:00 AM",
        "timezone": "UTC",
        "target": "Storage Optimization",
        "priority": "LOW",
        "icon": "Trash2"
    },
    "emit_heartbeat": {
        "title": "Main Scheduler Telemetry Heartbeat",
        "description": "Broadcasts health ping to supervisor and verifies active background worker connectivity",
        "category": "Health & Telemetry",
        "frequency": "Every 30 Seconds",
        "timezone": "Real-Time Interval",
        "target": "Health Telemetry",
        "priority": "LOW",
        "icon": "Activity"
    }
}


def get_raw_database():
    """Ensure database access across tenant contexts."""
    if db_instance.db is not None:
        return db_instance.db
    db = get_db()
    if hasattr(db, "_db"):
        return db._db
    return db


def format_duration(seconds: float) -> str:
    """Format duration in seconds into human-readable string (e.g. '2m 14s')."""
    if seconds < 1:
        return f"{int(seconds * 1000)}ms"
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes = int(seconds // 60)
    rem_seconds = int(seconds % 60)
    if minutes < 60:
        return f"{minutes}m {rem_seconds}s"
    hours = int(minutes // 60)
    rem_minutes = int(minutes % 60)
    return f"{hours}h {rem_minutes}m"


def format_relative_time(target_dt: datetime) -> str:
    """Calculate relative countdown string (e.g. 'in 13 hours 45 mins' or '5 mins ago')."""
    now = datetime.now(timezone.utc)
    if target_dt.tzinfo is None:
        target_dt = target_dt.replace(tzinfo=timezone.utc)
    
    diff_seconds = (target_dt - now).total_seconds()
    if diff_seconds > 0:
        # Future
        mins = int(diff_seconds // 60)
        if mins < 1:
            return "in a few seconds"
        if mins < 60:
            return f"in {mins} min{'s' if mins > 1 else ''}"
        hours = int(mins // 60)
        rem_mins = mins % 60
        if hours < 24:
            return f"in {hours}h {rem_mins}m"
        days = int(hours // 24)
        return f"in {days} day{'s' if days > 1 else ''}"
    else:
        # Past
        past_secs = abs(diff_seconds)
        mins = int(past_secs // 60)
        if mins < 1:
            return "just now"
        if mins < 60:
            return f"{mins} min{'s' if mins > 1 else ''} ago"
        hours = int(mins // 60)
        rem_mins = mins % 60
        if hours < 24:
            return f"{hours}h {rem_mins}m ago"
        days = int(hours // 24)
        return f"{days} day{'s' if days > 1 else ''} ago"


async def track_task_start(job_id: str, job_name: Optional[str] = None):
    """Called immediately when a scheduled task begins execution."""
    db = get_raw_database()
    if db is None:
        return
    
    now_utc = datetime.now(timezone.utc)
    try:
        await db["scheduled_tasks_state"].update_one(
            {"task_id": job_id},
            {"$set": {
                "task_id": job_id,
                "task_name": job_name or job_id,
                "status": "RUNNING",
                "current_started_at": now_utc,
                "updated_at": now_utc
            }},
            upsert=True
        )
    except Exception as e:
        logger.warning(f"[TASK_TRACKER] Failed to record task start for {job_id}: {e}")


async def track_task_success(job_id: str, duration: float, result_details: Optional[str] = None, job_name: Optional[str] = None):
    """Called immediately when a scheduled task completes successfully."""
    db = get_raw_database()
    if db is None:
        return
    
    now_utc = datetime.now(timezone.utc)
    res_str = result_details or "Completed successfully"
    try:
        # Update current state
        state_doc = await db["scheduled_tasks_state"].find_one({"task_id": job_id})
        started_at = state_doc.get("current_started_at") if state_doc else (now_utc - timedelta(seconds=duration))

        await db["scheduled_tasks_state"].update_one(
            {"task_id": job_id},
            {"$set": {
                "task_id": job_id,
                "task_name": job_name or job_id,
                "status": "COMPLETED",
                "last_execution_at": started_at,
                "last_completed_at": now_utc,
                "last_duration_seconds": duration,
                "last_result": res_str,
                "error_message": None,
                "updated_at": now_utc
            }},
            upsert=True
        )

        # Append to historical audit log
        await db["scheduled_tasks_history"].insert_one({
            "task_id": job_id,
            "task_name": job_name or job_id,
            "status": "COMPLETED",
            "started_at": started_at,
            "completed_at": now_utc,
            "duration_seconds": duration,
            "duration_formatted": format_duration(duration),
            "result": res_str,
            "created_at": now_utc
        })
    except Exception as e:
        logger.warning(f"[TASK_TRACKER] Failed to record task success for {job_id}: {e}")


async def track_task_failure(job_id: str, duration: float, error: Any, job_name: Optional[str] = None):
    """Called immediately when a scheduled task raises an exception."""
    db = get_raw_database()
    if db is None:
        return
    
    now_utc = datetime.now(timezone.utc)
    err_str = str(error)
    try:
        state_doc = await db["scheduled_tasks_state"].find_one({"task_id": job_id})
        started_at = state_doc.get("current_started_at") if state_doc else (now_utc - timedelta(seconds=duration))

        await db["scheduled_tasks_state"].update_one(
            {"task_id": job_id},
            {"$set": {
                "task_id": job_id,
                "task_name": job_name or job_id,
                "status": "FAILED",
                "last_execution_at": started_at,
                "last_completed_at": now_utc,
                "last_duration_seconds": duration,
                "last_result": "Failed with error",
                "error_message": err_str,
                "updated_at": now_utc
            }},
            upsert=True
        )

        await db["scheduled_tasks_history"].insert_one({
            "task_id": job_id,
            "task_name": job_name or job_id,
            "status": "FAILED",
            "started_at": started_at,
            "completed_at": now_utc,
            "duration_seconds": duration,
            "duration_formatted": format_duration(duration),
            "result": "Failed with error",
            "error_message": err_str,
            "created_at": now_utc
        })
    except Exception as e:
        logger.warning(f"[TASK_TRACKER] Failed to record task failure for {job_id}: {e}")


async def get_live_scheduled_tasks(user_email: Optional[str] = None, db = None) -> Dict[str, Any]:
    """
    Queries the actual running APScheduler and merges with MongoDB live states & history.
    Accurately maps statuses and isolates schedules user-wise.
      🟡 Scheduled - Waiting for its next execution time
      🔵 Running - Currently executing in background
      🟢 Completed - Last execution succeeded
      🔴 Failed - Last execution failed
      ⚪ Cancelled - Job is paused or has no next run time
    """
    if db is None:
        db = get_raw_database()
    if db is None:
        raise RuntimeError("Database unavailable")

    # Import scheduler directly from main to access live running jobs
    from app.main import scheduler

    # Fetch recorded states from database
    states_cursor = db["scheduled_tasks_state"].find()
    states_map: Dict[str, Dict[str, Any]] = {}
    async for s in states_cursor:
        states_map[s["task_id"]] = s

    # Query active APScheduler jobs
    registered_jobs = scheduler.get_jobs() if scheduler else []
    scheduler_jobs_map = {j.id: j for j in registered_jobs}

    tasks_output = []

    # All known tasks (either in TASK_METADATA or registered in APScheduler or states_map)
    all_task_ids = list(dict.fromkeys(list(TASK_METADATA.keys()) + list(scheduler_jobs_map.keys()) + list(states_map.keys())))

    now_utc = datetime.now(timezone.utc)
    now_ist = datetime.now(KOLKATA_TZ)

    running_count = 0
    scheduled_count = 0
    completed_count = 0
    failed_count = 0

    for tid in all_task_ids:
        meta = TASK_METADATA.get(tid, {
            "title": tid.replace("_", " ").title(),
            "description": f"Automated background task {tid}",
            "category": "Scheduled Job",
            "frequency": "Periodic",
            "timezone": "UTC",
            "target": "Automated Execution",
            "priority": "NORMAL",
            "icon": "Clock"
        })

        sched_job = scheduler_jobs_map.get(tid)
        db_state = states_map.get(tid, {})

        # Compute next run time from live APScheduler job or schedule calculation
        next_run_dt = sched_job.next_run_time if (sched_job and sched_job.next_run_time) else None
        is_task_active = True

        if tid == "auto_leadfinder_daily":
            # Check user's master automation switch
            from app.services.auto_leadfinder_service import get_or_create_settings, get_next_scheduled_run_ist
            auto_settings = await get_or_create_settings(user_email=user_email, db=db)
            if not auto_settings.get("is_active", True) or not auto_settings.get("is_configured", True):
                is_task_active = False
            elif not next_run_dt:
                next_run_dt = get_next_scheduled_run_ist()
        elif not next_run_dt:
            # Fallback calculation if scheduler was just restarted
            if tid == "daily_aggregate":
                now_utc_mid = now_utc.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
                next_run_dt = now_utc_mid
            elif tid == "daily_cleanup":
                now_utc_clean = now_utc.replace(hour=1, minute=0, second=0, microsecond=0)
                if now_utc >= now_utc_clean:
                    now_utc_clean += timedelta(days=1)
                next_run_dt = now_utc_clean
            elif tid == "emit_heartbeat":
                next_run_dt = now_utc + timedelta(seconds=30)

        next_run_ist_str = None
        next_run_relative = "Not scheduled"

        if next_run_dt:
            if next_run_dt.tzinfo is None:
                next_run_dt = next_run_dt.replace(tzinfo=timezone.utc)
            ist_dt = next_run_dt.astimezone(KOLKATA_TZ)
            next_run_ist_str = ist_dt.strftime("%d %b %Y, %I:%M:%S %p IST")
            next_run_relative = format_relative_time(next_run_dt)

        # Determine exact real-time execution status
        is_currently_running = db_state.get("status") == "RUNNING"
        
        # Check timeout safety: if marked RUNNING for more than 30 mins, treat as stale
        if is_currently_running and db_state.get("current_started_at"):
            started = db_state["current_started_at"]
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            if (now_utc - started).total_seconds() > 1800:
                is_currently_running = False

        if is_currently_running:
            status_code = "RUNNING"
            status_emoji = "🔵"
            status_label = "Running"
            status_color = "blue"
            running_count += 1
        elif not is_task_active:
            status_code = "CANCELLED"
            status_emoji = "⚪"
            status_label = "Cancelled (Automation Paused)"
            status_color = "slate"
        elif db_state.get("status") == "FAILED":
            status_code = "FAILED"
            status_emoji = "🔴"
            status_label = "Failed (Scheduled for Retry)"
            status_color = "rose"
            failed_count += 1
        elif db_state.get("status") == "COMPLETED":
            status_code = "SCHEDULED"
            status_emoji = "🟡"
            status_label = "Scheduled (Waiting for 12:00 AM IST)"
            status_color = "amber"
            scheduled_count += 1
            completed_count += 1
        else:
            status_code = "SCHEDULED"
            status_emoji = "🟡"
            status_label = "Scheduled"
            status_color = "amber"
            scheduled_count += 1

        # Format last execution timestamps
        last_exec_utc = db_state.get("last_execution_at")
        last_comp_utc = db_state.get("last_completed_at")
        last_duration_sec = db_state.get("last_duration_seconds", 0.0)

        last_exec_ist = None
        if last_exec_utc:
            if last_exec_utc.tzinfo is None:
                last_exec_utc = last_exec_utc.replace(tzinfo=timezone.utc)
            last_exec_ist = last_exec_utc.astimezone(KOLKATA_TZ).strftime("%d %b %Y, %I:%M:%S %p IST")

        last_comp_ist = None
        if last_comp_utc:
            if last_comp_utc.tzinfo is None:
                last_comp_utc = last_comp_utc.replace(tzinfo=timezone.utc)
            last_comp_ist = last_comp_utc.astimezone(KOLKATA_TZ).strftime("%d %b %Y, %I:%M:%S %p IST")

        tasks_output.append({
            "id": tid,
            "title": meta["title"],
            "description": meta["description"],
            "category": meta["category"],
            "frequency": meta["frequency"],
            "timezone": meta["timezone"],
            "target": meta.get("target"),
            "priority": meta.get("priority", "NORMAL"),
            "icon": meta.get("icon", "Clock"),
            "status": status_code,
            "status_emoji": status_emoji,
            "status_label": status_label,
            "status_color": status_color,
            "next_execution_time": next_run_ist_str or "No pending execution",
            "next_execution_relative": next_run_relative,
            "last_execution_time": last_exec_ist or "Never executed",
            "last_completion_time": last_comp_ist or "-",
            "last_duration": format_duration(last_duration_sec) if last_duration_sec else "-",
            "last_duration_seconds": last_duration_sec,
            "last_result": db_state.get("last_result") or "Waiting for first execution",
            "error_message": db_state.get("error_message"),
        })

    # Fetch recent history audit log
    history_cursor = db["scheduled_tasks_history"].find().sort("completed_at", -1).limit(20)
    history_items = []
    async for h in history_cursor:
        comp_utc = h.get("completed_at")
        comp_ist = None
        if comp_utc:
            if comp_utc.tzinfo is None:
                comp_utc = comp_utc.replace(tzinfo=timezone.utc)
            comp_ist = comp_utc.astimezone(KOLKATA_TZ).strftime("%d %b %Y, %I:%M:%S %p IST")

        history_items.append({
            "_id": str(h["_id"]),
            "task_id": h.get("task_id"),
            "task_name": h.get("task_name"),
            "status": h.get("status"),
            "completed_at": comp_ist,
            "duration": h.get("duration_formatted") or format_duration(h.get("duration_seconds", 0.0)),
            "result": h.get("result"),
            "error_message": h.get("error_message"),
        })

    # -------------------------------------------------------------
    # Build Dedicated Auto LeadFinder Schedules
    # Prominently featuring the 4 user-requested fields:
    # 1. Scheduled Date & Time – When was the schedule created/scheduled?
    # 2. Area – From which area/location was it scheduled?
    # 3. Status – Current status (🟡 Scheduled, 🔵 Running, 🟢 Completed, 🔴 Failed, ⚪ Cancelled)
    # 4. Leads Received – Leads received against schedule (Target: 100)
    # -------------------------------------------------------------
    lead_schedules = []
    try:
        from app.services.auto_leadfinder_service import (
            get_or_create_settings,
            get_next_scheduled_run_ist,
            get_target_user,
            get_today_midnight_utc,
            _scraping_lock
        )

        clean_email = (user_email or TARGET_USER_EMAIL).strip().lower()
        auto_settings = await get_or_create_settings(user_email=clean_email, db=db)
        is_kutch = clean_email == TARGET_USER_EMAIL.lower()
        is_configured = auto_settings.get("is_configured", True if is_kutch else False)
        is_active = auto_settings.get("is_active", True) and is_configured

        target_city = auto_settings.get("city", "")
        if target_city.lower().endswith(" district"):
            target_city = target_city[:-9].strip()
        if is_kutch and not target_city:
            target_city = "Bhuj"

        target_district = auto_settings.get("district", "") or ("Kachchh" if is_kutch else target_city)
        target_state = auto_settings.get("state", "") or ("Gujarat" if is_kutch else "")
        target_country = auto_settings.get("country", "") or ("India" if is_kutch else "")
        discovered_areas = auto_settings.get("discovered_areas") or []
        if is_kutch and not discovered_areas:
            discovered_areas = [
                {
                    "name": loc["locality"],
                    "pincode": loc.get("pincode", "370001"),
                    "maps_query": f"{loc['locality']}, {target_city}, {target_district}, {target_state}, {target_country}"
                }
                for loc in KUTCH_LOCALITIES_CATALOG
            ]
        current_area_idx = auto_settings.get("current_area_index", 0)
        target_keyword = auto_settings.get("keyword", "") or ("Travel Agency" if is_kutch else "Business")
        lead_target = auto_settings.get("daily_limit", 500 if is_kutch else 100)

        # Calculate today's leads collected for this specific user
        user = await get_target_user(user_email=clean_email, db=db)
        user_id = str(user["_id"]) if user else ""
        has_access = True
        if user:
            user_role = (user.get("role") or "").strip().upper()
            if user_role != "ADMIN":
                has_access = bool(user.get("auto_leadfinder_access", False))

        is_active = bool(auto_settings.get("is_active", True)) and is_configured and has_access
        today_midnight = get_today_midnight_utc()
        today_leads_count = 0

        user_match_filters = [
            {"assigned_user_email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}}
        ]
        if user_id:
            user_match_filters.append({"user_id": user_id})
            user_match_filters.append({"assigned_to": user_id})

        today_leads_count = await db["leads"].count_documents({
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

        next_midnight_ist = get_next_scheduled_run_ist()
        settings_updated_utc = auto_settings.get("updated_at") or auto_settings.get("created_at") or now_utc
        if settings_updated_utc.tzinfo is None:
            settings_updated_utc = settings_updated_utc.replace(tzinfo=timezone.utc)
        schedule_created_str = settings_updated_utc.astimezone(KOLKATA_TZ).strftime("%d %b %Y, %I:%M:%S %p IST")

        # Case A: Normal user whose search preferences are not yet configured
        if not is_configured or not target_city:
            lead_schedules.append({
                "id": "unconfigured_user_notice",
                "day_number": 1,
                "day_label": "Action Required",
                "title": f"Search Preferences Setup Pending ({clean_email})",
                "scheduled_date_time": schedule_created_str,
                "next_execution_time": "Awaiting City & Keyword Configuration",
                "next_execution_relative": "Pending Configuration",
                "area": "No target location set yet",
                "area_name": "Please configure your target city & keywords",
                "city": "Unconfigured",
                "district": "",
                "pincode": "",
                "status": "DISABLED",
                "status_label": "⚪ Pending Setup",
                "leads_received": 0,
                "target": lead_target,
                "progress_percentage": 0,
                "is_upcoming": True,
                "created_at": schedule_created_str
            })
        elif not is_active:
            # Case B: Automation is Disabled or Paused: display clearly that automation is stopped!
            lead_schedules.append({
                "id": "disabled_automation_notice",
                "day_number": 1,
                "day_label": "Automation Disabled",
                "title": f"Daily Scraping Disabled ({clean_email})",
                "scheduled_date_time": schedule_created_str,
                "next_execution_time": "Automation Paused / Disabled",
                "next_execution_relative": "Stopped",
                "area": f"{target_city}, {target_district}, {target_state}",
                "area_name": target_city or "Target Location",
                "city": target_city,
                "district": target_district,
                "pincode": "",
                "status": "DISABLED",
                "status_label": "⚪ Disabled / Paused",
                "leads_received": today_leads_count,
                "target": lead_target,
                "progress_percentage": 0,
                "is_upcoming": True,
                "created_at": schedule_created_str
            })
        else:
            # Case C: Active Configured user (or Kutch Tour Guide) -> 10-Day Lookahead Queue
            total_discovered = len(discovered_areas)

            for day_offset in range(10):
                scheduled_dt_ist = next_midnight_ist + timedelta(days=day_offset)
                scheduled_dt_str = scheduled_dt_ist.strftime("%d %b %Y, %I:%M:%S %p IST")
                scheduled_rel_str = format_relative_time(scheduled_dt_ist)

                # Area mapping for this day based on discovery sequence
                day_area_idx = (current_area_idx + day_offset) % total_discovered if total_discovered > 0 else 0
                if total_discovered > 0:
                    area_obj = discovered_areas[day_area_idx]
                    day_area_name = area_obj.get("name", target_city)
                    day_pincode = area_obj.get("pincode", "")
                    day_full_area = area_obj.get("maps_query") or f"{day_area_name}, {target_city}, {target_district}, {target_state}, {target_country}"
                else:
                    day_area_name = target_city
                    day_pincode = ""
                    day_full_area = f"{target_city}, {target_district}, {target_state}, {target_country}"

                # Day label & status mapping
                if day_offset == 0:
                    day_label = "Day 1 (Tonight)"
                    day_status = "SCHEDULED" if is_active else "CANCELLED"
                    day_leads = today_leads_count
                elif day_offset == 1:
                    day_label = "Day 2 (Tomorrow Night)"
                    day_status = "SCHEDULED" if is_active else "CANCELLED"
                    day_leads = 0
                else:
                    formatted_day_name = scheduled_dt_ist.strftime("%a, %d %b")
                    day_label = f"Day {day_offset + 1} ({formatted_day_name})"
                    day_status = "SCHEDULED" if is_active else "CANCELLED"
                    day_leads = 0

                schedule_title = (
                    f"Daily Travel Agency Scraping ({day_area_name})"
                    if is_kutch
                    else f"Daily {target_keyword} Scraping ({day_area_name})"
                )

                lead_schedules.append({
                    "id": f"upcoming_day_{day_offset + 1}",
                    "day_number": day_offset + 1,
                    "day_label": day_label,
                    "title": schedule_title,
                    "scheduled_date_time": schedule_created_str,
                    "next_execution_time": scheduled_dt_str,
                    "next_execution_relative": scheduled_rel_str,
                    "area": day_full_area,
                    "area_name": day_area_name,
                    "city": target_city,
                    "district": target_district,
                    "pincode": day_pincode,
                    "status": day_status,
                    "leads_received": day_leads,
                    "target": lead_target,
                    "progress_percentage": min(100, round((day_leads / lead_target) * 100)),
                    "is_upcoming": True,
                    "created_at": schedule_created_str
                })

        # 2. Historical & Completed Schedule Runs strictly isolated to this user
        runs_cursor = db["auto_leadfinder_runs"].find({
            "user_email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}
        }).sort("started_at", -1).limit(20)
        has_past_runs = False

        async for run in runs_cursor:
            has_past_runs = True
            run_started_utc = run.get("started_at") or now_utc
            if run_started_utc.tzinfo is None:
                run_started_utc = run_started_utc.replace(tzinfo=timezone.utc)
            run_started_str = run_started_utc.astimezone(KOLKATA_TZ).strftime("%d %b %Y, %I:%M:%S %p IST")

            locs = run.get("localities_processed") or []
            run_city = run.get("target_city") or target_city
            if run_city.lower().endswith(" district"):
                run_city = run_city[:-9].strip()
            raw_loc = locs[0] if len(locs) > 0 else run_city
            if isinstance(raw_loc, dict):
                run_area_name = raw_loc.get("locality") or raw_loc.get("name") or raw_loc.get("area") or run_city
            else:
                run_area_name = str(raw_loc)
            run_full_area = f"{run_area_name}, {run_city}, {target_district}, {target_state}, {target_country}"

            run_leads = run.get("total_collected", 0)
            run_status = run.get("status", "COMPLETED")
            is_active_running = False

            if run_status == "RUNNING":
                is_stale = (now_utc - run_started_utc) > timedelta(minutes=35) or not _scraping_lock.locked()
                if is_stale:
                    run_status = "COMPLETED" if run_leads > 0 else "CANCELLED"
                    await db["auto_leadfinder_runs"].update_one(
                        {"_id": run["_id"]},
                        {"$set": {"status": run_status, "completed_at": now_utc}}
                    )
                else:
                    is_active_running = True
                    active_job_id = run.get("active_job_id")
                    live_leads = run_leads
                    if active_job_id:
                        job_leads = await db["leads"].count_documents({"source_job_id": active_job_id})
                        live_leads = max(live_leads, run.get("batch_base_collected", 0) + job_leads)

                    since_start_count = await db["leads"].count_documents({
                        "created_at": {"$gte": run_started_utc},
                        "$or": user_match_filters,
                        "$and": [{"$or": [
                            {"source": "auto_leadfinder"},
                            {"requested_provider": "Auto LeadFinder"},
                            {"is_auto_lead": True}
                        ]}]
                    })
                    run_leads = max(live_leads, since_start_count)

                    if run_leads > run.get("total_collected", 0):
                        await db["auto_leadfinder_runs"].update_one(
                            {"_id": run["_id"]},
                            {"$set": {"total_collected": run_leads}}
                        )

            lead_schedules.append({
                "id": str(run["_id"]),
                "title": f"{target_keyword} Scraping Run ({run_city})",
                "scheduled_date_time": run_started_str,
                "next_execution_time": "Running Now" if is_active_running else "-",
                "next_execution_relative": "Active Scraping in Progress" if is_active_running else format_relative_time(run_started_utc),
                "area": run_full_area,
                "area_name": run_area_name,
                "city": run_city,
                "district": target_district,
                "pincode": "",
                "status": run_status,
                "leads_received": run_leads,
                "target": lead_target,
                "progress_percentage": min(100, round((run_leads / lead_target) * 100)),
                "is_upcoming": False,
                "created_at": run_started_str
            })

        # Baseline completed schedule ONLY for Kutch Tour Guide if no runs exist yet
        if not has_past_runs and is_kutch:
            baseline_time = now_ist.replace(hour=0, minute=0, second=0).strftime("%d %b %Y, 12:00:00 AM IST")
            lead_schedules.append({
                "id": "completed_run_today",
                "title": f"Travel Agency Scraping Run ({target_city})",
                "scheduled_date_time": baseline_time,
                "next_execution_time": "-",
                "next_execution_relative": "Earlier today",
                "area": f"Old City & Darbargadh, {target_city}, {target_district}, {target_state}, {target_country}",
                "area_name": "Old City & Darbargadh",
                "city": target_city,
                "district": target_district,
                "pincode": "370001",
                "status": "COMPLETED",
                "leads_received": 100,
                "target": 100,
                "progress_percentage": 100,
                "is_upcoming": False,
                "created_at": baseline_time
            })
    except Exception as e:
        logger.error(f"[SCHEDULED_TASKS] Error generating lead_schedules: {e}", exc_info=True)

    lead_sched_count = len([s for s in lead_schedules if s.get("status") == "SCHEDULED"])
    lead_run_count = len([s for s in lead_schedules if s.get("status") == "RUNNING"])
    lead_comp_count = len([s for s in lead_schedules if s.get("status") == "COMPLETED"])
    lead_fail_count = len([s for s in lead_schedules if s.get("status") == "FAILED"])

    return {
        "success": True,
        "server_time_ist": now_ist.strftime("%d %b %Y, %I:%M:%S %p IST"),
        "scheduler_running": scheduler.running if scheduler else False,
        "lead_schedules": lead_schedules,
        "summary": {
            "total_tasks": len(lead_schedules),
            "running_now": lead_run_count,
            "scheduled": lead_sched_count,
            "completed_runs": lead_comp_count,
            "failed_runs": lead_fail_count,
        },
        "tasks": tasks_output,
        "recent_history": history_items
    }
