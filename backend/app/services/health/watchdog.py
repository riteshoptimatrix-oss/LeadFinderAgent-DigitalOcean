import asyncio
import time
from typing import Dict, Any, Callable, Optional
from app.core.logger import logger
from .types import HealthState
from .manager import health_manager
from .diagnostics import diagnostics_engine

class WatchdogService:
    """Background service to detect stuck workers and automatically recover them."""
    
    def __init__(self, check_interval_seconds: float = 10.0, hung_timeout_seconds: float = 120.0):
        self.check_interval = check_interval_seconds
        self.hung_timeout = hung_timeout_seconds
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        self._monitored_workers: Dict[str, Dict[str, Any]] = {}
        self._recovery_callbacks: Dict[str, Callable] = {}
        
    def register_worker(self, worker_id: str, get_heartbeat_cb: Callable[[], float], recovery_cb: Callable[[str], Any]):
        """Registers a worker to be monitored by the watchdog."""
        self._monitored_workers[worker_id] = {
            "get_heartbeat": get_heartbeat_cb
        }
        self._recovery_callbacks[worker_id] = recovery_cb
        asyncio.create_task(health_manager.report_health(f"Worker-{worker_id}", HealthState.HEALTHY))
        logger.info(f"WATCHDOG_REGISTER: Started monitoring {worker_id}")
        
    def unregister_worker(self, worker_id: str):
        if worker_id in self._monitored_workers:
            del self._monitored_workers[worker_id]
        if worker_id in self._recovery_callbacks:
            del self._recovery_callbacks[worker_id]

    async def start(self):
        self.is_running = True
        self._task = asyncio.create_task(self._watchdog_loop())
        logger.info("WATCHDOG_STARTED: System watchdog active.")
        await health_manager.report_health("SystemWatchdog", HealthState.HEALTHY)
        
    async def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("WATCHDOG_STOPPED: System watchdog deactivated.")

    async def _watchdog_loop(self):
        while self.is_running:
            try:
                await asyncio.sleep(self.check_interval)
                current_time = time.time()
                
                for worker_id, data in list(self._monitored_workers.items()):
                    last_heartbeat = data["get_heartbeat"]()
                    elapsed = current_time - last_heartbeat
                    
                    if elapsed > self.hung_timeout:
                        logger.error(f"WATCHDOG_ALERT: Worker {worker_id} hung for {elapsed:.1f}s. Initiating forced recovery.")
                        await health_manager.report_health(
                            f"Worker-{worker_id}", 
                            HealthState.RECOVERING, 
                            error_message=f"Hung for {elapsed:.1f}s",
                            increment_recovery=True
                        )
                        
                        # Generate diagnostic snapshot if we can hook into the worker's page
                        # (Normally we'd pass page ref, but watchdog just forces restart)
                        await diagnostics_engine.capture_snapshot(
                            worker_id=worker_id,
                            job_id="watchdog_trigger",
                            phase="timeout_recovery",
                            error_msg=f"Watchdog detected worker hung for {elapsed:.1f}s"
                        )
                        
                        # Execute recovery callback
                        recovery_cb = self._recovery_callbacks.get(worker_id)
                        if recovery_cb:
                            try:
                                if asyncio.iscoroutinefunction(recovery_cb):
                                    await recovery_cb(worker_id)
                                else:
                                    recovery_cb(worker_id)
                            except Exception as e:
                                logger.error(f"WATCHDOG_RECOVERY_FAILED: {e}")
                                await health_manager.report_health(f"Worker-{worker_id}", HealthState.FAILED, error_message=str(e))
                                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"WATCHDOG_ERROR: {e}")
                await health_manager.report_health("SystemWatchdog", HealthState.DEGRADED, error_message=str(e))

watchdog_service = WatchdogService()
