import contextvars
from typing import Optional

_current_user_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_user_id", default=None
)

_current_user_role: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_user_role", default=None
)

def set_current_user_id(user_id: Optional[str]) -> None:
    _current_user_id.set(user_id)

def get_current_user_id() -> Optional[str]:
    return _current_user_id.get()

def set_current_user_role(role: Optional[str]) -> None:
    _current_user_role.set(role)

def get_current_user_role() -> Optional[str]:
    return _current_user_role.get()
