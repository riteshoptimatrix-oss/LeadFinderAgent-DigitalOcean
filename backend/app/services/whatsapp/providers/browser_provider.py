from typing import Optional
from app.core.logger import logger
from .base_provider import BaseWhatsAppProvider
from app.services.whatsapp.browser_automation import WhatsAppAutomation


class BrowserConnectionError(Exception):
    """Raised when browser connection fails"""
    pass


class BrowserLaunchError(Exception):
    """Raised when browser fails to launch"""
    pass


class QRTimeoutError(Exception):
    """Raised when QR code is not scanned within timeout"""
    pass


class BrowserWhatsAppProvider(BaseWhatsAppProvider):
    """
    Implementation for WhatsApp Web Browser Automation using Playwright.
    Handles real browser automation for sending WhatsApp messages.
    """
    
    def __init__(self, settings: dict, campaign_id: str = None):
        super().__init__(settings)
        self.automation: Optional[WhatsAppAutomation] = None
        self.headless = settings.get("wa_browser_headless", True)
        self.user_data_dir = settings.get("wa_browser_profile_dir")
        self.campaign_id = campaign_id
        self.last_error: Optional[str] = None
    
    async def validate_configuration(self) -> tuple[bool, str]:
        """
        Validate browser provider configuration and test connection.
        
        This now ACTUALLY launches the browser and validates the connection.
        Returns (False, error_message) if browser fails to launch.
        """
        try:
            logger.info(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] Validating configuration by launching browser...")
            
            # Try to establish connection (launches browser)
            await self.ensure_connection()
            
            logger.info(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] Configuration validated successfully")
            return True, ""
            
        except BrowserLaunchError as e:
            error_msg = f"Browser launch failed: {str(e)}"
            logger.error(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] {error_msg}")
            self.last_error = error_msg
            return False, error_msg
            
        except QRTimeoutError as e:
            error_msg = f"QR code not scanned: {str(e)}"
            logger.error(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] {error_msg}")
            self.last_error = error_msg
            return False, error_msg
            
        except Exception as e:
            error_msg = f"Unexpected error during validation: {str(e)}"
            logger.error(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] {error_msg}")
            self.last_error = error_msg
            return False, error_msg
        
    async def is_ready(self) -> bool:
        """Check if browser is ready and logged in."""
        if self.automation and self.automation.is_logged_in:
            return True
        return False
        
    async def ensure_connection(self) -> bool:
        """
        Ensure browser is started and WhatsApp Web is connected.
        
        Raises exceptions instead of silently returning False.
        This allows proper error handling up the call stack.
        """
        # Already connected
        if await self.is_ready():
            logger.debug(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] Browser already connected")
            return True
        
        # Start new automation session
        logger.info(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] Starting new browser automation session...")
        
        try:
            self.automation = WhatsAppAutomation(
                user_data_dir=self.user_data_dir,
                headless=self.headless,
                campaign_id=self.campaign_id
            )
            
            # Attempt to start browser
            started = await self.automation.start()
            
            if not started:
                error_msg = "Browser failed to start (check Playwright installation and browser availability)"
                logger.error(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] {error_msg}")
                self.last_error = error_msg
                raise BrowserLaunchError(error_msg)
            
            logger.info(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] Browser launched successfully")
            
            # Check login status
            if not self.automation.is_logged_in:
                logger.warning(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] QR code scan required - waiting up to 2 minutes...")
                
                # Wait for QR scan
                logged_in = await self.automation.wait_for_login(timeout=120)
                
                if not logged_in:
                    error_msg = "QR code not scanned within 2 minutes"
                    logger.error(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] {error_msg}")
                    self.last_error = error_msg
                    raise QRTimeoutError(error_msg)
                
                logger.info(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] QR code scanned successfully")
            else:
                logger.info(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] Session restored from previous login")
            
            return True
            
        except (BrowserLaunchError, QRTimeoutError):
            # Re-raise known errors
            raise
            
        except Exception as e:
            error_msg = f"Unexpected error during browser connection: {str(e)}"
            logger.error(f"[BrowserWhatsAppProvider] [Campaign:{self.campaign_id}] {error_msg}")
            self.last_error = error_msg
            raise BrowserConnectionError(error_msg) from e
    
    async def send_message(self, phone: str, text: str, metadata: dict = None) -> bool:
        """
        Send WhatsApp message using browser automation
        
        Args:
            phone: Phone number in E.164 format
            text: Message content
            metadata: Contains Lead ID, Business Name, etc. for logging
        
        Returns: True if sent successfully, False otherwise
        """
        try:
            # Ensure browser is connected
            if not await self.ensure_connection():
                logger.error("[BrowserWhatsAppProvider] Failed to connect to WhatsApp Web")
                return False
            
            # Send message
            result = await self.automation.send_message(phone, text, metadata)
            
            if result.get("success"):
                logger.info(f"[BrowserWhatsAppProvider] Successfully sent message to {phone}")
                return True
            else:
                logger.error(f"[BrowserWhatsAppProvider] Failed to send message: {result.get('error')}")
                return False
                
        except Exception as e:
            logger.error(f"[BrowserWhatsAppProvider] Exception: {str(e)}")
            return False
    
    async def close(self):
        """Close browser automation session"""
        if self.automation:
            await self.automation.close()
            self.automation = None
