from app.models.ai_analysis import AIAnalysisState

from app.models.enrichment_job import EnrichmentJobState
from .definition import StateMachineDefinition


# ── AI Analysis Job State Machine ───────────────────────────────────────

AI_ANALYSIS_JOB = StateMachineDefinition(
    name="ai_analysis_job",
    initial=AIAnalysisState.WAITING,
    states={
        AIAnalysisState.WAITING: [
            AIAnalysisState.STARTED, AIAnalysisState.RETRY,
            AIAnalysisState.FAILED, AIAnalysisState.CANCELLED, AIAnalysisState.SKIPPED,
        ],
        AIAnalysisState.PENDING: [
            AIAnalysisState.WAITING, AIAnalysisState.RETRY,
            AIAnalysisState.FAILED, AIAnalysisState.CANCELLED, AIAnalysisState.SKIPPED,
        ],
        AIAnalysisState.RETRY: [
            AIAnalysisState.STARTED, AIAnalysisState.FAILED,
            AIAnalysisState.CANCELLED, AIAnalysisState.SKIPPED,
        ],
        AIAnalysisState.STARTED: [
            AIAnalysisState.COLLECTING, AIAnalysisState.RUNNING,
            AIAnalysisState.FAILED, AIAnalysisState.CANCELLED, AIAnalysisState.RETRY,
        ],
        AIAnalysisState.RUNNING: [
            AIAnalysisState.COLLECTING, AIAnalysisState.ANALYZING,
            AIAnalysisState.FAILED, AIAnalysisState.CANCELLED, AIAnalysisState.RETRY,
        ],
        AIAnalysisState.COLLECTING: [
            AIAnalysisState.ANALYZING, AIAnalysisState.RUNNING,
            AIAnalysisState.FAILED, AIAnalysisState.CANCELLED, AIAnalysisState.RETRY,
        ],
        AIAnalysisState.ANALYZING: [
            AIAnalysisState.SCORING,
            AIAnalysisState.FAILED, AIAnalysisState.CANCELLED, AIAnalysisState.RETRY,
        ],
        AIAnalysisState.SCORING: [
            AIAnalysisState.SAVING,
            AIAnalysisState.FAILED, AIAnalysisState.CANCELLED, AIAnalysisState.RETRY,
        ],
        AIAnalysisState.SAVING: [
            AIAnalysisState.COMPLETED, AIAnalysisState.PARTIAL_SUCCESS,
            AIAnalysisState.FAILED, AIAnalysisState.CANCELLED, AIAnalysisState.RETRY,
        ],
        # Terminal states
        AIAnalysisState.COMPLETED: [],
        AIAnalysisState.PARTIAL_SUCCESS: [],
        AIAnalysisState.SUCCESS: [],
        AIAnalysisState.FAILED: [AIAnalysisState.WAITING],  # manual retry
        AIAnalysisState.SKIPPED: [AIAnalysisState.WAITING],
        AIAnalysisState.CANCELLED: [],
        AIAnalysisState.TIMEOUT: [AIAnalysisState.WAITING],
        AIAnalysisState.UNKNOWN: [],
        AIAnalysisState.EMPTY: [],
    },
    terminal={
        AIAnalysisState.COMPLETED, AIAnalysisState.PARTIAL_SUCCESS,
        AIAnalysisState.SUCCESS, AIAnalysisState.FAILED,
        AIAnalysisState.SKIPPED, AIAnalysisState.CANCELLED,
        AIAnalysisState.TIMEOUT, AIAnalysisState.UNKNOWN, AIAnalysisState.EMPTY,
    },
    error_states={
        AIAnalysisState.FAILED, AIAnalysisState.TIMEOUT,
        AIAnalysisState.UNKNOWN, AIAnalysisState.EMPTY,
    },
)

# ── AI Analysis Queue State Machine ─────────────────────────────────────

AI_ANALYSIS_QUEUE = StateMachineDefinition(
    name="ai_analysis_queue",
    initial=AIAnalysisState.WAITING,
    states={
        AIAnalysisState.WAITING: [AIAnalysisState.STARTED, AIAnalysisState.FAILED, AIAnalysisState.CANCELLED],
        AIAnalysisState.PENDING: [AIAnalysisState.WAITING, AIAnalysisState.FAILED, AIAnalysisState.CANCELLED],
        AIAnalysisState.QUEUED: [AIAnalysisState.STARTED, AIAnalysisState.FAILED, AIAnalysisState.CANCELLED],
        AIAnalysisState.STARTED: [
            AIAnalysisState.WAITING, AIAnalysisState.FAILED, AIAnalysisState.CANCELLED,
        ],
        AIAnalysisState.COMPLETED: [],
        AIAnalysisState.PARTIAL_SUCCESS: [],
        AIAnalysisState.SUCCESS: [],
        AIAnalysisState.FAILED: [AIAnalysisState.WAITING],
        AIAnalysisState.SKIPPED: [AIAnalysisState.WAITING],
        AIAnalysisState.CANCELLED: [],
        AIAnalysisState.TIMEOUT: [AIAnalysisState.WAITING],
        AIAnalysisState.UNKNOWN: [],
        AIAnalysisState.EMPTY: [],
    },
    terminal={
        AIAnalysisState.COMPLETED, AIAnalysisState.PARTIAL_SUCCESS, AIAnalysisState.SUCCESS,
        AIAnalysisState.FAILED, AIAnalysisState.SKIPPED, AIAnalysisState.CANCELLED,
        AIAnalysisState.TIMEOUT, AIAnalysisState.UNKNOWN, AIAnalysisState.EMPTY,
    },
    error_states={AIAnalysisState.FAILED, AIAnalysisState.TIMEOUT, AIAnalysisState.UNKNOWN, AIAnalysisState.EMPTY},
)


# ── Enrichment Job State Machine ────────────────────────────────────────

ENRICHMENT_JOB = StateMachineDefinition(
    name="enrichment_job",
    initial=EnrichmentJobState.QUEUED,
    states={
        EnrichmentJobState.QUEUED: [EnrichmentJobState.RUNNING, EnrichmentJobState.FAILED, EnrichmentJobState.CANCELLED],
        EnrichmentJobState.RUNNING: [
            EnrichmentJobState.COMPLETED, EnrichmentJobState.QUEUED,  # retry
            EnrichmentJobState.FAILED, EnrichmentJobState.CANCELLED,
        ],
        EnrichmentJobState.COMPLETED: [],
        EnrichmentJobState.FAILED: [EnrichmentJobState.QUEUED],  # retry
        EnrichmentJobState.PAUSED: [EnrichmentJobState.QUEUED, EnrichmentJobState.CANCELLED],
        EnrichmentJobState.CANCELLED: [],
    },
    terminal={EnrichmentJobState.COMPLETED, EnrichmentJobState.FAILED, EnrichmentJobState.CANCELLED},
    error_states={EnrichmentJobState.FAILED},
)

# ── Registry ────────────────────────────────────────────────────────────

MACHINES: dict[str, StateMachineDefinition] = {
    "ai_analysis_job": AI_ANALYSIS_JOB,
    "ai_analysis_queue": AI_ANALYSIS_QUEUE,
    "enrichment_job": ENRICHMENT_JOB,
}


def get_machine(name: str) -> StateMachineDefinition:
    machine = MACHINES.get(name)
    if machine is None:
        raise KeyError(f"Unknown state machine: {name}. Available: {list(MACHINES.keys())}")
    return machine
