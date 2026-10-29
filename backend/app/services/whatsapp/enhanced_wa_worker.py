"""
Enhanced WhatsApp Queue Worker
Production-grade worker with retry logic, error detection, and real-time progress tracking
"""
import asyncio
from datetime import datetime, timedelta
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Dict, Any

from app.core.logger import logger
from app.models.whatsapp import WACampaignStatus, WAMessageStatus
from app.services.campaigns.template_parser import TemplateParser
from app.services.whatsapp.providers.provider_factory import WAProviderFactory
from app.services.whatsapp.phone_validator import PhoneValidator
from app.services.ws_manager import ws_manager


class EnhancedWAQueueWorker:
    """
    Enhanced WhatsApp Queue Worker with production features:
    - Automatic retry (max 3 attempts)
    - Phone validation & formatting
    - Duplicate prevention
    - Real-time progress updates via WebSocket
    - Error detection and handling
    - Campaign controls (pause, resume, stop)
    """
    
    MAX_RETRIES = 3
    RETRY_DELAYS = [5, 15, 30]  # Seconds between retries
    
    def __init__(
        self,
        db: AsyncIOMotorDatabase,
        batch_size: int = 10,
        concurrency: int = 5,
        message_delay: float = 2.0
    ):
        """
        Initialize Enhanced WhatsApp Worker
        
        Args:
            db: MongoDB database instance
            batch_size: Number of messages to process per batch
            concurrency: Number of concurrent send operations
            message_delay: Delay between messages to avoid rate limiting (seconds)
        """
        self.db = db
        self.batch_size = batch_size
        self.concurrency = concurrency
        self.message_delay = message_delay
        self.is_running = False
        self._active_providers: Dict[str, Any] = {}
    
    async def start(self):
        """Start the queue worker"""
        if self.is_running:
            logger.warning("[EnhancedWAQueueWorker] Worker already running")
            return
        
        self.is_running = True
        logger.info("[EnhancedWAQueueWorker] Worker started")
        asyncio.create_task(self._main_loop())
    
    def stop(self):
        """Stop the queue worker"""
        self.is_running = False
        logger.info("[EnhancedWAQueueWorker] Worker stopping...")
    
    async def _main_loop(self):
        """Main processing loop"""
        while self.is_running:
            try:
                await self._process_campaigns()
                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"[EnhancedWAQueueWorker] Error in main loop: {str(e)}")
                await asyncio.sleep(5)
    
    async def _process_campaigns(self):
        """Process all active campaigns"""
        # Find campaigns that are RUNNING or QUEUED
        active_campaigns = await self.db["wa_campaigns"].find({
            "status": {"$in": [WACampaignStatus.RUNNING, WACampaignStatus.QUEUED]}
        }).to_list(length=None)
        
        if not active_campaigns:
            return
        
        for campaign in active_campaigns:
            try:
                # Update QUEUED to RUNNING
                if campaign["status"] == WACampaignStatus.QUEUED:
                    await self.db["wa_campaigns"].update_one(
                        {"_id": campaign["_id"]},
                        {
                            "$set": {
                                "status": WACampaignStatus.RUNNING,
                                "started_at": datetime.utcnow()
                            }
                        }
                    )
                    campaign["status"] = WACampaignStatus.RUNNING
                    await self._log_campaign_action(
                        campaign["_id"],
                        campaign["user_id"],
                        "STARTED",
                        "Campaign started processing"
                    )
                
                # Process messages for this campaign
                await self._process_campaign_messages(campaign)
                
            except Exception as e:
                logger.error(f"[EnhancedWAQueueWorker] Error processing campaign {campaign['_id']}: {str(e)}")
    
    async def _process_campaign_messages(self, campaign: dict):
        """Process pending messages for a campaign"""
        campaign_id = str(campaign["_id"])
        
        # Find pending or retry-eligible messages
        messages = await self.db["wa_message_logs"].find({
            "campaign_id": campaign_id,
            "$or": [
                {"status": WAMessageStatus.PENDING},
                {"status": WAMessageStatus.PREPARING},
                {
                    "status": WAMessageStatus.FAILED,
                    "retry_count": {"$lt": self.MAX_RETRIES},
                    "next_retry_at": {"$lte": datetime.utcnow()}
                }
            ]
        }).limit(self.batch_size).to_list(length=self.batch_size)
        
        if not messages:
            # Check if campaign is complete
            await self._check_campaign_completion(campaign)
            return
        
        # Get user settings for provider
        user_settings = await self.db["user_settings"].find_one({
            "user_id": campaign["user_id"]
        })
        user_settings = user_settings or {}
        
        # Validate Provider Configuration before processing messages
        provider = WAProviderFactory.get_provider(user_settings, campaign_id=campaign_id)
        try:
            is_valid, error_msg = await provider.validate_configuration()

            if not is_valid:
                logger.error(f"[EnhancedWAQueueWorker] Configuration invalid for campaign {campaign_id}: {error_msg}")
                # Update campaign to WAITING_CONFIGURATION
                await self.db["wa_campaigns"].update_one(
                    {"_id": ObjectId(campaign_id)},
                    {"$set": {"status": WACampaignStatus.WAITING_CONFIGURATION}}
                )
                await self._log_campaign_action(
                    ObjectId(campaign_id),
                    campaign["user_id"],
                    "PAUSED_CONFIGURATION",
                    f"Campaign paused due to invalid configuration: {error_msg}"
                )
                return

            # Process messages with concurrency control
            # BROWSER provider strictly requires concurrency of 1 to ensure UI state sync
            effective_concurrency = 1 if user_settings.get("wa_provider_type", "BROWSER") == "BROWSER" else self.concurrency
            semaphore = asyncio.Semaphore(effective_concurrency)

            tasks = []
            for message in messages:
                task = self._process_single_message(
                    message,
                    campaign,
                    user_settings,
                    provider,
                    semaphore
                )
                tasks.append(task)

            # Wait for all messages in batch
            await asyncio.gather(*tasks, return_exceptions=True)
        finally:
            try:
                await provider.close()
            except Exception as close_err:
                logger.warning(f"[EnhancedWAQueueWorker] Error closing provider for campaign {campaign_id}: {close_err}")
    
    async def _process_single_message(
        self,
        message: dict,
        campaign: dict,
        user_settings: dict,
        provider: Any,
        semaphore: asyncio.Semaphore
    ):
        """Process a single message send"""
        async with semaphore:
            message_id = message["_id"]
            lead_id = message["lead_id"]
            campaign_id = str(campaign["_id"])
            
            try:
                # Update status to PREPARING
                await self._update_message_status(
                    message_id,
                    WAMessageStatus.PREPARING,
                    campaign_id
                )
                
                # Get lead data
                lead = await self.db["leads"].find_one({"_id": ObjectId(lead_id)})
                if not lead:
                    await self._fail_message(
                        message_id,
                        campaign_id,
                        "Lead not found",
                        message.get("retry_count", 0)
                    )
                    return
                
                # Validate and normalize phone number
                phone = lead.get("phone")
                is_valid, error_msg = PhoneValidator.validate_phone(phone)
                
                if not is_valid:
                    await self._fail_message(
                        message_id,
                        campaign_id,
                        f"Invalid phone number: {error_msg}",
                        message.get("retry_count", 0)
                    )
                    return
                
                # Normalize phone to E.164 format
                normalized_phone = PhoneValidator.normalize_phone(
                    phone,
                    default_country=user_settings.get("default_country", "IN")
                )
                
                if not normalized_phone:
                    await self._fail_message(
                        message_id,
                        campaign_id,
                        "Failed to normalize phone number",
                        message.get("retry_count", 0)
                    )
                    return
                
                # Check for duplicate sends (unless retry)
                if message.get("status") != WAMessageStatus.FAILED:
                    duplicate = await self._check_duplicate_send(
                        campaign_id,
                        lead_id,
                        message_id
                    )
                    if duplicate:
                        await self._skip_message(
                            message_id,
                            campaign_id,
                            "Already sent to this lead"
                        )
                        return
                
                # Get or render message content
                content = message.get("rendered_message")
                
                if not content:
                    # Render template
                    template_id = campaign.get("template_id")
                    if not template_id or not ObjectId.is_valid(template_id):
                        await self._fail_message(
                            message_id,
                            campaign_id,
                            "Invalid template ID",
                            message.get("retry_count", 0)
                        )
                        return
                    
                    template = await self.db["wa_templates"].find_one({
                        "_id": ObjectId(template_id)
                    })
                    
                    if not template:
                        await self._fail_message(
                            message_id,
                            campaign_id,
                            "Template not found",
                            message.get("retry_count", 0)
                        )
                        return
                    
                    content = TemplateParser.parse(template["content"], lead)
                    
                    # Save rendered content
                    await self.db["wa_message_logs"].update_one(
                        {"_id": message_id},
                        {"$set": {"rendered_message": content}}
                    )
                
                # Update status to OPENING_WHATSAPP
                await self._update_message_status(
                    message_id,
                    WAMessageStatus.OPENING_WHATSAPP,
                    campaign_id
                )
                
                # Get provider and send message (already instantiated)
                # provider = WAProviderFactory.get_provider(user_settings)
                
                # Update status to SENDING
                await self._update_message_status(
                    message_id,
                    WAMessageStatus.SENDING,
                    campaign_id
                )
                
                # Send the message
                metadata = {
                    "lead_id": str(lead_id),
                    "business_name": lead.get("name", "Unknown"),
                    "campaign_id": campaign_id
                }
                success = await provider.send_message(normalized_phone, content, metadata=metadata)
                
                if success:
                    # Mark as SENT
                    await self._success_message(
                        message_id,
                        campaign_id,
                        normalized_phone,
                        content
                    )
                else:
                    # Retry logic
                    retry_count = message.get("retry_count", 0)
                    if retry_count < self.MAX_RETRIES:
                        await self._retry_message(
                            message_id,
                            campaign_id,
                            "Provider failed to send message",
                            retry_count
                        )
                    else:
                        await self._fail_message(
                            message_id,
                            campaign_id,
                            "Maximum retries exceeded",
                            retry_count
                        )
                
                # Delay between messages to avoid rate limiting
                await asyncio.sleep(self.message_delay)
                
            except Exception as e:
                logger.error(f"[EnhancedWAQueueWorker] Error processing message {message_id}: {str(e)}")
                retry_count = message.get("retry_count", 0)
                await self._retry_message(
                    message_id,
                    campaign_id,
                    str(e),
                    retry_count
                )
    
    async def _update_message_status(
        self,
        message_id: ObjectId,
        status: WAMessageStatus,
        campaign_id: str
    ):
        """Update message status and broadcast via WebSocket"""
        await self.db["wa_message_logs"].update_one(
            {"_id": message_id},
            {"$set": {"status": status, "updated_at": datetime.utcnow()}}
        )
        
        # Broadcast status update
        await ws_manager.broadcast_to_job(campaign_id, {
            "type": "message_status_update",
            "message_id": str(message_id),
            "status": status,
            "timestamp": datetime.utcnow().isoformat()
        })
    
    async def _success_message(
        self,
        message_id: ObjectId,
        campaign_id: str,
        phone: str,
        content: str
    ):
        """Mark message as successfully sent"""
        now = datetime.utcnow()
        
        await self.db["wa_message_logs"].update_one(
            {"_id": message_id},
            {
                "$set": {
                    "status": WAMessageStatus.SENT,
                    "sent_at": now,
                    "recipient_phone": phone,
                    "rendered_message": content,
                    "updated_at": now
                }
            }
        )
        
        # Increment campaign success count
        await self.db["wa_campaigns"].update_one(
            {"_id": ObjectId(campaign_id)},
            {"$inc": {"sent_count": 1}}
        )
        
        # Broadcast success
        await ws_manager.broadcast_to_job(campaign_id, {
            "type": "message_sent",
            "message_id": str(message_id),
            "phone": phone,
            "timestamp": now.isoformat()
        })
        
        logger.info(f"[EnhancedWAQueueWorker] Successfully sent message to {phone}")
    
    async def _fail_message(
        self,
        message_id: ObjectId,
        campaign_id: str,
        error: str,
        retry_count: int
    ):
        """Mark message as permanently failed"""
        now = datetime.utcnow()
        
        await self.db["wa_message_logs"].update_one(
            {"_id": message_id},
            {
                "$set": {
                    "status": WAMessageStatus.FAILED,
                    "error_message": error,
                    "retry_count": retry_count,
                    "updated_at": now
                }
            }
        )
        
        # Increment campaign failure count
        await self.db["wa_campaigns"].update_one(
            {"_id": ObjectId(campaign_id)},
            {"$inc": {"failed_count": 1}}
        )
        
        # Broadcast failure
        await ws_manager.broadcast_to_job(campaign_id, {
            "type": "message_failed",
            "message_id": str(message_id),
            "error": error,
            "timestamp": now.isoformat()
        })
        
        logger.error(f"[EnhancedWAQueueWorker] Message failed: {error}")
    
    async def _retry_message(
        self,
        message_id: ObjectId,
        campaign_id: str,
        error: str,
        retry_count: int
    ):
        """Schedule message for retry"""
        retry_count += 1
        
        # Calculate next retry time with exponential backoff
        delay_seconds = self.RETRY_DELAYS[min(retry_count - 1, len(self.RETRY_DELAYS) - 1)]
        next_retry = datetime.utcnow() + timedelta(seconds=delay_seconds)
        
        await self.db["wa_message_logs"].update_one(
            {"_id": message_id},
            {
                "$set": {
                    "status": WAMessageStatus.FAILED,
                    "error_message": error,
                    "retry_count": retry_count,
                    "next_retry_at": next_retry,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Broadcast retry scheduled
        await ws_manager.broadcast_to_job(campaign_id, {
            "type": "message_retry_scheduled",
            "message_id": str(message_id),
            "retry_count": retry_count,
            "next_retry_at": next_retry.isoformat(),
            "error": error,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        logger.warning(
            f"[EnhancedWAQueueWorker] Scheduling retry {retry_count}/{self.MAX_RETRIES} "
            f"in {delay_seconds}s: {error}"
        )
    
    async def _skip_message(
        self,
        message_id: ObjectId,
        campaign_id: str,
        reason: str
    ):
        """Skip message (e.g., duplicate)"""
        now = datetime.utcnow()
        
        await self.db["wa_message_logs"].update_one(
            {"_id": message_id},
            {
                "$set": {
                    "status": WAMessageStatus.SKIPPED,
                    "error_message": reason,
                    "updated_at": now
                }
            }
        )
        
        # Broadcast skip
        await ws_manager.broadcast_to_job(campaign_id, {
            "type": "message_skipped",
            "message_id": str(message_id),
            "reason": reason,
            "timestamp": now.isoformat()
        })
        
        logger.info(f"[EnhancedWAQueueWorker] Message skipped: {reason}")
    
    async def _check_duplicate_send(
        self,
        campaign_id: str,
        lead_id: str,
        current_message_id: ObjectId
    ) -> bool:
        """Check if message was already sent to this lead in this campaign"""
        existing = await self.db["wa_message_logs"].find_one({
            "campaign_id": campaign_id,
            "lead_id": lead_id,
            "status": WAMessageStatus.SENT,
            "_id": {"$ne": current_message_id}
        })
        
        return existing is not None
    
    async def _check_campaign_completion(self, campaign: dict):
        """Check if campaign is complete and update status"""
        campaign_id = str(campaign["_id"])
        
        # Count remaining messages
        pending_count = await self.db["wa_message_logs"].count_documents({
            "campaign_id": campaign_id,
            "status": {"$in": [
                WAMessageStatus.PENDING,
                WAMessageStatus.PREPARING,
                WAMessageStatus.OPENING_WHATSAPP,
                WAMessageStatus.SENDING
            ]}
        })
        
        # Count retry-eligible failed messages
        retry_count = await self.db["wa_message_logs"].count_documents({
            "campaign_id": campaign_id,
            "status": WAMessageStatus.FAILED,
            "retry_count": {"$lt": self.MAX_RETRIES}
        })
        
        if pending_count == 0 and retry_count == 0:
            # Campaign is complete
            await self.db["wa_campaigns"].update_one(
                {"_id": campaign["_id"]},
                {
                    "$set": {
                        "status": WACampaignStatus.COMPLETED,
                        "completed_at": datetime.utcnow()
                    }
                }
            )
            
            await self._log_campaign_action(
                campaign["_id"],
                campaign["user_id"],
                "COMPLETED",
                "Campaign completed"
            )
            
            # Get final stats
            stats = await self._get_campaign_stats(campaign_id)
            
            # Broadcast completion
            await ws_manager.broadcast_to_job(campaign_id, {
                "type": "campaign_completed",
                "campaign_id": campaign_id,
                "stats": stats,
                "timestamp": datetime.utcnow().isoformat()
            })
            
            logger.info(f"[EnhancedWAQueueWorker] Campaign {campaign_id} completed: {stats}")
    
    async def _get_campaign_stats(self, campaign_id: str) -> dict:
        """Get campaign statistics"""
        pipeline = [
            {"$match": {"campaign_id": campaign_id}},
            {
                "$group": {
                    "_id": "$status",
                    "count": {"$sum": 1}
                }
            }
        ]
        
        results = await self.db["wa_message_logs"].aggregate(pipeline).to_list(length=None)
        
        stats = {status: 0 for status in WAMessageStatus}
        for item in results:
            stats[item["_id"]] = item["count"]
        
        return stats
    
    async def _log_campaign_action(
        self,
        campaign_id: ObjectId,
        user_id: str,
        action: str,
        details: str
    ):
        """Log campaign action to history"""
        await self.db["wa_campaign_history"].insert_one({
            "campaign_id": str(campaign_id),
            "user_id": user_id,
            "action": action,
            "details": details,
            "created_at": datetime.utcnow()
        })
