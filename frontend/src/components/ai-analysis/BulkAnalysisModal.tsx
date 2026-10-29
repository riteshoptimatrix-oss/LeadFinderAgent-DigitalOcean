"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Layers, Loader2, Globe, AlertTriangle, XOctagon,
  Sparkles, ChevronDown, Link2, Info, Play, Users, Zap
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
  skipped_leads: { lead_id: string | null; name: string | null; website: string | null; reason: string; category: string }[];
  websites: { website: string; business_name: string | null; lead_id: string; linked_lead_count: number }[];
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

export default function BulkAnalysisModal({ isOpen, onClose, onStarted, leadIds, filters, scopeLabel }: BulkAnalysisModalProps) {
  const [report, setReport] = useState<PrepareReport>(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [concurrency, setConcurrency] = useState(5);
  const [name, setName] = useState("Bulk AI Website Analysis");
  const [showSkipped, setShowSkipped] = useState(false);
  const [showWebsites, setShowWebsites] = useState(false);

  const payload = () => {
    const body: Record<string, unknown> = { concurrency, name };
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
      const res = await api.post('/ai-analysis/bulk/prepare', payload());
      setReport(res.data || EMPTY_REPORT);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to compute eligibility summary.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.post('/ai-analysis/bulk/prepare', payload());
        if (cancelled) return;
        setReport(res.data || EMPTY_REPORT);
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.response?.data?.detail || "Failed to compute eligibility summary.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await api.post('/ai-analysis/bulk/start', payload());
      const queueId = res.data?.id || res.data?._id;
      if (!queueId) {
        setError("No queue ID returned from the server.");
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
    { key: 'no_website', label: 'No Website', cls: 'bg-slate-100 text-slate-600' },
    { key: 'invalid_url', label: 'Invalid URL', cls: 'bg-slate-100 text-slate-600' },
    { key: 'non_professional_website', label: 'Social / Directory', cls: 'bg-amber-100 text-amber-700' },
    { key: 'already_analyzed', label: 'Already Analyzed', cls: 'bg-emerald-100 text-emerald-700' },
    { key: 'already_queued', label: 'Already Queued', cls: 'bg-blue-100 text-blue-700' },
    { key: 'currently_analyzing', label: 'Currently Analyzing', cls: 'bg-purple-100 text-purple-700' },
    { key: 'deleted', label: 'Deleted', cls: 'bg-red-100 text-red-700' },
  ] as const;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-3xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-4">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Bulk AI Website Analysis</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Analyze {scopeLabel || 'matching leads'} — one job per unique website, results reused for duplicates.
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 bg-gray-50 hover:bg-gray-100 rounded-xl text-gray-500 hover:text-gray-900 border border-gray-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-medium flex items-start gap-2">
                  <XOctagon className="w-4 h-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <p className="text-sm font-medium text-slate-500">Computing eligibility summary...</p>
                </div>
              ) : (
                <>
                  {/* Ready to analyze hero */}
                  <div className="bg-gradient-to-br from-indigo-50 via-white to-violet-50 border border-indigo-100 rounded-2xl p-6 flex items-center gap-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-100 blur-3xl rounded-full opacity-60" />
                    <div className="p-3.5 bg-indigo-600 text-white rounded-2xl shadow-lg shrink-0 relative z-10">
                      <Sparkles className="w-7 h-7" />
                    </div>
                    <div className="relative z-10 flex-1">
                      <div className="text-[11px] uppercase font-bold tracking-widest text-indigo-600 mb-1">Ready to Analyze</div>
                      <div className="flex items-end gap-2">
                        <span className="text-5xl font-black font-mono text-slate-900 leading-none">{report.ready_to_analyze}</span>
                        <span className="text-sm font-semibold text-slate-500 pb-1">unique website{report.ready_to_analyze === 1 ? '' : 's'}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-slate-600">
                        <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-indigo-500" /> <b className="font-mono">{report.total_leads}</b> leads scanned</span>
                        <span className="flex items-center gap-1.5"><Link2 className="w-4 h-4 text-violet-500" /> <b className="font-mono">{report.duplicate_leads}</b> duplicate leads (reuse report)</span>
                      </div>
                    </div>
                  </div>

                  {/* Configuration */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-indigo-600" /> Analysis Configuration
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-bold text-slate-600">Queue Name</span>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
                          placeholder="Bulk AI Website Analysis"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-bold text-slate-600">Concurrency (parallel analyses)</span>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={1}
                            max={10}
                            value={concurrency}
                            onChange={(e) => setConcurrency(Number(e.target.value))}
                            className="flex-1 accent-indigo-600"
                          />
                          <span className="w-10 text-center font-mono font-bold text-indigo-600 text-lg bg-indigo-50 border border-indigo-100 rounded-lg py-1">{concurrency}</span>
                        </div>
                        <span className="text-[11px] text-slate-400">Higher concurrency analyzes more websites at once (1–10).</span>
                      </label>
                    </div>
                  </div>

                  {/* Skipped breakdown */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <Info className="w-4 h-4 text-indigo-600" /> Eligibility Breakdown
                      </div>
                      <span className="text-xs font-mono text-slate-500">{report.total_leads} leads scanned</span>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <Pill label={`${report.eligible_websites} eligible websites`} cls="bg-emerald-100 text-emerald-700 border-emerald-200" />
                      {skipCategories.map(cat => {
                        const value = report[cat.key];
                        if (!value) return null;
                        return (
                          <Pill key={cat.key} label={`${value} ${cat.label.toLowerCase()}`} cls={cat.cls} />
                        );
                      })}
                    </div>
                  </div>

                  {/* Websites preview */}
                  {report.websites.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => setShowWebsites(v => !v)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                      >
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                          <Globe className="w-4 h-4 text-indigo-600" /> Websites to Analyze ({report.websites.length})
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showWebsites ? 'rotate-180' : ''}`} />
                      </button>
                      {showWebsites && (
                        <div className="border-t border-gray-100 max-h-56 overflow-y-auto divide-y divide-gray-50">
                          {report.websites.map((w, i) => (
                            <div key={i} className="flex items-center justify-between px-5 py-2.5 gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-800 truncate">{w.business_name || 'Unknown business'}</div>
                                <div className="text-xs text-blue-600 font-mono truncate">{w.website}</div>
                              </div>
                              {w.linked_lead_count > 0 && (
                                <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-full bg-violet-100 text-violet-700">
                                  +{w.linked_lead_count} dup
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Skipped preview */}
                  {report.skipped_leads.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => setShowSkipped(v => !v)}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                      >
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-500" /> Skipped Leads ({report.skipped_leads.length})
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showSkipped ? 'rotate-180' : ''}`} />
                      </button>
                      {showSkipped && (
                        <div className="border-t border-gray-100 max-h-56 overflow-y-auto divide-y divide-gray-50">
                          {report.skipped_leads.map((s, i) => (
                            <div key={i} className="flex items-start justify-between px-5 py-2.5 gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-800 truncate">{s.name || 'Unknown business'}</div>
                                {s.website && <div className="text-xs text-slate-400 font-mono truncate">{s.website}</div>}
                              </div>
                              <div className="shrink-0 flex flex-col items-end">
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{s.category}</span>
                                <span className="text-[10px] text-slate-400 mt-1 text-right max-w-[180px]">{s.reason}</span>
                              </div>
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
            <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-100 shrink-0 bg-slate-50">
              <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-500" />
                Identical websites are analyzed once — every linked lead receives a copy of the report.
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={fetchReport}
                  disabled={loading || starting}
                  className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-100 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshIcon spinning={loading} /> Refresh
                </button>
                <button
                  onClick={handleStart}
                  disabled={loading || starting || report.ready_to_analyze === 0}
                  className={`px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2 ${
                    report.ready_to_analyze === 0
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                      : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white hover:shadow'
                  }`}
                >
                  {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {starting ? 'Starting...' : 'Start Bulk Analysis'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Pill({ label, cls }: { label: string, cls: string }) {
  return (
    <span className={`px-3 py-1.5 rounded-full border text-xs font-bold ${cls}`}>{label}</span>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
