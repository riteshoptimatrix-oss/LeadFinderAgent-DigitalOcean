'use client';

import { Brain, SearchX, Sparkles } from 'lucide-react';

interface EmptyStateProps {
  hasFilters: boolean;
  onReset: () => void;
  onAnalyze: () => void;
}

export function EmptyState({ hasFilters, onReset, onAnalyze }: EmptyStateProps) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center px-8 py-20 min-h-[420px]">
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-6">
          {hasFilters ? (
            <SearchX className="w-9 h-9 text-slate-300" />
          ) : (
            <Brain className="w-9 h-9 text-blue-500" />
          )}
        </div>
        <span className="absolute -right-3 -top-3">
          <Sparkles className="w-6 h-6 text-slate-200" />
        </span>
      </div>

      <h3 className="text-lg font-bold text-slate-900 mb-2">
        {hasFilters ? 'No Leads Match Your Filters' : 'No AI Analysis Available'}
      </h3>
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed mb-7">
        {hasFilters
          ? 'Try adjusting or resetting the filters to see more results.'
          : 'Run AI Analysis on your leads to generate business insights.'}
      </p>

      {hasFilters ? (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Reset Filters
        </button>
      ) : (
        <button
          type="button"
          onClick={onAnalyze}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Analyze Leads
        </button>
      )}
    </div>
  );
}
