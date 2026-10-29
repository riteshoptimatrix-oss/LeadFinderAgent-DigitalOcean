import asyncio
import time
import traceback
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable, Optional
from app.core.logger import logger
from app.services.worker_manager import shutdown_event
from .models import (
    WorkerState, CircuitBreakerState, WorkerHealth,
    CircuitBreakerStatus, SupervisedWorkerReport, SupervisorReport,
)


_KNOWN_TASK_ATTRS = ["_task", "task", "current_task"]


class WorkerSupervisor:
    def __init__(self, loop_interval: int = 15):
        self._loop_interval = loop_interval
        self._is_running = False
        self._supervision_task: Optional[asyncio.Task] = None
        self._workers: dict[str, dict] = {}
        self._started_at: Optional[datetime] = None
        self._total_restarts: int = 0
        self._worker_heartbeats: dict[str, datetime] = {}

    # ── Registration ─────────────────────────────────────────────────────

    def register(
        self,
        name: str,
        instance: Any,
        factory: Optional[Callable] = None,
        max_restarts: int = 5,
        restart_window: int = 300,
    ) -> None:
        if name in self._workers:
            raise ValueError(f"Worker '{name}' is already registered")

        self._workers[name] = {
            "instance": instance,
            "factory": factory,
            "worker_type": "factory" if factory else "singleton",
            "state": WorkerState.INITIALIZING,
            "restart_count": 0,
            "total_restarts": 0,
            "last_restart_at": None,
            "started_at": None,
            "max_restarts": max_restarts,
            "restart_window": restart_window,
            "circuit_breaker_state": CircuitBreakerState.CLOSED,
            "circuit_breaker_failures": 0,
            "circuit_breaker_opened_at": None,
            "last_failure_at": None,
            "restart_timestamps": [],
            "log": [],
            "error_message": None,
        }
        self._worker_heartbeats[name] = datetime.utcnow()
        logger.info(f"SUPERVISOR: Registered worker '{name}' (type={self._workers[name]['worker_type']})")

    # ── Lifecycle ────────────────────────────────────────────────────────

    async def start_all(self) -> None:
        if self._is_running:
            return
        self._is_running = True
        self._started_at = datetime.utcnow()

        for name in self._workers:
            await self._start_worker(name)

        self._supervision_task = asyncio.create_task(self._supervision_loop())
        logger.info(f"SUPERVISOR: Started supervision of {len(self._workers)} workers (interval={self._loop_interval}s)")

    async def stop_all(self, timeout: int = 30) -> None:
        if not self._is_running:
            return
        self._is_running = False

        if self._supervision_task:
            self._supervision_task.cancel()
            try:
                await asyncio.wait_for(self._supervision_task, timeout=5)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
            self._supervision_task = None

        stop_start = time.time()
        for name in list(self._workers.keys()):
            elapsed = time.time() - stop_start
            remaining = max(1, timeout - int(elapsed))
            await self._stop_worker(name, timeout=remaining)

        logger.info(f"SUPERVISOR: All {len(self._workers)} workers stopped")

    async def restart_worker(self, name: str) -> bool:
        if name not in self._workers:
            logger.error(f"SUPERVISOR: Cannot restart unknown worker '{name}'")
            return False
        logger.info(f"SUPERVISOR: Manual restart of worker '{name}'")
        await self._stop_worker(name)
        return await self._start_worker(name)

    async def _start_worker(self, name: str) -> bool:
        info = self._workers[name]
        instance = info["instance"]

        try:
            info["state"] = WorkerState.INITIALIZING
            result = instance.start()
            if isinstance(result, Awaitable):
                await result
            info["state"] = WorkerState.RUNNING
            info["started_at"] = datetime.utcnow()
            info["error_message"] = None
            self._worker_heartbeats[name] = datetime.utcnow()
            logger.info(f"SUPERVISOR: Worker '{name}' started successfully")
            return True
        except Exception as e:
            info["state"] = WorkerState.FAILED
            info["error_message"] = f"Start failed: {str(e)}"
            self._log_event(name, "ERROR", f"Start failed: {str(e)}")
            logger.error(f"SUPERVISOR: Worker '{name}' failed to start: {e}")
            return False

    async def _stop_worker(self, name: str, timeout: int = 10) -> bool:
        info = self._workers[name]
        instance = info["instance"]

        try:
            info["state"] = WorkerState.STOPPING
            result = instance.stop()
            if isinstance(result, Awaitable):
                await asyncio.wait_for(result, timeout=timeout)
            info["state"] = WorkerState.STOPPED
            logger.info(f"SUPERVISOR: Worker '{name}' stopped")
            return True
        except asyncio.TimeoutError:
            info["state"] = WorkerState.FAILED
            info["error_message"] = f"Stop timed out after {timeout}s"
            logger.error(f"SUPERVISOR: Worker '{name}' stop timed out")
            return False
        except Exception as e:
            info["state"] = WorkerState.FAILED
            info["error_message"] = f"Stop failed: {str(e)}"
            logger.error(f"SUPERVISOR: Worker '{name}' stop error: {e}")
            return False

    # ── Supervision Loop ─────────────────────────────────────────────────

    async def _supervision_loop(self) -> None:
        while self._is_running and not shutdown_event.is_set():
            try:
                await self._check_workers()
                await asyncio.sleep(self._loop_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"SUPERVISOR: Supervision loop error: {e}\n{traceback.format_exc()}")
                await asyncio.sleep(self._loop_interval)

    async def _check_workers(self) -> None:
        now = datetime.utcnow()

        for name, info in self._workers.items():
            if info["state"] in (WorkerState.STOPPED, WorkerState.FAILED):
                if not shutdown_event.is_set():
                    await self._try_restart(name)
                continue

            task_alive = self._is_task_alive(info["instance"])
            heartbeat_fresh = self._is_heartbeat_fresh(name, now)

            if info["state"] == WorkerState.RUNNING and not task_alive and not heartbeat_fresh:
                info["error_message"] = "Worker task died unexpectedly"
                info["state"] = WorkerState.CRASHED
                self._log_event(name, "CRITICAL", f"Worker crashed: task is dead and heartbeat is stale")
                logger.error(f"SUPERVISOR: Worker '{name}' detected as crashed")
                if not shutdown_event.is_set():
                    await self._try_restart(name)

    def _is_task_alive(self, instance: Any) -> bool:
        for attr in _KNOWN_TASK_ATTRS:
            task = getattr(instance, attr, None)
            if task is not None and isinstance(task, asyncio.Task):
                return not task.done()
        return True

    def _is_heartbeat_fresh(self, name: str, now: datetime, max_age: int = 60) -> bool:
        last = self._worker_heartbeats.get(name)
        if last is None:
            return False
        return (now - last).total_seconds() < max_age

    def record_heartbeat(self, name: str) -> None:
        self._worker_heartbeats[name] = datetime.utcnow()

    # ── Circuit Breaker & Restart ────────────────────────────────────────

    def _check_circuit_breaker(self, name: str) -> bool:
        info = self._workers[name]

        if info["circuit_breaker_state"] == CircuitBreakerState.OPEN:
            opened_at = info["circuit_breaker_opened_at"]
            if opened_at and (datetime.utcnow() - opened_at).total_seconds() > info["restart_window"]:
                info["circuit_breaker_state"] = CircuitBreakerState.HALF_OPEN
                logger.info(f"SUPERVISOR: Circuit breaker for '{name}' transitioning to HALF_OPEN")
            else:
                logger.warning(f"SUPERVISOR: Circuit breaker OPEN for '{name}' — restart blocked")
                return False

        cutoff = datetime.utcnow() - timedelta(seconds=info["restart_window"])
        recent = [t for t in info["restart_timestamps"] if t > cutoff]

        if len(recent) >= info["max_restarts"]:
            info["circuit_breaker_state"] = CircuitBreakerState.OPEN
            info["circuit_breaker_opened_at"] = datetime.utcnow()
            info["error_message"] = (
                f"Circuit breaker OPEN: {len(recent)} restarts in "
                f"{info['restart_window']}s (max {info['max_restarts']})"
            )
            self._log_event(name, "CRITICAL", info["error_message"])
            logger.error(f"SUPERVISOR: Circuit breaker OPEN for '{name}' — max restarts exceeded")
            return False

        return True

    async def _try_restart(self, name: str) -> bool:
        info = self._workers[name]

        if not self._check_circuit_breaker(name):
            return False

        self._log_event(name, "WARNING", f"Attempting restart (attempt {info['total_restarts'] + 1})")

        try:
            self._reset_worker_instance(name)
            success = await self._start_worker(name)

            if success:
                now = datetime.utcnow()
                info["restart_count"] += 1
                info["total_restarts"] += 1
                info["last_restart_at"] = now
                info["restart_timestamps"].append(now)
                info["circuit_breaker_failures"] = 0
                self._total_restarts += 1

                if info["circuit_breaker_state"] == CircuitBreakerState.HALF_OPEN:
                    info["circuit_breaker_state"] = CircuitBreakerState.CLOSED
                    logger.info(f"SUPERVISOR: Circuit breaker for '{name}' reset to CLOSED")

                self._log_event(name, "INFO", f"Restart successful")
                logger.info(f"SUPERVISOR: Worker '{name}' restarted successfully (total={info['total_restarts']})")
            else:
                info["circuit_breaker_failures"] += 1
                info["last_failure_at"] = datetime.utcnow()
                self._log_event(name, "ERROR", f"Restart failed")

            return success

        except Exception as e:
            info["state"] = WorkerState.FAILED
            info["error_message"] = f"Restart error: {str(e)}"
            info["circuit_breaker_failures"] += 1
            info["last_failure_at"] = datetime.utcnow()
            self._log_event(name, "ERROR", f"Restart error: {e}")
            logger.error(f"SUPERVISOR: Worker '{name}' restart error: {e}")
            return False

    def _reset_worker_instance(self, name: str) -> None:
        info = self._workers[name]

        if info["worker_type"] == "factory" and info["factory"]:
            new_instance = info["factory"]()
            info["instance"] = new_instance
            self._update_globals(name, new_instance)
        else:
            self._reset_worker_state(info["instance"])

    def _update_globals(self, name: str, instance: Any) -> None:
        import sys
        module = sys.modules.get("app.main")
        if module is None:
            return
        var_map = {
            "campaign_queue": "campaign_worker",
            "wa_queue": "wa_worker",
            "ai_queue": "ai_worker",
            "advanced_analysis": "advanced_analysis_worker",
            "auto_report": "auto_report_worker",
            "crm_automation": "crm_automation_worker",
            "enrichment_queue": "enrichment_worker",
        }
        var_name = var_map.get(name)
        if var_name and hasattr(module, var_name):
            setattr(module, var_name, instance)

    def _reset_worker_state(self, instance: Any) -> None:
        for attr in ["is_running", "running", "_running"]:
            if hasattr(instance, attr):
                setattr(instance, attr, False)
                break

        for task_attr in _KNOWN_TASK_ATTRS:
            if hasattr(instance, task_attr):
                setattr(instance, task_attr, None)

    # ── Logging ──────────────────────────────────────────────────────────

    def _log_event(self, name: str, level: str, message: str) -> None:
        info = self._workers.get(name)
        if info:
            info["log"].append({
                "timestamp": datetime.utcnow(),
                "level": level,
                "message": message,
            })
            if len(info["log"]) > 100:
                info["log"] = info["log"][-100:]

    # ── Reporting ────────────────────────────────────────────────────────

    def get_report(self) -> SupervisorReport:
        report = SupervisorReport(
            is_running=self._is_running,
            loop_interval=self._loop_interval,
            started_at=self._started_at or datetime.utcnow(),
            total_restarts_performed=self._total_restarts,
        )
        now = datetime.utcnow()

        for name, info in self._workers.items():
            instance = info["instance"]
            task_alive = self._is_task_alive(instance)
            heartbeat_fresh = self._is_heartbeat_fresh(name, now)

            uptime = None
            if info["started_at"]:
                uptime = (now - info["started_at"]).total_seconds()

            health = WorkerHealth(
                state=info["state"],
                is_task_alive=task_alive,
                heartbeat_stale=not heartbeat_fresh,
                uptime_seconds=uptime,
                error_message=info["error_message"],
            )
            cb = CircuitBreakerStatus(
                state=info["circuit_breaker_state"],
                failure_count=info["circuit_breaker_failures"],
                max_restarts=info["max_restarts"],
                window_seconds=info["restart_window"],
                opened_at=info["circuit_breaker_opened_at"],
                last_failure_at=info["last_failure_at"],
                restart_timestamps=list(info["restart_timestamps"]),
            )
            wr = SupervisedWorkerReport(
                name=name,
                worker_type=info["worker_type"],
                health=health,
                circuit_breaker=cb,
                restart_count=info["restart_count"],
                total_restarts=info["total_restarts"],
                last_restart_at=info["last_restart_at"],
                started_at=info["started_at"],
                log=list(info["log"]),
            )
            report.workers[name] = wr

            if info["state"] in (WorkerState.RUNNING, WorkerState.INITIALIZING, WorkerState.STOPPING):
                report.healthy_count += 1
            elif info["state"] == WorkerState.STOPPED:
                report.degraded_count += 1
            else:
                report.failed_count += 1

        report.total_workers = len(self._workers)
        report.healthy_count = sum(
            1 for w in self._workers.values()
            if w["state"] in (WorkerState.RUNNING,)
        )
        report.degraded_count = sum(
            1 for w in self._workers.values()
            if w["state"] in (WorkerState.STOPPED, WorkerState.INITIALIZING, WorkerState.STOPPING, WorkerState.PAUSED)
        )
        report.failed_count = sum(
            1 for w in self._workers.values()
            if w["state"] in (WorkerState.FAILED, WorkerState.CRASHED)
        )

        return report


supervisor = WorkerSupervisor()
