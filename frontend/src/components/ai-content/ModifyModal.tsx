'use client';

import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Loader2,
  SlidersHorizontal,
  FileText
} from 'lucide-react';

interface ModifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (modificationQuery: string) => Promise<void>;
  existingContent: string;
  isModifying: boolean;
}

const QUICK_SUGGESTIONS = [
  'Make it more engaging and casual',
  'Make the tone strictly corporate & professional',
  'Add 5 more industry hashtags',
  'Shorten to under 100 words',
  'Add a more compelling Call-to-Action'
];

export default function ModifyModal({
  isOpen,
  onClose,
  onSubmit,
  existingContent,
  isModifying
}: ModifyModalProps) {
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructions.trim()) {
      setError('Please describe what changes you would like to make.');
      return;
    }
    setError(null);
    try {
      await onSubmit(instructions.trim());
      setInstructions('');
      onClose();
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setError(errorObj?.message || 'Failed to modify content. Please try again.');
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInstructions(prev => (prev ? `${prev}. ${suggestion}` : suggestion));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-600">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Change this Output</h3>
              <p className="text-xs text-slate-500">
                Instruct Gemini how to refine, restructure, or rewrite the generated post.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isModifying}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5 overflow-y-auto">
          {/* Current Output Excerpt */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Target Output (Latest Draft)</span>
            </div>
            <div className="text-xs text-slate-600 line-clamp-3 italic whitespace-pre-wrap font-sans bg-white/70 p-2.5 rounded-xl border border-slate-200/50">
              &ldquo;{existingContent}&rdquo;
            </div>
          </div>

          {/* Modification Instructions Input */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              What changes do you want?
            </label>
            <textarea
              value={instructions}
              onChange={e => {
                setInstructions(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Add a limited-time 20% discount offer, make the hook stronger, and make it sound more upbeat..."
              rows={4}
              disabled={isModifying}
              className="w-full text-sm text-slate-900 bg-white border border-slate-200 rounded-2xl p-4 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all resize-none shadow-2xs placeholder:text-slate-400"
            />
          </div>

          {/* Quick Suggestions Chips */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400">Quick suggestions:</span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SUGGESTIONS.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSuggestionClick(s)}
                  disabled={isModifying}
                  className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-slate-600 border border-slate-200/60 transition-colors"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isModifying}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isModifying || !instructions.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all disabled:opacity-50"
            >
              {isModifying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Applying Changes via Gemini...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Apply Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
