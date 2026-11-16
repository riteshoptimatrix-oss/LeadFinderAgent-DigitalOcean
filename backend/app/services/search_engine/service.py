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

    async def execute_job(
        self,
        job_id: str,
        keyword: str,
        area: str,
        city: str,
        state: str,
        country: str,
        limit: int,
        provider: str = "Google Maps",
        user_id: str = None,
        exhaustive: bool = False,
        grid_size: int = 3,
        target_cap: str = "ALL",
    ):
        """
        Executes a background search job using the Playwright engine.
        Cooperatively checks the stop registry so a user-triggered stop
        terminates the job at the next safe point.

        The extraction limit is the TARGET number of valid, unique leads that
        must be persisted to MongoDB. The job only completes when:

        * savedCount >= target (TARGET REACHED), or
        * all query expansion tiers are exhausted.

        It NEVER completes prematurely after just 60 leads.
        """
        stop_registry.register(job_id)
        engine = None
        requested_provider = provider or "Google Maps"
        active_provider = "Google Maps"
        fallback_used = requested_provider != "Google Maps"
        fallback_reason = (
            f"{requested_provider} directory index routed through Google Maps high-fidelity business database."
            if fallback_used else None
        )

        try:
            self._raise_if_stopped(job_id)

            init_msg = f"Initializing Search Engine ({requested_provider})"
            if fallback_used:
                init_msg += f" [Routed via {active_provider}]"

            await self.progress.update_status(job_id, "RUNNING", stage="INITIALIZING", message=init_msg)
            await search_ws_manager.broadcast_event(
                job_id,
                event_type="SEARCH_STARTED",
                message=init_msg,
                data={
                    "target": limit,
                    "provider": requested_provider,
                    "requested_provider": requested_provider,
                    "active_provider": active_provider,
                    "fallback_used": fallback_used,
                    "fallback_reason": fallback_reason,
                }
            )

            if fallback_used:
                await self.progress.log(
                    job_id,
                    stage="PROVIDER_FALLBACK",
                    message=f"[PROVIDER] Requested '{requested_provider}'. Active engine: '{active_provider}'. {fallback_reason}"
                )

            self._raise_if_stopped(job_id)
            engine = PlaywrightEngine()

            await self.progress.update_status(job_id, "RUNNING", stage="STARTING_BROWSER", message="Launching headless browser instance")
            await engine.start_browser()
            self._raise_if_stopped(job_id)

            from .query_expander import QueryExpander

            query_plan = QueryExpander.generate_query_plan(
                keyword=keyword,
                area=area,
                city=city,
                state=state,
                country=country,
                target_limit=limit,
                exhaustive=exhaustive,
            )

            total_queries = len(query_plan)
            logger.info(f"[SERVICE] Generated {total_queries} queries for target limit {limit} leads.")

            initial_saved = await self._count_saved_leads(job_id)
            counters = {
                "discovered": initial_saved,
                "found": initial_saved,
                "accepted": initial_saved,
                "rejected": 0,
                "duplicates": 0,
                "saved": initial_saved,
            }
            seen_urls = set()
            target_reached = initial_saved >= limit

            for query_idx, search_query in enumerate(query_plan, 1):
                if target_reached:
                    break

                self._raise_if_stopped(job_id)

                # Authoritative MongoDB check before starting next query
                db_saved = await self._count_saved_leads(job_id)
                if db_saved > counters['saved']:
                    counters['saved'] = db_saved
                if db_saved >= limit:
                    target_reached = True
                    logger.info(f"[TARGET REACHED] Authoritative count {db_saved} >= {limit}")
                    break

                nav_message = f"Query {query_idx}/{total_queries}: {search_query} (Collected {counters['saved']}/{limit})"
                await self.progress.update_status(job_id, "RUNNING", stage="OPENING_GOOGLE_MAPS", message=nav_message)
                logger.info(f"[TARGET] Query {query_idx}/{total_queries}: {search_query} | Current Progress: {counters['saved']}/{limit}")

                try:
                    await engine.navigate_to_maps(search_query)
                except Exception as e:
                    logger.warning(f"Failed to navigate to Google Maps and load the results feed for '{search_query}': {e}")
                    continue

                self._raise_if_stopped(job_id)
                await self.progress.update_status(job_id, "RUNNING", stage="DISCOVERING_RESULTS", message=f"Scanning feed for: {search_query}")

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
                                user_id=user_id,
                                target_cap=target_cap,
                                provider=active_provider,
                                requested_provider=requested_provider,
                            )

                            if status == "DUPLICATE":
                                counters['accepted'] -= 1
                                counters['duplicates'] += 1
                                logger.info(f"[SERVICE] Duplicate DB found: {data.get('name')}")
                                await self.progress.log(job_id, stage="DUPLICATE", message=f"Duplicate lead skipped: {data.get('name')}")
                                await search_ws_manager.broadcast_event(job_id, "duplicate_found", data={"business": data})
                            elif status == "REJECTED_CAP":
                                counters['accepted'] -= 1
                                counters['rejected'] += 1
                                logger.info(f"[SERVICE] Cap filter skipped {data.get('name')}")
                                await self.progress.log(job_id, stage="REJECTED_CAP", message=f"Lead skipped due to Cap filter ({target_cap}): {data.get('name')}")
                                await search_ws_manager.broadcast_event(job_id, "lead_failed", data={"reason": f"Target Cap Mismatch ({target_cap})", "business": data})
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

                if target_reached:
                    break

            # ---- Completion decision ----
            self._raise_if_stopped(job_id)

            # Authoritative MongoDB count: never trust the in-memory counter alone.
            db_saved = await self._count_saved_leads(job_id)
            if db_saved > counters['saved']:
                counters['saved'] = db_saved
            if db_saved >= limit:
                target_reached = True

            await self._broadcast_and_update_progress(job_id, counters, limit)

            location_label = ", ".join(p for p in [area, city, state, country] if p) or "specified location"
            if target_reached or counters['saved'] >= limit:
                final_status = "COMPLETED"
                target_reached = True
                source_exhausted = False
                message = f"Target reached! Successfully saved {counters['saved']}/{limit} verified leads."
                logger.info(f"[JOB] COMPLETED — {message}")
            elif counters['saved'] > 0:
                final_status = "PARTIALLY_COMPLETED"
                target_reached = False
                source_exhausted = True
                message = f"Source exhausted — Target not fully reached. Collected {counters['saved']} of {limit} requested leads across {total_queries} queries."
                logger.info(f"[JOB] PARTIALLY_COMPLETED — {message}")
            else:
                final_status = "COMPLETED"
                target_reached = False
                source_exhausted = True
                message = f"Search completed normally — 0 matching businesses found for '{keyword}' in {location_label}."
                logger.info(f"[JOB] ZERO_RESULTS COMPLETED — {message}")

            progress_pct = 100 if (target_reached or counters['saved'] == 0) else min(100, int((counters['saved'] / limit) * 100)) if limit > 0 else 100

            await self.progress.complete_job(
                job_id,
                status=final_status,
                message=message,
                found=counters['found'],
                accepted=counters['accepted'],
                rejected=counters['rejected'],
                duplicates=counters['duplicates'],
                saved=counters['saved'],
                limit=limit,
                target_reached=target_reached,
                source_exhausted=source_exhausted,
            )

            await search_ws_manager.broadcast_stats(job_id, {
                "status": final_status,
                "current_step": message,
                "current_action": message,
                "current_stage": final_status,
                "current_phase": final_status,
                "processed": counters['found'],
                "total_found": counters['found'],
                "total_leads": counters['saved'],
                "saved": counters['saved'],
                "duplicates": counters['duplicates'],
                "failed": counters['rejected'],
                "requested_target": limit,
                "actual_collected": counters['saved'],
                "target_reached": target_reached,
                "source_exhausted": source_exhausted,
                "requested_provider": requested_provider,
                "active_provider": active_provider,
                "fallback_used": fallback_used,
            })

            await search_ws_manager.broadcast_event(
                job_id,
                event_type="SEARCH_COMPLETED",
                message=message,
                data={
                    "status": final_status,
                    "current_step": message,
                    "current_action": message,
                    "current_stage": final_status,
                    "current_phase": final_status,
                    "businesses_found": counters['saved'],
                    "requested_target": limit,
                    "actual_collected": counters['saved'],
                    "target_reached": target_reached,
                    "source_exhausted": source_exhausted,
                    "progress": progress_pct,
                    "requested_provider": requested_provider,
                    "active_provider": active_provider,
                    "fallback_used": fallback_used,
                },
            )

            logger.info(f"[SERVICE] Job {job_id} finalized with status {final_status}.")

        except JobStoppedError:
            logger.info(f"[SERVICE] Job {job_id} stop acknowledged. Terminating worker.")
            await self.progress.log(job_id, stage="STOPPED", message="Search terminated. Status changed to STOPPED.")
        except Exception as e:
            err_msg = str(e) or repr(e) or "Scraper execution failed"
            logger.error(f"[SERVICE] Job {job_id} encountered exception: {err_msg}", exc_info=True)
            db_saved = await self._count_saved_leads(job_id)
            if db_saved > 0:
                # If we saved leads, do NOT mark as complete failure - mark as PARTIALLY_COMPLETED
                partial_msg = f"Search halted by transient issue: {err_msg}. Saved {db_saved}/{limit} leads."
                await self.progress.complete_job(
                    job_id,
                    status="PARTIALLY_COMPLETED",
                    message=partial_msg,
                    found=counters['found'] if 'counters' in locals() else db_saved,
                    accepted=counters['accepted'] if 'counters' in locals() else db_saved,
                    rejected=counters['rejected'] if 'counters' in locals() else 0,
                    duplicates=counters['duplicates'] if 'counters' in locals() else 0,
                    saved=db_saved,
                    limit=limit,
                    target_reached=False,
                    source_exhausted=True
                )
                await search_ws_manager.broadcast_event(
                    job_id,
                    event_type="SEARCH_COMPLETED",
                    message=partial_msg,
                    data={
                        "status": "PARTIALLY_COMPLETED",
                        "current_step": partial_msg,
                        "current_action": partial_msg,
                        "current_stage": "PARTIALLY_COMPLETED",
                        "current_phase": "PARTIALLY_COMPLETED",
                        "businesses_found": db_saved,
                        "actual_collected": db_saved,
                        "requested_target": limit,
                        "target_reached": False,
                        "source_exhausted": True,
                        "progress": min(100, int((db_saved / limit) * 100)) if limit > 0 else 0,
                    }
                )
            else:
                await self.progress.update_status(job_id, "FAILED", stage="ERROR", message=err_msg)
                await search_ws_manager.broadcast_event(
                    job_id,
                    event_type="SEARCH_FAILED",
                    message=err_msg,
                    data={
                        "status": "FAILED",
                        "current_step": f"Search failed: {err_msg}",
                        "current_action": f"Search failed: {err_msg}",
                        "current_stage": "FAILED",
                        "current_phase": "FAILED",
                    }
                )
        finally:
            if engine:
                await engine.close()
            stop_registry.unregister(job_id)
