"use client";

import {
  Globe,
  Search,
  Server,
  Zap,
  Accessibility,
  Share2,
  Mail,
  Building2,
  Target,
  Sparkles,
  Check,
} from "lucide-react";
import { cn } from "@/src/lib/utils";

export const STEPPER_STEPS = [
  { label: "Website", icon: Globe },
  { label: "SEO", icon: Search },
  { label: "Technology", icon: Server },
  { label: "Performance", icon: Zap },
  { label: "Accessibility", icon: Accessibility },
  { label: "Social", icon: Share2 },
  { label: "Contacts", icon: Mail },
  { label: "Business", icon: Building2 },
  { label: "Lead Score", icon: Target },
  { label: "Recommendation", icon: Sparkles },
] as const;

interface AnalysisStepperProps {
  currentStep: number;
  complete: boolean;
}

export function AnalysisStepper({ currentStep, complete }: AnalysisStepperProps) {
  return (
    <div className="mx-6 lg:mx-8 shrink-0 bg-white border border-gray-200 rounded-xl shadow-sm px-5 py-4">
      <div className="flex items-center justify-between gap-6 overflow-x-auto no-scrollbar">
        {STEPPER_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isComplete = complete || idx < currentStep;
          const isCurrent = !complete && idx === currentStep;

          return (
            <div key={step.label} className="flex items-center gap-6 flex-1 min-w-0 last:flex-none">
              <div className="flex flex-col items-center gap-1.5 min-w-0">
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center transition-colors duration-200",
                    isComplete
                      ? "bg-green-500 text-white"
                      : isCurrent
                        ? "bg-blue-600 text-white ring-4 ring-blue-100"
                        : "bg-gray-100 text-gray-400"
                  )}
                >
                  {isComplete ? (
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[11px] font-medium whitespace-nowrap",
                    isCurrent
                      ? "text-blue-600"
                      : isComplete
                        ? "text-gray-600"
                        : "text-gray-400"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {idx < STEPPER_STEPS.length - 1 && (
                <div className="flex-1 min-w-[12px] h-px bg-gray-200 mb-5">
                  <div
                    className={cn(
                      "h-full transition-all duration-500",
                      isComplete ? "w-full bg-green-400" : "w-0"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
