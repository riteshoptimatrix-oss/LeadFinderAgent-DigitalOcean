import asyncio
from datetime import datetime, timedelta
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.logger import logger
from app.models.campaign import CampaignStatus, CampaignType
from app.services.campaigns.template_parser import TemplateParser
from app.services.campaigns.provider_factory import ProviderFactory
from app.services.worker_manager import emit_heartbeat, shutdown_event

class CampaignQueueWorker:
    def __init__(self, db: AsyncIOMotorDatabase, batch_size: int = 10, concurrency: int = 5):
        self.db = db
        self.batch_size = batch_size
        self.concurrency = concurrency
        self.is_running = False

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        logger.info("Campaign Queue Worker started.")
        asyncio.create_task(self._loop())

    def stop(self):
        self.is_running = False
        logger.info("Campaign Queue Worker stopping...")

    async def _loop(self):
        watchdog_counter = 0
        while self.is_running and not shutdown_event.is_set():
            try:
                watchdog_counter += 2
                if watchdog_counter >= 30:
                    watchdog_counter = 0
                    await emit_heartbeat("campaign_queue_worker")
                    
                # 1. Check for scheduled campaigns that need to be queued
                await self._process_scheduled_campaigns()
                
                # 2. Process active queue items
                await self._process_queue()
                
                # Sleep to prevent high CPU usage
                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Error in CampaignQueueWorker: {str(e)}")
                await asyncio.sleep(5)

    async def _process_scheduled_campaigns(self):
        now = datetime.utcnow()
        # Find scheduled campaigns where scheduled_date <= now
        cursor = self.db["campaigns"].find({
            "status": CampaignStatus.SCHEDULED,
            "scheduled_date": {"$lte": now}
        })
        
        async for campaign in cursor:
            # Move to Queued status
            await self.db["campaigns"].update_one(
                {"_id": campaign["_id"]},
                {"$set": {"status": CampaignStatus.QUEUED, "started_at": now}}
            )
            await self._log(campaign["_id"], campaign["user_id"], "Campaign Started", "Scheduled campaign triggered and queued.")
            logger.info(f"Campaign {campaign['_id']} moved to QUEUED.")

    async def _process_queue(self):
        # Find active campaigns that are running or queued
        active_campaigns = await self.db["campaigns"].find({
            "status": {"$in": [CampaignStatus.QUEUED, CampaignStatus.RUNNING]}
        }).to_list(length=None)

        if not active_campaigns:
            return

        for campaign in active_campaigns:
            # Change status to running if it was queued
            if campaign["status"] == CampaignStatus.QUEUED:
                await self.db["campaigns"].update_one(
                    {"_id": campaign["_id"]},
                    {"$set": {"status": CampaignStatus.RUNNING}}
                )
                campaign["status"] = CampaignStatus.RUNNING
                await self._log(campaign["_id"], campaign["user_id"], "Campaign Running", "Began processing queue items.")

            # Fetch batch of pending items for this campaign
            now = datetime.utcnow()
            queue_items = await self.db["campaign_queue"].find({
                "campaign_id": str(campaign["_id"]),
                "$or": [
                    {"status": "Pending"},
                    {"status": "Retry", "next_attempt_at": {"$lte": now}}
                ]
            }).limit(self.batch_size).to_list(length=self.batch_size)

            if not queue_items:
                # No more pending items. Wait to see if all are truly processed (None in Retry/etc)
                remaining = await self.db["campaign_queue"].count_documents({
                    "campaign_id": str(campaign["_id"]),
                    "status": {"$in": ["Pending", "Retry"]}
                })
                if remaining == 0:
                    # Mark campaign completed
                    await self.db["campaigns"].update_one(
                        {"_id": campaign["_id"]},
                        {"$set": {"status": CampaignStatus.COMPLETED, "completed_at": datetime.utcnow()}}
                    )
                    await self._log(campaign["_id"], campaign["user_id"], "Campaign Completed", "All recipients processed successfully.")
                continue

            # Process items concurrently
            tasks = [self._process_single_item(item, campaign) for item in queue_items]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Tally successes and failures
            successes = sum(1 for r in results if r is True)
            failures = sum(1 for r in results if r is False)
            
            # Update campaign stats
            await self.db["campaigns"].update_one(
                {"_id": campaign["_id"]},
                {"$inc": {
                    "success_count": successes,
                    "failure_count": failures,
                    "pending_count": -(successes + failures)
                }}
            )

    async def _process_single_item(self, item: dict, campaign: dict) -> bool:
        lead_id = item["lead_id"]
        campaign_type = campaign["campaign_type"]
        
        try:
            # 1. Fetch Lead
            lead = await self.db["leads"].find_one({"_id": ObjectId(lead_id)})
            if not lead:
                raise ValueError(f"Lead {lead_id} not found in DB.")

            # 2. Fetch Template
            template = await self.db["campaign_templates"].find_one({"_id": ObjectId(campaign["template_id"])})
            if not template:
                raise ValueError("Template not found.")

            # 3. Parse content
            content = TemplateParser.parse(template["content"], lead)
            subject = TemplateParser.parse(template.get("subject", ""), lead) if template.get("subject") else ""
            
            # Determine target address based on campaign type
            target = lead.get("email") if campaign_type == CampaignType.EMAIL else lead.get("phone")
            
            if not target:
                raise ValueError(f"Lead missing required contact info for {campaign_type}")

            # 4. First log the intent to get a log_id for tracking
            log_id = await self._log(campaign["_id"], campaign["user_id"], "Queued", f"Attempting to send to {target}", lead_id)
            
            # 5. Execute via Provider
            provider = ProviderFactory.get_provider(campaign_type, self.db, campaign["user_id"])
            await provider.send(target, subject, content, track_log_id=log_id)
            
            # Mark Success
            await self.db["campaign_queue"].update_one(
                {"_id": item["_id"]},
                {"$set": {"status": "Success", "last_attempt_at": datetime.utcnow()}}
            )
            await self._log(campaign["_id"], campaign["user_id"], "Sent", f"Successfully sent to {target}", lead_id)
            return True

        except Exception as e:
            item_retries = item.get("retry_count", 0)
            if item_retries < 3:
                next_attempt = datetime.utcnow() + timedelta(minutes=2 ** item_retries)
                await self.db["campaign_queue"].update_one(
                    {"_id": item["_id"]},
                    {
                        "$set": {"status": "Retry", "error_message": str(e), "last_attempt_at": datetime.utcnow(), "next_attempt_at": next_attempt},
                        "$inc": {"retry_count": 1}
                    }
                )
                await self._log(campaign["_id"], campaign["user_id"], "Retry", f"Error: {str(e)}. Retrying at {next_attempt.isoformat()}", lead_id)
                return None
            else:
                await self.db["campaign_queue"].update_one(
                    {"_id": item["_id"]},
                    {"$set": {"status": "Failed", "error_message": str(e), "last_attempt_at": datetime.utcnow()}}
                )
                await self._log(campaign["_id"], campaign["user_id"], "Failed", f"Error: {str(e)}. Max retries reached.", lead_id)
                return False

    async def _log(self, campaign_id: str, user_id: str, action: str, message: str, lead_id: str = None) -> str:
        log_entry = {
            "campaign_id": str(campaign_id),
            "user_id": user_id,
            "lead_id": lead_id,
            "action": action,
            "message": message,
            "timestamp": datetime.utcnow()
        }
        res = await self.db["campaign_logs"].insert_one(log_entry)
        return str(res.inserted_id)
