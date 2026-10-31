'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/src/components/common/PageHeader';
import { 
  Play, Pause, Square, RotateCcw, 
  CheckCircle2, AlertCircle, Clock, Smartphone, User, ArrowLeft, RefreshCw,
  Search, Download, CheckCheck, Eye, Terminal, ListFilter, AlertTriangle, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/src/lib/axios';
import { cn } from '@/src/lib/utils';
import { useQuery } from '@tanstack/react-query';

const STEPS = [
  { id: 1, label: 'Select Leads', status: 'completed' },
  { id: 2, label: 'AI Templates', status: 'completed' },
  { id: 3, label: 'Campaign Wizard', status: 'completed' },
  { id: 4, label: 'Live Campaign', status: 'active' },
];

export default function LiveCampaignDashboard() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  
  // Dashboard State
  const [status, setStatus] = useState<string>('CONNECTING');
  const [stats, setStats] = useState({
    total: 0, completed: 0, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0
  });
  const [currentLead, setCurrentLead] = useState<any>(null);
  const [currentMessage, setCurrentMessage] = useState<string>('');
  const [eta, setEta] = useState<string>('00:00');
  const [logs, setLogs] = useState<any[]>([]);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [activeView, setActiveView] = useState<'terminal' | 'recipients'>('terminal');
  const [recipientFilter, setRecipientFilter] = useState<string>('all');
  const [recipientSearch, setRecipientSearch] = useState<string>('');
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const activeCampaign = localStorage.getItem('wa_active_campaign');
    if (activeCampaign) {
      setCampaignId(activeCampaign);
      fetchInitialStatus(activeCampaign);
      connectWebSocket(activeCampaign);
    } else {
      router.push('/dashboard/whatsapp-ai');
    }

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  // Timer for Elapsed Time
  useEffect(() => {
    let timer: any;
    if (status.includes('RUNNING')) {
      timer = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status]);

  // Polling fallback every 4s if disconnected or to sync stats
  useEffect(() => {
    if (!campaignId) return;
    const interval = setInterval(() => {
      fetchInitialStatus(campaignId, false);
    }, 4000);
    return () => clearInterval(interval);
  }, [campaignId]);

  // Query recipients table
  const { data: recipientData, refetch: refetchRecipients, isLoading: isLoadingRecipients } = useQuery({
    queryKey: ['wa-ai-recipients', campaignId, recipientFilter, recipientSearch],
    queryFn: async () => {
      if (!campaignId) return { recipients: [], total: 0 };
      const res = await api.get(`/whatsapp-ai/campaigns/${campaignId}/recipients`, {
        params: {
          status: recipientFilter === 'all' ? undefined : recipientFilter,
          search: recipientSearch || undefined,
          limit: 100
        }
      });
      return res.data;
    },
    enabled: Boolean(campaignId) && activeView === 'recipients',
    refetchInterval: 5000
  });

  const fetchInitialStatus = async (id: string, showToast = true) => {
    try {
      const res = await api.get(`/whatsapp-ai/campaigns/${id}/live-status`);
      const data = res.data;
      setStatus(data.status);
      setStats({
        total: data.total || 0,
        completed: data.completed || 0,
        sent: data.sent || 0,
        delivered: data.delivered || 0,
        read: data.read || 0,
        failed: data.failed || 0,
        skipped: data.skipped || 0
      });
      if (data.current_lead) setCurrentLead(data.current_lead);
      if (data.current_message) setCurrentMessage(data.current_message);
      if (data.eta) setEta(data.eta);
      if (Array.isArray(data.logs)) {
        setLogs(data.logs);
      }
    } catch (e) {
      if (showToast) toast.error("Could not fetch campaign status");
    }
  };

  const connectWebSocket = (id: string) => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://127.0.0.1:8000';
    const socket = new WebSocket(`${wsUrl}/api/v1/whatsapp-ai/ws/${id}`);

    socket.onopen = () => {
      console.log('WhatsApp WebSocket Connected');
    };

    socket.onmessage = (event) => {
      if (!event.data || typeof event.data !== 'string') return;
      const trimmed = event.data.trim();
      if (!trimmed || trimmed === 'ping' || trimmed === 'pong') {
        if (trimmed === 'ping') {
          try { socket.send('pong'); } catch {}
        }
        return;
      }

      try {
        const data = JSON.parse(trimmed);
        if (!data || data.type === 'HEARTBEAT') return;

        // Real-time Event Handling from Meta Cloud Queue Worker
        if (data.type === 'WA_LEAD_SENDING' || data.type === 'wa_lead_opening' || data.type === 'wa_lead_typing') {
          setCurrentLead({ business_name: data.business_name, phone: data.phone });
          if (data.message) setCurrentMessage(data.message);
          setStatus('RUNNING (Dispatching via Meta Cloud API)');
          addLog(data.lead_id, 'sending', `Dispatching to ${data.business_name || data.phone}...`);
        } 
        else if (data.type === 'WA_LEAD_SENT' || data.type === 'wa_lead_sent') {
          setStats(prev => ({ ...prev, completed: prev.completed + 1, sent: prev.sent + 1 }));
          addLog(data.lead_id, 'sent', `Message Sent via Meta Cloud API${data.meta_message_id ? ` [${data.meta_message_id.slice(-8)}]` : ''}`, data.duration);
          checkCompletion();
        }
        else if (data.type === 'WA_LEAD_DELIVERED' || data.type === 'wa_lead_delivered') {
          setStats(prev => ({ ...prev, delivered: prev.delivered + 1 }));
          addLog(data.lead_id, 'delivered', `Delivered to recipient device`);
        }
        else if (data.type === 'WA_LEAD_READ' || data.type === 'wa_lead_read') {
          setStats(prev => ({ ...prev, read: prev.read + 1 }));
          addLog(data.lead_id, 'read', `Read receipt confirmed`);
        }
        else if (data.type === 'WA_LEAD_FAILED' || data.type === 'wa_lead_failed') {
          setStats(prev => ({ ...prev, completed: prev.completed + 1, failed: prev.failed + 1 }));
          addLog(data.lead_id, 'failed', `Failed: ${data.error || 'Meta API error'}`, data.duration);
          checkCompletion();
        }
        else if (data.type === 'WA_LEAD_SKIPPED' || data.type === 'wa_lead_skipped') {
          setStats(prev => ({ ...prev, completed: prev.completed + 1, skipped: prev.skipped + 1 }));
          addLog(data.lead_id, 'skipped', `Skipped: ${data.error || 'Invalid or opted out'}`);
          checkCompletion();
        }
        else if (data.type === 'WA_CAMPAIGN_COMPLETED') {
          setStatus('COMPLETED');
          toast.success("Campaign finished successfully!");
        }
        else if (data.type === 'WA_CAMPAIGN_FAILED') {
          setStatus('FAILED');
          toast.error(data.error || "Campaign failed");
        }
        else if (data.type === 'WA_CAMPAIGN_RESUMED') {
          setStatus('RUNNING');
          toast.info(data.message || "Campaign resumed");
        }
      } catch (err) {
        console.warn('Failed to parse WhatsApp WebSocket message:', err);
      }
    };

    socket.onclose = () => {
      setTimeout(() => {
        if (campaignId) connectWebSocket(campaignId);
      }, 5000);
    };

    ws.current = socket;
  };

  const addLog = (leadId: string, logStatus: string, message: string, duration: number = 0) => {
    setLogs(prev => [{
      lead_id: leadId,
      status: logStatus,
      message,
      duration,
      processed_at: new Date().toISOString()
    }, ...prev].slice(0, 100));
  };

  const checkCompletion = () => {
    setStats(prev => {
      if (prev.completed >= prev.total && prev.total > 0) {
        setStatus('COMPLETED');
        toast.success("Campaign completed!");
        return prev;
      }
      return prev;
    });
  };

  const handleControl = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!campaignId) return;
    try {
      await api.post(`/whatsapp-ai/campaigns/${campaignId}/${action}`);
      if (action === 'pause') setStatus('PAUSED');
      if (action === 'resume') setStatus('RUNNING');
      if (action === 'cancel') {
        setStatus('CANCELLED');
        toast.error("Campaign cancelled.");
      }
    } catch (e) {
      toast.error(`Failed to ${action} campaign`);
    }
  };

  const handleRetryFailed = async () => {
    if (!campaignId) return;
    setIsRetrying(true);
    try {
      const res = await api.post(`/whatsapp-ai/campaigns/${campaignId}/retry-failed`);
      toast.success(res.data.message || 'Retrying failed messages...');
      setStatus('RUNNING');
      fetchInitialStatus(campaignId);
      if (activeView === 'recipients') refetchRecipients();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to retry messages');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (!campaignId) return;
    try {
      toast.info(`Preparing ${format.toUpperCase()} export...`);
      const response = await api.get(`/whatsapp-ai/campaigns/${campaignId}/export`, {
        params: { format },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Campaign_Report_${campaignId.slice(-6)}.${format === 'csv' ? 'csv' : 'xlsx'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Report downloaded successfully!');
    } catch (e) {
      toast.error('Failed to export campaign report');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isMounted) return null;

  const progressPercent = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
  const recipientsList = recipientData?.recipients || [];

  return (
    <div className="w-full flex flex-col pb-12 animate-in fade-in">
      <div className="flex-none mb-6">
        <PageHeader
          title="Live Campaign Dashboard"
          description="Enterprise WhatsApp bulk messaging powered by Meta Cloud API"
        />
        
        {/* Step Indicator */}
        <div className="flex items-center gap-4 sm:gap-8 overflow-x-auto w-full no-scrollbar mt-6 bg-white p-4 rounded-2xl border border-slate-200">
          {STEPS.map((step, idx) => (
            <div key={step.id} className="flex items-center">
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-300",
                step.status === 'completed' ? "bg-green-100 text-green-700" :
                step.status === 'active' ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : 
                "bg-slate-100 text-slate-400"
              )}>
                {step.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <span className={cn(
                    "flex items-center justify-center w-5 h-5 rounded-full text-[10px]",
                    step.status === 'active' ? "bg-white text-blue-600" : "bg-slate-200 text-slate-500"
                  )}>
                    {step.id}
                  </span>
                )}
                {step.label}
              </div>
              {idx < STEPS.length - 1 && (
                <div className={cn(
                  "w-8 sm:w-12 h-[2px] mx-2 rounded-full",
                  step.status === 'completed' ? "bg-green-200" : "bg-slate-200"
                )} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Live Monitor (Left side, takes 2 cols) */}
        <div className="lg:col-span-2 flex flex-col space-y-6">
          
          {/* Active Job Card */}
          <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6 sm:p-8 text-white relative overflow-hidden shadow-xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-3.5 h-3.5 rounded-full",
                  status.includes('RUNNING') ? "bg-emerald-400 animate-pulse" : 
                  status === 'PAUSED' ? "bg-amber-400" :
                  status === 'COMPLETED' ? "bg-blue-400" : "bg-red-400"
                )}></div>
                <h3 className="text-xl font-bold tracking-tight">Status: {status}</h3>
              </div>
              <div className="text-slate-400 font-mono font-medium text-sm">
                Elapsed: {formatTime(elapsedTime)}
              </div>
            </div>

            {/* Currently Processing Lead */}
            <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700/60 mb-6 backdrop-blur-sm">
              <div className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" /> Currently Dispatching
              </div>
              
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-lg font-bold text-white">
                    {currentLead?.business_name || 'Processing Queue...'}
                  </div>
                  <div className="text-slate-400 flex items-center gap-2 text-sm mt-0.5">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <span className="font-mono">{currentLead?.phone || '---'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800">
                <div className="text-[11px] text-slate-500 mb-1.5 font-mono">Rendered Message (Meta Cloud Payload)</div>
                <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-line font-sans">
                  {currentMessage || 'Awaiting next recipient in queue...'}
                </div>
              </div>
            </div>

            {/* Progress Bar & ETA */}
            <div className="space-y-3">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-slate-300">Queue Progress ({stats.completed} / {stats.total})</span>
                <span className="text-blue-400 font-bold">{Math.round(progressPercent)}%</span>
              </div>
              <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 transition-all duration-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400 font-medium">
                <span>Pacing ETA: {eta}</span>
                <span>Processed: {stats.completed} of {stats.total} leads</span>
              </div>
            </div>
          </div>

          {/* Action Controls & Export */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => handleControl('pause')}
                disabled={!status.includes('RUNNING')}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
              >
                <Pause className="w-4 h-4" /> Pause
              </button>
              <button 
                onClick={() => handleControl('resume')}
                disabled={status.includes('RUNNING') || status === 'COMPLETED' || status === 'CANCELLED'}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
              >
                <Play className="w-4 h-4" /> Resume
              </button>
              <button 
                onClick={() => handleControl('cancel')}
                disabled={status === 'COMPLETED' || status === 'CANCELLED'}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-sm font-bold transition-colors disabled:opacity-40"
              >
                <Square className="w-4 h-4" /> Cancel
              </button>
            </div>

            <div className="flex items-center gap-2">
              {stats.failed > 0 && (
                <button
                  onClick={handleRetryFailed}
                  disabled={isRetrying}
                  className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                >
                  <RotateCcw className={cn("w-3.5 h-3.5", isRetrying && "animate-spin")} />
                  Retry Failed ({stats.failed})
                </button>
              )}
              
              <div className="flex items-center gap-1.5 border border-slate-200 rounded-xl p-1 bg-slate-50">
                <button
                  onClick={() => handleExport('csv')}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white rounded-lg transition-colors flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> CSV
                </button>
                <button
                  onClick={() => handleExport('xlsx')}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white rounded-lg transition-colors flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> Excel
                </button>
              </div>
            </div>
          </div>

          {/* View Switcher: Terminal vs Recipients Table */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveView('terminal')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                    activeView === 'terminal' ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  <Terminal className="w-3.5 h-3.5 text-blue-500" />
                  Live Event Feed
                </button>
                <button
                  onClick={() => setActiveView('recipients')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
                    activeView === 'recipients' ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  <ListFilter className="w-3.5 h-3.5 text-emerald-500" />
                  Recipient Report ({stats.total})
                </button>
              </div>

              {activeView === 'recipients' && (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search recipient..."
                      value={recipientSearch}
                      onChange={(e) => setRecipientSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 focus:outline-none"
                    />
                  </div>
                  <select
                    value={recipientFilter}
                    onChange={(e) => setRecipientFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-700 font-medium"
                  >
                    <option value="all">All Statuses</option>
                    <option value="sent">Sent</option>
                    <option value="delivered">Delivered</option>
                    <option value="read">Read</option>
                    <option value="failed">Failed</option>
                    <option value="skipped">Skipped</option>
                  </select>
                </div>
              )}
            </div>

            {/* View Content */}
            <div className="p-6">
              {activeView === 'terminal' ? (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                  {logs.length === 0 ? (
                    <div className="text-center text-slate-400 py-12 text-sm">
                      Waiting for worker events...
                    </div>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm p-2 rounded-xl hover:bg-slate-50 transition-colors">
                        <div className="mt-1">
                          {log.status === 'sending' || log.status === 'opening' ? (
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
                          ) : log.status === 'sent' ? (
                            <CheckCircle2 className="w-4 h-4 text-blue-500" />
                          ) : log.status === 'delivered' ? (
                            <CheckCheck className="w-4 h-4 text-emerald-500" />
                          ) : log.status === 'read' ? (
                            <CheckCheck className="w-4 h-4 text-purple-600" />
                          ) : log.status === 'skipped' ? (
                            <Clock className="w-4 h-4 text-slate-400" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 truncate">
                            {log.message || log.status.toUpperCase()}
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                            <span>{new Date(log.processed_at).toLocaleTimeString()}</span>
                            {log.duration > 0 && <span>• {log.duration}s</span>}
                            {log.error && <span className="text-red-500 font-sans">• {log.error}</span>}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  {isLoadingRecipients ? (
                    <div className="py-12 flex justify-center text-slate-400 text-sm">Loading recipients...</div>
                  ) : recipientsList.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-sm">No recipient records match the filter.</div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                        <tr>
                          <th className="p-3">Business / Recipient</th>
                          <th className="p-3">Phone</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Meta Message ID</th>
                          <th className="p-3">Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {recipientsList.map((rec: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 font-semibold text-slate-900">
                              {rec.business_name || 'Target Lead'}
                            </td>
                            <td className="p-3 font-mono text-slate-600">
                              {rec.phone || '---'}
                            </td>
                            <td className="p-3">
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                rec.status === 'sent' ? "bg-blue-100 text-blue-700" :
                                rec.status === 'delivered' ? "bg-emerald-100 text-emerald-700" :
                                rec.status === 'read' ? "bg-purple-100 text-purple-700" :
                                rec.status === 'skipped' ? "bg-slate-100 text-slate-600" :
                                rec.status === 'queued' ? "bg-amber-100 text-amber-700" :
                                "bg-red-100 text-red-700"
                              )}>
                                {rec.status}
                              </span>
                              {rec.error && (
                                <p className="text-[10px] text-red-600 font-sans mt-0.5 max-w-xs truncate" title={rec.error}>
                                  {rec.error}
                                </p>
                              )}
                            </td>
                            <td className="p-3 font-mono text-slate-400 text-[11px] truncate max-w-[120px]">
                              {rec.meta_message_id || '---'}
                            </td>
                            <td className="p-3 text-slate-400">
                              {rec.updated_at ? new Date(rec.updated_at).toLocaleTimeString() : '---'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Real-Time Meta Stats */}
        <div className="flex flex-col space-y-6 min-h-0">
          
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center justify-between">
              <span>Delivery Metrics</span>
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                Meta Cloud API
              </span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-100">
                <div className="text-blue-900 text-2xl font-black">{stats.sent}</div>
                <div className="text-blue-700 text-xs font-semibold mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Sent
                </div>
              </div>

              <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-100">
                <div className="text-emerald-900 text-2xl font-black">{stats.delivered}</div>
                <div className="text-emerald-700 text-xs font-semibold mt-0.5 flex items-center gap-1">
                  <CheckCheck className="w-3.5 h-3.5" /> Delivered
                </div>
              </div>

              <div className="bg-purple-50/70 p-4 rounded-2xl border border-purple-100">
                <div className="text-purple-900 text-2xl font-black">{stats.read}</div>
                <div className="text-purple-700 text-xs font-semibold mt-0.5 flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" /> Read
                </div>
              </div>

              <div className="bg-red-50/70 p-4 rounded-2xl border border-red-100">
                <div className="text-red-900 text-2xl font-black">{stats.failed}</div>
                <div className="text-red-700 text-xs font-semibold mt-0.5 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Failed
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 col-span-2 flex justify-between items-center">
                <div className="text-slate-600 text-xs font-semibold">Skipped (Opt-out / Invalid)</div>
                <div className="text-slate-900 text-base font-bold">{stats.skipped}</div>
              </div>
            </div>
          </div>

          {/* Quick Help Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-sm">
            <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" /> Safe Delivery Protocol
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Messages are paced to comply with Meta's spam and rate limits. If a customer replies with "STOP", they will be automatically removed from future campaigns.
            </p>
            <div className="text-[11px] text-slate-400 font-mono bg-slate-950/60 p-2.5 rounded-xl border border-slate-700">
              Provider: Meta Graph API (v21.0)
            </div>
          </div>
        </div>

      </div>
      
      {/* Footer Navigation */}
      <div className="mt-8 pt-6 border-t border-slate-200 flex items-center justify-between">
        <button
          onClick={() => router.push('/dashboard/whatsapp-ai')}
          className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Exit to Dashboard
        </button>
      </div>
    </div>
  );
}
