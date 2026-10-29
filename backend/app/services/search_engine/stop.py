"""
Stop Registry for the Search Engine
====================================
In-memory registry that lets the Stop API signal a running Search job to
terminate cooperatively, and lets the running job check whether a stop was
requested at safe points during execution.

STOPPED is a terminal state: once a job is STOPPED it must never transition
back to RUNNING.
"""
import asyncio
import logging
from typing import Dict

logger = logging.getLogger(__name__)

TERMINAL_STATES = ("COMPLETED", "FAILED", "CANCELLED", "STOPPED", "TIMEOUT")


class StopRegistry:
    """Tracks a stop signal (asyncio.Event) per job id."""

    def __init__(self) -> None:
        self._events: Dict[str, asyncio.Event] = {}

    def register(self, job_id: str) -> None:
        """Register a job so it can be signalled. Safe to call repeatedly."""
        if job_id not in self._events:
            self._events[job_id] = asyncio.Event()

    def request_stop(self, job_id: str) -> None:
        """Signal that a job should stop. Idempotent."""
        event = self._events.get(job_id)
        if event is None:
            return
        event.set()
        logger.info(f"[STOP] Stop requested for job {job_id}")

    def is_stopped(self, job_id: str) -> bool:
        """Return True if a stop has been requested for the job."""
        event = self._events.get(job_id)
        return event is not None and event.is_set()

    def unregister(self, job_id: str) -> None:
        """Release the stop signal for a job once execution is finished."""
        self._events.pop(job_id, None)


stop_registry = StopRegistry()
