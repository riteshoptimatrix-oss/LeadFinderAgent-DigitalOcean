from enum import Enum
from typing import Optional
from .definition import StateMachineDefinition, IllegalTransitionError


class TransitionValidator:
    def __init__(self, definition: StateMachineDefinition):
        self._def = definition

    def validate(
        self, current: Optional[Enum], target: Enum, raise_on_error: bool = True
    ) -> bool:
        if current is None:
            return target == self._def.initial
        if target == current:
            return True
        valid = self._def.is_valid_transition(current, target)
        if not valid and raise_on_error:
            allowed = list(self._def.states.get(current, []))
            raise IllegalTransitionError(
                machine=self._def.name,
                current=current.value,
                target=target.value,
                allowed=[s.value for s in allowed],
            )
        return valid

    def can_reach_terminal(self, current: Enum) -> bool:
        visited = set()
        stack = [current]
        while stack:
            state = stack.pop()
            if state in visited:
                continue
            visited.add(state)
            if self._def.is_terminal(state):
                return True
            for next_state in self._def.states.get(state, []):
                if next_state not in visited:
                    stack.append(next_state)
        return False

    def possible_transitions(self, current: Enum) -> list[Enum]:
        return list(self._def.states.get(current, []))
