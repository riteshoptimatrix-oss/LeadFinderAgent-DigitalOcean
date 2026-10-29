from datetime import datetime
from enum import Enum
from typing import Any, Optional
from .engine import StateMachine
from .definition import IllegalTransitionError


async def apply_and_persist(
    db: Any,
    collection: str,
    doc_id: Any,
    machine: StateMachine,
    target: Enum,
    reason: str = "",
    actor: str = "system",
    metadata: Optional[dict] = None,
    max_history: int = 100,
) -> bool:
    if not machine.can_transition_to(target):
        raise IllegalTransitionError(
            machine=machine.name,
            current=machine.state.value,
            target=target.value,
            allowed=[s.value for s in machine.possible_transitions()],
        )

    record = machine.transition_to(
        target=target,
        reason=reason,
        actor=actor,
        metadata=metadata,
    )

    now = datetime.utcnow()
    await db[collection].update_one(
        {"_id": doc_id},
        {
            "$set": {
                "status": target.value,
                "updated_at": now,
                "last_transition_at": now,
            },
            "$push": {
                "state_history": {
                    "$each": [record.to_dict()],
                    "$slice": -max_history,
                }
            },
        },
    )
    return True


async def batch_transition(
    db: Any,
    collection: str,
    query: dict,
    machine: StateMachine,
    target: Enum,
    reason: str = "",
    actor: str = "system",
) -> int:
    now = datetime.utcnow()
    result = await db[collection].update_many(
        query,
        {
            "$set": {
                "status": target.value,
                "updated_at": now,
                "last_transition_at": now,
            },
            "$push": {
                "state_history": {
                    "from": machine.state.value if machine.state else None,
                    "to": target.value,
                    "timestamp": now,
                    "reason": reason,
                    "actor": actor,
                }
            },
        },
    )
    return result.modified_count
