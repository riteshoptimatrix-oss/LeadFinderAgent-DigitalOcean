"use client";

import {
  Clock,
  Timer,
  Layers,
  Server,
  Wifi,
  Loader2,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { formatDuration } from "./score";

interface AnalysisStatusBarProps {
  status: string;
  progress: number;
  stage: string;
  elapsed: number;
  estimated: number;
  queueLabel: string;
  worker: string;
  wsConnected: boolean;
}

function statusPill(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "COMPLETED" || s === "PARTIAL_SUCCESS")
    return { label: "Completed", className: "bg-green-50 text-green-700" };
  if (s === "FAILED")
    return { label: "Failed", className: "bg-red-50 text-red-600" };
  if (["QUEUED", "WAITING"].includes(s))
    return { label: "Waiting", className: "bg-gray-100 text-gray-600" };
  return { label: "Analyzing", className: "bg-blue-50 text-blue-700" };
}

function Item({
  label,
  children,
  className,
  hideOnMobile,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", hideOnMobile && "hidden sm:flex", className)}>
      <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 min-w-[64px]">
        {label}
      </span>
      <div className="flex items-center gap-2 min-w-0">{children}</div>
    </div>
  );
}

export function AnalysisStatusBar({
  status,
  progress,
  stage,
  elapsed,
  estimated,
  queueLabel,
  worker,
  wsConnected,
}: AnalysisStatusBarProps) {
  const pill = statusPill(status);
  const running =
    !["COMPLETED", "PARTIAL_SUCCESS", "FAILED"].includes(
      (status || "").toUpperCase()
    );

  return (
    <div className="mx-6 lg:mx-8 shrink-0">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-wrap items-stretch divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
        {/* Status */}
        <Item label="Status">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold",
              pill.className
            )}
          >
            {running && (
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            )}
            {pill.label}
          </span>
        </Item>

        {/* Progress */}
        <Item label="Progress" className="flex-1 min-w-[200px]">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out",
                running ? "bg-blue-600" : "bg-green-500"
              )}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
          <span className="text-[13px] font-semibold text-gray-900 tabular-nums w-11 text-right">
            {Math.round(progress)}%
          </span>
        </Item>

        {/* Current Stage */}
        <Item label="Stage" className="flex-1 min-w-[160px]">
          {running ? (
            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
          )}
          <span className="text-[13px] font-medium text-gray-700 truncate">
            {stage || "—"}
          </span>
        </Item>

        {/* Elapsed */}
        <Item label="Elapsed" hideOnMobile>
          <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="text-[13px] font-semibold text-gray-700 tabular-nums">
            {formatDuration(elapsed)}
          </span>
        </Item>

        {/* Estimated */}
        <Item label="Remaining" hideOnMobile>
          <Timer className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="text-[13px] font-semibold text-gray-700 tabular-nums">
            {running ? formatDuration(estimated) : "—"}
          </span>
        </Item>

        {/* Queue */}
        <Item label="Queue" hideOnMobile>
          <Layers className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="text-[13px] font-semibold text-gray-700 tabular-nums">
            {queueLabel}
          </span>
        </Item>

        {/* Worker */}
        <Item label="Worker" className="pr-5">
          <Server className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="text-[13px] font-semibold text-gray-700">
            {worker || "Worker 1"}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              wsConnected
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-600"
            )}
          >
            <Wifi className="w-3 h-3" />
            {wsConnected ? "Active" : "Reconnecting"}
          </span>
        </Item>
      </div>
    </div>
  );
}
