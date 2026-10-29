from datetime import datetime
from typing import Optional, Any
from enum import Enum
from pydantic import BaseModel, Field


class WorkerState(str, Enum):
    INITIALIZING = "INITIALIZING"
    RUNNING = "RUNNING"
    STOPPING = "STOPPING"
    STOPPED = "STOPPED"
    FAILED = "FAILED"
    CRASHED = "CRASHED"
    PAUSED = "PAUSED"


class CircuitBreakerState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class WorkerHealth(BaseModel):
    state: WorkerState = WorkerState.INITIALIZING
    is_task_alive: bool = False
    last_heartbeat: Optional[datetime] = None
    heartbeat_stale: bool = False
    cpu_percent: Optional[float] = None
    memory_percent: Optional[float] = None
    uptime_seconds: Optional[float] = None
    error_message: Optional[str] = None


class CircuitBreakerStatus(BaseModel):
    state: CircuitBreakerState = CircuitBreakerState.CLOSED
    failure_count: int = 0
    max_restarts: int = 5
    window_seconds: int = 300
    opened_at: Optional[datetime] = None
    last_failure_at: Optional[datetime] = None
    restart_timestamps: list[datetime] = Field(default_factory=list)


class SupervisedWorkerReport(BaseModel):
    name: str
    worker_type: str
    health: WorkerHealth = Field(default_factory=WorkerHealth)
    circuit_breaker: CircuitBreakerStatus = Field(default_factory=CircuitBreakerStatus)
    restart_count: int = 0
    total_restarts: int = 0
    last_restart_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    log: list[dict] = Field(default_factory=list)


class SupervisorReport(BaseModel):
    is_running: bool = False
    loop_interval: int = 15
    workers: dict[str, SupervisedWorkerReport] = Field(default_factory=dict)
    total_workers: int = 0
    healthy_count: int = 0
    degraded_count: int = 0
    failed_count: int = 0
    started_at: datetime = Field(default_factory=datetime.utcnow)
    total_restarts_performed: int = 0
