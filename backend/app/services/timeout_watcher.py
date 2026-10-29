"""
Timeout Watcher
===============
Monitors all active search jobs and transitions stuck jobs to TIMEOUT.

Guarantee: every search_job reaches exactly one terminal state (COMPLETED,
FAILED, STOPPED, CANCELLED, TIMEOUT) within a bounded time window.

Prevents the frontend from remaining in infinite loading by ensuring no
job stays in a non-terminal state forever.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.logger import logger
from app.services.worker_manager import shutdown_event

NON_TERMINAL_STATES = [
    "CREATED", "QUEUED", "INITIALIZING", "OPENING_MAPS",
    "SEARCHING", "DISCOVERING_RESULTS", "COLLECTING_BUSINESSES",
    "EXTRACTING_DETAILS", "VALIDATING", "SAVING", "PAUSED",
]

DEFAULT_JOB_TIMEOUT_SECONDS = 7200  # 2 hours
CHECK_INTERVAL_SECONDS = 60
STUCK_CREATED_TIMEOUT = 3600  # 1 hour for CREATED that never gets picked up


def ensure_utc(dt: Any) -> datetime:
    """Normalize datetime to timezone-aware UTC datetime.
    
    If it is a string, parses it.
    If it is naive, localizes it to UTC.
    If it is already timezone-aware, converts it to UTC.
    """
    if dt is None:
        return datetime.now(timezone.utc)
    if isinstance(dt, str):
        return datetime.fromisoformat(dt.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class TimeoutWatcher:
    def __init__(self, db: AsyncIOMotorDatabase, check_interval: int = CHECK_INTERVAL_SECONDS):
        self.db = db
        self.check_interval = check_interval
        self._task: Optional[asyncio.Task] = None
        self.is_running = False

    async def start(self):
        self.is_running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("TIMEOUT_WATCHER: Started — monitoring active jobs for timeouts")

    async def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("TIMEOUT_WATCHER: Stopped")

    async def _loop(self):
        while self.is_running and not shutdown_event.is_set():
            try:
                await self._check_timeouts()
            except Exception as e:
                logger.error(f"TIMEOUT_WATCHER_ERROR: {e}")
            await asyncio.sleep(self.check_interval)

    async def _check_timeouts(self):
        now = datetime.now(timezone.utc)

        cursor = self.db["search_jobs"].find(
            {"status": {"$in": NON_TERMINAL_STATES}},
            {"_id": 1, "status": 1, "created_at": 1, "started_at": 1, "updated_at": 1},
        )

        async for job in cursor:
            job_id = str(job["_id"])
            status = job.get("status", "CREATED")
            created_at = job.get("created_at") or job.get("started_at")
            created_at = ensure_utc(created_at)

            elapsed = (now - created_at).total_seconds()

            if status == "CREATED" and elapsed > STUCK_CREATED_TIMEOUT:
                await self._transition_to_timeout(job_id, f"Stuck in CREATED for {elapsed:.0f}s")
                continue

            if elapsed > DEFAULT_JOB_TIMEOUT_SECONDS:
                await self._transition_to_timeout(job_id, f"Exceeded max duration of {DEFAULT_JOB_TIMEOUT_SECONDS}s")
                continue

            updated_at = job.get("updated_at")
            if updated_at is None:
                updated_at = created_at
            else:
                updated_at = ensure_utc(updated_at)

            idle_elapsed = (now - updated_at).total_seconds() if updated_at else 0
            if status != "QUEUED" and idle_elapsed > DEFAULT_JOB_TIMEOUT_SECONDS:
                await self._transition_to_timeout(job_id, f"Idle for {idle_elapsed:.0f}s (last update)")

    async def _transition_to_timeout(self, job_id: str, reason: str):
        from app.core.websocket import manager as ws_manager

        await self.db["search_jobs"].update_one(
            {"_id": job_id if not self._is_valid_oid(job_id) else self._to_oid(job_id)},
            {"$set": {
                "status": "TIMEOUT",
                "error_message": reason,
                "completed_at": datetime.now(timezone.utc),
                "progress": 0,
            }},
        )
        logger.warning(f"TIMEOUT_WATCHER: Job {job_id} -> TIMEOUT ({reason})")

        try:
            await ws_manager.broadcast_event(
                job_id=job_id,
                event_type="SEARCH_TIMEOUT",
                message=f"Job timed out: {reason}",
            )
        except Exception:
            pass

    def _is_valid_oid(self, s: str) -> bool:
        from bson import ObjectId
        return ObjectId.is_valid(s)

    def _to_oid(self, s: str):
        from bson import ObjectId
        return ObjectId(s)


class StuckWorkerDetector:
    def __init__(self, db: AsyncIOMotorDatabase, check_interval: int = 120):
        self.db = db
        self.check_interval = check_interval
        self._task: Optional[asyncio.Task] = None
        self.is_running = False

    async def start(self):
        self.is_running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("STUCK_WORKER_DETECTOR: Started")

    async def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _loop(self):
        while self.is_running and not shutdown_event.is_set():
            try:
                await self._detect_stuck_items()
            except Exception as e:
                logger.error(f"STUCK_WORKER_DETECTOR_ERROR: {e}")
            await asyncio.sleep(self.check_interval)

    async def _detect_stuck_items(self):
        now = datetime.now(timezone.utc)
        stale = now - __import__("datetime").timedelta(minutes=10)

        cursor = self.db["business_queue"].find({
            "status": "IN_PROGRESS",
            "assigned_at": {"$lt": stale},
        })
        async for item in cursor:
            await self.db["business_queue"].update_one(
                {"_id": item["_id"]},
                {"$set": {"status": "PENDING", "assigned_at": None}},
            )
            logger.warning(f"STUCK_WORKER: Released stuck item {item.get('maps_url')}")
