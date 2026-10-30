import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Calendar, Users, Send, CheckCircle2, Clock, Activity, Pause, Play, XSquare, Search, Filter, Download, Terminal } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';

interface Campaign {
  _id: string;
  name: string;
  template_id: string;
  status: string;
  created_at: string;
  completed_at?: string;
  target_leads: string[];
}

interface LiveStatus {
  status: string;
  total: number;
  completed: number;
  sent: number;
  failed: number;
  skipped: number;
  current_lead?: {
    business_name: string;
    phone: string;
  };
  logs: Array<{
    lead_id: string;
    status: string;
    processed_at: string;
    error?: string;
  }>;
  current_message?: string;
  eta?: string;
}

export default function CampaignHistory() {
  const queryClient = useQueryClient();
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ['wa-ai-campaigns', search, statusFilter],
    queryFn: async () => {
      const res = await api.get('/whatsapp-ai/campaigns', {
        params: { search, status: statusFilter }
      });
      return res.data;
    },
    refetchInterval: 5000 // Poll every 5s for general history
  });

  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [wsLogs, setWsLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [wsLogs]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let isMounted = true;

    const connectLive = async () => {
      if (!activeCampaignId) {
        setLiveStatus(null);
        setWsLogs([]);
        return;
      }
      
      // Fetch initial state
      try {
        const res = await api.get(`/whatsapp-ai/campaigns/${activeCampaignId}/live-status`);
        if (isMounted) {
          setLiveStatus(res.data);
          setWsLogs((prev) => [...prev, `[System] Connected to Campaign ${activeCampaignId}`]);
        }
      } catch (err) {
        console.error('Failed to fetch initial state', err);
      }

      // Connect WebSocket
      const baseUrl = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
      const normalizedBase = baseUrl.startsWith('ws') ? baseUrl : baseUrl.replace(/^http/, 'ws');
      const apiPrefix = normalizedBase.endsWith('/api/v1') ? normalizedBase : `${normalizedBase}/api/v1`;
      const wsUrl = `${apiPrefix}/whatsapp-ai/ws/${activeCampaignId}`;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'HEARTBEAT') return;

          setLiveStatus((prev) => {
            if (!prev) return prev;
            const updated = { ...prev };
            
            if (data.type === 'WA_LEAD_OPENING') {
               updated.current_lead = { business_name: data.business_name, phone: data.phone };
               updated.current_message = data.message;
               setWsLogs(l => [...l, `[Action] Opening chat for ${data.business_name} (${data.phone})`]);
            }
            if (data.type === 'WA_LEAD_TYPING') {
               setWsLogs(l => [...l, `[Action] Typing message...`]);
            }
            if (data.type === 'WA_LEAD_SENT') {
               updated.sent += 1;
               updated.completed += 1;
               setWsLogs(l => [...l, `[Success] Message sent successfully in ${data.duration}s`]);
            }
            if (data.type === 'WA_LEAD_FAILED') {
               updated.failed += 1;
               updated.completed += 1;
               setWsLogs(l => [...l, `[Error] Failed: ${data.error}`]);
            }
            if (data.type === 'WA_LEAD_SKIPPED') {
               updated.skipped += 1;
               updated.completed += 1;
               setWsLogs(l => [...l, `[Warning] Skipped: ${data.error || 'Unknown'}`]);
            }
            
            // Recalculate ETA visually
            if (updated.completed > 0) {
               const remaining = updated.total - updated.completed;
               const avg = 4.0; // rough visual est
               const etaSecs = remaining * avg;
               updated.eta = `${Math.floor(etaSecs/60).toString().padStart(2, '0')}:${Math.floor(etaSecs%60).toString().padStart(2, '0')}`;
            }

            return updated;
          });
        } catch (e) {
          console.error('WS parse error', e);
        }
      };

      ws.onclose = () => {
        if (isMounted) setWsLogs(l => [...l, `[System] Disconnected`]);
      };
    };

    connectLive();

    return () => {
      isMounted = false;
      if (ws) ws.close();
    };
  }, [activeCampaignId]);

  const controlMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string, action: 'pause' | 'resume' | 'cancel' }) => {
      return api.post(`/whatsapp-ai/campaigns/${id}/${action}`);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['wa-ai-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['wa-ai-campaign-live', variables.id] });
      toast.success(`Campaign ${variables.action}d`);
    }
  });
  
  const handleExport = async (campaignId: string, format: 'csv' | 'xlsx') => {
    try {
      const res = await api.get(`/whatsapp-ai/campaigns/${campaignId}/export`, {
        params: { format },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Campaign_Report_${campaignId}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (error) {
      toast.error('Failed to export report');
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      {activeCampaignId && liveStatus ? (
        <div className="mb-6 p-6 bg-white border border-blue-200 rounded-3xl shadow-lg shadow-blue-500/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-slate-100">
            <div 
              className="h-full bg-blue-500 transition-all duration-500" 
              style={{ width: `${(liveStatus.completed / Math.max(liveStatus.total, 1)) * 100}%` }}
            />
          </div>
          
          <div className="flex justify-between items-start mb-6 mt-2">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Activity className="w-5 h-5 text-blue-500 animate-pulse" />
                <h3 className="text-xl font-bold text-slate-900">Live Monitor</h3>
                <span className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-bold border",
                  liveStatus.status === 'RUNNING' ? "bg-blue-100 text-blue-700 border-blue-200" :
                  liveStatus.status === 'PAUSED' ? "bg-amber-100 text-amber-700 border-amber-200" :
                  liveStatus.status === 'COMPLETED' ? "bg-green-100 text-green-700 border-green-200" :
                  "bg-slate-100 text-slate-700 border-slate-200"
                )}>
                  {liveStatus.status}
                </span>
                {liveStatus.status === 'RUNNING' && (
                  <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                    ETA: {liveStatus.eta}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500">Automating Windows WhatsApp Desktop Natively</p>
            </div>
            <button 
              onClick={() => setActiveCampaignId(null)}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200"
            >
              Close Monitor
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="text-sm font-medium text-slate-500 mb-1">Progress</div>
              <div className="text-2xl font-bold text-slate-900">{liveStatus.completed} <span className="text-slate-400 text-lg">/ {liveStatus.total}</span></div>
            </div>
            <div className="p-4 bg-green-50 rounded-2xl border border-green-100">
              <div className="text-sm font-medium text-green-700 mb-1">Sent successfully</div>
              <div className="text-2xl font-bold text-green-800">{liveStatus.sent}</div>
            </div>
            <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
              <div className="text-sm font-medium text-red-700 mb-1">Failed</div>
              <div className="text-2xl font-bold text-red-800">{liveStatus.failed}</div>
            </div>
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
              <div className="text-sm font-medium text-amber-700 mb-1">Skipped</div>
              <div className="text-2xl font-bold text-amber-800">{liveStatus.skipped}</div>
            </div>
          </div>

          <div className="flex gap-4">
            {liveStatus.status === 'RUNNING' && (
              <button 
                onClick={() => controlMutation.mutate({ id: activeCampaignId, action: 'pause' })}
                className="flex-1 py-3 bg-amber-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-amber-600 transition-colors"
              >
                <Pause className="w-5 h-5" /> Pause Campaign
              </button>
            )}
            {liveStatus.status === 'PAUSED' && (
              <button 
                onClick={() => controlMutation.mutate({ id: activeCampaignId, action: 'resume' })}
                className="flex-1 py-3 bg-green-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-green-600 transition-colors"
              >
                <Play className="w-5 h-5" /> Resume Campaign
              </button>
            )}
            {(liveStatus.status === 'RUNNING' || liveStatus.status === 'PAUSED' || liveStatus.status === 'QUEUED') && (
              <button 
                onClick={() => controlMutation.mutate({ id: activeCampaignId, action: 'cancel' })}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-red-600 transition-colors"
              >
                <XSquare className="w-5 h-5" /> Cancel Campaign
              </button>
            )}
          </div>

          {liveStatus.current_lead && liveStatus.status === 'RUNNING' && (
            <div className="mt-6 p-4 border border-blue-200 bg-blue-50/50 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">Currently Processing</div>
                  <div className="font-medium text-slate-900">{liveStatus.current_lead.business_name}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium text-slate-500 mb-1">Target Number</div>
                  <div className="font-mono text-sm text-slate-700">{liveStatus.current_lead.phone || 'N/A'}</div>
                </div>
              </div>
              
              {liveStatus.current_message && (
                <div className="bg-white p-3 rounded-lg border border-blue-100 text-sm text-slate-600 font-mono">
                  <div className="text-xs font-bold text-slate-400 uppercase mb-1">Message Preview</div>
                  {liveStatus.current_message}
                </div>
              )}
            </div>
          )}

          {/* Live WebSocket Logs */}
          <div className="mt-6 bg-slate-50/80 rounded-xl p-4 border border-slate-200 h-48 flex flex-col shadow-xs">
            <div className="flex items-center gap-2 text-slate-700 mb-3 text-xs font-bold uppercase tracking-wider">
              <Terminal className="w-4 h-4 text-slate-600" /> Live Terminal
            </div>
            <div className="flex-1 overflow-auto font-mono text-xs space-y-1.5 scrollbar-thin scrollbar-thumb-slate-300">
              {wsLogs.map((log, i) => (
                <div key={i} className={cn(
                  "font-medium",
                  log.includes('[Success]') ? "text-emerald-700" :
                  log.includes('[Error]') ? "text-rose-700" :
                  log.includes('[Warning]') ? "text-amber-700" :
                  log.includes('[System]') ? "text-blue-700" : "text-slate-700"
                )}>
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Campaign History</h2>
            <p className="text-slate-500 text-sm mt-1">Track the performance and status of your past campaigns</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                placeholder="Search campaigns..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64 shadow-sm"
              />
            </div>
            
            <div className="relative">
              <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select 
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 appearance-none shadow-sm cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="RUNNING">Running</option>
                <option value="COMPLETED">Completed</option>
                <option value="PAUSED">Paused</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-slate-50/50 rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-white sticky top-0 z-10 border-b border-slate-200 shadow-sm">
            <tr>
              <th className="p-4 font-semibold text-slate-900">Campaign Name</th>
              <th className="p-4 font-semibold text-slate-900">Status</th>
              <th className="p-4 font-semibold text-slate-900">Leads Targeted</th>
              <th className="p-4 font-semibold text-slate-900">Date Created</th>
              <th className="p-4 font-semibold text-slate-900 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="p-4"><div className="h-6 bg-slate-200 rounded-lg w-3/4"></div></td>
                  <td className="p-4"><div className="h-6 bg-slate-200 rounded-lg w-1/2"></div></td>
                  <td className="p-4"><div className="h-6 bg-slate-200 rounded-lg w-1/4"></div></td>
                  <td className="p-4"><div className="h-6 bg-slate-200 rounded-lg w-1/2"></div></td>
                  <td className="p-4"></td>
                </tr>
              ))
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-slate-500">
                  <Send className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                  <p className="font-medium text-slate-600">No campaigns found</p>
                  <p className="text-sm mt-1">Use the Campaign Wizard to launch your first one.</p>
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => (
                <tr key={campaign._id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <span className="font-semibold text-slate-900">{campaign.name}</span>
                  </td>
                  <td className="p-4">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                      campaign.status === 'RUNNING' ? "bg-blue-100 text-blue-700 border-blue-200" :
                      campaign.status === 'PAUSED' ? "bg-amber-100 text-amber-700 border-amber-200" :
                      campaign.status === 'COMPLETED' ? "bg-green-100 text-green-700 border-green-200" :
                      campaign.status === 'CANCELLED' ? "bg-red-100 text-red-700 border-red-200" :
                      "bg-slate-100 text-slate-700 border-slate-200"
                    )}>
                      {campaign.status === 'RUNNING' ? <Activity className="w-3.5 h-3.5" /> :
                       campaign.status === 'COMPLETED' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                       <Clock className="w-3.5 h-3.5" />}
                      {campaign.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-400" />
                      {campaign.target_leads?.length || 0} Leads
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      {format(new Date(campaign.created_at), 'MMM d, yyyy h:mm a')}
                    </div>
                  </td>
                  <td className="p-4 text-right space-x-2 whitespace-nowrap">
                    <button 
                      onClick={() => setActiveCampaignId(campaign._id)}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-sm"
                    >
                      View Live Monitor
                    </button>
                    
                    <div className="flex items-center gap-2 mt-2 justify-end">
                      <button 
                        onClick={() => handleExport(campaign._id, 'csv')}
                        className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 hover:text-green-600 transition-colors shadow-sm inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> CSV
                      </button>
                      <button 
                        onClick={() => handleExport(campaign._id, 'xlsx')}
                        className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 hover:text-green-600 transition-colors shadow-sm inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> Excel
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
