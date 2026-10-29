import os
import json
import time
from datetime import datetime
from typing import Optional, Dict, Any
from playwright.async_api import Page
from app.core.logger import logger

DEBUG_DIR = os.path.join(os.getcwd(), "debug")

class DiagnosticsEngine:
    """Captures system state and browser snapshots on failure."""
    
    @staticmethod
    def _ensure_dir():
        if not os.path.exists(DEBUG_DIR):
            os.makedirs(DEBUG_DIR)
            
    @staticmethod
    async def capture_snapshot(
        worker_id: str,
        job_id: str,
        phase: str,
        error_msg: str,
        page: Optional[Page] = None,
        extra_state: Optional[Dict[str, Any]] = None
    ) -> str:
        """Takes a diagnostic snapshot and saves it to the debug directory."""
        DiagnosticsEngine._ensure_dir()
        
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        prefix = f"{timestamp}_{worker_id}"
        snapshot_dir = os.path.join(DEBUG_DIR, prefix)
        os.makedirs(snapshot_dir, exist_ok=True)
        
        logger.info(f"DIAGNOSTICS_CAPTURE: Creating failure snapshot in {snapshot_dir}")
        
        # 1. Save execution state
        state = {
            "timestamp": datetime.utcnow().isoformat(),
            "worker_id": worker_id,
            "job_id": job_id,
            "phase": phase,
            "error": error_msg,
            "url": None,
            "extra_state": extra_state or {}
        }
        
        if page:
            try:
                state["url"] = page.url
                # 2. Save screenshot
                screenshot_path = os.path.join(snapshot_dir, "screenshot.png")
                await page.screenshot(path=screenshot_path, full_page=True, timeout=5000)
                
                # 3. Save DOM
                html_path = os.path.join(snapshot_dir, "dom.html")
                html_content = await page.content()
                with open(html_path, "w", encoding="utf-8") as f:
                    f.write(html_content)
                    
            except Exception as e:
                logger.error(f"DIAGNOSTICS_ERROR: Failed to capture page state: {e}")
                state["page_capture_error"] = str(e)
                
        # Write state JSON
        state_path = os.path.join(snapshot_dir, "state.json")
        try:
            with open(state_path, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2)
        except Exception as e:
            logger.error(f"DIAGNOSTICS_ERROR: Failed to write state JSON: {e}")
            
        return snapshot_dir

diagnostics_engine = DiagnosticsEngine()
