import asyncio
import psutil
from typing import Dict, Any, Optional
from datetime import datetime
from app.core.logger import logger
from .types import HealthState, ComponentStatus, SystemHealthReport

class SystemHealthManager:
    """Central manager for tracking the health of all subsystems."""
    
    def __init__(self):
        self.components: Dict[str, ComponentStatus] = {}
        self._lock = asyncio.Lock()
        
    async def report_health(
        self, 
        component_name: str, 
        state: HealthState, 
        metrics: Optional[Dict[str, Any]] = None,
        error_message: Optional[str] = None,
        increment_recovery: bool = False
    ):
        """Allow components to ping their health status."""
        async with self._lock:
            existing = self.components.get(component_name)
            recovery_count = 0
            if existing:
                recovery_count = existing.recovery_attempts
                if increment_recovery:
                    recovery_count += 1
                elif state == HealthState.HEALTHY:
                    recovery_count = 0 # Reset on success
                    
            status = ComponentStatus(
                name=component_name,
                state=state,
                last_updated=datetime.utcnow(),
                error_message=error_message,
                metrics=metrics or {},
                recovery_attempts=recovery_count
            )
            self.components[component_name] = status
            
            if state in [HealthState.FAILED, HealthState.RECOVERING, HealthState.DEGRADED]:
                logger.warning(f"HEALTH_ALERT [{component_name}]: {state.value} - {error_message}")

    async def get_system_health(self) -> SystemHealthReport:
        """Returns aggregated health across all components."""
        async with self._lock:
            overall_state = HealthState.HEALTHY
            for comp in self.components.values():
                if comp.state == HealthState.FAILED:
                    overall_state = HealthState.FAILED
                    break
                elif comp.state in [HealthState.RECOVERING, HealthState.DEGRADED]:
                    overall_state = HealthState.DEGRADED
                    
            try:
                cpu = psutil.cpu_percent(interval=None)
                mem = psutil.virtual_memory().percent
                disk = psutil.disk_usage('/').percent
            except Exception:
                cpu = mem = disk = 0.0

            return SystemHealthReport(
                overall_state=overall_state,
                timestamp=datetime.utcnow(),
                components=list(self.components.values()),
                system_metrics={
                    "cpu_percent": cpu,
                    "ram_percent": mem,
                    "disk_percent": disk
                }
            )

# Global singleton
health_manager = SystemHealthManager()
