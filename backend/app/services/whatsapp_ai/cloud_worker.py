"""
WhatsApp AI Cloud Queue Worker
Enterprise background worker utilizing the official Meta WhatsApp Business Cloud API.
Provides automatic retry logic, phone number validation, template variable replacement,
real-time WebSocket progress broadcasts, and recipient-level status logging.
"""
import asyncio
import random
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from bson import ObjectId

from app.core.logger import logger
from app.core.websocket import manager as ws_manager
from app.core.websocket import WebSocketEventType
from app.services.whatsapp.whatsapp_cloud_service import WhatsAppCloudService
from app.services.whatsapp.phone_validator import PhoneValidator


class WAAICloudWorker:
    """
    Queue worker executing WhatsApp bulk campaigns via the official Meta Cloud API.
    Zero dependency on desktop automation or pyautogui.
    """

    def __init__(self, db):
        self.db = db
        self.is_running = False
        self.active_campaign_id = None
        self.service = WhatsAppCloudService()

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        logger.info("[WAAICloudWorker] Started Meta WhatsApp Cloud Queue Worker")
        asyncio.create_task(self._main_loop())

    def stop(self):
        self.is_running = False
        logger.info("[WAAICloudWorker] Stopping Meta WhatsApp Cloud Queue Worker")

    async def _main_loop(self):
        while self.is_running:
            try:
                await self._process_campaigns()
                await asyncio.sleep(2.5)
            except Exception as e:
                logger.error(f"[WAAICloudWorker] Error in main loop: {e}", exc_info=True)
                await asyncio.sleep(5.0)

    def _replace_variables(self, text: str, lead: dict) -> str:
        """Replace {{tags}} in template with lead data, providing safe fallbacks."""
        result = text
        business_name = lead.get("business_name") or lead.get("company_name") or lead.get("name") or "there"
        owner_name = lead.get("owner_name") or lead.get("contact_name") or "there"
        city = lead.get("city") or lead.get("address") or "your area"
        website = lead.get("website") or ""
        email = lead.get("email") or ""
        phone = lead.get("phone") or lead.get("whatsapp_number") or ""
        category = lead.get("category") or lead.get("industry") or "your industry"
        ai_score = str(lead.get("ai_score") or lead.get("ai_analysis", {}).get("ai_score", ""))

        mapping = {
            "business_name": business_name,
            "company_name": business_name,
            "contact_name": owner_name,
            "owner_name": owner_name,
            "name": owner_name,
            "city": city,
            "state": lead.get("state") or "",
            "country": lead.get("country") or "",
            "website": website,
            "email": email,
            "phone": phone,
            "industry": category,
            "category": category,
            "address": lead.get("address") or "",
            "ai_score": ai_score
        }

        for key, value in mapping.items():
            pattern = re.compile(rf"\{{\{{\s*{key}\s*\}}\}}", re.IGNORECASE)
            result = pattern.sub(str(value) if value else "", result)
        
        # Clean any remaining unmatched {{...}} tags with empty string
        result = re.sub(r"\{\{[^}]+\}\}", "", result)
        return result.strip()

    async def _process_campaigns(self):
        # Find active running campaigns
        campaign = await self.db["wa_ai_campaigns"].find_one({
            "status": "RUNNING"
        })

        if not campaign:
            return

        campaign_id = campaign["_id"]
        self.active_campaign_id = campaign_id

        # 1. Resolve and validate WhatsApp Cloud credentials
        creds = await WhatsAppCloudService.get_credentials(self.db, campaign.get("user_id"))
        if not creds.get("is_configured"):
            error_msg = "WhatsApp Cloud API credentials not configured. Please enter your Meta Access Token and Phone Number ID."
            logger.warning(f"[WAAICloudWorker] Campaign {campaign_id} aborted: {error_msg}")
            await self._update_campaign_status(campaign_id, "FAILED", error=error_msg)
            await ws_manager.broadcast_to_job(
                str(campaign_id),
                {
                    "type": WebSocketEventType.WA_CAMPAIGN_FAILED.value,
                    "campaign_id": str(campaign_id),
                    "error": error_msg
                }
            )
            return

        token = creds["token"]
        phone_number_id = creds["phone_number_id"]

        # 2. Resolve template
        template_id = campaign.get("template_id")
        template = None
        if template_id:
            try:
                template = await self.db["wa_ai_templates"].find_one({"_id": ObjectId(template_id)})
            except Exception:
                template = await self.db["wa_ai_templates"].find_one({"_id": template_id})

        if not template:
            error_msg = f"Template '{template_id}' not found"
            await self._update_campaign_status(campaign_id, "FAILED", error=error_msg)
            return

        template_content = template.get("content", "")
        leads_processed = set(campaign.get("leads_processed", []))
        target_leads = campaign.get("target_leads", [])
        retry_limit = int(campaign.get("retry_count") or 0)
        base_delay = float(campaign.get("optional_delay") or 3.0)
        is_random_delay = bool(campaign.get("random_delay", False))

        logger.info(f"[WAAICloudWorker] Processing Campaign '{campaign.get('name')}' ({campaign_id}) - {len(target_leads)} leads")

        for lead_id in target_leads:
            # Check if campaign was paused, cancelled, or deleted mid-run
            current_campaign = await self.db["wa_ai_campaigns"].find_one({"_id": campaign_id})
            if not current_campaign or current_campaign.get("status") != "RUNNING":
                logger.info(f"[WAAICloudWorker] Campaign {campaign_id} status changed to {current_campaign.get('status') if current_campaign else 'DELETED'}. Halting run.")
                return

            if lead_id in leads_processed:
                continue

            lead_obj_id = None
            try:
                lead_obj_id = ObjectId(lead_id)
            except Exception:
                pass

            lead = None
            if lead_obj_id:
                lead = await self.db["leads"].find_one({"_id": lead_obj_id})
            if not lead:
                lead = await self.db["leads"].find_one({"_id": lead_id})

            if not lead:
                await self._record_recipient_result(
                    campaign_id=campaign_id,
                    lead_id=lead_id,
                    phone="",
                    business_name="Unknown",
                    status="skipped",
                    error="Lead record not found in database"
                )
                leads_processed.add(lead_id)
                continue

            business_name = lead.get("business_name") or lead.get("company_name") or lead.get("name") or "Business"

            # Check Opt-out & Blacklist
            if lead.get("whatsapp_opted_out") is True or lead.get("blacklisted") is True:
                await self._record_recipient_result(
                    campaign_id=campaign_id,
                    lead_id=lead_id,
                    phone=lead.get("phone") or "",
                    business_name=business_name,
                    status="skipped",
                    error="Lead has opted out of WhatsApp messages"
                )
                leads_processed.add(lead_id)
                continue

            # Extract phone & clean for Meta Cloud API
            raw_phone = (
                lead.get("whatsapp_number") or
                lead.get("phone") or
                lead.get("primary_phone") or
                (lead.get("contact_discovery", {}).get("primary_phone") if isinstance(lead.get("contact_discovery"), dict) else None)
            )
            cleaned_phone = WhatsAppCloudService.clean_recipient_phone(raw_phone)

            if not cleaned_phone:
                await self._record_recipient_result(
                    campaign_id=campaign_id,
                    lead_id=lead_id,
                    phone=raw_phone or "",
                    business_name=business_name,
                    status="skipped",
                    error="Invalid or missing phone number format"
                )
                leads_processed.add(lead_id)
                continue

            # Render personalized message
            personalized_text = self._replace_variables(template_content, lead)

            # Update live state
            await self.db["wa_ai_campaigns"].update_one(
                {"_id": campaign_id},
                {"$set": {"current_message": personalized_text}}
            )

            # Broadcast sending event
            await ws_manager.broadcast_to_job(
                str(campaign_id),
                {
                    "type": WebSocketEventType.WA_LEAD_SENDING.value,
                    "campaign_id": str(campaign_id),
                    "lead_id": lead_id,
                    "business_name": business_name,
                    "phone": f"+{cleaned_phone}",
                    "message": personalized_text,
                    "step": "sending"
                }
            )

            # Dispatch via Meta WhatsApp Cloud API with retry logic
            start_time = datetime.now(timezone.utc)
            attempts = 0
            max_attempts = max(1, 1 + retry_limit)
            last_error = ""
            send_success = False
            meta_message_id = None

            while attempts < max_attempts and not send_success:
                attempts += 1
                try:
                    result = await self.service.send_text_message(
                        to_phone=cleaned_phone,
                        message_text=personalized_text,
                        token=token,
                        phone_number_id=phone_number_id
                    )

                    if result.get("success"):
                        send_success = True
                        meta_message_id = result.get("message_id")
                        break
                    else:
                        last_error = result.get("error") or "Unknown Meta API error"
                        # Rate limit or transient error backoff
                        if attempts < max_attempts:
                            backoff = min(10.0, attempts * 2.0)
                            logger.info(f"[WAAICloudWorker] Retrying lead {lead_id} (attempt {attempts}/{max_attempts}) in {backoff}s...")
                            await asyncio.sleep(backoff)
                except Exception as ex:
                    last_error = str(ex)
                    if attempts < max_attempts:
                        await asyncio.sleep(2.0)

            end_time = datetime.now(timezone.utc)
            duration = round((end_time - start_time).total_seconds(), 2)

            if send_success:
                await self._record_recipient_result(
                    campaign_id=campaign_id,
                    lead_id=lead_id,
                    phone=f"+{cleaned_phone}",
                    business_name=business_name,
                    status="sent",
                    meta_message_id=meta_message_id,
                    duration=duration
                )
            else:
                await self._record_recipient_result(
                    campaign_id=campaign_id,
                    lead_id=lead_id,
                    phone=f"+{cleaned_phone}",
                    business_name=business_name,
                    status="failed",
                    error=last_error,
                    duration=duration
                )

            leads_processed.add(lead_id)

            # Apply configurable pacing delay between sends
            sleep_duration = base_delay
            if is_random_delay:
                sleep_duration += random.uniform(1.0, 4.0)
            await asyncio.sleep(sleep_duration)

        # Clear current message and check completion
        await self.db["wa_ai_campaigns"].update_one(
            {"_id": campaign_id},
            {"$unset": {"current_message": ""}}
        )

        final_campaign = await self.db["wa_ai_campaigns"].find_one({"_id": campaign_id})
        if final_campaign and len(final_campaign.get("leads_processed", [])) >= len(target_leads):
            await self._update_campaign_status(campaign_id, "COMPLETED")
            await ws_manager.broadcast_to_job(
                str(campaign_id),
                {
                    "type": WebSocketEventType.WA_CAMPAIGN_COMPLETED.value,
                    "campaign_id": str(campaign_id),
                    "total": len(target_leads)
                }
            )
            logger.info(f"[WAAICloudWorker] Campaign {campaign_id} COMPLETED successfully.")

    async def _record_recipient_result(
        self,
        campaign_id,
        lead_id: str,
        phone: str,
        business_name: str,
        status: str,
        meta_message_id: Optional[str] = None,
        error: Optional[str] = None,
        duration: float = 0.0
    ):
        """Record recipient status in both wa_ai_recipients and campaign logs."""
        now = datetime.now(timezone.utc)
        log_entry = {
            "lead_id": lead_id,
            "phone": phone,
            "business_name": business_name,
            "status": status,
            "meta_message_id": meta_message_id,
            "duration": duration,
            "processed_at": now.isoformat()
        }
        if error:
            log_entry["error"] = error

        # 1. Update Campaign Document
        await self.db["wa_ai_campaigns"].update_one(
            {"_id": campaign_id},
            {
                "$addToSet": {"leads_processed": lead_id},
                "$push": {"logs": log_entry}
            }
        )

        # 2. Upsert in wa_ai_recipients collection for fast querying & webhook matching
        recipient_doc = {
            "campaign_id": str(campaign_id),
            "lead_id": lead_id,
            "phone": phone,
            "business_name": business_name,
            "status": status,
            "meta_message_id": meta_message_id,
            "error": error,
            "duration": duration,
            "updated_at": now
        }
        await self.db["wa_ai_recipients"].update_one(
            {"campaign_id": str(campaign_id), "lead_id": lead_id},
            {"$set": recipient_doc, "$setOnInsert": {"created_at": now}},
            upsert=True
        )

        # 3. Broadcast real-time event to connected UI clients
        event_type = (
            WebSocketEventType.WA_LEAD_SENT.value if status == "sent" else
            WebSocketEventType.WA_LEAD_FAILED.value if status == "failed" else
            WebSocketEventType.WA_LEAD_SKIPPED.value
        )
        await ws_manager.broadcast_to_job(
            str(campaign_id),
            {
                "type": event_type,
                "campaign_id": str(campaign_id),
                "lead_id": lead_id,
                "phone": phone,
                "business_name": business_name,
                "status": status,
                "meta_message_id": meta_message_id,
                "error": error,
                "duration": duration,
                "processed_at": now.isoformat()
            }
        )

    async def _update_campaign_status(self, campaign_id, status: str, error: Optional[str] = None):
        update = {"status": status, "updated_at": datetime.now(timezone.utc)}
        if status == "COMPLETED":
            update["completed_at"] = datetime.now(timezone.utc)
        if error:
            update["error"] = error

        await self.db["wa_ai_campaigns"].update_one(
            {"_id": campaign_id},
            {"$set": update}
        )
