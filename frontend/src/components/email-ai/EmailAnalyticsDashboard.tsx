import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Mail, CheckCircle2, XCircle, Clock, Activity, Calendar, Rocket, ArrowRight, ShieldCheck } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

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

  useEffect(() => {
    const handleEmailEvent = () => {
      queryClient.invalidateQueries({ queryKey: ['email-ai-analytics'] });
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
  const dailyTrends = Array.isArray(analytics?.daily_trends) ? analytics.daily_trends : [];

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

      {/* Charts */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Delivery Trend (Last 14 Days)</h3>
            <p className="text-xs text-slate-400 mt-0.5">Sent vs failed message trajectory across campaigns</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-indigo-600 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Sent
            </span>
            <span className="flex items-center gap-1.5 text-rose-500 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Failed
            </span>
          </div>
        </div>

        {dailyTrends.length > 0 ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrends}>
                <defs>
                  <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <RechartsTooltip />
                <Area type="monotone" dataKey="sent" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorSent)" />
                <Area type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorFailed)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-56 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400">
            <Mail className="w-10 h-10 text-slate-300 mb-2 stroke-1" />
            <p className="font-semibold text-slate-700 text-sm">No Delivery Trend Data Yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              As campaigns are executed, daily sending volume and delivery performance charts will populate here automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
