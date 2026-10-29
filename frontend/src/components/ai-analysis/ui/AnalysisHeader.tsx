"use client";

import { Brain, RefreshCw, Download, X, Loader2 } from "lucide-react";
import { cn } from "@/src/lib/utils";

interface AnalysisHeaderProps {
  queueId: string;
  status: string;
  live: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onExport: () => void;
  onCancel: () => void;
}

function statusTone(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "COMPLETED" || s === "PARTIAL_SUCCESS")
    return { label: "Completed", className: "bg-green-50 text-green-700 ring-green-100", pulse: false };
  if (s === "FAILED")
    return { label: "Failed", className: "bg-red-50 text-red-600 ring-red-100", pulse: false };
  if (["QUEUED", "WAITING"].includes(s))
    return { label: "Queued", className: "bg-gray-100 text-gray-600 ring-gray-200", pulse: false };
  return { label: "Analyzing", className: "bg-blue-50 text-blue-700 ring-blue-100", pulse: true };
}

export function AnalysisHeader({
  queueId,
  status,
  live,
  refreshing,
  onRefresh,
  onExport,
  onCancel,
}: AnalysisHeaderProps) {
  const tone = statusTone(status);

  const btn =
    "inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border text-[13px] font-semibold transition-colors";

  return (
    <div className="flex items-start justify-between gap-6 px-6 lg:px-8 pt-6 pb-5 shrink-0">
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-11 h-11 rounded-xl bg-blue-50 ring-1 ring-blue-100 flex items-center justify-center shrink-0">
          <Brain className="w-5 h-5 text-blue-600" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[34px] font-semibold tracking-tight text-gray-900 leading-none">
              AI Analysis
            </h1>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
                tone.className
              )}
            >
              {tone.pulse && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              )}
              {tone.label}
            </span>
            {live && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-green-50 text-green-700 ring-1 ring-green-100">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <p className="text-[14px] text-gray-500 mt-1.5">
            Analyze website, business quality, SEO, technology, contacts and AI
            opportunity.
          </p>
          <p className="text-[12px] text-gray-400 mt-1 font-mono">
            Queue #{queueId.slice(0, 8)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className={cn(
            btn,
            "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-60"
          )}
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Refresh
        </button>
        <button
          type="button"
          onClick={onExport}
          className={cn(
            btn,
            "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          )}
        >
          <Download className="w-4 h-4" />
          Export Report
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            btn,
            "border-red-200 bg-white text-red-600 hover:bg-red-50"
          )}
        >
          <X className="w-4 h-4" />
          Cancel Analysis
        </button>
      </div>
    </div>
  );
}
