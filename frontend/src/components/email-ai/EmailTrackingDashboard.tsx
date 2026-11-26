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
  AlertTriangle,
  Ban,
  BarChart3,
  List,
  Globe,
  Monitor,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

interface ClickedUrlEntry {
  url: string;
  clicked_at: string;
  ip?: string;
  user_agent?: string;
}

interface EventHistoryEntry {
  type: 'sent' | 'open' | 'click' | 'reply' | 'bounce' | 'unsubscribe';
  timestamp: string;
  url?: string;
  ip?: string;
  user_agent?: string;
  details?: string;
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
  status: 'SENT' | 'OPENED' | 'CLICKED' | 'REPLIED' | 'BOUNCED' | 'UNSUBSCRIBED';
  sent_at?: string | null;
  opened: boolean;
  opened_at?: string | null;
  last_opened_at?: string | null;
  open_count: number;
  clicked: boolean;
  clicked_at?: string | null;
  last_clicked_at?: string | null;
  click_count: number;
  clicked_urls?: ClickedUrlEntry[];
  replied: boolean;
  replied_at?: string | null;
  reply_subject?: string | null;
  reply_snippet?: string | null;
  reply_from?: string | null;
  bounced?: boolean;
  bounced_at?: string | null;
  unsubscribed?: boolean;
  unsubscribed_at?: string | null;
  last_ip?: string | null;
  last_user_agent?: string | null;
  event_history?: EventHistoryEntry[];
  followups_paused: boolean;
}

interface TrackingStats {
  total_sent: number;
  total_opened: number;
  total_clicked: number;
  total_replied: number;
  total_bounced?: number;
  total_unsubscribed?: number;
  followups_paused: number;
  sent_today?: number;
  opened_today?: number;
  clicked_today?: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  bounce_rate?: number;
  unsubscribe_rate?: number;
}

interface DailyReportRow {
  date: string;
  label: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
}

interface DailyReportResponse {
  date_from: string;
  date_to: string;
  rows: DailyReportRow[];
  totals: {
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    unsubscribed: number;
  };
}

type StatusFilter = 'ALL' | 'SENT' | 'OPENED' | 'CLICKED' | 'REPLIED' | 'BOUNCED' | 'UNSUBSCRIBED';

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

function parseReplyText(rawSnippet?: string | null): { replyText: string; quotedText?: string } {
  if (!rawSnippet) return { replyText: 'No preview text available.' };
  const trimmed = rawSnippet.trim();

  // Pattern 1: Attribution header with newline
  const quoteMatch = trimmed.match(/^([\s\S]*?)(?:\r?\n|\s)+(?:(On\s+[A-Za-z]+,\s*\d+[\s\S]*?wrote:|-{3,}\s*Original Message\s*-{3,}|From:\s*[\s\S]+?Sent:)[\s\S]*)$/i);
  if (quoteMatch && quoteMatch[1]?.trim()) {
    const quoteIndex = trimmed.indexOf(quoteMatch[2]);
    return {
      replyText: quoteMatch[1].trim(),
      quotedText: quoteIndex !== -1 ? trimmed.slice(quoteIndex).trim() : undefined,
    };
  }

  // Pattern 2: Single-line glued attribution
  const singleLineMatch = trimmed.match(/^([\s\S]+?)\s+(On\s+[A-Za-z0-9, ]+?wrote:.*)$/i);
  if (singleLineMatch && singleLineMatch[1]?.trim()) {
    return {
      replyText: singleLineMatch[1].trim(),
      quotedText: singleLineMatch[2].trim(),
    };
  }

  return { replyText: trimmed };
}

export default function EmailTrackingDashboard() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'events' | 'daily'>('events');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [campaignFilter, setCampaignFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
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
    queryKey: ['email-tracking-events', campaignFilter, statusFilter, searchTerm, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (campaignFilter) params.set('campaign_id', campaignFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      params.set('limit', '100');
      const res = await api.get(`/tracking/events?${params.toString()}`);
      return res.data;
    },
    refetchInterval: 15000,
  });

  const { data: dailyReport, isLoading: dailyLoading } = useQuery<DailyReportResponse>({
    queryKey: ['email-tracking-daily-report', campaignFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (campaignFilter) params.set('campaign_id', campaignFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      const res = await api.get(`/tracking/daily-report?${params.toString()}`);
      return res.data;
    },
    enabled: viewMode === 'daily',
    refetchInterval: 30000,
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
      queryClient.invalidateQueries({ queryKey: ['email-tracking-daily-report'] });
      if (data?.status === 'skipped') {
        toast.info(data.reason || 'IMAP credentials not configured in User Settings.');
      } else if (data?.status === 'error') {
        toast.error(data.error || 'Failed to check IMAP inbox.');
      } else {
        toast.success(
          `Inbox synced: ${data?.messages_scanned ?? 0} message(s) scanned, ${data?.replies_matched ?? 0} new repl${data?.replies_matched === 1 ? 'y' : 'ies'
          } matched.`
        );
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to sync replies');
    },
  });

  const checkBouncesMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/tracking/check-bounces');
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['email-tracking-stats'] });
      queryClient.invalidateQueries({ queryKey: ['email-tracking-events'] });
      queryClient.invalidateQueries({ queryKey: ['email-tracking-daily-report'] });
      if (data?.status === 'skipped') {
        toast.info(data.reason || 'IMAP credentials not configured in User Settings.');
      } else if (data?.status === 'error') {
        toast.error(data.error || 'Failed to scan IMAP bounces.');
      } else {
        toast.success(
          `Bounce scan complete: ${data?.messages_scanned ?? 0} DSN(s) checked, ${data?.bounces_matched ?? 0} bounce(s) matched.`
        );
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to check bounces');
    },
  });

  // Real-time WebSocket listener for open, click, reply, bounce, and unsubscribe events
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
              if (
                evType === 'email_opened' ||
                evType === 'email_clicked' ||
                evType === 'email_replied' ||
                evType === 'email_bounced' ||
                evType === 'email_unsubscribed' ||
                evType === 'email_sent'
              ) {
                queryClient.invalidateQueries({ queryKey: ['email-tracking-stats'] });
                queryClient.invalidateQueries({ queryKey: ['email-tracking-events'] });
                queryClient.invalidateQueries({ queryKey: ['email-tracking-daily-report'] });
              }
              if (evType === 'email_replied') {
                toast.success(msg.message || `${msg.lead_name || 'A lead'} has replied to your email!`, {
                  description: msg.reply_subject ? `Subject: ${msg.reply_subject}` : 'Pending follow-ups have been paused.',
                });
              }
            } catch { }
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
  const dailyRows = useMemo(() => dailyReport?.rows || [], [dailyReport]);
  const maxDailySent = useMemo(
    () => Math.max(1, ...dailyRows.map((r) => Math.max(r.sent, r.opened, r.clicked))),
    [dailyRows]
  );

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div>
              <div className="flex items-center gap-2.5 flex-wrap">
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
                Open pixel tracking, link click redirects, IMAP reply & bounce detection, one-click unsubscribe, and daily engagement reports.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('events')}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                    viewMode === 'events' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <List className="w-3.5 h-3.5" /> Tracking Log
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('daily')}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                    viewMode === 'daily' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <BarChart3 className="w-3.5 h-3.5" /> 30-Day Report
                </button>
              </div>

              <button
                onClick={() => checkBouncesMutation.mutate()}
                disabled={checkBouncesMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:opacity-60 text-rose-700 text-xs font-bold transition-all cursor-pointer shrink-0"
              >
                <AlertTriangle className={cn('w-3.5 h-3.5', checkBouncesMutation.isPending && 'animate-pulse')} />
                {checkBouncesMutation.isPending ? 'Scanning Bounces...' : 'Check Bounces'}
              </button>

              <button
                onClick={() => checkRepliesMutation.mutate()}
                disabled={checkRepliesMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', checkRepliesMutation.isPending && 'animate-spin')} />
                {checkRepliesMutation.isPending ? 'Syncing Inbox...' : 'Sync Replies Now'}
              </button>
            </div>
          </div>

          {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tracked Sent</span>
                  <div className="p-2 rounded-xl bg-slate-100 text-slate-600">
                    <Mail className="w-4 h-4" />
                  </div>
                </div>
                  <div className="text-2xl font-black text-slate-900">
                    {statsLoading ? '—' : (stats?.total_sent ?? 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{stats?.sent_today ?? 0} sent today</div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Opened (Est.)</span>
                    <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                      <Eye className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-slate-900">
                        {statsLoading ? '—' : (stats?.total_opened ?? 0).toLocaleString()}
                      </span>
                      <span className="text-xs font-bold text-emerald-600">
                        {statsLoading ? '' : `${stats?.open_rate ?? 0}%`}
                      </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{stats?.opened_today ?? 0} opened today</div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Link Clicks</span>
                    <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                      <MousePointerClick className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-slate-900">
                        {statsLoading ? '—' : (stats?.total_clicked ?? 0).toLocaleString()}
                      </span>
                      <span className="text-xs font-bold text-blue-600">
                        {statsLoading ? '' : `${stats?.click_rate ?? 0}%`}
                      </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{stats?.clicked_today ?? 0} clicked today</div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Replied</span>
                    <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                      <MessageSquareReply className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-slate-900">
                        {statsLoading ? '—' : (stats?.total_replied ?? 0).toLocaleString()}
                      </span>
                      <span className="text-xs font-bold text-purple-600">
                        {statsLoading ? '' : `${stats?.reply_rate ?? 0}%`}
                      </span>
                  </div>
                    <div className="text-[11px] text-slate-500 mt-1">{stats?.followups_paused ?? 0} paused</div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Bounced</span>
                      <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-slate-900">
                        {statsLoading ? '—' : (stats?.total_bounced ?? 0).toLocaleString()}
                      </span>
                      <span className="text-xs font-bold text-rose-600">
                        {statsLoading ? '' : `${stats?.bounce_rate ?? 0}%`}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">DSN delivery failures</div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Unsubscribed</span>
                      <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                        <Ban className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-slate-900">
                        {statsLoading ? '—' : (stats?.total_unsubscribed ?? 0).toLocaleString()}
                      </span>
                      <span className="text-xs font-bold text-amber-600">
                        {statsLoading ? '' : `${stats?.unsubscribe_rate ?? 0}%`}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">Opted-out recipients</div>
                  </div>
                </div>

                {/* Accuracy Notice */}
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Tracking Note:</strong> Open events are estimated via an invisible 1×1 pixel and may be affected by email client image blocking, proxies, or preloading; an open event does not guarantee a human read the email. Automated security scanners may also trigger link clicks. Reply detection runs automatically every 5 minutes via IMAP.
                  </span>
                </div>

                {/* Filters */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
                    {viewMode === 'events' ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(['ALL', 'SENT', 'OPENED', 'CLICKED', 'REPLIED', 'BOUNCED', 'UNSUBSCRIBED'] as const).map((st) => (
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
                    ) : (
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <span>
                          Daily Engagement Breakdown ({dailyReport?.date_from || 'Last 30d'} to {dailyReport?.date_to || 'Today'})
                        </span>
                      </div>
                    )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                          title="From date"
                          className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                        <input
                          type="date"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                          title="To date"
                          className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
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

                        {viewMode === 'events' && (
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              placeholder="Search lead, email, subject..."
                              className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-52"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                                {viewMode === 'events' ? (
                                  /* Tracking Table */
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
                                            <th className="py-3.5 px-4">Timeline / Actions</th>
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
                                                  <tr
                                                    key={item._id}
                                                    onClick={() => setSelectedItem(item)}
                                                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                                                  >
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
                        {item.bounced ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertTriangle className="w-3.5 h-3.5" /> Bounced
                          </span>
                        ) : item.unsubscribed ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Ban className="w-3.5 h-3.5" /> Unsubscribed
                          </span>
                        ) : item.replied ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            <MessageSquareReply className="w-3.5 h-3.5" /> Replied
                          </span>
                        ) : item.clicked ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <MousePointerClick className="w-3.5 h-3.5" /> Clicked
                          </span>
                        ) : (item.opened || item.status === 'OPENED') ? (
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
                        {(item.opened || item.open_count > 0 || item.status === 'OPENED') ? (
                          <div>
                            <div className="font-bold text-emerald-700">{item.open_count || 1}×</div>
                            <div className="text-[10px] text-slate-400">{formatDateTime(item.opened_at || item.last_opened_at)}</div>
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

                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="space-y-1">
                          {item.followups_paused && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <PauseCircle className="w-3 h-3" /> Follow-ups Paused
                            </span>
                          )}
                          <div>
                            <button
                              onClick={() => setSelectedItem(item)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                            >
                              View Timeline <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                                                ))
                                              )}
                                            </tbody>
                                          </table>
                                        </div>
                                    </div>
                                    ) : (
                                    /* 30-Day Trend & Daily Report */
                                    <div className="space-y-6">
                                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                                        <div className="flex items-center justify-between mb-4">
                                          <div>
                                            <h3 className="text-sm font-bold text-slate-900">Engagement Trend</h3>
                                            <p className="text-xs text-slate-500">Daily Sent vs Opened vs Clicked volume</p>
                                          </div>
                                          <div className="flex items-center gap-4 text-[11px] font-semibold">
                                            <span className="inline-flex items-center gap-1.5 text-slate-600">
                                              <span className="w-2.5 h-2.5 rounded-xs bg-blue-500" /> Sent ({dailyReport?.totals.sent ?? 0})
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 text-slate-600">
                                              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Opened ({dailyReport?.totals.opened ?? 0})
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 text-slate-600">
                                              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500" /> Clicked ({dailyReport?.totals.clicked ?? 0})
                                            </span>
                                          </div>
                                        </div>

                                        {dailyLoading ? (
                                          <div className="h-44 flex items-center justify-center text-xs text-slate-400">Loading daily chart...</div>
                                        ) : dailyRows.length === 0 ? (
                                          <div className="h-44 flex items-center justify-center text-xs text-slate-400">No data in selected date range.</div>
                                        ) : (
                                          <div className="h-48 flex items-end gap-1 pt-4 overflow-x-auto">
                                            {dailyRows.map((row) => (
                                              <div key={row.date} className="flex-1 min-w-[18px] flex flex-col items-center gap-1 group">
                                                <div className="w-full h-36 flex items-end justify-center gap-0.5">
                                                  <div
                                                    title={`${row.label}: ${row.sent} sent`}
                                                    style={{ height: `${Math.max(row.sent > 0 ? 4 : 0, (row.sent / maxDailySent) * 100)}%` }}
                                                    className="w-1.5 bg-blue-500 rounded-t-xs transition-all"
                                                  />
                                                  <div
                                                    title={`${row.label}: ${row.opened} opened`}
                                                    style={{ height: `${Math.max(row.opened > 0 ? 4 : 0, (row.opened / maxDailySent) * 100)}%` }}
                                                    className="w-1.5 bg-emerald-500 rounded-t-xs transition-all"
                                                  />
                                                  <div
                                                    title={`${row.label}: ${row.clicked} clicked`}
                                                    style={{ height: `${Math.max(row.clicked > 0 ? 4 : 0, (row.clicked / maxDailySent) * 100)}%` }}
                                                    className="w-1.5 bg-indigo-500 rounded-t-xs transition-all"
                                                  />
                                                </div>
                                                <span className="text-[9px] text-slate-400 truncate max-w-full">{row.label}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>

                                      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-left border-collapse">
                                            <thead>
                                              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                                <th className="py-3 px-4">Date</th>
                                                <th className="py-3 px-4">Sent</th>
                                                <th className="py-3 px-4">Opened</th>
                                                <th className="py-3 px-4">Clicked</th>
                                                <th className="py-3 px-4">Replied</th>
                                                <th className="py-3 px-4">Bounced</th>
                                                <th className="py-3 px-4">Unsubscribed</th>
                                              </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-xs">
                                          {dailyLoading ? (
                                            <tr>
                                              <td colSpan={7} className="py-10 text-center text-slate-400">
                                                Loading daily report...
                                              </td>
                                            </tr>
                                          ) : (
                                            [...dailyRows].reverse().map((r) => (
                                              <tr key={r.date} className="hover:bg-slate-50/70">
                                                <td className="py-2.5 px-4 font-semibold text-slate-800">{r.date}</td>
                                                <td className="py-2.5 px-4 text-slate-700">{r.sent}</td>
                                                <td className="py-2.5 px-4 text-emerald-700 font-semibold">{r.opened}</td>
                                                <td className="py-2.5 px-4 text-blue-700 font-semibold">{r.clicked}</td>
                                                <td className="py-2.5 px-4 text-purple-700 font-semibold">{r.replied}</td>
                                                <td className="py-2.5 px-4 text-rose-700 font-semibold">{r.bounced}</td>
                                                <td className="py-2.5 px-4 text-amber-700 font-semibold">{r.unsubscribed}</td>
                                              </tr>
                                            ))
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
        </div>
      )}

                          {/* Email Tracking Detail & Event Timeline Modal */}
                          {selectedItem && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-5">
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <h3 className="text-base font-bold text-slate-900">{selectedItem.lead_name}</h3>
                                      <p className="text-xs text-slate-500">
                                        {selectedItem.recipient_email} · {selectedItem.campaign_name}
                                      </p>
                                      <p className="text-xs text-slate-700 font-medium mt-1">
                                        Subject: {selectedItem.subject || '(No subject)'}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => setSelectedItem(null)}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>

                                      {/* Client Metadata */}
                                      {(selectedItem.last_ip || selectedItem.last_user_agent) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs">
                <div className="flex items-center gap-2 text-slate-600">
                  <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">Last IP: {selectedItem.last_ip || '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Monitor className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate" title={selectedItem.last_user_agent || ''}>
                    UA: {selectedItem.last_user_agent || '—'}
                  </span>
                </div>
              </div>
            )}

            {/* Reply Snippet if Replied */}
            {selectedItem.replied && (() => {
              const parsed = parseReplyText(selectedItem.reply_snippet);
              return (
                <div className="bg-purple-50/70 rounded-xl p-4 border border-purple-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-purple-200/60 pb-2 flex-wrap gap-2">
                    <div>
                      <div className="text-xs font-bold text-purple-900">
                        Reply: {selectedItem.reply_subject || '(No Subject)'}
                      </div>
                      <div className="text-[11px] text-purple-600">
                        From {selectedItem.reply_from || selectedItem.recipient_email} · {formatDateTime(selectedItem.replied_at)}
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-300">
                      Incoming Reply
                    </span>
                  </div>

                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-purple-900 mb-1">
                      Lead's Message:
                    </div>
                    <div className="p-3.5 bg-white rounded-xl border border-purple-200 shadow-2xs text-xs font-semibold text-slate-900 whitespace-pre-wrap leading-relaxed">
                      {parsed.replyText}
                    </div>
                  </div>

                  {parsed.quotedText && (
                    <details className="text-[11px] text-slate-500">
                      <summary className="cursor-pointer hover:text-slate-700 font-medium select-none">
                        Show Quoted Email Header
                      </summary>
                      <p className="mt-1.5 p-2.5 rounded-lg bg-purple-100/50 text-slate-500 whitespace-pre-wrap font-mono text-[10px] border border-purple-200/60">
                        {parsed.quotedText}
                      </p>
                    </details>
                  )}
                </div>
              );
            })()}

            {/* Clicked URLs */}
            {selectedItem.clicked_urls && selectedItem.clicked_urls.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Clicked Links ({selectedItem.clicked_urls.length})
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {selectedItem.clicked_urls.map((c, idx) => (
                    <div
                      key={`${c.url}-${idx}`}
                      className="flex items-center justify-between gap-2 text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-200"
                    >
                      <span className="truncate text-blue-700 font-medium">{c.url}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">{formatDateTime(c.clicked_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Event History Timeline */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Event History</div>
              {selectedItem.event_history && selectedItem.event_history.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {[...selectedItem.event_history].reverse().map((ev, idx) => (
                    <div
                      key={`${ev.type}-${ev.timestamp}-${idx}`}
                      className="flex items-start justify-between gap-3 text-xs bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200"
                    >
                      <div className="min-w-0">
                        <span className="inline-block font-bold uppercase text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 mr-2">
                          {ev.type}
                        </span>
                        <span className="text-slate-700 break-all">
                          {ev.url || ev.details || (ev.ip ? `IP: ${ev.ip}` : 'Event recorded')}
                        </span>
                        {ev.user_agent && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{ev.user_agent}</div>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">{formatDateTime(ev.timestamp)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  Sent at {formatDateTime(selectedItem.sent_at)}
                  {selectedItem.opened && ` · Opened ${selectedItem.open_count}×`}
                  {selectedItem.clicked && ` · Clicked ${selectedItem.click_count}×`}
                </div>
              )}
            </div>

            {selectedItem.followups_paused && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                <PauseCircle className="w-4 h-4 shrink-0" />
                <span>Automated follow-ups for this lead are paused.</span>
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
