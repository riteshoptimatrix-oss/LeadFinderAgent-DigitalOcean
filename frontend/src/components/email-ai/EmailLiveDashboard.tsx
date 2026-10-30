'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { 
  Building2, Mail, Phone, Globe, Briefcase, MapPin, Sparkles, 
  Settings, CheckCircle2, ChevronRight, ChevronLeft, Calendar, 
  Clock, ShieldAlert, FileText, Server, Sliders, Play, Pause, Square,
  Loader2, Zap, Activity, AlertCircle, Eye, CornerDownRight, Wifi, WifiOff, RotateCcw, Download
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { useRouter } from 'next/navigation';

export default function EmailLiveDashboard() {
  const queryClient = useQueryClient();
  const [isMounted, setIsMounted] = useState(false);
  
  // Connection State
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [token, setToken] = useState<string>('');
  
  // Dashboard State
  const [campaignData, setCampaignData] = useState<any>(null);
  const [stats, setStats] = useState({
    Pending: 0,
    Waiting: 0,
    Preparing: 0,
    Connecting: 0,
    Sending: 0,
    Delivered: 0,
    Failed: 0,
    Skipped: 0
  });
  
  const [logs, setLogs] = useState<any[]>([]);
  const [currentEmail, setCurrentEmail] = useState<any>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Initialize
  useEffect(() => {
    setIsMounted(true);
    const storedToken =
      localStorage.getItem('access_token') ||
      localStorage.getItem('token') ||
      sessionStorage.getItem('access_token') ||
      '';
    if (storedToken) setToken(storedToken);
    
    // In a real app this might come from router params. We use localStorage or fetch the latest RUNNING campaign.
    const fetchLatestCampaign = async () => {
      try {
        const storedActiveId = localStorage.getItem('email_active_campaign');
        const res = await api.get('/email-ai/campaigns?status=RUNNING');
        if (res.data && res.data.length > 0) {
          setActiveCampaignId(res.data[0]._id);
          return;
        }
        const res2 = await api.get('/email-ai/campaigns?status=QUEUED');
        if (res2.data && res2.data.length > 0) {
          setActiveCampaignId(res2.data[0]._id);
          return;
        }
        if (storedActiveId) {
          setActiveCampaignId(storedActiveId);
          return;
        }
      } catch (e) {
        console.error('Failed to fetch campaign for dashboard', e);
      }
    };
    fetchLatestCampaign();
  }, []);

  // Fetch Initial Status
  const fetchLiveStatus = useCallback(async () => {
    if (!activeCampaignId) return;
    try {
      const res = await api.get(`/email-ai/campaigns/${activeCampaignId}/live-status`);
      setCampaignData({ status: res.data.status, total: res.data.total, name: `Campaign ${activeCampaignId.substring(0, 8)}` }); // Ideally name comes from API
      
      const newStats = {
        Pending: 0, Waiting: 0, Preparing: 0, Connecting: 0, Sending: 0, 
        Delivered: 0, Failed: 0, Skipped: 0, ...res.data.stats
      };
      setStats(newStats);
      
      if (res.data.logs) {
        setLogs(res.data.logs);
      }
    } catch (e) {
      toast.error('Failed to load initial campaign data');
    }
  }, [activeCampaignId]);

  useEffect(() => {
    if (!activeCampaignId) return;
    fetchLiveStatus();
    // Periodic refresh so progress/status stay in sync even if a WS event is missed.
    const pollInterval = setInterval(fetchLiveStatus, 5000);
    return () => clearInterval(pollInterval);
  }, [activeCampaignId, fetchLiveStatus]);

  // Global cross-tab / WebSocket real-time sync listener
  useEffect(() => {
    const handleLiveEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && (detail.type === 'email_sent' || detail.type === 'email_failed' || detail.status === 'Delivered' || detail.status === 'Failed' || detail.type === 'email_campaign_completed')) {
        queryClient.invalidateQueries({ queryKey: ['email-ai-header-analytics'] });
        queryClient.invalidateQueries({ queryKey: ['email-ai-analytics'] });
        queryClient.invalidateQueries({ queryKey: ['email-ai-campaigns'] });
        fetchLiveStatus();
      }
    };
    window.addEventListener('email-ai-live-event', handleLiveEvent);
    return () => window.removeEventListener('email-ai-live-event', handleLiveEvent);
  }, [fetchLiveStatus, queryClient]);

  // WebSocket Connection
  useEffect(() => {
    if (!activeCampaignId || !token) return;

    let socket: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      const baseUrl = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
      const normalizedBase = baseUrl.startsWith('ws') ? baseUrl : baseUrl.replace(/^http/, 'ws');
      const wsUrl = normalizedBase.endsWith('/api/v1') ? normalizedBase : `${normalizedBase}/api/v1`;
      
      socket = new WebSocket(`${wsUrl}/ws/campaigns/${activeCampaignId}?token=${token}`);
      
      socket.onopen = () => {
        setIsConnected(true);
        console.log('Live Dashboard Connected');
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'heartbeat') return;
          
          // Handle Event
          const statusMap: any = {
            'email_preparing': 'Preparing',
            'smtp_connecting': 'Connecting',
            'email_sending': 'Sending',
            'email_sent': 'Delivered',
            'email_failed': 'Failed',
            'email_skipped': 'Skipped'
          };
          
          const newStatus = statusMap[data.type] || data.status;
          
          if (newStatus) {
            setStats(prev => {
              const updated = { ...prev };
              // We could theoretically decrement the old status, but a safe approach is simply to trigger a background re-sync
              // or increment new / decrement pending. For a true realtime architecture, we increment the target.
              if (newStatus in updated) {
                updated[newStatus as keyof typeof updated]++;
                // Safely decrement Pending if it's a processing status
                if (['Preparing', 'Connecting', 'Sending'].includes(newStatus) && updated.Pending > 0) {
                  updated.Pending--;
                }
              }
              return updated;
            });
            
            // Set current email
            if (['Preparing', 'Connecting', 'Sending'].includes(newStatus)) {
              setCurrentEmail({
                lead_id: data.lead_id,
                email: data.email || 'Processing...',
                status: newStatus,
                timestamp: new Date().toLocaleTimeString()
              });
            }

            // Real-time invalidation so top telemetry cards update immediately!
            if (['Delivered', 'Failed', 'Skipped'].includes(newStatus) || data.type === 'email_campaign_completed') {
              queryClient.invalidateQueries({ queryKey: ['email-ai-header-analytics'] });
              queryClient.invalidateQueries({ queryKey: ['email-ai-analytics'] });
              queryClient.invalidateQueries({ queryKey: ['email-ai-campaigns'] });
              fetchLiveStatus();
            }
          }
          
          // Add to logs
          setLogs(prev => {
            const newLog = {
              lead_id: data.lead_id,
              status: newStatus || data.type,
              last_message: data.error || `Transitioned to ${newStatus}`,
              updated_at: data.timestamp || new Date().toISOString()
            };
            return [newLog, ...prev].slice(0, 100); // Keep last 100
          });
          
        } catch (e) {
          console.error("Error parsing WS message", e);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        // Auto Reconnect
        reconnectTimeout = setTimeout(connect, 3000);
      };

      socket.onerror = () => {
        socket.close();
      };

      setWs(socket);
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (socket) socket.close();
    };
  }, [activeCampaignId, token]);

  // Elapsed Timer
  useEffect(() => {
    if (!campaignData || campaignData.status !== 'RUNNING') return;
    const interval = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [campaignData]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Controls
  const controlMutation = useMutation({
    mutationFn: async (action: string) => await api.post(`/email-ai/campaigns/${activeCampaignId}/${action}`),
    onSuccess: (res, action) => {
      toast.success(`Campaign ${action}ed`);
      setCampaignData((prev: any) => ({
        ...prev, 
        status: action === 'pause' ? 'PAUSED' : action === 'resume' ? 'RUNNING' : 'CANCELLED'
      }));
    }
  });

  if (!isMounted) return null;

  if (!activeCampaignId) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-12 text-center animate-in fade-in">
        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
          <Activity className="w-10 h-10 text-slate-300" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No Active Campaign</h2>
        <p className="text-slate-500 max-w-md">There are currently no running or queued campaigns. Start a campaign from the Wizard to monitor it here.</p>
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'campaigns' }))}
          className="mt-6 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all"
        >
          Go to Campaign Wizard
        </button>
      </div>
    );
  }

  const totalProcessed = stats.Delivered + stats.Failed + stats.Skipped;
  const totalLeads = campaignData?.total || 1;
  const progressPercent = Math.min(100, Math.round((totalProcessed / totalLeads) * 100)) || 0;
  
  const successRate = totalProcessed > 0 ? Math.round((stats.Delivered / totalProcessed) * 100) : 0;
  const emailsPerMin = elapsedSeconds > 0 ? Math.round((stats.Delivered / (elapsedSeconds / 60))) : 0;

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-in fade-in">
      
      {/* Header */}
      <div className="flex-none p-6 bg-white border border-slate-200 rounded-2xl shadow-sm mb-6 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-10">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-black text-slate-900">{campaignData?.name || 'Loading Campaign...'}</h1>
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5",
              campaignData?.status === 'RUNNING' ? "bg-green-100 text-green-700" :
              campaignData?.status === 'PAUSED' ? "bg-amber-100 text-amber-700" :
              "bg-slate-100 text-slate-700"
            )}>
              {campaignData?.status === 'RUNNING' && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
              {campaignData?.status || 'UNKNOWN'}
            </span>
            <div className={cn("px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1", isConnected ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600")}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isConnected ? 'LIVE' : 'RECONNECTING...'}
            </div>
          </div>
          <p className="text-slate-500 text-sm font-medium">ID: {activeCampaignId}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right mr-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Elapsed Time</div>
            <div className="text-xl font-mono font-bold text-slate-900">{formatTime(elapsedSeconds)}</div>
          </div>
          <div className="w-px h-10 bg-slate-200 mr-2" />
          
          <button 
            onClick={() => controlMutation.mutate(campaignData?.status === 'PAUSED' ? 'resume' : 'pause')}
            disabled={!['RUNNING', 'PAUSED'].includes(campaignData?.status)}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {campaignData?.status === 'PAUSED' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            {campaignData?.status === 'PAUSED' ? 'Resume' : 'Pause'}
          </button>
          
          <button 
            onClick={() => controlMutation.mutate('cancel')}
            disabled={!['RUNNING', 'PAUSED', 'QUEUED'].includes(campaignData?.status)}
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Square className="w-4 h-4" /> Cancel
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        
        {/* Left Column: KPIs & Progress */}
        <div className="w-2/3 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
          
          {/* Progress Bar */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-end mb-3">
              <div>
                <div className="text-sm font-bold text-slate-900 mb-1">Campaign Progress</div>
                <div className="text-xs text-slate-500">{totalProcessed} / {totalLeads} Emails Processed</div>
              </div>
              <div className="text-2xl font-black text-blue-600">{progressPercent}%</div>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all duration-1000 ease-out relative"
                style={{ width: `${progressPercent}%` }}
              >
                <div className="absolute top-0 bottom-0 left-0 right-0 bg-white/20 animate-pulse" />
              </div>
            </div>
          </div>

          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Delivered</div>
              <div className="text-2xl font-black text-green-600">{stats.Delivered}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Failed</div>
              <div className="text-2xl font-black text-red-500">{stats.Failed}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Pending</div>
              <div className="text-2xl font-black text-slate-700">{stats.Pending}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Skipped</div>
              <div className="text-2xl font-black text-slate-500">{stats.Skipped}</div>
            </div>
            
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Processing</div>
              <div className="text-2xl font-black text-blue-500">{stats.Preparing + stats.Connecting + stats.Sending}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Waiting (Retry)</div>
              <div className="text-2xl font-black text-amber-500">{stats.Waiting}</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Success Rate</div>
              <div className="text-2xl font-black text-slate-900">{successRate}%</div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase mb-1">Speed (per min)</div>
              <div className="text-2xl font-black text-slate-900">{emailsPerMin}</div>
            </div>
          </div>

          {/* Current Status Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 text-slate-900 p-5 rounded-2xl shadow-sm relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-lg text-slate-900">Live Execution</h3>
              </div>
              {currentEmail ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-slate-500 text-xs font-semibold mb-0.5">Target</div>
                    <div className="font-bold text-slate-800 truncate">{currentEmail.email}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-xs font-semibold mb-0.5">Current Status</div>
                    <div className="flex items-center gap-2 font-bold text-blue-600">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> {currentEmail.status}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 text-sm italic mt-4">Waiting for next job...</div>
              )}
            </div>

            <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Server className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-900 text-lg">Active Worker</h3>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Mail className="w-4 h-4 text-blue-500" /> SMTP Worker</div>
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><RotateCcw className="w-4 h-4 text-amber-500" /> Retry Worker</div>
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                </div>
              </div>
            </div>
          </div>
          
        </div>

        {/* Right Column: Live Logs */}
        <div className="w-1/3 flex flex-col bg-slate-50 rounded-2xl shadow-sm overflow-hidden border border-slate-200">
          <div className="flex-none p-4 border-b border-slate-200 flex items-center justify-between bg-white">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-amber-500" /> Live Terminal Feed
            </h3>
            <button className="text-slate-400 hover:text-slate-600 transition-colors" title="Export Logs">
              <Download className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed custom-scrollbar bg-slate-50">
            {logs.length === 0 ? (
              <div className="text-slate-400 italic">Waiting for events...</div>
            ) : (
              [...logs].reverse().map((log, i) => (
                <div key={i} className="mb-2 hover:bg-slate-200/50 p-1 -mx-1 rounded transition-colors break-words">
                  <span className="text-slate-400 mr-2">[{new Date(log.updated_at).toLocaleTimeString()}]</span>
                  <span className={cn(
                    "font-bold mr-2",
                    log.status === 'Delivered' ? "text-emerald-600" :
                    log.status === 'Failed' ? "text-rose-600" :
                    log.status === 'Skipped' ? "text-amber-600" :
                    "text-blue-600"
                  )}>[{log.status.toUpperCase()}]</span>
                  <span className="text-slate-700">Lead {log.lead_id?.substring(0,6)}: {log.last_message || 'Processing'}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

      </div>
    </div>
  );
}
