import asyncio


import os
import re
import urllib.parse
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
try:
    import pyautogui
except Exception as _pyautogui_err:
    pyautogui = None
import pyperclip
from bson import ObjectId
from app.core.websocket import manager as ws_manager
from app.core.websocket import WebSocketEventType

from app.core.logger import logger

class WADesktopQueueWorker:
    """
    Automates the installed Windows 11 WhatsApp Desktop application without browser tools.
    Uses 'whatsapp://send' protocol and simulates native keyboard inputs.
    """
    
    def __init__(self, db):
        self.db = db
        self.is_running = False
        self.active_campaign_id = None
        
        # Configure pyautogui safety features
        if pyautogui:
            try:
                pyautogui.FAILSAFE = False
                pyautogui.PAUSE = 0.1
            except Exception:
                pass

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        logger.info("[WADesktopQueueWorker] Started")
        asyncio.create_task(self._main_loop())

    def stop(self):
        self.is_running = False
        logger.info("[WADesktopQueueWorker] Stopping")

    async def _main_loop(self):
        while self.is_running:
            try:
                await self._process_campaigns()
                await asyncio.sleep(3)
            except Exception as e:
                logger.error(f"[WADesktopQueueWorker] Error in main loop: {e}")
                await asyncio.sleep(5)

    def _replace_variables(self, text: str, lead: dict) -> str:
        """Replace {{tags}} in the template with lead data."""
        result = text
        mapping = {
            "business_name": lead.get("business_name", ""),
            "owner_name": lead.get("owner_name", ""),
            "phone": lead.get("phone", ""),
            "email": lead.get("email", ""),
            "website": lead.get("website", ""),
            "city": lead.get("city", ""),
            "state": lead.get("state", ""),
            "country": lead.get("country", ""),
            "industry": lead.get("industry", ""),
            "address": lead.get("address", ""),
            "ai_score": str(lead.get("ai_score", ""))
        }
        for key, value in mapping.items():
            pattern = re.compile(rf"\{{\{{\s*{key}\s*\}}\}}", re.IGNORECASE)
            result = pattern.sub(str(value) if value else "", result)
        return result

    def _validate_phone(self, phone: str) -> Optional[str]:
        """Strip non-digits and validate length."""
        if not phone:
            return None
        cleaned = re.sub(r'\D', '', phone)
        if len(cleaned) < 10:
            return None
        return cleaned

    async def _process_campaigns(self):
        # Look for running campaigns
        campaign = await self.db["wa_ai_campaigns"].find_one({
            "status": "RUNNING"
        })
        
        if not campaign:
            return

        self.active_campaign_id = campaign["_id"]
        template_id = campaign.get("template_id")
        template = await self.db["wa_ai_templates"].find_one({"_id": ObjectId(template_id)})
        
        if not template:
            await self._update_campaign_status(campaign["_id"], "FAILED", error="Template not found")
            return

        template_content = template.get("content", "")
        leads_processed = campaign.get("leads_processed", [])
        target_leads = campaign.get("target_leads", [])
        
        for lead_id in target_leads:
            # Check for pause/cancel between leads
            current_campaign = await self.db["wa_ai_campaigns"].find_one({"_id": campaign["_id"]})
            if current_campaign.get("status") != "RUNNING":
                logger.info(f"[WADesktopQueueWorker] Campaign {campaign['_id']} paused or stopped")
                return

            if lead_id in leads_processed:
                continue

            lead = await self.db["leads"].find_one({"_id": ObjectId(lead_id)})
            if not lead:
                await self._mark_lead_processed(campaign["_id"], lead_id, "skipped", "Lead not found")
                continue

            # Ensure ai_score is mapped for variables
            if "ai_analysis" in lead and "ai_score" in lead["ai_analysis"]:
                lead["ai_score"] = lead["ai_analysis"]["ai_score"]

            phone = lead.get("whatsapp_number") or lead.get("phone")
            valid_phone = self._validate_phone(phone)
            
            if not valid_phone:
                await self._mark_lead_processed(campaign["_id"], lead_id, "skipped", "Invalid or missing phone")
                continue

            message = self._replace_variables(template_content, lead)
            
            # Update current message in campaign for Live UI
            await self.db["wa_ai_campaigns"].update_one(
                {"_id": campaign["_id"]},
                {"$set": {"current_message": message}}
            )

            await ws_manager.broadcast_to_job(
                str(campaign["_id"]),
                {
                    "type": WebSocketEventType.WA_LEAD_OPENING.value,
                    "campaign_id": str(campaign["_id"]),
                    "lead_id": lead_id,
                    "business_name": lead.get("business_name"),
                    "phone": valid_phone,
                    "message": message,
                    "step": "opening"
                }
            )
            
            start_time = datetime.now(timezone.utc)
            
            try:
                # Add typing event before send
                await ws_manager.broadcast_to_job(
                    str(campaign["_id"]),
                    {
                        "type": WebSocketEventType.WA_LEAD_TYPING.value,
                        "campaign_id": str(campaign["_id"]),
                        "lead_id": lead_id,
                        "step": "typing"
                    }
                )
                success = await self._send_whatsapp_desktop(valid_phone, message)
                end_time = datetime.now(timezone.utc)
                duration = (end_time - start_time).total_seconds()
                
                if success:
                    await self._mark_lead_processed(campaign["_id"], lead_id, "sent", duration=duration)
                else:
                    await self._mark_lead_processed(campaign["_id"], lead_id, "failed", error="Desktop automation failed", duration=duration)
            except Exception as e:
                end_time = datetime.now(timezone.utc)
                duration = (end_time - start_time).total_seconds()
                logger.error(f"[WADesktopQueueWorker] Error sending to {valid_phone}: {e}")
                await self._mark_lead_processed(campaign["_id"], lead_id, "failed", error=str(e), duration=duration)
                
            # Clear current message after processing
            await self.db["wa_ai_campaigns"].update_one(
                {"_id": campaign["_id"]},
                {"$unset": {"current_message": ""}}
            )
            
            # Configurable Delay (hardcoded to 3 seconds for now, could be dynamic)
            await asyncio.sleep(3.0)

        # Re-fetch campaign to see if all leads are done
        final_campaign = await self.db["wa_ai_campaigns"].find_one({"_id": campaign["_id"]})
        if len(final_campaign.get("leads_processed", [])) >= len(target_leads):
            await self._update_campaign_status(campaign["_id"], "COMPLETED")

    async def _send_whatsapp_desktop(self, phone: str, message: str) -> bool:
        """Execute the native Windows workflow."""
        try:
            # Step 1: Open WhatsApp Desktop via URL Protocol
            # Using only the phone ensures the app opens to the chat.
            # (Passing text via URL sometimes fails on new numbers, we will paste it instead)
            wa_url = f"whatsapp://send?phone={phone}"
            is_web = False
            try:
                os.startfile(wa_url)
            except (FileNotFoundError, OSError):
                # Fallback to web.whatsapp.com if WhatsApp Desktop is not found
                import webbrowser
                logger.info(f"[WADesktopQueueWorker] WhatsApp Desktop not found, falling back to web.whatsapp.com for {phone}")
                webbrowser.open(f"https://web.whatsapp.com/send?phone={phone}")
                is_web = True
            
            # Step 2: Wait for WhatsApp Desktop/Web to open and focus (Human Delay)
            # Web takes significantly longer to load than the Desktop app
            await asyncio.sleep(12.0 if is_web else 4.0)
            
            # Step 3: Copy message to clipboard to bypass typing errors
            pyperclip.copy(message)
            
            # Step 4: Paste and Send
            pyautogui.hotkey('ctrl', 'v')
            await asyncio.sleep(0.5)
            pyautogui.press('enter')
            
            return True
        except Exception as e:
            logger.error(f"WhatsApp Desktop Automation Error: {e}")
            return False

    async def _mark_lead_processed(self, campaign_id, lead_id: str, status: str, error: str = None, duration: float = 0.0):
        """Update the campaign logs with the processed lead."""
        log_entry = {
            "lead_id": lead_id,
            "status": status,
            "processed_at": datetime.now(timezone.utc),
            "duration": duration
        }
        if error:
            log_entry["error"] = error
            
        await self.db["wa_ai_campaigns"].update_one(
            {"_id": campaign_id},
            {
                "$push": {"leads_processed": lead_id, "logs": log_entry}
            }
        )
        
        # Broadcast the result
        event_type = WebSocketEventType.WA_LEAD_SENT.value if status == "sent" else \
                     WebSocketEventType.WA_LEAD_FAILED.value if status == "failed" else \
                     WebSocketEventType.WA_LEAD_SKIPPED.value
                     
        await ws_manager.broadcast_to_job(
            str(campaign_id),
            {
                "type": event_type,
                "campaign_id": str(campaign_id),
                "lead_id": lead_id,
                "status": status,
                "error": error,
                "duration": duration,
                "processed_at": log_entry["processed_at"].isoformat()
            }
        )

    async def _update_campaign_status(self, campaign_id, status: str, error: str = None):
        update = {"status": status, "updated_at": datetime.now(timezone.utc)}
        if status == "COMPLETED":
            update["completed_at"] = datetime.now(timezone.utc)
        if error:
            update["error"] = error
            
        await self.db["wa_ai_campaigns"].update_one(
            {"_id": campaign_id},
            {"$set": update}
        )
