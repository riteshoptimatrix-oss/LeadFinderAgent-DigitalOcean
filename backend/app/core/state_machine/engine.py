import logging
from datetime import datetime
from enum import Enum
from typing import Any, Optional, Callable
from .definition import StateMachineDefinition
from .validator import TransitionValidator
from .history import TransitionRecord

logger = logging.getLogger(__name__)


class StateMachine:
    def __init__(
        self,
        definition: StateMachineDefinition,
        current_state: Optional[Enum] = None,
        on_transition: Optional[Callable[["StateMachine", TransitionRecord], None]] = None,
    ):
        self._def = definition
        self._validator = TransitionValidator(definition)
        self._current = current_state or definition.initial
        self._history: list[TransitionRecord] = []
        self._on_transition = on_transition

    @property
    def state(self) -> Enum:
        return self._current

    @property
    def name(self) -> str:
        return self._def.name

    @property
    def definition(self) -> StateMachineDefinition:
        return self._def

    @property
    def history(self) -> list[TransitionRecord]:
        return list(self._history)

    def transition_to(
        self,
        target: Enum,
        reason: str = "",
        actor: str = "system",
        metadata: Optional[dict[str, Any]] = None,
    ) -> TransitionRecord:
        if target == self._current:
            return self._history[-1] if self._history else TransitionRecord(
                from_state=self._current.value,
                to_state=target.value,
                reason=reason,
                actor=actor,
                metadata=metadata,
            )

        self._validator.validate(self._current, target, raise_on_error=True)

        record = TransitionRecord(
            from_state=self._current.value,
            to_state=target.value,
            reason=reason,
            actor=actor,
            metadata=metadata,
        )
        self._history.append(record)
        old_value = self._current.value
        self._current = target

        if self._on_transition:
            try:
                self._on_transition(self, record)
            except Exception:
                logger.exception(f"[{self.name}] on_transition callback failed")

        logger.info(
            f"TRANSITION [{self.name}]: {old_value} -> {target.value} "
            f"(reason={reason!r}, actor={actor!r})"
        )
        return record

    def can_transition_to(self, target: Enum) -> bool:
        return self._validator.validate(self._current, target, raise_on_error=False)

    def reset(self, state: Optional[Enum] = None) -> None:
        self._current = state or self._def.initial
        self._history.clear()
        logger.info(f"TRANSITION [{self.name}]: Reset to {self._current.value}")
