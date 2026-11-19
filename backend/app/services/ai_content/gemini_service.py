"""
Gemini Web Browser Automation Service using Playwright.
Provides persistent session management, social media content generation,
and modification extraction via Gemini Web automation without LLM API keys.
"""

import os
import sys
import asyncio
import logging
from typing import Optional, Tuple
from playwright.async_api import (
    async_playwright,
    BrowserContext,
    Page,
    Playwright,
    TimeoutError as PlaywrightTimeout,
    Error as PlaywrightError
)

logger = logging.getLogger("ai_content.gemini_service")


SOCIAL_MEDIA_BASE_PROMPT = """Generate a high-quality, engaging, and professional social media post based on the following user input:

User Topic / Query: {user_query}

Requirements:
Generate ONLY ONE complete, polished, ready-to-publish social media post.
Start with a powerful, attention-grabbing hook.
Understand the user's query and create content that is directly relevant to the given topic.
Highlight the most relevant benefits, features, key points, or unique selling propositions (USPs), wherever applicable.
Use engaging, natural, persuasive, and human-like language.
Include relevant emojis naturally without overusing them.
Add a clear and compelling Call-to-Action (CTA).
Include 5–8 relevant and popular hashtags related to the topic.
Keep the content concise, creative, and engaging.
Make the post suitable for Instagram, Facebook, and LinkedIn.
Maintain a modern, professional, audience-friendly tone.
Adapt the writing style according to the nature of the user's topic.
Do not invent product features, benefits, statistics, or claims that are not supported by the user's input.

Strict Output Rules:
Provide only ONE final social media post.
Include ONE compelling caption with relevant hashtags.
Do not provide multiple versions or alternative captions.
Do not include explanations, suggestions, introductions, or unnecessary headings.
Do not mention these instructions or the prompt.
Return only the final, ready-to-publish content."""


MODIFICATION_BASE_PROMPT = """Modify the following response based on the requested changes.

Existing Response: {response}

Requested Changes: {user_query}

Instructions:

Apply only the changes requested by the user.
Preserve the original meaning, context, tone, and structure wherever possible.
Do not remove or modify existing information unless explicitly requested.
Maintain consistency with the original response.
If the user requests additions, integrate them naturally into the existing response.
Return only the complete updated response, without explanations or extra commentary."""


class GeminiBrowserService:
    """Manages Playwright browser lifecycle and Gemini Web interactions."""

    def __init__(self, user_data_dir: Optional[str] = None):
        backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        default_dir = os.path.join(backend_root, "storage", "gemini_profile")
        self.user_data_dir = user_data_dir or os.getenv("GEMINI_USER_DATA_DIR", default_dir)
        os.makedirs(self.user_data_dir, exist_ok=True)

        self._playwright: Optional[Playwright] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None
        self._lock = asyncio.Lock()
        self._is_headless = os.getenv("GEMINI_HEADLESS", "true").lower() == "true"
        self._last_status = "idle"
        self._last_error: Optional[str] = None

    @property
    def is_running(self) -> bool:
        return self._context is not None and len(self._context.pages) > 0 and self._page is not None and not self._page.is_closed()

    async def get_status(self) -> dict:
        """Check browser and authentication status."""
        async with self._lock:
            if not self.is_running:
                return {
                    "success": True,
                    "status": "idle",
                    "is_logged_in": False,
                    "browser_running": False,
                    "message": "Browser session is not active."
                }

            is_logged_in = await self._check_login_status()
            status = "ready" if is_logged_in else "needs_login"
            message = "Gemini session is authenticated and ready." if is_logged_in else "Session active. Google login recommended for full personalization."

            return {
                "success": True,
                "status": status,
                "is_logged_in": is_logged_in,
                "browser_running": True,
                "message": message
            }

    async def start_session(self, headless: Optional[bool] = None) -> dict:
        """
        Initialize or restart the persistent browser session.
        If headless=False, opens visible browser window to allow user to log in manually.
        """
        async with self._lock:
            try:
                target_headless = headless if headless is not None else self._is_headless
                await self._init_browser_locked(headless=target_headless)
                is_logged_in = await self._check_login_status()
                
                status = "ready" if is_logged_in else "needs_login"
                msg = (
                    "Browser launched successfully. Session is logged in."
                    if is_logged_in
                    else "Browser window is open. Please sign in to your Google account in the browser, then continue."
                )

                return {
                    "success": True,
                    "status": status,
                    "is_logged_in": is_logged_in,
                    "browser_running": True,
                    "message": msg
                }
            except Exception as e:
                logger.error(f"Failed to start Gemini session: {e}", exc_info=True)
                self._last_error = str(e)
                return {
                    "success": False,
                    "status": "error",
                    "is_logged_in": False,
                    "browser_running": False,
                    "message": f"Failed to initialize browser session: {str(e)}"
                }

    async def _init_browser_locked(self, headless: bool = True):
        """Internal helper to initialize Playwright with persistent context under lock."""
        # Close existing if changing headless state or if closed
        if self._context is not None:
            if self._is_headless != headless or not self.is_running:
                await self._close_locked()

        if self._playwright is None:
            self._playwright = await async_playwright().start()

        if self._context is None:
            self._is_headless = headless
            logger.info(f"Launching persistent Chromium context at {self.user_data_dir} (headless={headless})...")
            
            launch_args = [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-infobars',
                '--window-size=1280,900',
            ]

            self._context = await self._playwright.chromium.launch_persistent_context(
                user_data_dir=self.user_data_dir,
                headless=headless,
                args=launch_args,
                viewport={"width": 1280, "height": 900},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
            )

            # Ensure page exists
            if len(self._context.pages) > 0:
                self._page = self._context.pages[0]
            else:
                self._page = await self._context.new_page()

            # Set default timeout
            self._page.set_default_timeout(45000)

            # Navigate to Gemini
            logger.info("Navigating to https://gemini.google.com/app...")
            await self._page.goto("https://gemini.google.com/app", wait_until="networkidle", timeout=45000)
            await asyncio.sleep(2)

    async def _check_login_status(self) -> bool:
        """Determines if the Gemini session has an active Google account login."""
        if not self._page or self._page.is_closed():
            return False

        try:
            # Check for Google account avatar or profile indicators
            avatar = await self._page.query_selector(
                'a[aria-label*="Google Account"], button[aria-label*="Google Account"], img[alt*="Google Account"], [data-hovercard-id]'
            )
            sign_in_btn = await self._page.query_selector(
                'a[href*="accounts.google.com"], button:has-text("Sign in"), a:has-text("Sign in")'
            )

            # If an account avatar is visible and no sign-in button is prompting
            if avatar and not sign_in_btn:
                return True

            # If sign in button is present, user is not logged in
            if sign_in_btn:
                return False

            # If neither explicitly found, check current URL
            current_url = self._page.url
            if "accounts.google.com" in current_url:
                return False
            
            # Default check for chat capability
            prompt_box = await self._page.query_selector('div[role="textbox"], rich-textarea div.ql-editor')
            return bool(prompt_box and not sign_in_btn)

        except Exception as e:
            logger.warning(f"Error checking login status: {e}")
            return False

    async def generate_social_media_post(self, user_query: str) -> str:
        """
        Executes the Social Media Generation workflow via Gemini Web.
        """
        if not user_query or not user_query.strip():
            raise ValueError("User query cannot be empty.")

        formatted_prompt = SOCIAL_MEDIA_BASE_PROMPT.format(user_query=user_query.strip())
        return await self._send_prompt_and_extract_response(formatted_prompt)

    async def modify_content(self, existing_response: str, user_query: str) -> str:
        """
        Executes the Modification workflow via Gemini Web.
        """
        if not existing_response or not existing_response.strip():
            raise ValueError("Existing response cannot be empty for modification.")
        if not user_query or not user_query.strip():
            raise ValueError("Modification query cannot be empty.")

        formatted_prompt = MODIFICATION_BASE_PROMPT.format(
            response=existing_response.strip(),
            user_query=user_query.strip()
        )
        return await self._send_prompt_and_extract_response(formatted_prompt)

    async def _send_prompt_and_extract_response(self, prompt: str) -> str:
        """
        Submits prompt to Gemini Web and extracts the completed text response.
        Enforces locking to ensure serialized, crash-resilient browser execution.
        """
        async with self._lock:
            # Ensure browser is running
            if not self.is_running:
                await self._init_browser_locked(headless=self._is_headless)

            page = self._page
            if page is None or page.is_closed():
                raise RuntimeError("Browser page is not available.")

            try:
                # Ensure we are on the app page
                if "gemini.google.com/app" not in page.url:
                    logger.info("Navigating back to https://gemini.google.com/app...")
                    await page.goto("https://gemini.google.com/app", wait_until="networkidle", timeout=45000)
                    await asyncio.sleep(2)

                # Count existing model responses before submitting
                existing_responses = await page.query_selector_all('message-content, .model-response-text, div.markdown')
                initial_count = len(existing_responses)

                # Locate prompt editor
                editor = await self._locate_prompt_input(page)
                if not editor:
                    raise RuntimeError("Could not locate Gemini prompt input field. The Gemini UI may have changed.")

                # Clear and input prompt
                await editor.click()
                await asyncio.sleep(0.3)
                await editor.fill(prompt)
                await asyncio.sleep(0.5)

                # Submit prompt
                submitted = await self._submit_prompt(page)
                if not submitted:
                    raise RuntimeError("Failed to submit prompt to Gemini.")

                logger.info("Prompt submitted successfully. Awaiting Gemini response...")

                # Wait for response generation and extract
                extracted_text = await self._await_and_extract_response(page, initial_count)
                if not extracted_text:
                    raise RuntimeError("Gemini generated an empty response.")

                return extracted_text

            except PlaywrightTimeout as te:
                logger.error(f"Timeout during Gemini web interaction: {te}")
                raise TimeoutError("Gemini took too long to respond. Please try again.") from te
            except Exception as e:
                logger.error(f"Error during Gemini automation: {e}", exc_info=True)
                # If page is corrupted or disconnected, reset
                if "Target closed" in str(e) or "Session closed" in str(e):
                    await self._close_locked()
                raise e

    async def _locate_prompt_input(self, page: Page):
        """Reliably finds the prompt editor on Gemini."""
        selectors = [
            'div[role="textbox"]',
            'rich-textarea div.ql-editor',
            'rich-textarea',
            'div.ql-editor',
            'textarea'
        ]
        for sel in selectors:
            try:
                el = await page.wait_for_selector(sel, state="visible", timeout=7000)
                if el:
                    return el
            except Exception:
                continue
        return None

    async def _submit_prompt(self, page: Page) -> bool:
        """Clicks the send button or triggers Enter to submit the prompt."""
        send_selectors = [
            'button[aria-label="Send message"]',
            'button[aria-label*="Send"]',
            'button.send-button',
            '[data-testid="send-button"]'
        ]

        for sel in send_selectors:
            try:
                btn = await page.query_selector(sel)
                if btn and await btn.is_visible() and await btn.is_enabled():
                    await btn.click()
                    return True
            except Exception:
                continue

        # Fallback: Press Enter key
        try:
            await page.keyboard.press("Enter")
            return True
        except Exception as e:
            logger.warning(f"Fallback enter key submission failed: {e}")
            return False

    async def _await_and_extract_response(self, page: Page, initial_count: int, timeout_sec: int = 60) -> str:
        """
        Polls for response generation, waiting until the new response is stable and complete.
        """
        start_time = asyncio.get_event_loop().time()
        last_text = ""
        stable_iterations = 0
        min_stable_required = 3  # 3 consecutive seconds of stability

        while (asyncio.get_event_loop().time() - start_time) < timeout_sec:
            # Check if stop button is active (indicates streaming in progress)
            stop_btn = await page.query_selector('button[aria-label*="Stop"], button.stop-button')
            
            # Query all model response containers
            responses = await page.query_selector_all('message-content, .model-response-text, div.markdown')
            
            if len(responses) > initial_count or responses:
                latest = responses[-1]
                raw_text = (await latest.inner_text()).strip()
                cleaned_text = self._clean_gemini_output(raw_text)

                if cleaned_text:
                    if cleaned_text == last_text:
                        stable_iterations += 1
                        # If text has not changed and stop button is gone, generation is complete!
                        if stable_iterations >= min_stable_required and not stop_btn:
                            logger.info(f"Response finalized in {asyncio.get_event_loop().time() - start_time:.1f}s")
                            return cleaned_text
                    else:
                        stable_iterations = 0
                        last_text = cleaned_text

            await asyncio.sleep(1.0)

        # If timeout reached but we have stable text, return it
        if last_text:
            logger.warning("Reached maximum wait time, returning last captured response.")
            return last_text

        raise TimeoutError("Timed out waiting for Gemini response generation to complete.")

    def _clean_gemini_output(self, text: str) -> str:
        """Cleans UI artifacts and unwanted headers from Gemini's response text."""
        if not text:
            return ""

        # Remove leading "Gemini said\n\n" or "Gemini\n"
        lines = text.splitlines()
        while lines and lines[0].strip().lower() in ["gemini said", "gemini", "model response", ""]:
            lines.pop(0)

        # Remove trailing copy/feedback button text if captured in inner_text
        trailing_noise = ["copy code", "show drafts", "modify response", "share & export", "thumbs up", "thumbs down"]
        while lines and lines[-1].strip().lower() in trailing_noise:
            lines.pop()

        cleaned = "\n".join(lines).strip()
        return cleaned

    async def _close_locked(self):
        """Closes browser context and playwright instance safely."""
        try:
            if self._context:
                await self._context.close()
            if self._playwright:
                await self._playwright.stop()
        except Exception as e:
            logger.warning(f"Error during browser teardown: {e}")
        finally:
            self._page = None
            self._context = None
            self._playwright = None

    async def close(self):
        """Public teardown method."""
        async with self._lock:
            await self._close_locked()


# Global singleton instance for the application
gemini_service = GeminiBrowserService()
