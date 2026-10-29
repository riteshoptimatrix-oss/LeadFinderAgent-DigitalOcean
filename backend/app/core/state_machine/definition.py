from typing import Any, Optional
from enum import Enum


class StateMachineDefinition:
    def __init__(
        self,
        name: str,
        states: dict[Enum, list[Enum]],
        initial: Enum,
        terminal: Optional[set[Enum]] = None,
        error_states: Optional[set[Enum]] = None,
    ):
        self.name = name
        self.states = states
        self.initial = initial
        self.terminal = terminal or set()
        self.error_states = error_states or set()

        all_values = set(states.keys())
        for from_state, to_states in states.items():
            for to_state in to_states:
                if to_state not in all_values:
                    raise ValueError(
                        f"[{name}] Target state {to_state} is not a defined state"
                    )

    def is_valid_transition(self, current: Enum, target: Enum) -> bool:
        if current not in self.states:
            return False
        return target in self.states[current]

    def is_terminal(self, state: Enum) -> bool:
        return state in self.terminal

    def is_error(self, state: Enum) -> bool:
        return state in self.error_states

    def can_transition_from(self, state: Enum) -> bool:
        return len(self.states.get(state, [])) > 0

    def assert_valid(self, current: Enum, target: Enum) -> None:
        if not self.is_valid_transition(current, target):
            allowed = [s.value for s in self.states.get(current, [])]
            raise IllegalTransitionError(
                machine=self.name,
                current=current.value,
                target=target.value,
                allowed=allowed,
            )


class IllegalTransitionError(ValueError):
    def __init__(self, machine: str, current: str, target: str, allowed: list[str]):
        self.machine = machine
        self.current = current
        self.target = target
        self.allowed = allowed
        super().__init__(
            f"[{machine}] Illegal transition: {current} -> {target}. "
            f"Allowed transitions from {current}: {allowed}"
        )
