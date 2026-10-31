"""
WhatsApp Cloud Service
Direct integration with the official Meta WhatsApp Business Cloud API (v21.0).
Provides credential validation, message delivery, template management, and webhook handling.
"""
import os
import re
import httpx
from typing import Dict, Any, Optional, Tuple, List
from app.core.logger import logger
from app.services.whatsapp.phone_validator import PhoneValidator


GRAPH_API_VERSION = "v21.0"
GRAPH_API_BASE_URL = f"https://graph.facebook.com/{GRAPH_API_VERSION}"


class WhatsAppCloudService:
    """Official Meta WhatsApp Business Cloud API Client."""

    def __init__(self, token: Optional[str] = None, phone_number_id: Optional[str] = None, waba_id: Optional[str] = None):
        self.token = token
        self.phone_number_id = phone_number_id
        self.waba_id = waba_id

    @staticmethod
    def clean_recipient_phone(phone: str, default_country: str = "IN") -> Optional[str]:
        """
        Normalize phone number to E.164 and return digits only (required by Meta Cloud API).
        Meta format: country code + national number without leading '+' or symbols.
        Example: "+91 98765 43210" -> "919876543210"
        """
        if not phone:
            return None
        normalized = PhoneValidator.normalize_phone(phone, default_country=default_country)
        if not normalized:
            # Fallback: strip all non-digits
            digits = re.sub(r'\D', '', phone)
            if len(digits) >= 10:
                return digits
            return None
        return normalized.lstrip('+')

    @classmethod
    async def get_credentials(cls, db, user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Resolve WhatsApp Cloud API credentials in hierarchical order:
        1. User-specific settings document in `settings` collection
        2. Any global admin settings in `settings` collection
        3. Environment variables (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, etc.)
        """
        token: Optional[str] = None
        phone_number_id: Optional[str] = None
        waba_id: Optional[str] = None
        verify_token: Optional[str] = None

        if db is not None:
            # 1. Try finding user settings
            query = {"user_id": user_id} if user_id else {}
            settings_doc = await db["settings"].find_one(query)
            
            # If not found or missing fields, try finding any settings doc with credentials
            if not settings_doc or not settings_doc.get("wa_official_token"):
                settings_doc = await db["settings"].find_one({"wa_official_token": {"$nin": [None, ""]}})

            if settings_doc:
                token = settings_doc.get("wa_official_token") or settings_doc.get("wa_api_key")
                phone_number_id = settings_doc.get("wa_phone_id")
                waba_id = settings_doc.get("wa_waba_id")
                verify_token = settings_doc.get("wa_webhook_verify_token")

            # Also check user doc if not found
            if not token and user_id:
                try:
                    from bson import ObjectId
                    user_doc = await db["users"].find_one({"_id": ObjectId(user_id)})
                    if user_doc and "whatsapp_settings" in user_doc:
                        wa_set = user_doc["whatsapp_settings"]
                        token = token or wa_set.get("api_key")
                        phone_number_id = phone_number_id or wa_set.get("phone_id")
                        waba_id = waba_id or wa_set.get("waba_id")
                except Exception:
                    pass

        # 3. Environment variables fallback
        token = token or os.environ.get("WHATSAPP_TOKEN") or os.environ.get("WA_OFFICIAL_TOKEN")
        phone_number_id = phone_number_id or os.environ.get("WHATSAPP_PHONE_NUMBER_ID") or os.environ.get("WA_PHONE_ID")
        waba_id = waba_id or os.environ.get("WHATSAPP_WABA_ID") or os.environ.get("WA_WABA_ID")
        verify_token = verify_token or os.environ.get("WHATSAPP_VERIFY_TOKEN") or os.environ.get("WA_VERIFY_TOKEN") or "leadfinder_verify_token"

        is_configured = bool(token and phone_number_id)

        return {
            "token": token,
            "phone_number_id": phone_number_id,
            "waba_id": waba_id,
            "verify_token": verify_token,
            "is_configured": is_configured,
            "masked_token": (token[:6] + "..." + token[-4:]) if (token and len(token) > 10) else (token or "")
        }

    async def verify_credentials(self, token: Optional[str] = None, phone_number_id: Optional[str] = None) -> Tuple[bool, Dict[str, Any], str]:
        """
        Validate credentials by pinging Meta Graph API endpoint:
        GET https://graph.facebook.com/v21.0/{phone_number_id}
        Returns: (is_valid, details_dict, error_message)
        """
        active_token = token or self.token
        active_phone_id = phone_number_id or self.phone_number_id

        if not active_token:
            return False, {}, "Missing Access Token"
        if not active_phone_id:
            return False, {}, "Missing Phone Number ID"

        url = f"{GRAPH_API_BASE_URL}/{active_phone_id}"
        headers = {
            "Authorization": f"Bearer {active_token}",
            "Accept": "application/json"
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers)
                data = resp.json()

                if resp.status_code == 200:
                    logger.info(f"[WhatsAppCloudService] Successfully verified phone_id {active_phone_id}: {data.get('display_phone_number')}")
                    return True, {
                        "verified_name": data.get("verified_name"),
                        "display_phone_number": data.get("display_phone_number"),
                        "quality_rating": data.get("quality_rating"),
                        "code_verification_status": data.get("code_verification_status"),
                        "id": data.get("id")
                    }, ""
                else:
                    error_detail = data.get("error", {}).get("message", resp.text)
                    error_code = data.get("error", {}).get("code", resp.status_code)
                    logger.error(f"[WhatsAppCloudService] Validation failed ({error_code}): {error_detail}")
                    return False, {}, f"Meta API Error ({error_code}): {error_detail}"
        except httpx.TimeoutException:
            return False, {}, "Connection timed out connecting to Meta Graph API"
        except Exception as e:
            logger.error(f"[WhatsAppCloudService] Exception verifying credentials: {e}")
            return False, {}, f"Connection error: {str(e)}"

    async def send_text_message(
        self,
        to_phone: str,
        message_text: str,
        token: Optional[str] = None,
        phone_number_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send a freeform or personalized text message via Meta WhatsApp Business Cloud API.
        POST https://graph.facebook.com/v21.0/{phone_number_id}/messages
        """
        active_token = token or self.token
        active_phone_id = phone_number_id or self.phone_number_id

        if not active_token or not active_phone_id:
            return {
                "success": False,
                "message_id": None,
                "error": "WhatsApp Cloud API credentials not configured",
                "status_code": 400
            }

        clean_to = self.clean_recipient_phone(to_phone)
        if not clean_to:
            return {
                "success": False,
                "message_id": None,
                "error": f"Invalid recipient phone format: '{to_phone}'",
                "status_code": 400
            }

        url = f"{GRAPH_API_BASE_URL}/{active_phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {active_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_to,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": message_text
            }
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                data = resp.json()

                if resp.status_code in [200, 201]:
                    messages = data.get("messages", [])
                    message_id = messages[0].get("id") if messages else None
                    logger.info(f"[WhatsAppCloudService] Sent message to {clean_to}, wamid: {message_id}")
                    return {
                        "success": True,
                        "message_id": message_id,
                        "error": None,
                        "status_code": resp.status_code,
                        "recipient": clean_to
                    }
                else:
                    error_info = data.get("error", {})
                    error_msg = error_info.get("message", resp.text)
                    error_code = error_info.get("code")
                    error_subcode = error_info.get("error_subcode")
                    fbtrace_id = error_info.get("fbtrace_id")
                    
                    # Provide user-friendly troubleshooting hints for common Meta errors
                    hint = ""
                    if error_code == 190:
                        hint = " (Access token expired or invalidated. Generate a permanent System User Token in Meta Business Suite.)"
                    elif error_code == 131030:
                        hint = " (Recipient not allowed. In Meta Cloud Sandbox mode, recipient phone must be added to Test Numbers in Meta Dashboard.)"
                    elif error_code == 131026:
                        hint = " (Message undeliverable. Outside 24h customer window or phone is not on WhatsApp.)"
                    elif error_code == 130429:
                        hint = " (Meta rate limit reached. Delaying send will resolve.)"

                    formatted_error = f"Meta Error {error_code}: {error_msg}{hint}"
                    logger.error(f"[WhatsAppCloudService] Send failure to {clean_to}: {formatted_error} [fbtrace: {fbtrace_id}]")
                    return {
                        "success": False,
                        "message_id": None,
                        "error": formatted_error,
                        "status_code": resp.status_code,
                        "recipient": clean_to
                    }
        except httpx.TimeoutException:
            return {
                "success": False,
                "message_id": None,
                "error": "Timeout contacting Meta WhatsApp API (15s)",
                "status_code": 504
            }
        except Exception as e:
            logger.error(f"[WhatsAppCloudService] Exception sending message to {clean_to}: {e}")
            return {
                "success": False,
                "message_id": None,
                "error": f"Network exception: {str(e)}",
                "status_code": 500
            }

    async def send_template_message(
        self,
        to_phone: str,
        template_name: str,
        language_code: str = "en_US",
        components: Optional[List[Dict[str, Any]]] = None,
        token: Optional[str] = None,
        phone_number_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send an approved Meta WhatsApp template message.
        """
        active_token = token or self.token
        active_phone_id = phone_number_id or self.phone_number_id

        if not active_token or not active_phone_id:
            return {
                "success": False,
                "message_id": None,
                "error": "WhatsApp Cloud API credentials not configured",
                "status_code": 400
            }

        clean_to = self.clean_recipient_phone(to_phone)
        if not clean_to:
            return {
                "success": False,
                "message_id": None,
                "error": f"Invalid recipient phone format: '{to_phone}'",
                "status_code": 400
            }

        url = f"{GRAPH_API_BASE_URL}/{active_phone_id}/messages"
        headers = {
            "Authorization": f"Bearer {active_token}",
            "Content-Type": "application/json"
        }
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_to,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language_code},
                "components": components or []
            }
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                data = resp.json()

                if resp.status_code in [200, 201]:
                    messages = data.get("messages", [])
                    message_id = messages[0].get("id") if messages else None
                    return {
                        "success": True,
                        "message_id": message_id,
                        "error": None,
                        "status_code": resp.status_code,
                        "recipient": clean_to
                    }
                else:
                    error_info = data.get("error", {})
                    error_msg = error_info.get("message", resp.text)
                    error_code = error_info.get("code")
                    return {
                        "success": False,
                        "message_id": None,
                        "error": f"Meta Error {error_code}: {error_msg}",
                        "status_code": resp.status_code,
                        "recipient": clean_to
                    }
        except Exception as e:
            return {
                "success": False,
                "message_id": None,
                "error": f"Network exception: {str(e)}",
                "status_code": 500
            }

    async def get_waba_templates(self, token: Optional[str] = None, waba_id: Optional[str] = None) -> Tuple[bool, List[Dict[str, Any]], str]:
        """
        Fetch approved message templates from WhatsApp Business Account.
        GET https://graph.facebook.com/v21.0/{waba_id}/message_templates
        """
        active_token = token or self.token
        active_waba = waba_id or self.waba_id

        if not active_token:
            return False, [], "Missing Access Token"
        if not active_waba:
            return False, [], "Missing WhatsApp Business Account ID (WABA ID)"

        url = f"{GRAPH_API_BASE_URL}/{active_waba}/message_templates?limit=100"
        headers = {
            "Authorization": f"Bearer {active_token}",
            "Accept": "application/json"
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, headers=headers)
                data = resp.json()
                if resp.status_code == 200:
                    templates = data.get("data", [])
                    return True, templates, ""
                else:
                    err = data.get("error", {}).get("message", resp.text)
                    return False, [], f"Failed to fetch templates: {err}"
        except Exception as e:
            return False, [], f"Exception fetching templates: {str(e)}"
