import re
import time
import asyncio
from datetime import datetime
from bson import ObjectId
from datetime import datetime
from app.db.database import get_db
from app.services.worker_manager import log_job_event
from app.core.logger import logger

MAX_RETRIES = 3

# Map template variable names → lead document fields
VARIABLE_TO_FIELD = {
    "business_name": "name",
    "owner": "name",
    "city": "city",
    "website": "website",
    "phone": "phone",
    "category": "category",
}
VARIABLE_PATTERN = re.compile(r"\{\{(\w+)\}\}")


def _render_template(content: str, lead: dict) -> str:
    """Replace {{variable}} placeholders with lead data."""
    def _replacer(match: re.Match) -> str:
        var_name = match.group(1)
        field_name = VARIABLE_TO_FIELD.get(var_name, var_name)
        value = lead.get(field_name)
        return str(value) if value else ""
    return VARIABLE_PATTERN.sub(_replacer, content)


async def process_wa_queue():
    """Background task to process QUEUED WA messages with comprehensive error handling."""
    from app.core.logger import logger
    
    try:
        db = get_db()
    except Exception as e:
        logger.error(f"WA_QUEUE_DB_ERROR: Database connection failed: {str(e)}")
        return

    job_start_time = time.time()
    processed_count = 0
    error_count = 0
    
    try:
        logger.info("WA_QUEUE_START: Processing WhatsApp message queue")
        
        # Find active campaigns with connection validation
        try:
            cursor = db["wa_campaigns"].find({"status": "RUNNING"})
            active_campaigns = await cursor.to_list(length=None)
        except Exception as e:
            logger.error(f"WA_QUEUE_CAMPAIGNS_ERROR: Failed to fetch active campaigns: {str(e)}")
            return

        if not active_campaigns:
            logger.debug("WA_QUEUE_NO_CAMPAIGNS: No active campaigns found")
            return

        active_campaign_ids = [str(c["_id"]) for c in active_campaigns]

        # Find queued or retryable message logs with timeout protection
        try:
            queued_logs = await asyncio.wait_for(
                db["wa_message_logs"].find({
                    "$or": [
                        {"status": "QUEUED"},
                        {"status": "FAILED", "retry_count": {"$lt": MAX_RETRIES}},
                    ],
                    "campaign_id": {"$in": active_campaign_ids},
                }).limit(50).to_list(length=None),
                timeout=30.0
            )
        except asyncio.TimeoutError:
            logger.error("WA_QUEUE_TIMEOUT: Message log query timed out")
            return
        except Exception as e:
            logger.error(f"WA_QUEUE_LOGS_ERROR: Failed to fetch message logs: {str(e)}")
            return

        if not queued_logs:
            logger.debug("WA_QUEUE_NO_MESSAGES: No queued messages found")
            return

        logger.info(f"WA_QUEUE_PROCESSING: Found {len(queued_logs)} messages to process")

        # Preload user WA configs with error handling
        user_ids = list(set([log["user_id"] for log in queued_logs]))
        wa_configs = {}
        
        try:
            settings_cursor = await db["user_settings"].find(
                {"user_id": {"$in": user_ids}}
            ).to_list(length=None)
            wa_configs = {s["user_id"]: s for s in settings_cursor}
        except Exception as e:
            logger.error(f"WA_QUEUE_CONFIGS_ERROR: Failed to fetch user configs: {str(e)}")

        # Preload templates with error handling
        template_ids = list(set([c.get("template_id", "") for c in active_campaigns if c.get("template_id")]))
        valid_template_oids = [ObjectId(tid) for tid in template_ids if ObjectId.is_valid(tid)]
        templates = {}
        
        try:
            templates_cursor = await db["wa_templates"].find(
                {"_id": {"$in": valid_template_oids}}
            ).to_list(length=None)
            templates = {str(t["_id"]): t for t in templates_cursor}
        except Exception as e:
            logger.error(f"WA_QUEUE_TEMPLATES_ERROR: Failed to fetch templates: {str(e)}")

        # Process messages with individual error handling
        for log in queued_logs:
            log_id_str = str(log["_id"])
            
            try:
                campaign = next(
                    (c for c in active_campaigns if str(c["_id"]) == log["campaign_id"]),
                    None,
                )
                if not campaign:
                    logger.warning(f"WA_QUEUE_CAMPAIGN_MISSING: Campaign {log['campaign_id']} not found")
                    continue

                # Get rendered message from log (pre-rendered at campaign creation)
                body = log.get("rendered_message")

                # If no pre-rendered message, render now with error handling
                if not body:
                    template = templates.get(campaign.get("template_id", ""))
                    if not template:
                        raise Exception(f"Template {campaign.get('template_id')} not found")

                    try:
                        lead = await db["leads"].find_one({"_id": ObjectId(log["lead_id"])})
                        if not lead:
                            raise Exception(f"Lead {log['lead_id']} not found")

                        body = _render_template(template["content"], lead)
                    except Exception as e:
                        raise Exception(f"Template rendering failed: {str(e)}")

                wa_config = wa_configs.get(log["user_id"])
                if not wa_config:
                    raise Exception(f"WA configuration missing for user {log['user_id']}")

                # Send the message with timeout protection
                try:
                    await asyncio.wait_for(
                        asyncio.to_thread(send_wa_message, wa_config, to_phone=log["recipient_phone"], body=body),
                        timeout=10.0
                    )
                except asyncio.TimeoutError:
                    raise Exception("WhatsApp send operation timed out")

                # Mark as SENT with error handling
                try:
                    await db["wa_message_logs"].update_one(
                        {"_id": log["_id"]},
                        {"$set": {"status": "SENT", "sent_at": datetime.utcnow()}},
                    )

                    # Increment sent count on campaign
                    await db["wa_campaigns"].update_one(
                        {"_id": ObjectId(campaign["_id"])},
                        {"$inc": {"sent_count": 1}},
                    )

                    await log_job_event(
                        "WA_QUEUE", "INFO",
                        f"Successfully sent WA to {log['recipient_phone']}",
                        log_id_str,
                    )
                    
                    processed_count += 1
                    
                except Exception as db_error:
                    logger.error(f"WA_QUEUE_DB_UPDATE_ERROR: Failed to update message status: {str(db_error)}")
                    # Message was sent but DB update failed - log for manual review
                    await log_job_event(
                        "WA_QUEUE", "WARNING",
                        f"Message sent but DB update failed for {log['recipient_phone']}: {str(db_error)}",
                        log_id_str,
                    )

            except Exception as e:
                error_count += 1
                error_msg = str(e)
                retry_count = log.get("retry_count", 0) + 1

                logger.warning(f"WA_QUEUE_MESSAGE_ERROR: Error processing message {log_id_str}: {error_msg}")

                try:
                    if retry_count >= MAX_RETRIES:
                        await db["wa_message_logs"].update_one(
                            {"_id": log["_id"]},
                            {"$set": {
                                "status": "FAILED",
                                "error_message": f"Fatal: {error_msg}",
                                "retry_count": retry_count,
                                "sent_at": datetime.utcnow(),
                            }},
                        )
                        # Increment failed count on campaign
                        await db["wa_campaigns"].update_one(
                            {"_id": ObjectId(log["campaign_id"])},
                            {"$inc": {"failed_count": 1}},
                        )
                        await log_job_event(
                            "WA_QUEUE", "ERROR",
                            f"Max retries reached for {log['recipient_phone']}: {error_msg}",
                            log_id_str,
                        )
                    else:
                        await db["wa_message_logs"].update_one(
                            {"_id": log["_id"]},
                            {"$set": {
                                "status": "FAILED",
                                "error_message": error_msg,
                                "retry_count": retry_count,
                            }},
                        )
                        await log_job_event(
                            "WA_QUEUE", "WARNING",
                            f"Retry {retry_count}/{MAX_RETRIES} for {log['recipient_phone']}: {error_msg}",
                            log_id_str,
                        )
                except Exception as db_error:
                    logger.error(f"WA_QUEUE_ERROR_UPDATE_FAILED: Could not update error status: {str(db_error)}")

        # Check if any campaigns are now complete with error handling
        try:
            for campaign in active_campaigns:
                cid = str(campaign["_id"])
                
                try:
                    remaining = await db["wa_message_logs"].count_documents({
                        "campaign_id": cid,
                        "status": {"$in": ["QUEUED"]},
                    })
                    retryable = await db["wa_message_logs"].count_documents({
                        "campaign_id": cid,
                        "status": "FAILED",
                        "retry_count": {"$lt": MAX_RETRIES},
                    })
                    
                    if remaining == 0 and retryable == 0:
                        await db["wa_campaigns"].update_one(
                            {"_id": campaign["_id"]},
                            {"$set": {
                                "status": "COMPLETED",
                                "completed_at": datetime.utcnow(),
                            }},
                        )
                        await log_job_event(
                            "WA_QUEUE", "INFO",
                            f"Campaign '{campaign.get('name', cid)}' completed",
                            cid,
                        )
                        
                except Exception as campaign_error:
                    logger.error(f"WA_QUEUE_CAMPAIGN_CHECK_ERROR: Failed to check campaign {cid}: {str(campaign_error)}")
                    
        except Exception as e:
            logger.error(f"WA_QUEUE_COMPLETION_CHECK_ERROR: Failed to check campaign completions: {str(e)}")

        # Log job completion statistics
        job_duration = time.time() - job_start_time
        logger.info(f"WA_QUEUE_COMPLETE: Processed {processed_count} messages, {error_count} errors in {job_duration:.2f}s")

    except Exception as e:
        logger.error(f"WA_QUEUE_CRITICAL_ERROR: Unhandled error in WhatsApp queue processing: {str(e)}")
        import traceback
        logger.error(f"WA_QUEUE_TRACEBACK: {traceback.format_exc()}")
        
        # Record critical error for monitoring
        try:
            await log_job_event(
                "WA_QUEUE", "CRITICAL",
                f"Queue processing failed with critical error: {str(e)}",
                None,
                {"error_type": type(e).__name__, "traceback": traceback.format_exc()}
            )
        except Exception:
            pass  # Avoid recursive errors in error logging


def send_wa_message(config, to_phone: str, body: str):
    """Send WhatsApp message using the provider system."""
    import asyncio
    from app.services.whatsapp.providers.provider_factory import WAProviderFactory
    
    provider = WAProviderFactory.get_provider(config)
    
    async def _send():
        try:
            is_valid, error_msg = await provider.validate_configuration()
            if not is_valid:
                logger.error(f"WA_QUEUE_SEND_ERROR: Provider configuration invalid: {error_msg}")
                return False
            
            success = await provider.send_message(to_phone, body)
            if success:
                logger.info(f"WA_QUEUE_SEND_SUCCESS: Message sent to {to_phone}")
            else:
                logger.error(f"WA_QUEUE_SEND_FAILED: Provider returned failure for {to_phone}")
            return success
        except Exception as e:
            logger.error(f"WA_QUEUE_SEND_EXCEPTION: Error sending to {to_phone}: {str(e)}")
            return False
        finally:
            try:
                await provider.close()
            except Exception:
                pass
    
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, _send())
                return future.result(timeout=60)
        else:
            return loop.run_until_complete(_send())
    except Exception as e:
        logger.error(f"WA_QUEUE_SEND_CRITICAL: Failed to send to {to_phone}: {str(e)}")
        return False
