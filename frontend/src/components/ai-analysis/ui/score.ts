export type ScoreTier =
  | "excellent"
  | "good"
  | "average"
  | "poor"
  | "critical"
  | "pending";

export interface TierMeta {
  label: string;
  text: string;
  stroke: string;
  bg: string;
  dot: string;
}

export function getScoreTier(score: number): ScoreTier {
  if (!score || score <= 0) return "pending";
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "average";
  if (score >= 40) return "poor";
  return "critical";
}

export const TIER_META: Record<ScoreTier, TierMeta> = {
  excellent: {
    label: "Excellent",
    text: "text-green-600",
    stroke: "stroke-green-500",
    bg: "bg-green-50",
    dot: "bg-green-500",
  },
  good: {
    label: "Good",
    text: "text-blue-600",
    stroke: "stroke-blue-500",
    bg: "bg-blue-50",
    dot: "bg-blue-500",
  },
  average: {
    label: "Average",
    text: "text-amber-600",
    stroke: "stroke-amber-500",
    bg: "bg-amber-50",
    dot: "bg-amber-500",
  },
  poor: {
    label: "Poor",
    text: "text-red-600",
    stroke: "stroke-red-500",
    bg: "bg-red-50",
    dot: "bg-red-500",
  },
  critical: {
    label: "Critical",
    text: "text-red-600",
    stroke: "stroke-red-600",
    bg: "bg-red-50",
    dot: "bg-red-600",
  },
  pending: {
    label: "Pending",
    text: "text-gray-400",
    stroke: "stroke-gray-200",
    bg: "bg-gray-50",
    dot: "bg-gray-300",
  },
};

export type Priority = "High" | "Medium" | "Low";

export function getPriority(score: number): Priority {
  if (!score || score <= 0) return "Low";
  if (score >= 80) return "High";
  if (score >= 60) return "Medium";
  return "Low";
}

export const PRIORITY_META: Record<
  Priority,
  { text: string; bg: string; ring: string }
> = {
  High: { text: "text-red-600", bg: "bg-red-50", ring: "ring-red-100" },
  Medium: { text: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-100" },
  Low: { text: "text-gray-500", bg: "bg-gray-50", ring: "ring-gray-200" },
};

export function getOpportunityLabel(score: number): string {
  if (!score || score <= 0) return "Pending";
  if (score >= 80) return "Very High";
  if (score >= 65) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

export function getQualityLabel(score: number): string {
  if (!score || score <= 0) return "Pending";
  return TIER_META[getScoreTier(score)].label;
}

export function formatDuration(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
