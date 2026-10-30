import asyncio
import smtplib
import ssl
import socket
import re
import random
import traceback
from datetime import datetime, timezone, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any, List, Optional
from bson import ObjectId

from app.core.logger import logger
from app.services.ws_manager import ws_manager
from app.services.worker_manager import shutdown_event

# Terminal states that mark a queue job as finished (no further retries/processing).
TERMINAL_STATUSES = ("Delivered", "Failed", "Skipped", "Cancelled")
# Transient states that indicate a worker is actively handling a job.
ACTIVE_STATUSES = ("Preparing", "Connecting", "Sending")


class EmailAIQueueWorker:
    def __init__(self, db, batch_size=5, concurrency=2):
        self.db = db
        self.batch_size = batch_size
        self.concurrency = concurrency
        self.is_running = False
        self._tasks: List[asyncio.Task] = []

    async def start(self):
        if self.is_running:
            return
        self.is_running = True

        # Spawn independent background workers
        self._tasks = [
            asyncio.create_task(self._campaign_worker(), name="EmailAI-CampaignWorker"),
            asyncio.create_task(self._smtp_worker(), name="EmailAI-SmtpWorker"),
            asyncio.create_task(self._retry_worker(), name="EmailAI-RetryWorker"),
            asyncio.create_task(self._recovery_worker(), name="EmailAI-RecoveryWorker")
        ]
        logger.info("EmailAIQueueWorker started with Campaign, SMTP, Retry, and Recovery sub-workers.")

    def stop(self):
        self.is_running = False
        for task in self._tasks:
            task.cancel()
        self._tasks.clear()
        logger.info("EmailAIQueueWorker stopped.")

    # =========================================================
    # RECOVERY WORKER
    # =========================================================
    async def _recovery_worker(self):
        """Runs once on startup to reset orphaned jobs and repair interrupted campaigns."""
        try:
            result = await self.db["email_ai_queue"].update_many(
                {"status": {"$in": list(ACTIVE_STATUSES)}},
                {"$set": {"status": "Pending", "updated_at": datetime.now(timezone.utc)}}
            )
            if result.modified_count > 0:
                logger.info(f"[EmailAI-RecoveryWorker] Recovered {result.modified_count} stuck email jobs.")

            # Repair campaigns that finished while the server was offline.
            await self._recover_finished_campaigns()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"[EmailAI-RecoveryWorker] Error: {e}")

    async def _recover_finished_campaigns(self):
        """Mark RUNNING campaigns whose queue is fully terminal as COMPLETED (startup repair)."""
        active_campaigns = self.db["email_ai_campaigns"].find({"status": "RUNNING"})
        async for campaign in active_campaigns:
            campaign_id = str(campaign["_id"])
            if await self._is_campaign_finished(campaign_id):
                await self._mark_campaign_completed(campaign_id)

    async def _is_campaign_finished(self, campaign_id: str) -> bool:
        total = await self.db["email_ai_queue"].count_documents({"campaign_id": campaign_id})
        if total == 0:
            return False
        terminal = await self.db["email_ai_queue"].count_documents(
            {"campaign_id": campaign_id, "status": {"$in": list(TERMINAL_STATUSES)}}
        )
        return terminal >= total

    # =========================================================
    # CAMPAIGN WORKER (Generates Queue)
    # =========================================================
    async def _campaign_worker(self):
        """Scans for QUEUED campaigns and expands them into individual queue jobs.

        - Idempotent: never regenerates jobs that already exist for a campaign.
        - Schedule-aware: "Later" campaigns stay QUEUED until start_time.
        - Supports multiple QUEUED campaigns per poll cycle.
        """
        while self.is_running and not shutdown_event.is_set():
            try:
                now = datetime.now(timezone.utc)
                campaigns = await self.db["email_ai_campaigns"].find({"status": "QUEUED"}).to_list(50)

                for campaign in campaigns:
                    campaign_id = str(campaign["_id"])
                    schedule = campaign.get("schedule", {})

                    # Do not start scheduled campaigns before their start time.
                    if schedule.get("type") == "Later" and schedule.get("start_time"):
                        try:
                            start_time = self._coerce_aware_utc(schedule["start_time"])
                            if start_time > now:
                                logger.info(f"[EmailAI-CampaignWorker] Campaign {campaign_id} scheduled for {start_time.isoformat()}; waiting.")
                                continue
                        except Exception as e:
                            logger.warning(f"[EmailAI-CampaignWorker] Campaign {campaign_id} has unparseable schedule: {e}")

                    # Idempotency guard: queue already generated (e.g. after a restart).
                    existing = await self.db["email_ai_queue"].count_documents({"campaign_id": campaign_id})
                    if existing > 0:
                        logger.info(f"[EmailAI-CampaignWorker] Queue already has {existing} jobs for campaign {campaign_id}; skipping generation.")
                        await self._activate_campaign(campaign_id)
                        continue

                    logger.info(f"[EmailAI-CampaignWorker] Preparing queue for campaign {campaign_id}")

                    target_leads = campaign.get("target_leads", [])
                    rules = campaign.get("rules", {})

                    # Determine next_run based on schedule
                    next_run = None
                    if schedule.get("type") == "Later" and schedule.get("start_time"):
                        try:
                            next_run = self._coerce_aware_utc(schedule["start_time"])
                        except Exception:
                            next_run = None

                    jobs = []
                    for lead_id in target_leads:
                        if not ObjectId.is_valid(str(lead_id)):
                            logger.warning(f"[EmailAI-CampaignWorker] Skipping invalid lead id {lead_id} for campaign {campaign_id}")
                            continue
                        job = {
                            "campaign_id": campaign_id,
                            "lead_id": lead_id,
                            "user_id": str(campaign.get("user_id")) if campaign.get("user_id") else None,
                            "smtp_id": campaign.get("smtp_id"),
                            "template_id": campaign.get("template_id"),
                            "status": "Pending",
                            "retries": 0,
                            "max_retries": rules.get("retry_count", 2),
                            "next_run": next_run,
                            "logs": [],
                            "created_at": datetime.now(timezone.utc),
                            "updated_at": datetime.now(timezone.utc)
                        }
                        jobs.append(job)

                    if jobs:
                        await self.db["email_ai_queue"].insert_many(jobs)
                        logger.info(f"[EmailAI-CampaignWorker] Generated {len(jobs)} jobs for campaign {campaign_id}.")

                    await self._activate_campaign(campaign_id)

                    # Nothing to process (no valid leads) -> complete immediately.
                    if not jobs:
                        logger.warning(f"[EmailAI-CampaignWorker] No valid leads for campaign {campaign_id}; marking COMPLETED.")
                        now_utc = datetime.now(timezone.utc)
                        await self.db["email_ai_campaigns"].update_one(
                            {"_id": campaign["_id"]},
                            {
                                "$set": {
                                    "status": "COMPLETED",
                                    "completed_at": now_utc,
                                    "updated_at": now_utc,
                                    "stats": {"sent": 0, "failed": 0, "skipped": 0, "queued": 0},
                                }
                            }
                        )
                        await self._broadcast_campaign_event(campaign_id, "COMPLETED", {"sent": 0, "failed": 0, "skipped": 0})

                await asyncio.sleep(5)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[EmailAI-CampaignWorker] Error: {e}\n{traceback.format_exc()}")
                await asyncio.sleep(5)

    async def _activate_campaign(self, campaign_id: str):
        """Transition a QUEUED campaign to RUNNING."""
        now = datetime.now(timezone.utc)
        result = await self.db["email_ai_campaigns"].update_one(
            {"_id": ObjectId(campaign_id), "status": "QUEUED"},
            {"$set": {"status": "RUNNING", "started_at": now, "updated_at": now}}
        )
        if result.modified_count > 0:
            logger.info(f"[EmailAI-CampaignWorker] Campaign {campaign_id} status set to RUNNING.")
            await self._broadcast_campaign_event(campaign_id, "RUNNING", {"message": "Campaign started"})

    # =========================================================
    # SMTP WORKER (Executes Queue)
    # =========================================================
    async def _smtp_worker(self):
        """Pulls Pending/Waiting jobs from RUNNING campaigns, renders templates, and sends emails."""
        while self.is_running and not shutdown_event.is_set():
            try:
                now = datetime.now(timezone.utc)
                query = {
                    "status": {"$in": ["Pending", "Waiting"]},
                    "$or": [
                        {"next_run": None},
                        {"next_run": {"$lte": now}}
                    ]
                }

                jobs = await self.db["email_ai_queue"].find(query).limit(self.concurrency).to_list(self.concurrency)
                if not jobs:
                    await asyncio.sleep(3)
                    continue

                # Only process jobs belonging to campaigns that are currently RUNNING.
                eligible = []
                for job in jobs:
                    try:
                        campaign = await self.db["email_ai_campaigns"].find_one(
                            {"_id": ObjectId(job["campaign_id"])}, {"status": 1}
                        )
                    except Exception:
                        campaign = None
                    if campaign and campaign.get("status") == "RUNNING":
                        eligible.append(job)

                if not eligible:
                    await asyncio.sleep(1)
                    continue

                tasks = [self._process_job(job) for job in eligible]
                await asyncio.gather(*tasks, return_exceptions=True)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[EmailAI-SmtpWorker] Error: {e}\n{traceback.format_exc()}")
                await asyncio.sleep(5)

    async def _process_job(self, job: Dict[str, Any]):
        job_id = job["_id"]
        campaign_id = job["campaign_id"]
        lead_id = job["lead_id"]

        # 1. Lock job (Prevent double processing)
        result = await self.db["email_ai_queue"].update_one(
            {"_id": job_id, "status": {"$in": ["Pending", "Waiting"]}},
            {"$set": {"status": "Preparing", "updated_at": datetime.now(timezone.utc)}}
        )
        if result.modified_count == 0:
            return  # Someone else grabbed it

        # Check parent campaign status. If the campaign is no longer RUNNING
        # (paused/cancelled), release the job back to Pending so a later resume
        # can pick it up. Only CANCELLED campaigns are finalized as Skipped.
        campaign = await self.db["email_ai_campaigns"].find_one({"_id": ObjectId(campaign_id)})
        if not campaign:
            await self._finalize_job(job_id, campaign_id, lead_id, None, "Skipped", "Campaign no longer exists")
            return
        if campaign.get("status") == "CANCELLED":
            await self._finalize_job(job_id, campaign_id, lead_id, None, "Skipped", "Campaign cancelled")
            return
        if campaign.get("status") != "RUNNING":
            await self._release_job(job_id, f"Campaign is {campaign.get('status')}")
            return

        start_time = datetime.now(timezone.utc)
        try:
            # Broadcast Status
            await self._broadcast_status(campaign_id, lead_id, "Preparing")
            logger.info(f"[EmailAI-SmtpWorker] Processing lead {lead_id} for campaign {campaign_id}")

            # 2. Render Template
            template = await self.db["email_ai_templates"].find_one({"_id": ObjectId(job["template_id"])})
            lead = await self.db["leads"].find_one({"_id": ObjectId(lead_id)})

            if not template or not lead:
                await self._finalize_job(job_id, campaign_id, lead_id, start_time, "Failed", "Template or Lead missing")
                return

            target_email = lead.get("email")
            if not target_email or not re.match(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$', target_email):
                await self._finalize_job(job_id, campaign_id, lead_id, start_time, "Failed", "Invalid Email Address")
                return

            subject = self._replace_variables(template.get("subject", ""), lead)
            body_html = self._replace_variables(template.get("body_html", ""), lead)
            body_text = self._replace_variables(template.get("body_text", ""), lead)
            logger.info(f"[EmailAI-SmtpWorker] Template rendered for lead {lead_id}")

            # 3. Get SMTP Profile (With failover support)
            smtp_profile = await self.db["email_ai_smtp"].find_one({"_id": ObjectId(job["smtp_id"]), "is_active": True})
            if not smtp_profile:
                # Rotation / Failover: Find any active SMTP
                smtp_profile = await self.db["email_ai_smtp"].find_one({"is_active": True})
                if not smtp_profile:
                    await self._finalize_job(job_id, campaign_id, lead_id, start_time, "Failed", "No active SMTP profiles available")
                    return
                # Update job to use new SMTP
                await self.db["email_ai_queue"].update_one({"_id": job_id}, {"$set": {"smtp_id": str(smtp_profile["_id"])}})

            # 4. Connect & Send
            await self._update_job_status(job_id, "Connecting")
            await self._broadcast_status(campaign_id, lead_id, "Connecting SMTP")

            # Run blocking SMTP code in executor
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, self._send_email_sync, smtp_profile, target_email, subject, body_html, body_text)

            # 5. Success
            await self._finalize_job(job_id, campaign_id, lead_id, start_time, "Delivered", None)
            logger.info(f"[EmailAI-SmtpWorker] Email delivered to {target_email} (job {job_id})")

            # Apply Throttle Delay for the next jobs in this campaign
            rules = campaign.get("rules", {})
            delay = rules.get("delay_seconds", 120)
            if rules.get("random_delay"):
                delay = delay * random.uniform(0.8, 1.2)
            await self._apply_campaign_throttle(campaign_id, delay)

        except asyncio.CancelledError:
            await self._release_job(job_id, "Worker cancelled mid-send")
            raise
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[EmailAI-SmtpWorker] Job {job_id} failed: {error_msg}\n{traceback.format_exc()}")

            # 6. Failure
            await self._finalize_job(job_id, campaign_id, lead_id, start_time, "Failed", error_msg)

    # =========================================================
    # RETRY WORKER
    # =========================================================
    async def _retry_worker(self):
        """Scans for Failed jobs that haven't exceeded max_retries and schedules them."""
        while self.is_running and not shutdown_event.is_set():
            try:
                # Find Failed jobs eligible for retry
                query = {
                    "status": "Failed",
                    "$expr": {"$lt": ["$retries", "$max_retries"]}
                }

                failed_jobs = await self.db["email_ai_queue"].find(query).limit(50).to_list(50)

                for job in failed_jobs:
                    campaign = await self.db["email_ai_campaigns"].find_one({"_id": ObjectId(job["campaign_id"])}, {"status": 1, "rules": 1})
                    if not campaign or campaign.get("status") != "RUNNING":
                        continue

                    # Do not retry on permanent errors
                    err = job.get("error_message", "").lower()
                    if "invalid email" in err or "template" in err or "lead missing" in err:
                        # Mark as permanently failed (bump retries to max)
                        await self.db["email_ai_queue"].update_one(
                            {"_id": job["_id"]},
                            {"$set": {"retries": job["max_retries"]}}
                        )
                        continue

                    # Calculate exponential backoff (e.g. 5m, 15m, 45m)
                    current_retry = job.get("retries", 0) + 1
                    base_delay = campaign.get("rules", {}).get("retry_delay", 300) if campaign else 300

                    delay_seconds = base_delay * (3 ** (current_retry - 1))
                    next_run = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)

                    await self.db["email_ai_queue"].update_one(
                        {"_id": job["_id"]},
                        {
                            "$set": {
                                "status": "Waiting",  # Will be picked up by SMTP worker
                                "retries": current_retry,
                                "next_run": next_run,
                                "updated_at": datetime.now(timezone.utc)
                            },
                            "$push": {"logs": f"Retry {current_retry} scheduled for {next_run.isoformat()}"}
                        }
                    )
                    logger.info(f"[EmailAI-RetryWorker] Scheduled retry {current_retry} for job {job['_id']} at {next_run}")

                await asyncio.sleep(10)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[EmailAI-RetryWorker] Error: {e}")
                await asyncio.sleep(10)

    # =========================================================
    # HELPERS
    # =========================================================
    @staticmethod
    def _coerce_aware_utc(value: Any) -> datetime:
        """Normalize a schedule datetime (string or naive datetime) to timezone-aware UTC."""
        if isinstance(value, str):
            value = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def _send_email_sync(self, smtp_profile: Dict[str, Any], to_email: str, subject: str, html: str, text: str) -> bool:
        """Synchronous SMTP execution designed to run in executor. Logs every step.
        Supports intelligent SSL/TLS auto-detection, fallback ports, and resilient handshakes.
        """
        host = (smtp_profile.get("host") or "").strip()
        port = int(smtp_profile.get("port", 587) or 587)
        username = (smtp_profile.get("username") or "").strip()
        raw_password = str(smtp_profile.get("password") or "").strip()
        clean_password = raw_password.replace(" ", "") if ("gmail" in host.lower() and len(raw_password.replace(" ", "")) == 16) else raw_password
        encryption = (smtp_profile.get("encryption") or "TLS").upper().strip()
        timeout = int(smtp_profile.get("timeout", 20) or 20)
        from_email = (smtp_profile.get("from_email") or smtp_profile.get("email") or username).strip()
        from_name = (smtp_profile.get("from_name") or smtp_profile.get("name") or "").strip()

        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        if from_name:
            msg['From'] = f"{from_name} <{from_email}>"
        else:
            msg['From'] = from_email
        msg['To'] = to_email

        if text:
            msg.attach(MIMEText(text, 'plain', 'utf-8'))
        if html:
            msg.attach(MIMEText(html, 'html', 'utf-8'))

        # Clean bare envelope sender address
        envelope_sender = from_email
        if "<" in envelope_sender and ">" in envelope_sender:
            envelope_sender = envelope_sender.split("<")[1].split(">")[0].strip()

        # Build permissive SSL context
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE

        # Auto-detect primary strategy based on port & encryption:
        # Port 465 -> SSL/SMTPS
        # Port 587 -> STARTTLS
        # Port 25 / 2525 -> STARTTLS or Plaintext
        primary_is_ssl = (port == 465) or (encryption in ["SSL", "SMTPS"])

        strategies = []
        if primary_is_ssl:
            strategies.append({"mode": "SSL", "port": port})
            if port == 465:
                strategies.append({"mode": "TLS", "port": 587})
        else:
            strategies.append({"mode": "TLS", "port": port})
            if port == 587:
                strategies.append({"mode": "SSL", "port": 465})

        last_error = None
        for strat in strategies:
            strat_mode = strat["mode"]
            strat_port = strat["port"]
            server = None
            try:
                logger.info(f"[EmailAI-SMTP] Connecting to {host}:{strat_port} via {strat_mode} (timeout={timeout}s)...")
                if strat_mode == "SSL":
                    server = smtplib.SMTP_SSL(host, strat_port, timeout=timeout, context=context)
                    server.ehlo()
                else:
                    server = smtplib.SMTP(host, strat_port, timeout=timeout)
                    server.ehlo()
                    if encryption != "NONE":
                        try:
                            server.starttls(context=context)
                            server.ehlo()
                        except Exception as tls_ex:
                            logger.warning(f"[EmailAI-SMTP] STARTTLS failed on {host}:{strat_port}: {tls_ex}")
                            if encryption == "TLS":
                                raise

                logger.info(f"[EmailAI-SMTP] Connected to {host}:{strat_port}. Authenticating as {username}...")
                if username and clean_password:
                    try:
                        server.login(username, clean_password)
                    except smtplib.SMTPServerDisconnected:
                        if clean_password != raw_password:
                            try:
                                server = smtplib.SMTP_SSL(host, strat_port, timeout=timeout, context=context) if strat_mode == "SSL" else smtplib.SMTP(host, strat_port, timeout=timeout)
                                server.ehlo()
                                if strat_mode != "SSL" and encryption != "NONE":
                                    server.starttls(context=context)
                                    server.ehlo()
                                server.login(username, raw_password)
                            except Exception:
                                raise smtplib.SMTPAuthenticationError(
                                    535,
                                    b"Google/Gmail rejected credentials and closed the connection. "
                                    b"Ensure you are using a 16-character Google App Password (not your Gmail account password) "
                                    b"generated from Google Account Security -> 2-Step Verification -> App passwords."
                                )
                        else:
                            raise smtplib.SMTPAuthenticationError(
                                535,
                                b"Google/Gmail rejected credentials and closed the connection. "
                                b"Ensure you are using a 16-character Google App Password (not your Gmail account password) "
                                b"generated from Google Account Security -> 2-Step Verification -> App passwords."
                            )
                    logger.info(f"[EmailAI-SMTP] Authenticated successfully as {username}")

                # Send message using sendmail for raw envelope control
                server.sendmail(envelope_sender, [to_email], msg.as_string())
                logger.info(f"[EmailAI-SMTP] Message delivered to {to_email} via {host}:{strat_port} (subject='{subject[:60]}')")
                return True

            except smtplib.SMTPAuthenticationError as e:
                logger.error(f"[EmailAI-SMTP] Authentication failed for {username}@{host}:{strat_port}: {e}")
                last_error = f"Authentication failed for {username}. If using Gmail/Yahoo/Outlook, please use an App Password (not your normal account password)."
                break  # Don't try other ports if authentication was rejected

            except smtplib.SMTPRecipientsRefused as e:
                logger.error(f"[EmailAI-SMTP] Recipient refused {to_email}: {e}")
                last_error = f"Recipient email address refused by mail server: {to_email}"
                break

            except (smtplib.SMTPServerDisconnected, ConnectionResetError, BrokenPipeError, TimeoutError, socket.timeout) as e:
                logger.warning(f"[EmailAI-SMTP] Connection disconnected on {host}:{strat_port} ({strat_mode}): {e}. Attempting fallback if available...")
                last_error = f"Connection unexpectedly closed by {host}:{strat_port}. Please check port (465 for SSL, 587 for TLS), verify your App Password, or ensure your hosting provider does not block outbound SMTP."
                continue

            except Exception as e:
                logger.warning(f"[EmailAI-SMTP] Error on {host}:{strat_port} ({strat_mode}): {e}")
                last_error = str(e)
                continue

            finally:
                if server:
                    try:
                        server.quit()
                    except Exception:
                        pass

        raise Exception(last_error or f"SMTP connection failed for {host}:{port}")

    def _replace_variables(self, text: str, lead: Dict[str, Any]) -> str:
        if not text:
            return ""
        now = datetime.now()
        mapping = {
            "{{business_name}}": lead.get("business_name", ""),
            "{{owner_name}}": lead.get("owner_name", ""),
            "{{email}}": lead.get("email", ""),
            "{{phone}}": lead.get("phone", ""),
            "{{website}}": lead.get("website", ""),
            "{{city}}": lead.get("city", ""),
            "{{state}}": lead.get("state", ""),
            "{{country}}": lead.get("country", ""),
            "{{industry}}": lead.get("industry", ""),
            "{{address}}": lead.get("address", ""),
            "{{ai_score}}": str(lead.get("ai_score", "")),
            "{{current_date}}": now.strftime("%B %d, %Y"),
            "{{current_time}}": now.strftime("%I:%M %p")
        }
        for k, v in mapping.items():
            text = text.replace(k, str(v) if v else "")
        return text

    async def _update_job_status(self, job_id: ObjectId, status: str, error: str = None):
        update = {"status": status, "updated_at": datetime.now(timezone.utc)}
        if error:
            update["error_message"] = error

        await self.db["email_ai_queue"].update_one(
            {"_id": job_id},
            {"$set": update, "$push": {"logs": f"Status changed to {status}" + (f": {error}" if error else "")}}
        )

    async def _release_job(self, job_id: ObjectId, reason: str):
        """Release a locked job back to Pending (e.g. campaign paused or worker cancelled)."""
        await self.db["email_ai_queue"].update_one(
            {"_id": job_id},
            {
                "$set": {"status": "Pending", "next_run": None, "updated_at": datetime.now(timezone.utc)},
                "$push": {"logs": f"Released back to Pending: {reason}"}
            }
        )

    async def _finalize_job(self, job_id: ObjectId, campaign_id: str, lead_id: str, start_time: Optional[datetime], status: str, error: str = None):
        """Mark a job terminal, update campaign stats/logs, broadcast, and check completion."""
        duration = 0.0
        if start_time:
            duration = (datetime.now(timezone.utc) - start_time).total_seconds()

        await self._update_job_status(job_id, status, error)

        now = datetime.now(timezone.utc)
        if status == "Delivered":
            await self.db["email_ai_campaigns"].update_one(
                {"_id": ObjectId(campaign_id)},
                {
                    "$inc": {"stats.sent": 1},
                    "$push": {"logs": {"status": "sent", "lead_id": lead_id, "processed_at": now.isoformat(), "duration": duration}}
                }
            )
        elif status == "Failed":
            await self.db["email_ai_campaigns"].update_one(
                {"_id": ObjectId(campaign_id)},
                {
                    "$inc": {"stats.failed": 1},
                    "$push": {"logs": {"status": "failed", "lead_id": lead_id, "processed_at": now.isoformat(), "duration": duration, "error": error}}
                }
            )
        else:  # Skipped / Cancelled
            await self.db["email_ai_campaigns"].update_one(
                {"_id": ObjectId(campaign_id)},
                {
                    "$inc": {"stats.skipped": 1},
                    "$push": {"logs": {"status": "skipped", "lead_id": lead_id, "processed_at": now.isoformat(), "duration": duration, "error": error}}
                }
            )

        await self._broadcast_status(campaign_id, lead_id, status, error)
        await self._check_campaign_completion(campaign_id)

    async def _apply_campaign_throttle(self, campaign_id: str, delay_seconds: float):
        """Pushes the next_run time of all Pending jobs in this campaign to throttle sending rate."""
        next_run = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
        await self.db["email_ai_queue"].update_many(
            {"campaign_id": campaign_id, "status": "Pending"},
            {"$set": {"next_run": next_run}}
        )

    async def _check_campaign_completion(self, campaign_id: str):
        """Mark a RUNNING campaign as COMPLETED once every queue job is terminal."""
        campaign = await self.db["email_ai_campaigns"].find_one(
            {"_id": ObjectId(campaign_id)}, {"status": 1}
        )
        if not campaign or campaign.get("status") != "RUNNING":
            return
        if await self._is_campaign_finished(campaign_id):
            await self._mark_campaign_completed(campaign_id)

    async def _mark_campaign_completed(self, campaign_id: str):
        sent = await self.db["email_ai_queue"].count_documents({"campaign_id": campaign_id, "status": "Delivered"})
        failed = await self.db["email_ai_queue"].count_documents({"campaign_id": campaign_id, "status": "Failed"})
        skipped = await self.db["email_ai_queue"].count_documents(
            {"campaign_id": campaign_id, "status": {"$in": ["Skipped", "Cancelled"]}}
        )
        now = datetime.now(timezone.utc)
        result = await self.db["email_ai_campaigns"].update_one(
            {"_id": ObjectId(campaign_id), "status": "RUNNING"},
            {
                "$set": {
                    "status": "COMPLETED",
                    "completed_at": now,
                    "updated_at": now,
                    "stats": {"sent": sent, "failed": failed, "skipped": skipped, "queued": 0},
                },
                "$push": {"logs": {"status": "completed", "lead_id": None, "processed_at": now.isoformat(), "duration": 0, "message": "Campaign completed"}}
            }
        )
        if result.modified_count == 0:
            return
        logger.info(f"[EmailAI] Campaign {campaign_id} COMPLETED: sent={sent}, failed={failed}, skipped={skipped}")
        await self._broadcast_campaign_event(campaign_id, "COMPLETED", {"sent": sent, "failed": failed, "skipped": skipped})

    async def _broadcast_status(self, campaign_id: str, lead_id: str, status: str, error: str = None):
        """Broadcast a per-lead status event over the campaign's WebSocket room.

        The event payload mirrors what the Live Dashboard expects: a lowercase
        ``type`` (email_preparing/smtp_connecting/email_sending/email_sent/
        email_failed/email_skipped) plus a normalized ``status`` field.
        """
        event_map = {
            "Preparing": ("email_preparing", "Preparing"),
            "Connecting SMTP": ("smtp_connecting", "Connecting"),
            "Sending": ("email_sending", "Sending"),
            "Delivered": ("email_sent", "Delivered"),
            "Failed": ("email_failed", "Failed"),
            "Skipped": ("email_skipped", "Skipped"),
        }
        event_type, display_status = event_map.get(status, ("system_log", status))

        payload = {
            "type": event_type,
            "campaign_id": campaign_id,
            "lead_id": lead_id,
            "status": display_status,
            "error": error,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        try:
            await ws_manager.broadcast_to_job(campaign_id, payload)
            # Global sync broadcast so open pages invalidate their React Query caches immediately
            await ws_manager.broadcast({
                "type": event_type,
                "event_type": event_type,
                "campaign_id": campaign_id,
                "lead_id": lead_id,
                "status": display_status,
                "error": error,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception as e:
            logger.error(f"[EmailAI-SmtpWorker] WebSocket broadcast failed for campaign {campaign_id}: {e}")

    async def _broadcast_campaign_event(self, campaign_id: str, status: str, data: Optional[Dict[str, Any]] = None):
        """Broadcast a campaign-level event (RUNNING / COMPLETED)."""
        payload = {
            "type": "email_campaign_completed" if status == "COMPLETED" else "email_campaign_status",
            "campaign_id": campaign_id,
            "status": status,
            "data": data or {},
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        try:
            await ws_manager.broadcast_to_job(campaign_id, payload)
            await ws_manager.broadcast({
                "type": payload["type"],
                "event_type": payload["type"],
                "campaign_id": campaign_id,
                "status": status,
                "data": data or {},
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception as e:
            logger.error(f"[EmailAI-SmtpWorker] Campaign broadcast failed for campaign {campaign_id}: {e}")
