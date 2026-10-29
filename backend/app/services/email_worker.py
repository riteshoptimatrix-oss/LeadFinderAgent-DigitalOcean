import asyncio
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
import re
from bson import ObjectId

from app.db.database import get_db
from app.core.logger import logger
from app.core.websocket import manager
from app.core.security_crypto import decrypt_string
from app.models.email_campaign import EmailCampaignStatus, EmailMessageStatus, SUPPORTED_VARIABLES

from app.services.worker_manager import emit_heartbeat, shutdown_event

MAX_RETRIES = 3

VARIABLE_TO_FIELD = {
    "business_name": "name",
    "company_name": "name",
    "contact_name": "name",
    "city": "city",
    "state": "state",
    "country": "country",
    "website": "website",
    "phone": "phone",
    "email": "email",
    "category": "category",
    "ai_score": "ai_score",
    "seo_score": "seo_score",
    "website_score": "website_score"
}
VARIABLE_PATTERN = re.compile(r"\{\{(\w+)\}\}")

def _render_template(content: str, lead: dict) -> str:
    if not content:
        return ""
    def _replacer(match: re.Match) -> str:
        var_name = match.group(1)
        field_name = VARIABLE_TO_FIELD.get(var_name, var_name)
        value = lead.get(field_name)
        return str(value) if value else ""
    return VARIABLE_PATTERN.sub(_replacer, content)


class EmailWorker:
    def __init__(self):
        self.is_running = False
        self._task = None

    def start(self):
        if not self.is_running:
            self.is_running = True
            self._task = asyncio.create_task(self.run())
            logger.info("Email Automation Worker started")

    async def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            logger.info("Email Automation Worker stopped")

    async def run(self):
        watchdog_counter = 0
        while self.is_running and not shutdown_event.is_set():
            try:
                watchdog_counter += 2
                if watchdog_counter >= 30:
                    watchdog_counter = 0
                    await emit_heartbeat("email_worker")
                await self._process_next_job()
            except Exception as e:
                logger.error(f"Error in Email Worker: {e}")
            await asyncio.sleep(2)  # Poll interval

    async def _process_next_job(self):
        db = get_db()
        if db is None: return

        active_campaigns = await db["email_campaigns"].find(
            {"status": {"$in": [EmailCampaignStatus.QUEUED.value, EmailCampaignStatus.RUNNING.value]}}
        ).to_list(length=100)

        if not active_campaigns: return

        active_campaign_ids = [c["_id"] for c in active_campaigns]

        # Process one message at a time to prevent blocking and allow granular websocket updates
        now = datetime.utcnow()
        log = await db["email_message_logs"].find_one_and_update(
            {
                "campaign_id": {"$in": [str(cid) for cid in active_campaign_ids]},
                "$or": [
                    {"status": EmailMessageStatus.PENDING.value},
                    {"status": EmailMessageStatus.RETRYING.value, "next_retry_at": {"$lte": now}}
                ]
            },
            {
                "$set": {
                    "status": EmailMessageStatus.PREPARING.value,
                    "updated_at": now
                }
            },
            return_document=True
        )

        if not log:
            # Check for completed campaigns
            for c_id in active_campaign_ids:
                c_id_str = str(c_id)
                pending_count = await db["email_message_logs"].count_documents({
                    "campaign_id": c_id_str,
                    "status": {"$in": [
                        EmailMessageStatus.PENDING.value,
                        EmailMessageStatus.PREPARING.value,
                        EmailMessageStatus.CONNECTING_SMTP.value,
                        EmailMessageStatus.PERSONALIZING.value,
                        EmailMessageStatus.SENDING.value,
                        EmailMessageStatus.RETRYING.value
                    ]}
                })
                if pending_count == 0:
                    await db["email_campaigns"].update_one(
                        {"_id": c_id},
                        {"$set": {
                            "status": EmailCampaignStatus.COMPLETED.value,
                            "completed_at": datetime.utcnow()
                        }}
                    )
                    await db["email_campaign_history"].insert_one({
                        "campaign_id": c_id_str,
                        "campaign_name": next(c["name"] for c in active_campaigns if c["_id"] == c_id),
                        "user_id": str(active_campaigns[0]["user_id"]),
                        "action": "COMPLETED",
                        "details": "Campaign completed all emails.",
                        "created_at": datetime.utcnow()
                    })
                    logger.info(f"Email Campaign {c_id_str} marked as COMPLETED")
                    # Broadcast completion
                    try:
                        await manager.broadcast({
                            "type": "EMAIL_UPDATE",
                            "campaign_id": c_id_str,
                            "action": "COMPLETED"
                        })
                    except Exception as e:
                        logger.error(f"Failed to broadcast email completion: {e}")
            return

        campaign_id_str = log["campaign_id"]
        campaign = next(c for c in active_campaigns if str(c["_id"]) == campaign_id_str)

        # Mark campaign RUNNING
        if campaign["status"] == EmailCampaignStatus.QUEUED.value:
            await db["email_campaigns"].update_one(
                {"_id": campaign["_id"]},
                {"$set": {"status": EmailCampaignStatus.RUNNING.value}}
            )

        async def broadcast_status(stage: str, details: str = ""):
            try:
                await manager.broadcast({
                    "type": "EMAIL_UPDATE",
                    "campaign_id": campaign_id_str,
                    "log_id": str(log["_id"]),
                    "lead_id": log["lead_id"],
                    "lead_name": log.get("lead_name"),
                    "email": log.get("recipient_email"),
                    "stage": stage,
                    "details": details
                })
            except Exception as e:
                logger.error(f"Failed to broadcast email status: {e}")
            await db["email_message_logs"].update_one(
                {"_id": log["_id"]},
                {"$set": {"status": stage, "updated_at": datetime.utcnow()}}
            )

        try:
            await broadcast_status(EmailMessageStatus.PERSONALIZING.value, "Personalizing template...")
            template = await db["email_templates"].find_one({"_id": ObjectId(campaign["template_id"])})
            if not template: raise Exception("Template not found")

            lead = await db["leads"].find_one({"_id": ObjectId(log["lead_id"])})
            if not lead: lead = {}

            subject = _render_template(template.get("subject", ""), lead)
            html_content = _render_template(template.get("html_content", ""), lead)

            # Store rendered content
            await db["email_message_logs"].update_one(
                {"_id": log["_id"]},
                {"$set": {"rendered_subject": subject, "rendered_html": html_content}}
            )

            await broadcast_status(EmailMessageStatus.CONNECTING_SMTP.value, "Connecting to SMTP...")
            
            settings = await db["settings"].find_one({"user_id": str(campaign["user_id"])})
            if not settings or not settings.get("smtp_host"):
                raise Exception("SMTP configuration missing or incomplete")

            smtp_host = settings.get("smtp_host")
            smtp_port = settings.get("smtp_port", 587)
            smtp_user = settings.get("smtp_user")
            smtp_pass = decrypt_string(settings.get("smtp_pass", ""))
            smtp_enc = settings.get("smtp_encryption", "TLS")
            smtp_sender = settings.get("smtp_sender_name", "")
            smtp_reply_to = settings.get("smtp_reply_to", "")
            smtp_from = settings.get("smtp_from_email", smtp_user)

            await broadcast_status(EmailMessageStatus.SENDING.value, "Sending email...")

            # Run SMTP in a thread to avoid blocking asyncio loop
            def send_smtp():
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"{smtp_sender} <{smtp_from}>" if smtp_sender else smtp_from
                msg["To"] = log["recipient_email"]
                if smtp_reply_to:
                    msg.add_header('reply-to', smtp_reply_to)

                part = MIMEText(html_content, "html")
                msg.attach(part)

                if smtp_enc == "SSL":
                    server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10)
                else:
                    server = smtplib.SMTP(smtp_host, smtp_port, timeout=10)
                    if smtp_enc == "TLS":
                        server.starttls()
                
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
                server.quit()

            await asyncio.to_thread(send_smtp)

            await broadcast_status(EmailMessageStatus.SENT.value, "Email delivered to SMTP server")
            
            await db["email_message_logs"].update_one(
                {"_id": log["_id"]},
                {"$set": {"sent_at": datetime.utcnow()}}
            )
            
            await db["email_campaigns"].update_one(
                {"_id": campaign["_id"]},
                {"$inc": {"sent_count": 1}}
            )

        except Exception as e:
            error_msg = str(e)
            retry_count = log.get("retry_count", 0) + 1
            
            if retry_count >= MAX_RETRIES:
                await broadcast_status(EmailMessageStatus.FAILED.value, f"Permanent failure: {error_msg}")
                await db["email_message_logs"].update_one(
                    {"_id": log["_id"]},
                    {"$set": {"error_message": error_msg}}
                )
                await db["email_campaigns"].update_one(
                    {"_id": campaign["_id"]},
                    {"$inc": {"failed_count": 1}}
                )
            else:
                backoff_seconds = (2 ** retry_count) * 60 # 2m, 4m, 8m
                next_retry = datetime.utcnow() + timedelta(seconds=backoff_seconds)
                await broadcast_status(EmailMessageStatus.RETRYING.value, f"Failed, retrying at {next_retry.strftime('%H:%M:%S')}")
                await db["email_message_logs"].update_one(
                    {"_id": log["_id"]},
                    {"$set": {
                        "error_message": error_msg,
                        "retry_count": retry_count,
                        "next_retry_at": next_retry
                    }}
                )

email_worker_instance = EmailWorker()
