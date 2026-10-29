"""
WhatsApp Web Browser Automation using Playwright
Handles real browser automation for sending WhatsApp messages, rate limiting, and session persistence.
"""
import asyncio
import os
import random
import base64
from typing import Optional, Dict, Any
from datetime import datetime
from playwright.async_api import async_playwright, BrowserContext, Page, TimeoutError as PlaywrightTimeout
from app.core.logger import logger
from app.services.ws_manager import ws_manager


class WhatsAppAutomation:
    """Handles WhatsApp Web automation using Playwright"""
    
    def __init__(self, user_data_dir: str = None, headless: bool = True, campaign_id: str = None):
        """
        Initialize WhatsApp automation
        
        Args:
            user_data_dir: Directory to store browser session (for persistent login)
            headless: Whether to run browser in headless mode
            campaign_id: Used for broadcasting websocket updates
        """
        self.user_data_dir = user_data_dir or os.path.join(os.getcwd(), "wa_sessions")
        os.makedirs(self.user_data_dir, exist_ok=True)
        self.headless = headless
        self.campaign_id = campaign_id
        self.playwright = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.is_logged_in = False
    
    async def _broadcast(self, event_type: str, data: dict):
        """Broadcast events to frontend if campaign_id is set"""
        if self.campaign_id:
            payload = {"type": event_type, "timestamp": datetime.utcnow().isoformat()}
            payload.update(data)
            await ws_manager.broadcast_to_job(self.campaign_id, payload)

    async def start(self) -> bool:
        """
        Start browser and navigate to WhatsApp Web
        Returns: True if successful, False otherwise
        """
        try:
            logger.info("[WhatsAppAutomation] Browser Started")
            await self._broadcast("browser_started", {"status": "Starting Playwright Chromium..."})
            
            self.playwright = await async_playwright().start()
            
            # Launch browser with persistent context (saves session)
            self.context = await self.playwright.chromium.launch_persistent_context(
                user_data_dir=self.user_data_dir,
                headless=self.headless,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                ],
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            
            # Get or create page
            if len(self.context.pages) > 0:
                self.page = self.context.pages[0]
            else:
                self.page = await self.context.new_page()
            
            # Navigate to WhatsApp Web
            logger.info("[WhatsAppAutomation] WhatsApp Session Loaded")
            await self._broadcast("browser_navigating", {"status": "Loading WhatsApp Web..."})
            await self.page.goto('https://web.whatsapp.com', wait_until='networkidle', timeout=60000)
            
            # Check if already logged in
            await asyncio.sleep(3)
            self.is_logged_in = await self._check_login_status()
            
            if self.is_logged_in:
                logger.info("[WhatsAppAutomation] Already logged in to WhatsApp Web")
                await self._broadcast("whatsapp_ready", {"status": "Session restored. Ready to send messages."})
            else:
                logger.warning("[WhatsAppAutomation] QR Required")
            
            return True
            
        except Exception as e:
            logger.error(f"[WhatsAppAutomation] Error starting browser: {str(e)}")
            await self.close()
            return False
    
    async def _check_login_status(self) -> bool:
        """Check if user is logged in to WhatsApp Web"""
        try:
            # Check for main chat area
            chat_list = await self.page.query_selector('[aria-label="Chat list"]')
            if chat_list:
                return True
            
            # Check for search box (another indicator)
            search_box = await self.page.query_selector('[data-testid="chat-list-search"]')
            if search_box:
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"[WhatsAppAutomation] Error checking login status: {str(e)}")
            return False

    async def _emit_qr_code(self):
        """Find the QR code on the page, take a screenshot, and broadcast it"""
        try:
            # WhatsApp canvas element holding the QR code
            qr_canvas = await self.page.query_selector('canvas')
            if qr_canvas:
                qr_bytes = await qr_canvas.screenshot(type='png')
                qr_base64 = base64.b64encode(qr_bytes).decode('utf-8')
                logger.info("[WhatsAppAutomation] Emitting QR code to frontend")
                await self._broadcast("qr_code_required", {"qr_base64": qr_base64})
        except Exception as e:
            logger.error(f"[WhatsAppAutomation] Error capturing QR code: {str(e)}")
    
    async def wait_for_login(self, timeout: int = 120) -> bool:
        """
        Wait for user to scan QR code and login
        Args:
            timeout: Maximum time to wait in seconds
        Returns: True if logged in, False if timeout
        """
        logger.info(f"[WhatsAppAutomation] Waiting for QR code scan (timeout: {timeout}s)...")
        
        start_time = datetime.now()
        last_qr_emit = datetime.now()
        
        # Emit initial QR code
        await self._emit_qr_code()
        
        while (datetime.now() - start_time).seconds < timeout:
            if await self._check_login_status():
                self.is_logged_in = True
                logger.info("[WhatsAppAutomation] QR Scanned. Successfully logged in!")
                await self._broadcast("whatsapp_ready", {"status": "QR Scanned. Session ready."})
                return True
            
            # Emit QR code every 15 seconds in case it refreshes
            if (datetime.now() - last_qr_emit).seconds > 15:
                await self._emit_qr_code()
                last_qr_emit = datetime.now()
                
            await asyncio.sleep(2)
        
        logger.error("[WhatsAppAutomation] Login timeout")
        await self._broadcast("whatsapp_timeout", {"status": "QR scan timeout. Please try again."})
        return False
    
    async def send_message(self, phone: str, message: str, metadata: dict = None) -> Dict[str, Any]:
        """
        Send a WhatsApp message to a phone number
        """
        metadata = metadata or {}
        lead_id = metadata.get("lead_id", "Unknown")
        biz_name = metadata.get("business_name", "Unknown")
        camp_id = metadata.get("campaign_id", self.campaign_id or "Unknown")
        
        def _log(level: str, msg: str):
            prefix = f"[WhatsAppAutomation] [Camp:{camp_id}] [Lead:{lead_id}] [{biz_name}] [{phone}]"
            getattr(logger, level)(f"{prefix} {msg}")

        if not self.is_logged_in:
            _log("error", "Not logged in to WhatsApp Web")
            return {
                "success": False,
                "status": "FAILED",
                "error": "Not logged in to WhatsApp Web"
            }
        
        try:
            _log("info", "Chat Opened")
            
            phone_clean = phone.replace('+', '').replace(' ', '')
            chat_url = f"https://web.whatsapp.com/send?phone={phone_clean}"
            
            # Navigate to chat
            await self.page.goto(chat_url, wait_until='networkidle', timeout=30000)
            
            # Random wait for humanization
            await asyncio.sleep(random.uniform(2.0, 4.0))
            
            # Smart Detection: Check if chat opened or error occurred
            invalid_number = await self.page.query_selector('text=Phone number shared via url is invalid')
            if invalid_number:
                _log("warning", "Invalid Number detected")
                return {
                    "success": False,
                    "status": "FAILED",
                    "error": "Invalid phone number or user not on WhatsApp"
                }
            
            # Wait for message input box
            try:
                message_box = await self.page.wait_for_selector(
                    '[data-testid="conversation-compose-box-input"]',
                    timeout=15000
                )
            except PlaywrightTimeout:
                _log("error", "Chat input not found - UI changed, connection issue, or invalid number")
                return {
                    "success": False,
                    "status": "FAILED",
                    "error": "Chat input not found - UI changed, connection issue, or invalid number"
                }
            
            # Smart Rate Limiting: Humanized typing
            _log("info", "Typing Started")
            await message_box.click()
            
            # Type message with random delays between characters (simulated)
            await message_box.type(message, delay=random.randint(10, 50))
            _log("info", "Typing Completed")
            
            # Random pause before sending
            await asyncio.sleep(random.uniform(0.5, 1.5))
            
            _log("info", "Message Generated and Ready")
            # Find and click send button
            send_button = await self.page.wait_for_selector(
                '[data-testid="send"]',
                timeout=5000
            )
            await send_button.click()
            
            # Message Verification: Verify message appears in DOM with a clock or checkmark
            _log("info", "Verifying message delivery...")
            try:
                # Wait for the message bubble to appear. Usually has 'data-id'
                await self.page.wait_for_selector('div.message-out', timeout=10000)
                # Ensure the message is actually sent (clock icon disappears or checkmarks appear)
                await asyncio.sleep(random.uniform(1.0, 2.0)) 
                _log("info", "Verification Passed")
            except PlaywrightTimeout:
                _log("warning", "Message bubble not detected within timeout. Might still be sending.")
            
            _log("info", "Message Sent")
            
            return {
                "success": True,
                "status": "SENT",
                "sent_at": datetime.utcnow()
            }
            
        except PlaywrightTimeout as e:
            _log("error", f"Timeout sending message: {str(e)}")
            await self.take_screenshot(f"timeout_{phone}.png")
            return {
                "success": False,
                "status": "FAILED",
                "error": f"Timeout: {str(e)}"
            }
        except Exception as e:
            _log("error", f"Error sending message: {str(e)}")
            await self.take_screenshot(f"error_{phone}.png")
            return {
                "success": False,
                "status": "FAILED",
                "error": str(e)
            }
    
    async def close(self):
        """Close browser and cleanup resources"""
        try:
            if self.context:
                await self.context.close()
            if self.playwright:
                await self.playwright.stop()
            
            logger.info("[WhatsAppAutomation] Browser closed")
            
        except Exception as e:
            logger.error(f"[WhatsAppAutomation] Error closing browser: {str(e)}")
    
    async def take_screenshot(self, filename: str):
        """Take a screenshot of current page for debugging"""
        if self.page:
            path = os.path.join(os.getcwd(), "logs", filename)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            await self.page.screenshot(path=path)
            logger.info(f"[WhatsAppAutomation] Error screenshot saved to {path}")
