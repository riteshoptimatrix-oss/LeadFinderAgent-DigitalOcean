import asyncio
from datetime import datetime, timedelta
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.core.logger import logger
from app.models.whatsapp import WACampaignStatus
from app.services.campaigns.template_parser import TemplateParser
from app.services.whatsapp.providers.provider_factory import WAProviderFactory
from app.services.worker_manager import emit_heartbeat, shutdown_event

class WAQueueWorker:
    def __init__(self, db: AsyncIOMotorDatabase, batch_size: int = 10, concurrency: int = 5):
        self.db = db
        self.batch_size = batch_size
        self.concurrency = concurrency
        self.is_running = False

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        logger.info("WhatsApp Queue Worker started.")
        asyncio.create_task(self._loop())

    def stop(self):
        self.is_running = False
        logger.info("WhatsApp Queue Worker stopping...")

    async def _loop(self):
        watchdog_counter = 0
        while self.is_running and not shutdown_event.is_set():
            try:
                now = datetime.utcnow()
                watchdog_counter += 2
                if watchdog_counter >= 30:
                    watchdog_counter = 0
                    await emit_heartbeat("wa_worker")
                    
                # 1. Start scheduled
                cursor = self.db["whatsapp_campaigns"].find({
                    "status": WACampaignStatus.SCHEDULED,
                    "scheduled_date": {"$lte": now}
                })
                async for campaign in cursor:
                    await self.db["whatsapp_campaigns"].update_one(
                        {"_id": campaign["_id"]},
                        {"$set": {"status": WACampaignStatus.QUEUED, "started_at": now}}
                    )
                    await self._log(campaign["_id"], campaign["user_id"], "Queued", "Campaign started based on schedule.")

                # 2. Process active
                active_campaigns = await self.db["whatsapp_campaigns"].find({
                    "status": {"$in": [WACampaignStatus.QUEUED, WACampaignStatus.RUNNING]}
                }).to_list(length=None)

                for campaign in active_campaigns:
                    if campaign["status"] == WACampaignStatus.QUEUED:
                        await self.db["whatsapp_campaigns"].update_one(
                            {"_id": campaign["_id"]},
                            {"$set": {"status": WACampaignStatus.RUNNING}}
                        )
                        campaign["status"] = WACampaignStatus.RUNNING
                        await self._log(campaign["_id"], campaign["user_id"], "Running", "Campaign is now running.")

                    queue_items = await self.db["whatsapp_queue"].find({
                        "campaign_id": str(campaign["_id"]),
                        "$or": [
                            {"status": "Pending"},
                            {"status": "Retry", "next_attempt_at": {"$lte": now}}
                        ]
                    }).limit(self.batch_size).to_list(length=self.batch_size)

                    if not queue_items:
                        remaining = await self.db["whatsapp_queue"].count_documents({
                            "campaign_id": str(campaign["_id"]),
                            "status": {"$in": ["Pending", "Retry"]}
                        })
                        if remaining == 0:
                            await self.db["whatsapp_campaigns"].update_one(
                                {"_id": campaign["_id"]},
                                {"$set": {"status": WACampaignStatus.COMPLETED, "completed_at": datetime.utcnow()}}
                            )
                            await self._log(campaign["_id"], campaign["user_id"], "Completed", "All messages processed.")
                        continue

                    settings = await self.db["user_settings"].find_one({"user_id": campaign["user_id"]})
                    
                    tasks = [self._process_message(item, campaign, settings) for item in queue_items]
                    results = await asyncio.gather(*tasks, return_exceptions=True)
                    
                    successes = sum(1 for r in results if r is True)
                    failures = sum(1 for r in results if r is False)
                    
                    await self.db["whatsapp_campaigns"].update_one(
                        {"_id": campaign["_id"]},
                        {"$inc": {
                            "success_count": successes,
                            "failure_count": failures,
                            "pending_count": -(successes + failures)
                        }}
                    )

                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Error in WAQueueWorker loop: {str(e)}")
                await asyncio.sleep(5)

    def _evaluate_rules(self, lead: dict, rules: list) -> str:
        """
        Evaluates rules sequentially. Returns the first matched template_id, or None if no match.
        """
        for rule in rules:
            all_conditions_met = True
            for cond in rule.get("conditions", []):
                field = cond.get("field")
                op = cond.get("operator")
                val = cond.get("value")
                
                lead_val = lead.get(field)
                
                if op == "exists":
                    if not lead_val:
                        all_conditions_met = False
                elif op == "missing":
                    if lead_val:
                        all_conditions_met = False
                elif op == "==":
                    if str(lead_val).lower() != str(val).lower():
                        all_conditions_met = False
                elif op == "!=":
                    if str(lead_val).lower() == str(val).lower():
                        all_conditions_met = False
                elif op in [">", "<"]:
                    try:
                        fv = float(lead_val)
                        cv = float(val)
                        if op == ">" and not (fv > cv):
                            all_conditions_met = False
                        if op == "<" and not (fv < cv):
                            all_conditions_met = False
                    except Exception:
                        all_conditions_met = False
                
            if all_conditions_met:
                return rule.get("template_id")
                
        return None

    async def _process_message(self, item: dict, campaign: dict, settings: dict) -> bool:
        lead_id = item["lead_id"]
        try:
            lead = await self.db["leads"].find_one({"_id": ObjectId(lead_id)})
            if not lead:
                raise ValueError("Lead not found.")
                
            # Fetch Rules from DB
            rule_ids = campaign.get("rule_ids", [])
            rules = []
            if rule_ids:
                rules = await self.db["whatsapp_rules"].find({"_id": {"$in": [ObjectId(rid) for rid in rule_ids]}}).to_list(length=None)
                
            # Rule Engine Selection
            matched_template_id = self._evaluate_rules(lead, rules)
            final_template_id = matched_template_id if matched_template_id else campaign.get("default_template_id")
            
            template = await self.db["whatsapp_templates"].find_one({"_id": ObjectId(final_template_id)})
            if not template:
                raise ValueError(f"Template {final_template_id} not found.")
                
            # Parse template variables
            content = TemplateParser.parse(template["content"], lead)
            
            # Send using ProviderFactory
            provider = WAProviderFactory.get_provider(settings or {})
            success = await provider.send_message(item["normalized_phone"], content)
            
            if success:
                await self.db["whatsapp_queue"].update_one(
                    {"_id": item["_id"]},
                    {"$set": {"status": "Success", "last_attempt_at": datetime.utcnow()}}
                )
                await self._log(campaign["_id"], campaign["user_id"], "Sent", f"Sent WA to {item['normalized_phone']}", lead_id, final_template_id)
                return True
            else:
                raise ValueError("Provider failed to send message.")
            
        except Exception as e:
            item_retries = item.get("retry_count", 0)
            if item_retries < 3:
                next_attempt = datetime.utcnow() + timedelta(minutes=2 ** item_retries)
                await self.db["whatsapp_queue"].update_one(
                    {"_id": item["_id"]},
                    {
                        "$set": {"status": "Retry", "error_message": str(e), "last_attempt_at": datetime.utcnow(), "next_attempt_at": next_attempt},
                        "$inc": {"retry_count": 1}
                    }
                )
                await self._log(campaign["_id"], campaign["user_id"], "Retry", f"Error: {str(e)}. Retrying at {next_attempt.isoformat()}", lead_id)
                return None
            else:
                await self.db["whatsapp_queue"].update_one(
                    {"_id": item["_id"]},
                    {"$set": {"status": "Failed", "error_message": str(e), "last_attempt_at": datetime.utcnow()}}
                )
                await self._log(campaign["_id"], campaign["user_id"], "Failed", f"Error: {str(e)}. Max retries reached.", lead_id)
                return False

    async def _log(self, campaign_id: str, user_id: str, action: str, message: str, lead_id: str = None, template_id: str = None):
        await self.db["whatsapp_logs"].insert_one({
            "campaign_id": str(campaign_id),
            "user_id": user_id,
            "lead_id": lead_id,
            "template_id": template_id,
            "action": action,
            "message": message,
            "timestamp": datetime.utcnow()
        })
