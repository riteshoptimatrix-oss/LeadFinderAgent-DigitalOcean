"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Globe,
  Layers,
  AlertTriangle,
  Clock,
  Square,
  RefreshCw,
  CheckCircle2,
  XOctagon,
  Timer,
  Target,
  Copy,
  ExternalLink,
  Minimize2,
  Maximize2,
  Sparkles,
  Loader2,
  Activity,
  Check,
} from "lucide-react";
import api from '@/lib/axios';

export interface BulkMonitorProps {
  queueId: string;
  queueName?: string;
  onClose: () => void;
  onComplete?: () => Promise<void> | void;
  isMinimized?: boolean;
  onMinimizeChange?: (minimized: boolean) => void;
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

const TERMINAL_BULK_STATUSES = [
  "COMPLETED",
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "FAILED",
  "SKIPPED",
  "CANCELLED",
  "TIMEOUT",
];

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
  average_time_per_website: d.average_time ?? d.average_time_per_website ?? 0,
});

export default function BulkAIAnalysisMonitor({
  queueId,
  queueName,
  onClose,
  onComplete,
  isMinimized: controlledMinimized,
  onMinimizeChange,
}: BulkMonitorProps) {
  const [internalMinimized, setInternalMinimized] = useState(false);
  const isMinimized =
    controlledMinimized !== undefined ? controlledMinimized : internalMinimized;

  const setMinimized = (val: boolean) => {
    setInternalMinimized(val);
    onMinimizeChange?.(val);
  };

  const [progress, setProgress] = useState<BulkProgress>(EMPTY_PROGRESS);
  const [logs, setLogs] = useState<BulkLogEntry[]>([]);
  const [summary, setSummary] = useState<BulkSummary | null>(null);
  const [queueStatus, setQueueStatus] = useState("WAITING");
  const [wsConnected, setWsConnected] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [elapsedTicker, setElapsedTicker] = useState(0);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const summaryRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onCompleteRef = useRef(onComplete);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  // Elapsed ticker
  useEffect(() => {
    const timer = setInterval(() => setElapsedTicker((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll log stream
  useEffect(() => {
    if (!isMinimized) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [logs, isMinimized]);

  const formatDuration = (secs: number | null | undefined): string => {
    if (secs === null || secs === undefined || secs < 0 || !isFinite(secs))
      return "—";
    const s = Math.floor(secs);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const rem = s % 60;
    if (h > 0) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
    return `${m}:${String(rem).padStart(2, "0")}`;
  };

  const pushLog = (
    level: string,
    message: string,
    extra?: Partial<BulkLogEntry>
  ) => {
    if (!message) return;
    setLogs((prev) => [
      ...prev.slice(-199),
      {
        id: Math.random().toString(36).substr(2, 9),
        time: new Date().toLocaleTimeString([], {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        message,
        level,
        ...extra,
      },
    ]);
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
          setProgress((prev) => ({
            ...prev,
            total: data.total_jobs || 0,
            completed: data.completed_jobs || 0,
            failed: data.failed_jobs || 0,
            skipped: data.skipped_jobs || 0,
            running: data.running_jobs || 0,
            queued: data.pending_jobs || 0,
            progress:
              typeof data.overall_progress === "number"
                ? data.overall_progress
                : data.total_jobs
                ? Math.round((data.completed_jobs / data.total_jobs) * 100)
                : 0,
            total_leads: data.total_leads || data.total_jobs || 0,
            leads_analyzed: data.leads_analyzed || 0,
            duplicate_leads: data.duplicate_leads || 0,
            duplicate_leads_completed: data.duplicate_leads_completed || 0,
            concurrency: data.concurrency || 1,
            elapsed_seconds: data.started_at ? prev.elapsed_seconds : 0,
          }));
          if (Array.isArray(data.jobs)) {
            const active = data.jobs.find((j: any) =>
              [
                "STARTED",
                "RUNNING",
                "COLLECTING",
                "ANALYZING",
                "SCORING",
                "SAVING",
              ].includes((j.status || "").toUpperCase())
            );
            if (active) {
              setProgress((prev) => ({
                ...prev,
                current_website: active.website_url,
                current_business: active.business_name || null,
              }));
            }
          }
          if (
            TERMINAL_BULK_STATUSES.includes(statusUpper) &&
            !summaryRef.current
          ) {
            summaryRef.current = true;
            setSummary((prev) => prev || buildFallbackSummary(data));
            setProgress((prev) => ({
              ...prev,
              progress: 100,
              running: 0,
              queued: 0,
              remaining: 0,
            }));
            setTimeout(() => {
              onCompleteRef.current?.();
            }, 1000);
          }
        }
      } catch (err) {
        console.error("Failed to fetch bulk queue state", err);
      }
    };
    fetchQueueState();
    return () => {
      isMounted = false;
    };
  }, [queueId]);

  // Polling fallback when WebSocket is disconnected
  useEffect(() => {
    if (!queueId) return;
    const isTerminal = TERMINAL_BULK_STATUSES.includes(queueStatus);
    if (isTerminal || wsConnected) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/ai-analysis/queue/${queueId}`);
        const data = res.data;
        if (!data) return;
        const statusUpper = (data.status || "WAITING").toUpperCase();
        setQueueStatus(statusUpper);
        setProgress((prev) => ({
          ...prev,
          total: data.total_jobs || prev.total,
          completed: data.completed_jobs || 0,
          failed: data.failed_jobs || 0,
          skipped: data.skipped_jobs || 0,
          running: data.running_jobs || 0,
          queued: data.pending_jobs || 0,
          progress:
            typeof data.overall_progress === "number"
              ? data.overall_progress
              : data.total_jobs
              ? Math.round((data.completed_jobs / data.total_jobs) * 100)
              : 0,
          total_leads: data.total_leads || data.total_jobs || prev.total_leads,
          leads_analyzed: data.leads_analyzed || 0,
          duplicate_leads: data.duplicate_leads || 0,
          duplicate_leads_completed: data.duplicate_leads_completed || 0,
        }));
        if (Array.isArray(data.jobs)) {
          const active = data.jobs.find((j: any) =>
            [
              "STARTED",
              "RUNNING",
              "COLLECTING",
              "ANALYZING",
              "SCORING",
              "SAVING",
            ].includes((j.status || "").toUpperCase())
          );
          if (active) {
            setProgress((prev) => ({
              ...prev,
              current_website: active.website_url,
              current_business: active.business_name || null,
            }));
          }
        }
        if (
          TERMINAL_BULK_STATUSES.includes(statusUpper) &&
          !summaryRef.current
        ) {
          summaryRef.current = true;
          setSummary((prev) => prev || buildFallbackSummary(data));
          setProgress((prev) => ({
            ...prev,
            progress: 100,
            running: 0,
            queued: 0,
            remaining: 0,
          }));
          setTimeout(() => {
            onCompleteRef.current?.();
          }, 1000);
        }
      } catch (err) {
        console.error("Bulk queue polling error:", err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [queueId, wsConnected, queueStatus]);

  // WebSocket connection
  useEffect(() => {
    if (!queueId) return;

    const maxReconnects = 5;
    const FATAL_CLOSE_CODES = [4003, 4401, 4403, 1008];
    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const getWsUrl = () => {
      const raw =
        process.env.NEXT_PUBLIC_WS_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "http://127.0.0.1:8000/api/v1";
      const base = raw.replace("localhost", "127.0.0.1");
      const normalized = base.startsWith("ws")
        ? base
        : base.replace(/^http/, "ws");
      const root = normalized.endsWith("/api/v1")
        ? normalized
        : `${normalized}/api/v1`;
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("access_token") ||
            sessionStorage.getItem("access_token")
          : null;
      const url = `${root}/ai-analysis/ws/${queueId}`;
      return token ? `${url}?token=${token}` : url;
    };

    const handleMessage = (data: any) => {
      const type = data.type || data.event_type || "";
      const upper = type.toUpperCase();

      if (type === "bulk_progress") {
        setProgress((prev) => ({
          ...prev,
          progress:
            typeof data.progress === "number" ? data.progress : prev.progress,
          total: typeof data.total === "number" ? data.total : prev.total,
          completed:
            typeof data.completed === "number"
              ? data.completed
              : prev.completed,
          running:
            typeof data.running === "number" ? data.running : prev.running,
          queued: typeof data.queued === "number" ? data.queued : prev.queued,
          retry: typeof data.retry === "number" ? data.retry : prev.retry,
          skipped:
            typeof data.skipped === "number" ? data.skipped : prev.skipped,
          failed: typeof data.failed === "number" ? data.failed : prev.failed,
          remaining:
            typeof data.remaining === "number"
              ? data.remaining
              : prev.remaining,
          total_leads:
            typeof data.total_leads === "number"
              ? data.total_leads
              : prev.total_leads,
          leads_analyzed:
            typeof data.leads_analyzed === "number"
              ? data.leads_analyzed
              : prev.leads_analyzed,
          duplicate_leads:
            typeof data.duplicate_leads === "number"
              ? data.duplicate_leads
              : prev.duplicate_leads,
          duplicate_leads_completed:
            typeof data.duplicate_leads_completed === "number"
              ? data.duplicate_leads_completed
              : prev.duplicate_leads_completed,
          current_website: data.current_website || prev.current_website,
          current_business: data.current_business || prev.current_business,
          elapsed_seconds:
            typeof data.elapsed_seconds === "number"
              ? data.elapsed_seconds
              : prev.elapsed_seconds,
          eta_seconds: data.eta_seconds ?? prev.eta_seconds,
          average_time_per_website:
            typeof data.average_time_per_website === "number"
              ? data.average_time_per_website
              : prev.average_time_per_website,
          concurrency:
            typeof data.concurrency === "number"
              ? data.concurrency
              : prev.concurrency,
        }));
        if (data.status) setQueueStatus(String(data.status).toUpperCase());
        return;
      }

      if (type === "bulk_log") {
        pushLog(data.level || "info", data.message || "", {
          business_name: data.business_name,
          website: data.website,
        });
        return;
      }

      if (type === "bulk_completed" || upper === "BULK_QUEUE_COMPLETED") {
        if (data.status) setQueueStatus(String(data.status).toUpperCase());
        if (data.summary) setSummary(data.summary);
        pushLog("success", data.message || "Bulk analysis completed.");
        if (!summaryRef.current) {
          summaryRef.current = true;
          setProgress((prev) => ({
            ...prev,
            progress: 100,
            running: 0,
            queued: 0,
            remaining: 0,
          }));
          setTimeout(() => {
            onCompleteRef.current?.();
          }, 1000);
        }
        return;
      }

      if (upper === "BULK_QUEUE_CANCELLED") {
        setQueueStatus("CANCELLED");
        pushLog("warning", data.message || "Bulk analysis cancelled.");
        setProgress((prev) => ({ ...prev, running: 0, queued: 0 }));
        return;
      }

      if (upper === "BULK_QUEUE_STARTED") {
        setQueueStatus("RUNNING");
        pushLog("info", data.message || "Bulk analysis started.");
        return;
      }

      if (upper === "BULK_QUEUE_CREATED") {
        setQueueStatus("WAITING");
        pushLog("info", data.message || "Bulk queue created.");
        if (typeof data.total_jobs === "number") {
          setProgress((prev) => ({ ...prev, total: data.total_jobs }));
        }
        if (typeof data.total_leads === "number") {
          setProgress((prev) => ({ ...prev, total_leads: data.total_leads }));
        }
        return;
      }

      if (upper === "QUEUE_COMPLETED" && !summaryRef.current) {
        const statusUpper = String(
          data.stage || data.status || "COMPLETED"
        ).toUpperCase();
        setQueueStatus(
          TERMINAL_BULK_STATUSES.includes(statusUpper)
            ? statusUpper
            : "COMPLETED"
        );
        summaryRef.current = true;
        setSummary((prev) => prev || buildFallbackSummary(data));
        setProgress((prev) => ({
          ...prev,
          progress: 100,
          running: 0,
          queued: 0,
          remaining: 0,
        }));
        pushLog("success", data.message || "Bulk analysis completed.");
        setTimeout(() => {
          onCompleteRef.current?.();
        }, 1000);
        return;
      }

      const message =
        data.message ||
        (data.stage ? `Stage: ${data.stage}` : "") ||
        (data.business_name ? `Update: ${data.business_name}` : "");
      if (message) {
        let level = "info";
        if (upper.includes("FAIL") || data.stage_status === "failed")
          level = "error";
        else if (upper.includes("COMPLETED") || data.stage_status === "success")
          level = "success";
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
        if (!event.data || typeof event.data !== "string") return;
        const trimmed = event.data.trim();
        if (!trimmed || trimmed === "pong" || trimmed === "ping") return;

        try {
          const data = JSON.parse(trimmed);
          if (!data || !data.type) return;
          if (data.type === "HEARTBEAT" || data.type === "pong") return;
          handleMessage(data);
        } catch (e) {
          console.warn("[BulkAIAnalysisWS] Parse Error", e);
        }
      };

      sock.onclose = (evt) => {
        setWsConnected(false);
        if (wsRef.current === sock) wsRef.current = null;
        if (FATAL_CLOSE_CODES.includes(evt.code)) return;
        scheduleReconnect();
      };

      sock.onerror = () => {
        // Handled by onclose
      };
    };

    const scheduleReconnect = () => {
      if (!isMounted) return;
      if (summaryRef.current) return;
      if (reconnectAttempts >= maxReconnects) return;
      reconnectAttempts += 1;
      const delay = Math.min(10000, 1000 * Math.pow(2, reconnectAttempts - 1));
      reconnectTimer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        const activeWs = ws;
        activeWs.onopen = null;
        activeWs.onmessage = null;
        activeWs.onclose = null;
        activeWs.onerror = null;
        try {
          if (activeWs.readyState === WebSocket.OPEN) {
            activeWs.close();
          } else if (activeWs.readyState === WebSocket.CONNECTING) {
            activeWs.onopen = () => {
              try { activeWs.close(); } catch {}
            };
          }
        } catch {}
      }
      wsRef.current = null;
    };
  }, [queueId]);

  const handleCancel = async () => {
    if (cancelling) return;
    const isTerm = TERMINAL_BULK_STATUSES.includes(queueStatus);
    if (
      !isTerm &&
      !window.confirm("Cancel bulk analysis? Completed results will be saved.")
    )
      return;
    setCancelling(true);
    try {
      await api.post(`/ai-analysis/bulk/${queueId}/stop`);
      setQueueStatus("CANCELLED");
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to cancel queue.";
      pushLog("error", msg);
    } finally {
      setCancelling(false);
    }
  };

  const handleClose = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
    }
    onCloseRef.current();
  };

  const isTerminal = TERMINAL_BULK_STATUSES.includes(queueStatus);
  const isRunning = [
    "STARTED",
    "RUNNING",
    "COLLECTING",
    "ANALYZING",
    "SCORING",
    "SAVING",
  ].includes(queueStatus);
  const elapsed =
    progress.elapsed_seconds > 0 ? progress.elapsed_seconds : elapsedTicker;
  const pct = Math.min(100, Math.round(progress.progress));

  const copyCurrentUrl = () => {
    if (progress.current_website) {
      navigator.clipboard.writeText(progress.current_website);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1500);
    }
  };

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────
          MINIMIZED FLOATING PILL (Non-intrusive bottom right card)
      ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isMinimized && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-[120] w-[350px] max-w-[calc(100vw-32px)] bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 p-3.5 select-none hover:border-slate-300 transition-all cursor-pointer group"
            onClick={() => setMinimized(false)}
          >
            {/* Header row */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="shrink-0">
                  {isTerminal && summary ? (
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                  ) : queueStatus === "FAILED" || queueStatus === "CANCELLED" ? (
                    <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">
                    {isTerminal && summary
                      ? "Bulk Analysis Done"
                      : `Analyzing (${progress.completed}/${progress.total || 0})`}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    {pct}% • {formatDuration(elapsed)}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div
                className="flex items-center gap-1 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setMinimized(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Expand to Full View"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleClose}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Close"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
              <motion.div
                className={`h-full rounded-full transition-all duration-300 ${
                  isTerminal
                    ? "bg-emerald-500"
                    : "bg-gradient-to-r from-blue-600 to-indigo-600"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Subtext info */}
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="truncate max-w-[200px]">
                {progress.current_website ||
                  (isTerminal ? "All tasks processed" : "Processing...")}
              </span>
              <span className="font-mono text-slate-400 text-[10px] shrink-0">
                {progress.concurrency} parallel
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─────────────────────────────────────────────────────────────
          EXPANDED MINIMAL MODAL (Ultra-clean, modern, non-cluttered)
      ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setMinimized(true)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 10 }}
              transition={{ duration: 0.18 }}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl flex flex-col w-full max-w-3xl max-h-[90vh] overflow-hidden text-slate-900 font-sans"
              onClick={(e) => e.stopPropagation()}
            >
              {/* TOP HEADER */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-slate-900 truncate">
                        {queueName || "Bulk AI Website Analysis"}
                      </h2>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isTerminal && summary
                            ? "bg-emerald-50 text-emerald-700"
                            : queueStatus === "FAILED"
                            ? "bg-rose-50 text-rose-700"
                            : queueStatus === "CANCELLED"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {!isTerminal && isRunning && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                        )}
                        {queueStatus}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <Clock className="w-3 h-3" /> {formatDuration(elapsed)}
                      </span>
                      <span>•</span>
                      <span className="text-[11px]">
                        {progress.concurrency} parallel workers
                      </span>
                      {wsConnected && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-600 font-semibold text-[11px]">
                            Live
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {!isTerminal && (
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200/80 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Cancel analysis"
                    >
                      {cancelling ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                      <span>Cancel</span>
                    </button>
                  )}

                  {/* Minimize button */}
                  <button
                    onClick={() => setMinimized(true)}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    title="Minimize to bottom right"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>

                  {/* Close button */}
                  <button
                    onClick={handleClose}
                    className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    title="Close monitor"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* BODY CONTENT */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
                {/* COMPLETION SUMMARY STATE */}
                {summary ? (
                  <div className="bg-white rounded-2xl border border-emerald-200/80 p-6 text-center space-y-4 shadow-xs">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        Bulk AI Analysis Completed
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        All queued websites have been processed and leads updated.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <SummaryCard
                        label="Total Leads"
                        value={summary.total_leads}
                      />
                      <SummaryCard
                        label="Leads Enriched"
                        value={summary.analyzed}
                        highlight
                      />
                      <SummaryCard
                        label="Websites"
                        value={summary.websites_analyzed}
                      />
                      <SummaryCard
                        label="Total Time"
                        value={formatDuration(summary.total_time)}
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={handleClose}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        View Updated Leads
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* PROGRESS BAR SECTION */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            Progress
                          </div>
                          <div className="text-sm font-semibold text-slate-800">
                            {progress.completed} of {progress.total} websites
                            completed
                          </div>
                        </div>
                        <div className="text-3xl font-extrabold font-mono text-slate-900">
                          {pct}
                          <span className="text-sm font-medium text-slate-400">
                            %
                          </span>
                        </div>
                      </div>

                      {/* Bar */}
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.4, ease: "easeInOut" }}
                        />
                      </div>

                      {/* Stat chips row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-slate-100 text-xs">
                        <div className="p-2 bg-slate-50 rounded-xl">
                          <span className="text-slate-400 text-[10px] block font-semibold uppercase">
                            Leads Analyzed
                          </span>
                          <span className="text-slate-800 font-bold font-mono">
                            {progress.leads_analyzed} / {progress.total_leads}
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-xl">
                          <span className="text-slate-400 text-[10px] block font-semibold uppercase">
                            Duplicates Reused
                          </span>
                          <span className="text-slate-800 font-bold font-mono">
                            {progress.duplicate_leads_completed}
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-xl">
                          <span className="text-slate-400 text-[10px] block font-semibold uppercase">
                            Skipped / Failed
                          </span>
                          <span className="text-slate-800 font-bold font-mono">
                            {progress.skipped} / {progress.failed}
                          </span>
                        </div>
                        <div className="p-2 bg-slate-50 rounded-xl">
                          <span className="text-slate-400 text-[10px] block font-semibold uppercase">
                            Avg / Site
                          </span>
                          <span className="text-slate-800 font-bold font-mono">
                            {formatDuration(progress.average_time_per_website)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* CURRENTLY ANALYZING CARD */}
                    {progress.current_website && (
                      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <Loader2 className="w-4 h-4 animate-spin" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Currently Analyzing
                            </div>
                            <div className="text-sm font-bold text-slate-800 truncate">
                              {progress.current_business || "Lead Website"}
                            </div>
                            <a
                              href={
                                progress.current_website.startsWith("http")
                                  ? progress.current_website
                                  : `https://${progress.current_website}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline font-mono inline-flex items-center gap-1 truncate max-w-sm"
                            >
                              <Globe className="w-3 h-3 shrink-0" />
                              <span className="truncate">
                                {progress.current_website}
                              </span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={copyCurrentUrl}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-xs flex items-center gap-1"
                            title="Copy Website URL"
                          >
                            {copiedUrl ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* LIVE EVENT LOG FEED */}
                <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                  <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-slate-500" />
                      Live Activity
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {logs.length} events
                    </span>
                  </div>

                  <div className="p-3 max-h-52 overflow-y-auto space-y-2 font-mono text-[11px] bg-white">
                    {logs.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs">
                        Waiting for activity stream...
                      </div>
                    ) : (
                      logs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-start gap-2.5 text-slate-600"
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                              log.level === "error"
                                ? "bg-rose-500"
                                : log.level === "warning"
                                ? "bg-amber-500"
                                : log.level === "success"
                                ? "bg-emerald-500"
                                : "bg-blue-500"
                            }`}
                          />
                          <span className="text-slate-400 text-[10px] shrink-0">
                            {log.time}
                          </span>
                          <span className="flex-1 break-words">
                            {log.message}
                          </span>
                        </div>
                      ))
                    )}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              </div>

              {/* FOOTER */}
              <div className="px-6 py-3.5 border-t border-slate-100 bg-white flex items-center justify-between text-xs text-slate-500 shrink-0">
                <span>
                  You can safely minimize this monitor and continue using the app.
                </span>
                <button
                  onClick={() => setMinimized(true)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  Minimize Monitor
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-xl border text-center ${
        highlight
          ? "bg-emerald-50 border-emerald-100 text-emerald-900"
          : "bg-slate-50 border-slate-100 text-slate-900"
      }`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
        {label}
      </div>
      <div className="text-lg font-bold font-mono">{value}</div>
    </div>
  );
}
