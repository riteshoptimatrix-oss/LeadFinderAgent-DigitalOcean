"use client";

import { Sparkles, ArrowRight } from "lucide-react";

interface EmptyStateProps {
  onGoToLeads?: () => void;
}

export function EmptyState({ onGoToLeads }: EmptyStateProps) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="relative w-28 h-28 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full bg-violet-50" />
          <div className="absolute inset-0 rounded-full border border-violet-100" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-violet-500" />
          </div>
        </div>
        <h2 className="text-[22px] font-semibold text-gray-900">
          No AI Analysis Running
        </h2>
        <p className="text-[14px] text-gray-500 mt-2 leading-relaxed">
          Start an analysis from the Leads page to see live website quality, SEO
          and business opportunity scoring.
        </p>
        {onGoToLeads && (
          <button
            type="button"
            onClick={onGoToLeads}
            className="mt-6 inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-gray-900 text-white text-[13px] font-semibold hover:bg-gray-800 transition-colors"
          >
            Go to Leads
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
