"use client";

import { Lightbulb } from "lucide-react";

interface RecommendationCardProps {
  items: string[];
  loading?: boolean;
}

export function RecommendationCard({ items, loading }: RecommendationCardProps) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-violet-500" />
          Quick AI Recommendation
        </h3>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-3 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <ul className="space-y-2.5">
            {items.map((rec, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug text-gray-600">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0 mt-1.5" />
                <span className="min-w-0">{rec}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-gray-400 leading-relaxed">
            Recommendations will appear here once the analysis completes.
          </p>
        )}
      </div>
    </section>
  );
}
