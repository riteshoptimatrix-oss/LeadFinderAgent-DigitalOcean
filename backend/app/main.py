import signal
import sys
import asyncio
import ssl
import os
import urllib3

# Configure SSL handling early - before any imports that might download models
if os.getenv('DISABLE_SSL_VERIFICATION', 'false').lower() == 'true':
    # Disable SSL verification globally
    ssl._create_default_https_context = ssl._create_unverified_context
    # Disable urllib3 SSL warnings
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    # Set environment variables that libraries might check
    os.environ['PYTHONHTTPSVERIFY'] = '0'
    os.environ['CURL_CA_BUNDLE'] = ''
    os.environ['REQUESTS_CA_BUNDLE'] = ''
    print("[STARTUP] SSL verification disabled globally due to DISABLE_SSL_VERIFICATION=true")

if sys.platform == 'win32':
    try:
        import asyncio.windows_events as we
        _orig_register = we.IocpProactor._register_with_iocp

        def _safe_register_with_iocp(self, obj):
            try:
                _orig_register(self, obj)
            except OSError as exc:
                # [WinError 87] The parameter is incorrect: socket handle already associated with IOCP
                if getattr(exc, 'winerror', None) == 87 or getattr(exc, 'errno', None) == 87:
                    if hasattr(self, '_registered'):
                        self._registered.add(obj)
                    return
                raise

        we.IocpProactor._register_with_iocp = _safe_register_with_iocp
    except Exception:
        pass

    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass
    try:
        import uvicorn.loops.asyncio
        uvicorn.loops.asyncio.asyncio_loop_factory = lambda use_subprocess=False: asyncio.ProactorEventLoop
    except Exception:
        pass
    try:
        import uvicorn.loops.auto
        uvicorn.loops.auto.auto_loop_factory = lambda use_subprocess=False: asyncio.ProactorEventLoop
    except Exception:
        pass

from fastapi import FastAPI
from fastapi.responses import Response, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings as app_settings
from app.core.logger import logger
from app.core.exceptions import add_exception_handlers
from app.core.middleware import SecurityHeadersMiddleware, RequestLoggingMiddleware, RequestSizeLimitMiddleware
from app.db.database import connect_to_mongo, close_mongo_connection, get_db
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.api.routes import auth, users, settings as settings_routes, search, leads, templates, campaigns, tracking, dashboard, system, email as email_routes, whatsapp as whatsapp_routes, ai as ai_routes, health, audit, backup, wa_campaigns, wa_templates, tags, ai_analysis, intelligence as intelligence_routes, reports, enrichment
from app.api.routes import search_sessions
from app.api import advanced_analysis, websockets
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.services.worker_manager import emit_heartbeat, shutdown_event
from app.db.init_db import init_admin_user, init_indexes, init_email_ai_defaults
from app.services.campaigns.queue_worker import CampaignQueueWorker
from app.services.email.email_worker import email_worker_instance

from app.services.whatsapp.enhanced_wa_worker import EnhancedWAQueueWorker
from app.services.whatsapp_ai.cloud_worker import WAAICloudWorker
from app.services.email_ai.smtp_worker import EmailAIQueueWorker
from app.services.ai.ai_worker import AIQueueWorker
from app.services.advanced_analysis_worker import AdvancedAnalysisWorker
from app.services.ai_analysis_worker import ai_analysis_worker_instance
from app.services.reports.auto_report_worker import AutoReportWorker
from app.services.crm_automation_worker import CRMAutomationWorker
from app.services.enrichment.worker import EnrichmentQueueWorker
from app.services.lead_intelligence_worker import lead_intelligence_worker
from app.services.supervisor import supervisor
from app.services.timeout_watcher import TimeoutWatcher, StuckWorkerDetector

scheduler = AsyncIOScheduler()
limiter = Limiter(key_func=get_remote_address)
campaign_worker = None
email_worker = None
wa_worker = None
wa_ai_cloud_worker = None
email_ai_worker = None
ai_worker = None

advanced_analysis_worker = None
auto_report_worker = None
crm_automation_worker = None
enrichment_worker = None
timeout_watcher = None
stuck_worker_detector = None


async def _repair_orphan_leads(db):
    """Repair leads whose ai_analysis.status is stuck in a non-terminal state.
    
    On startup, any lead with ai_analysis.status in a transient state
    (STARTED, COLLECTING, ANALYZING, SCORING, SAVING) is moved to FAILED
    because the worker that was processing it is no longer running.
    """
    from datetime import datetime, timezone
    from app.models.ai_analysis import AIAnalysisState

    transient_statuses = [
        AIAnalysisState.STARTED.value,
        AIAnalysisState.COLLECTING.value,
        AIAnalysisState.ANALYZING.value,
        AIAnalysisState.SCORING.value,
        AIAnalysisState.SAVING.value,
        # Also catch legacy lowercase statuses from pre-migration data
        "running", "crawling", "analyzing", "scoring", "saving",
    ]

    try:
        result = await db["leads"].update_many(
            {"ai_analysis.status": {"$in": transient_statuses}},
            {"$set": {
                "ai_analysis.status": AIAnalysisState.FAILED.value,
                "ai_analysis.errors": ["Startup recovery: Analysis was interrupted by server restart."],
                "ai_analysis.warnings": ["This lead's analysis was incomplete. You can retry it."],
                "ai_analysis.progress": 0,
                "ai_analysis.completed_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc),
            }}
        )
        if result.modified_count > 0:
            logger.info(f"Startup recovery: Repaired {result.modified_count} orphan leads stuck in transient AI analysis states.")
    except Exception as e:
        logger.error(f"Startup recovery: Failed to repair orphan leads: {e}")


async def _startup_recovery(db):
    """Reset any jobs stuck in RUNNING state from a previous crash."""
    from datetime import datetime, timezone
    from app.models.ai_analysis import AIAnalysisState

    try:


        # Reset stuck advanced analysis jobs
        result = await db["advanced_analysis_queue"].update_many(
            {"status": {"$in": ["INITIALIZING", "RUNNING"]}},
            {"$set": {"status": "PENDING", "updated_at": datetime.now(timezone.utc)}, "$push": {"logs": "Startup recovery: Reset from crash."}}
        )
        if result.modified_count > 0:
            logger.info(f"Startup recovery: Reset {result.modified_count} stuck advanced analysis jobs.")

        # Reset stuck AI analysis jobs (use strict enum values)
        transient_job_statuses = [
            AIAnalysisState.STARTED,
            AIAnalysisState.COLLECTING,
            AIAnalysisState.ANALYZING,
            AIAnalysisState.SCORING,
            AIAnalysisState.SAVING,
            # Legacy lowercase values from pre-migration data
            "running", "pending",
        ]
        result = await db["ai_analysis_jobs"].update_many(
            {"status": {"$in": transient_job_statuses}, "is_bulk": {"$ne": True}},
            {"$set": {
                "status": AIAnalysisState.FAILED,
                "error_message": "Startup recovery: Job interrupted by server restart.",
                "updated_at": datetime.now(timezone.utc),
                "completed_at": datetime.now(timezone.utc),
                "progress": 0,
            }}
        )
        if result.modified_count > 0:
            logger.info(f"Startup recovery: Reset {result.modified_count} stuck AI analysis jobs to FAILED.")

        # Reset stuck AI analysis queues (bulk queues are resumed by recover_bulk_queues)
        result = await db["ai_analysis_queues"].update_many(
            {"status": {"$in": transient_job_statuses}, "is_bulk": {"$ne": True}},
            {"$set": {
                "status": AIAnalysisState.FAILED,
                "error_message": "Startup recovery: Queue interrupted by server restart.",
                "updated_at": datetime.now(timezone.utc),
                "completed_at": datetime.now(timezone.utc),
            }}
        )
        if result.modified_count > 0:
            logger.info(f"Startup recovery: Reset {result.modified_count} stuck AI analysis queues to FAILED.")

        # Repair orphan leads stuck in transient analysis states
        await _repair_orphan_leads(db)

        # Mark stale worker nodes as OFFLINE
        await db["worker_nodes"].update_many({}, {"$set": {"status": "OFFLINE"}})

    except Exception as e:
        logger.error(f"Startup recovery error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────
    logger.info("Starting up Lead Finder Agent backend...")

    # Validate SECRET_KEY
    if app_settings.SECRET_KEY == "super_secret_key_change_in_production":
        logger.critical(
            "SECRET_KEY is using the default value! This is a critical security risk. "
            "Set a strong SECRET_KEY in your .env file for production."
        )

    await connect_to_mongo()
    await init_admin_user()
    await init_indexes()
    await init_email_ai_defaults()

    try:
        db = get_db()
    except Exception:
        db = None

    if db is not None:
        try:
            collections = await db.list_collection_names()
        except Exception:
            collections = []
        print("="*80)
        print("MONGODB STARTUP CONNECTION DETAILS")
        print("="*80)
        print(f"Mongo URI: {app_settings.MONGODB_URL}")
        print(f"Connected Database: {app_settings.DATABASE_NAME}")
        print(f"Collections: {', '.join(collections)}")
        print("Startup completed")
        print("="*80)

    global campaign_worker, wa_worker, ai_worker, advanced_analysis_worker, auto_report_worker, crm_automation_worker, enrichment_worker, timeout_watcher, stuck_worker_detector

    if db is not None:
        # Run startup recovery before starting workers
        await _startup_recovery(db)

        campaign_worker = CampaignQueueWorker(db, batch_size=10, concurrency=5)
        supervisor.register("campaign_queue", campaign_worker, factory=lambda d=db: CampaignQueueWorker(d, batch_size=10, concurrency=5))

        email_worker_instance.start()
        supervisor.register("email", email_worker_instance)

        wa_worker = EnhancedWAQueueWorker(db, batch_size=10, concurrency=5, message_delay=2.0)
        supervisor.register("wa_queue", wa_worker, factory=lambda d=db: EnhancedWAQueueWorker(d, batch_size=10, concurrency=5, message_delay=2.0))

        wa_ai_cloud_worker = WAAICloudWorker(db)
        supervisor.register("wa_ai_cloud_queue", wa_ai_cloud_worker, factory=lambda d=db: WAAICloudWorker(d))

        email_ai_worker = EmailAIQueueWorker(db)
        supervisor.register("email_ai_queue", email_ai_worker, factory=lambda d=db: EmailAIQueueWorker(d))

        ai_worker = AIQueueWorker(db, batch_size=5, concurrency=3)
        supervisor.register("ai_queue", ai_worker, factory=lambda d=db: AIQueueWorker(d, batch_size=5, concurrency=3))



        advanced_analysis_worker = AdvancedAnalysisWorker(db)
        supervisor.register("advanced_analysis", advanced_analysis_worker, factory=lambda d=db: AdvancedAnalysisWorker(d))

        auto_report_worker = AutoReportWorker(db, check_interval=30)
        supervisor.register("auto_report", auto_report_worker, factory=lambda d=db: AutoReportWorker(d, check_interval=30))

        crm_automation_worker = CRMAutomationWorker(db, check_interval=60)
        supervisor.register("crm_automation", crm_automation_worker, factory=lambda d=db: CRMAutomationWorker(d, check_interval=60))

        enrichment_worker = EnrichmentQueueWorker(db, max_concurrent=5)
        supervisor.register("enrichment_queue", enrichment_worker, factory=lambda d=db: EnrichmentQueueWorker(d, max_concurrent=5))

        supervisor.register("ai_analysis", ai_analysis_worker_instance)
        supervisor.register("lead_intelligence", lead_intelligence_worker)

        # Parallel bulk AI website analysis worker (resumes unfinished work on
        # restart; completed bulk jobs are never re-run).
        from app.services.bulk_ai_analysis_worker import bulk_ai_analysis_worker_instance
        supervisor.register("bulk_ai_analysis", bulk_ai_analysis_worker_instance)

        # Start all workers through the supervisor
        await supervisor.start_all()

        # Start timeout watchdog for stuck jobs
        timeout_watcher = TimeoutWatcher(db, check_interval=60)
        await timeout_watcher.start()

        stuck_worker_detector = StuckWorkerDetector(db, check_interval=120)
        await stuck_worker_detector.start()

        logger.info("TIMEOUT_WATCHER: Job timeout monitoring active (2h max, 1h for CREATED stuck)")
    else:
        logger.warning("Background workers NOT started because database connection is missing.")

    # Import time for job timing
    import time

    # Wrap all scheduled jobs with error handling to prevent scheduler crashes
    def safe_scheduler_job(job_func, job_name: str):
        """Wrapper for scheduled jobs to prevent scheduler crashes."""
        async def wrapped_job():
            job_start_time = time.time()
            try:
                logger.info(f"SCHEDULER_JOB_START: {job_name}")
                await job_func()
                job_duration = time.time() - job_start_time
                logger.info(f"SCHEDULER_JOB_SUCCESS: {job_name} completed in {job_duration:.2f}s")
            except Exception as e:
                job_duration = time.time() - job_start_time
                logger.error(f"SCHEDULER_JOB_ERROR: {job_name} failed after {job_duration:.2f}s: {str(e)}")
                import traceback
                logger.error(f"SCHEDULER_JOB_TRACEBACK: {traceback.format_exc()}")
                
                # Log to job_logs for monitoring
                try:
                    from app.services.worker_manager import log_job_event
                    await log_job_event(
                        job_type="SCHEDULER",
                        level="ERROR", 
                        message=f"Scheduled job '{job_name}' failed: {str(e)}",
                        details={"job_name": job_name, "error_type": type(e).__name__}
                    )
                except Exception:
                    pass  # Avoid recursive errors
        return wrapped_job

    # Schedule background jobs with error protection
    scheduler.add_job(
        safe_scheduler_job(lambda: emit_heartbeat("main_scheduler"), "emit_heartbeat"),
        'interval', 
        seconds=30,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=30
    )

    # Daily aggregate snapshot at midnight - wrapped for safety
    async def _write_daily_agg():
        try:
            from app.services.intelligence_service import write_daily_aggregate
            d = get_db()
            await write_daily_aggregate(d)
        except Exception as e:
            logger.error(f"Daily aggregate job error: {e}")
            raise  # Re-raise for scheduler wrapper to catch
            
    scheduler.add_job(
        safe_scheduler_job(_write_daily_agg, "daily_aggregate"), 
        'cron', 
        hour=0, 
        minute=0,
        max_instances=1
    )

    # Daily cleanup job - wrapped for safety
    async def _daily_cleanup():
        try:
            from app.services.cleanup_service import run_cleanup
            d = get_db()
            await run_cleanup(d)
        except Exception as e:
            logger.error(f"Daily cleanup job error: {e}")
            raise  # Re-raise for scheduler wrapper to catch
            
    scheduler.add_job(
        safe_scheduler_job(_daily_cleanup, "daily_cleanup"), 
        'cron', 
        hour=1, 
        minute=0,
        max_instances=1
    )

    scheduler.start()
    logger.info("APScheduler started.")

    # Register signal handlers for graceful shutdown
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda: shutdown_event.set())
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

    # Print all registered routes
    logger.info("--- Registered API Routes ---")
    def print_routes(routes, prefix=""):
        for route in routes:
            if hasattr(route, "routes"):
                print_routes(route.routes, prefix + getattr(route, "prefix", ""))
            elif hasattr(route, "methods"):
                for method in route.methods:
                    if method != "HEAD":
                        logger.info(f"{method} {prefix}{route.path}")
    print_routes(app.routes)
    logger.info("-----------------------------")

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────
    logger.info("Shutting down backend...")
    shutdown_event.set()

    if timeout_watcher:
        await timeout_watcher.stop()
    if stuck_worker_detector:
        await stuck_worker_detector.stop()
    await supervisor.stop_all(timeout=30)
    scheduler.shutdown()
    await close_mongo_connection()

app = FastAPI(
    title=app_settings.PROJECT_NAME,
    version=app_settings.VERSION,
    openapi_url=f"{app_settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Middlewares (Reverse order of execution: first added is outer-most)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RequestSizeLimitMiddleware, max_size_mb=app_settings.MAX_REQUEST_SIZE_MB)

# CORS configuration - uses environment-configurable origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins_list,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*", "X-Request-ID"],
    max_age=3600  # Cache preflight requests for 1 hour
)

add_exception_handlers(app)

# Include Routers
from app.api.routes.intelligence import router as intelligence_router
from app.api.routes.whatsapp_ai import router as whatsapp_ai_router
from app.api.routes.email_ai import router as email_ai_router

app.include_router(auth.router, prefix=f"{app_settings.API_V1_STR}/auth", tags=["auth"])
app.include_router(users.router, prefix=f"{app_settings.API_V1_STR}/users", tags=["users"])
app.include_router(settings_routes.router, prefix=f"{app_settings.API_V1_STR}/settings", tags=["settings"])
app.include_router(search_sessions.router, prefix=f"{app_settings.API_V1_STR}/search/sessions", tags=["search-sessions"])
app.include_router(search.router, prefix=f"{app_settings.API_V1_STR}/search", tags=["search"])

app.include_router(leads.router, prefix=f"{app_settings.API_V1_STR}/leads", tags=["leads"])
app.include_router(tags.router, prefix=f"{app_settings.API_V1_STR}/tags", tags=["tags"])
app.include_router(templates.router, prefix=f"{app_settings.API_V1_STR}/templates", tags=["templates"])
app.include_router(campaigns.router, prefix=f"{app_settings.API_V1_STR}/campaigns", tags=["campaigns"])
app.include_router(tracking.router, prefix=f"{app_settings.API_V1_STR}/tracking", tags=["tracking"])
app.include_router(dashboard.router, prefix=f"{app_settings.API_V1_STR}/dashboard", tags=["dashboard"])
app.include_router(system.router, prefix=f"{app_settings.API_V1_STR}/system", tags=["system"])
app.include_router(email_routes.router, prefix=f"{app_settings.API_V1_STR}/email", tags=["email"])
app.include_router(whatsapp_routes.router, prefix=f"{app_settings.API_V1_STR}/whatsapp", tags=["whatsapp"])
app.include_router(ai_routes.router, prefix=f"{app_settings.API_V1_STR}/ai", tags=["ai"])
app.include_router(health.router, prefix=f"{app_settings.API_V1_STR}/health", tags=["health"])
app.include_router(audit.router, prefix=f"{app_settings.API_V1_STR}/audit", tags=["audit"])
app.include_router(backup.router, prefix=f"{app_settings.API_V1_STR}/backup", tags=["backup"])
app.include_router(wa_campaigns.router, prefix=f"{app_settings.API_V1_STR}/wa-campaigns", tags=["wa-campaigns"])
app.include_router(wa_templates.router, prefix=f"{app_settings.API_V1_STR}/wa-templates", tags=["wa-templates"])
app.include_router(ai_analysis.router, prefix=f"{app_settings.API_V1_STR}/ai-analysis", tags=["ai-analysis"])
app.include_router(intelligence_routes.router, prefix=f"{app_settings.API_V1_STR}/intelligence", tags=["intelligence"])
app.include_router(reports.router, prefix=f"{app_settings.API_V1_STR}/reports", tags=["reports"])
app.include_router(enrichment.router, prefix=f"{app_settings.API_V1_STR}/enrichment", tags=["enrichment"])

from app.api.routes import notifications as notifications_routes
app.include_router(notifications_routes.router, prefix=f"{app_settings.API_V1_STR}/notifications", tags=["notifications"])

from app.api.routes import admin_activity
app.include_router(admin_activity.router, prefix=f"{app_settings.API_V1_STR}/admin", tags=["admin"])
from app.api.routes import crm, whatsapp_ai, email_ai, email_ai_analytics
app.include_router(crm.router, prefix=f"{app_settings.API_V1_STR}/crm", tags=["crm"])
app.include_router(whatsapp_ai.router, prefix=f"{app_settings.API_V1_STR}/whatsapp-ai", tags=["whatsapp-ai"])
app.include_router(email_ai.router, prefix=f"{app_settings.API_V1_STR}/email-ai", tags=["email-ai"])
app.include_router(email_ai_analytics.router, prefix=f"{app_settings.API_V1_STR}/email-ai", tags=["email-ai-analytics"])
from app.services.supervisor.dashboard import router as supervisor_router
app.include_router(supervisor_router, prefix="", tags=["supervisor"])
app.include_router(advanced_analysis.router, prefix="/api/advanced-analysis", tags=["advanced-analysis"])
app.include_router(websockets.router, prefix="", tags=["websockets"])
# WebSocket endpoints are also served under /api/v1 so they are reachable from
# the browser through the nginx /api/v1/ proxy (which carries the Upgrade /
# Connection headers). The root-prefixed paths above remain for direct access.
app.include_router(websockets.router, prefix=app_settings.API_V1_STR, tags=["websockets"])

@app.get("/")
async def root():
    return {"message": f"Welcome to {app_settings.PROJECT_NAME} API"}

@app.get("/favicon.ico")
async def favicon():
    """Handle favicon requests to prevent 404 errors."""
    # Return empty 204 No Content response for favicon
    return Response(status_code=204)

# Handle robots.txt and sitemap.xml requests
@app.get("/robots.txt")
async def robots_txt():
    """Handle robots.txt requests."""
    content = "User-agent: *\nDisallow: /api/\nDisallow: /admin/\nAllow: /\n\nSitemap: /sitemap.xml"
    return Response(content=content, media_type="text/plain")

@app.get("/sitemap.xml") 
async def sitemap_xml():
    """Handle sitemap.xml requests."""
    content = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://yourapp.com/</loc>
    <lastmod>2024-01-01</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>"""
    return Response(content=content, media_type="application/xml")

# Handle common misconfigured endpoints
@app.get("/search")
async def handle_get_search():
    """Handle GET /search requests."""
    return {
        "error": "Endpoint not found",
        "message": "The correct endpoint is POST /api/v1/search to create a search job",
        "correct_endpoint": "/api/v1/search",
        "method": "POST",
        "documentation": "Use POST /api/v1/search to create a new search job, GET /api/v1/search/jobs to list search jobs"
    }

@app.post("/search") 
async def handle_post_search():
    """Handle POST /search requests."""
    return {
        "error": "Endpoint not found", 
        "message": "The correct endpoint is POST /api/v1/search",
        "correct_endpoint": "/api/v1/search",
        "method": "POST"
    }

@app.get("/api/search")
async def handle_get_api_search():
    """Handle GET /api/search requests."""
    return {
        "error": "Endpoint not found",
        "message": "The correct endpoint is POST /api/v1/search to create a search job",
        "correct_endpoint": "/api/v1/search",
        "method": "POST"
    }

@app.post("/api/search")
async def handle_post_api_search():
    """Handle POST /api/search requests."""
    return {
        "error": "Endpoint not found",
        "message": "The correct endpoint is POST /api/v1/search",
        "correct_endpoint": "/api/v1/search", 
        "method": "POST"
    }
