"""
Production-Grade Fault Tolerance System
Provides circuit breakers, graceful degradation, and automatic recovery mechanisms.
"""

import asyncio
import time
import logging
from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass, field
from enum import Enum
from contextlib import asynccontextmanager
import traceback
from datetime import datetime, timedelta


logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker states."""
    CLOSED = "CLOSED"      # Normal operation
    OPEN = "OPEN"          # Failing, blocking requests
    HALF_OPEN = "HALF_OPEN"  # Testing recovery


class ServiceType(Enum):
    """Types of services that can be protected by fault tolerance."""
    DATABASE = "DATABASE"
    BROWSER = "BROWSER"
    EXTERNAL_API = "EXTERNAL_API"
    WEBSOCKET = "WEBSOCKET"
    FILE_SYSTEM = "FILE_SYSTEM"
    QUEUE = "QUEUE"
    SCHEDULER = "SCHEDULER"


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker behavior."""
    failure_threshold: int = 5          # Failures before opening
    recovery_timeout: float = 60.0      # Seconds before attempting recovery
    success_threshold: int = 3          # Successes needed to close circuit
    timeout: float = 30.0              # Operation timeout
    half_open_max_calls: int = 5        # Max calls in half-open state


@dataclass
class CircuitBreakerMetrics:
    """Metrics for circuit breaker monitoring."""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    timeouts: int = 0
    circuit_opens: int = 0
    last_failure_time: Optional[float] = None
    last_success_time: Optional[float] = None
    consecutive_failures: int = 0
    consecutive_successes: int = 0


class CircuitBreaker:
    """
    Production-grade circuit breaker with comprehensive monitoring and recovery.
    """
    
    def __init__(
        self, 
        name: str, 
        service_type: ServiceType,
        config: Optional[CircuitBreakerConfig] = None
    ):
        self.name = name
        self.service_type = service_type
        self.config = config or CircuitBreakerConfig()
        self.state = CircuitState.CLOSED
        self.metrics = CircuitBreakerMetrics()
        self.lock = asyncio.Lock()
        self.half_open_calls = 0
        
        logger.info(f"CIRCUIT_BREAKER_INIT: {name} ({service_type.value}) initialized")
    
    async def call(self, func: Callable, *args, **kwargs):
        """Execute a function with circuit breaker protection."""
        async with self.lock:
            # Check if circuit is open
            if self.state == CircuitState.OPEN:
                if self._should_attempt_reset():
                    logger.info(f"CIRCUIT_BREAKER_HALF_OPEN: {self.name} transitioning to HALF_OPEN")
                    self.state = CircuitState.HALF_OPEN
                    self.half_open_calls = 0
                else:
                    self.metrics.total_requests += 1
                    self.metrics.failed_requests += 1
                    raise CircuitOpenError(f"Circuit breaker {self.name} is OPEN")
            
            # Check half-open call limit
            if self.state == CircuitState.HALF_OPEN:
                if self.half_open_calls >= self.config.half_open_max_calls:
                    self.metrics.total_requests += 1
                    self.metrics.failed_requests += 1
                    raise CircuitOpenError(f"Circuit breaker {self.name} half-open call limit reached")
                self.half_open_calls += 1
        
        # Execute the function
        self.metrics.total_requests += 1
        start_time = time.time()
        
        try:
            # Execute with timeout
            if asyncio.iscoroutinefunction(func):
                result = await asyncio.wait_for(
                    func(*args, **kwargs),
                    timeout=self.config.timeout
                )
            else:
                result = await asyncio.wait_for(
                    asyncio.to_thread(func, *args, **kwargs),
                    timeout=self.config.timeout
                )
            
            # Record success
            await self._record_success()
            return result
            
        except asyncio.TimeoutError:
            self.metrics.timeouts += 1
            await self._record_failure("Timeout")
            raise CircuitTimeoutError(f"Operation timed out after {self.config.timeout}s")
            
        except Exception as e:
            await self._record_failure(str(e))
            raise CircuitExecutionError(f"Function execution failed: {str(e)}") from e
    
    async def _record_success(self):
        """Record a successful operation."""
        async with self.lock:
            self.metrics.successful_requests += 1
            self.metrics.consecutive_successes += 1
            self.metrics.consecutive_failures = 0
            self.metrics.last_success_time = time.time()
            
            # Transition from half-open to closed
            if self.state == CircuitState.HALF_OPEN:
                if self.metrics.consecutive_successes >= self.config.success_threshold:
                    logger.info(f"CIRCUIT_BREAKER_CLOSED: {self.name} circuit closed after recovery")
                    self.state = CircuitState.CLOSED
                    self.half_open_calls = 0
    
    async def _record_failure(self, error: str):
        """Record a failed operation."""
        async with self.lock:
            self.metrics.failed_requests += 1
            self.metrics.consecutive_failures += 1
            self.metrics.consecutive_successes = 0
            self.metrics.last_failure_time = time.time()
            
            logger.warning(f"CIRCUIT_BREAKER_FAILURE: {self.name} - {error}")
            
            # Check if we should open the circuit
            if (self.state == CircuitState.CLOSED and 
                self.metrics.consecutive_failures >= self.config.failure_threshold):
                
                logger.error(f"CIRCUIT_BREAKER_OPEN: {self.name} circuit opened after {self.metrics.consecutive_failures} failures")
                self.state = CircuitState.OPEN
                self.metrics.circuit_opens += 1
                
            elif self.state == CircuitState.HALF_OPEN:
                logger.warning(f"CIRCUIT_BREAKER_REOPEN: {self.name} circuit re-opened during recovery")
                self.state = CircuitState.OPEN
                self.half_open_calls = 0
    
    def _should_attempt_reset(self) -> bool:
        """Check if we should attempt to reset the circuit."""
        if self.metrics.last_failure_time is None:
            return False
        
        time_since_failure = time.time() - self.metrics.last_failure_time
        return time_since_failure >= self.config.recovery_timeout
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get circuit breaker metrics."""
        success_rate = 0.0
        if self.metrics.total_requests > 0:
            success_rate = (self.metrics.successful_requests / self.metrics.total_requests) * 100
        
        return {
            'name': self.name,
            'service_type': self.service_type.value,
            'state': self.state.value,
            'metrics': {
                'total_requests': self.metrics.total_requests,
                'successful_requests': self.metrics.successful_requests,
                'failed_requests': self.metrics.failed_requests,
                'timeouts': self.metrics.timeouts,
                'success_rate': round(success_rate, 2),
                'consecutive_failures': self.metrics.consecutive_failures,
                'consecutive_successes': self.metrics.consecutive_successes,
                'circuit_opens': self.metrics.circuit_opens,
                'last_failure_time': self.metrics.last_failure_time,
                'last_success_time': self.metrics.last_success_time
            },
            'config': {
                'failure_threshold': self.config.failure_threshold,
                'recovery_timeout': self.config.recovery_timeout,
                'success_threshold': self.config.success_threshold,
                'timeout': self.config.timeout
            }
        }


class CircuitOpenError(Exception):
    """Raised when circuit breaker is open."""
    pass


class CircuitTimeoutError(Exception):
    """Raised when operation times out."""
    pass


class CircuitExecutionError(Exception):
    """Raised when function execution fails."""
    pass


class FaultToleranceManager:
    """
    Global fault tolerance manager for the entire system.
    """
    
    def __init__(self):
        self.circuit_breakers: Dict[str, CircuitBreaker] = {}
        self.degraded_services: Set[ServiceType] = set()
        self.recovery_tasks: Dict[str, asyncio.Task] = {}
        
        # Initialize default circuit breakers
        self._initialize_default_circuits()
    
    def _initialize_default_circuits(self):
        """Initialize circuit breakers for critical system components."""
        # Database circuit breaker
        self.register_circuit_breaker(
            "mongodb",
            ServiceType.DATABASE,
            CircuitBreakerConfig(
                failure_threshold=3,
                recovery_timeout=30.0,
                success_threshold=2,
                timeout=15.0
            )
        )
        
        # Browser circuit breaker
        self.register_circuit_breaker(
            "playwright_browser",
            ServiceType.BROWSER,
            CircuitBreakerConfig(
                failure_threshold=5,
                recovery_timeout=60.0,
                success_threshold=3,
                timeout=30.0
            )
        )
        
        # External API circuit breaker
        self.register_circuit_breaker(
            "external_apis",
            ServiceType.EXTERNAL_API,
            CircuitBreakerConfig(
                failure_threshold=10,
                recovery_timeout=120.0,
                success_threshold=5,
                timeout=20.0
            )
        )
        
        # WebSocket circuit breaker
        self.register_circuit_breaker(
            "websocket_manager",
            ServiceType.WEBSOCKET,
            CircuitBreakerConfig(
                failure_threshold=8,
                recovery_timeout=45.0,
                success_threshold=3,
                timeout=10.0
            )
        )
    
    def register_circuit_breaker(
        self, 
        name: str, 
        service_type: ServiceType, 
        config: Optional[CircuitBreakerConfig] = None
    ) -> CircuitBreaker:
        """Register a new circuit breaker."""
        circuit = CircuitBreaker(name, service_type, config)
        self.circuit_breakers[name] = circuit
        logger.info(f"FAULT_TOLERANCE: Registered circuit breaker '{name}' for {service_type.value}")
        return circuit
    
    def get_circuit_breaker(self, name: str) -> Optional[CircuitBreaker]:
        """Get a circuit breaker by name."""
        return self.circuit_breakers.get(name)
    
    async def protected_call(
        self, 
        circuit_name: str, 
        func: Callable, 
        *args, 
        fallback: Optional[Callable] = None,
        **kwargs
    ):
        """Execute a function with circuit breaker protection and optional fallback."""
        circuit = self.get_circuit_breaker(circuit_name)
        
        if not circuit:
            logger.warning(f"FAULT_TOLERANCE: Circuit breaker '{circuit_name}' not found, executing without protection")
            if asyncio.iscoroutinefunction(func):
                return await func(*args, **kwargs)
            else:
                return func(*args, **kwargs)
        
        try:
            return await circuit.call(func, *args, **kwargs)
            
        except (CircuitOpenError, CircuitTimeoutError, CircuitExecutionError) as e:
            logger.error(f"FAULT_TOLERANCE: Protected call failed for '{circuit_name}': {str(e)}")
            
            # Mark service as degraded
            self.degraded_services.add(circuit.service_type)
            
            # Try fallback if available
            if fallback:
                logger.info(f"FAULT_TOLERANCE: Executing fallback for '{circuit_name}'")
                try:
                    if asyncio.iscoroutinefunction(fallback):
                        return await fallback(*args, **kwargs)
                    else:
                        return fallback(*args, **kwargs)
                except Exception as fallback_error:
                    logger.error(f"FAULT_TOLERANCE: Fallback failed for '{circuit_name}': {str(fallback_error)}")
                    raise
            else:
                raise
    
    @asynccontextmanager
    async def resilient_operation(self, circuit_name: str, operation_name: str = "operation"):
        """Context manager for resilient operations with automatic error handling."""
        circuit = self.get_circuit_breaker(circuit_name)
        start_time = time.time()
        
        try:
            logger.debug(f"RESILIENT_OPERATION_START: {operation_name} using circuit '{circuit_name}'")
            yield circuit
            
            duration = time.time() - start_time
            logger.debug(f"RESILIENT_OPERATION_SUCCESS: {operation_name} completed in {duration:.2f}s")
            
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"RESILIENT_OPERATION_FAILED: {operation_name} failed after {duration:.2f}s: {str(e)}")
            
            # Mark service as degraded if circuit is involved
            if circuit:
                self.degraded_services.add(circuit.service_type)
            
            raise
    
    async def health_check(self) -> Dict[str, Any]:
        """Get comprehensive health status of all protected services."""
        circuit_health = {}
        
        for name, circuit in self.circuit_breakers.items():
            circuit_health[name] = circuit.get_metrics()
        
        system_health = {
            'overall_status': 'HEALTHY' if not self.degraded_services else 'DEGRADED',
            'degraded_services': [service.value for service in self.degraded_services],
            'circuit_breakers': circuit_health,
            'active_recovery_tasks': len(self.recovery_tasks),
            'timestamp': datetime.utcnow().isoformat()
        }
        
        return system_health
    
    async def force_recovery(self, circuit_name: str) -> bool:
        """Force recovery attempt for a specific circuit breaker."""
        circuit = self.get_circuit_breaker(circuit_name)
        
        if not circuit:
            logger.warning(f"FAULT_TOLERANCE: Cannot force recovery, circuit '{circuit_name}' not found")
            return False
        
        async with circuit.lock:
            if circuit.state == CircuitState.OPEN:
                logger.info(f"FAULT_TOLERANCE: Forcing recovery for circuit '{circuit_name}'")
                circuit.state = CircuitState.HALF_OPEN
                circuit.half_open_calls = 0
                circuit.metrics.consecutive_failures = 0
                return True
        
        return False
    
    async def reset_degraded_services(self):
        """Reset degraded services status."""
        logger.info("FAULT_TOLERANCE: Resetting degraded services status")
        self.degraded_services.clear()
    
    def is_service_degraded(self, service_type: ServiceType) -> bool:
        """Check if a service type is currently degraded."""
        return service_type in self.degraded_services
    
    async def get_system_resilience_report(self) -> Dict[str, Any]:
        """Generate comprehensive system resilience report."""
        health = await self.health_check()
        
        # Calculate overall system metrics
        total_requests = sum(cb['metrics']['total_requests'] for cb in health['circuit_breakers'].values())
        total_failures = sum(cb['metrics']['failed_requests'] for cb in health['circuit_breakers'].values())
        total_timeouts = sum(cb['metrics']['timeouts'] for cb in health['circuit_breakers'].values())
        
        overall_success_rate = 0.0
        if total_requests > 0:
            overall_success_rate = ((total_requests - total_failures) / total_requests) * 100
        
        # Count circuit states
        circuit_states = {}
        for cb in health['circuit_breakers'].values():
            state = cb['state']
            circuit_states[state] = circuit_states.get(state, 0) + 1
        
        report = {
            'system_resilience': {
                'overall_health': health['overall_status'],
                'degraded_services_count': len(health['degraded_services']),
                'total_circuit_breakers': len(self.circuit_breakers),
                'circuit_states': circuit_states,
                'system_metrics': {
                    'total_requests': total_requests,
                    'total_failures': total_failures,
                    'total_timeouts': total_timeouts,
                    'overall_success_rate': round(overall_success_rate, 2)
                }
            },
            'detailed_health': health,
            'recommendations': self._generate_recommendations(health)
        }
        
        return report
    
    def _generate_recommendations(self, health: Dict[str, Any]) -> List[str]:
        """Generate recommendations based on system health."""
        recommendations = []
        
        # Check for frequently failing circuits
        for name, circuit_data in health['circuit_breakers'].items():
            metrics = circuit_data['metrics']
            
            if metrics['success_rate'] < 90 and metrics['total_requests'] > 10:
                recommendations.append(f"Circuit '{name}' has low success rate ({metrics['success_rate']}%). Consider investigating root cause.")
            
            if metrics['circuit_opens'] > 5:
                recommendations.append(f"Circuit '{name}' has opened {metrics['circuit_opens']} times. Consider adjusting thresholds or improving service reliability.")
            
            if circuit_data['state'] == 'OPEN':
                recommendations.append(f"Circuit '{name}' is currently OPEN. Service may be experiencing issues.")
        
        # Check for degraded services
        if health['degraded_services']:
            recommendations.append(f"Services currently degraded: {', '.join(health['degraded_services'])}. Monitor for recovery.")
        
        # General recommendations
        if not recommendations:
            recommendations.append("System resilience is operating normally. Continue monitoring.")
        
        return recommendations


# Global fault tolerance manager instance
fault_tolerance = FaultToleranceManager()


# Convenience decorators and functions
def circuit_breaker(
    circuit_name: str, 
    service_type: ServiceType = ServiceType.EXTERNAL_API,
    config: Optional[CircuitBreakerConfig] = None
):
    """Decorator to protect functions with circuit breaker."""
    def decorator(func):
        # Ensure circuit breaker exists
        if not fault_tolerance.get_circuit_breaker(circuit_name):
            fault_tolerance.register_circuit_breaker(circuit_name, service_type, config)
        
        async def wrapper(*args, **kwargs):
            return await fault_tolerance.protected_call(circuit_name, func, *args, **kwargs)
        
        return wrapper
    return decorator


async def resilient_db_operation(operation: Callable, *args, **kwargs):
    """Execute a database operation with resilience."""
    return await fault_tolerance.protected_call(
        "mongodb", 
        operation, 
        *args,
        fallback=lambda *a, **kw: None,  # Graceful degradation
        **kwargs
    )


async def resilient_browser_operation(operation: Callable, *args, **kwargs):
    """Execute a browser operation with resilience."""
    return await fault_tolerance.protected_call(
        "playwright_browser",
        operation,
        *args,
        **kwargs
    )


async def resilient_api_call(operation: Callable, *args, **kwargs):
    """Execute an external API call with resilience."""
    return await fault_tolerance.protected_call(
        "external_apis",
        operation,
        *args,
        **kwargs
    )