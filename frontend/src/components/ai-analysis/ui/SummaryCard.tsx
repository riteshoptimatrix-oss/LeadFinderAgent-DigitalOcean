"use client";

import {
  Building2,
  Globe,
  MapPin,
  Server,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { ScoreRing } from "./ScoreRing";
import { useAnimatedNumber } from "./useAnimatedNumber";

interface SummaryCardProps {
  businessName: string;
  websiteUrl: string;
  industry?: string | null;
  location?: string | null;
  technology?: string | null;
  aiScore: number;
  priority: { label: string; className: string };
  status: { label: string; dot: string };
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="text-gray-300 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
          {label}
        </div>
        <div className="text-[13px] font-medium text-gray-700 truncate">
          {value || "—"}
        </div>
      </div>
    </div>
  );
}

export function SummaryCard({
  businessName,
  websiteUrl,
  industry,
  location,
  technology,
  aiScore,
  priority,
  status,
}: SummaryCardProps) {
  const animatedScore = useAnimatedNumber(aiScore);
  const isReady = aiScore > 0;

  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <h2 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          Website Summary
        </h2>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-gray-50 text-gray-600 ring-1 ring-gray-200">
            <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
            {status.label}
          </span>
          <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1", priority.className)}>
            {priority.label}
          </span>
        </div>
      </div>

      <div className="px-5 py-4 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-gray-900 truncate">
            {businessName}
          </div>
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-blue-600 hover:underline group max-w-full"
          >
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {websiteUrl.replace(/^https?:\/\//, "")}
            </span>
            <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </a>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <ScoreRing
            value={animatedScore}
            size={64}
            strokeWidth={6}
            className={isReady ? "stroke-blue-500" : "stroke-gray-200"}
          >
            <span className={cn("text-[15px] font-bold tabular-nums", isReady ? "text-gray-900" : "text-gray-300")}>
              {isReady ? Math.round(animatedScore) : "—"}
            </span>
          </ScoreRing>
          <div className="hidden sm:block">
            <div className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-violet-500" />
              AI Score
            </div>
            <div className={cn("text-[13px] font-semibold", isReady ? "text-gray-700" : "text-gray-300")}>
              {isReady ? "Calculated by AI" : "Pending"}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Field icon={<Building2 className="w-4 h-4" />} label="Industry" value={industry} />
        <Field icon={<MapPin className="w-4 h-4" />} label="Location" value={location} />
        <Field icon={<Server className="w-4 h-4" />} label="Technology" value={technology} />
        <Field icon={<Globe className="w-4 h-4" />} label="Website" value={websiteUrl.replace(/^https?:\/\//, "")} />
      </div>
    </section>
  );
}
