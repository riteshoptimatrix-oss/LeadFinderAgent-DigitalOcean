import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getApiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

const LOCATION_PLACEHOLDERS = new Set(["null", "undefined", "n/a", "-", "--", "none", "unknown"]);

function cleanLocationPart(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).replace(/^[,，\s]+|[,，\s]+$/g, "").trim();
  if (!s || LOCATION_PLACEHOLDERS.has(s.toLowerCase())) return undefined;
  return s;
}

/**
 * Extracts a user-friendly error message from an API error response,
 * inspecting standard FastAPI details, custom error envelopes ({error: {message: ...}}),
 * validation error arrays, and fallback HTTP error messages.
 */
export function getErrorMessage(err: any, fallback = "An error occurred"): string {
  if (!err) return fallback;
  const data = err?.response?.data;
  if (typeof data?.error?.message === "string" && data.error.message.trim()) {
    return data.error.message;
  }
  if (typeof data?.detail === "string" && data.detail.trim()) {
    return data.detail;
  }
  if (Array.isArray(data?.detail) && data.detail.length > 0) {
    return data.detail.map((d: any) => d?.msg || d?.message || (typeof d === "string" ? d : JSON.stringify(d))).join(", ");
  }
  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }
  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error;
  }
  if (typeof err?.message === "string" && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

/**
 * Formats a lead's location as: State → City → Area (Area only when present),
 * or State → City. Never renders undefined/null/-- or stray separators.
 */
export function formatLocation(lead: { state?: unknown; city?: unknown; area?: unknown } | null | undefined): string {
  const parts = [
    cleanLocationPart(lead?.state),
    cleanLocationPart(lead?.city),
    cleanLocationPart(lead?.area),
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" → ") : "—";
}
