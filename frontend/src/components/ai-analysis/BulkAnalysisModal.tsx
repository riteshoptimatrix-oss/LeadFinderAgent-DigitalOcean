"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Sparkles,
  Loader2,
  Globe,
  AlertTriangle,
  XOctagon,
  ChevronDown,
  Info,
  Play,
  RotateCw,
} from "lucide-react";
import api from '@/lib/axios';

interface BulkAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStarted: (queueId: string, name: string) => void;
  leadIds?: string[];
  filters?: Record<string, string | boolean>;
  scopeLabel?: string;
}

interface PrepareReport {
  total_leads: number;
  eligible_websites: number;
  duplicate_leads: number;
  ready_to_analyze: number;
  already_analyzed: number;
  already_queued: number;
  currently_analyzing: number;
  no_website: number;
  invalid_url: number;
  deleted: number;
  non_professional_website: number;
  skipped_leads: {
    lead_id: string | null;
    name: string | null;
    website: string | null;
    reason: string;
    category: string;
  }[];
  websites: {
    website: string;
    business_name: string | null;
    lead_id: string;
    linked_lead_count: number;
  }[];
}

const EMPTY_REPORT: PrepareReport = {
  total_leads: 0,
  eligible_websites: 0,
  duplicate_leads: 0,
  ready_to_analyze: 0,
  already_analyzed: 0,
  already_queued: 0,
  currently_analyzing: 0,
  no_website: 0,
  invalid_url: 0,
  deleted: 0,
  non_professional_website: 0,
  skipped_leads: [],
  websites: [],
};

export default function BulkAnalysisModal({
  isOpen,
  onClose,
  onStarted,
  leadIds,
  filters,
  scopeLabel,
}: BulkAnalysisModalProps) {
  const [report, setReport] = useState<PrepareReport>(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [concurrency, setConcurrency] = useState(5);
  const [name, setName] = useState("Bulk AI Website Analysis");
  const [showSkipped, setShowSkipped] = useState(false);
  const [showWebsites, setShowWebsites] = useState(false);
  const [reanalyze, setReanalyze] = useState(false);

  const payload = () => {
    const body: Record<string, unknown> = { concurrency, name, reanalyze };
    if (leadIds && leadIds.length > 0) body.lead_ids = leadIds;
    else if (filters) body.filters = filters;
    return body;
  };

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    setShowSkipped(false);
    setShowWebsites(false);
    try {
      const res = await api.post("/ai-analysis/bulk/prepare", payload());
      setReport(res.data || EMPTY_REPORT);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail || "Failed to compute eligibility summary."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.post("/ai-analysis/bulk/prepare", payload());
        if (cancelled) return;
        setReport(res.data || EMPTY_REPORT);
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        setError(
          err?.response?.data?.detail ||
            "Failed to compute eligibility summary."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, reanalyze]);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await api.post("/ai-analysis/bulk/start", payload());
      const queueId = res.data?.id || res.data?._id;
      if (!queueId) {
        setError("No queue ID returned from server.");
        return;
      }
      onStarted(String(queueId), name);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to start bulk analysis.");
    } finally {
      setStarting(false);
    }
  };

  const skipCategories = [
    { key: "no_website", label: "No Website", cls: "bg-slate-100 text-slate-600" },
    { key: "invalid_url", label: "Invalid URL", cls: "bg-slate-100 text-slate-600" },
    { key: "non_professional_website", label: "Social Profile", cls: "bg-amber-50 text-amber-700" },
    { key: "already_analyzed", label: "Already Analyzed", cls: "bg-emerald-50 text-emerald-700" },
    { key: "already_queued", label: "Already Queued", cls: "bg-blue-50 text-blue-700" },
    { key: "currently_analyzing", label: "In Progress", cls: "bg-purple-50 text-purple-700" },
    { key: "deleted", label: "Deleted", cls: "bg-rose-50 text-rose-700" },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-xs"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.18 }}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-slate-900 font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Bulk AI Website Analysis
                  </h2>
                  <p className="text-xs text-slate-500">
                    Analyze {scopeLabel || "selected leads"} (one job per unique website)
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/40">
              {error && (
                <div className="bg-rose-50 border border-rose-200/80 text-rose-700 rounded-xl p-3.5 text-xs font-medium flex items-center gap-2">
                  <XOctagon className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                  <p className="text-xs font-medium text-slate-500">
                    Scanning leads and checking websites...
                  </p>
                </div>
              ) : (
                <>
                  {/* Hero Metric Card */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex items-center justify-between">
                    <div>
                      <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider mb-0.5">
                        Ready To Analyze
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-extrabold font-mono text-slate-900">
                          {report.ready_to_analyze}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          unique website{report.ready_to_analyze === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-2 flex items-center gap-3">
                        <span>{report.total_leads} leads scanned</span>
                        <span>•</span>
                        <span>{report.duplicate_leads} duplicate leads (reused)</span>
                      </div>
                    </div>
                  </div>

                  {/* Settings */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3.5 shadow-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">
                          Queue Name
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-semibold text-slate-700">
                            Concurrency
                          </label>
                          <span className="text-xs font-mono font-bold text-blue-600">
                            {concurrency} workers
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={concurrency}
                          onChange={(e) => setConcurrency(Number(e.target.value))}
                          className="w-full accent-blue-600 cursor-pointer"
                        />
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          Parallel website crawling threads (1 to 10)
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={reanalyze}
                          onChange={(e) => setReanalyze(e.target.checked)}
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="text-xs font-medium text-slate-700">
                          Re-analyze previously analyzed leads
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* Eligibility Breakdown */}
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Eligibility Breakdown
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        {report.eligible_websites} Eligible Websites
                      </span>
                      {skipCategories.map((cat) => {
                        const val = report[cat.key];
                        if (!val) return null;
                        return (
                          <span
                            key={cat.key}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${cat.cls}`}
                          >
                            {val} {cat.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Websites list accordion */}
                  {report.websites.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                      <button
                        onClick={() => setShowWebsites((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer text-xs font-semibold text-slate-700"
                      >
                        <span className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-blue-600" />
                          Websites to Analyze ({report.websites.length})
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                            showWebsites ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {showWebsites && (
                        <div className="border-t border-slate-100 max-h-48 overflow-y-auto divide-y divide-slate-50 text-xs">
                          {report.websites.map((w, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between px-4 py-2 gap-2"
                            >
                              <span className="font-semibold text-slate-800 truncate">
                                {w.business_name || "Lead"}
                              </span>
                              <span className="text-slate-500 font-mono text-[11px] truncate">
                                {w.website}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Skipped leads accordion */}
                  {report.skipped_leads.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                      <button
                        onClick={() => setShowSkipped((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer text-xs font-semibold text-slate-700"
                      >
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          Skipped Leads ({report.skipped_leads.length})
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                            showSkipped ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {showSkipped && (
                        <div className="border-t border-slate-100 max-h-48 overflow-y-auto divide-y divide-slate-50 text-xs">
                          {report.skipped_leads.map((s, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between px-4 py-2 gap-2"
                            >
                              <span className="font-semibold text-slate-800 truncate">
                                {s.name || "Lead"}
                              </span>
                              <span className="text-slate-400 text-[11px]">
                                {s.reason}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-white shrink-0">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Info className="w-3.5 h-3.5" />
                <span>Runs in background • You can minimize anytime</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchReport}
                  disabled={loading || starting}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <button
                  onClick={handleStart}
                  disabled={loading || starting || report.ready_to_analyze === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {starting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  {starting ? "Starting..." : "Start Analysis"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
