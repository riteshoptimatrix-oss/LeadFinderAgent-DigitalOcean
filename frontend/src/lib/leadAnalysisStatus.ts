export type LeadAnalysisDisplayStatus =
  | 'not_analyzed'
  | 'pending'
  | 'queued'
  | 'analyzing'
  | 'completed'
  | 'failed';

export interface LeadAnalysisDisplayState {
  status: LeadAnalysisDisplayStatus;
  label: string;
  progress: number;
  startedAt: string | null;
  isActive: boolean;
  isTerminal: boolean;
  rawStatus: string;
}

export interface LeadAnalysisInput {
  ai_analysis?: Record<string, unknown> | null;
  ai_score?: unknown;
  lead_score?: unknown;
  updated_at?: unknown;
}

const COMPLETED_STATUSES = new Set([
  'completed',
  'complete',
  'done',
  'success',
  'succeeded',
  'partial_success',
  'partial-success',
]);

const FAILED_STATUSES = new Set([
  'failed',
  'error',
  'failed_timeout',
  'timeout',
  'cancelled',
  'canceled',
]);

const PENDING_STATUSES = new Set(['pending', 'created', 'initializing']);
const QUEUED_STATUSES = new Set(['queued', 'waiting', 'retry']);
const ACTIVE_STATUSES = new Set([
  'processing',
  'analyzing',
  'running',
  'in_progress',
  'in-progress',
  'started',
  'collecting',
  'scoring',
  'saving',
]);

export const ACTIVE_ANALYSIS_DISPLAY_STATUSES: LeadAnalysisDisplayStatus[] = [
  'pending',
  'queued',
  'analyzing',
];

function normalizeProgress(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function parseTimestamp(value: unknown): number {
  if (typeof value !== 'string' || !value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPositiveNumber(value: unknown): boolean {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function buildState(
  status: LeadAnalysisDisplayStatus,
  label: string,
  progress: number,
  startedAt: string | null,
  rawStatus: string
): LeadAnalysisDisplayState {
  return {
    status,
    label,
    progress: normalizeProgress(progress),
    startedAt,
    isActive: ACTIVE_ANALYSIS_DISPLAY_STATUSES.includes(status),
    isTerminal: status === 'completed' || status === 'failed',
    rawStatus,
  };
}

/**
 * Backend-persisted analysis state. No age-based inference is done here:
 * a running job may legitimately take a long time, and only the backend can
 * confirm that a job has permanently failed.
 */
export function getLeadAnalysisState(lead: LeadAnalysisInput): LeadAnalysisDisplayState {
  const ai = lead?.ai_analysis || {};
  const rawStatus = String(ai.analysis_status || ai.status || '').trim().toLowerCase();
  const rawProgress = normalizeProgress(ai.progress);
  const startedAt = stringOrNull(ai.analysis_started_at) || stringOrNull(ai.started_at);

  const hasPositiveScore = [
    lead?.ai_score,
    ai.overall_score,
    ai.overall_ai_score,
    lead?.lead_score,
  ].some(isPositiveNumber);

  if (COMPLETED_STATUSES.has(rawStatus)) {
    return buildState('completed', 'Completed', 100, startedAt, rawStatus);
  }

  if (FAILED_STATUSES.has(rawStatus)) {
    return buildState('failed', 'Failed', rawProgress, startedAt, rawStatus);
  }

  if (PENDING_STATUSES.has(rawStatus)) {
    return buildState('pending', 'Pending', rawProgress || 5, startedAt, rawStatus);
  }

  if (QUEUED_STATUSES.has(rawStatus)) {
    return buildState('queued', 'Queued', rawProgress || 10, startedAt, rawStatus);
  }

  if (ACTIVE_STATUSES.has(rawStatus)) {
    return buildState('analyzing', 'Analyzing...', rawProgress, startedAt, rawStatus);
  }

  // Legacy records without an explicit status can be inferred from the score.
  if (hasPositiveScore && (!rawStatus || rawStatus === 'not_analyzed' || rawStatus === 'none')) {
    return buildState('completed', 'Completed', 100, startedAt, rawStatus);
  }

  return buildState('not_analyzed', 'Not Analyzed', 0, null, rawStatus);
}

interface DisplayStateOptions {
  isTracked?: boolean;
  isStarting?: boolean;
  ignoreTerminalBefore?: number;
}

/**
 * Single source of truth for the badge, progress bar and action button.
 * Local state may optimistically start an analysis, but a backend terminal
 * state always wins once it is newer than the local start request.
 */
export function getLeadAnalysisDisplayState(
  lead: LeadAnalysisInput,
  options: DisplayStateOptions = {}
): LeadAnalysisDisplayState {
  const base = getLeadAnalysisState(lead);

  if (options.isStarting) {
    return buildState(
      'analyzing',
      'Analyzing...',
      Math.max(base.progress, 15),
      base.startedAt || new Date().toISOString(),
      base.rawStatus
    );
  }

  if (base.status === 'completed') {
    return base;
  }

  if (base.status === 'failed') {
    const updatedAt = parseTimestamp(lead?.updated_at);
    const isStaleFailure = Boolean(
      options.isTracked &&
      options.ignoreTerminalBefore &&
      updatedAt > 0 &&
      updatedAt < options.ignoreTerminalBefore
    );

    if (isStaleFailure) {
      return buildState(
        'analyzing',
        'Analyzing...',
        Math.max(base.progress, 15),
        base.startedAt || new Date().toISOString(),
        base.rawStatus
      );
    }

    return base;
  }

  if (options.isTracked) {
    return buildState(
      'analyzing',
      'Analyzing...',
      Math.max(base.progress, 15),
      base.startedAt || new Date().toISOString(),
      base.rawStatus
    );
  }

  return base;
}
