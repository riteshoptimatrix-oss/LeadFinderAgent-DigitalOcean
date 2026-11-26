import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Mail, CheckCircle2, XCircle, Clock, Activity, Calendar, Eye, MousePointerClick, MessageSquareReply, PauseCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export default function EmailAnalyticsDashboard() {
  const queryClient = useQueryClient();
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['email-ai-analytics'],
    queryFn: async () => {
      const res = await api.get('/email-ai/analytics');
      return res.data;
    },
    refetchInterval: 4000 // Update every 4s for real-time live telemetry
  });

  const { data: trackingStats } = useQuery({
    queryKey: ['email-tracking-stats'],
    queryFn: async () => {
      const res = await api.get('/tracking/stats');
      return res.data;
    },
    refetchInterval: 10000
  });

  useEffect(() => {
    const handleEmailEvent = () => {
      queryClient.invalidateQueries({ queryKey: ['email-ai-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['email-tracking-stats'] });
    };
    window.addEventListener('email-ai-live-event', handleEmailEvent);
    return () => window.removeEventListener('email-ai-live-event', handleEmailEvent);
  }, [queryClient]);

  if (isLoading || !analytics) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-44 bg-slate-100 rounded-3xl border border-slate-200"></div>
          <div className="h-44 bg-slate-100 rounded-3xl border border-slate-200"></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="h-24 bg-slate-100 rounded-2xl border border-slate-200"></div>
          <div className="h-24 bg-slate-100 rounded-2xl border border-slate-200"></div>
          <div className="h-24 bg-slate-100 rounded-2xl border border-slate-200"></div>
          <div className="h-24 bg-slate-100 rounded-2xl border border-slate-200"></div>
        </div>
        <div className="h-72 bg-slate-100 rounded-3xl border border-slate-200"></div>
      </div>
    );
  }

  const successRate = analytics?.success_rate != null ? Number(analytics.success_rate) : 0;
  const avgSendTime = analytics?.avg_send_time != null ? Number(analytics.avg_send_time) : 0;
  const totalSent = analytics?.total_sent != null ? Number(analytics.total_sent) : 0;
  const totalFailed = analytics?.total_failed != null ? Number(analytics.total_failed) : 0;

  return (
    <div className="space-y-6">
      {/* Top Main Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between overflow-hidden relative">
          <div className="absolute right-0 top-0 w-32 h-32 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-full blur-3xl -mr-10 -mt-10"></div>
          <div>
            <div className="text-slate-400 font-bold uppercase tracking-wider text-xs mb-2">Total Emails Sent</div>
            <div className="text-5xl font-black text-slate-900 tracking-tight">{totalSent.toLocaleString()}</div>
            <div className={cn("mt-2 text-xs font-semibold flex items-center gap-1.5", totalSent > 0 ? "text-emerald-600" : "text-slate-400")}>
              <CheckCircle2 className="w-4 h-4" /> {totalSent > 0 ? "Successfully Delivered & Inboxed" : "No campaign emails dispatched yet"}
            </div>
          </div>
          <div className="p-4 bg-indigo-50 rounded-2xl">
            <Mail className="w-10 h-10 text-indigo-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between relative overflow-hidden text-slate-900">
          <div className="absolute right-0 top-0 w-32 h-32 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
          <div>
            <div className="text-slate-400 font-bold uppercase tracking-wider text-xs mb-2">Delivery Success Rate</div>
            <div className="text-5xl font-black text-slate-900 tracking-tight">{successRate.toFixed(1)}%</div>
            <div className="mt-2 text-xs text-slate-500 font-medium">
              {totalSent + totalFailed > 0 ? `Out of ${(totalSent + totalFailed).toLocaleString()} total processed` : 'No dispatches recorded'}
            </div>
          </div>

          <div className="relative">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle className="text-slate-100" strokeWidth="8" stroke="currentColor" fill="transparent" r="40" cx="48" cy="48" />
              <circle
                className="text-indigo-600 transition-all duration-1000"
                strokeWidth="8"
                strokeDasharray={40 * 2 * Math.PI}
                strokeDashoffset={40 * 2 * Math.PI - (Math.min(100, Math.max(0, successRate)) / 100) * 40 * 2 * Math.PI}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r="40"
                cx="48"
                cy="48"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-slate-900">
              {Math.round(successRate)}%
            </div>
          </div>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500 mb-2 font-semibold text-xs uppercase">
            <Calendar className="w-4 h-4 text-blue-500" /> Today
          </div>
          <div className="text-2xl font-black text-slate-900">{analytics.messages_sent_today ?? 0}</div>
          <div className="text-[11px] text-slate-400 mt-1">Real-time daily count</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500 mb-2 font-semibold text-xs uppercase">
            <Activity className="w-4 h-4 text-indigo-500" /> This Week
          </div>
          <div className="text-2xl font-black text-slate-900">{analytics.messages_sent_week ?? 0}</div>
          <div className="text-[11px] text-slate-400 mt-1">Rolling 7-day volume</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-rose-500 mb-2 font-semibold text-xs uppercase">
            <XCircle className="w-4 h-4" /> Failures / Bounces
          </div>
          <div className="text-2xl font-black text-slate-900">{totalFailed}</div>
          <div className="text-[11px] text-slate-400 mt-1">Captured in Error Center</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-emerald-500 mb-2 font-semibold text-xs uppercase">
            <Clock className="w-4 h-4" /> Avg Send Pacing
          </div>
          <div className="text-2xl font-black text-slate-900">{avgSendTime.toFixed(1)}s</div>
          <div className="text-[11px] text-slate-400 mt-1">Human jitter delay</div>
        </div>
      </div>

      {/* E-Mail Tracker (Live) */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 rounded-xl border border-indigo-100">
              <Mail className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">E-Mail Tracker</h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Real-time recipient engagement, opens, link clicks, and IMAP reply detection</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('change-tab', { detail: 'tracking' }))}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all cursor-pointer shrink-0"
          >
            Open Full Email Tracking
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1.5">
              <Eye className="w-4 h-4 text-emerald-600" /> Opened (Est.)
            </div>
            <div className="text-2xl font-black text-slate-900">
              {(trackingStats?.total_opened ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
              {trackingStats?.open_rate ?? 0}% open rate
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1.5">
              <MousePointerClick className="w-4 h-4 text-blue-600" /> Link Clicks
            </div>
            <div className="text-2xl font-black text-slate-900">
              {(trackingStats?.total_clicked ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-blue-600 font-semibold mt-0.5">
              {trackingStats?.click_rate ?? 0}% click rate
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1.5">
              <MessageSquareReply className="w-4 h-4 text-purple-600" /> Replies
            </div>
            <div className="text-2xl font-black text-slate-900">
              {(trackingStats?.total_replied ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-purple-600 font-semibold mt-0.5">
              {trackingStats?.reply_rate ?? 0}% reply rate
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1.5">
              <PauseCircle className="w-4 h-4 text-amber-600" /> Follow-ups Paused
            </div>
            <div className="text-2xl font-black text-slate-900">
              {(trackingStats?.followups_paused ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Auto-paused on reply
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
