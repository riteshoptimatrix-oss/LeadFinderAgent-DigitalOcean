'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { getWebSocketUrl } from '@/src/lib/wsUrl';
import {
  Eye,
  MousePointerClick,
  MessageSquareReply,
  Mail,
  CheckCircle2,
  PauseCircle,
  RefreshCw,
  Search,
  Clock,
  ExternalLink,
  X,
  Info,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

interface ClickedUrlEntry {
  url: string;
  clicked_at: string;
}

interface TrackingEventItem {
  _id: string;
  tracking_id: string;
  message_id?: string;
  campaign_id: string;
  campaign_name: string;
  lead_id: string;
  lead_name: string;
  recipient_email: string;
  subject: string;
  status: 'SENT' | 'OPENED' | 'CLICKED' | 'REPLIED';
  sent_at?: string | null;
  opened: boolean;
  opened_at?: string | null;
  open_count: number;
  clicked: boolean;
  clicked_at?: string | null;
  click_count: number;
  clicked_urls?: ClickedUrlEntry[];
  replied: boolean;
  replied_at?: string | null;
  reply_subject?: string | null;
  reply_snippet?: string | null;
  reply_from?: string | null;
  followups_paused: boolean;
}

interface TrackingStats {
  total_sent: number;
  total_opened: number;
  total_clicked: number;
  total_replied: number;
  followups_paused: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`;
    return new Date(normalized).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function EmailTrackingDashboard() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SENT' | 'OPENED' | 'CLICKED' | 'REPLIED'>('ALL');
  const [campaignFilter, setCampaignFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<TrackingEventItem | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<TrackingStats>({
    queryKey: ['email-tracking-stats', campaignFilter],
    queryFn: async () => {
      const params = campaignFilter ? `?campaign_id=${encodeURIComponent(campaignFilter)}` : '';
      const res = await api.get(`/tracking/stats${params}`);
      return res.data;
    },
    refetchInterval: 15000,
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery<{
    data: TrackingEventItem[];
    total: number;
  }>({
    queryKey: ['email-tracking-events', campaignFilter, statusFilter, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (campaignFilter) params.set('campaign_id', campaignFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      params.set('limit', '100');
      const res = await api.get(`/tracking/events?${params.toString()}`);
      return res.data;
    },
    refetchInterval: 15000,
  });

  const { data: campaignsList = [] } = useQuery<any[]>({
    queryKey: ['email-ai-campaigns-for-tracking'],
    queryFn: async () => {
      try {
        const res = await api.get('/email-ai/campaigns');
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
    },
    staleTime: 30000,
  });

  const checkRepliesMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/tracking/check-replies');
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['email-tracking-stats'] });
      queryClient.invalidateQueries({ queryKey: ['email-tracking-events'] });
      if (data?.status === 'skipped') {
        toast.info(data.reason || 'IMAP credentials not configured in User Settings.');
      } else if (data?.status === 'error') {
        toast.error(data.error || 'Failed to check IMAP inbox.');
      } else {
        toast.success(
          `Inbox synced: ${data?.messages_scanned ?? 0} message(s) scanned, ${data?.replies_matched ?? 0} new repl${
            data?.replies_matched === 1 ? 'y' : 'ies'
          } matched.`
        );
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to sync replies');
    },
  });

  // Real-time WebSocket listener for open, click, and reply events
  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      try {
        const url = getWebSocketUrl('/api/v1/ws/events', true);
        socket = new WebSocket(url);

        socket.onopen = () => {
          if (!cancelled) setWsConnected(true);
        };

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            const evType = msg?.type || msg?.event_type;
            if (evType === 'email_opened' || evType === 'email_clicked' || evType === 'email_replied' || evType === 'email_sent') {
              queryClient.invalidateQueries({ queryKey: ['email-tracking-stats'] });
              queryClient.invalidateQueries({ queryKey: ['email-tracking-events'] });
            }
            if (evType === 'email_replied') {
              toast.success(msg.message || `${msg.lead_name || 'A lead'} has replied to your email!`, {
                description: msg.reply_subject ? `Subject: ${msg.reply_subject}` : 'Pending follow-ups have been paused.',
              });
            }
          } catch {}
        };

        socket.onclose = () => {
          if (!cancelled) {
            setWsConnected(false);
            reconnectTimer = setTimeout(connect, 5000);
          }
        };

        socket.onerror = () => {
          socket?.close();
        };
      } catch {
        setWsConnected(false);
      }
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [queryClient]);

  const items = useMemo(() => eventsData?.data || [], [eventsData]);

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-slate-900">Email Engagement & Lead Tracking</h2>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border',
                wsConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              )}
            >
              {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {wsConnected ? 'Live WebSocket' : 'Polling'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time open tracking, link click analytics, IMAP reply detection, and automatic follow-up pausing.
          </p>
        </div>

        <button
          onClick={() => checkRepliesMutation.mutate()}
          disabled={checkRepliesMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', checkRepliesMutation.isPending && 'animate-spin')} />
          {checkRepliesMutation.isPending ? 'Syncing Inbox...' : 'Sync Replies Now'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Tracked Sent</span>
            <div className="p-2 rounded-xl bg-slate-100 text-slate-600">
              <Mail className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">
            {statsLoading ? '—' : (stats?.total_sent ?? 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Emails with tracking IDs</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Opened (Est.)</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {statsLoading ? '—' : (stats?.total_opened ?? 0).toLocaleString()}
            </span>
            <span className="text-xs font-bold text-emerald-600">
              {statsLoading ? '' : `${stats?.open_rate ?? 0}%`}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Based on tracking pixel loads</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Link Clicks</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <MousePointerClick className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {statsLoading ? '—' : (stats?.total_clicked ?? 0).toLocaleString()}
            </span>
            <span className="text-xs font-bold text-blue-600">
              {statsLoading ? '' : `${stats?.click_rate ?? 0}%`}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Unique leads who clicked a link</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Replied</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <MessageSquareReply className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {statsLoading ? '—' : (stats?.total_replied ?? 0).toLocaleString()}
            </span>
            <span className="text-xs font-bold text-purple-600">
              {statsLoading ? '' : `${stats?.reply_rate ?? 0}%`}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {stats?.followups_paused ?? 0} follow-up sequence(s) paused
          </div>
        </div>
      </div>

      {/* Accuracy Notice */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <span>
          <strong>Tracking Note:</strong> Open events are estimated via an invisible 1×1 pixel and may be affected by email client image blocking, proxies, or preloading. Automated security scanners may also trigger link clicks. Reply detection runs automatically every 5 minutes via IMAP.
        </span>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['ALL', 'SENT', 'OPENED', 'CLICKED', 'REPLIED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                statusFilter === st
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {st === 'ALL' ? 'All Events' : st.charAt(0) + st.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All Campaigns</option>
            {campaignsList.map((c: any) => (
              <option key={c._id} value={c._id}>
                {c.info?.name || c._id}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search lead, email, subject..."
              className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-56"
            />
          </div>
        </div>
      </div>

      {/* Tracking Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4">Lead / Recipient</th>
                <th className="py-3.5 px-4">Campaign & Subject</th>
                <th className="py-3.5 px-4">Engagement Status</th>
                <th className="py-3.5 px-4">Opens</th>
                <th className="py-3.5 px-4">Clicks</th>
                <th className="py-3.5 px-4">Reply / Follow-Up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {eventsLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Loading tracking events...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No tracked emails found yet. Launch an email campaign to see real-time engagement here.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{item.lead_name}</div>
                      <div className="text-[11px] text-slate-500">{item.recipient_email}</div>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-semibold text-slate-800 truncate">{item.campaign_name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{item.subject || '(No subject)'}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Sent {formatDateTime(item.sent_at)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {item.replied ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          <MessageSquareReply className="w-3.5 h-3.5" /> REPLIED
                        </span>
                      ) : item.clicked ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          <MousePointerClick className="w-3.5 h-3.5" /> Clicked
                        </span>
                      ) : item.opened ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Opened
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          <Mail className="w-3 h-3" /> Sent
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {item.opened ? (
                        <div>
                          <div className="font-bold text-emerald-700">{item.open_count}×</div>
                          <div className="text-[10px] text-slate-400">{formatDateTime(item.opened_at)}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {item.clicked ? (
                        <div>
                          <div className="font-bold text-blue-700">{item.click_count}×</div>
                          <div className="text-[10px] text-slate-400">{formatDateTime(item.clicked_at)}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {item.replied ? (
                        <div className="space-y-1">
                          {item.followups_paused && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <PauseCircle className="w-3 h-3" /> Follow-ups Paused
                            </span>
                          )}
                          <div>
                            <button
                              onClick={() => setSelectedItem(item)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 hover:text-purple-900 cursor-pointer"
                            >
                              View Reply <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Awaiting reply</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reply Preview Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 mb-1.5">
                  <MessageSquareReply className="w-3 h-3" /> Reply Detected
                </span>
                <h3 className="text-base font-bold text-slate-900">{selectedItem.lead_name}</h3>
                <p className="text-xs text-slate-500">{selectedItem.reply_from || selectedItem.recipient_email}</p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-700">
                Subject: {selectedItem.reply_subject || '(No Subject)'}
              </div>
              <div className="text-[11px] text-slate-400">
                Received: {formatDateTime(selectedItem.replied_at)}
              </div>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap pt-1 border-t border-slate-200">
                {selectedItem.reply_snippet || 'No preview text available.'}
              </p>
            </div>

            {selectedItem.followups_paused && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <PauseCircle className="w-4 h-4 shrink-0" />
                <span>Automated follow-ups for this lead have been paused.</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
