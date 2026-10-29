from fastapi import APIRouter, HTTPException
from .supervisor import supervisor
from .models import SupervisorReport

router = APIRouter()


@router.get("/supervisor", response_model=SupervisorReport)
async def get_supervisor_status():
    """Get the full supervisor report with all worker states, health, and circuit breakers."""
    return supervisor.get_report()


@router.get("/supervisor/workers")
async def list_workers():
    """List all registered workers with their state and health."""
    report = supervisor.get_report()
    return {
        "total": report.total_workers,
        "healthy": report.healthy_count,
        "degraded": report.degraded_count,
        "failed": report.failed_count,
        "workers": {
            name: {
                "state": w.health.state.value,
                "type": w.worker_type,
                "uptime_seconds": w.health.uptime_seconds,
                "task_alive": w.health.is_task_alive,
                "heartbeat_stale": w.health.heartbeat_stale,
                "restart_count": w.restart_count,
                "total_restarts": w.total_restarts,
                "circuit_breaker": w.circuit_breaker.state.value,
                "error": w.health.error_message,
            }
            for name, w in report.workers.items()
        },
    }


@router.get("/supervisor/workers/{name}")
async def get_worker_detail(name: str):
    """Get detailed information about a specific worker."""
    report = supervisor.get_report()
    wr = report.workers.get(name)
    if not wr:
        raise HTTPException(status_code=404, detail=f"Worker '{name}' not found")
    return wr


@router.post("/supervisor/workers/{name}/restart")
async def restart_worker(name: str):
    """Gracefully restart a specific worker."""
    success = await supervisor.restart_worker(name)
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to restart worker '{name}'")
    return {"message": f"Worker '{name}' restarted successfully"}


@router.get("/supervisor/circuit-breakers")
async def get_circuit_breakers():
    """Get circuit breaker status for all workers."""
    report = supervisor.get_report()
    return {
        name: {
            "state": w.circuit_breaker.state.value,
            "failures": w.circuit_breaker.failure_count,
            "max_restarts": w.circuit_breaker.max_restarts,
            "window_seconds": w.circuit_breaker.window_seconds,
            "opened_at": w.circuit_breaker.opened_at,
            "last_failure_at": w.circuit_breaker.last_failure_at,
            "recent_restarts": len(w.circuit_breaker.restart_timestamps),
        }
        for name, w in report.workers.items()
    }
