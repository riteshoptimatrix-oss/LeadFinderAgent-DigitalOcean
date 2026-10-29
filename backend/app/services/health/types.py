from enum import Enum
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

class HealthState(str, Enum):
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    RECOVERING = "RECOVERING"
    FAILED = "FAILED"
    UNKNOWN = "UNKNOWN"

class ComponentStatus(BaseModel):
    name: str
    state: HealthState
    last_updated: datetime = datetime.utcnow()
    error_message: Optional[str] = None
    metrics: Dict[str, Any] = {}
    recovery_attempts: int = 0

class SystemHealthReport(BaseModel):
    overall_state: HealthState
    timestamp: datetime = datetime.utcnow()
    components: List[ComponentStatus]
    system_metrics: Dict[str, Any] = {}
