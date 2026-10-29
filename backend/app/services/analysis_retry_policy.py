"""
Retry policy for AI website analysis.

Bulk analysis rule:
  - Retry up to 3 times ONLY for transient failures (timeout, network error,
    temporary failures).
  - NEVER retry permanent failures (404, invalid URL, no website, etc.).

Any failure message that does not clearly indicate a permanent problem is
treated as retryable (safe default), so genuine transient errors are never
lost to a permanent classification.
"""

from typing import Any, List, Optional

# Substrings that indicate a PERMANENT failure — never retry.
_PERMANENT_MARKERS = (
    "404",
    "not found",
    "does not exist",
    "doesn't exist",
    "cannot be found",
    "invalid url",
    "malformed url",
    "malformed",
    "no website",
    "no professional website",
    "missing website",
    "invalid domain",
    "invalid host",
    "empty website",
    "invalid website",
    "non-professional",
    "not a website",
)

# Substrings that indicate a TRANSIENT failure — safe to retry.
_RETRYABLE_MARKERS = (
    "timeout",
    "timed out",
    "timedout",
    "time out",
    "network",
    "connection",
    "refused",
    "reset by peer",
    "econnreset",
    "econnrefused",
    "unreachable",
    "temporarily",
    "temporary",
    "transient",
    "intermittent",
    "unavailable",
    "rate limit",
    "too many requests",
    "throttl",
    "server error",
    "internal server error",
    "bad gateway",
    "gateway",
    "service unavailable",
    "dns",
    "name resolution",
    "could not resolve",
    "operation timed out",
    "deadline",
    "stale",
    "retry",
    "429",
    "500",
    "502",
    "503",
    "504",
    "5xx",
)


def is_retryable_error_text(text: Optional[str]) -> bool:
    """
    Classify a single error message.

    Returns True when the failure should be retried (transient / unknown),
    False when it is a permanent failure (404, invalid URL, no website, ...).
    """
    if not text:
        return True

    lowered = str(text).lower()

    # Permanent markers win: a 404 / invalid URL / no-website must never retry,
    # even if the message happens to mention the word "retry".
    for marker in _PERMANENT_MARKERS:
        if marker in lowered:
            return False

    for marker in _RETRYABLE_MARKERS:
        if marker in lowered:
            return True

    # Unknown error — safe default is to retry.
    return True


def is_retryable_errors(errors: Any) -> bool:
    """
    Classify a list (or single) of error messages.

    If ANY reported error is a permanent failure, the whole job is treated as
    permanently failed (a 404 means the site is gone regardless of the other
    transient errors captured alongside it).
    """
    if not errors:
        return True

    if isinstance(errors, str):
        errors = [errors]

    for error in errors:
        if isinstance(error, dict):
            error = error.get("message") or error.get("error") or str(error)
        if not is_retryable_error_text(str(error)):
            return False

    return True
