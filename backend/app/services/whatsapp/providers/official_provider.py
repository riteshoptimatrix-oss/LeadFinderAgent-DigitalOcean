import httpx
from app.core.logger import logger
from .base_provider import BaseWhatsAppProvider

class OfficialWhatsAppProvider(BaseWhatsAppProvider):
    """
    Implementation for Meta Official WhatsApp Cloud API.
    Requires: Phone Number ID, Access Token.
    """
    async def validate_configuration(self) -> tuple[bool, str]:
        token = self.settings.get("wa_official_token")
        phone_id = self.settings.get("wa_phone_id")
        
        if not token:
            logger.error("[OfficialWhatsAppProvider] Configuration Missing: wa_official_token is required")
            return False, "Missing wa_official_token"
            
        if not phone_id:
            logger.error("[OfficialWhatsAppProvider] Configuration Missing: wa_phone_id is required")
            return False, "Missing wa_phone_id"
            
        # Optional: Validate reachability/token validity by making a lightweight API call
        # e.g. getting the phone number details.
        url = f"https://graph.facebook.com/v17.0/{phone_id}"
        headers = {
            "Authorization": f"Bearer {token}",
        }
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=headers, timeout=5.0)
                if resp.status_code == 200:
                    logger.info("[OfficialWhatsAppProvider] Configuration Loaded and Validated")
                    return True, ""
                else:
                    error_msg = f"API Validation Failed: {resp.status_code} - {resp.text}"
                    logger.error(f"[OfficialWhatsAppProvider] Token Invalid or API unreachable: {error_msg}")
                    return False, error_msg
        except Exception as e:
            import traceback
            error_msg = f"Validation Exception: {str(e)}"
            logger.error(f"[OfficialWhatsAppProvider] Provider Connection Error: {error_msg}\n{traceback.format_exc()}")
            return False, error_msg

    async def is_ready(self) -> bool:
        is_valid, _ = await self.validate_configuration()
        if is_valid:
            logger.info("[OfficialWhatsAppProvider] Provider Ready")
        return is_valid

    async def send_message(self, phone: str, text: str, metadata: dict = None) -> bool:
        token = self.settings.get("wa_official_token")
        phone_id = self.settings.get("wa_phone_id")
        
        if not token or not phone_id:
            logger.error("[OfficialWhatsAppProvider] Missing configuration: wa_official_token and wa_phone_id are required")
            return False
            
        logger.info(f"[OfficialWhatsAppProvider] Message Sending to {phone}")
        url = f"https://graph.facebook.com/v17.0/{phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "to": phone,
            "type": "text",
            "text": {"body": text}
        }
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, headers=headers, json=payload, timeout=10.0)
                if resp.status_code in [200, 201]:
                    logger.info(f"[OfficialWhatsAppProvider] Delivery Success to {phone}")
                    return True
                else:
                    logger.error(f"[OfficialWhatsAppProvider] API Response Error: {resp.text}")
                    return False
        except Exception as e:
            import traceback
            logger.error(f"[OfficialWhatsAppProvider] Exception sending message: {str(e)}\n{traceback.format_exc()}")
            return False
