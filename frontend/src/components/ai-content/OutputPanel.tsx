'use client';

import React, { useState } from 'react';
import {
  Copy,
  Check,
  Trash2,
  SlidersHorizontal,
  Sparkles,
  FileText,
  AlertCircle,
  BookmarkCheck
} from 'lucide-react';
import { toast } from 'sonner';

interface OutputPanelProps {
  content: string;
  isLoading: boolean;
  isModifying: boolean;
  error: string | null;
  onClear: () => void;
  onOpenModify: () => void;
  historyCount: number;
}

export default function OutputPanel({
  content,
  isLoading,
  isModifying,
  error,
  onClear,
  onOpenModify,
  historyCount
}: OutputPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success('Social media post copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard.');
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs flex flex-col h-[700px] relative">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 text-base">Output Panel</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 uppercase tracking-wider">
                Right Side
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {content ? 'Ready-to-publish social media post' : 'Awaiting generation request'}
            </p>
          </div>
        </div>

        {/* Action Controls Header */}
        <div className="flex items-center gap-2">
          {content && !isLoading && !isModifying && (
            <>
              {/* Copy button */}
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 transition-colors shadow-2xs"
                title="Copy post content"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Copy Content</span>
                  </>
                )}
              </button>

              {/* Clear button */}
              <button
                onClick={onClear}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl border border-transparent hover:border-rose-200 transition-colors"
                title="Clear Output"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {/* FEATURE TWO: CHANGE THIS OUTPUT BUTTON */}
              <button
                onClick={onOpenModify}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all ring-2 ring-emerald-500/20 active:scale-98"
                title="Modify this output with specific instructions"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Change this Output</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto mt-4 pr-1">
        {/* Loading state during Playwright generation or modification */}
        {(isLoading || isModifying) && (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-3xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4 animate-pulse">
              <Sparkles className="w-8 h-8 animate-spin" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">
              {isModifying ? 'Applying Requested Changes...' : 'Generating Social Media Post...'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">
              Playwright is driving Chromium through Gemini Web, streaming and validating the complete response.
            </p>

            <div className="w-full max-w-md mt-6 space-y-2.5">
              <div className="h-3.5 bg-slate-100 rounded-full animate-pulse w-4/5 mx-auto" />
              <div className="h-3.5 bg-slate-100 rounded-full animate-pulse w-full mx-auto" />
              <div className="h-3.5 bg-slate-100 rounded-full animate-pulse w-3/4 mx-auto" />
            </div>
          </div>
        )}

        {/* Error state */}
        {!isLoading && !isModifying && error && (
          <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200/90 text-rose-800 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Generation Error</span>
            </div>
            <p className="text-xs text-rose-700 leading-relaxed pl-6">
              {error}
            </p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isModifying && !content && !error && (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-400 mb-4">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">No Content Generated Yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
              Enter any topic, business idea, or announcement in the Chat Panel on the left and click
              <span className="font-semibold text-slate-700"> Generate</span> to create your post.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400 font-medium">
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/60">
                ✨ Catchy Hook
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/60">
                🎯 Clear CTA
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/60">
                #️⃣ 5–8 Hashtags
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/60">
                📱 IG, FB & LinkedIn
              </span>
            </div>
          </div>
        )}

        {/* Active Content Output */}
        {!isLoading && !isModifying && content && (
          <div className="animate-in fade-in duration-300 space-y-4">
            <div className="bg-[#FCFCFA] border border-[#E7E5E4] rounded-2xl p-6 shadow-2xs">
              <div className="text-slate-900 text-sm leading-relaxed whitespace-pre-wrap font-sans selection:bg-blue-100">
                {content}
              </div>
            </div>

            {/* Quick Metadata Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 px-1 pt-1">
              <div className="flex items-center gap-2">
                <BookmarkCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Format: Single ready-to-publish social media post</span>
              </div>
              <div className="flex items-center gap-3">
                {historyCount > 1 && <span>Draft #{historyCount}</span>}
                {historyCount > 1 && <span>•</span>}
                <span>{content.split(/\s+/).filter(Boolean).length} words</span>
                <span>•</span>
                <span>{content.length} characters</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
