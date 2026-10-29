from datetime import datetime
from typing import Any, Optional
from enum import Enum


class TransitionRecord:
    def __init__(
        self,
        from_state: Optional[str],
        to_state: str,
        timestamp: Optional[datetime] = None,
        reason: str = "",
        actor: str = "system",
        metadata: Optional[dict[str, Any]] = None,
    ):
        self.from_state = from_state
        self.to_state = to_state
        self.timestamp = timestamp or datetime.utcnow()
        self.reason = reason
        self.actor = actor
        self.metadata = metadata or {}

    def to_dict(self) -> dict:
        return {
            "from": self.from_state,
            "to": self.to_state,
            "timestamp": self.timestamp,
            "reason": self.reason,
            "actor": self.actor,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "TransitionRecord":
        return cls(
            from_state=data.get("from"),
            to_state=data["to"],
            timestamp=data.get("timestamp"),
            reason=data.get("reason", ""),
            actor=data.get("actor", "system"),
            metadata=data.get("metadata", {}),
        )

    def __repr__(self) -> str:
        return (
            f"TransitionRecord({self.from_state} -> {self.to_state}, "
            f"reason={self.reason!r}, actor={self.actor!r})"
        )
