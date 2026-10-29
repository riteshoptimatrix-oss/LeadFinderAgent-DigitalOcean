"use client";

import { CheckCircle2, CircleAlert, CircleX, Info, ListChecks } from "lucide-react";
import { cn } from "@/src/lib/utils";
import type { TimelineEvent } from "./types";

interface EventTimelineProps {
  events: TimelineEvent[];
  heightClass?: string;
}

function EventIcon({ status }: { status: TimelineEvent["status"] }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "warning":
      return <CircleAlert className="w-4 h-4 text-amber-500" />;
    case "error":
      return <CircleX className="w-4 h-4 text-red-500" />;
    default:
      return <Info className="w-4 h-4 text-blue-500" />;
  }
}

export function EventTimeline({ events, heightClass = "max-h-[320px]" }: EventTimelineProps) {
  const ordered = [...events].reverse();

  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-gray-400" />
          Event Logs
        </h3>
        <span className="text-[12px] text-gray-400 tabular-nums">{events.length} events</span>
      </div>

      <div className={cn("overflow-y-auto px-5 py-4", heightClass)}>
        {ordered.length === 0 ? (
          <div className="py-8 text-center">
            <Info className="w-6 h-6 text-gray-200 mx-auto mb-2" />
            <p className="text-[13px] text-gray-400">Waiting for worker events…</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gray-100" />
            <ul className="space-y-1">
              {ordered.map((evt) => (
                <li key={evt.id} className="relative flex gap-3 pl-5 py-1">
                  <span className="absolute left-0 top-[7px] bg-white">
                    <EventIcon status={evt.status} />
                  </span>
                  <div className="flex items-baseline justify-between gap-3 min-w-0 flex-1">
                    <span className="text-[13px] text-gray-600 truncate">{evt.message}</span>
                    <span className="text-[11px] text-gray-300 tabular-nums shrink-0">{evt.time}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
