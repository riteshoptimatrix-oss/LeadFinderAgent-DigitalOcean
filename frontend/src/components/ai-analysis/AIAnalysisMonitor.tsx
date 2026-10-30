"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  RefreshCw,
  AlertTriangle,
  Globe,
  ListChecks,
  Search,
  Zap,
  Accessibility,
  Shield,
  Server,
  File,
  Smartphone,
  Share2,
  Building2,
  Target,
  Mail,
  CheckCircle2,
  CircleAlert,
  CircleX,
} from "lucide-react";
import api from '@/lib/axios';
import { useRouter } from "next/navigation";

import type { WorkerState, TimelineEvent, QueueJob } from "./ui/types";
import { cn } from "@/src/lib/utils";
import { AnalysisHeader } from "./ui/AnalysisHeader";
import { AnalysisStatusBar } from "./ui/AnalysisStatusBar";
import { AnalysisStepper } from "./ui/AnalysisStepper";
import { SummaryCard } from "./ui/SummaryCard";
import { ScoreCard, type CategoryScore } from "./ui/ScoreCard";
import { AIScoreCircle } from "./ui/AIScoreCircle";
import { RecommendationCard } from "./ui/RecommendationCard";
import { EventTimeline } from "./ui/EventTimeline";
import { ActivityFeed } from "./ui/ActivityFeed";
import { InfrastructureCard } from "./ui/InfrastructureCard";
import { LoadingSkeleton } from "./ui/LoadingSkeleton";
import { EmptyState } from "./ui/EmptyState";
import {
  WebsiteStatusCard,
  LeadQualityCard,
  ContactInfoCard,
} from "./ui/SidebarCards";
import {
  getPriority,
  PRIORITY_META,
  getOpportunityLabel,
  getQualityLabel,
} from "./ui/score";
import {
  getIndustry,
  getLocation,
  getTechnologySummary,
  getDomain,
  getSslState,
  getHttpStatus,
  getHosting,
  getPrimaryEmail,
  getPrimaryPhone,
  getAddress,
  getRecommendations,
  getBusinessOpportunityLabel,
  getLeadQualityLabel,
  getTechnologyScore,
  type Enrichment,
} from "./ui/enrichment";

interface MonitorProps {
  queueId: string;
  onClose: () => void;
  onComplete: () => Promise<void> | void;
}

interface RawQueueJob {
  _id?: string;
  id?: string;
  lead_id?: string;
  business_name?: string;
  website_url?: string;
  status?: string;
  current_stage?: string;
  current_progress?: number;
  seo_score?: number;
  emails_discovered?: number;
  overall_ai_score?: number;
  performance_score?: number;
  perf_score?: number;
  ui_score?: number;
  ux_score?: number;
  security_score?: number;
  sec_score?: number;
  accessibility_score?: number;
  acc_score?: number;
  business_opportunity_score?: number;
  bi_score?: number;
  social_media_score?: number;
  mobile_score?: number;
  content_score?: number;
  lead_intelligence_score?: number;
  sales_opportunity_score?: number;
}

const PIPELINE_STAGES = [
  "Queued", "Initializing", "Website Validation", "Website Crawl", "Contact Discovery",
  "Technology Detection", "SEO Analysis", "Performance", "UI", "UX", "Accessibility",
  "Security", "Social Media", "Mobile", "Content", "Business Intelligence",
  "Lead Intelligence", "Sales Opportunity", "Saving", "Completed"
];

const STEPPER_STAGE_MAP = [0, 0, 0, 0, 3, 2, 1, 4, 5, 5, 5, 9, 6, 9, 9, 7, 8, 8, 9, 9];

const getActiveStageIndex = (currentStage: string, queueStatus: string) => {
   if (queueStatus === "COMPLETED") return PIPELINE_STAGES.length - 1;
   const s = currentStage.toLowerCase();
   if (s.includes('queue') || s.includes('wait')) return 0;
   if (s.includes('init')) return 1;
   if (s.includes('valid')) return 2;
   if (s.includes('collect') || s.includes('crawl')) return 3;
   if (s.includes('contact') || s.includes('discovery')) return 4;
   if (s.includes('tech')) return 5;
   if (s.includes('seo')) return 6;
   if (s.includes('perf')) return 7;
   if (s.includes(' ui') || s === 'ui') return 8;
   if (s.includes(' ux') || s === 'ux') return 9;
   if (s.includes('access')) return 10;
   if (s.includes('secur')) return 11;
   if (s.includes('social')) return 12;
   if (s.includes('mobile')) return 13;
   if (s.includes('content')) return 14;
   if (s.includes('business') || s.includes('bi')) return 15;
   if (s.includes('lead intelligence')) return 16;
   if (s.includes('sales') || s.includes('opportunity')) return 17;
   if (s.includes('sav')) return 18;
   if (s.includes('complet')) return 19;
   return 1;
};

const tierRecommendation = (score: number): string | undefined => {
  if (!score || score <= 0) return undefined;
  if (score >= 90) return "Excellent result — no action needed.";
  if (score >= 75) return "Solid score with minor room to improve.";
  if (score >= 60) return "Average — improvements would strengthen the lead.";
  if (score >= 40) return "Below par — worth prioritizing improvements.";
  return "Critical — significant issues need attention.";
};

export default function AIAnalysisMonitor({ queueId, onClose, onComplete }: MonitorProps) {
  const [state, setState] = useState<WorkerState>({
    currentLeadIndex: 0,
    totalLeads: 0,
    currentLeadId: "",
    businessName: "Connecting to Worker...",
    websiteUrl: "Waiting for assignment...",
    stage: "Initializing queue...",
    progress: 0,
    worker: "Worker 1",
    seoScore: 0,
    perfScore: 0,
    uiScore: 0,
    uxScore: 0,
    secScore: 0,
    accScore: 0,
    overallScore: 0,
    businessOpportunityScore: 0,
    socialMediaScore: 0,
    mobileScore: 0,
    contentScore: 0,
    leadIntelligenceScore: 0,
    salesOpportunityScore: 0,
    emailsFound: 0,
    phonesFound: 0,
    pagesCrawled: 0,
    queueStatus: "WAITING",
    pendingJobs: 0,
    runningJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    queueSize: 0,
  });

  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [hardware, setHardware] = useState({ cpu: 0, memory: 0, elapsed: 0 });

  const [hydrated, setHydrated] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const finishingRef = useRef(false);
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const redirectFiredRef = useRef(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Live refs so the WebSocket handler never sees stale props/state
  const stateRef = useRef(state);
  const onCloseRef = useRef(onClose);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { stateRef.current = state; });
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => { onCompleteRef.current = onComplete; });

  // Elapsed-time ticker (UI timing only)
  useEffect(() => {
    const timer = setInterval(() => {
      setHardware(prev => ({ ...prev, elapsed: prev.elapsed + 1 }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initial Data Fetch
  const loadQueueState = useCallback(async () => {
    try {
      const res = await api.get(`/ai-analysis/queue/${queueId}`);
      const data = res.data;
      if (data) {
        const activeStates = ["WAITING", "QUEUED", "STARTED", "COLLECTING", "ANALYZING", "SCORING", "SAVING"];
        const isQueueActive = activeStates.includes((data.status || "").toUpperCase());

        setState(prev => ({
          ...prev,
          totalLeads: data.total_jobs || 0,
          completedJobs: data.completed_jobs || 0,
          queueStatus: data.status,
          pendingJobs: isQueueActive ? Math.max(0, (data.total_jobs || 0) - (data.completed_jobs || 0) - 1) : 0,
          runningJobs: isQueueActive ? 1 : 0,
          queueSize: Math.max(0, (data.total_jobs || 0) - (data.completed_jobs || 0))
        }));

        if (data.jobs && Array.isArray(data.jobs)) {
           const mappedJobs = data.jobs.map((j: RawQueueJob) => ({
              id: j._id || j.id,
              lead_id: j.lead_id,
              business_name: j.business_name || j.website_url,
              website_url: j.website_url,
              status: j.status,
               stage: j.current_stage || j.status,
               progress: j.current_progress || 0,
               worker: "Worker 1",
              seo_score: j.seo_score,
              emails_discovered: j.emails_discovered,
              overall_ai_score: j.overall_ai_score,
              performance_score: j.performance_score || j.perf_score,
              ui_score: j.ui_score,
              ux_score: j.ux_score,
              security_score: j.security_score || j.sec_score,
              accessibility_score: j.accessibility_score || j.acc_score,
               business_opportunity_score: j.business_opportunity_score || j.bi_score,
               social_media_score: j.social_media_score,
               mobile_score: j.mobile_score,
               content_score: j.content_score,
               lead_intelligence_score: j.lead_intelligence_score,
               sales_opportunity_score: j.sales_opportunity_score,
               elapsed: 0
           }));
           setJobs(mappedJobs);

           const activeJob = mappedJobs.find((j: QueueJob) => j.status === 'Running' || j.status === 'WAITING' || j.status === 'STARTED' || j.status === 'ANALYZING') || mappedJobs[mappedJobs.length - 1];
           if (activeJob) {
               setState(prev => ({
                   ...prev,
                   currentLeadId: activeJob.lead_id,
                   businessName: activeJob.business_name,
                   websiteUrl: activeJob.website_url,
                   stage: activeJob.stage,
                   progress: activeJob.progress,
                   seoScore: activeJob.seo_score || prev.seoScore,
                   perfScore: activeJob.performance_score || prev.perfScore,
                   uiScore: activeJob.ui_score || prev.uiScore,
                   uxScore: activeJob.ux_score || prev.uxScore,
                   secScore: activeJob.security_score || prev.secScore,
                   accScore: activeJob.accessibility_score || prev.accScore,
                   overallScore: activeJob.overall_ai_score || prev.overallScore,
                   businessOpportunityScore: activeJob.business_opportunity_score || prev.businessOpportunityScore,
                   socialMediaScore: activeJob.social_media_score || prev.socialMediaScore,
                   mobileScore: activeJob.mobile_score || prev.mobileScore,
                   contentScore: activeJob.content_score || prev.contentScore,
                   leadIntelligenceScore: activeJob.lead_intelligence_score || prev.leadIntelligenceScore,
                   salesOpportunityScore: activeJob.sales_opportunity_score || prev.salesOpportunityScore,
                   emailsFound: activeJob.emails_discovered || prev.emailsFound,
               }));
           }
        }
      }
    } catch (err) {
      console.error("Failed to fetch initial queue state", err);
    } finally {
      setHydrated(true);
    }
  }, [queueId]);

  useEffect(() => {
    const run = async () => {
      await loadQueueState();
    };
    run();
  }, [loadQueueState]);

  // Fallback real-time polling. The WebSocket is the primary live source, but
  // if it fails to connect / deliver frames the category scores would stay
  // stuck at "Pending / Awaiting analysis results". Poll the REST queue
  // endpoint (which already returns every per-category score) as a resilient
  // fallback so the AI Analysis Categories section always updates.
  useEffect(() => {
    if (!hydrated) return;
    let inFlight = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (inFlight) return;
      const terminalStatus = ["COMPLETED", "PARTIAL_SUCCESS", "FAILED", "CANCELLED", "SKIPPED"].includes(
        (stateRef.current.queueStatus || "").toUpperCase()
      );
      if (terminalStatus) return;
      inFlight = true;
      try {
        await loadQueueState();
      } catch (e) {
        console.error("[AIAnalysisMonitor] Poll refresh failed", e);
      } finally {
        inFlight = false;
      }
    };

    // Poll only while the live WebSocket is not delivering frames, so we
    // never fight the socket or overwrite its fresher progress/status.
    if (wsConnected) return;

    timer = setInterval(() => { void poll(); }, 4000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [queueId, loadQueueState, hydrated, wsConnected]);

  // Enrichment fetch — read-only display data for the current lead
  useEffect(() => {
    const leadId = state.currentLeadId;
    if (!leadId) return;
    let cancelled = false;
    api.get(`/ai-analysis/lead/${leadId}/analysis-summary`)
      .then(res => { if (!cancelled) setEnrichment(res.data || null); })
      .catch(() => { if (!cancelled) setEnrichment(null); });
    return () => { cancelled = true; setEnrichment(null); };
  }, [state.currentLeadId]);

  // WebSocket Connection — streams live worker events for this queue
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket payload is a loose JSON shape
    const pushTimeline = (data: any) => {
      const message = data.message || (data.stage ? `Stage updated: ${data.stage}` : null);
      if (!message) return;
      let status: "success" | "warning" | "error" | "info" = "info";
      const type = (data.type || data.event_type || '').toUpperCase();
      if (type.includes('FAIL') || data.stage_status === 'failed') status = "error";
      else if (String(message).toLowerCase().includes('warn')) status = "warning";
      else if (type.includes('COMPLETED') || data.stage_status === 'success') status = "success";
      const now = new Date();
      setTimeline(prev => [...prev.slice(-99), {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: now.toISOString(),
        time: now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        message,
        stage: data.stage || "System",
        status,
      }]);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket payload is a loose JSON shape
    const updateLiveJob = (data: any) => {
      if (!data.job_id) return;
      setJobs(prevJobs => {
        const idx = prevJobs.findIndex(j => j.id === data.job_id);
        if (idx < 0) {
          return [...prevJobs, {
            id: data.job_id,
            lead_id: data.lead_id || "",
            business_name: data.business_name || data.website || "Unknown",
            website_url: data.website || "",
            status: data.stage_status === 'success' ? 'Completed' : data.stage_status === 'failed' ? 'Failed' : 'Running',
            stage: data.stage || "",
            progress: typeof data.progress === 'number' ? data.progress : 0,
            worker: data.worker || "Worker 1",
            seo_score: data.metrics?.seo_score ?? null,
            emails_discovered: data.metrics?.emails_discovered ?? null,
            overall_ai_score: data.metrics?.overall_score ?? null,
            elapsed: 0,
          }];
        }
        const updated = { ...prevJobs[idx] };
        updated.stage = data.stage || updated.stage;
        updated.progress = typeof data.progress === 'number' ? data.progress : updated.progress;
        updated.business_name = data.business_name || updated.business_name;
        updated.website_url = data.website || updated.website_url;
        if (data.stage_status === 'success') updated.status = 'Completed';
        else if (data.stage_status === 'failed') updated.status = 'Failed';
        else if (!['Completed', 'Failed'].includes(updated.status)) updated.status = 'Running';
        if (data.metrics) {
          updated.seo_score = data.metrics.seo_score ?? updated.seo_score ?? null;
          updated.emails_discovered = typeof data.metrics.emails_discovered === 'number'
            ? data.metrics.emails_discovered : updated.emails_discovered;
          updated.overall_ai_score = data.metrics.overall_score ?? updated.overall_ai_score ?? null;
        }
        return prevJobs.map((j, i) => i === idx ? updated : j);
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket payload is a loose JSON shape
    const handleTerminal = (data: any, completed: boolean) => {
      const finalLeadId = data.lead_id || stateRef.current.currentLeadId;
      setState(prev => ({
        ...prev,
        queueStatus: completed ? 'COMPLETED' : 'FAILED',
        progress: 100,
        pendingJobs: 0,
        runningJobs: 0,
      }));
      if (redirectFiredRef.current) return;
      if (completed && finalLeadId) {
        redirectFiredRef.current = true;
        setRedirecting(true);
        setTimeout(() => {
          router.push(`/dashboard/leads/detail?id=${finalLeadId}`);
          onCloseRef.current();
        }, 2000);
      } else if (!finishingRef.current) {
        finishingRef.current = true;
        void (async () => {
          try {
            await onCompleteRef.current();
          } finally {
            onCloseRef.current();
          }
        })();
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket payload is a loose JSON shape
    const applyLiveData = (data: any) => {
      if (typeof data.metrics?.cpu_percent === 'number') {
        setHardware(prev => ({ ...prev, cpu: Math.max(0, Math.min(100, data.metrics.cpu_percent)) }));
      }
      if (typeof data.metrics?.memory_percent === 'number') {
        setHardware(prev => ({ ...prev, memory: Math.max(0, Math.min(100, data.metrics.memory_percent)) }));
      }

      pushTimeline(data);
      updateLiveJob(data);

      // Apply any live progress/score/metrics carried by the frame. Terminal
      // frames (QUEUE_COMPLETED / analysis_completed / completed / failed)
      // carry the FULL final score snapshot, so they must also update the
      // category scores here — otherwise the panel stays stuck on "Pending".
      // Each value falls back to the previous value when the field is absent
      // so frames that only carry progress still refresh the section.
      setState(prev => ({
        ...prev,
        currentLeadId: data.lead_id || prev.currentLeadId,
        businessName: data.business_name || prev.businessName,
        websiteUrl: data.website || prev.websiteUrl,
        stage: data.stage || prev.stage,
        progress: typeof data.progress === 'number' ? data.progress : prev.progress,
        worker: data.worker || prev.worker,
        seoScore: typeof data.metrics?.seo_score === 'number' ? data.metrics.seo_score : prev.seoScore,
        perfScore: typeof data.metrics?.performance_score === 'number' ? data.metrics.performance_score : prev.perfScore,
        uiScore: typeof data.metrics?.ui_score === 'number' ? data.metrics.ui_score : prev.uiScore,
        uxScore: typeof data.metrics?.ux_score === 'number' ? data.metrics.ux_score : prev.uxScore,
        secScore: typeof data.metrics?.security_score === 'number' ? data.metrics.security_score : prev.secScore,
        accScore: typeof data.metrics?.accessibility_score === 'number' ? data.metrics.accessibility_score : prev.accScore,
        overallScore: typeof data.metrics?.overall_score === 'number' ? data.metrics.overall_score : prev.overallScore,
        businessOpportunityScore: typeof data.metrics?.business_opportunity_score === 'number' ? data.metrics.business_opportunity_score : prev.businessOpportunityScore,
        socialMediaScore: typeof data.metrics?.social_media_score === 'number' ? data.metrics.social_media_score : prev.socialMediaScore,
        mobileScore: typeof data.metrics?.mobile_score === 'number' ? data.metrics.mobile_score : prev.mobileScore,
        contentScore: typeof data.metrics?.content_score === 'number' ? data.metrics.content_score : prev.contentScore,
        leadIntelligenceScore: typeof data.metrics?.lead_intelligence_score === 'number' ? data.metrics.lead_intelligence_score : prev.leadIntelligenceScore,
        salesOpportunityScore: typeof data.metrics?.sales_opportunity_score === 'number' ? data.metrics.sales_opportunity_score : prev.salesOpportunityScore,
        pagesCrawled: typeof data.metrics?.pages_crawled === 'number' ? data.metrics.pages_crawled : prev.pagesCrawled,
        emailsFound: typeof data.metrics?.emails_discovered === 'number'
          ? data.metrics.emails_discovered
          : Array.isArray(data.metrics?.emails_discovered) ? data.metrics.emails_discovered.length : prev.emailsFound,
        phonesFound: typeof data.metrics?.phones_discovered === 'number'
          ? data.metrics.phones_discovered
          : Array.isArray(data.metrics?.phones_discovered) ? data.metrics.phones_discovered.length : prev.phonesFound,
        queueStatus: data.queue_status || prev.queueStatus,
        pendingJobs: data.metrics?.pending_jobs ?? prev.pendingJobs,
        runningJobs: data.metrics?.running_jobs ?? prev.runningJobs,
        completedJobs: data.metrics?.completed_jobs ?? prev.completedJobs,
        queueSize: data.metrics?.queue_size ?? prev.queueSize,
        totalLeads: data.metrics?.total_jobs ?? prev.totalLeads,
      }));
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket payload is a loose JSON shape
    const handleMessage = (data: any) => {
      const type = data.type || data.event_type || '';
      const upper = type.toUpperCase();

      const isTerminal = type === 'QUEUE_COMPLETED' || upper === 'QUEUE_FAILED'
        || type === 'analysis_completed' || type === 'completed' || type === 'failed';

      // Always refresh live data (progress + scores) first. This makes the
      // panel update in real time for every stage and, crucially, applies the
      // final score snapshot carried by the terminal/completed frame.
      applyLiveData(data);

      if (isTerminal) {
        const isCompleted = type === 'QUEUE_COMPLETED'
          || type === 'completed'
          || (type === 'analysis_completed' && String(data.status || '').toUpperCase() !== 'FAILED')
          || data.stage_status === 'success';
        handleTerminal(data, isCompleted);
      }
    };

    const connect = () => {
      if (!isMounted) return;
      let sock: WebSocket;
      try {
        sock = new WebSocket(getWsUrl());
      } catch (e) {
        console.error("[AIAnalysisWS] ERROR: failed to construct WebSocket", e);
        scheduleReconnect();
        return;
      }
      ws = sock;
      wsRef.current = sock;
      console.log(`[AIAnalysisWS] CONNECTING ${sock.url}`);

      sock.onopen = () => {
        reconnectAttempts = 0;
        setWsConnected(true);
        console.log(`[AIAnalysisWS] CONNECTED ${sock.url}`);
      };

      sock.onmessage = (event) => {
        if (!event.data || typeof event.data !== 'string') return;
        const trimmed = event.data.trim();
        if (!trimmed || trimmed === 'pong' || trimmed === 'ping') return;

        try {
          const data = JSON.parse(trimmed);
          if (!data || !data.type) return;
          if (data.type === 'HEARTBEAT' || data.type === 'pong') return;
          console.log(`[AIAnalysisWS] MESSAGE_RECEIVED type=${data.type} stage=${data.stage || ''} status=${data.queue_status || data.status || ''}`);
          handleMessage(data);
        } catch (e) {
          console.warn("[AIAnalysisWS] Parse Error", e);
        }
      };

      sock.onclose = (evt) => {
        setWsConnected(false);
        if (wsRef.current === sock) wsRef.current = null;
        console.log(`[AIAnalysisWS] CLOSED code=${evt.code} reason=${evt.reason || 'no-reason'} clean=${evt.wasClean}`);
        if (FATAL_CLOSE_CODES.includes(evt.code)) {
          console.error(`[AIAnalysisWS] Connection rejected by server (code ${evt.code}). Stopping reconnect loop.`);
          return;
        }
        scheduleReconnect();
      };

      sock.onerror = () => {
        console.error(`[AIAnalysisWS] ERROR ${sock.url}`);
      };
    };

    const scheduleReconnect = () => {
      if (!isMounted) return;
      const terminalStatus = ['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED'].includes((stateRef.current.queueStatus || '').toUpperCase());
      if (terminalStatus || reconnectAttempts >= maxReconnects) return;
      reconnectAttempts += 1;
      const delay = Math.min(15000, 1000 * Math.pow(2, reconnectAttempts - 1));
      console.log(`[AIAnalysisWS] RECONNECTING attempt ${reconnectAttempts}/${maxReconnects} in ${delay}ms`);
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
        } catch {
          /* socket error ignored */
        }
      }
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable; reconnecting would be wrong
  }, [queueId]);

  const handleClose = () => {
    const closeSocket = () => {
      if (!wsRef.current) return;
      try {
        wsRef.current.close();
      } catch {
        /* socket still connecting; aborted */
      }
    };
    const isTerminal = ["COMPLETED", "PARTIAL_SUCCESS", "FAILED"].includes((state.queueStatus || "").toUpperCase());
    if (!isTerminal) {
      if (window.confirm("Analysis is still in progress. Close the monitor? (Analysis will continue in the background)")) {
        closeSocket();
        onClose();
      }
      return;
    }
    closeSocket();
    onClose();
  };

  const handleCloseQuiet = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* socket still connecting; aborted */
      }
    }
    onClose();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadQueueState();
    } finally {
      setRefreshing(false);
    }
  };

  const handleExportReport = () => {
    const report = {
      generated_at: new Date().toISOString(),
      queue_id: queueId,
      status: state.queueStatus,
      lead: {
        id: state.currentLeadId,
        business_name: state.businessName,
        website_url: state.websiteUrl,
      },
      progress: {
        percent: Math.round(state.progress),
        stage: state.stage,
        worker: state.worker,
        elapsed_seconds: hardware.elapsed,
        estimated_remaining_seconds: estimatedSeconds,
      },
      queue: {
        total_jobs: state.totalLeads,
        completed_jobs: state.completedJobs,
        pending_jobs: state.pendingJobs,
        failed_jobs: state.failedJobs,
      },
      scores: {
        overall: state.overallScore,
        seo: state.seoScore,
        performance: state.perfScore,
        ui: state.uiScore,
        ux: state.uxScore,
        security: state.secScore,
        accessibility: state.accScore,
        business_opportunity: state.businessOpportunityScore,
        social_media: state.socialMediaScore,
        mobile: state.mobileScore,
        content: state.contentScore,
        lead_intelligence: state.leadIntelligenceScore,
        sales_opportunity: state.salesOpportunityScore,
      },
      discovered: {
        emails: state.emailsFound,
        phones: state.phonesFound,
        pages_crawled: state.pagesCrawled,
      },
      hardware: { cpu: hardware.cpu, memory: hardware.memory },
      event_log: timeline,
      queue_tasks: jobs,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ai-analysis-report-${queueId.slice(0, 8)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const activeStageIdx = getActiveStageIndex(state.stage, state.queueStatus);
  const successRate = state.totalLeads > 0
    ? Math.round((state.completedJobs / state.totalLeads) * 100)
    : 0;

  const queueProgress = state.totalLeads > 0
    ? Math.round((state.completedJobs / state.totalLeads) * 100)
    : 0;

  const estimatedSeconds = state.completedJobs > 0 && state.queueStatus !== "COMPLETED" && state.queueStatus !== "FAILED"
    ? Math.round((hardware.elapsed / state.completedJobs) * (state.totalLeads - state.completedJobs))
    : 0;

  const errorCount = timeline.filter(t => t.status === 'error').length;
  const warningCount = timeline.filter(t => t.status === 'warning').length;

  const statusUpper = (state.queueStatus || "").toUpperCase();
  const isComplete = ["COMPLETED", "PARTIAL_SUCCESS"].includes(statusUpper);
  const isFailed = statusUpper === "FAILED";
  const isSkipped = state.stage === 'Skipped' || statusUpper === 'Skipped';

  const currentStep = isComplete ? 9 : STEPPER_STAGE_MAP[Math.min(activeStageIdx, STEPPER_STAGE_MAP.length - 1)] ?? 0;

  const showEmpty =
    hydrated &&
    jobs.length === 0 &&
    timeline.length === 0 &&
    state.progress === 0 &&
    !isComplete &&
    !isFailed &&
    !isSkipped &&
    !["STARTED", "ANALYZING", "COLLECTING", "SCORING", "SAVING"].includes(statusUpper);

  const priority = getPriority(state.overallScore);
  const priorityChip = {
    label: priority,
    className: cn(
      PRIORITY_META[priority].bg,
      PRIORITY_META[priority].text,
      PRIORITY_META[priority].ring
    ),
  };

  const httpStatus = getHttpStatus(enrichment);
  const onlineLabel = isFailed
    ? "Offline"
    : isComplete
      ? httpStatus != null && httpStatus >= 400 ? "Offline" : "Online"
      : "Analyzing";
  const onlineTone = onlineLabel === "Online" ? "online" as const : onlineLabel === "Offline" ? "offline" as const : "pending" as const;

  const websiteStatus = {
    label: isFailed ? "Offline" : isComplete ? "Online" : isSkipped ? "Skipped" : "Analyzing",
    dot: isFailed ? "bg-red-500" : isComplete ? "bg-green-500" : "bg-blue-500 animate-pulse",
  };

  const ssl = getSslState(enrichment);
  const domain = getDomain(enrichment) || (state.websiteUrl ? state.websiteUrl.replace(/^https?:\/\//, "").split("/")[0] : null);
  const hosting = getHosting(enrichment);

  const recommendations = getRecommendations(enrichment);
  const leadQuality = getLeadQualityLabel(enrichment) || getQualityLabel(state.leadIntelligenceScore);
  const opportunityLabel = getBusinessOpportunityLabel(enrichment) || getOpportunityLabel(state.businessOpportunityScore);

  const email = getPrimaryEmail(enrichment) || (state.emailsFound > 0 ? `${state.emailsFound} email${state.emailsFound > 1 ? "s" : ""} found` : null);
  const phone = getPrimaryPhone(enrichment) || (state.phonesFound > 0 ? `${state.phonesFound} phone${state.phonesFound > 1 ? "s" : ""} found` : null);
  const address = getAddress(enrichment);

  const technologyScore = getTechnologyScore(enrichment);
  const contactScore = state.emailsFound + state.phonesFound > 0
    ? Math.min(100, Math.round((state.emailsFound * 20) + (state.phonesFound * 10)))
    : 0;

  const categories: CategoryScore[] = [
    { id: "seo", label: "SEO", icon: <Search className="w-4 h-4" />, score: state.seoScore, recommendation: tierRecommendation(state.seoScore) },
    { id: "performance", label: "Performance", icon: <Zap className="w-4 h-4" />, score: state.perfScore, recommendation: tierRecommendation(state.perfScore) },
    { id: "accessibility", label: "Accessibility", icon: <Accessibility className="w-4 h-4" />, score: state.accScore, recommendation: tierRecommendation(state.accScore) },
    { id: "security", label: "Security", icon: <Shield className="w-4 h-4" />, score: state.secScore, recommendation: tierRecommendation(state.secScore) },
    { id: "technology", label: "Technology", icon: <Server className="w-4 h-4" />, score: technologyScore, recommendation: tierRecommendation(technologyScore) },
    { id: "content", label: "Content", icon: <File className="w-4 h-4" />, score: state.contentScore, recommendation: tierRecommendation(state.contentScore) },
    { id: "mobile", label: "Mobile", icon: <Smartphone className="w-4 h-4" />, score: state.mobileScore, recommendation: tierRecommendation(state.mobileScore) },
    { id: "social", label: "Social", icon: <Share2 className="w-4 h-4" />, score: state.socialMediaScore, recommendation: tierRecommendation(state.socialMediaScore) },
    { id: "opportunity", label: "Business Opportunity", icon: <Building2 className="w-4 h-4" />, score: state.businessOpportunityScore, recommendation: tierRecommendation(state.businessOpportunityScore) },
    { id: "lead", label: "Lead Quality", icon: <Target className="w-4 h-4" />, score: state.leadIntelligenceScore, recommendation: tierRecommendation(state.leadIntelligenceScore) },
    { id: "contacts", label: "Contact Quality", icon: <Mail className="w-4 h-4" />, score: contactScore, recommendation: tierRecommendation(contactScore) },
    { id: "website", label: "Website Quality", icon: <Globe className="w-4 h-4" />, score: state.overallScore, recommendation: tierRecommendation(state.overallScore) },
  ];

  const recLoading = recommendations.length === 0 && !isComplete && !isFailed;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-gray-900/40 backdrop-blur-sm p-2 sm:p-4"
    >
      <div className="bg-white border border-gray-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] flex flex-col h-full overflow-hidden text-gray-900 font-sans mx-auto w-full max-w-[1600px] relative">

        {/* Redirecting Overlay */}
        <AnimatePresence>
          {redirecting && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm"
            >
              <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-50 mb-6 shadow-sm">
                <Check className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2 text-center">
                AI Analysis Completed
              </h2>
              <p className="text-blue-600 font-medium tracking-widest uppercase text-[12px] animate-pulse flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Opening Lead Details...
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {!hydrated ? (
          <LoadingSkeleton />
        ) : showEmpty ? (
          <div className="flex-1 flex flex-col">
            <AnalysisHeader
              queueId={queueId}
              status={state.queueStatus}
              live={wsConnected}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              onExport={handleExportReport}
              onCancel={handleClose}
            />
            <EmptyState onGoToLeads={handleCloseQuiet} />
          </div>
        ) : isSkipped ? (
          <div className="flex-1 flex flex-col">
            <AnalysisHeader
              queueId={queueId}
              status={state.queueStatus}
              live={wsConnected}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              onExport={handleExportReport}
              onCancel={handleClose}
            />
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="max-w-lg w-full bg-amber-50 border border-amber-100 rounded-xl p-10 text-center">
                <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-amber-900 mb-2">
                  No Professional Website Found
                </h2>
                <p className="text-[14px] text-amber-800 leading-relaxed">
                  This business has not provided a standalone website. Only social
                  media or profile links are available. AI Website Analysis cannot
                  be performed.
                </p>
                {state.websiteUrl && state.websiteUrl !== "Waiting for assignment..." && (
                  <a
                    href={state.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-amber-300 text-amber-900 rounded-lg hover:bg-amber-100 transition-colors font-semibold shadow-sm mt-6"
                  >
                    <Globe className="w-4 h-4" /> Visit Provided Link
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <AnalysisHeader
              queueId={queueId}
              status={state.queueStatus}
              live={wsConnected}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              onExport={handleExportReport}
              onCancel={handleClose}
            />

            <AnalysisStatusBar
              status={state.queueStatus}
              progress={queueProgress}
              stage={state.stage}
              elapsed={hardware.elapsed}
              estimated={estimatedSeconds}
              queueLabel={`${state.completedJobs} of ${state.totalLeads || "—"}`}
              worker={state.worker}
              wsConnected={wsConnected}
            />

            <div className="mt-4">
              <AnalysisStepper currentStep={currentStep} complete={isComplete} />
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto bg-[#FAFAFA]">
              <div className="max-w-[1600px] mx-auto p-6 lg:grid lg:grid-cols-[1fr_340px] lg:gap-6">
                {/* ── Left Column ─────────────────────────────────────── */}
                <main className="min-w-0 space-y-5">
                  <SummaryCard
                    businessName={state.businessName}
                    websiteUrl={state.websiteUrl}
                    industry={getIndustry(enrichment)}
                    location={getLocation(enrichment)}
                    technology={getTechnologySummary(enrichment)}
                    aiScore={state.overallScore}
                    priority={priorityChip}
                    status={websiteStatus}
                  />

                  <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
                      <h2 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
                        <ListChecks className="w-4 h-4 text-gray-400" />
                        AI Analysis Categories
                      </h2>
                      <span className="text-[12px] text-gray-400 tabular-nums">
                        {errorCount > 0 || warningCount > 0
                          ? `${errorCount} error${errorCount === 1 ? "" : "s"} · ${warningCount} warning${warningCount === 1 ? "" : "s"}`
                          : `${successRate}% success`}
                      </span>
                    </div>
                    <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
                      {categories.map((category, i) => (
                        <ScoreCard key={category.id} category={category} delay={i * 0.02} />
                      ))}
                    </div>
                  </section>

                  <EventTimeline events={timeline} />

                  <QueueTasks jobs={jobs} />
                </main>

                {/* ── Right Sidebar ───────────────────────────────────── */}
                <aside className="min-w-0 space-y-4 mt-6 lg:mt-0 lg:sticky lg:top-0 lg:self-start">
                  <AIScoreCircle score={state.overallScore} />
                  <WebsiteStatusCard
                    onlineLabel={onlineLabel}
                    onlineTone={onlineTone}
                    ssl={ssl}
                    domain={domain}
                    hosting={hosting}
                  />
                  <LeadQualityCard leadQuality={leadQuality} opportunity={opportunityLabel} />
                  <ContactInfoCard
                    email={email}
                    phone={phone}
                    website={state.websiteUrl !== "Waiting for assignment..." ? state.websiteUrl : null}
                    address={address}
                  />
                  <RecommendationCard items={recommendations} loading={recLoading} />
                  <InfrastructureCard
                    cpu={hardware.cpu}
                    memory={hardware.memory}
                    worker={state.worker}
                    wsConnected={wsConnected}
                  />
                  <ActivityFeed events={timeline} />
                </aside>
              </div>
            </div>
          </>
        )}

      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </motion.div>
  );
}

// Subcomponents

function JobStatusPill({ status }: { status: string }) {
  const s = (status || "").toUpperCase();
  if (["RUNNING", "CRAWLING", "WAITING", "QUEUED", "STARTED", "COLLECTING", "ANALYZING", "SCORING", "SAVING"].includes(s)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-blue-50 text-blue-700">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        Running
      </span>
    );
  }
  if (s === "COMPLETED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-green-50 text-green-700">
        <CheckCircle2 className="w-3 h-3" />
        Completed
      </span>
    );
  }
  if (s === "PARTIAL_SUCCESS") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-600">
        <CircleAlert className="w-3 h-3" />
        Partial
      </span>
    );
  }
  if (s === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-red-50 text-red-600">
        <CircleX className="w-3 h-3" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-gray-100 text-gray-500">
      Pending
    </span>
  );
}

function QueueTasks({ jobs }: { jobs: QueueJob[] }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl shadow-sm">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-gray-400" />
          Queue Tasks
        </h3>
        <span className="text-[12px] text-gray-400 tabular-nums">{jobs.length} tasks</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wider text-gray-400">
              <th className="px-5 py-2.5 font-semibold w-1/3">Business Target</th>
              <th className="px-5 py-2.5 font-semibold w-32">Status</th>
              <th className="px-5 py-2.5 font-semibold w-2/5">Live Progress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-5 py-8 text-center text-gray-400 text-[13px]">
                  Awaiting queue tasks...
                </td>
              </tr>
            ) : (
              jobs.map((job) => {
                const running = job.status === 'Running' || job.status === 'RUNNING';
                return (
                  <tr key={job.id} className={running ? "bg-blue-50/40" : "hover:bg-gray-50 transition-colors"}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-800 truncate max-w-[320px]">
                        {job.business_name}
                      </div>
                      <div className="text-[12px] text-gray-400 truncate max-w-[320px] font-mono mt-0.5">
                        {job.website_url}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <JobStatusPill status={job.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              job.status === 'Completed' || job.status === 'COMPLETED'
                                ? "bg-green-500"
                                : job.status === 'Failed' || job.status === 'FAILED'
                                  ? "bg-red-500"
                                  : job.status === 'PARTIAL_SUCCESS'
                                    ? "bg-amber-500"
                                    : "bg-blue-500"
                            )}
                            style={{ width: `${Math.min(100, job.progress)}%` }}
                          />
                        </div>
                        <span className="text-[12px] tabular-nums text-gray-600 w-9 text-right">
                          {Math.round(job.progress)}%
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 truncate mt-1">
                        {job.stage}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
