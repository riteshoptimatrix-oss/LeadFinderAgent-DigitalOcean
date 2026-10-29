"use client";

import { Activity } from "lucide-react";
import { cn } from "@/src/lib/utils";
import type { TimelineEvent } from "./types";

interface ActivityFeedProps {
  events: TimelineEvent[];
  live?: boolean;
  heightClass?: string;
}

function relativeTime(timestamp: string): string {
  const then = new Date(timestamp).getTime();
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 10) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const STATUS_DOT: Record<TimelineEvent["status"], string> = {
  success: "bg-green-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  info: "bg-blue-500",
};

export function ActivityFeed({ events, live = true, heightClass = "max-h-[300px]" }: ActivityFeedProps) {
  const ordered = [...events].reverse();

  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-gray-900 flex items-center gap-2">
          <Activity className="w-4 h-4 text-gray-400" />
          Live Activity
        </h3>
        {live && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-green-600 bg-green-50 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            LIVE
          </span>
        )}
      </div>

      <div className={cn("overflow-y-auto px-4 py-3", heightClass)}>
        {ordered.length === 0 ? (
          <p className="text-[12px] text-gray-400 py-6 text-center">No activity yet.</p>
        ) : (
          <ul className="space-y-1">
            {ordered.map((evt, i) => (
              <li
                key={evt.id}
                className={cn(
                  "flex items-center gap-2.5 py-1.5",
                  i === 0 && "animate-[fade-up_0.2s_ease-out]"
                )}
              >
                <span className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[evt.status])} />
                <span className="text-[12px] text-gray-600 truncate flex-1">{evt.message}</span>
                <span className="text-[11px] text-gray-300 tabular-nums shrink-0">
                  {relativeTime(evt.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
