'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/src/components/common/PageHeader';
import { 
  Play, Pause, Square, RotateCcw, 
  CheckCircle2, AlertCircle, Clock, Smartphone, User, ArrowLeft, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/src/lib/axios';
import { cn } from '@/src/lib/utils';

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
    total: 0, completed: 0, sent: 0, failed: 0, skipped: 0
  });
  const [currentLead, setCurrentLead] = useState<any>(null);
  const [currentMessage, setCurrentMessage] = useState<string>('');
  const [eta, setEta] = useState<string>('00:00');
  const [logs, setLogs] = useState<any[]>([]);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const activeCampaign = localStorage.getItem('wa_active_campaign');
    if (activeCampaign) {
      setCampaignId(activeCampaign);
      fetchInitialStatus(activeCampaign);
      connectWebSocket(activeCampaign);
    } else {
      // If no active campaign, redirect back
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
    if (status === 'RUNNING') {
      timer = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status]);

  const fetchInitialStatus = async (id: string) => {
    try {
      const res = await api.get(`/whatsapp-ai/campaigns/${id}/live-status`);
      const data = res.data;
      setStatus(data.status);
      setStats({
        total: data.total,
        completed: data.completed,
        sent: data.sent,
        failed: data.failed,
        skipped: data.skipped
      });
      setCurrentLead(data.current_lead);
      setCurrentMessage(data.current_message);
      setEta(data.eta);
      setLogs(data.logs || []);
    } catch (e) {
      toast.error("Could not fetch campaign status");
    }
  };

  const connectWebSocket = (id: string) => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://127.0.0.1:8000';
    const socket = new WebSocket(`${wsUrl}/api/v1/whatsapp-ai/ws/${id}`);

    socket.onopen = () => {
      console.log('WebSocket Connected');
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

        // Real-time Event Handling
        if (data.type === 'wa_lead_opening') {
          setCurrentLead({ business_name: data.business_name, phone: data.phone });
          setCurrentMessage(data.message);
          setStatus('RUNNING (Opening WhatsApp)');
          addLog(data.lead_id, 'opening', 'Opening WhatsApp Desktop...');
        } 
        else if (data.type === 'wa_lead_typing') {
          setStatus('RUNNING (Typing...)');
          addLog(data.lead_id, 'typing', 'Pasting message & sending...');
        }
        else if (data.type === 'wa_lead_sent') {
          setStats(prev => ({ ...prev, completed: prev.completed + 1, sent: prev.sent + 1 }));
          addLog(data.lead_id, 'sent', 'Message Sent Successfully', data.duration);
          checkCompletion();
        }
        else if (data.type === 'wa_lead_failed') {
          setStats(prev => ({ ...prev, completed: prev.completed + 1, failed: prev.failed + 1 }));
          addLog(data.lead_id, 'failed', `Failed: ${data.error}`, data.duration);
          checkCompletion();
        }
        else if (data.type === 'wa_lead_skipped') {
          setStats(prev => ({ ...prev, completed: prev.completed + 1, skipped: prev.skipped + 1 }));
          addLog(data.lead_id, 'skipped', `Skipped: ${data.error}`);
          checkCompletion();
        }
      } catch (err) {
        console.warn('Failed to parse WhatsApp WebSocket message:', err);
      }
    };

    socket.onclose = () => {
      console.log('WebSocket Disconnected. Reconnecting in 5s...');
      setTimeout(() => connectWebSocket(id), 5000);
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
    }, ...prev].slice(0, 100)); // Keep last 100
  };

  const checkCompletion = () => {
    setStats(prev => {
      if (prev.completed >= prev.total && prev.total > 0) {
        setStatus('COMPLETED');
        toast.success("Campaign finished successfully!");
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isMounted) return null;

  const progressPercent = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

  return (
    <div className="w-full flex flex-col pb-12">
      <div className="flex-none mb-8">
        <PageHeader
          title="Live Campaign Dashboard"
          description="Monitor your automated WhatsApp AI workflow in real-time."
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
          <div className="bg-slate-900 rounded-3xl border border-slate-800 p-8 text-white relative overflow-hidden shadow-xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-3 h-3 rounded-full animate-pulse",
                  status.includes('RUNNING') ? "bg-green-400" : 
                  status === 'PAUSED' ? "bg-amber-400" :
                  status === 'COMPLETED' ? "bg-blue-400" : "bg-red-400"
                )}></div>
                <h3 className="text-xl font-bold tracking-tight">Status: {status}</h3>
              </div>
              <div className="text-slate-400 font-mono font-medium">
                Elapsed: {formatTime(elapsedTime)}
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 mb-8 backdrop-blur-sm">
              <div className="text-sm text-slate-400 mb-2 font-semibold uppercase tracking-wider">Currently Processing</div>
              
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xl font-bold text-white">
                    {currentLead?.business_name || 'Waiting...'}
                  </div>
                  <div className="text-slate-400 flex items-center gap-2 text-sm mt-1">
                    <Smartphone className="w-4 h-4" />
                    {currentLead?.phone || '---'}
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 rounded-xl p-4 border border-slate-700">
                <div className="text-xs text-slate-500 mb-2 font-mono">Message Preview (Variables Replaced)</div>
                <div className="text-slate-300 text-sm italic font-serif">
                  "{currentMessage || 'Awaiting template rendering...'}"
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-3">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-slate-300">Progress ({stats.completed} / {stats.total})</span>
                <span className="text-blue-400">{Math.round(progressPercent)}%</span>
              </div>
              <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>ETA: {eta}</span>
                <span>Queue Position: {stats.completed + 1}</span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 flex items-center justify-center gap-4">
            <button 
              onClick={() => handleControl('pause')}
              disabled={!status.includes('RUNNING')}
              className="flex items-center gap-2 px-6 py-3 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl font-semibold transition-colors disabled:opacity-50"
            >
              <Pause className="w-5 h-5" /> Pause
            </button>
            <button 
              onClick={() => handleControl('resume')}
              disabled={status.includes('RUNNING') || status === 'COMPLETED' || status === 'CANCELLED'}
              className="flex items-center gap-2 px-6 py-3 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl font-semibold transition-colors disabled:opacity-50"
            >
              <Play className="w-5 h-5" /> Resume
            </button>
            <button 
              onClick={() => handleControl('cancel')}
              disabled={status === 'COMPLETED' || status === 'CANCELLED'}
              className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl font-semibold transition-colors disabled:opacity-50"
            >
              <Square className="w-5 h-5" /> Cancel
            </button>
          </div>
        </div>

        {/* Right Sidebar: Stats & Logs */}
        <div className="flex flex-col space-y-6 min-h-0">
          
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4">Live Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <div className="text-blue-900 text-2xl font-bold">{stats.sent}</div>
                <div className="text-blue-700 text-sm font-medium">Successfully Sent</div>
              </div>
              <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                <div className="text-red-900 text-2xl font-bold">{stats.failed}</div>
                <div className="text-red-700 text-sm font-medium">Failed</div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 col-span-2 flex justify-between items-center">
                <div className="text-slate-600 text-sm font-medium">Skipped (Invalid Number)</div>
                <div className="text-slate-900 text-lg font-bold">{stats.skipped}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900">Execution Logs</h3>
              <div className="text-xs text-slate-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Live Updates
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {logs.length === 0 ? (
                <div className="text-center text-slate-400 py-8 text-sm">Waiting for events...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <div className="mt-1">
                      {log.status === 'opening' || log.status === 'typing' ? (
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      ) : log.status === 'sent' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : log.status === 'skipped' ? (
                        <Clock className="w-4 h-4 text-slate-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">
                        {log.message || log.status.toUpperCase()}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5 flex gap-2">
                        {new Date(log.processed_at).toLocaleTimeString()}
                        {log.duration > 0 && <span>• {log.duration.toFixed(1)}s</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
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
