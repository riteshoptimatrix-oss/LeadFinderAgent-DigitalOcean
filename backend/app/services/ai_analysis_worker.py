"""
AI Analysis Worker — Fault-Tolerant Lead-Centric Architecture
==============================================================
Every completed phase permanently enriches the Lead document.
The Lead is the single source of truth.

Flow:
  Lead → Crawl → Contact → Tech → SEO → Performance → UI/UX+Security → BI → Lead (enriched)

Fault Tolerance Rules:
  - Phase failures are isolated and tracked, not propagated.
  - Analysis ALWAYS reaches a terminal state: COMPLETED, PARTIAL_SUCCESS, or FAILED.
  - External API failures use fallback values and continue processing.
  - Each phase has a maximum timeout — never blocks the worker loop.
  - Stale jobs (stuck in non-terminal state) are auto-terminated.
  - finally block ensures status is always finalized with timeout protection.

Terminal States (only these three are valid for jobs):
  - COMPLETED: All phases succeeded.
  - PARTIAL_SUCCESS: Some phases failed but analysis completed.
  - FAILED: Critical failure or timeout.

Rules:
  - Never overwrite valid CRM data with null values.
  - Every phase result is persisted to the Lead immediately.
  - Analysis history is archived before each new full run.
  - The ai_analysis_jobs collection stores JOB METADATA ONLY (not analysis data).
  - No external dependency may block completion.
"""

import asyncio
from app.utils.website_validator import is_valid_website
import psutil
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Union
from enum import Enum
from dataclasses import dataclass, field

from bson import ObjectId

from app.db.database import get_db
from app.models.ai_analysis import AIAnalysisState, WSEventType
from app.core.state_machine import StateMachine, apply_and_persist, TransitionRecord
from app.core.state_machine.machines import AI_ANALYSIS_JOB
from app.core.logger import logger
from app.core.websocket import manager
from app.services.lead_enrichment_service import lead_enrichment_service, LeadEnrichmentData, to_object_id, persist_ai_analysis, verify_ai_analysis_persisted
from app.services.analysis_result_mapper import analysis_result_mapper
from app.services.ai_analysis_result_normalizer import analysis_result_normalizer
from app.services.safe_scoring import safe_score, safe_float, safe_int
from app.services.analysis_retry_policy import is_retryable_errors


# ═══════════════════════════════════════════════════════════════════════════════
# FAULT TOLERANCE CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

class AnalysisStatus(str, Enum):
    """Terminal states for AI Analysis - no other status is allowed."""
    COMPLETED = "Completed"
    COMPLETED_WITH_WARNINGS = "CompletedWithWarnings"
    FAILED = "Failed"


@dataclass
class PhaseResult:
    """Result of a single analysis phase."""
    success: bool
    score: int = 0
    error: Optional[str] = None
    warnings: List[str] = field(default_factory=list)
    fallback_used: bool = False
    result_data: Any = None


@dataclass
class AnalysisSummary:
    """Summary of all phases for final status determination."""
    crawl: PhaseResult = None
    contact: PhaseResult = None
    tech: PhaseResult = None
    seo: PhaseResult = None
    performance: PhaseResult = None
    ui_ux: PhaseResult = None
    security: PhaseResult = None
    bi: PhaseResult = None
    
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    
    def get_successful_phases(self) -> int:
        """Count successful phases."""
        count = 0
        for phase in [self.crawl, self.contact, self.tech, self.seo, self.performance, self.ui_ux, self.security, self.bi]:
            if phase and phase.success:
                count += 1
        return count
    
    def get_total_phases(self) -> int:
        """Total phases that were attempted."""
        return sum(1 for p in [self.crawl, self.contact, self.tech, self.seo, self.performance, self.ui_ux, self.security, self.bi] if p is not None)
    
    def determine_final_status(self) -> AnalysisStatus:
        """
        Determine the final analysis status based on phase results.
        
        Returns:
            - COMPLETED: All phases succeeded
            - COMPLETED_WITH_WARNINGS: Some phases failed but analysis completed
            - FAILED: Crawl failed or no phases succeeded
        """
        if self.crawl and not self.crawl.success:
            return AnalysisStatus.FAILED
        if self.get_successful_phases() == 0:
            return AnalysisStatus.FAILED
        total = self.get_total_phases()
        successful = self.get_successful_phases()
        if successful == total and len(self.warnings) == 0:
            return AnalysisStatus.COMPLETED
        return AnalysisStatus.COMPLETED_WITH_WARNINGS


# ═══════════════════════════════════════════════════════════════════════════════
# TIMEOUT CONFIGURATION (seconds)
# ═══════════════════════════════════════════════════════════════════════════════
# Each phase has a hard ceiling. If it exceeds this, the phase is marked as
# failed with a fallback result and the pipeline continues.

CRAWL_TIMEOUT = 150            # Crawler may need time for large sites
ENRICHMENT_TIMEOUT = 30        # Lead enrichment (website info/structure)
CONTACT_TIMEOUT = 90           # Contact discovery (email/phone scraping)
TECH_TIMEOUT = 60              # Technology detection
SEO_TIMEOUT = 90               # SEO analysis (includes one PageSpeed call)
PERFORMANCE_TIMEOUT = 120      # Performance analysis (two PageSpeed calls: mobile+desktop)
PERF_AUDIT_TIMEOUT = 60        # Local website performance audit (no network I/O)
SEC_AUDIT_TIMEOUT = 60         # Local website security audit (no network I/O)
UIUX_AUDIT_TIMEOUT = 60        # Local website UI/UX intelligence audit (no network I/O)
SEO_INTEL_TIMEOUT = 60         # Local SEO intelligence audit (no network I/O)
UIUX_TIMEOUT = 120             # UI/UX analysis (Playwright screenshots)
SECURITY_TIMEOUT = 60          # Security/accessibility analysis
SOCIAL_TIMEOUT = 45            # Social media presence analysis
MOBILE_TIMEOUT = 45            # Mobile-friendliness analysis
CONTENT_TIMEOUT = 45           # Content quality analysis
TIKTOK_TIMEOUT = 30            # TikTok profile detection (reuses crawled pages)
OPPORTUNITY_TIMEOUT = 30       # Lead intelligence + sales opportunity
SCORING_TIMEOUT = 45           # Business Intelligence scoring
SAVE_TIMEOUT = 30              # Persisting final results to MongoDB
JOB_GLOBAL_TIMEOUT = 600       # 10 minutes — entire job must finish within this
STALE_JOB_THRESHOLD = 900      # 15 minutes — auto-fail jobs stuck longer than this

# States where a job is actively being processed by a phase
ACTIVE_JOB_STATES = {
    AIAnalysisState.STARTED,
    AIAnalysisState.RUNNING,
    AIAnalysisState.COLLECTING,
    AIAnalysisState.ANALYZING,
    AIAnalysisState.SCORING,
    AIAnalysisState.SAVING,
}

ACTIVE_QUEUE_STATES = {
    AIAnalysisState.WAITING,
    AIAnalysisState.PENDING,
    AIAnalysisState.QUEUED,
    AIAnalysisState.STARTED,
    AIAnalysisState.RUNNING,
    AIAnalysisState.COLLECTING,
    AIAnalysisState.ANALYZING,
    AIAnalysisState.SCORING,
    AIAnalysisState.SAVING,
    AIAnalysisState.RETRY,
}
TERMINAL_QUEUE_STATES = {
    AIAnalysisState.COMPLETED,
    AIAnalysisState.SUCCESS,
    AIAnalysisState.PARTIAL_SUCCESS,
    AIAnalysisState.FAILED,
    AIAnalysisState.SKIPPED,
    AIAnalysisState.CANCELLED,
    AIAnalysisState.TIMEOUT,
    AIAnalysisState.UNKNOWN,
    AIAnalysisState.EMPTY,
}


class AIAnalysisWorker:
    def __init__(self):
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        self._background_tasks: List[asyncio.Task] = []

    @staticmethod
    def _normalize_queue_id(queue_id) -> Union[ObjectId, str]:
        if isinstance(queue_id, ObjectId):
            return queue_id
        if isinstance(queue_id, str) and len(queue_id) == 24:
            try:
                return ObjectId(queue_id)
            except Exception:
                pass
        return queue_id

    def start(self):
        if not self.is_running:
            self.is_running = True
            self._task = asyncio.create_task(self.run())
            logger.info("WORKER_STARTED: AI Analysis Worker started")

    async def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            logger.info("AI Analysis Worker stopped")

    async def run(self):
        from app.services.worker_manager import emit_heartbeat, shutdown_event
        watchdog_counter = 0
        while self.is_running and not shutdown_event.is_set():
            try:
                watchdog_counter += 2
                if watchdog_counter >= 30:
                    watchdog_counter = 0
                    await emit_heartbeat("ai_analysis_worker")
                await self._process_next_job()
            except Exception as e:
                logger.error(f"Error in AI Analysis Worker loop: {e}")
            await asyncio.sleep(2)

    # ─────────────────────────────────────────────────────────────────────
    # TIMEOUT HELPER
    # ─────────────────────────────────────────────────────────────────────

    async def _run_with_timeout(self, coro, timeout_seconds: int, phase_name: str):
        """
        Execute a coroutine with a hard timeout.
        Returns the result on success, or None on timeout/cancellation.
        NEVER raises — callers must handle None as a phase failure.
        """
        try:
            return await asyncio.wait_for(coro, timeout=timeout_seconds)
        except asyncio.TimeoutError:
            logger.error(f"STEP_FAILED: {phase_name} - Timed out after {timeout_seconds}s")
            return None
        except asyncio.CancelledError:
            logger.error(f"STEP_FAILED: {phase_name} - Cancelled")
            return None

    # ─────────────────────────────────────────────────────────────────────
    # STALE JOB DETECTION
    # ─────────────────────────────────────────────────────────────────────

    async def _detect_stale_jobs(self, db):
        """
        Find jobs stuck in a non-terminal state beyond the threshold.
        Mark them as FAILED so the queue can complete and the worker unblocks.
        This is the SAFETY NET — even if a phase timeout fails, this catches it.
        """
        stale_cutoff = datetime.now(timezone.utc) - timedelta(seconds=STALE_JOB_THRESHOLD)
        # Bulk queues are managed exclusively by the parallel bulk worker; the
        # single worker must never auto-fail their jobs (they legitimately run
        # longer, with each job wrapped in its own global timeout).
        stale_jobs = await db["ai_analysis_jobs"].find({
            "status": {"$in": list(ACTIVE_JOB_STATES) + [AIAnalysisState.RETRY]},
            "updated_at": {"$lt": stale_cutoff},
            "is_bulk": {"$ne": True},
        }).to_list(length=100)

        for stale_job in stale_jobs:
            job_id = stale_job["_id"]
            stuck_status = stale_job.get("status")
            updated_at = stale_job.get("updated_at")
            logger.error(
                f"STALE_JOB_DETECTED: Job {job_id} stuck in {stuck_status} "
                f"since {updated_at}. Auto-terminating."
            )

            now = datetime.now(timezone.utc)
            lead_id = str(stale_job.get("lead_id", ""))
            queue_id = stale_job.get("queue_id", "")

            # Update job to terminal FAILED state
            await db["ai_analysis_jobs"].update_one(
                {"_id": job_id},
                {"$set": {
                    "status": AIAnalysisState.FAILED,
                    "error_message": f"Job exceeded maximum execution time ({STALE_JOB_THRESHOLD}s). Auto-terminated.",
                    "completed_at": now,
                    "updated_at": now,
                    "progress": 100.0,
                    "errors": [f"Job exceeded maximum execution time ({STALE_JOB_THRESHOLD}s) while in {stuck_status} state."],
                    "warnings": [],
                }}
            )

            # Increment queue failed count
            if queue_id:
                queue_id_obj = self._normalize_queue_id(queue_id)
                await db["ai_analysis_queues"].update_one(
                    {"_id": queue_id_obj},
                    {"$inc": {"failed_jobs": 1}}
                )

            # Auto-update lead document so it does not stay stuck in 'Queued' / 'Analyzing...'
            if lead_id:
                lead_oid = to_object_id(lead_id)
                await db["leads"].update_one(
                    {"_id": lead_oid},
                    {"$set": {
                        "ai_analysis.analysis_status": "Failed",
                        "ai_analysis.stage": "Analysis timed out. Please retry.",
                        "ai_analysis.progress": 0,
                        "updated_at": now,
                    }}
                )

            # Broadcast failure event
            try:
                await manager.broadcast_to_job(str(queue_id), {
                    "type": "failed",
                    "event_type": "analysis_failed",
                    "lead_id": lead_id,
                    "queue_id": str(queue_id),
                    "status": "Failed",
                    "stage": "Failed",
                    "progress": 100.0,
                    "timestamp": now.isoformat(),
                    "message": "Job auto-terminated due to timeout.",
                })
            except Exception:
                pass

            # Trigger queue completion check
            if queue_id:
                await self._check_queue_completion(db, [str(queue_id)])

    async def _cleanup_orphan_jobs(self, db):
        """
        Find any active/waiting jobs that reference a non-existent lead.
        Mark them as FAILED so that they don't block the queue indefinitely (Phase 6).
        """
        active_jobs = await db["ai_analysis_jobs"].find({
            "status": {"$in": list(ACTIVE_JOB_STATES) + [AIAnalysisState.WAITING, AIAnalysisState.RETRY]},
            "is_bulk": {"$ne": True},
        }).to_list(length=200)

        for job in active_jobs:
            lead_id = job.get("lead_id")
            if not lead_id:
                continue
            
            lead_oid = to_object_id(lead_id)
            lead = await db["leads"].find_one({"_id": lead_oid})
            if not lead:
                # Double check to account for replication lag
                await asyncio.sleep(0.1)
                lead = await db["leads"].find_one({"_id": lead_oid})
                
            if not lead:
                job_id = job["_id"]
                queue_id = job.get("queue_id")
                logger.warning(f"ORPHAN_JOB_DETECTED: Job {job_id} references non-existent lead {lead_id}. Clean up.")

                now = datetime.now(timezone.utc)
                await db["ai_analysis_jobs"].update_one(
                    {"_id": job_id},
                    {"$set": {
                        "status": AIAnalysisState.FAILED,
                        "error_message": f"Orphan job cleaned: lead {lead_id} does not exist.",
                        "completed_at": now,
                        "updated_at": now
                    }}
                )
                if queue_id:
                    queue_id_obj = self._normalize_queue_id(queue_id)
                    await db["ai_analysis_queues"].update_one(
                        {"_id": queue_id_obj},
                        {"$inc": {"failed_jobs": 1}}
                    )
                    await self._check_queue_completion(db, [str(queue_id)])

    # ─────────────────────────────────────────────────────────────────────
    # Queue Processing
    # ─────────────────────────────────────────────────────────────────────

    async def _process_next_job(self):
        db = get_db()
        if db is None:
            return

        # SAFETY NET: detect and fail any stale or orphan jobs first
        await self._detect_stale_jobs(db)
        await self._cleanup_orphan_jobs(db)

        active_queues = await db["ai_analysis_queues"].find(
            {
                "status": {"$in": list(ACTIVE_QUEUE_STATES)},
                # Bulk queues are exclusively processed by the parallel bulk
                # worker; the single worker must not steal their jobs.
                "is_bulk": {"$ne": True},
            }
        ).to_list(length=100)

        if not active_queues:
            return

        active_queue_ids = [str(q["_id"]) for q in active_queues]

        now = datetime.now(timezone.utc)
        job = await db["ai_analysis_jobs"].find_one_and_update(
            {
                "$or": [
                    {"status": AIAnalysisState.WAITING},
                    {
                        "status": AIAnalysisState.RETRY,
                        "next_retry_at": {"$lte": now},
                    },
                ],
                "queue_id": {"$in": active_queue_ids}
            },
            {
                "$set": {
                    "status": AIAnalysisState.STARTED,
                    "started_at": now,
                    "updated_at": now,
                }
            },
            return_document=True
        )

        if job:
            old_status = job.get("status")
            await db["ai_analysis_jobs"].update_one(
                {"_id": job["_id"]},
                {"$push": {
                    "state_history": {
                        "from": old_status.value if isinstance(old_status, AIAnalysisState) else str(old_status),
                        "to": AIAnalysisState.STARTED.value,
                        "timestamp": now,
                        "reason": "worker_claimed",
                        "actor": "ai_analysis_worker",
                    }
                }}
            )

        if not job:
            await self._check_queue_completion(db, active_queue_ids)
            return

        old_status = job.get("status")
        logger.info(f"STATUS_CHANGED: Job {job['_id']} status changed from {old_status} to STARTED")

        # Wrap entire job execution in a global timeout.
        # The finally block inside _execute_job ensures cleanup even on timeout.
        try:
            await asyncio.wait_for(
                self._execute_job(db, job),
                timeout=JOB_GLOBAL_TIMEOUT
            )
        except asyncio.TimeoutError:
            logger.error(
                f"ANALYSIS_FAILED: Job {job['_id']} exceeded global timeout "
                f"of {JOB_GLOBAL_TIMEOUT}s. The finally block should handle cleanup."
            )
            # If the finally block in _execute_job didn't run (shouldn't happen),
            # the stale job detection will catch it on the next loop iteration.
        except asyncio.CancelledError:
            logger.error(f"ANALYSIS_FAILED: Job {job['_id']} was cancelled.")
        except Exception as e:
            logger.error(f"ANALYSIS_FAILED: Job {job['_id']} unexpected error: {e}")

    async def _check_queue_completion(self, db, active_queue_ids: list):
        for q_id in active_queue_ids:
            queue_id = self._normalize_queue_id(q_id)
            queue = await db["ai_analysis_queues"].find_one({"_id": queue_id})
            if not queue:
                continue

            # Bulk queues are finalized by the parallel bulk worker (which sends
            # the bulk_completed summary event). The single worker must not mark
            # them terminal or the bulk monitor never receives completion.
            if queue.get("is_bulk"):
                continue

            if queue.get("status") in TERMINAL_QUEUE_STATES:
                continue

            pending_count = await db["ai_analysis_jobs"].count_documents({
                "queue_id": str(q_id),
                "status": {"$nin": list(TERMINAL_QUEUE_STATES)}
            })
            
            if pending_count == 0:
                completed_count = await db["ai_analysis_jobs"].count_documents({
                    "queue_id": str(q_id),
                    "status": {"$in": [AIAnalysisState.COMPLETED, AIAnalysisState.SUCCESS]}
                })
                partial_count = await db["ai_analysis_jobs"].count_documents({
                    "queue_id": str(q_id),
                    "status": AIAnalysisState.PARTIAL_SUCCESS
                })
                failed_count = await db["ai_analysis_jobs"].count_documents({
                    "queue_id": str(q_id),
                    "status": AIAnalysisState.FAILED
                })
                skipped_count = await db["ai_analysis_jobs"].count_documents({
                    "queue_id": str(q_id),
                    "status": {"$in": [AIAnalysisState.SKIPPED, AIAnalysisState.CANCELLED, AIAnalysisState.TIMEOUT, AIAnalysisState.UNKNOWN]}
                })

                if completed_count == 0 and partial_count == 0 and failed_count == 0 and skipped_count > 0:
                    new_status = AIAnalysisState.SKIPPED
                elif failed_count > 0 and completed_count == 0 and partial_count == 0:
                    new_status = AIAnalysisState.FAILED
                elif partial_count > 0 or failed_count > 0:
                    new_status = AIAnalysisState.PARTIAL_SUCCESS
                else:
                    new_status = AIAnalysisState.COMPLETED

                now = datetime.now(timezone.utc)
                old_status = queue.get("status")
                
                result = await db["ai_analysis_queues"].update_one(
                    {"_id": queue_id, "status": {"$in": list(ACTIVE_QUEUE_STATES)}},
                    {"$set": {
                        "status": new_status,
                        "completed_at": now,
                        "updated_at": now,
                        "running_jobs": 0,
                        "overall_progress": 100.0
                    }}
                )
                
                if result.matched_count != 1:
                    continue

                logger.info(f"STATUS_CHANGED: Queue {q_id} status changed from {old_status} to {new_status}")
                logger.info(f"QUEUE_FINISHED: Queue {q_id} finished processing. Completed: {completed_count}, Partial: {partial_count}, Failed: {failed_count}")

                try:
                    await manager.broadcast_to_job(str(q_id), {
                        "type": WSEventType.QUEUE_COMPLETED,
                        "event_type": WSEventType.QUEUE_COMPLETED,
                        "queue_id": str(q_id),
                        "stage": new_status,
                        "progress": 100.0,
                        "message": f"Queue processing completed. {completed_count} successful, {partial_count} partial, {failed_count} failed.",
                        "timestamp": now.isoformat(),
                        "completed_jobs": completed_count,
                        "failed_jobs": failed_count,
                        "total_jobs": queue.get("total_jobs", 0),
                    })
                except Exception as e:
                    logger.error(f"Failed to broadcast queue completion for {q_id}: {repr(e)}")

    # ─────────────────────────────────────────────────────────────────────
    # RETRY SCHEDULING
    # ─────────────────────────────────────────────────────────────────────

    @staticmethod
    def _exponential_backoff(retry_count: int) -> int:
        """Calculate exponential backoff in seconds: 1min, 2min, 4min, ... capped at 60min."""
        return min(60 * (2 ** retry_count), 3600)

    async def _schedule_retry(self, db, job_id, queue_id_obj, job: dict, errors: list, retryable: bool = True):
        """Schedule a job for retry or move to dead letter queue if exhausted.

        When ``retryable`` is False the failure is permanent (404 / invalid URL /
        no website) and the job is failed immediately without any retry.

        Returns True if the job was scheduled for retry, False if it went to DLQ
        or was permanently failed.
        """
        retry_count = job.get("retry_count", 0) + 1
        max_retries = job.get("max_retries", 3)
        now = datetime.now(timezone.utc)

        retry_entry = {
            "attempt": retry_count,
            "timestamp": now,
            "errors": list(errors),
        }

        if not retryable:
            logger.info(
                f"PERMANENT_FAILURE: Job {job_id} failed with a permanent error "
                f"(404 / invalid URL / no website). No retry. Errors: {errors}"
            )
            await db["ai_analysis_jobs"].update_one(
                {"_id": job_id},
                {"$set": {
                    "status": AIAnalysisState.FAILED,
                    "error_message": "; ".join(errors) if errors else "Permanent failure",
                    "completed_at": now,
                    "updated_at": now,
                    "retry_count": retry_count,
                    "dead_letter": False,
                    "errors": list(errors),
                }, "$push": {"retry_history": retry_entry}}
            )
            return False

        if retry_count >= max_retries:
            # Exhausted — move to dead letter queue
            logger.error(
                f"DLQ: Job {job_id} exhausted {max_retries} retries. "
                f"Moving to dead letter queue. Errors: {errors}"
            )
            await db["ai_analysis_jobs"].update_one(
                {"_id": job_id},
                {"$set": {
                    "status": AIAnalysisState.FAILED,
                    "error_message": "; ".join(errors) if errors else "Max retries exhausted",
                    "completed_at": now,
                    "updated_at": now,
                    "retry_count": retry_count,
                    "dead_letter": True,
                    "dead_lettered_at": now,
                }, "$push": {"retry_history": retry_entry}}
            )
            # Broadcast dead letter event
            try:
                room = str(queue_id_obj) if queue_id_obj else ""
                await manager.broadcast_to_job(room, {
                    "type": "failed",
                    "event_type": "analysis_dlq",
                    "job_id": str(job_id),
                    "queue_id": str(queue_id_obj) if queue_id_obj else None,
                    "status": "DEAD_LETTER",
                    "stage": "Failed",
                    "progress": 100.0,
                    "timestamp": now.isoformat(),
                    "message": f"Job failed after {max_retries} retries. Errors: {errors}",
                })
            except Exception:
                pass
            return False

        # Schedule retry with exponential backoff
        backoff = self._exponential_backoff(retry_count - 1)
        next_retry = now + timedelta(seconds=backoff)
        logger.info(
            f"RETRY_SCHEDULED: Job {job_id} will retry in {backoff}s "
            f"(attempt {retry_count}/{max_retries}). Errors: {errors}"
        )
        await db["ai_analysis_jobs"].update_one(
            {"_id": job_id},
            {"$set": {
                "status": AIAnalysisState.RETRY,
                "error_message": "; ".join(errors) if errors else None,
                "retry_count": retry_count,
                "next_retry_at": next_retry,
                "updated_at": now,
            }, "$push": {"retry_history": retry_entry}}
        )
        return True

    # ─────────────────────────────────────────────────────────────────────
    # State Machine Helpers
    # ─────────────────────────────────────────────────────────────────────

    @staticmethod
    def _build_machine_from_job(job: dict) -> StateMachine:
        current = job.get("status", AIAnalysisState.WAITING)
        return StateMachine(AI_ANALYSIS_JOB, current_state=current)

    async def _transition_job(
        self, db, job_id, machine: StateMachine,
        target: AIAnalysisState, reason: str = "",
    ) -> bool:
        try:
            await apply_and_persist(
                db, "ai_analysis_jobs", job_id, machine, target,
                reason=reason, actor="ai_analysis_worker",
            )
            return True
        except Exception as e:
            logger.warning(f"TRANSITION_FAILED: Job {job_id} {machine.state.value} -> {target}: {e}")
            return False

    # ─────────────────────────────────────────────────────────────────────
    # Job Execution — Lead-Centric Pipeline
    # ─────────────────────────────────────────────────────────────────────

    async def _execute_job(self, db, job: dict):
        queue_id   = job["queue_id"]
        lead_id    = str(job.get("lead_id"))
        website_url = job.get("website_url")
        job_id     = job["_id"]

        logger.info(f"WORKER_JOB_STARTED: Worker started processing job {job_id} for lead {lead_id} in queue {queue_id}")

        queue_id_obj = self._normalize_queue_id(queue_id)
        queue = await db["ai_analysis_queues"].find_one({"_id": queue_id_obj})
        
        # Determine lead retrieval details (Phase 5, Phase 9)
        lead_oid = to_object_id(lead_id)
        collection_name = "leads"
        db_name = db.name if db is not None else "Unknown"
        query_executed = {"_id": lead_oid}

        # Retry loop to account for database replication delay or write propagation lag (Phase 4 & Phase 8)
        lead = None
        retries = 3
        retry_delay = 0.5
        for attempt in range(retries):
            logger.info(f"WORKER_LEAD_LOOKUP_ATTEMPT: Attempt {attempt + 1}/{retries} on collection '{collection_name}' in DB '{db_name}'. Query: {query_executed}, ObjectId: {lead_oid}")
            lead = await db[collection_name].find_one(query_executed)
            if lead:
                logger.info(f"WORKER_LEAD_LOOKUP_SUCCESS: Lead {lead_id} found in DB '{db_name}' after {attempt + 1} attempt(s).")
                break
            await asyncio.sleep(retry_delay)
            retry_delay *= 2

        if not lead:
            # 2. Detailed Diagnostic Check (Phase 4)
            collections_list = await db.list_collection_names() if db is not None else []
            collection_exists = collection_name in collections_list
            lead_by_str = await db[collection_name].find_one({"_id": lead_id}) if collection_exists else None
            failed_lead_entry = await db["failed_leads"].find_one({"lead_id": lead_id})
            
            diagnostic_reason = (
                f"Database Name: {db_name}. "
                f"Collection '{collection_name}' Exists: {collection_exists}. "
                f"Query Executed: {query_executed}. "
                f"Normalized ObjectId Type: {type(lead_oid)}. "
                f"Lead by String ID: {bool(lead_by_str)}. "
                f"Failed Leads Entry: {bool(failed_lead_entry)}. "
                f"Available Collections: {collections_list}."
            )
            
            logger.error(
                f"WORKER_LEAD_LOOKUP_FAILED: Lead {lead_id} was deleted or not found in database. "
                f"Cancelling job gracefully. Diagnostics: {diagnostic_reason}"
            )

            await db["ai_analysis_jobs"].update_one(
                {"_id": job_id},
                {"$set": {
                    "status": AIAnalysisState.FAILED,
                    "error_message": f"Lead not found. Diagnostics: {diagnostic_reason}",
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            await db["ai_analysis_queues"].update_one(
                {"_id": queue_id_obj},
                {"$inc": {"failed_jobs": 1}}
            )
            await self._check_queue_completion(db, [str(queue_id)])
            return

        business_name = lead.get("name") if lead else "Unknown"

        total = queue.get("total_jobs", 1) if queue else 1
        completed_jobs = queue.get("completed_jobs", 0) if queue else 0
        current_lead_index = completed_jobs + 1
        overall_progress = (completed_jobs / total) * 100 if total > 0 else 0
        user_id = queue.get("user_id") if queue else "system"

        # Repair orphan lead fields in MongoDB if missing
        if lead:
            repairs = {}
            if not lead.get("user_id"):
                repairs["user_id"] = user_id
            if not lead.get("search_job_id"):
                repairs["search_job_id"] = queue_id
            if not lead.get("created_by"):
                repairs["created_by"] = user_id
            if repairs:
                await db["leads"].update_one({"_id": to_object_id(lead_id)}, {"$set": repairs})
                logger.info(f"Repaired orphan fields for lead {lead_id}: {repairs}")

        await db["ai_analysis_queues"].update_one(
            {"_id": queue_id_obj, "status": {"$in": list(ACTIVE_QUEUE_STATES)}},
            {"$set": {
                "status": AIAnalysisState.STARTED,
                "running_jobs": 1,
                "current_lead_index": current_lead_index,
                "overall_progress": overall_progress,
                "updated_at": datetime.now(timezone.utc)
            }}
        )

        async def broadcast(event_type: str, stage: str, progress: float,
                              message: str = None, metrics: dict = None,
                              status: str = "running", legacy_type: str = None):
            try:
                elapsed = round((datetime.now(timezone.utc) - started_at).total_seconds(), 2)
                try:
                    cpu_usage = psutil.cpu_percent(interval=None)
                    memory_usage = psutil.virtual_memory().percent
                except Exception:
                    cpu_usage = 0.0
                    memory_usage = 0.0
                queue_size = max(0, int(total or 0) - int(completed_jobs or 0))
                payload = {
                    "type": event_type,
                    "event_type": legacy_type or event_type,
                    "queue_id": queue_id,
                    "job_id": str(job_id),
                    "lead_id": lead_id,
                    "business_name": business_name,
                    "website": website_url,
                    "queue_position": f"Lead {current_lead_index} of {total}",
                    "stage": stage,
                    "stage_status": status,
                    "progress": progress,
                    "elapsed_seconds": elapsed,
                    "warnings": list(warnings),
                    "errors": list(errors),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "worker": "Worker 1",
                    "message": message,
                    "metrics": {
                        **(metrics or {}),
                        "cpu_percent": round(cpu_usage, 1),
                        "memory_percent": round(memory_usage, 1),
                        "queue_size": queue_size,
                        "pending_jobs": max(0, int(total or 0) - int(completed_jobs or 0)),
                        "running_jobs": 1 if status not in ("success", "failed", "terminal", "completed") else 0,
                        "completed_jobs": completed_jobs,
                        "total_jobs": total,
                    }
                }
                await manager.broadcast_to_job(str(queue_id), payload)
                logger.info(f"EVENT_SENT: {legacy_type or event_type} for queue {queue_id} (job {job_id})")

                # Persist live progress into MongoDB so leads table and drawer always share truth
                try:
                    lead_status_label = "Completed" if status == "success" else ("Failed" if status == "failed" else "Running")
                    await db["leads"].update_one(
                        {"_id": to_object_id(lead_id)},
                        {"$set": {
                            "ai_analysis.progress": progress,
                            "ai_analysis.stage": stage,
                            "ai_analysis.analysis_status": lead_status_label,
                            "updated_at": datetime.now(timezone.utc),
                        }}
                    )
                    await db["ai_analysis_jobs"].update_one(
                        {"_id": job_id},
                        {"$set": {
                            "progress": progress,
                            "current_stage": stage,
                            "updated_at": datetime.now(timezone.utc),
                        }}
                    )
                except Exception as update_err:
                    logger.debug(f"Progress update to DB skipped: {update_err}")
            except Exception as ws_err:
                logger.warning(f"WebSocket broadcast failed: {repr(ws_err)}")

        async def update_job_status(new_status: AIAnalysisState):
            old = job.get("status")
            if new_status == old:
                return
            job["status"] = new_status
            try:
                record = TransitionRecord(
                    from_state=old.value if isinstance(old, AIAnalysisState) else str(old),
                    to_state=new_status.value,
                    reason=f"pipeline_step: {new_status.value}",
                    actor="ai_analysis_worker",
                )
                await db["ai_analysis_jobs"].update_one(
                    {"_id": job_id},
                    {
                        "$set": {"status": new_status, "updated_at": datetime.now(timezone.utc)},
                        "$push": {"state_history": record.to_dict()},
                    }
                )
                logger.info(f"TRANSITION [ai_analysis_job]: {old} -> {new_status}")
            except Exception as db_err:
                logger.warning(f"Failed to update job status in DB: {db_err}")

        async def safe_enrich(enrichment_data: LeadEnrichmentData, archive: bool = False):
            success = await lead_enrichment_service.enrich_lead(lead_id, enrichment_data, archive_before_overwrite=archive)
            if not success:
                exists = await db["leads"].count_documents({"_id": to_object_id(lead_id)})
                if exists == 0:
                    raise ValueError("Lead was deleted during analysis pipeline.")
            return success

        prev_analysis_count = 0
        if lead and lead.get("ai_analysis"):
            prev_analysis_count = lead["ai_analysis"].get("analysis_count", 0)

        started_at = datetime.now(timezone.utc)
        errors = []
        warnings = []

        crawl_result = {}
        tech_result = None
        contact_result = None
        seo_result = None
        perf_result = None
        uiux_result = None
        security_result = None
        bi_result = None
        social_result = None
        mobile_result = None
        content_result = None
        opportunity_result = None

        crawled_pages_count = 0
        emails_found = 0
        phones_found = 0
        overall_score = 0
        seo_score = 0
        perf_score = 0
        ui_score = 0
        ux_score = 0
        sec_score = 0
        acc_score = 0
        social_score = 0
        mobile_score = 0
        content_score = 0
        lead_intelligence_score = 0
        sales_opportunity_score = 0

        await broadcast("job_started", "Initializing", 3.0,
                        f"Worker assigned. Initializing analysis for {business_name}",
                        status="running", legacy_type=WSEventType.QUEUE_STARTED)

        try:
            # ════════════════════════════════════════════
            # PHASE 0 — Website Validation
            # ════════════════════════════════════════════
            is_valid = is_valid_website(website_url)
            
            if not is_valid:
                reason = "No website provided."
                logger.info(f"PHASE_0_SKIPPED: Job {job_id} skipped. {reason} URL: {website_url}")
                
                await db["leads"].update_one(
                    {"_id": to_object_id(lead_id)},
                    {"$set": {
                        "website_status": "NO_PROFESSIONAL_WEBSITE",
                        "website_type": "none",
                        "professional_website": False,
                        "social_only": False,
                        "analysis_skipped_reason": reason,
                        "ai_analysis.analysis_status": "Skipped",
                    }}
                )
                
                await update_job_status(AIAnalysisState.COMPLETED)
                await broadcast("completed", "Completed", 100.0,
                                f"No Professional Website Found. {reason}",
                                status="success", legacy_type=WSEventType.QUEUE_COMPLETED)
                await broadcast(WSEventType.QUEUE_COMPLETED, "Completed", 100.0,
                                f"No Professional Website Found. {reason}", status="success")
                
                await db["ai_analysis_queues"].update_one(
                    {"_id": queue_id_obj},
                    {"$inc": {"completed_jobs": 1}}
                )
                await self._check_queue_completion(db, [str(queue_id)])
                return

            await lead_enrichment_service.mark_analysis_started(lead_id, str(job_id), website_url)

            # ════════════════════════════════════════════
            # PHASE 1 — Crawling & Collecting (COLLECTING)
            # ════════════════════════════════════════════
            await update_job_status(AIAnalysisState.COLLECTING)
            await broadcast("stage_changed", "Website Crawl", 5.0, "Starting crawler engine...",
                            status="running", legacy_type=WSEventType.LEAD_STARTED)

            logger.info("STEP_STARTED: Crawl")
            try:
                from app.services.crawler_engine.engine import CrawlEngine
                crawler = CrawlEngine(max_pages=30, max_depth=3)

                async def silent_update(stage: str, url: str, details: dict):
                    pass

                async def on_crawler_update(stage: str, url: str, details: dict):
                    pages_crawled = int((details or {}).get("pages_crawled", 0) or 0)
                    pct = min(24.0, 5.0 + (pages_crawled * 0.8))
                    await broadcast("page_crawled", "Website Crawl", pct,
                                    f"Page crawled: {url}",
                                    {"pages_crawled": pages_crawled},
                                    status="running",
                                    legacy_type=WSEventType.PAGE_DISCOVERED)

                crawl_result = await self._run_with_timeout(
                    crawler.execute_crawl(
                        job_id=str(job_id),
                        queue_id=queue_id,
                        lead_id=lead_id,
                        start_url=website_url,
                        on_update=on_crawler_update
                    ),
                    CRAWL_TIMEOUT, "Crawl"
                )

                if crawl_result is None:
                    crawl_result = {"success": False, "error": "Crawl timed out", "pages_crawled": 0}
                    errors.append(f"Crawl timed out after {CRAWL_TIMEOUT}s")
                    warnings.append("Crawl phase timed out — proceeding with partial data")
                elif not crawl_result.get("success"):
                    logger.warning(f"FALLBACK_USED: Crawl ended with non-success: {crawl_result.get('error')}")
                    warnings.append(f"Crawl partial/non-success: {crawl_result.get('error')}")
                
                crawled_pages_count = crawl_result.get("pages_crawled", 0)
                logger.info("STEP_COMPLETED: Crawl")
            except Exception as crawl_err:
                logger.error(f"STEP_FAILED: Crawl - {crawl_err}")
                errors.append(f"Crawl failed: {str(crawl_err)}")
                crawl_result = {"success": False, "error": str(crawl_err), "pages_crawled": 0}

            # Fetch crawled pages from DB
            try:
                pages = await asyncio.wait_for(
                    db["crawl_pages"].find({"job_id": str(job_id)}).to_list(length=None),
                    timeout=15
                )
            except (asyncio.TimeoutError, Exception):
                pages = []

            # Enrich website information from crawl
            try:
                wi_enrichment = LeadEnrichmentData()
                wi_enrichment.website_information = analysis_result_mapper.map_website_information(
                    crawl_result, website_url
                )
                wi_enrichment.website_structure = analysis_result_mapper.map_website_structure(crawl_result)
                await asyncio.wait_for(
                    safe_enrich(wi_enrichment, archive=True),
                    timeout=ENRICHMENT_TIMEOUT
                )
            except (asyncio.TimeoutError, Exception) as enrich_err:
                logger.warning(f"Enrichment error: {enrich_err}")
                warnings.append(f"Crawl data enrichment failed: {enrich_err}")

            # Contact Discovery
            logger.info("STEP_STARTED: Contact Discovery")
            await broadcast("stage_changed", "Contact Discovery", 16.0,
                            "Discovering emails, phones & social links...",
                            status="running", legacy_type=WSEventType.CONTACT_DISCOVERY_STARTED)
            try:
                from app.services.contact_discovery_service import ContactDiscoveryService
                contact_service = ContactDiscoveryService()
                contact_result = await self._run_with_timeout(
                    contact_service.execute_discovery(
                        job_id=str(job_id),
                        lead_id=lead_id
                    ),
                    CONTACT_TIMEOUT, "Contact Discovery"
                )

                if contact_result is None:
                    errors.append(f"Contact discovery timed out after {CONTACT_TIMEOUT}s")
                else:
                    emails_found = len([c for c in contact_result.contacts if c.type == "Email"])
                    phones_found = len([c for c in contact_result.contacts if c.type == "Phone"])

                    email_values = [c.value for c in contact_result.contacts if c.type == "Email"]
                    phone_values = [c.value for c in contact_result.contacts if c.type == "Phone"]

                    if email_values:
                        await broadcast("email_found", "Website Crawl", 18.0,
                                        f"{len(email_values)} email(s) discovered",
                                        {"emails_discovered": emails_found, "emails": email_values},
                                        status="success", legacy_type=WSEventType.EMAIL_FOUND)
                    if phone_values:
                        await broadcast("phone_found", "Website Crawl", 19.0,
                                        f"{len(phone_values)} phone(s) discovered",
                                        {"phones_discovered": phones_found, "phones": phone_values},
                                        status="success", legacy_type=WSEventType.PHONE_FOUND)
                    if not email_values and not phone_values:
                        await broadcast("stage_changed", "Website Crawl", 19.0,
                                        "No contact details discovered on the site",
                                        status="info", legacy_type=WSEventType.CONTACT_DISCOVERY_COMPLETED)

                    contact_enrichment = LeadEnrichmentData()
                    contact_enrichment.contact_discovery = analysis_result_mapper.map_contact_result(contact_result)
                    contact_enrichment.social_media = analysis_result_mapper.map_social_media(contact_result)

                    cd = contact_enrichment.contact_discovery
                    if cd.get("primary_email"):
                        contact_enrichment.primary_email = cd["primary_email"]
                    if cd.get("primary_phone"):
                        contact_enrichment.primary_phone = cd["primary_phone"]
                    if cd.get("office_address"):
                        contact_enrichment.primary_address = cd["office_address"]

                    try:
                        await asyncio.wait_for(
                            safe_enrich(contact_enrichment),
                            timeout=ENRICHMENT_TIMEOUT
                        )
                    except (asyncio.TimeoutError, Exception):
                        pass
                    logger.info("STEP_COMPLETED: Contact Discovery")
            except Exception as contact_err:
                logger.error(f"STEP_FAILED: Contact Discovery - {contact_err}")
                errors.append(f"Contact discovery failed: {str(contact_err)}")

            # ════════════════════════════════════════════
            # PHASE 2 — Technology, SEO, Performance, UI, UX, Security (ANALYZING)
            # ════════════════════════════════════════════
            await update_job_status(AIAnalysisState.ANALYZING)

            # Technology Detection
            logger.info("STEP_STARTED: Technology Detection")
            await broadcast("stage_changed", "Technology Detection", 25.0, "Detecting technologies...",
                            status="running", legacy_type=WSEventType.STAGE_PROGRESS)
            # ════════════════════════════════════════════
            # PHASE 9 — PARALLEL ANALYSIS
            # Technology, SEO, Performance, UI/UX and Security are independent
            # (they all depend only on `pages`), so we compute them concurrently
            # with asyncio.gather, then persist each result sequentially to avoid
            # write races on the lead document.
            # ════════════════════════════════════════════
            await update_job_status(AIAnalysisState.ANALYZING)

            from app.services.technology_detection_service import (
                TechnologyDetectionService,
                technology_detection_service,
            )
            from app.services.seo_analysis_service import SeoAnalysisService
            from app.services.performance_analysis_service import PerformanceAnalysisService
            from app.services.ui_ux_analysis_service import UiUxAnalysisService
            from app.services.security_analysis_service import SecurityAnalysisService
            from app.services.social_media_analysis_service import SocialMediaAnalysisService
            from app.services.mobile_analysis_service import MobileAnalysisService
            from app.services.content_analysis_service import ContentAnalysisService
            from app.services.tiktok_detection_service import TikTokDetectionService
            from app.services.performance_audit_service import performance_audit_service
            from app.services.security_audit_service import security_audit_service
            from app.services.seo_intelligence_service import seo_intelligence_service
            from app.services.uiux_audit_service import uiux_audit_service

            links = crawl_result.get("links") or []

            async def _safe_compute(coro, timeout, name):
                """Run an analyzer with timeout; never raise (returns (result, error))."""
                try:
                    return await self._run_with_timeout(coro, timeout, name), None
                except Exception as e:  # pragma: no cover - defensive
                    logger.error(f"STEP_FAILED: {name} - {e}")
                    return None, str(e)

            tech_res, seo_res, perf_res, uiux_res, security_res, social_res, mobile_res, content_res, tiktok_res, perf_audit_res, sec_audit_res, seo_intel_res, uiux_audit_res = await asyncio.gather(
                _safe_compute(
                    TechnologyDetectionService().detect_technologies(lead_id=lead_id, pages=pages, on_update=silent_update),
                    TECH_TIMEOUT, "Technology Detection"),
                _safe_compute(
                    SeoAnalysisService().analyze_website(lead_id=lead_id, website_url=website_url, pages=pages, links=links, on_update=silent_update),
                    SEO_TIMEOUT, "SEO Analysis"),
                _safe_compute(
                    PerformanceAnalysisService().analyze_performance(lead_id=lead_id, website_url=website_url, pages=pages, on_update=silent_update),
                    PERFORMANCE_TIMEOUT, "Performance Analysis"),
                _safe_compute(
                    UiUxAnalysisService().analyze_ui_ux(lead_id=lead_id, website_url=website_url, on_update=silent_update),
                    UIUX_TIMEOUT, "UI/UX Analysis"),
                _safe_compute(
                    SecurityAnalysisService().analyze_security(lead_id=lead_id, website_url=website_url, pages=pages, on_update=silent_update),
                    SECURITY_TIMEOUT, "Security Analysis"),
                _safe_compute(
                    SocialMediaAnalysisService().analyze_social_media(lead_id=lead_id, website_url=website_url, pages=pages, on_update=silent_update),
                    SOCIAL_TIMEOUT, "Social Media Analysis"),
                _safe_compute(
                    MobileAnalysisService().analyze_mobile(lead_id=lead_id, website_url=website_url, pages=pages, on_update=silent_update),
                    MOBILE_TIMEOUT, "Mobile Analysis"),
                _safe_compute(
                    ContentAnalysisService().analyze_content(lead_id=lead_id, website_url=website_url, pages=pages, on_update=silent_update),
                    CONTENT_TIMEOUT, "Content Analysis"),
                _safe_compute(
                    TikTokDetectionService().detect_tiktok(lead_id=lead_id, website_url=website_url, pages=pages, on_update=silent_update),
                    TIKTOK_TIMEOUT, "TikTok Detection"),
                _safe_compute(
                    performance_audit_service.audit(lead_id=lead_id, website_url=website_url, pages=pages, on_update=silent_update),
                    PERF_AUDIT_TIMEOUT, "Performance Audit"),
                _safe_compute(
                    security_audit_service.audit(lead_id=lead_id, website_url=website_url, pages=pages, on_update=silent_update),
                    SEC_AUDIT_TIMEOUT, "Security Audit"),
                _safe_compute(
                    seo_intelligence_service.audit(lead_id=lead_id, website_url=website_url, pages=pages, links=links, crawl_result=crawl_result, on_update=silent_update),
                    SEO_INTEL_TIMEOUT, "SEO Intelligence Audit"),
                _safe_compute(
                    uiux_audit_service.audit(lead_id=lead_id, website_url=website_url, pages=pages, on_update=silent_update),
                    UIUX_AUDIT_TIMEOUT, "UI/UX Intelligence Audit"),
            )

            tech_result, tech_err = tech_res
            seo_result, seo_err = seo_res
            perf_result, perf_err = perf_res
            uiux_result, uiux_err = uiux_res
            security_result, security_err = security_res
            social_result, social_err = social_res
            mobile_result, mobile_err = mobile_res
            content_result, content_err = content_res
            tiktok_result, tiktok_err = tiktok_res
            perf_audit_result, perf_audit_err = perf_audit_res
            sec_audit_result, sec_audit_err = sec_audit_res
            seo_intel_result, seo_intel_err = seo_intel_res
            uiux_audit_result, uiux_audit_err = uiux_audit_res

            for err in (tech_err, seo_err, perf_err, uiux_err, security_err, social_err, mobile_err, content_err, tiktok_err, perf_audit_err, sec_audit_err, seo_intel_err, uiux_audit_err):
                if err: errors.append(err)


            # ── Persist results sequentially (no write races) ──
            # Technology Detection
            if tech_result is None:
                errors.append(f"Technology detection timed out after {TECH_TIMEOUT}s")
            else:
                await broadcast("technology_found", "Technology Detection", 35.0,
                                "Technologies detected",
                                {"technology_detected": True},
                                status="success", legacy_type=WSEventType.TECHNOLOGY_DETECTED)
                tech_enrichment = LeadEnrichmentData()
                tech_enrichment.technology_detection = analysis_result_mapper.map_tech_result(tech_result)
                try:
                    await asyncio.wait_for(safe_enrich(tech_enrichment), timeout=ENRICHMENT_TIMEOUT)
                except (asyncio.TimeoutError, Exception):
                    pass
                # Keep the intelligence dashboards' technology charts in sync.
                await technology_detection_service.persist_result(tech_result, db=db)
                logger.info("STEP_COMPLETED: Technology Detection")

            # SEO Analysis
            if seo_result is None:
                errors.append(f"SEO analysis timed out after {SEO_TIMEOUT}s")
            else:
                seo_score = safe_score(seo_result.scorecard.overall_score if seo_result.scorecard else 0)
                await broadcast("seo_completed", "SEO Analysis", 48.0,
                                f"SEO analyzed (score: {seo_score}/100)",
                                {"seo_score": seo_score},
                                status="success", legacy_type=WSEventType.SEO_COMPLETED)
                await broadcast("metrics_updated", "SEO Analysis", 48.0,
                                None,
                                {"seo_score": seo_score, "overall_score": overall_score},
                                status="success", legacy_type=WSEventType.SCORE_UPDATED)
                seo_enrichment = LeadEnrichmentData()
                seo_enrichment.seo = analysis_result_mapper.map_seo_result(seo_result)
                try:
                    await asyncio.wait_for(safe_enrich(seo_enrichment), timeout=ENRICHMENT_TIMEOUT)
                except (asyncio.TimeoutError, Exception):
                    pass
                logger.info("STEP_COMPLETED: SEO Analysis")

            # Performance Analysis (PageSpeed client)
            if perf_result is None:
                errors.append(f"Performance analysis timed out after {PERFORMANCE_TIMEOUT}s")
                warnings.append("Performance data unavailable — PageSpeed API may be down")
            else:
                perf_score = safe_score(
                    perf_result.scorecard.overall_desktop_score
                    or perf_result.scorecard.overall_mobile_score
                    or 0
                ) if perf_result.scorecard else 0
                await broadcast("performance_completed", "Performance", 60.0,
                                f"Performance analyzed (score: {perf_score}/100)",
                                {"performance_score": perf_score},
                                status="success", legacy_type=WSEventType.PERFORMANCE_COMPLETED)

                perf_enrichment = LeadEnrichmentData()
                perf_enrichment.performance = analysis_result_mapper.map_performance_result(perf_result)
                try:
                    await asyncio.wait_for(safe_enrich(perf_enrichment), timeout=ENRICHMENT_TIMEOUT)
                except (asyncio.TimeoutError, Exception):
                    pass
                logger.info("STEP_COMPLETED: Performance Analysis")

            # Website Performance Audit (local, additive — never fails AI analysis)
            if perf_audit_result is None:
                errors.append(f"Performance audit timed out after {PERF_AUDIT_TIMEOUT}s")
                warnings.append("Performance audit unavailable")
            else:
                audit_score = safe_score(perf_audit_result.overallScore or 0)
                await broadcast("performance_completed", "Website Performance Audit", 62.0,
                                f"Performance audit complete (score: {audit_score}/100)",
                                {"performance_audit_score": audit_score},
                                status="success", legacy_type=WSEventType.PERFORMANCE_COMPLETED)
                perf_audit_enrichment = LeadEnrichmentData()
                perf_audit_enrichment.performance_audit = analysis_result_mapper.map_performance_audit(perf_audit_result)
                try:
                    await asyncio.wait_for(safe_enrich(perf_audit_enrichment), timeout=ENRICHMENT_TIMEOUT)
                except (asyncio.TimeoutError, Exception):
                    pass
                logger.info("STEP_COMPLETED: Performance Audit")

            # UI/UX Analysis
            if uiux_result is None:
                errors.append(f"UI/UX analysis timed out after {UIUX_TIMEOUT}s")
            else:
                ui_score = safe_score(uiux_result.scorecard.overall_ui_score if uiux_result.scorecard else 0)
                ux_score = safe_score(uiux_result.scorecard.overall_ux_score if uiux_result.scorecard else 0)
                await broadcast("ui_completed", "UI", 66.0,
                                f"UI analyzed (score: {ui_score}/100)",
                                {"ui_score": ui_score},
                                status="success", legacy_type=WSEventType.UI_COMPLETED)
                await broadcast("ux_completed", "UX", 68.0,
                                f"UX analyzed (score: {ux_score}/100)",
                                {"ux_score": ux_score},
                                status="success", legacy_type=WSEventType.UX_COMPLETED)
                logger.info("STEP_COMPLETED: UI/UX Analysis")

            # Security Analysis
            if security_result is None:
                errors.append(f"Security analysis timed out after {SECURITY_TIMEOUT}s")
            else:
                sec_score = safe_score(security_result.scorecard.overall_security_score if security_result.scorecard else 0)
                acc_score = safe_score(security_result.scorecard.accessibility_score if security_result.scorecard else 0)
                await broadcast("accessibility_completed", "Accessibility", 78.0,
                                f"Accessibility analyzed (score: {acc_score}/100)",
                                {"accessibility_score": acc_score},
                                status="success", legacy_type=WSEventType.ACCESSIBILITY_COMPLETED)
                await broadcast("security_completed", "Security", 82.0,
                                f"Security analyzed (score: {sec_score}/100)",
                                {"security_score": sec_score},
                                status="success", legacy_type=WSEventType.SECURITY_COMPLETED)

                design_enrichment = LeadEnrichmentData()
                design_enrichment.design = analysis_result_mapper.map_design_result(
                    uiux_result=uiux_result,
                    security_result=security_result
                )
                try:
                    await asyncio.wait_for(safe_enrich(design_enrichment), timeout=ENRICHMENT_TIMEOUT)
                except (asyncio.TimeoutError, Exception):
                    pass
                logger.info("STEP_COMPLETED: Security Analysis")

            # Website Security Audit (local, additive — never fails AI analysis)
            if sec_audit_result is None:
                errors.append(f"Security audit timed out after {SEC_AUDIT_TIMEOUT}s")
                warnings.append("Security audit unavailable")
            else:
                sec_audit_score = safe_score(sec_audit_result.overallScore or 0)
                await broadcast("security_completed", "Website Security Audit", 84.0,
                                f"Security audit complete (score: {sec_audit_score}/100)",
                                {"security_audit_score": sec_audit_score},
                                status="success", legacy_type=WSEventType.SECURITY_COMPLETED)
                sec_audit_enrichment = LeadEnrichmentData()
                sec_audit_enrichment.security_audit = analysis_result_mapper.map_security_audit(sec_audit_result)
                try:
                    await asyncio.wait_for(safe_enrich(sec_audit_enrichment), timeout=ENRICHMENT_TIMEOUT)
                except (asyncio.TimeoutError, Exception):
                    pass
                logger.info("STEP_COMPLETED: Security Audit")

            # SEO Intelligence Audit (local, additive — never fails AI analysis)
            if seo_intel_result is None:
                errors.append(f"SEO intelligence audit timed out after {SEO_INTEL_TIMEOUT}s")
                warnings.append("SEO intelligence audit unavailable")
            else:
                seo_intel_score = safe_score(seo_intel_result.overallScore or 0)
                await broadcast("seo_completed", "SEO Intelligence", 85.0,
                                f"SEO intelligence audit complete (score: {seo_intel_score}/100)",
                                {"seo_intelligence_score": seo_intel_score},
                                status="success", legacy_type=WSEventType.SEO_COMPLETED)
                seo_intel_enrichment = LeadEnrichmentData()
                seo_intel_enrichment.seo_audit = analysis_result_mapper.map_seo_audit(seo_intel_result)
                try:
                    await asyncio.wait_for(safe_enrich(seo_intel_enrichment), timeout=ENRICHMENT_TIMEOUT)
                except (asyncio.TimeoutError, Exception):
                    pass
                logger.info("STEP_COMPLETED: SEO Intelligence Audit")

            # Website UI/UX Intelligence Audit (local, additive — never fails AI analysis)
            if uiux_audit_result is None:
                errors.append(f"UI/UX intelligence audit timed out after {UIUX_AUDIT_TIMEOUT}s")
                warnings.append("UI/UX intelligence audit unavailable")
            else:
                uiux_audit_score = safe_score(getattr(uiux_audit_result, "overallScore", 0) or 0)
                await broadcast("ui_completed", "Website UI/UX Intelligence", 86.0,
                                f"UI/UX intelligence audit complete (score: {uiux_audit_score}/100)",
                                {"uiux_audit_score": uiux_audit_score},
                                status="success", legacy_type=WSEventType.UI_COMPLETED)
                uiux_audit_enrichment = LeadEnrichmentData()
                uiux_audit_enrichment.uiux_audit = analysis_result_mapper.map_uiux_audit(uiux_audit_result)
                try:
                    await asyncio.wait_for(safe_enrich(uiux_audit_enrichment), timeout=ENRICHMENT_TIMEOUT)
                except (asyncio.TimeoutError, Exception):
                    pass
                logger.info("STEP_COMPLETED: UI/UX Intelligence Audit")

            # Social Media Analysis
            if social_result is None:
                errors.append(f"Social media analysis timed out after {SOCIAL_TIMEOUT}s")
            else:
                social_score = safe_score(social_result.scorecard.overall_social_score if social_result.scorecard else 0)
                await broadcast("social_media_completed", "Social Media", 69.0,
                                f"Social media analyzed (score: {social_score}/100)",
                                {"social_media_score": social_score},
                                status="success", legacy_type=WSEventType.SOCIAL_MEDIA_COMPLETED)
                if social_result.profiles:
                    await broadcast("social_media_detected", "Social Media", 70.0,
                                    f"{len(social_result.profiles)} social profile(s) detected",
                                    {"profiles": [p.url for p in social_result.profiles]},
                                    status="success", legacy_type=WSEventType.SOCIAL_MEDIA_DETECTED)
                social_enrichment = LeadEnrichmentData()
                social_enrichment.social_media_analysis = analysis_result_mapper.map_social_media_analysis(social_result)
                try:
                    await asyncio.wait_for(safe_enrich(social_enrichment), timeout=ENRICHMENT_TIMEOUT)
                except (asyncio.TimeoutError, Exception):
                    pass
                logger.info("STEP_COMPLETED: Social Media Analysis")

            # Mobile Analysis
            if mobile_result is None:
                errors.append(f"Mobile analysis timed out after {MOBILE_TIMEOUT}s")
            else:
                mobile_score = safe_score(mobile_result.scorecard.overall_mobile_score if mobile_result.scorecard else 0)
                await broadcast("mobile_completed", "Mobile", 72.0,
                                f"Mobile analyzed (score: {mobile_score}/100)",
                                {"mobile_score": mobile_score},
                                status="success", legacy_type=WSEventType.MOBILE_COMPLETED)
                mobile_enrichment = LeadEnrichmentData()
                mobile_enrichment.mobile = analysis_result_mapper.map_mobile_result(mobile_result)
                try:
                    await asyncio.wait_for(safe_enrich(mobile_enrichment), timeout=ENRICHMENT_TIMEOUT)
                except (asyncio.TimeoutError, Exception):
                    pass
                logger.info("STEP_COMPLETED: Mobile Analysis")

            # Content Analysis
            if content_result is None:
                errors.append(f"Content analysis timed out after {CONTENT_TIMEOUT}s")
            else:
                content_score = safe_score(content_result.scorecard.overall_content_score if content_result.scorecard else 0)
                await broadcast("content_completed", "Content", 75.0,
                                f"Content analyzed (score: {content_score}/100)",
                                {"content_score": content_score},
                                status="success", legacy_type=WSEventType.CONTENT_COMPLETED)
                content_enrichment = LeadEnrichmentData()
                content_enrichment.content = analysis_result_mapper.map_content_result(content_result)
                try:
                    await asyncio.wait_for(safe_enrich(content_enrichment), timeout=ENRICHMENT_TIMEOUT)
                except (asyncio.TimeoutError, Exception):
                    pass
                logger.info("STEP_COMPLETED: Content Analysis")

            # TikTok Detection
            if tiktok_result is None:
                errors.append(f"TikTok detection timed out after {TIKTOK_TIMEOUT}s")
            else:
                tiktok_found = bool(getattr(tiktok_result, "found", False))
                tiktok_enrichment = LeadEnrichmentData()
                tiktok_enrichment.tiktok = analysis_result_mapper.map_tiktok_result(tiktok_result)
                try:
                    await asyncio.wait_for(safe_enrich(tiktok_enrichment), timeout=ENRICHMENT_TIMEOUT)
                except (asyncio.TimeoutError, Exception):
                    pass
                if tiktok_found:
                    await broadcast("tiktok_detected", "TikTok", 76.0,
                                    f"TikTok detected: @{getattr(tiktok_result, 'username', '')}",
                                    {"tiktok": {"found": True, "username": getattr(tiktok_result, "username", None),
                                                "url": getattr(tiktok_result, "url", None)}},
                                    status="success", legacy_type=WSEventType.SOCIAL_MEDIA_DETECTED)
                    logger.info("TikTok stored")
                else:
                    logger.info("TikTok not found")

            # ════════════════════════════════════════════
            # PHASE 3 — Scoring (SCORING)
            # ════════════════════════════════════════════
            await update_job_status(AIAnalysisState.SCORING)
            logger.info("STEP_STARTED: Scoring")
            await broadcast("stage_changed", "Business Intelligence", 86.0,
                            "Computing business intelligence...",
                            status="running", legacy_type=WSEventType.STAGE_PROGRESS)

            def _to_dict(r):
                if r is None:
                    return {}
                if hasattr(r, "model_dump"):
                    return r.model_dump()
                if hasattr(r, "dict"):
                    return r.dict()
                return r if isinstance(r, dict) else {}

            modules_data = {
                "contacts": _to_dict(contact_result),
                "tech":     _to_dict(tech_result),
                "seo":      _to_dict(seo_result),
                "performance": _to_dict(perf_result),
                "ui_ux":    _to_dict(uiux_result),
                "security": _to_dict(security_result),
                "social_media": _to_dict(social_result),
                "mobile":   _to_dict(mobile_result),
                "content":  _to_dict(content_result),
            }

            try:
                from app.services.business_intelligence_service import BusinessIntelligenceService

                bi_service = BusinessIntelligenceService(db)
                bi_result = await self._run_with_timeout(
                    bi_service.compute_intelligence(
                        lead_id=lead_id,
                        website_url=website_url,
                        modules_data=modules_data,
                        on_update=silent_update
                    ),
                    SCORING_TIMEOUT, "Scoring"
                )

                if bi_result is None:
                    errors.append(f"Scoring timed out after {SCORING_TIMEOUT}s")
                    overall_score = safe_score((seo_score + perf_score + ui_score + ux_score) / 4) if any([seo_score, perf_score, ui_score, ux_score]) else 0
                else:
                    overall_score = safe_score(bi_result.scorecard.overall_website_score if bi_result.scorecard else safe_score((seo_score + perf_score + ui_score + ux_score) / 4))

                    await broadcast("recommendation_completed", "Recommendations", 90.0,
                                    "Business intelligence & recommendations computed",
                                    {"business_opportunity_score": safe_score(bi_result.scorecard.business_opportunity_score if bi_result.scorecard else 0),
                                     "overall_score": overall_score},
                                    status="success", legacy_type="RECOMMENDATION_COMPLETED")

                    biz_enrichment = LeadEnrichmentData()
                    biz_enrichment.business = analysis_result_mapper.map_business_result(
                        bi_result=bi_result,
                        overall_score=overall_score
                    )
                    try:
                        await asyncio.wait_for(
                            safe_enrich(biz_enrichment),
                            timeout=ENRICHMENT_TIMEOUT
                        )
                    except (asyncio.TimeoutError, Exception):
                        pass
                    logger.info("STEP_COMPLETED: Scoring")
            except Exception as bi_err:
                logger.error(f"STEP_FAILED: Scoring - {bi_err}")
                errors.append(f"Scoring/BI failed: {str(bi_err)}")
                overall_score = safe_score((seo_score + perf_score + ui_score + ux_score) / 4) if any([seo_score, perf_score, ui_score, ux_score]) else 0

            # ════════════════════════════════════════════
            # PHASE 3b — Lead Intelligence + Sales Opportunity
            # ════════════════════════════════════════════
            await broadcast("stage_changed", "Lead Intelligence", 88.0,
                            "Computing lead intelligence & sales opportunity...",
                            status="running", legacy_type=WSEventType.LEAD_INTELLIGENCE_STARTED)
            try:
                from app.services.lead_opportunity_service import LeadOpportunityService

                opportunity_modules_data = dict(modules_data)
                opportunity_modules_data["business_intelligence"] = _to_dict(bi_result)

                opportunity_result = await self._run_with_timeout(
                    asyncio.to_thread(
                        LeadOpportunityService(db).compute_lead_opportunity,
                        lead_id,
                        website_url,
                        opportunity_modules_data,
                        None,
                    ),
                    OPPORTUNITY_TIMEOUT, "Lead Opportunity"
                )

                if opportunity_result is None:
                    errors.append(f"Lead opportunity computation timed out after {OPPORTUNITY_TIMEOUT}s")
                else:
                    lead_intelligence_score = safe_score(
                        opportunity_result.lead_intelligence.lead_score
                        if opportunity_result.lead_intelligence else 0
                    )
                    sales_opportunity_score = safe_score(
                        opportunity_result.sales_opportunity.opportunity_score
                        if opportunity_result.sales_opportunity else 0
                    )
                    await broadcast("lead_intelligence_completed", "Lead Intelligence", 89.0,
                                    f"Lead intelligence computed (score: {lead_intelligence_score}/100)",
                                    {"lead_intelligence_score": lead_intelligence_score},
                                    status="success", legacy_type=WSEventType.LEAD_INTELLIGENCE_COMPLETED)
                    await broadcast("sales_opportunity_completed", "Sales Opportunity", 90.0,
                                    f"Sales opportunity scored ({sales_opportunity_score}/100)",
                                    {"sales_opportunity_score": sales_opportunity_score},
                                    status="success", legacy_type=WSEventType.SALES_OPPORTUNITY_COMPLETED)

                    opportunity_enrichment = LeadEnrichmentData()
                    li_map, so_map = analysis_result_mapper.map_lead_opportunity(opportunity_result)
                    if li_map:
                        opportunity_enrichment.lead_intelligence = li_map
                    if so_map:
                        opportunity_enrichment.sales_opportunity = so_map
                    try:
                        await asyncio.wait_for(safe_enrich(opportunity_enrichment), timeout=ENRICHMENT_TIMEOUT)
                    except (asyncio.TimeoutError, Exception):
                        pass
                    logger.info("STEP_COMPLETED: Lead Opportunity")
            except Exception as opp_err:
                logger.error(f"STEP_FAILED: Lead Opportunity - {opp_err}")
                errors.append(f"Lead opportunity computation failed: {str(opp_err)}")

            # ── Push full live score snapshot to the Operations Center ──
            await broadcast("score_updated", "Business Intelligence", 93.0,
                            "Scores updated",
                            {
                                "overall_score": overall_score,
                                "seo_score": seo_score,
                                "performance_score": perf_score,
                                "ui_score": ui_score,
                                "ux_score": ux_score,
                                "security_score": sec_score,
                                "accessibility_score": acc_score,
                                "social_media_score": social_score,
                                "mobile_score": mobile_score,
                                "content_score": content_score,
                                "lead_intelligence_score": lead_intelligence_score,
                                "sales_opportunity_score": sales_opportunity_score,
                                "business_opportunity_score": safe_score(bi_result.scorecard.business_opportunity_score if (bi_result and bi_result.scorecard) else 0),
                                "emails_discovered": emails_found,
                                "phones_discovered": phones_found,
                                "pages_crawled": crawled_pages_count,
                            },
                            status="success", legacy_type=WSEventType.SCORE_UPDATED)

        except Exception as main_err:
            logger.critical(f"Unhandled pipeline failure: {main_err}")
            errors.append(f"Pipeline failure: {str(main_err)}")

        finally:
            # ════════════════════════════════════════════
            # PHASE 4 — Saving & Cleanup (SAVING)
            # ════════════════════════════════════════════
            # This block MUST execute — it ensures the job always reaches
            # a terminal state, even if the pipeline was cancelled or timed out.
            try:
                await update_job_status(AIAnalysisState.SAVING)
            except Exception:
                pass

            logger.info("STEP_STARTED: Saving")
            await broadcast("saving", "Saving", 96.0, "Persisting analysis results to database...",
                            status="running", legacy_type="SAVING")

            completed_at = datetime.now(timezone.utc)
            duration = round((completed_at - started_at).total_seconds(), 2)

            # Determine final status — ALWAYS one of: COMPLETED, PARTIAL_SUCCESS, FAILED
            if errors and not (seo_result or tech_result or uiux_result or perf_result or social_result or mobile_result or content_result):
                final_status = AIAnalysisState.FAILED
                logger.error(f"ANALYSIS_FAILED: Job {job_id} failed after {duration}s. Errors: {errors}")
            elif errors:
                final_status = AIAnalysisState.PARTIAL_SUCCESS
                logger.warning(f"ANALYSIS_PARTIAL: Job {job_id} finished with errors after {duration}s. Errors: {errors}")
            else:
                final_status = AIAnalysisState.COMPLETED
                logger.info(f"ANALYSIS_COMPLETED: Job {job_id} finished successfully in {duration}s.")

            # Save Normalized Payload (with timeout protection)
            normalized_analysis = {}
            try:
                normalized_analysis = analysis_result_normalizer.normalize(
                    started_at=started_at,
                    completed_at=completed_at,
                    website_url=website_url,
                    crawl_result=crawl_result,
                    contact_result=contact_result,
                    tech_result=tech_result,
                    seo_result=seo_result,
                    perf_result=perf_result,
                    uiux_result=uiux_result,
                    security_result=security_result,
                    bi_result=bi_result,
                    social_result=social_result,
                    mobile_result=mobile_result,
                    content_result=content_result,
                    opportunity_result=opportunity_result,
                    overall_score=overall_score,
                    seo_score=seo_score,
                    perf_score=perf_score,
                    ui_score=ui_score,
                    ux_score=ux_score,
                    sec_score=sec_score,
                    acc_score=acc_score,
                    prev_count=prev_analysis_count,
                    analysis_version="2.0",
                    status=final_status.value,
                )

                normalized_analysis["errors"] = errors
                normalized_analysis["warnings"] = warnings
                normalized_analysis["progress"] = 100.0

                await asyncio.wait_for(
                    persist_ai_analysis(lead_id, normalized_analysis),
                    timeout=SAVE_TIMEOUT
                )
                # ── Phase 8: Automatic DB consistency verification ──
                try:
                    await self._verify_and_repair_consistency(
                        db, lead_id, normalized_analysis
                    )
                except Exception as verify_err:
                    logger.error(f"CONSISTENCY_VERIFY_FAILED: {verify_err}")
            except asyncio.TimeoutError:
                logger.critical(f"Failed to persist ai_analysis results: save timed out after {SAVE_TIMEOUT}s")
                final_status = AIAnalysisState.FAILED
            except Exception as final_save_err:
                logger.critical(f"Failed to persist final ai_analysis results: {final_save_err}")
                final_status = AIAnalysisState.FAILED

            retried = False
            # ── Retry on failure (never permanently fail without retries) ──
            # Bulk rule: only retry transient failures (timeout / network /
            # temporary); permanent errors (404 / invalid URL / no website)
            # fail immediately.
            if final_status == AIAnalysisState.FAILED:
                retried = await self._schedule_retry(
                    db, job_id, queue_id_obj, job, errors,
                    retryable=is_retryable_errors(errors),
                )
                if retried:
                    logger.info(f"RETRY_SCHEDULED: Job {job_id} scheduled for retry after {duration}s.")

            if not retried:
                # Update job record (metadata only) — with timeout protection
                try:
                    await asyncio.wait_for(
                        db["ai_analysis_jobs"].update_one(
                            {"_id": job_id},
                            {"$set": {
                                "status": final_status,
                                "total_pages": crawled_pages_count,
                                "emails_discovered": emails_found,
                                "phones_discovered": phones_found,
                                "overall_ai_score": overall_score,
                                "seo_score": seo_score,
                                "performance_score": perf_score,
                                "ui_score": ui_score,
                                "ux_score": ux_score,
                                "security_score": sec_score,
                                "accessibility_score": acc_score,
                                "social_media_score": social_score,
                                "mobile_score": mobile_score,
                                "content_score": content_score,
                                "lead_intelligence_score": lead_intelligence_score,
                                "sales_opportunity_score": sales_opportunity_score,
                                "completed_at": completed_at,
                                "updated_at": completed_at,
                                "error_message": "; ".join(errors) if errors else None,
                                "errors": errors,
                                "warnings": warnings,
                                "progress": 100.0
                            }}
                        ),
                        timeout=SAVE_TIMEOUT
                    )
                except Exception as job_update_err:
                    logger.error(f"Failed to update job record: {job_update_err}")

                # ── TERMINAL BROADCASTS ──
                # The lead is saved NOW. Signal completion immediately so the
                # monitor stops showing "Saving" without waiting for the heavy
                # report build / consistency verification work below.
                try:
                    await manager.broadcast_to_job(str(queue_id), {
                        "type": "analysis_completed",
                        "event_type": "analysis_completed",
                        "lead_id": lead_id,
                        "queue_id": str(queue_id),
                        "status": final_status.value,
                        "stage": "Completed",
                        "progress": 100.0,
                        "message": f"Analysis finished with status: {final_status.value}",
                        "timestamp": completed_at.isoformat()
                    })
                except Exception as ws_err:
                    logger.warning(f"Failed to broadcast analysis_completed: {ws_err}")

                try:
                    ws_event = WSEventType.LEAD_COMPLETED if final_status != AIAnalysisState.FAILED else WSEventType.LEAD_FAILED
                    completed_type = "completed" if final_status != AIAnalysisState.FAILED else "failed"
                    await broadcast(completed_type, "Completed", 100.0,
                                    f"Analysis finished with status: {final_status.value}",
                                    {
                                        "overall_score": overall_score,
                                        "seo_score": seo_score,
                                        "performance_score": perf_score,
                                        "ui_score": ui_score,
                                        "ux_score": ux_score,
                                        "security_score": sec_score,
                                        "accessibility_score": acc_score,
                                        "social_media_score": social_score,
                                        "mobile_score": mobile_score,
                                        "content_score": content_score,
                                        "lead_intelligence_score": lead_intelligence_score,
                                        "sales_opportunity_score": sales_opportunity_score,
                                        "emails_discovered": emails_found,
                                        "phones_discovered": phones_found,
                                        "pages_crawled": crawled_pages_count,
                                    },
                                    status="success" if final_status != AIAnalysisState.FAILED else "failed",
                                    legacy_type=ws_event)
                except Exception:
                    pass

                # ── POST-SAVE WORK (background — never blocks "Saving") ──
                # Report generation, consistency verification, queue bookkeeping
                # and Lead Intelligence enqueueing all run off the critical path.
                async def _post_save_tasks():
                    # Build + broadcast the final Enterprise Website Audit Report
                    try:
                        from app.services.audit_report_service import audit_report_service
                        saved_lead = await db["leads"].find_one({"_id": to_object_id(lead_id)})
                        if saved_lead:
                            report_data = audit_report_service.build_report(saved_lead)
                            if report_data:
                                await broadcast("report_ready", "Report", 99.0,
                                                "Enterprise audit report generated",
                                                {"report": report_data},
                                                status="success", legacy_type=WSEventType.REPORT_READY)
                    except Exception as report_err:
                        logger.warning(f"REPORT_BUILD_FAILED: {report_err}")

                    # Update completed/failed job count in queue
                    try:
                        if final_status == AIAnalysisState.FAILED:
                            await db["ai_analysis_queues"].update_one(
                                {"_id": queue_id_obj},
                                {"$inc": {"failed_jobs": 1}}
                            )
                        else:
                            await db["ai_analysis_queues"].update_one(
                                {"_id": queue_id_obj},
                                {"$inc": {"completed_jobs": 1}}
                            )
                    except Exception:
                        pass

                    # Trigger Lead Intelligence Queue if analysis succeeded or was partial
                    if final_status != AIAnalysisState.FAILED:
                        try:
                            from app.models.lead_intelligence import LeadIntelligenceQueue, LeadIntelligenceJobCreate
                            li_queue = LeadIntelligenceQueue(user_id=user_id, total_jobs=1)
                            inserted_queue = await db["lead_intelligence_queues"].insert_one(li_queue.model_dump())

                            li_job = LeadIntelligenceJobCreate(
                                queue_id=str(inserted_queue.inserted_id),
                                lead_id=str(lead_id)
                            )
                            await db["lead_intelligence_jobs"].insert_one(li_job.model_dump())
                        except Exception as li_err:
                            logger.error(f"Failed to enqueue Lead Intelligence: {li_err}")

                    # Recalculate and update queue status
                    try:
                        await self._check_queue_completion(db, [str(queue_id)])
                    except Exception as qc_err:
                        logger.error(f"Failed to check queue completion: {qc_err}")

                try:
                    bg = asyncio.create_task(_post_save_tasks())
                    self._background_tasks.append(bg)
                    bg.add_done_callback(self._background_tasks.remove)
                except Exception as bg_err:
                    logger.error(f"Failed to schedule post-save tasks: {bg_err}")

                try:
                    verify_bg = asyncio.create_task(
                        self._verify_and_repair_consistency(db, lead_id, normalized_analysis)
                    )
                    self._background_tasks.append(verify_bg)
                    verify_bg.add_done_callback(self._background_tasks.remove)
                except Exception as vbg_err:
                    logger.error(f"Failed to schedule consistency verification: {vbg_err}")

                logger.info(f"STEP_COMPLETED: Saving. Job {job_id} reached terminal state: {final_status.value}. Released worker.")

    # ─────────────────────────────────────────────────────────────────────
    # PHASE 8 — DB CONSISTENCY VERIFICATION
    # ─────────────────────────────────────────────────────────────────────

    async def _verify_and_repair_consistency(
        self, db, lead_id: str, normalized_analysis: Dict[str, Any]
    ):
        """
        After every save, verify that MongoDB contains all required analysis
        sub-documents and scalar fields. Any missing field is repaired with a
        safe default so downstream consumers (frontend, reports) never see
        empty/None values for core analysis data.
        """
        lead_oid = to_object_id(lead_id)

        # Required ai_analysis scalar fields → safe default factory
        required_scalars = {
            "analysis_status": "COMPLETED",
            "overall_score": 0,
            "website_score": 0,
            "seo_score": 0,
            "performance_score": 0,
            "ui_score": 0,
            "ux_score": 0,
            "accessibility_score": 0,
            "security_score": 0,
            "business_opportunity": 0,
            "mobile_score": 0,
            "social_media_score": 0,
            "content_score": 0,
            "lead_intelligence_score": 0,
            "sales_opportunity_score": 0,
            "recommendations": [],
            "emails": [],
            "phones": [],
            "social_links": {},
            "contacts": [],
            "cms": None,
            "frontend": None,
            "backend": None,
            "hosting": None,
            "cdn": None,
            "analytics": None,
        }

        # Required lead-level sub-documents (must at least exist as objects)
        required_subdocs = [
            "website_information",
            "website_structure",
            "technology_detection",
            "seo",
            "performance",
            "design",
            "business",
            "social_media",
            "contact_discovery",
            "social_media_analysis",
            "mobile",
            "content",
            "tiktok",
            "lead_intelligence",
            "sales_opportunity",
            "performanceAudit",
            "securityAudit",
            "seoAudit",
            "uiuxAudit",
        ]

        lead = await db["leads"].find_one({"_id": lead_oid})
        if not lead:
            logger.error(f"CONSISTENCY_VERIFY: Lead {lead_id} missing — cannot verify")
            return

        repairs: Dict[str, Any] = {}

        ai = lead.get("ai_analysis") or {}
        for field, default in required_scalars.items():
            if field not in ai or ai.get(field) is None:
                # Only patch if normalized_analysis also lacked it; otherwise keep normalized value
                if field in normalized_analysis and normalized_analysis.get(field) is not None:
                    repairs.setdefault("ai_analysis", {})[field] = normalized_analysis[field]
                else:
                    repairs.setdefault("ai_analysis", {})[field] = default

        # Ensure timestamps exist
        now_iso = datetime.now(timezone.utc)
        for ts_field in ("analysis_completed_at", "analysis_started_at", "last_analysis_date"):
            if ts_field not in ai or ai.get(ts_field) is None:
                repairs.setdefault("ai_analysis", {})[ts_field] = now_iso

        # Sub-document existence check
        for sub in required_subdocs:
            existing = lead.get(sub)
            if existing is None or (isinstance(existing, dict) and len(existing) == 0):
                repairs[sub] = normalized_analysis.get(sub) or {}

        from app.services.safe_scoring import calculate_lead_score
        
        overall_ai_score = repairs.get("ai_analysis", {}).get("overall_score") or ai.get("overall_score") or normalized_analysis.get("overall_score") or 0
        seo_score = repairs.get("ai_analysis", {}).get("seo_score") or ai.get("seo_score") or normalized_analysis.get("seo_score") or 0
        perf_score = repairs.get("ai_analysis", {}).get("performance_score") or ai.get("performance_score") or normalized_analysis.get("performance_score") or 0
        sec_score = repairs.get("ai_analysis", {}).get("security_score") or ai.get("security_score") or normalized_analysis.get("security_score") or 0
        acc_score = repairs.get("ai_analysis", {}).get("accessibility_score") or ai.get("accessibility_score") or normalized_analysis.get("accessibility_score") or 0
        biz_opp = repairs.get("ai_analysis", {}).get("business_opportunity") or ai.get("business_opportunity") or normalized_analysis.get("business_opportunity") or 0

        calculated_lead_score = calculate_lead_score(
            overall_ai_score=overall_ai_score,
            seo_score=seo_score,
            perf_score=perf_score,
            sec_score=sec_score,
            acc_score=acc_score,
            business_opportunity=biz_opp
        )

        repairs["lead_score"] = calculated_lead_score
        repairs["ai_score"] = overall_ai_score
        repairs.setdefault("ai_analysis", {})["overall_ai_score"] = overall_ai_score
        repairs.setdefault("ai_analysis", {})["lead_score"] = calculated_lead_score
        repairs.setdefault("ai_analysis", {})["analysis_status"] = "Completed"
        repairs.setdefault("ai_analysis", {})["progress"] = 100

        if repairs:
            logger.warning(
                f"CONSISTENCY_REPAIR: Lead {lead_id} fields updated: "
                f"{list(repairs.keys())}"
            )
            await db["leads"].update_one(
                {"_id": lead_oid},
                {"$set": repairs}
            )


ai_analysis_worker_instance = AIAnalysisWorker()
