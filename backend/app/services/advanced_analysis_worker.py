import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.services.lead_enrichment_service import lead_enrichment_service, LeadEnrichmentData, to_object_id
from app.services.analysis_result_mapper import analysis_result_mapper

logger = logging.getLogger(__name__)

class AdvancedAnalysisWorker:
    _instance = None
    
    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(AdvancedAnalysisWorker, cls).__new__(cls)
        return cls._instance

    def __init__(self, db: AsyncIOMotorDatabase = None):
        if not hasattr(self, 'initialized'):
            self.db = db
            self.is_running = False
            self.is_paused = False
            self.current_task: Optional[asyncio.Task] = None
            self.active_jobs = set()
            self.initialized = True
            
    async def initialize(self):
        logger.info("Initializing Crawler Worker...")
        if self.db is None:
            return
            
        try:
            crashed_jobs = await self.db["advanced_analysis_queue"].find({
                "status": {"$in": ["INITIALIZING", "RUNNING"]}
            }).to_list(length=None)
            
            for job in crashed_jobs:
                if job.get("retry_count", 0) >= job.get("max_retries", 3):
                    new_status = "FAILED"
                    log_msg = "Job failed after server crash (max retries reached)"
                else:
                    new_status = "PENDING"
                    log_msg = "Job recovered from server crash and queued for retry"
                    
                await self.db["advanced_analysis_queue"].update_one(
                    {"_id": job["_id"]},
                    {
                        "$set": {
                            "status": new_status,
                            "updated_at": datetime.utcnow()
                        },
                        "$push": {"logs": log_msg}
                    }
                )
            logger.info(f"Recovered {len(crashed_jobs)} crashed jobs.")
        except Exception as e:
            logger.error(f"Failed to recover jobs: {e}")

    def start(self):
        if self.is_running: return
        logger.info("Starting Crawler Worker loop")
        self.is_running = True
        self.is_paused = False
        self.current_task = asyncio.create_task(self._worker_loop())
        
    def stop(self):
        logger.info("Stopping Crawler Worker loop")
        self.is_running = False
        if self.current_task:
            self.current_task.cancel()
            
    def pause(self):
        self.is_paused = True
        logger.info("Crawler Worker paused")
        
    def resume(self):
        self.is_paused = False
        logger.info("Crawler Worker resumed")

    def get_status(self):
        return {
            "is_running": self.is_running,
            "is_paused": self.is_paused,
            "active_jobs_count": len(self.active_jobs)
        }

    async def _worker_loop(self):
        while self.is_running:
            try:
                if self.is_paused:
                    await asyncio.sleep(5)
                    continue
                    
                job = await self.db["advanced_analysis_queue"].find_one_and_update(
                    {"status": {"$in": ["PENDING", "QUEUED"]}},
                    {
                        "$set": {
                            "status": "INITIALIZING",
                            "started_at": datetime.utcnow(),
                            "updated_at": datetime.utcnow()
                        },
                        "$push": {"logs": "Worker claimed job. Initializing."}
                    },
                    sort=[("created_at", 1)]
                )
                
                if not job:
                    await asyncio.sleep(3)
                    continue
                    
                job_id = str(job["_id"])
                self.active_jobs.add(job_id)
                
                try:
                    await self._process_job(job)
                except Exception as e:
                    logger.error(f"Error processing job {job_id}: {e}")
                    await self._handle_job_failure(job, str(e))
                finally:
                    if job_id in self.active_jobs:
                        self.active_jobs.remove(job_id)
                        
            except asyncio.CancelledError:
                logger.info("Worker loop cancelled")
                break
            except Exception as e:
                logger.error(f"Unexpected error in worker loop: {e}")
                await asyncio.sleep(5)

    async def _process_job(self, job: dict):
        job_id = job["_id"]
        lead_id = job.get("lead_id")
        website_url = job.get("website_url")
        analysis_started_at = datetime.now(timezone.utc)
        prev_analysis_count = 0

        # Fetch current Lead to get previous analysis count before starting
        try:
            existing_lead = await self.db["leads"].find_one({"_id": to_object_id(str(lead_id))}, {"ai_analysis": 1})
            if existing_lead and existing_lead.get("ai_analysis"):
                prev_analysis_count = existing_lead["ai_analysis"].get("analysis_count", 0)
        except Exception:
            pass

        # Mark Lead analysis as started
        await lead_enrichment_service.mark_analysis_started(str(lead_id), str(job_id), website_url)
        
        from app.services.ws_manager import ws_manager
        
        async def broadcast(stage, current_url, metrics=None):
            if metrics is None: metrics = {}
            # Ensure safe serialization for ws
            await ws_manager.broadcast_to_job(str(job_id), {
                "type": "CRAWLER_UPDATE",
                "queue_id": str(job_id),
                "stage": stage,
                "current_url": current_url,
                "metrics": metrics
            })

        await self.db["advanced_analysis_queue"].update_one(
            {"_id": job_id},
            {
                "$set": {"status": "RUNNING", "updated_at": datetime.utcnow()},
                "$push": {"logs": f"Crawl started for {website_url}."}
            }
        )
        
        from app.services.crawler import WebsiteCrawler
        
        try:
            crawler = WebsiteCrawler(max_pages=200, max_depth=5)
            await self.db["advanced_analysis_queue"].update_one(
                {"_id": job_id},
                {"$push": {"logs": f"Deep crawling {website_url} initialized..."}}
            )
            
            # The on_update callback handles live telemetry
            crawl_result = await crawler.crawl(website_url, on_update=broadcast)
            
            if not crawl_result["success"]:
                raise Exception(crawl_result.get("error", "Unknown validation error"))
                
            metrics = crawl_result["metrics"]
            
            await broadcast("Persisting Data", website_url, metrics)
            
            # MongoDB Persistence
            # 1. Website Collection
            website_doc = {
                "lead_id": lead_id,
                "canonical_url": crawl_result["website"],
                "metrics": metrics,
                "crawled_at": datetime.utcnow()
            }
            await self.db["crawled_websites"].insert_one(website_doc)
            
            # 2. Pages Collection
            if crawl_result["pages"]:
                pages_docs = []
                for p in crawl_result["pages"]:
                    p["lead_id"] = lead_id
                    p["crawled_at"] = datetime.utcnow()
                    pages_docs.append(p)
                await self.db["crawled_pages"].insert_many(pages_docs)
                
            # 3. Links Graph Collection
            if crawl_result["links"]:
                links_docs = []
                for l in crawl_result["links"]:
                    l["lead_id"] = lead_id
                    links_docs.append(l)
                await self.db["crawled_links"].insert_many(links_docs)
                
            # 4. Errors Collection
            if crawl_result["errors"]:
                errors_docs = []
                for e in crawl_result["errors"]:
                    e["lead_id"] = lead_id
                    errors_docs.append(e)
                await self.db["crawled_errors"].insert_many(errors_docs)
            
            # 5. Contact Intelligence Engine
            from app.services.contact_discovery_service import ContactDiscoveryService
            await broadcast("Contact Intelligence", website_url, {"pages_remaining": len(crawl_result["pages"])})
            
            contact_service = ContactDiscoveryService()
            contacts_result = await contact_service.extract_contacts(
                lead_id=lead_id,
                pages=crawl_result["pages"],
                links=crawl_result["links"],
                on_update=broadcast
            )
            
            # Persist contacts
            if contacts_result.contacts:
                contacts_dict = contacts_result.dict(by_alias=True)
                await self.db["contact_discovery"].insert_one(contacts_dict)
            
            emails_found = len([c for c in contacts_result.contacts if c.type == "Email"])
            phones_found = len([c for c in contacts_result.contacts if c.type == "Phone"])
            wa_found = len([c for c in contacts_result.contacts if c.type == "WhatsApp"])
            addresses_found = len([c for c in contacts_result.contacts if c.type == "Address"])
            socials_found = len([c for c in contacts_result.contacts if c.type not in ["Email", "Phone", "WhatsApp", "Address"]])

            metrics["emails_found"] = emails_found
            metrics["phones_found"] = phones_found
            metrics["whatsapp_found"] = wa_found
            metrics["addresses_found"] = addresses_found
            metrics["social_links_found"] = socials_found

            # ── ENRICH LEAD: Contact Discovery & Social Media ──
            try:
                contact_enrichment = LeadEnrichmentData()
                contact_enrichment.contact_discovery = analysis_result_mapper.map_contact_result(contacts_result)
                contact_enrichment.social_media = analysis_result_mapper.map_social_media(contacts_result)
                cd = contact_enrichment.contact_discovery
                if cd.get("primary_email"):
                    contact_enrichment.primary_email = cd["primary_email"]
                if cd.get("primary_phone"):
                    contact_enrichment.primary_phone = cd["primary_phone"]
                if cd.get("office_address"):
                    contact_enrichment.primary_address = cd["office_address"]
                await lead_enrichment_service.enrich_lead(
                    str(lead_id), contact_enrichment, archive_before_overwrite=True
                )
                logger.info(f"[AdvancedWorker] Lead {lead_id}: contacts enriched ({emails_found} emails)")
            except Exception as enrich_err:
                logger.warning(f"[AdvancedWorker] Contact enrichment failed: {enrich_err}")
            
            # 6. Technology Detection Engine
            from app.services.technology_detection_service import TechnologyDetectionService
            await broadcast("Technology Detection", website_url, {"pages_remaining": 0})
            
            tech_service = TechnologyDetectionService()
            tech_result = await tech_service.detect_technologies(
                lead_id=lead_id,
                pages=crawl_result["pages"],
                on_update=broadcast
            )
            
            if tech_result.technologies:
                tech_dict = tech_result.dict(by_alias=True)
                await self.db["technology_discovery"].insert_one(tech_dict)

            # Keep the intelligence dashboards' technology charts in sync.
            await tech_service.persist_result(tech_result, db=self.db)

            metrics["libraries_detected"] = len(tech_result.technologies)
            metrics["frameworks_detected"] = len([t for t in tech_result.technologies if "Framework" in t.category])

            # ── ENRICH LEAD: Technology Detection ──
            try:
                tech_enrichment = LeadEnrichmentData()
                tech_enrichment.technology_detection = analysis_result_mapper.map_tech_result(tech_result)
                await lead_enrichment_service.enrich_lead(str(lead_id), tech_enrichment)
                logger.info(f"[AdvancedWorker] Lead {lead_id}: technology detection enriched")
            except Exception as enrich_err:
                logger.warning(f"[AdvancedWorker] Tech enrichment failed: {enrich_err}")
            
            # 7. SEO Analysis Engine
            from app.services.seo_analysis_service import SeoAnalysisService
            await broadcast("SEO Analysis", website_url, {"pages_remaining": len(crawl_result["pages"])})
            
            seo_service = SeoAnalysisService()
            seo_result = await seo_service.analyze_website(
                lead_id=lead_id,
                website_url=website_url,
                pages=crawl_result["pages"],
                links=crawl_result["links"],
                on_update=broadcast
            )
            
            seo_dict = seo_result.dict(by_alias=True)
            await self.db["seo_discovery"].insert_one(seo_dict)

            metrics["seo_score"] = seo_result.scorecard.overall_score
            metrics["seo_issues_found"] = len(seo_result.issues)

            # ── ENRICH LEAD: SEO ──
            try:
                seo_enrichment = LeadEnrichmentData()
                seo_enrichment.seo = analysis_result_mapper.map_seo_result(seo_result)
                await lead_enrichment_service.enrich_lead(str(lead_id), seo_enrichment)
                logger.info(f"[AdvancedWorker] Lead {lead_id}: SEO enriched (score {seo_result.scorecard.overall_score})")
            except Exception as enrich_err:
                logger.warning(f"[AdvancedWorker] SEO enrichment failed: {enrich_err}")
            
            # 8. Performance Analysis Engine
            from app.services.performance_analysis_service import PerformanceAnalysisService
            await broadcast("Performance Engine", website_url, {})
            
            perf_service = PerformanceAnalysisService()
            perf_result = await perf_service.analyze_performance(
                lead_id=lead_id,
                website_url=website_url,
                on_update=broadcast
            )
            
            perf_dict = perf_result.dict(by_alias=True)
            await self.db["performance_discovery"].insert_one(perf_dict)

            metrics["performance_desktop_score"] = perf_result.scorecard.overall_desktop_score
            metrics["performance_mobile_score"] = perf_result.scorecard.overall_mobile_score

            # ── ENRICH LEAD: Performance ──
            try:
                perf_enrichment = LeadEnrichmentData()
                perf_enrichment.performance = analysis_result_mapper.map_performance_result(perf_result)
                # Also set website information from crawl (final_url, domain, ssl, etc)
                perf_enrichment.website_information = analysis_result_mapper.map_website_information(
                    crawl_result, website_url
                )
                perf_enrichment.website_structure = analysis_result_mapper.map_website_structure(crawl_result)
                await lead_enrichment_service.enrich_lead(str(lead_id), perf_enrichment)
                logger.info(f"[AdvancedWorker] Lead {lead_id}: performance enriched")
            except Exception as enrich_err:
                logger.warning(f"[AdvancedWorker] Performance enrichment failed: {enrich_err}")
            
            # 9. UI/UX Visual Engine
            from app.services.ui_ux_analysis_service import UiUxAnalysisService
            await broadcast("UI/UX Engine", website_url, {})
            
            uiux_service = UiUxAnalysisService()
            uiux_result = await uiux_service.analyze_ui_ux(
                lead_id=lead_id,
                website_url=website_url,
                on_update=broadcast
            )
            
            uiux_dict = uiux_result.dict(by_alias=True)
            await self.db["ui_ux_discovery"].insert_one(uiux_dict)

            metrics["ui_score"] = uiux_result.scorecard.overall_ui_score
            metrics["ux_score"] = uiux_result.scorecard.overall_ux_score
            metrics["screenshots_taken"] = len(uiux_result.screenshots)
            
            # 10. Security & Compliance Engine
            from app.services.security_analysis_service import SecurityAnalysisService
            await broadcast("Security & Compliance Engine", website_url, {})
            
            sec_service = SecurityAnalysisService()
            sec_result = await sec_service.analyze_security(
                lead_id=lead_id,
                website_url=website_url,
                pages=crawl_result["pages"],
                on_update=broadcast
            )
            
            sec_dict = sec_result.dict(by_alias=True)
            await self.db["security_discovery"].insert_one(sec_dict)

            metrics["security_score"] = sec_result.scorecard.overall_security_score
            metrics["accessibility_score"] = sec_result.scorecard.accessibility_score
            metrics["compliance_score"] = sec_result.scorecard.legal_compliance_score

            # ── ENRICH LEAD: Design (UI/UX + Security together) ──
            try:
                design_enrichment = LeadEnrichmentData()
                design_enrichment.design = analysis_result_mapper.map_design_result(
                    uiux_result=uiux_result,
                    security_result=sec_result
                )
                await lead_enrichment_service.enrich_lead(str(lead_id), design_enrichment)
                logger.info(f"[AdvancedWorker] Lead {lead_id}: design/security enriched")
            except Exception as enrich_err:
                logger.warning(f"[AdvancedWorker] Design enrichment failed: {enrich_err}")
            
            # 11. AI Scoring & Business Intelligence Engine
            from app.services.business_intelligence_service import BusinessIntelligenceService
            await broadcast("AI Scoring & BI Engine", website_url, {})
            
            bi_service = BusinessIntelligenceService(self.db)
            
            modules_data = {
                "contacts": contact_dict,
                "tech": tech_dict,
                "seo": seo_dict,
                "performance": perf_dict,
                "ui_ux": uiux_dict,
                "security": sec_dict
            }
            
            bi_result = await bi_service.compute_intelligence(
                lead_id=lead_id,
                website_url=website_url,
                modules_data=modules_data,
                on_update=broadcast
            )
            
            bi_dict = bi_result.dict(by_alias=True)
            await self.db["business_intelligence"].insert_one(bi_dict)

            metrics["master_score"] = bi_result.scorecard.overall_website_score
            metrics["opportunity_score"] = bi_result.scorecard.business_opportunity_score
            metrics["lead_classification"] = bi_result.lead_classification

            # ── ENRICH LEAD: Business Intelligence ──
            try:
                biz_enrichment = LeadEnrichmentData()
                biz_enrichment.business = analysis_result_mapper.map_business_result(
                    bi_result=bi_result,
                    overall_score=bi_result.scorecard.overall_website_score
                )
                await lead_enrichment_service.enrich_lead(str(lead_id), biz_enrichment)
                logger.info(f"[AdvancedWorker] Lead {lead_id}: business intelligence enriched")
            except Exception as enrich_err:
                logger.warning(f"[AdvancedWorker] BI enrichment failed: {enrich_err}")
            
            # 12. Sales Intelligence Engine
            from app.services.sales_intelligence_service import SalesIntelligenceService
            await broadcast("Sales Intelligence Engine", website_url, {})
            
            sales_service = SalesIntelligenceService(self.db)
            sales_result = await sales_service.compute_sales_intelligence(
                lead_id=lead_id,
                website_url=website_url,
                modules_data=modules_data,
                on_update=broadcast
            )
            
            sales_dict = sales_result.dict(by_alias=True)
            await self.db["sales_intelligence"].insert_one(sales_dict)
            
            metrics["service_opportunities"] = len(sales_result.service_opportunities)
            metrics["recommended_packages"] = len(sales_result.recommended_packages)
            
            # 13. Outreach Intelligence Engine
            from app.services.outreach_intelligence_service import OutreachIntelligenceService
            await broadcast("Outreach Intelligence", website_url, {})
            
            # Re-inject the sales dict back into modules_data for the outreach engine
            modules_data["business_intelligence"] = bi_dict
            modules_data["sales_intelligence"] = sales_dict
            
            outreach_service = OutreachIntelligenceService(self.db)
            outreach_result = await outreach_service.generate_outreach(
                lead_id=lead_id,
                website_url=website_url,
                modules_data=modules_data,
                on_update=broadcast
            )
            
            outreach_dict = outreach_result.dict(by_alias=True)
            await self.db["outreach_discovery"].insert_one(outreach_dict)
            
            # 14. Mark as COMPLETED
            await broadcast("Completed", website_url, metrics)

            # ── ENRICH LEAD: Final AI Metadata (Completed) ──
            try:
                completed_at = datetime.now(timezone.utc)
                meta_enrichment = LeadEnrichmentData()
                
                ai_meta = analysis_result_mapper.map_ai_metadata(
                    started_at=analysis_started_at,
                    completed_at=completed_at,
                    prev_count=prev_analysis_count,
                    analysis_version="2.0",
                    status="COMPLETED"
                )
                
                # --- Map missing scores for frontend rendering ---
                ai_meta["overall_score"] = metrics.get("master_score", 0)
                ai_meta["overall_ai_score"] = metrics.get("master_score", 0)
                ai_meta["seo_score"] = metrics.get("seo_score", 0)
                
                perf_mobile = metrics.get("performance_mobile_score") or 0
                perf_desktop = metrics.get("performance_desktop_score") or 0
                ai_meta["performance_score"] = max(perf_mobile, perf_desktop)
                
                ai_meta["ui_score"] = metrics.get("ui_score", 0)
                ai_meta["ux_score"] = metrics.get("ux_score", 0)
                ai_meta["security_score"] = metrics.get("security_score", 0)
                ai_meta["accessibility_score"] = metrics.get("accessibility_score", 0)
                ai_meta["business_opportunity"] = metrics.get("opportunity_score", 0)
                
                meta_enrichment.ai_analysis = ai_meta
                
                from app.services.lead_enrichment_service import persist_ai_analysis
                await persist_ai_analysis(str(lead_id), meta_enrichment.ai_analysis)
                logger.info(f"[AdvancedWorker] Lead {lead_id}: analysis marked Completed")
            except Exception as enrich_err:
                logger.warning(f"[AdvancedWorker] Final metadata enrichment failed: {enrich_err}")

            await self.db["advanced_analysis_queue"].update_one(
                {"_id": job_id},
                {
                    "$set": {
                        "status": "COMPLETED",
                        "progress": 100,
                        "completed_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc),
                        "total_pages": metrics.get("pages_crawled", 0),
                        "broken_links_count": metrics.get("broken_links", 0),
                        "success_count": 1
                    },
                    "$push": {"logs": f"Crawl complete. Persisted {metrics.get('pages_crawled')} pages."}
                }
            )
            # Notify intelligence dashboard
            try:
                from app.core.intelligence_ws import intelligence_manager
                from app.services.intelligence_service import invalidate_cache
                invalidate_cache()
                await intelligence_manager.broadcast_kpi_update({
                    "lead_id": str(job.get("lead_id", "")),
                    "website": website_url,
                })
            except Exception as ws_err:
                logger.warning(f"Intelligence WS broadcast error: {ws_err}")
        except Exception as e:
            logger.error(f"Error crawling {website_url}: {e}")
            await broadcast("Failed", website_url, {"error": str(e)})

            # Mark Lead analysis as failed — preserves all already-enriched data
            await lead_enrichment_service.mark_analysis_failed(str(lead_id), str(e))

            await self.db["advanced_analysis_queue"].update_one(
                {"_id": job_id},
                {
                    "$set": {
                        "status": "FAILED",
                        "error_message": str(e),
                        "updated_at": datetime.now(timezone.utc),
                        "failure_count": 1
                    },
                    "$push": {"logs": f"Crawl failed: {str(e)}"}
                }
            )
        
    async def _handle_job_failure(self, job: dict, error_msg: str):
        job_id = job["_id"]
        current_retries = job.get("retry_count", 0)
        max_retries = job.get("max_retries", 3)
        
        if current_retries < max_retries:
            await self.db["advanced_analysis_queue"].update_one(
                {"_id": job_id},
                {
                    "$set": {
                        "status": "PENDING",
                        "retry_count": current_retries + 1,
                        "last_error": error_msg,
                        "updated_at": datetime.utcnow()
                    },
                    "$push": {"logs": f"Job failed: {error_msg}. Retrying ({current_retries + 1}/{max_retries})"}
                }
            )
        else:
            await self.db["advanced_analysis_queue"].update_one(
                {"_id": job_id},
                {
                    "$set": {
                        "status": "FAILED",
                        "error_message": error_msg,
                        "last_error": error_msg,
                        "completed_at": datetime.utcnow(),
                        "updated_at": datetime.utcnow()
                    },
                    "$push": {"logs": f"Job failed permanently after {max_retries} retries. Error: {error_msg}"}
                }
            )
