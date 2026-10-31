"""Shared analysis lifecycle constants used by API reconciliation and workers."""

# A running job may legitimately take several minutes. Only treat it as
# abandoned after the same window used by the worker's stale-job detector.
ANALYSIS_STALE_SECONDS = 900

# Jobs that are waiting for a worker slot are not "running". They must not be
# failed merely because a bulk queue is large and has not reached them yet.
WAITING_ANALYSIS_JOB_STATUSES = frozenset({
    "WAITING",
    "PENDING",
    "QUEUED",
    "RETRY",
})

RUNNING_ANALYSIS_JOB_STATUSES = frozenset({
    "STARTED",
    "RUNNING",
    "COLLECTING",
    "ANALYZING",
    "SCORING",
    "SAVING",
})

ACTIVE_ANALYSIS_JOB_STATUSES = WAITING_ANALYSIS_JOB_STATUSES | RUNNING_ANALYSIS_JOB_STATUSES
ACTIVE_ANALYSIS_QUEUE_STATUSES = frozenset({
    "WAITING",
    "PENDING",
    "QUEUED",
    "STARTED",
    "RUNNING",
    "COLLECTING",
    "ANALYZING",
    "SCORING",
    "SAVING",
    "RETRY",
})
TERMINAL_ANALYSIS_JOB_STATUSES = frozenset({
    "COMPLETED",
    "SUCCESS",
    "PARTIAL_SUCCESS",
    "FAILED",
    "CANCELLED",
    "TIMEOUT",
})
