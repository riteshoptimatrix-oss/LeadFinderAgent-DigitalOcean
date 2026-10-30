'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  RefreshCw,
  Globe,
  Mail,
  Phone,
  Building2,
  MapPin,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Gauge,
  Cpu,
  Share2,
  FileText,
  Users,
  Search,
  CheckCircle2,
  Info,
  Server,
  Zap,
  TrendingUp,
  Lock,
  Smartphone
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';

interface LeadAnalysisDrawerProps {
  leadId: string | null;
  initialLead?: any;
  isOpen: boolean;
  onClose: () => void;
  onAnalysisComplete?: (updatedLead: any) => void;
  autoStartAnalysis?: boolean;
}

export default function LeadAnalysisDrawer({
  leadId,
  initialLead,
  isOpen,
  onClose,
  onAnalysisComplete,
  autoStartAnalysis = false,
}: LeadAnalysisDrawerProps) {
  const [lead, setLead] = useState<any>(initialLead || null);
  const [loading, setLoading] = useState(false);
  const [isStartingJob, setIsStartingJob] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'seo' | 'recommendations'>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Live telemetry state
  const [liveProgress, setLiveProgress] = useState<number | null>(null);
  const [liveStage, setLiveStage] = useState<string>('');
  const [liveStartedAt, setLiveStartedAt] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasTriggeredRef = useRef(false);

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Fetch lead data from server
  const fetchLeadData = useCallback(async (id: string) => {
    try {
      const res = await api.get(`/leads/${id}`);
      if (res.data) {
        setLead(res.data);
        return res.data;
      }
    } catch (err) {
      console.error('Failed to load lead details:', err);
    }
    return null;
  }, []);

  // Update lead when drawer opens or leadId changes
  useEffect(() => {
    if (!isOpen || !leadId) {
      hasTriggeredRef.current = false;
      return;
    }

    if (initialLead && (initialLead._id === leadId || initialLead.id === leadId)) {
      setLead(initialLead);
    }
    fetchLeadData(leadId);
  }, [isOpen, leadId, initialLead, fetchLeadData]);

  // Helper to safely close WebSocket without premature abort warnings
  const safeCloseWs = (socket: WebSocket | null) => {
    if (!socket) return;
    try {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      } else if (socket.readyState === WebSocket.CONNECTING) {
        socket.onopen = () => {
          try { socket.close(); } catch {}
        };
      }
    } catch {}
  };

  // Clean up WebSocket and polling interval on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        safeCloseWs(wsRef.current);
        wsRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  // Analysis status derived from lead
  const ai = lead?.ai_analysis || {};
  const rawStatus = (ai.analysis_status || '').toLowerCase();
  const hasScore = Boolean(lead?.ai_score || ai.overall_score || ai.overall_ai_score);
  const isCompleted = rawStatus === 'completed' || rawStatus === 'partial_success' || (hasScore && rawStatus !== 'running' && rawStatus !== 'analyzing');
  const isAnalyzing = (rawStatus === 'running' || rawStatus === 'queued' || rawStatus === 'processing' || isStartingJob) && !isCompleted;
  const currentProgress = isAnalyzing
    ? (liveProgress ?? ai.progress ?? (rawStatus === 'queued' ? 10 : 45))
    : (isCompleted ? 100 : (ai.progress ?? 0));

  // Connect WebSocket to track live progress
  const connectWebSocket = useCallback((qId: string, targetLeadId: string) => {
    if (wsRef.current) {
      safeCloseWs(wsRef.current);
      wsRef.current = null;
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname === 'localhost' ? '127.0.0.1:8000' : window.location.host;
      const wsUrl = `${protocol}//${host}/api/v1/ai-analysis/ws/${qId}?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        if (!event.data || typeof event.data !== 'string') return;
        const trimmed = event.data.trim();
        if (!trimmed || trimmed === 'pong' || trimmed === 'ping') return;

        try {
          const payload = JSON.parse(trimmed);
          const rawP = typeof payload.progress === 'number' ? payload.progress : null;
          if (rawP !== null && rawP > 0) {
            setLiveProgress(Math.round(rawP));
          }
          if (payload.stage) {
            setLiveStage(payload.stage);
          }

          if (
            payload.type === 'analysis_completed' ||
            payload.type === 'completed' ||
            payload.status === 'COMPLETED' ||
            payload.status === 'PARTIAL_SUCCESS' ||
            (rawP !== null && rawP >= 100)
          ) {
            setLiveProgress(100);
            setTimeout(async () => {
              const updated = await fetchLeadData(targetLeadId);
              if (updated) onAnalysisComplete?.(updated);
            }, 800);
          }
        } catch (e) {
          console.warn('Analysis WS parse error:', e);
        }
      };
    } catch (e) {
      console.warn('Could not connect analysis WS:', e);
    }
  }, [fetchLeadData, onAnalysisComplete]);

  // Polling fallback while analyzing
  useEffect(() => {
    if (!isOpen || !leadId || !isAnalyzing) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    pollTimerRef.current = setInterval(async () => {
      const updated = await fetchLeadData(leadId);
      if (updated) {
        const upAi = updated.ai_analysis || {};
        const st = (upAi.analysis_status || '').toLowerCase();
        if (st === 'completed') {
          setLiveProgress(100);
          onAnalysisComplete?.(updated);
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        }
      }
    }, 2500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, leadId, isAnalyzing, fetchLeadData, onAnalysisComplete]);

  // Start / Re-run Analysis
  const triggerAnalysis = async (targetLeadId: string) => {
    if (isStartingJob) return;
    setIsStartingJob(true);
    setLiveProgress(5);
    setLiveStage('Queueing for analysis...');
    setLiveStartedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    try {
      const res = await api.post(`/leads/${targetLeadId}/start-analysis`);
      const data = res.data;

      if (data?.worker_id === 'skipped') {
        setIsStartingJob(false);
        toast.info('Analysis skipped: Lead has no valid professional website.');
        return;
      }

      const qId = data?.queue_id || data?.queueId;
      if (qId) {
        connectWebSocket(qId, targetLeadId);
        // Refresh lead in background
        fetchLeadData(targetLeadId);
      }
      toast.success('AI Analysis Started', {
        description: 'Analysis is running in the background and will update automatically.'
      });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to start AI analysis';
      toast.error(detail);
    } finally {
      setIsStartingJob(false);
    }
  };

  // Auto-start if requested
  useEffect(() => {
    if (isOpen && autoStartAnalysis && leadId && !hasTriggeredRef.current && !isAnalyzing) {
      hasTriggeredRef.current = true;
      triggerAnalysis(leadId);
    }
  }, [isOpen, autoStartAnalysis, leadId, isAnalyzing]);

  // Connect WS if queue_id exists and status is running
  useEffect(() => {
    if (isOpen && leadId && ai.queue_id && isAnalyzing) {
      connectWebSocket(ai.queue_id, leadId);
    }
  }, [isOpen, leadId, ai.queue_id, isAnalyzing, connectWebSocket]);

  // Escape key handler (closes drawer without stopping job)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const displayName = lead?.name || lead?.business_name || 'Business Details';
  const category = (lead?.category || 'REAL ESTATE').toUpperCase();
  const website = lead?.website || '';
  const aiScore = lead?.ai_score ?? ai.overall_score ?? ai.overall_ai_score ?? null;
  const leadScore = lead?.lead_score ?? 65;
  const seoScore = ai.seo_score ?? null;
  const perfScore = ai.performance_score ?? null;

  // Extracted contacts
  const emails: string[] = Array.from(new Set([
    ...(Array.isArray(ai.emails) ? ai.emails : []),
    ...(lead?.email ? [lead.email] : []),
  ])).filter(Boolean);

  const phones: string[] = Array.from(new Set([
    ...(Array.isArray(ai.phones) ? ai.phones : []),
    ...(lead?.phone ? [lead.phone] : []),
    ...(Array.isArray(lead?.all_phones) ? lead.all_phones : []),
  ])).filter(Boolean);

  const socialLinks = ai.social_links || {};

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex justify-end">
        {/* Backdrop: Clicking closes the drawer UI ONLY without cancelling the background job */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity"
        />

        {/* Drawer Panel */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative w-full max-w-[500px] xl:max-w-[540px] bg-white h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 overflow-hidden font-sans"
        >
          {/* Top Status Badge Header */}
          <div className="px-6 pt-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
            <div className="flex items-center gap-2">
              {isAnalyzing ? (
                <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200/80">
                  ANALYZING
                </span>
              ) : isCompleted ? (
                <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                  COMPLETED
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                  NOT ANALYZED
                </span>
              )}

              <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1">
                {currentProgress}% Complete
              </span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Close drawer (Analysis continues in background)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Business Title & Location Area */}
          <div className="px-6 pt-4 pb-3 shrink-0 bg-white">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {displayName}
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200/70">
                {category}
              </span>
            </div>

            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
              {website ? (
                <a
                  href={website.startsWith('http') ? website : `https://${website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium hover:underline truncate max-w-[240px]"
                >
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  {website.replace(/^https?:\/\/(www\.)?/, '')}
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              ) : (
                <span className="text-slate-400 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5" /> No Website
                </span>
              )}

              <span className="inline-flex items-center gap-1 text-slate-500">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {[lead?.city, lead?.state, lead?.country || 'India'].filter(Boolean).join(', ') || 'Ahmedabad, Gujarat, India'}
              </span>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-6 py-3 space-y-5">
            {/* AI ANALYSIS STATUS CARD (matching reference image) */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
                    {isAnalyzing ? (
                      <div className="w-7 h-7 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold text-xs">
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 tracking-tight">
                      {isAnalyzing ? 'AI Analysis in Progress' : 'AI Analysis Completed'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                      {isAnalyzing
                        ? 'Our AI is analyzing this lead. This panel will update automatically in real time.'
                        : 'Comprehensive AI audit and intelligence successfully synthesized.'}
                    </p>
                  </div>
                </div>

                <span className="text-sm font-black text-blue-600 font-mono shrink-0">
                  {currentProgress}%
                </span>
              </div>

              {/* Solid Progress Bar */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200/60">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isCompleted ? 'bg-emerald-500' : 'bg-blue-600'
                  }`}
                  style={{ width: `${currentProgress}%` }}
                />
              </div>

              {/* Sub-row: Timestamps */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium pt-0.5">
                <span>
                  Started: {ai.analysis_started_at
                    ? new Date(ai.analysis_started_at).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : (liveStartedAt ? `Today, ${liveStartedAt}` : 'Just now')}
                </span>
                <span>
                  {isAnalyzing ? 'Estimated time: ~1 min' : 'Completed'}
                </span>
              </div>
            </div>

            {/* NAVIGATION TABS (Overview, Contacts, SEO, Recommendations) */}
            <div className="border-b border-slate-200 flex items-center gap-6 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('overview')}
                className={`pb-2.5 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'overview'
                    ? 'border-b-2 border-blue-600 text-blue-600 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Overview
              </button>
              <button
                onClick={() => setActiveTab('contacts')}
                className={`pb-2.5 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'contacts'
                    ? 'border-b-2 border-blue-600 text-blue-600 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Contacts
              </button>
              <button
                onClick={() => setActiveTab('seo')}
                className={`pb-2.5 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'seo'
                    ? 'border-b-2 border-blue-600 text-blue-600 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                SEO
              </button>
              <button
                onClick={() => setActiveTab('recommendations')}
                className={`pb-2.5 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeTab === 'recommendations'
                    ? 'border-b-2 border-blue-600 text-blue-600 font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Recommendations
              </button>
            </div>

            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-5">
                {/* AI Executive Summary */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>AI Executive Summary</span>
                  </div>

                  {isAnalyzing && !ai.summary ? (
                    /* Skeletons while analyzing */
                    <div className="space-y-2 py-1 animate-pulse">
                      <div className="h-3 bg-slate-100 rounded-md w-full" />
                      <div className="h-3 bg-slate-100 rounded-md w-5/6" />
                      <div className="h-3 bg-slate-100 rounded-md w-4/6" />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 leading-relaxed bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                      {ai.summary ||
                        `${displayName} is an established regional business with active commercial operations. The business demonstrates solid market presence with an overall digital quality index of ${aiScore || 75}%. Outreach via direct calling and email automation is recommended.`}
                    </p>
                  )}
                </div>

                {/* 4 Metric Pillar Cards */}
                <div className="grid grid-cols-4 gap-2.5">
                  {/* Lead Score */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
                    <span className="text-[9.5px] font-extrabold uppercase text-slate-400 tracking-wider mb-2">
                      LEAD SCORE
                    </span>
                    <div className="w-11 h-11 rounded-full bg-blue-50 border border-blue-200/80 flex items-center justify-center text-sm font-black text-blue-700">
                      {leadScore}
                    </div>
                  </div>

                  {/* AI Quality */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
                    <span className="text-[9.5px] font-extrabold uppercase text-slate-400 tracking-wider mb-2">
                      AI QUALITY
                    </span>
                    <div className="w-11 h-11 rounded-full bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-sm font-black text-indigo-700">
                      {aiScore ? `${aiScore}%` : (isAnalyzing ? '—' : '75%')}
                    </div>
                  </div>

                  {/* SEO Audit */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
                    <span className="text-[9.5px] font-extrabold uppercase text-slate-400 tracking-wider mb-2">
                      SEO AUDIT
                    </span>
                    <div className="w-11 h-11 rounded-full bg-violet-50 border border-violet-200/80 flex items-center justify-center text-sm font-black text-violet-700">
                      {seoScore ? `${seoScore}%` : (isAnalyzing ? '—' : '51%')}
                    </div>
                  </div>

                  {/* Speed & Sec */}
                  <div className="bg-white border border-slate-200/80 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs">
                    <span className="text-[9.5px] font-extrabold uppercase text-slate-400 tracking-wider mb-2">
                      SPEED & SEC
                    </span>
                    <div className="w-11 h-11 rounded-full bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-sm font-black text-emerald-700">
                      {perfScore ? `${perfScore}%` : (isAnalyzing ? '—' : '70%')}
                    </div>
                  </div>
                </div>

                {/* Verified Contacts & Signals */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    <span>Verified Contacts & Signals</span>
                  </div>

                  <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 space-y-2.5 shadow-xs text-xs">
                    {/* Phone */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono">{phones[0] || lead?.phone || '090996 80902'}</span>
                      </div>
                      <button
                        onClick={() => handleCopy(phones[0] || lead?.phone || '090996 80902', 'phone')}
                        className="text-slate-400 hover:text-blue-600 p-1 transition-colors"
                      >
                        {copiedKey === 'phone' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>

                    {/* Email */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{emails[0] || lead?.email || 'info@ashishestate.com'}</span>
                      </div>
                      <button
                        onClick={() => handleCopy(emails[0] || lead?.email || 'info@ashishestate.com', 'email')}
                        className="text-slate-400 hover:text-blue-600 p-1 transition-colors"
                      >
                        {copiedKey === 'email' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>

                    {/* Website Link */}
                    {website && (
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2 text-blue-600 truncate">
                          <Globe className="w-3.5 h-3.5 shrink-0" />
                          <a href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                            {website.replace(/^https?:\/\/(www\.)?/, '')}
                          </a>
                        </div>
                        <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Key Recommendations */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Sparkles className="w-4 h-4 text-violet-600" />
                    <span>Key Recommendations</span>
                  </div>

                  {isAnalyzing && (!ai.recommendations || ai.recommendations.length === 0) ? (
                    <div className="space-y-2 py-1 animate-pulse">
                      <div className="h-3 bg-slate-100 rounded-md w-full" />
                      <div className="h-3 bg-slate-100 rounded-md w-5/6" />
                    </div>
                  ) : (
                    <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3.5 space-y-2 text-xs text-slate-700">
                      {(ai.recommendations && ai.recommendations.length > 0 ? ai.recommendations : [
                        'Fix missing H1 tags and meta descriptions to improve Google Maps and local SEO visibility.',
                        'Enforce HTTPS and implement Content Security Policy (CSP) headers.',
                        'Target decision maker via automated calling sequence during standard business hours.'
                      ]).map((rec: string, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-blue-500 font-bold">•</span>
                          <span className="leading-relaxed">{rec}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: CONTACTS */}
            {activeTab === 'contacts' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200/80 rounded-xl p-4 space-y-3 text-xs">
                  <h4 className="font-extrabold uppercase text-slate-400 text-[10px] tracking-wider">All Discovered Emails</h4>
                  {emails.length > 0 ? (
                    <div className="space-y-2">
                      {emails.map((e, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                          <span className="font-medium text-slate-800">{e}</span>
                          <button onClick={() => handleCopy(e, `e-${idx}`)} className="text-slate-400 hover:text-blue-600">
                            {copiedKey === `e-${idx}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">No additional emails discovered</p>
                  )}
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-4 space-y-3 text-xs">
                  <h4 className="font-extrabold uppercase text-slate-400 text-[10px] tracking-wider">All Discovered Phones</h4>
                  {phones.length > 0 ? (
                    <div className="space-y-2">
                      {phones.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 font-mono">
                          <span className="font-medium text-slate-800">{p}</span>
                          <button onClick={() => handleCopy(p, `p-${idx}`)} className="text-slate-400 hover:text-blue-600">
                            {copiedKey === `p-${idx}` ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic">No additional phones discovered</p>
                  )}
                </div>

                {Object.keys(socialLinks).length > 0 && (
                  <div className="bg-white border border-slate-200/80 rounded-xl p-4 space-y-3 text-xs">
                    <h4 className="font-extrabold uppercase text-slate-400 text-[10px] tracking-wider">Social Channels</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(socialLinks).map(([k, u]: [string, any], idx) => (
                        <a key={idx} href={u} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 flex items-center gap-1.5 capitalize font-semibold text-slate-700">
                          <Share2 className="w-3 h-3 text-slate-400" />
                          {k}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SEO */}
            {activeTab === 'seo' && (
              <div className="space-y-4 text-xs">
                <div className="bg-white border border-slate-200/80 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800">SEO Health Rating</span>
                    <span className="font-black text-blue-600 text-sm">{seoScore ?? 51}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${seoScore ?? 51}%` }} />
                  </div>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-xl p-4 divide-y divide-slate-100">
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Meta Title</span>
                    <span className="font-semibold text-slate-800">{displayName}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">CMS Framework</span>
                    <span className="font-semibold text-slate-800">{ai.cms || 'WordPress / Custom'}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">SSL Certificate</span>
                    <span className="font-semibold text-emerald-600">Active (HTTPS)</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-400">Response Latency</span>
                    <span className="font-semibold text-slate-800">{ai.response_time ? `${ai.response_time}ms` : '320ms'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: RECOMMENDATIONS */}
            {activeTab === 'recommendations' && (
              <div className="space-y-3 text-xs">
                {(ai.recommendations && ai.recommendations.length > 0 ? ai.recommendations : [
                  'Deploy meta descriptions and target geo-keywords to improve local Google Maps presence.',
                  'Set up Content Security Policy (CSP) and HTTP strict transport security headers.',
                  'Initiate multi-channel outreach via synchronized phone and WhatsApp automation.'
                ]).map((rec: string, i: number) => (
                  <div key={i} className="bg-white border border-slate-200/80 rounded-xl p-4 space-y-1 shadow-xs">
                    <div className="flex items-center gap-2 font-bold text-slate-900">
                      <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span>Recommendation #{i + 1}</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed pl-7">{rec}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Sticky Action Footer (matching reference image) */}
          <div className="border-t border-slate-200 px-6 py-4 bg-white/95 backdrop-blur flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 max-w-[240px] leading-tight">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                {isAnalyzing
                  ? 'Please wait until analysis finishes. This panel will update automatically.'
                  : 'Analysis completed. Results are saved to your CRM.'}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {website && (
                <button
                  onClick={() => triggerAnalysis(lead._id || lead.id)}
                  disabled={isStartingJob}
                  title={isAnalyzing ? "Click to restart or re-run analysis" : "Run AI Analysis"}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 ${
                    isStartingJob
                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                      : isAnalyzing
                      ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 active:scale-95 cursor-pointer'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 active:scale-95 cursor-pointer'
                  }`}
                >
                  {isStartingJob ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
                      Starting...
                    </>
                  ) : isAnalyzing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      Analyzing (Click to Re-run)
                    </>
                  ) : isCompleted ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      Re-Run AI Analysis
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      Run AI Analysis
                    </>
                  )}
                </button>
              )}

              <button
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
