"""
Unified State Machine
=====================
Single canonical state machine for ALL search jobs.
Guarantees every search reaches exactly one of:
  - COMPLETED
  - FAILED
  - STOPPED
  - CANCELLED
  - TIMEOUT

Thread-safe: uses asyncio.Lock for all transitions.
Events emitted on every transition for WebSocket broadcast.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional, Set, Callable


class SearchState(str, Enum):
    CREATED = "CREATED"
    QUEUED = "QUEUED"
    INITIALIZING = "INITIALIZING"
    OPENING_MAPS = "OPENING_MAPS"
    SEARCHING = "SEARCHING"
    DISCOVERING_RESULTS = "DISCOVERING_RESULTS"
    COLLECTING_BUSINESSES = "COLLECTING_BUSINESSES"
    EXTRACTING_DETAILS = "EXTRACTING_DETAILS"
    VALIDATING = "VALIDATING"
    SAVING = "SAVING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    STOPPED = "STOPPED"
    PAUSED = "PAUSED"
    CANCELLED = "CANCELLED"
    TIMEOUT = "TIMEOUT"

    @classmethod
    def terminal_states(cls) -> set[SearchState]:
        return {
            cls.COMPLETED,
            cls.FAILED,
            cls.STOPPED,
            cls.CANCELLED,
            cls.TIMEOUT,
        }

    @classmethod
    def is_terminal(cls, state: SearchState) -> bool:
        return state in cls.terminal_states()


TERMINAL_STATES: set[SearchState] = SearchState.terminal_states()


TRANSITIONS: dict[SearchState, set[SearchState]] = {
    SearchState.CREATED: {
        SearchState.QUEUED,
        SearchState.FAILED,
        SearchState.CANCELLED,
    },
    SearchState.QUEUED: {
        SearchState.INITIALIZING,
        SearchState.PAUSED,
        SearchState.CANCELLED,
        SearchState.FAILED,
    },
    SearchState.INITIALIZING: {
        SearchState.OPENING_MAPS,
        SearchState.FAILED,
        SearchState.CANCELLED,
        SearchState.TIMEOUT,
    },
    SearchState.OPENING_MAPS: {
        SearchState.SEARCHING,
        SearchState.FAILED,
        SearchState.CANCELLED,
        SearchState.TIMEOUT,
    },
    SearchState.SEARCHING: {
        SearchState.DISCOVERING_RESULTS,
        SearchState.PAUSED,
        SearchState.FAILED,
        SearchState.CANCELLED,
        SearchState.TIMEOUT,
    },
    SearchState.DISCOVERING_RESULTS: {
        SearchState.COLLECTING_BUSINESSES,
        SearchState.FAILED,
        SearchState.CANCELLED,
        SearchState.TIMEOUT,
    },
    SearchState.COLLECTING_BUSINESSES: {
        SearchState.EXTRACTING_DETAILS,
        SearchState.PAUSED,
        SearchState.FAILED,
        SearchState.CANCELLED,
        SearchState.TIMEOUT,
    },
    SearchState.EXTRACTING_DETAILS: {
        SearchState.VALIDATING,
        SearchState.PAUSED,
        SearchState.FAILED,
        SearchState.CANCELLED,
        SearchState.TIMEOUT,
    },
    SearchState.VALIDATING: {
        SearchState.SAVING,
        SearchState.PAUSED,
        SearchState.FAILED,
        SearchState.CANCELLED,
        SearchState.TIMEOUT,
    },
    SearchState.SAVING: {
        SearchState.COMPLETED,
        SearchState.FAILED,
        SearchState.CANCELLED,
        SearchState.TIMEOUT,
    },
    SearchState.PAUSED: {
        SearchState.QUEUED,
        SearchState.INITIALIZING,
        SearchState.OPENING_MAPS,
        SearchState.SEARCHING,
        SearchState.DISCOVERING_RESULTS,
        SearchState.COLLECTING_BUSINESSES,
        SearchState.EXTRACTING_DETAILS,
        SearchState.VALIDATING,
        SearchState.CANCELLED,
        SearchState.FAILED,
    },
    SearchState.COMPLETED: set(),
    SearchState.FAILED: set(),
    SearchState.STOPPED: set(),
    SearchState.CANCELLED: set(),
    SearchState.TIMEOUT: set(),
}


class StateTransitionError(Exception):
    def __init__(self, current: SearchState, target: SearchState):
        self.current = current
        self.target = target
        super().__init__(f"Invalid transition: {current.value} -> {target.value}")


class TerminalStateError(Exception):
    def __init__(self, state: SearchState):
        self.state = state
        super().__init__(f"Cannot transition from terminal state: {state.value}")


class UnifiedStateMachine:
    def __init__(
        self,
        job_id: str,
        initial_state: SearchState = SearchState.CREATED,
        on_transition: Optional[Callable[[SearchState, SearchState, Optional[Dict]], None]] = None,
    ):
        self.job_id = job_id
        self._state = initial_state
        self._lock = asyncio.Lock()
        self._on_transition = on_transition
        self._history: list[dict] = []

    @property
    def state(self) -> SearchState:
        return self._state

    @property
    def history(self) -> list[dict]:
        return list(self._history)

    @property
    def is_terminal(self) -> bool:
        return self._state in TERMINAL_STATES

    async def transition_to(
        self,
        target: SearchState,
        context: Optional[Dict] = None,
    ) -> SearchState:
        async with self._lock:
            return self._transition(target, context)

    def _transition(
        self,
        target: SearchState,
        context: Optional[Dict] = None,
    ) -> SearchState:
        if target == self._state:
            return self._state

        if self._state in TERMINAL_STATES:
            raise TerminalStateError(self._state)

        allowed = TRANSITIONS.get(self._state, set())

        if target not in allowed:
            if target in {SearchState.FAILED, SearchState.CANCELLED, SearchState.TIMEOUT}:
                pass
            else:
                raise StateTransitionError(self._state, target)

        prev = self._state
        self._state = target

        entry = {
            "from": prev.value,
            "to": target.value,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "context": context or {},
        }
        self._history.append(entry)

        if self._on_transition:
            try:
                self._on_transition(prev, target, context)
            except Exception:
                pass

        return self._state
