import asyncio
import traceback
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import httpx

from app.core.logger import logger
from app.models.enrichment_job import EnrichmentJobState
from app.core.websocket import manager as ws_manager
from app.core.state_machine import StateMachine, apply_and_persist, TransitionRecord
from app.core.state_machine.machines import ENRICHMENT_JOB

from app.services.crawler_engine.engine import CrawlEngine
from app.services.contact_discovery_service import ContactDiscoveryService
from app.services.technology_detection_service import TechnologyDetectionService
from app.services.seo_analysis_service import SeoAnalysisService
from app.services.lead_enrichment_service import lead_enrichment_service, LeadEnrichmentData

class EnrichmentQueueWorker:
    """
    Independent Asynchronous Background Worker for Lead Enrichment.
    Pulls jobs from `enrichment_jobs` and executes the advanced recursive crawler pipeline.
    """
    
    def __init__(self, db: AsyncIOMotorDatabase, max_concurrent: int = 2):
        self.db = db
        self.max_concurrent = max_concurrent
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._semaphore = asyncio.Semaphore(max_concurrent)

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._worker_loop())
        logger.info(f"EnrichmentQueueWorker started with concurrency {self.max_concurrent}")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("EnrichmentQueueWorker stopped")

    async def _worker_loop(self):
        while self._running:
            try:
                try:
                    job = await asyncio.wait_for(
                        self.db["enrichment_jobs"].find_one_and_update(
                            {"status": "queued"},
                            {"$set": {"status": EnrichmentJobState.RUNNING.value, "started_at": datetime.now(timezone.utc)}},
                            sort=[("created_at", 1)]
                        ),
                        timeout=15.0
                    )
                except asyncio.TimeoutError:
                    logger.warning("Enrichment worker: find_one_and_update timed out")
                    await asyncio.sleep(2)
                    continue
                if job:
                    await self.db["enrichment_jobs"].update_one(
                        {"_id": job["_id"]},
                        {"$push": {"state_history": {
                            "from": "queued",
                            "to": EnrichmentJobState.RUNNING.value,
                            "timestamp": datetime.now(timezone.utc),
                            "reason": "worker_claimed",
                            "actor": "enrichment_worker",
                        }}}
                    )
                
                if not job:
                    await asyncio.sleep(2)
                    continue
                    
                async with self._semaphore:
                    asyncio.create_task(self._process_job(job))
                
            except Exception as e:
                logger.error(f"EnrichmentQueueWorker error: {e}")
                await asyncio.sleep(5)

    async def _process_job(self, job: dict):
        job_id = str(job["_id"])
        lead_id = job["lead_id"]
        logger.info(f"ENRICHMENT_STARTED: Job {job_id} for Lead {lead_id}")
        start_time = time.time()
        
        await ws_manager.broadcast_event("global", "ENRICHMENT_STARTED", f"Started enrichment for lead {lead_id}", {"lead_id": lead_id, "job_id": job_id})
        
        try:
            oid = ObjectId(lead_id)
        except:
            oid = lead_id
            
        lead = await self.db["leads"].find_one({"_id": oid})
        if not lead:
            await self._fail_job(job_id, f"Lead {lead_id} not found in DB")
            return
            
        website = lead.get("website")
        if not website:
            # Handle businesses without websites gracefully
            await self._fail_job(job_id, "Lead has no website to enrich.", 3, 3)
            return
            
        if not website.startswith("http"):
            website = f"https://{website}"

        # 1. Validation (Reachability)
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.head(website)
                if resp.status_code >= 400 and resp.status_code != 403 and resp.status_code != 405: # Allow 403/405 as some block HEAD
                    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client2:
                        resp2 = await client2.get(website)
                        if resp2.status_code >= 400:
                            raise Exception(f"Website unreachable: HTTP {resp2.status_code}")
        except Exception as e:
            await self._fail_job(job_id, f"Website validation failed: {e}", 3, 3)
            return

        try:
            # 2. Crawler Engine (max_pages=10, max_depth=2 for reasonable performance)
            await ws_manager.broadcast_event("global", "WEBSITE_CRAWL_STARTED", f"Started deep crawl for {website}", {"lead_id": lead_id})
            
            async def crawl_update(stage, url, data):
                await ws_manager.broadcast_event("global", "PAGE_DISCOVERED", f"Discovered page: {url}", {"lead_id": lead_id, "url": url, "data": data})

            crawl_engine = CrawlEngine(max_pages=10, max_depth=2)
            crawl_res = await crawl_engine.execute_crawl(job_id, job_id, lead_id, website, on_update=crawl_update)
            
            if not crawl_res.get("success"):
                raise Exception(crawl_res.get("error", "Unknown crawler error"))
                
            # Fetch crawled pages
            pages = await self.db["crawl_pages"].find({"job_id": job_id}).to_list(length=None)
            
            if not pages:
                raise Exception("Crawler returned no valid pages.")
                
            enrichment = LeadEnrichmentData()
            
            # 3. Contact Discovery
            contact_svc = ContactDiscoveryService()
            contact_result = await contact_svc.execute_discovery(job_id, lead_id)
            
            if contact_result.contacts:
                emails_found = len([c for c in contact_result.contacts if c.type == "Email"])
                phones_found = len([c for c in contact_result.contacts if c.type == "Phone"])
                
                if emails_found > 0:
                    await ws_manager.broadcast_event("global", "EMAIL_FOUND", f"Found {emails_found} emails", {"lead_id": lead_id})
                if phones_found > 0:
                    await ws_manager.broadcast_event("global", "PHONE_FOUND", f"Found {phones_found} phones", {"lead_id": lead_id})
                if contact_result.social_facebook or contact_result.social_linkedin:
                    await ws_manager.broadcast_event("global", "SOCIAL_FOUND", "Found social media links", {"lead_id": lead_id})

            # Map the specific fields required by LeadEnrichmentData
            from app.services.analysis_result_mapper import analysis_result_mapper
            enrichment.contact_discovery = analysis_result_mapper.map_contact_result(contact_result)
            enrichment.social_media = analysis_result_mapper.map_social_media(contact_result)
            
            if contact_result.primary_email:
                enrichment.primary_email = contact_result.primary_email
            if contact_result.primary_phone:
                enrichment.primary_phone = contact_result.primary_phone

            # 4. Technology Detection
            async def tech_update(stage, url, data):
                pass
                
            tech_svc = TechnologyDetectionService()
            tech_result = await tech_svc.detect_technologies(lead_id, pages, on_update=tech_update)
            # Keep the intelligence dashboards' technology charts in sync.
            await tech_svc.persist_result(tech_result, db=self.db)

            if tech_result.technologies:
                await ws_manager.broadcast_event("global", "TECH_FOUND", f"Detected {len(tech_result.technologies)} technologies", {"lead_id": lead_id})
                enrichment.technology_detection = {
                    "technologies": [t.model_dump() for t in tech_result.technologies],
                    "websiteTechnologies": tech_result.websiteTechnologies,
                    "insights": tech_result.insights,
                }

            # 5. SEO Analysis
            seo_svc = SeoAnalysisService()
            
            # Reconstruct links structure for SEO analysis
            links = []
            for page in pages:
                source_url = page.get("url")
                for internal in page.get("internal_links", []):
                    links.append({"source": source_url, "target": internal})
                for external in page.get("external_links", []):
                    links.append({"source": source_url, "target": external})
                    
            seo_result = await seo_svc.analyze_website(lead_id, website, pages, links)
            
            if seo_result.scorecard:
                await ws_manager.broadcast_event("global", "SEO_COMPLETED", "SEO analysis completed", {"lead_id": lead_id})
                enrichment.seo = seo_result.model_dump()
                enrichment.performance = {"performance_score": seo_result.scorecard.mobile_score}

            # 6. MongoDB Update via LeadEnrichmentService
            await lead_enrichment_service.enrich_lead(lead_id, enrichment)

            duration = round(time.time() - start_time, 2)
            
            # Complete Job
            overall_score = seo_result.scorecard.overall_score if seo_result.scorecard else 0
            
            now = datetime.now(timezone.utc)
            await self.db["enrichment_jobs"].update_one(
                {"_id": ObjectId(job_id)},
                {
                    "$set": {
                        "status": EnrichmentJobState.COMPLETED.value,
                        "completed_at": now,
                        "duration_seconds": duration,
                        "final_quality_score": overall_score,
                    },
                    "$push": {"state_history": {
                        "from": EnrichmentJobState.RUNNING.value,
                        "to": EnrichmentJobState.COMPLETED.value,
                        "timestamp": now,
                        "reason": "pipeline_complete",
                        "actor": "enrichment_worker",
                    }},
                }
            )
            
            await ws_manager.broadcast_event("global", "ENRICHMENT_COMPLETED", f"Completed enrichment for lead {lead_id}", {"lead_id": lead_id})
            
            logger.info(f"ENRICHMENT_COMPLETED: Job {job_id} for Lead {lead_id} completed successfully in {duration}s")
            
        except Exception as e:
            error_trace = traceback.format_exc()
            logger.error(f"ENRICHMENT_FAILED: Job {job_id} for Lead {lead_id}: {e}\n{error_trace}")
            await self._fail_job(job_id, str(e), job.get("attempts", 0) + 1, job.get("max_attempts", 3))

    async def _fail_job(self, job_id: str, reason: str, attempt: int = 1, max_attempts: int = 3):
        target_state = EnrichmentJobState.FAILED if attempt >= max_attempts else EnrichmentJobState.QUEUED
        now = datetime.now(timezone.utc)

        # Fetch current job to get old status
        current_job = await self.db["enrichment_jobs"].find_one({"_id": ObjectId(job_id)})
        old_status = current_job.get("status") if current_job else "unknown"

        await self.db["enrichment_jobs"].update_one(
            {"_id": ObjectId(job_id)},
            {
                "$set": {
                    "status": target_state.value,
                    "error_message": reason,
                    "attempts": attempt,
                    "completed_at": now if target_state == EnrichmentJobState.FAILED else None,
                },
                "$push": {
                    "logs": {"message": reason, "timestamp": now.isoformat()},
                    "state_history": {
                        "from": old_status,
                        "to": target_state.value,
                        "timestamp": now,
                        "reason": f"attempt_{attempt}_failed: {reason}",
                        "actor": "enrichment_worker",
                    },
                },
            }
        )
        logger.info(f"TRANSITION [enrichment_job]: {old_status} -> {target_state.value} (attempt {attempt})")
