from typing import Dict, Any
from .service import SearchService
from .progress import Progress
from .queue import search_queue
from .ws import search_ws_manager
from .stop import stop_registry, TERMINAL_STATES

class SearchEngineAPI:
    """
    Facade for the new Search Engine Architecture.
    Delegates calls to the underlying services.
    """
    def __init__(self):
        self.progress = Progress()
        self.service = SearchService()

    async def execute_search(self, query: Dict[str, Any], user_id: str = None) -> Dict[str, Any]:
        """
        Creates a new search job and enqueues it.
        """
        keyword = query.get("keyword", "")
        area = query.get("area", "")
        city = query.get("city", "")
        state = query.get("state", "")
        country = query.get("country", "")
        limit = query.get("limit", 50)
        provider = query.get("provider") or "Google Maps"
        exhaustive = bool(query.get("exhaustive", False))
        grid_size = int(query.get("grid_size", 3) or 3)
        target_cap = str(query.get("target_cap") or "ALL")
        
        if not keyword:
            raise ValueError("Keyword is required")
            
        # Create job in database
        job_id = await self.progress.create_job(
            keyword, area, city, state, country, limit,
            provider=provider, user_id=user_id,
            exhaustive=exhaustive, grid_size=grid_size,
            target_cap=target_cap
        )
        
        # Enqueue background task
        await search_queue.enqueue(
            self.service.execute_job,
            job_id=job_id,
            keyword=keyword,
            area=area,
            city=city,
            state=state,
            country=country,
            limit=limit,
            provider=provider,
            user_id=user_id,
            exhaustive=exhaustive,
            grid_size=grid_size,
            target_cap=target_cap
        )
        
        return {
            "status": "success", 
            "message": "Search job created and queued",
            "job_id": job_id
        }

    async def get_status(self, job_id: str) -> Dict[str, Any]:
        """
        Retrieves the status of a search job.
        """
        job = await self.progress.get_job(job_id)
        if not job:
            raise Exception("Job not found")
            
        job_dict = dict(job)
        if "_id" in job_dict:
            job_dict["_id"] = str(job_dict["_id"])
            job_dict["job_id"] = job_dict["_id"]
        return job_dict

    async def stop_job(self, job_id: str) -> Dict[str, Any]:
        """
        Stops a running search job end-to-end:

        1. Immediately marks the job STOPPED in the database (with current
           progress frozen and the terminal log block appended).
        2. Broadcasts a job_stopped event on the job WebSocket channel.
        3. Signals the running worker so it stops at the next safe point and
           closes the Playwright browser.

        Idempotent: if the job is already terminal, returns its current state.
        """
        job = await self.progress.get_job(job_id)
        if not job:
            raise Exception("Job not found")

        if job.get("status") in TERMINAL_STATES:
            return dict(job)

        terminal_logs = [
            ("STOPPING", "User requested stop"),
            ("STOPPING", "Stopping scraper..."),
            ("STOPPING", "Closing browser..."),
            ("STOPPING", "Cancelling workers..."),
            ("STOPPED", "Search terminated."),
            ("STOPPED", "Status changed to STOPPED."),
        ]
        await self.progress.mark_stopped(job_id, reason="Stopped by user", logs=terminal_logs)

        # Only broadcast and signal the worker if the job actually transitioned
        # to STOPPED (it may have raced to COMPLETED/FAILED at the same moment).
        stopped_job = await self.progress.get_job(job_id)
        if not stopped_job or stopped_job.get("status") != "STOPPED":
            return dict(stopped_job) if stopped_job else {"job_id": job_id}

        await search_ws_manager.broadcast_job_stopped(
            job_id,
            progress=stopped_job.get("progress", 0),
            message="Job stopped by user"
        )

        # If the worker has not started yet (QUEUED), register the stop signal
        # so it is honoured the moment the worker starts.
        if job.get("status") == "QUEUED":
            stop_registry.register(job_id)
        stop_registry.request_stop(job_id)

        return dict(stopped_job)
