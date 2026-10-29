"use client";

import { cn } from "@/src/lib/utils";
import { ScoreRing } from "./ScoreRing";
import { useAnimatedNumber } from "./useAnimatedNumber";
import { getScoreTier, TIER_META, getPriority, PRIORITY_META } from "./score";

interface AIScoreCircleProps {
  score: number;
}

export function AIScoreCircle({ score }: AIScoreCircleProps) {
  const tier = getScoreTier(score);
  const meta = TIER_META[tier];
  const priority = getPriority(score);
  const priorityMeta = PRIORITY_META[priority];
  const animated = useAnimatedNumber(score, 900);
  const ready = score > 0;

  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 flex flex-col items-center">
      <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-400">
        Overall AI Score
      </span>
      <ScoreRing
        value={animated}
        size={140}
        strokeWidth={10}
        className={ready ? meta.stroke : "stroke-gray-200"}
      >
        <div className="flex flex-col items-center">
          <span
            className={cn(
              "text-[40px] font-bold leading-none tabular-nums tracking-tight",
              ready ? "text-gray-900" : "text-gray-300"
            )}
          >
            {ready ? Math.round(animated) : "—"}
          </span>
          {ready && <span className="text-[12px] text-gray-400 mt-1">/ 100</span>}
        </div>
      </ScoreRing>
      <span className={cn("mt-3 text-[14px] font-semibold", ready ? meta.text : "text-gray-300")}>
        {meta.label}
      </span>
      <span
        className={cn(
          "mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1",
          priorityMeta.bg,
          priorityMeta.text,
          priorityMeta.ring
        )}
      >
        {priority} Priority
      </span>
    </section>
  );
}
