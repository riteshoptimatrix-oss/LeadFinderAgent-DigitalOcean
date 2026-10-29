"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  X, Globe, Layers, AlertTriangle, Activity, Clock, Cpu,
  Zap, Square, RefreshCw, CheckCircle2, XOctagon, Timer, Target,
  Copy, Link2, Loader2
} from "lucide-react";
import api from '@/lib/axios';

interface BulkMonitorProps {
  queueId: string;
  queueName?: string;
  onClose: () => void;
  onComplete: () => Promise<void> | void;
}

interface BulkProgress {
  progress: number;
  total: number;
  completed: number;
  running: number;
  queued: number;
  retry: number;
  skipped: number;
  failed: number;
  remaining: number;
  total_leads: number;
  leads_analyzed: number;
  duplicate_leads: number;
  duplicate_leads_completed: number;
  current_website: string | null;
  current_business: string | null;
  elapsed_seconds: number;
  eta_seconds: number | null;
  average_time_per_website: number;
  concurrency: number;
  status: string;
}

interface BulkLogEntry {
  id: string;
  time: string;
  message: string;
  level: string;
  business_name?: string;
  website?: string;
}

interface BulkSummary {
  total_leads: number;
  analyzed: number;
  websites_analyzed: number;
  skipped: number;
  failed: number;
  total_time: number | null;
  average_time_per_website: number;
}

const EMPTY_PROGRESS: BulkProgress = {
  progress: 0,
  total: 0,
  completed: 0,
  running: 0,
  queued: 0,
  retry: 0,
  skipped: 0,
  failed: 0,
  remaining: 0,
  total_leads: 0,
  leads_analyzed: 0,
  duplicate_leads: 0,
  duplicate_leads_completed: 0,
  current_website: null,
  current_business: null,
  elapsed_seconds: 0,
  eta_seconds: null,
  average_time_per_website: 0,
  concurrency: 1,
  status: "WAITING",
};

const TERMINAL_BULK_STATUSES = ['COMPLETED', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED', 'TIMEOUT'];

type BulkFallbackSource = {
  status?: string;
  stage?: string;
  message?: string;
  total_jobs?: number;
  total_leads?: number;
  completed_jobs?: number;
  leads_analyzed?: number;
  skipped_jobs?: number;
  skipped?: number;
  failed_jobs?: number;
  failed?: number;
  total_time?: number | null;
  average_time?: number | null;
  average_time_per_website?: number | null;
};

const buildFallbackSummary = (d: BulkFallbackSource): BulkSummary => ({
  total_leads: d.total_leads || d.total_jobs || 0,
  analyzed: d.leads_analyzed || d.completed_jobs || 0,
  websites_analyzed: d.completed_jobs || 0,
  skipped: d.skipped_jobs || d.skipped || 0,
  failed: d.failed_jobs || d.failed || 0,
  total_time: d.total_time ?? null,
  average_time_per_website: d.average_time ?? d.average_time_per_website ?? null,
});

export default function BulkAIAnalysisMonitor({ queueId, queueName, onClose, onComplete }: BulkMonitorProps) {
  const [progress, setProgress] = useState<BulkProgress>(EMPTY_PROGRESS);
  const [logs, setLogs] = useState<BulkLogEntry[]>([]);
  const [summary, setSummary] = useState<BulkSummary | null>(null);
  const [queueStatus, setQueueStatus] = useState("WAITING");
  const [wsConnected, setWsConnected] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [elapsedTicker, setElapsedTicker] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const summaryRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onCompleteRef = useRef(onComplete);
  const progressRef = useRef(progress);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => { onCompleteRef.current = onComplete; });
  useEffect(() => { progressRef.current = progress; });

  // UI elapsed ticker (only shown when no live elapsed is available)
  useEffect(() => {
    const timer = setInterval(() => setElapsedTicker(v => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll log stream
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [logs]);

  const formatDuration = (secs: number | null | undefined): string => {
    if (secs === null || secs === undefined || secs < 0 || !isFinite(secs)) return "—";
    const s = Math.floor(secs);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const rem = s % 60;
    if (h > 0) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
    return `${m}:${String(rem).padStart(2, '0')}`;
  };

  const pushLog = (level: string, message: string, extra?: Partial<BulkLogEntry>) => {
    if (!message) return;
    setLogs(prev => [...prev.slice(-299), {
      id: Math.random().toString(36).substr(2, 9),
      time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message,
      level,
      ...extra,
    }]);
  };

  // Initial Data Fetch
  useEffect(() => {
    let isMounted = true;
    const fetchQueueState = async () => {
      try {
        const res = await api.get(`/ai-analysis/queue/${queueId}`);
        const data = res.data;
        if (data && isMounted) {
          const statusUpper = (data.status || "WAITING").toUpperCase();
          setQueueStatus(statusUpper);
          setProgress(prev => ({
            ...prev,
            total: data.total_jobs || 0,
            completed: data.completed_jobs || 0,
            failed: data.failed_jobs || 0,
            skipped: data.skipped_jobs || 0,
            running: data.running_jobs || 0,
            queued: data.pending_jobs || 0,
            progress: data.overall_progress || 0,
            total_leads: data.total_leads || data.total_jobs || 0,
            leads_analyzed: data.leads_analyzed || 0,
            duplicate_leads: data.duplicate_leads || 0,
            duplicate_leads_completed: data.duplicate_leads_completed || 0,
            concurrency: data.concurrency || 1,
            elapsed_seconds: data.started_at ? 0 : 0,
          }));
          if (Array.isArray(data.jobs)) {
            const active = data.jobs.find((j: any) =>
              ['STARTED', 'RUNNING', 'COLLECTING', 'ANALYZING', 'SCORING', 'SAVING'].includes((j.status || '').toUpperCase())
            );
            if (active) {
              setProgress(prev => ({
                ...prev,
                current_website: active.website_url,
                current_business: active.business_name || null,
              }));
            }
          }
          // Fallback: a queue that is already terminal when the monitor opens
          // (e.g. finished before the WebSocket connected) must still finalize.
          if (TERMINAL_BULK_STATUSES.includes(statusUpper) && !summaryRef.current) {
            summaryRef.current = true;
            setSummary(prev => prev || buildFallbackSummary(data));
            setProgress(prev => ({ ...prev, progress: 100, running: 0, queued: 0, remaining: 0 }));
            setTimeout(() => { onCompleteRef.current(); }, 1200);
          }
        }
      } catch (err) {
        console.error("Failed to fetch bulk queue state", err);
      }
    };
    fetchQueueState();
    return () => { isMounted = false; };
  }, [queueId]);

  // WebSocket Connection
  useEffect(() => {
    if (!queueId) return;

    const maxReconnects = 5;
    const FATAL_CLOSE_CODES = [4003, 4401, 4403, 1008];
    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const getWsUrl = () => {
      const base = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
      const normalized = base.startsWith('ws') ? base : base.replace(/^http/, 'ws');
      const root = normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`;
      const token = typeof window !== 'undefined'
        ? (localStorage.getItem('access_token') || sessionStorage.getItem('access_token'))
        : null;
      const url = `${root}/ai-analysis/ws/${queueId}`;
      return token ? `${url}?token=${token}` : url;
    };

    const handleMessage = (data: any) => {
      const type = data.type || data.event_type || '';
      const upper = type.toUpperCase();

      if (type === 'bulk_progress') {
        setProgress(prev => ({
          ...prev,
          progress: typeof data.progress === 'number' ? data.progress : prev.progress,
          total: typeof data.total === 'number' ? data.total : prev.total,
          completed: typeof data.completed === 'number' ? data.completed : prev.completed,
          running: typeof data.running === 'number' ? data.running : prev.running,
          queued: typeof data.queued === 'number' ? data.queued : prev.queued,
          retry: typeof data.retry === 'number' ? data.retry : prev.retry,
          skipped: typeof data.skipped === 'number' ? data.skipped : prev.skipped,
          failed: typeof data.failed === 'number' ? data.failed : prev.failed,
          remaining: typeof data.remaining === 'number' ? data.remaining : prev.remaining,
          total_leads: typeof data.total_leads === 'number' ? data.total_leads : prev.total_leads,
          leads_analyzed: typeof data.leads_analyzed === 'number' ? data.leads_analyzed : prev.leads_analyzed,
          duplicate_leads: typeof data.duplicate_leads === 'number' ? data.duplicate_leads : prev.duplicate_leads,
          duplicate_leads_completed: typeof data.duplicate_leads_completed === 'number' ? data.duplicate_leads_completed : prev.duplicate_leads_completed,
          current_website: data.current_website || prev.current_website,
          current_business: data.current_business || prev.current_business,
          elapsed_seconds: typeof data.elapsed_seconds === 'number' ? data.elapsed_seconds : prev.elapsed_seconds,
          eta_seconds: data.eta_seconds ?? prev.eta_seconds,
          average_time_per_website: typeof data.average_time_per_website === 'number' ? data.average_time_per_website : prev.average_time_per_website,
          concurrency: typeof data.concurrency === 'number' ? data.concurrency : prev.concurrency,
        }));
        if (data.status) setQueueStatus(String(data.status).toUpperCase());
        return;
      }

      if (type === 'bulk_log') {
        pushLog(data.level || 'info', data.message || '', {
          business_name: data.business_name,
          website: data.website,
        });
        return;
      }

      if (type === 'bulk_completed' || upper === 'BULK_QUEUE_COMPLETED') {
        if (data.status) setQueueStatus(String(data.status).toUpperCase());
        if (data.summary) setSummary(data.summary);
        pushLog('success', data.message || 'Bulk analysis completed.');
        if (!summaryRef.current) {
          summaryRef.current = true;
          setProgress(prev => ({ ...prev, progress: 100, running: 0, queued: 0, remaining: 0 }));
          setTimeout(() => { onCompleteRef.current(); }, 1200);
        }
        return;
      }

      if (upper === 'BULK_QUEUE_CANCELLED') {
        setQueueStatus('CANCELLED');
        pushLog('warning', data.message || 'Bulk analysis cancelled.');
        setProgress(prev => ({ ...prev, running: 0, queued: 0 }));
        return;
      }

      if (upper === 'BULK_QUEUE_STARTED') {
        setQueueStatus('RUNNING');
        pushLog('info', data.message || 'Bulk analysis started.');
        return;
      }

      if (upper === 'BULK_QUEUE_CREATED') {
        setQueueStatus('WAITING');
        pushLog('info', data.message || 'Bulk queue created.');
        if (typeof data.total_jobs === 'number') {
          setProgress(prev => ({ ...prev, total: data.total_jobs }));
        }
        if (typeof data.total_leads === 'number') {
          setProgress(prev => ({ ...prev, total_leads: data.total_leads }));
        }
        return;
      }

      // Fallback for queue-level completion events sent by the shared worker
      // (legacy QUEUE_COMPLETED broadcasts). The real bulk payload is
      // "bulk_completed", but we must never leave the monitor hanging when a
      // queue has already reached a terminal state through another path.
      if (upper === 'QUEUE_COMPLETED' && !summaryRef.current) {
        const statusUpper = String(data.stage || data.status || 'COMPLETED').toUpperCase();
        setQueueStatus(TERMINAL_BULK_STATUSES.includes(statusUpper) ? statusUpper : 'COMPLETED');
        summaryRef.current = true;
        setSummary(prev => prev || buildFallbackSummary(data));
        setProgress(prev => ({ ...prev, progress: 100, running: 0, queued: 0, remaining: 0 }));
        pushLog('success', data.message || 'Bulk analysis completed.');
        setTimeout(() => { onCompleteRef.current(); }, 1200);
        return;
      }

      // Any other event (per-lead stage events streamed by the shared worker)
      // is surfaced as an informational log line.
      const message = data.message
        || (data.stage ? `Stage: ${data.stage}` : '')
        || (data.business_name ? `Update: ${data.business_name}` : '');
      if (message) {
        let level = 'info';
        if (upper.includes('FAIL') || data.stage_status === 'failed') level = 'error';
        else if (upper.includes('COMPLETED') || data.stage_status === 'success') level = 'success';
        pushLog(level, message, {
          business_name: data.business_name,
          website: data.website || data.website_url,
        });
      }
    };

    const connect = () => {
      if (!isMounted) return;
      let sock: WebSocket;
      try {
        sock = new WebSocket(getWsUrl());
      } catch (e) {
        console.error("[BulkAIAnalysisWS] ERROR: failed to construct WebSocket", e);
        scheduleReconnect();
        return;
      }
      ws = sock;
      wsRef.current = sock;

      sock.onopen = () => {
        reconnectAttempts = 0;
        setWsConnected(true);
      };

      sock.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!data || !data.type) return;
          if (data.type === 'HEARTBEAT' || data.type === 'pong') return;
          handleMessage(data);
        } catch (e) {
          console.error("[BulkAIAnalysisWS] Parse Error", e);
        }
      };

      sock.onclose = (evt) => {
        setWsConnected(false);
        if (wsRef.current === sock) wsRef.current = null;
        if (FATAL_CLOSE_CODES.includes(evt.code)) return;
        scheduleReconnect();
      };

      sock.onerror = () => {
        console.error(`[BulkAIAnalysisWS] ERROR ${sock.url}`);
      };
    };

    const scheduleReconnect = () => {
      if (!isMounted) return;
      if (summaryRef.current) return;
      if (reconnectAttempts >= maxReconnects) return;
      reconnectAttempts += 1;
      const delay = Math.min(15000, 1000 * Math.pow(2, reconnectAttempts - 1));
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try { ws.close(); } catch { /* socket still connecting */ }
      }
      wsRef.current = null;
    };
  }, [queueId]);

  const handleCancel = async () => {
    if (cancelling) return;
    const isTerminal = ['COMPLETED', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'CANCELLED', 'SKIPPED', 'TIMEOUT'].includes(queueStatus);
    if (!isTerminal && !window.confirm("Cancel bulk analysis? Completed work will be preserved.")) return;
    setCancelling(true);
    try {
      await api.post(`/ai-analysis/bulk/${queueId}/stop`);
      setQueueStatus('CANCELLED');
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to cancel queue.";
      pushLog('error', msg);
    } finally {
      setCancelling(false);
    }
  };

  const handleClose = () => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* still connecting */ }
    }
    onCloseRef.current();
  };

  const isTerminal = ['COMPLETED', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'CANCELLED', 'SKIPPED', 'TIMEOUT'].includes(queueStatus);
  const isRunning = ['STARTED', 'RUNNING', 'COLLECTING', 'ANALYZING', 'SCORING', 'SAVING'].includes(queueStatus);

  const statusBadge = (() => {
    if (isTerminal && summary) return { label: queueStatus, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    if (queueStatus === 'FAILED') return { label: queueStatus, cls: 'bg-red-50 text-red-600 border-red-200' };
    if (queueStatus === 'CANCELLED') return { label: queueStatus, cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { label: queueStatus, cls: 'bg-indigo-50 text-indigo-600 border-indigo-200' };
  })();

  const elapsed = progress.elapsed_seconds > 0 ? progress.elapsed_seconds : elapsedTicker;
  const successRate = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-slate-50/90 backdrop-blur-md h-screen overflow-hidden p-2 sm:p-4 lg:p-6"
    >
      <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col h-full overflow-hidden text-slate-900 font-sans mx-auto w-full max-w-[1800px] relative">

        {/* HEADER */}
        <div className="flex items-center justify-between p-5 bg-white border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-3 flex-wrap">
                <span className="truncate max-w-[420px]">{queueName || "Bulk AI Analysis"}</span>
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${statusBadge.cls}`}>
                  {!isTerminal && isRunning && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />}
                  {statusBadge.label}
                </span>
              </h1>
              <div className="flex items-center gap-4 text-xs font-mono text-slate-500 mt-1 flex-wrap">
                <span>ID: {queueId.slice(0, 8)}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Elapsed: {formatDuration(elapsed)}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Concurrency: {progress.concurrency}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleCancel}
              disabled={isTerminal || cancelling}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2 ${
                isTerminal || cancelling
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                  : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
              }`}
            >
              {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
              Cancel
            </button>
            <button onClick={handleClose} className="p-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 hover:text-gray-900 border border-gray-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MAIN LAYOUT */}
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT CONTENT */}
          <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-slate-50 p-6 gap-6">

            {summary ? (
              /* COMPLETION SUMMARY */
              <div className="flex flex-col items-center text-center bg-white rounded-2xl border border-emerald-200 p-10 shadow-sm shrink-0 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500" />
                <div className="flex items-center justify-center w-24 h-24 rounded-full bg-emerald-100 mb-6 shadow-sm">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-2">Bulk Analysis Completed</h2>
                <p className="text-slate-500 text-sm mb-8">All queued websites have been processed.</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full max-w-4xl">
                  <SummaryStat icon={<Target className="w-4 h-4" />} label="Total Leads" value={summary.total_leads ?? 0} color="indigo" />
                  <SummaryStat icon={<CheckCircle2 className="w-4 h-4" />} label="Leads Analyzed" value={summary.analyzed ?? 0} color="emerald" />
                  <SummaryStat icon={<Globe className="w-4 h-4" />} label="Websites" value={summary.websites_analyzed ?? 0} color="blue" />
                  <SummaryStat icon={<AlertTriangle className="w-4 h-4" />} label="Skipped" value={summary.skipped ?? 0} color="amber" />
                  <SummaryStat icon={<XOctagon className="w-4 h-4" />} label="Failed" value={summary.failed ?? 0} color="red" />
                  <SummaryStat icon={<Timer className="w-4 h-4" />} label="Total Time" value={formatDuration(summary.total_time)} color="purple" />
                  <SummaryStat icon={<Zap className="w-4 h-4" />} label="Avg / Website" value={formatDuration(summary.average_time_per_website)} color="cyan" />
                </div>
              </div>
            ) : (
              <>
                {/* OVERALL PROGRESS */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm shrink-0">
                  <div className="flex justify-between items-end mb-4">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-1">
                        Overall Bulk Progress
                      </div>
                      <h2 className="text-2xl font-bold text-slate-900">
                        {progress.completed} / {progress.total} websites completed
                      </h2>
                    </div>
                    <div className="text-right">
                      <div className="text-5xl font-black font-mono text-indigo-600 tracking-tighter">
                        {Math.round(progress.progress)}<span className="text-2xl text-slate-400">%</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                    <motion.div
                      className="h-full bg-gradient-to-r from-indigo-600 to-violet-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, progress.progress)}%` }}
                      transition={{ duration: 0.5, ease: "easeInOut" }}
                    />
                  </div>
                  <div className="flex justify-between mt-2.5 text-xs font-mono text-slate-500">
                    <span>Completed: {progress.completed}</span>
                    <span>Running: {progress.running}</span>
                    <span>Queued: {progress.queued}</span>
                    <span>Remaining: {progress.remaining}</span>
                  </div>
                </div>

                {/* CURRENT WEBSITE */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm shrink-0">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-600" /> Currently Analyzing
                  </div>
                  {progress.current_website ? (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                          <span className="font-bold text-slate-900 truncate text-lg">{progress.current_business || "Unknown business"}</span>
                        </div>
                        <a
                          href={progress.current_website.startsWith('http') ? progress.current_website : `https://${progress.current_website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline font-mono mt-1 truncate"
                        >
                          <Globe className="w-3.5 h-3.5 shrink-0" /> {progress.current_website}
                        </a>
                      </div>
                      <div className="flex items-center gap-5">
                        <div className="text-center">
                          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-0.5">Avg / Site</div>
                          <div className="font-mono font-bold text-slate-900">{formatDuration(progress.average_time_per_website)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-0.5">Est. Remaining</div>
                          <div className="font-mono font-bold text-indigo-600">{progress.eta_seconds != null ? formatDuration(progress.eta_seconds) : "—"}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm font-mono">Waiting for the worker to claim the next website...</div>
                  )}
                </div>

                {/* STAT GRID */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 shrink-0">
                  <StatCard icon={<Target className="w-4 h-4" />} label="Total Leads" value={progress.total_leads} color="indigo" />
                  <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Leads Analyzed" value={progress.leads_analyzed} color="emerald" />
                  <StatCard icon={<Link2 className="w-4 h-4" />} label="Duplicates Done" value={`${progress.duplicate_leads_completed}/${progress.duplicate_leads}`} color="blue" />
                  <StatCard icon={<RefreshCw className="w-4 h-4" />} label="Retrying" value={progress.retry} color="amber" />
                  <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Skipped" value={progress.skipped} color="amber" />
                  <StatCard icon={<XOctagon className="w-4 h-4" />} label="Failed" value={progress.failed} color="red" />
                </div>
              </>
            )}

            {/* LIVE LOG STREAM */}
            <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm min-h-[220px]">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-slate-50">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600" /> Live Event Stream
                </h3>
                <span className={`flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  wsConnected ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'
                }`}>
                  <RefreshCw className={`w-3 h-3 ${wsConnected ? '' : 'animate-spin'}`} />
                  {wsConnected ? 'LIVE' : 'RECONNECTING'}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 font-mono text-[11px] custom-scrollbar bg-slate-50">
                {logs.length === 0 ? (
                  <div className="text-slate-400 text-center mt-10 text-sm">Waiting for telemetry...</div>
                ) : logs.map((log) => (
                  <div key={log.id} className="flex gap-3 items-start">
                    <span className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${
                      log.level === 'error' ? 'bg-red-500' :
                      log.level === 'warning' ? 'bg-amber-500' :
                      log.level === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
                    }`} />
                    <span className="text-slate-400 shrink-0">{log.time}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`leading-relaxed ${
                        log.level === 'error' ? 'text-red-700' :
                        log.level === 'warning' ? 'text-amber-700' :
                        log.level === 'success' ? 'text-emerald-700' : 'text-slate-700'
                      }`}>{log.message}</div>
                      {log.website && <div className="text-slate-400 truncate">{log.website}</div>}
                    </div>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="w-80 bg-slate-50 border-l border-gray-200 flex flex-col shadow-sm z-20 shrink-0 hidden xl:flex">
            <div className="p-5 border-b border-gray-200 bg-white">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Cpu className="w-4 h-4" /> Queue Health
              </h3>
              <div className="space-y-3">
                <HealthRow label="WebSocket" value={wsConnected ? "CONNECTED" : "RECONNECTING"} ok={wsConnected} />
                <HealthRow label="Success Rate" value={`${successRate}%`} ok={successRate > 0} />
                <HealthRow label="Active Workers" value={`${progress.running}/${progress.concurrency}`} ok={progress.running > 0 || isTerminal} />
                <HealthRow label="Elapsed" value={formatDuration(elapsed)} ok />
              </div>
            </div>

            <div className="p-4 bg-white border-b border-gray-200 flex flex-col gap-3">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Dedup Efficiency</h4>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-700 flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Linked Leads</span>
                <span className="font-mono font-bold text-indigo-700">{progress.duplicate_leads_completed} / {progress.duplicate_leads}</span>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> Leads Analyzed</span>
                <span className="font-mono font-bold text-emerald-700">{progress.leads_analyzed} / {progress.total_leads}</span>
              </div>
            </div>

            <div className="p-4 bg-white flex flex-col gap-2">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Current Website</h4>
              <div className="bg-slate-50 border border-gray-200 rounded-lg p-2.5 text-xs font-mono text-slate-700 break-all min-h-[36px] flex items-center">
                {progress.current_website || "—"}
              </div>
              {progress.current_website && (
                <button
                  onClick={() => { navigator.clipboard.writeText(progress.current_website || ''); }}
                  className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg px-2 py-1.5 transition-colors self-start"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy URL
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Scrollbar Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.1);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(100,116,139,0.3);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(100,116,139,0.5);
        }
      `}} />
    </motion.div>
  );
}

// Subcomponents

function StatCard({ icon, label, value, color }: { icon: any, label: string, value: string | number, color: string }) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    cyan: 'bg-cyan-50 text-cyan-600',
  };
  const displayValue = value === 0 || value === '' ? '--' : value;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4 hover:shadow-md hover:border-gray-300 transition-all">
      <div className={`p-2.5 rounded-xl ${colorMap[color] || colorMap.indigo}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-0.5">{label}</div>
        <div className="text-xl font-bold font-mono text-slate-900 truncate">{displayValue}</div>
      </div>
    </div>
  );
}

function SummaryStat({ icon, label, value, color }: { icon: any, label: string, value: string | number, color: string }) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    cyan: 'bg-cyan-50 text-cyan-600',
  };
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col items-center gap-2 shadow-sm">
      <div className={`p-2.5 rounded-xl ${colorMap[color] || colorMap.indigo}`}>{icon}</div>
      <div className="text-2xl font-black font-mono text-slate-900">{value}</div>
      <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

function HealthRow({ label, value, ok }: { label: string, value: string, ok: boolean }) {
  return (
    <div className="flex items-center justify-between bg-slate-50 border border-gray-200 rounded-lg px-3 py-2">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <span className={`flex items-center gap-1.5 text-xs font-mono font-bold ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>
        <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'} ${ok ? '' : 'animate-pulse'}`} />
        {value}
      </span>
    </div>
  );
}
