import logging
import asyncio
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from bson import ObjectId
import zoneinfo

from app.db.database import get_db, db_instance

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
        "target": "100 Unique Fresh Leads",
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


async def get_live_scheduled_tasks(db = None) -> Dict[str, Any]:
    """
    Queries the actual running APScheduler and merges with MongoDB live states & history.
    Accurately maps statuses:
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
            auto_settings = await get_or_create_settings(db)
            if not auto_settings.get("is_active", True):
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

    return {
        "success": True,
        "server_time_ist": now_ist.strftime("%d %b %Y, %I:%M:%S %p IST"),
        "scheduler_running": scheduler.running if scheduler else False,
        "summary": {
            "total_tasks": len(tasks_output),
            "running_now": running_count,
            "scheduled": scheduled_count,
            "completed_runs": completed_count,
            "failed_runs": failed_count,
        },
        "tasks": tasks_output,
        "recent_history": history_items
    }
