"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/src/lib/utils";
import { ScoreRing } from "./ScoreRing";
import { useAnimatedNumber } from "./useAnimatedNumber";
import { getScoreTier, TIER_META } from "./score";

export interface CategoryScore {
  id: string;
  label: string;
  icon: ReactNode;
  score: number;
  recommendation?: string;
}

interface ScoreCardProps {
  category: CategoryScore;
  delay?: number;
}

export function ScoreCard({ category, delay = 0 }: ScoreCardProps) {
  const { label, icon, score, recommendation } = category;
  const tier = getScoreTier(score);
  const meta = TIER_META[tier];
  const animated = useAnimatedNumber(score);
  const ready = score > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay }}
      className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 hover:border-gray-300 hover:shadow-md transition-all flex flex-col"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", meta.bg, meta.text)}>
            {icon}
          </span>
          <span className="text-[13px] font-semibold text-gray-700 truncate">
            {label}
          </span>
        </div>
        <ScoreRing
          value={animated}
          size={52}
          strokeWidth={5}
          className={ready ? meta.stroke : "stroke-gray-200"}
        >
          <span
            className={cn(
              "text-[13px] font-bold tabular-nums",
              ready ? "text-gray-900" : "text-gray-300"
            )}
          >
            {ready ? Math.round(animated) : "—"}
          </span>
        </ScoreRing>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
        <span className={cn("text-[12px] font-medium", ready ? meta.text : "text-gray-300")}>
          {meta.label}
        </span>
      </div>

      <p className="mt-2 text-[12px] leading-snug text-gray-400 line-clamp-2">
        {recommendation || "Awaiting analysis results."}
      </p>
    </motion.div>
  );
}
