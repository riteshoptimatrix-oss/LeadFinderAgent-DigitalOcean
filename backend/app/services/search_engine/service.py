import logging
import asyncio
import sys
import os
import dataclasses
from typing import Dict, Any

from .storage import Storage
from .progress import Progress
from .ws import search_ws_manager
from .playwright_engine import PlaywrightEngine
from .parser import Parser
from .validator import Validator
from .stop import stop_registry

logger = logging.getLogger(__name__)

class JobStoppedError(Exception):
    """Raised inside a job worker when a stop has been requested."""
    pass

class SearchService:
    """
    Coordinates the business logic for the Search Engine.
    Orchestrates PlaywrightEngine -> Parser -> Validator -> Storage.
    """
    
    def __init__(self):
        self.storage = Storage()
        self.progress = Progress()
        self.validator = Validator()

    def _raise_if_stopped(self, job_id: str):
        """Aborts the worker immediately if a stop was requested."""
        if stop_registry.is_stopped(job_id):
            raise JobStoppedError(f"Job {job_id} was stopped by user")

    async def _count_saved_leads(self, job_id: str) -> int:
        """
        Authoritative saved count: queries MongoDB directly for the number of
        unique leads persisted for this job. The in-memory counter is only a hint;
        the database is the source of truth for completion.
        """
        try:
            from app.db.database import get_db
            db = get_db()
            if db is None:
                return 0
            return await db["leads"].count_documents({"source_job_id": job_id})
        except Exception as e:
            logger.warning(f"[SERVICE] Failed to query authoritative saved count: {e}")
            return 0

    async def _broadcast_and_update_progress(self, job_id: str, counters: Dict[str, int], limit: int):
        """Broadcasts live stats and persists granular progress counters."""
        remaining = max(0, limit - counters['saved'])
        await search_ws_manager.broadcast_stats(job_id, {
            "processed": counters['found'],
            "total_found": counters['found'],
            "total_leads": counters['saved'],
            "saved": counters['saved'],
            "duplicates": counters['duplicates'],
            "failed": counters['rejected'],
            "requested_target": limit,
            "actual_collected": counters['saved'],
            "remaining": remaining,
        })
        await self.progress.update_progress(
            job_id, found=counters['found'], accepted=counters['accepted'],
            rejected=counters['rejected'], duplicates=counters['duplicates'],
            saved=counters['saved'], limit=limit
        )

    async def execute_job(self, job_id: str, keyword: str, area: str, city: str, state: str, country: str, limit: int, provider: str = "Google Maps", user_id: str = None):
        """
        Executes a background search job using the Playwright engine.
        Cooperatively checks the stop registry so a user-triggered stop
        terminates the job at the next safe point.

        The extraction limit is the TARGET number of valid, unique leads that
        must be persisted to MongoDB. The job only completes when:

        * savedCount >= target (TARGET REACHED), or
        * the source is genuinely exhausted and no more unique results exist
          (SOURCE EXHAUSTED — collected what was available).

        It NEVER completes merely because a page/batch/viewport was finished.
        """
        stop_registry.register(job_id)
        engine = None
        try:
            self._raise_if_stopped(job_id)
            await self.progress.update_status(job_id, "RUNNING", stage="INITIALIZING", message="Initializing Search Engine")
            await search_ws_manager.broadcast_event(job_id, event_type="SEARCH_STARTED", message="Search initializing", data={"target": limit})

            self._raise_if_stopped(job_id)
            engine = PlaywrightEngine()

            await self.progress.update_status(job_id, "RUNNING", stage="STARTING_BROWSER", message="Launching headless browser instance")
            await engine.start_browser()
            self._raise_if_stopped(job_id)

            # Build a precise location query (no empty segments / double commas)
            location_parts = [p.strip() for p in (area, city, state, country) if p and p.strip()]
            location_str = ", ".join(location_parts)
            search_query = f"{keyword} near {location_str}" if location_str else keyword
            await self.progress.update_status(job_id, "RUNNING", stage="OPENING_GOOGLE_MAPS", message=f"Navigating to: {search_query}")
            logger.info(f"[TARGET] Requested {limit} leads | Query: {search_query}")

            try:
                await engine.navigate_to_maps(search_query)
            except Exception as e:
                raise Exception(f"Failed to navigate to Google Maps and load the results feed: {e}")

            self._raise_if_stopped(job_id)
            counters = {
                "discovered": 0,
                "found": 0,
                "accepted": 0,
                "rejected": 0,
                "duplicates": 0,
                "saved": 0,
            }

            seen_urls = set()
            target_reached = False

            await self.progress.update_status(job_id, "RUNNING", stage="DISCOVERING_RESULTS", message="Discovering results feed")

            def status_callback(stage: str):
                pass

            async for detail_html, current_url in engine.scroll_results(limit=limit, status_callback=status_callback):
                self._raise_if_stopped(job_id)
                if current_url in seen_urls:
                    continue
                seen_urls.add(current_url)
                counters['discovered'] += 1
                logger.info(f"[DISCOVERY] Discovered business #{counters['discovered']}: {current_url}")

                await self.progress.update_status(job_id, "RUNNING", stage="EXTRACTING_BUSINESSES", message=f"Extracting business {counters['found'] + 1}/{limit}")

                try:
                    # Parse HTML
                    data = Parser.extract_business_cards(detail_html, current_url)
                    if not data:
                        logger.warning(f"[SERVICE] Parser returned empty data for {current_url}")
                        continue

                    counters['found'] += 1

                    logger.info(
                        f"PHONES_EXTRACTED: job={job_id} business={data.get('name')} "
                        f"phones={data.get('phone')}"
                    )

                    # Process via Pipeline (Validator)
                    await self.progress.update_status(job_id, "RUNNING", stage="VALIDATING", message=f"Validating {data.get('name', 'Unknown')}")

                    is_valid, reason = self.validator.validate(keyword, data)

                    if not is_valid:
                        counters['rejected'] += 1
                        logger.info(f"[SERVICE] Rejected {data.get('name')}: {reason}")
                        await self.progress.log(job_id, stage="REJECTED", message=f"Rejected {data.get('name')}: {reason}")
                        await search_ws_manager.broadcast_event(job_id, "lead_failed", data={"reason": f"Validation Failed: {reason}", "business": data})
                    else:
                        counters['accepted'] += 1

                        await self.progress.update_status(job_id, "RUNNING", stage="SAVING", message=f"Saving {data.get('name')}")

                        status = await self.storage.save_lead(
                            job_id, data,
                            area=area, city=city, state=state, country=country,
                            user_id=user_id
                        )

                        if status == "DUPLICATE":
                            counters['accepted'] -= 1
                            counters['duplicates'] += 1
                            logger.info(f"[SERVICE] Duplicate DB found: {data.get('name')}")
                            await self.progress.log(job_id, stage="DUPLICATE", message=f"Duplicate lead skipped: {data.get('name')}")
                            await search_ws_manager.broadcast_event(job_id, "duplicate_found", data={"business": data})
                        elif status == "ERROR":
                            counters['accepted'] -= 1
                            counters['rejected'] += 1
                            logger.error(f"[SERVICE] DB Error saving {data.get('name')}")
                            await search_ws_manager.broadcast_event(job_id, "lead_failed", data={"reason": "DB Error", "business": data})
                        else:
                            counters['saved'] += 1

                            # Log valid finding immediately to UI only after successful save
                            await search_ws_manager.broadcast_new_lead(job_id, data, counters['saved'])
                            await search_ws_manager.broadcast_event(job_id, "business_discovered", data={"business": data})
                            await search_ws_manager.broadcast_event(job_id, "lead_saved", data={"business": data})
                            logger.info(f"[SAVE] Saved {counters['saved']}/{limit}")

                except Exception as e:
                    logger.warning(f"[SERVICE] Error processing card: {e}", exc_info=True)
                    continue

                finally:
                    # Update stats unconditionally after every business
                    await self._broadcast_and_update_progress(job_id, counters, limit)

                # The ONLY legitimate early-completion condition: the target of
                # valid unique persisted leads has been reached.
                if counters['saved'] >= limit:
                    target_reached = True
                    logger.info(f"[TARGET REACHED] {counters['saved']}/{limit} leads successfully saved")
                    break

            # ---- Completion decision ----
            if counters['found'] == 0:
                raise Exception("ZERO_RESULTS: Engine completed execution but zero businesses were extracted. (Possible DOM change, Rate Limit, or invalid location).")

            self._raise_if_stopped(job_id)

            # Authoritative MongoDB count: never trust the in-memory counter alone.
            db_saved = await self._count_saved_leads(job_id)
            if db_saved > counters['saved']:
                counters['saved'] = db_saved
            if db_saved >= limit:
                target_reached = True

            await self._broadcast_and_update_progress(job_id, counters, limit)

            if target_reached:
                message = f"Target reached. Saved {counters['saved']}/{limit} leads."
                logger.info(f"[JOB] COMPLETED — {message}")
            else:
                # The generator ran to exhaustion: Google Maps had no more unique
                # usable results. Report honestly instead of pretending.
                message = f"Source exhausted. Collected {counters['saved']} of {limit} requested leads."
                logger.info(f"[JOB] COMPLETED — {message}")

            await self.progress.complete_job(
                job_id,
                status="COMPLETED",
                message=message,
                found=counters['found'],
                accepted=counters['accepted'],
                rejected=counters['rejected'],
                duplicates=counters['duplicates'],
                saved=counters['saved'],
                limit=limit,
                target_reached=target_reached,
                source_exhausted=not target_reached,
            )

            await search_ws_manager.broadcast_stats(job_id, {
                "processed": counters['found'],
                "total_found": counters['found'],
                "total_leads": counters['saved'],
                "saved": counters['saved'],
                "duplicates": counters['duplicates'],
                "failed": counters['rejected'],
                "requested_target": limit,
                "actual_collected": counters['saved'],
                "target_reached": target_reached,
                "source_exhausted": not target_reached,
            })

            await search_ws_manager.broadcast_event(
                job_id,
                event_type="SEARCH_COMPLETED",
                message=message,
                data={
                    "businesses_found": counters['saved'],
                    "requested_target": limit,
                    "actual_collected": counters['saved'],
                    "target_reached": target_reached,
                    "source_exhausted": not target_reached,
                    "progress": min(100, int((counters['saved'] / limit) * 100)) if limit > 0 else 100,
                },
            )

            logger.info(f"[SERVICE] Job {job_id} completed successfully.")

        except JobStoppedError:
            logger.info(f"[SERVICE] Job {job_id} stop acknowledged. Terminating worker.")
            await self.progress.log(job_id, stage="STOPPED", message="Search terminated. Status changed to STOPPED.")
        except Exception as e:
            logger.error(f"[SERVICE] Job {job_id} failed: {str(e)}", exc_info=True)
            await self.progress.update_status(job_id, "FAILED", stage="ERROR", message=str(e))
            await search_ws_manager.broadcast_event(job_id, event_type="SEARCH_FAILED", message=str(e), data={})
        finally:
            if engine:
                await engine.close()
            stop_registry.unregister(job_id)
