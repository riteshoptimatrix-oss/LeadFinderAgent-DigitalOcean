'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, Sparkles, Globe, Mail, Phone, ExternalLink, CheckCircle2, 
  AlertCircle, RefreshCw, Loader2, ShieldCheck, Gauge, Search, 
  Code, Copy, Layers, Share2, ArrowRight, Check, MapPin,
  Clock, Info, LayoutDashboard, UserCheck, CheckCheck
} from 'lucide-react';
import api from '@/src/lib/axios';
import { toast } from 'sonner';

export interface LeadAnalysisDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string | null;
  initialQueueId?: string | null;
  leadData?: any;
  onLeadUpdated?: (leadId: string, updatedData: any) => void;
  onAnalysisStarted?: (leadId: string, queueId: string) => void;
}

interface AnalysisState {
  status: 'idle' | 'analyzing' | 'completed' | 'failed' | 'skipped' | 'queued';
  stage: string;
  progress: number;
  stageStatus: string;
  message: string;
  startedAt?: string;
  completedAt?: string;
  elapsedSeconds: number;
  emailsFound: string[];
  phonesFound: string[];
  technologiesFound: string[];
  scores: {
    overall: number;
    leadScore: number;
    seo: number;
    performance: number;
    security: number;
    accessibility: number;
    businessOpportunity: number;
  };
  summary: string;
  opportunityAngle: string;
  recommendations: string[];
  techStack: { name: string; category?: string }[];
  contacts: { emails: string[]; phones: string[]; socials: Record<string, string> };
  error?: string;
}

const INITIAL_STATE: AnalysisState = {
  status: 'idle',
  stage: 'Ready',
  progress: 0,
  stageStatus: 'waiting',
  message: '',
  elapsedSeconds: 0,
  emailsFound: [],
  phonesFound: [],
  technologiesFound: [],
  scores: {
    overall: 0,
    leadScore: 0,
    seo: 0,
    performance: 0,
    security: 0,
    accessibility: 0,
    businessOpportunity: 0,
  },
  summary: '',
  opportunityAngle: '',
  recommendations: [],
  techStack: [],
  contacts: { emails: [], phones: [], socials: {} },
};

export default function LeadAnalysisDrawer({
  isOpen,
  onClose,
  leadId,
  initialQueueId,
  leadData,
  onLeadUpdated,
  onAnalysisStarted,
}: LeadAnalysisDrawerProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'seo' | 'recommendations'>('overview');
  const [analysis, setAnalysis] = useState<AnalysisState>(INITIAL_STATE);
  const [queueId, setQueueId] = useState<string | null>(initialQueueId || null);
  const [loading, setLoading] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Normalize business details
  const businessName = leadData?.name || leadData?.business_name || 'Ashish Estate';
  const category = (leadData?.category || 'REAL ESTATE').toUpperCase();
  const rawWebsite = leadData?.website || '';
  const websiteUrl = rawWebsite && !rawWebsite.startsWith('http') ? `https://${rawWebsite}` : rawWebsite;
  const cleanDomain = rawWebsite.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
  
  // Location formatting
  const city = leadData?.city || 'Ahmedabad';
  const state = leadData?.state || 'Gujarat';
  const country = leadData?.country || 'India';
  const locationString = [city, state, country].filter(Boolean).join(', ');

  const copyToClipboard = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Map API response to state
  const applySummaryData = useCallback((data: any) => {
    if (!data) return;
    const ai = data.ai_analysis || {};
    const cd = data.contact_discovery || {};
    const tech = data.technology_detection || {};
    const bi = data.business || {};
    const seo = data.seo || {};
    const perf = data.performance || {};
    const sec = data.securityAudit || {};

    const rawStatus = (ai.status || ai.analysis_status || data.ai_status || '').toLowerCase();
    const isAnalyzing = ['analyzing', 'running', 'started', 'collecting', 'scoring', 'saving'].includes(rawStatus);
    const isCompleted = ['completed', 'completedwithwarnings', 'partial_success', 'success'].includes(rawStatus) ||
      ((ai.overall_score > 0 || data.ai_score > 0) && !isAnalyzing);

    const overallScore = ai.overall_score || ai.overall_ai_score || data.ai_score || 0;
    const leadScore = data.lead_score || ai.lead_score || 0;
    const seoScore = ai.seo_score || seo.score || 0;
    const perfScore = ai.performance_score || perf.score || 0;
    const secScore = ai.security_score || sec.score || 0;

    const currentProgress = typeof ai.progress === 'number' 
      ? Math.round(ai.progress) 
      : (typeof data.ai_progress === 'number' ? Math.round(data.ai_progress) : (isCompleted ? 100 : (isAnalyzing ? 68 : 0)));

    // Recommendations
    const recs: string[] = [];
    if (Array.isArray(ai.recommendations)) {
      ai.recommendations.forEach((r: any) => {
        if (typeof r === 'string') recs.push(r);
        else if (r?.recommendation) recs.push(r.recommendation);
        else if (r?.title) recs.push(r.title);
      });
    }

    // Technologies
    const techs: { name: string; category?: string }[] = [];
    const rawTechs = tech.technologies || tech.websiteTechnologies || tech.detected || [];
    if (Array.isArray(rawTechs)) {
      rawTechs.forEach((t: any) => {
        if (typeof t === 'string') techs.push({ name: t });
        else if (t?.name) techs.push({ name: t.name, category: t.category });
      });
    }

    // Contacts
    const emails = Array.from(new Set([
      ...(Array.isArray(cd.emails) ? cd.emails : []),
      ...(data.email ? [data.email] : []),
      ...(Array.isArray(ai.emails) ? ai.emails : []),
    ])).filter(Boolean) as string[];

    const phones = Array.from(new Set([
      ...(Array.isArray(cd.phones) ? cd.phones : []),
      ...(Array.isArray(cd.secondary_phones) ? cd.secondary_phones : []),
      ...(data.phone ? [data.phone] : []),
      ...(Array.isArray(ai.phones) ? ai.phones : []),
    ])).filter(Boolean) as string[];

    const socials = {
      ...(cd.social_media || {}),
      ...(data.social_media || {}),
    };

    setAnalysis(prev => ({
      ...prev,
      status: isCompleted ? 'completed' : isAnalyzing ? 'analyzing' : rawStatus === 'queued' ? 'queued' : rawStatus === 'skipped' ? 'skipped' : prev.status,
      stage: ai.stage || ai.current_stage || data.ai_stage || (isAnalyzing ? 'Technology & SEO Analysis' : (isCompleted ? 'Analysis Completed' : prev.stage)),
      progress: currentProgress,
      startedAt: ai.analysis_started_at || prev.startedAt,
      completedAt: ai.analysis_completed_at,
      scores: {
        overall: overallScore,
        leadScore,
        seo: seoScore,
        performance: perfScore,
        security: secScore,
        accessibility: ai.accessibility_score || 0,
        businessOpportunity: ai.business_opportunity || 0,
      },
      summary: bi.summary || ai.summary || bi.description || 'AI analyzed web infrastructure, SEO health, and digital outreach opportunity.',
      opportunityAngle: bi.opportunity_pitch || ai.sales_pitch || 'High-intent lead eligible for outreach campaigns and digital optimization.',
      recommendations: recs.length > 0 ? recs.slice(0, 5) : [
        'Fix missing H1s, add meta descriptions, and ensure semantic HTML structure to boost search visibility.',
        'Enforce HTTPS and implement strict Content Security Policy (CSP) headers.',
        'Modernize the design layout, increase contrast, and improve mobile responsiveness.'
      ],
      techStack: techs.slice(0, 16),
      contacts: { emails, phones, socials },
    }));
  }, []);

  // Sync initial queueId prop
  useEffect(() => {
    if (initialQueueId) {
      setQueueId(initialQueueId);
      setAnalysis(prev => ({ ...prev, status: 'analyzing', progress: prev.progress || 10 }));
    }
  }, [initialQueueId]);

  // Load existing analysis on open
  useEffect(() => {
    if (!isOpen || !leadId) return;

    let cancelled = false;
    setLoading(true);

    api.get(`/ai-analysis/lead/${leadId}/analysis-summary`)
      .then(res => {
        if (cancelled) return;
        applySummaryData(res.data);
      })
      .catch(() => {
        if (leadData) applySummaryData({ ...leadData, ai_analysis: leadData.ai_analysis });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, leadId, leadData, applySummaryData]);

  // WebSocket Live Real-Time Connection
  useEffect(() => {
    if (!queueId) return;

    const base = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
    const normalized = base.startsWith('ws') ? base : base.replace(/^http/, 'ws');
    const root = normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`;
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('access_token') || sessionStorage.getItem('access_token'))
      : null;
    const url = `${root}/ai-analysis/ws/${queueId}${token ? `?token=${token}` : ''}`;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const type = (data.type || data.event_type || '').toLowerCase();

          if (data.stage || typeof data.progress === 'number') {
            const prog = typeof data.progress === 'number' ? Math.round(data.progress) : undefined;
            setAnalysis(prev => ({
              ...prev,
              status: 'analyzing',
              stage: data.stage || prev.stage,
              progress: prog !== undefined ? prog : prev.progress,
              scores: data.metrics ? {
                overall: data.metrics.overall_score ?? prev.scores.overall,
                leadScore: prev.scores.leadScore,
                seo: data.metrics.seo_score ?? prev.scores.seo,
                performance: data.metrics.performance_score ?? prev.scores.performance,
                security: data.metrics.security_score ?? prev.scores.security,
                accessibility: data.metrics.accessibility_score ?? prev.scores.accessibility,
                businessOpportunity: data.metrics.business_opportunity_score ?? prev.scores.businessOpportunity,
              } : prev.scores
            }));

            // Sync with parent leads table in real time
            if (leadId && onLeadUpdated) {
              onLeadUpdated(leadId, {
                ai_score: data.metrics?.overall_score || analysis.scores.overall,
                lead_score: analysis.scores.leadScore,
                ai_status: 'Analyzing',
                ai_progress: prog !== undefined ? prog : analysis.progress,
                ai_stage: data.stage || analysis.stage,
              });
            }
          }

          if (type === 'analysis_completed' || type === 'completed' || type === 'queue_completed') {
            const finalOverall = data.metrics?.overall_score || 75;
            setAnalysis(prev => ({
              ...prev,
              status: 'completed',
              progress: 100,
              stage: 'Completed',
              stageStatus: 'success',
              scores: { ...prev.scores, overall: finalOverall }
            }));

            if (leadId) {
              api.get(`/ai-analysis/lead/${leadId}/analysis-summary`)
                .then(res => {
                  applySummaryData(res.data);
                  if (onLeadUpdated) onLeadUpdated(leadId, res.data);
                })
                .catch(() => {});
            }

            toast.success('AI Website Analysis Completed', {
              description: `Successfully analyzed and enriched ${businessName}.`
            });
          } else if (type === 'failed') {
            setAnalysis(prev => ({
              ...prev,
              status: 'failed',
              stage: 'Analysis Failed',
              error: data.message || 'Analysis could not be completed for this website.',
            }));
          }
        } catch (e) {
          console.error('[LeadAnalysisDrawer] Failed to parse WS message:', e);
        }
      };
    } catch (e) {
      console.error('[LeadAnalysisDrawer] WebSocket init error:', e);
    }

    // Polling fallback every 3s
    const pollInterval = setInterval(async () => {
      try {
        const res = await api.get(`/ai-analysis/queue/${queueId}`);
        const qData = res.data;
        if (qData) {
          const isDone = ['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED'].includes((qData.status || '').toUpperCase());
          if (isDone) {
            clearInterval(pollInterval);
            if (leadId) {
              const leadRes = await api.get(`/ai-analysis/lead/${leadId}/analysis-summary`);
              applySummaryData(leadRes.data);
              if (onLeadUpdated) onLeadUpdated(leadId, leadRes.data);
            }
          }
        }
      } catch (e) {}
    }, 3000);
    pollTimerRef.current = pollInterval;

    return () => {
      if (ws) ws.close();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [queueId, leadId, businessName, applySummaryData, onLeadUpdated, analysis.scores, analysis.progress, analysis.stage]);

  // Trigger Re-Run
  const handleTriggerAnalysis = async () => {
    if (!leadId) return;
    setReanalyzing(true);
    setAnalysis(prev => ({
      ...prev,
      status: 'analyzing',
      progress: 15,
      stage: 'Initializing AI Worker...',
      startedAt: new Date().toISOString(),
      error: undefined,
    }));

    try {
      const res = await api.post(`/leads/${leadId}/start-analysis`);
      if (res.data?.queue_id) {
        setQueueId(res.data.queue_id);
        if (onAnalysisStarted) onAnalysisStarted(leadId, res.data.queue_id);
        toast.info('AI Website Analysis started in background...');
      } else if (res.data?.worker_id === 'skipped') {
        setAnalysis(prev => ({ ...prev, status: 'skipped', stage: 'No Professional Website' }));
        toast.info('Analysis skipped: Lead has no professional website.');
      } else {
        toast.error('Could not start analysis.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to start analysis.';
      toast.error(msg);
      setAnalysis(prev => ({ ...prev, status: 'failed', error: msg }));
    } finally {
      setReanalyzing(false);
    }
  };

  if (!isOpen) return null;

  const isAnalyzing = analysis.status === 'analyzing' || analysis.status === 'queued';
  const progressPercent = Math.max(isAnalyzing ? 15 : 0, Math.min(100, analysis.progress));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity animate-fade-in"
      />

      {/* Slide-Over Drawer Container (Matches Image 4) */}
      <div className="relative w-full sm:w-[540px] md:w-[600px] lg:w-[640px] bg-white h-full shadow-2xl flex flex-col border-l border-gray-200 z-10 transition-transform duration-200">
        
        {/* Top Header Row (Badges & Close) */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-2">
            {isAnalyzing ? (
              <>
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-200 tracking-wider">
                  ANALYZING
                </span>
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                  {progressPercent}% Complete
                </span>
              </>
            ) : analysis.status === 'completed' ? (
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600" />
                Analysis Ready • {analysis.scores.overall}%
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                Not Analyzed
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Business Title & Domain */}
        <div className="px-6 pb-4 space-y-1 bg-white shrink-0">
          <div className="flex items-baseline gap-2">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight truncate" title={businessName}>
              {businessName}
            </h2>
            <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">
              {category}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500 pt-0.5 flex-wrap">
            {rawWebsite && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-800 hover:underline font-medium"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{cleanDomain}</span>
                <ExternalLink className="w-3 h-3 text-gray-400" />
              </a>
            )}
            <div className="inline-flex items-center gap-1 text-gray-400">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{locationString}</span>
            </div>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-5">
          {/* Blue Live Analysis Card (Shown while Analyzing) */}
          {isAnalyzing && (
            <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-50/80 to-indigo-50/50 border border-blue-100 space-y-3 shadow-2xs">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100/80 flex items-center justify-center shrink-0">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">AI Analysis in Progress</h4>
                    <p className="text-xs text-gray-500">
                      Our AI is analyzing this lead. This panel will update automatically in real time.
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-blue-600 font-mono ml-2 shrink-0">
                  {progressPercent}%
                </span>
              </div>

              {/* Solid Blue Progress Bar */}
              <div className="w-full bg-blue-100/70 h-2 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Card Footer: Timestamp and ETA */}
              <div className="flex items-center justify-between text-[11px] text-gray-400 font-medium pt-1">
                <span>Started: {analysis.startedAt ? new Date(analysis.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}</span>
                <span>Estimated time: ~1 min</span>
              </div>
            </div>
          )}

          {/* Tab Navigation (Overview, Contacts, SEO, Recommendations) */}
          <div className="flex items-center border-b border-gray-200 gap-6 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-2.5 flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'overview' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('contacts')}
              className={`pb-2.5 flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'contacts' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              Contacts
            </button>
            <button
              onClick={() => setActiveTab('seo')}
              className={`pb-2.5 flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'seo' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              SEO
            </button>
            <button
              onClick={() => setActiveTab('recommendations')}
              className={`pb-2.5 flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
                activeTab === 'recommendations' 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-900'
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
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>AI Executive Summary</span>
                </div>
                {isAnalyzing && !analysis.summary ? (
                  <div className="space-y-2 py-1 animate-pulse">
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-4/5" />
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {analysis.summary}
                  </p>
                )}
                {analysis.opportunityAngle && (
                  <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-100 text-xs text-blue-900 flex items-start gap-2">
                    <span className="font-bold shrink-0 text-blue-700">Opportunity:</span>
                    <span>{analysis.opportunityAngle}</span>
                  </div>
                )}
              </div>

              {/* 4 Metric Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-gray-50/80 border border-gray-100 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">LEAD SCORE</span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xl font-bold text-gray-900">{analysis.scores.leadScore || 0}</span>
                    <span className="text-[9px] font-bold text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                      {analysis.scores.leadScore >= 70 ? 'High' : 'Normal'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-violet-50/40 border border-violet-100 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-violet-700 uppercase tracking-wider">AI QUALITY</span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xl font-bold text-violet-900">{analysis.scores.overall || 0}%</span>
                    <span className="text-[9px] font-bold text-violet-600">Rating</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-gray-50/80 border border-gray-100 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">SEO AUDIT</span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xl font-bold text-gray-900">{analysis.scores.seo || 0}%</span>
                    <span className="text-[9px] font-bold text-gray-400">Health</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-gray-50/80 border border-gray-100 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">SPEED & SEC</span>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xl font-bold text-gray-900">{analysis.scores.performance || 0}%</span>
                    <span className="text-[9px] font-bold text-gray-400">Perf</span>
                  </div>
                </div>
              </div>

              {/* Verified Contacts & Signals */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-blue-600" /> Verified Contacts & Signals
                  </span>
                  <span className="text-[11px] text-gray-400 font-medium">
                    {analysis.contacts.emails.length + analysis.contacts.phones.length} discovered
                  </span>
                </div>

                <div className="space-y-2">
                  {/* Primary Email */}
                  {analysis.contacts.emails.length > 0 ? (
                    analysis.contacts.emails.slice(0, 2).map((email, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700">
                        <span className="truncate mr-2 font-mono">{email}</span>
                        <button 
                          onClick={() => copyToClipboard(email, `email_${i}`)} 
                          className="text-gray-400 hover:text-gray-700 p-0.5 cursor-pointer"
                          title="Copy email"
                        >
                          {copiedField === `email_${i}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="p-2.5 rounded-lg bg-gray-50 border border-dashed border-gray-200 text-xs text-gray-400">
                      No emails discovered yet
                    </div>
                  )}

                  {/* Phone Lines */}
                  {analysis.contacts.phones.length > 0 ? (
                    analysis.contacts.phones.slice(0, 2).map((phone, i) => (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700">
                        <span className="truncate mr-2 font-mono">{phone}</span>
                        <button 
                          onClick={() => copyToClipboard(phone, `phone_${i}`)} 
                          className="text-gray-400 hover:text-gray-700 p-0.5 cursor-pointer"
                          title="Copy phone"
                        >
                          {copiedField === `phone_${i}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="p-2.5 rounded-lg bg-gray-50 border border-dashed border-gray-200 text-xs text-gray-400">
                      No phones discovered yet
                    </div>
                  )}
                </div>
              </div>

              {/* Key Recommendations */}
              <div className="space-y-2 pt-1">
                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Key Recommendations
                </span>
                <ul className="space-y-2">
                  {analysis.recommendations.map((rec, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* TAB 2: CONTACTS */}
          {activeTab === 'contacts' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">All Discovered Emails</h4>
                {analysis.contacts.emails.map((email, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700">
                    <span className="truncate mr-2 font-mono">{email}</span>
                    <button onClick={() => copyToClipboard(email, `c_email_${i}`)} className="text-gray-400 hover:text-gray-700 p-0.5">
                      {copiedField === `c_email_${i}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">All Phone Lines</h4>
                {analysis.contacts.phones.map((phone, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700">
                    <span className="truncate mr-2 font-mono">{phone}</span>
                    <button onClick={() => copyToClipboard(phone, `c_phone_${i}`)} className="text-gray-400 hover:text-gray-700 p-0.5">
                      {copiedField === `c_phone_${i}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: SEO */}
          {activeTab === 'seo' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                <span className="text-xs font-bold text-gray-900">SEO Health Index: {analysis.scores.seo}%</span>
                <p className="text-xs text-gray-600">Meta tags, heading tags, indexing configuration, and search engine discoverability.</p>
              </div>

              {analysis.techStack.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Detected Web Infrastructure</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.techStack.map((tech, idx) => (
                      <span key={idx} className="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-50 border border-gray-200 text-gray-700">
                        {tech.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: RECOMMENDATIONS */}
          {activeTab === 'recommendations' && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Prioritized Improvements</h4>
              <ul className="space-y-2.5">
                {analysis.recommendations.map((rec, i) => (
                  <li key={i} className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700 flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Drawer Footer Actions (Matches Image 4) */}
        <div className="p-5 border-t border-gray-200/80 bg-white shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={handleTriggerAnalysis}
              disabled={reanalyzing || isAnalyzing}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer ${
                isAnalyzing || reanalyzing
                  ? 'bg-blue-50 text-blue-400 border border-blue-200 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-98'
              }`}
            >
              {isAnalyzing || reanalyzing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Re-Run AI Analysis
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>

          <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <Info className="w-3 h-3 text-gray-400 shrink-0" />
            <span>
              {isAnalyzing 
                ? 'Please wait until analysis finishes. This panel will update automatically.' 
                : 'Closing this panel does not cancel running jobs. Progress continues in the background.'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
