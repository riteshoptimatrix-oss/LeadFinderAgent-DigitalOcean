'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { getWebSocketUrl } from '@/src/lib/wsUrl';
import {
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  MousePointerClick,
  MessageSquareReply,
  RefreshCw,
  Loader2,
  FlaskConical,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

interface TestEmailRecord {
  _id: string;
  tracking_id: string;
  message_id?: string;
  to_email: string;
  subject: string;
  status: string;
  verification_status: 'Success' | 'Pending' | 'Failed';
  error?: string | null;
  sent_at?: string | null;
  opened: boolean;
  opened_at?: string | null;
  open_count: number;
  clicked: boolean;
  clicked_at?: string | null;
  click_count: number;
  replied: boolean;
  replied_at?: string | null;
  reply_subject?: string | null;
  reply_snippet?: string | null;
}

function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`;
    return new Date(normalized).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function EmailTestingPanel() {
  const queryClient = useQueryClient();
  const [testEmail, setTestEmail] = useState('');
  const [activeTrackingId, setActiveTrackingId] = useState<string | null>(null);

  const { data: historyData, isLoading: historyLoading } = useQuery<{ data: TestEmailRecord[] }>({
    queryKey: ['email-testing-history'],
    queryFn: async () => {
      const res = await api.get('/tracking/test-email/history?limit=10');
      return res.data;
    },
    refetchInterval: (query) => {
      const rows = query.state.data?.data || [];
      const hasPending = rows.some((r) => r.verification_status === 'Pending');
      return hasPending ? 3000 : 15000;
    },
  });

  const { data: activeRecord } = useQuery<TestEmailRecord>({
    queryKey: ['email-testing-status', activeTrackingId],
    queryFn: async () => {
      const res = await api.get(`/tracking/test-email/${activeTrackingId}`);
      return res.data;
    },
    enabled: Boolean(activeTrackingId),
    refetchInterval: (query) => (query.state.data?.verification_status === 'Pending' ? 3000 : false),
  });

  const sendTestMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await api.post('/tracking/test-email', { to_email: email });
      return res.data as TestEmailRecord;
    },
    onSuccess: (data) => {
      setActiveTrackingId(data.tracking_id);
      queryClient.invalidateQueries({ queryKey: ['email-testing-history'] });
      if (data.verification_status === 'Failed') {
        toast.error(data.error || 'Failed to send test email');
      } else {
        toast.success(`Test email sent to ${data.to_email}. Open or click the link to verify tracking.`);
      }
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to send test email');
    },
  });

  const checkRepliesMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/tracking/check-replies');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-testing-history'] });
      if (activeTrackingId) {
        queryClient.invalidateQueries({ queryKey: ['email-testing-status', activeTrackingId] });
      }
      toast.success('Inbox checked for replies.');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to check replies');
    },
  });

  // Real-time WebSocket listener for instant tracking updates
  useEffect(() => {
    let socket: WebSocket | null = null;
    let cancelled = false;
    try {
      const url = getWebSocketUrl('/api/v1/ws/events', true);
      socket = new WebSocket(url);
      socket.onmessage = (event) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(event.data);
          const evType = msg?.type || msg?.event_type;
          if (evType === 'email_opened' || evType === 'email_clicked' || evType === 'email_replied') {
            queryClient.invalidateQueries({ queryKey: ['email-testing-history'] });
            if (activeTrackingId && msg?.tracking_id === activeTrackingId) {
              queryClient.invalidateQueries({ queryKey: ['email-testing-status', activeTrackingId] });
            }
          }
        } catch {}
      };
    } catch {}
    return () => {
      cancelled = true;
      socket?.close();
    };
  }, [queryClient, activeTrackingId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = testEmail.trim();
    if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      toast.error('Please enter a valid email address.');
      return;
    }
    sendTestMutation.mutate(cleaned);
  };

  const history = historyData?.data || [];
  const displayedRecord = activeRecord || history[0] || null;

  return (
    <div className="space-y-6">
      {/* Input Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Email Tracking Verification</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Send a live test email using your connected SMTP account to verify open, click, and reply tracking.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => checkRepliesMutation.mutate()}
            disabled={checkRepliesMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', checkRepliesMutation.isPending && 'animate-spin')} />
            Check Replies Now
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="Enter email address to test (e.g. name@company.com)"
            disabled={sendTestMutation.isPending}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={sendTestMutation.isPending}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold transition-all shadow-xs cursor-pointer shrink-0"
          >
            {sendTestMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {sendTestMutation.isPending ? 'Sending...' : 'Test Email'}
          </button>
        </form>
      </div>

      {/* Latest Verification Status */}
      {displayedRecord && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Verification Result
              </div>
              <div className="text-base font-bold text-slate-900 mt-0.5">
                {displayedRecord.to_email}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Sent: {formatTime(displayedRecord.sent_at)}
              </div>
            </div>

            {displayedRecord.verification_status === 'Success' ? (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4" />
                Success — Email Tracking Working Correctly
              </span>
            ) : displayedRecord.verification_status === 'Failed' ? (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <XCircle className="w-4 h-4" />
                Failed — Tracking / Delivery Error
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <Clock className="w-4 h-4 animate-pulse" />
                Pending — Awaiting Open, Click, or Reply
              </span>
            )}
          </div>

          {displayedRecord.error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {displayedRecord.error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              className={cn(
                'p-4 rounded-xl border',
                displayedRecord.opened
                  ? 'bg-emerald-50/60 border-emerald-200'
                  : 'bg-slate-50 border-slate-200'
              )}
            >
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Eye className={cn('w-4 h-4', displayedRecord.opened ? 'text-emerald-600' : 'text-slate-400')} />
                Open Tracking
              </div>
              <div className="text-xs font-semibold mt-1.5 text-slate-900">
                {displayedRecord.opened
                  ? `Verified (${displayedRecord.open_count}×)`
                  : 'Waiting for pixel load'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {formatTime(displayedRecord.opened_at)}
              </div>
            </div>

            <div
              className={cn(
                'p-4 rounded-xl border',
                displayedRecord.clicked
                  ? 'bg-blue-50/60 border-blue-200'
                  : 'bg-slate-50 border-slate-200'
              )}
            >
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <MousePointerClick
                  className={cn('w-4 h-4', displayedRecord.clicked ? 'text-blue-600' : 'text-slate-400')}
                />
                Click Tracking
              </div>
              <div className="text-xs font-semibold mt-1.5 text-slate-900">
                {displayedRecord.clicked
                  ? `Verified (${displayedRecord.click_count}×)`
                  : 'Waiting for link click'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {formatTime(displayedRecord.clicked_at)}
              </div>
            </div>

            <div
              className={cn(
                'p-4 rounded-xl border',
                displayedRecord.replied
                  ? 'bg-purple-50/60 border-purple-200'
                  : 'bg-slate-50 border-slate-200'
              )}
            >
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <MessageSquareReply
                  className={cn('w-4 h-4', displayedRecord.replied ? 'text-purple-600' : 'text-slate-400')}
                />
                Reply Tracking
              </div>
              <div className="text-xs font-semibold mt-1.5 text-slate-900">
                {displayedRecord.replied ? 'Reply Detected' : 'Waiting for reply'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {formatTime(displayedRecord.replied_at)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Test History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-700">
          Recent Email Tests
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Recipient</th>
                <th className="py-3 px-4">Verification</th>
                <th className="py-3 px-4">Opens</th>
                <th className="py-3 px-4">Clicks</th>
                <th className="py-3 px-4">Replied</th>
                <th className="py-3 px-4">Sent At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading test history...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No test emails sent yet. Enter an email above and click &quot;Test Email&quot;.
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr
                    key={row._id}
                    onClick={() => setActiveTrackingId(row.tracking_id)}
                    className={cn(
                      'hover:bg-slate-50 cursor-pointer transition-colors',
                      displayedRecord?.tracking_id === row.tracking_id && 'bg-blue-50/40'
                    )}
                  >
                    <td className="py-3 px-4 font-semibold text-slate-900">{row.to_email}</td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border',
                          row.verification_status === 'Success'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : row.verification_status === 'Failed'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        )}
                      >
                        {row.verification_status}
                      </span>
                    </td>
                    <td className="py-3 px-4">{row.opened ? `${row.open_count}×` : '—'}</td>
                    <td className="py-3 px-4">{row.clicked ? `${row.click_count}×` : '—'}</td>
                    <td className="py-3 px-4">{row.replied ? 'Yes' : '—'}</td>
                    <td className="py-3 px-4 text-slate-500">{formatTime(row.sent_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
