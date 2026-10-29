import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Mail, CheckCircle2, XCircle, Clock, Activity, Calendar } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

export default function EmailAnalyticsDashboard() {
  const { data: analytics } = useQuery({
    queryKey: ['email-ai-analytics'],
    queryFn: async () => {
      const res = await api.get('/email-ai/analytics');
      return res.data;
    },
    refetchInterval: 15000 // Update every 15s
  });

  if (!analytics) return <div className="animate-pulse space-y-6">
    <div className="h-32 bg-slate-200 rounded-2xl"></div>
    <div className="grid grid-cols-4 gap-4"><div className="h-24 bg-slate-200 rounded-xl"></div></div>
  </div>;

  return (
    <div className="space-y-6">
      {/* Top Main Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between overflow-hidden relative">
          <div className="absolute right-0 top-0 w-32 h-32 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-full blur-3xl -mr-10 -mt-10"></div>
          <div>
            <div className="text-slate-500 font-bold uppercase tracking-wider text-xs mb-2">Total Emails Sent</div>
            <div className="text-5xl font-black text-slate-900 tracking-tight">{analytics.total_sent}</div>
            <div className="mt-2 text-sm text-green-600 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Successfully Delivered
            </div>
          </div>
          <div className="p-4 bg-indigo-50 rounded-2xl">
            <Mail className="w-10 h-10 text-indigo-600" />
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-3xl shadow-lg flex items-center justify-between relative overflow-hidden">
          <div className="absolute right-0 top-0 w-32 h-32 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl -mr-10 -mt-10"></div>
          <div>
            <div className="text-slate-400 font-bold uppercase tracking-wider text-xs mb-2">Success Rate</div>
            <div className="text-5xl font-black text-white tracking-tight">{analytics.success_rate.toFixed(1)}%</div>
            <div className="mt-2 text-sm text-slate-300 font-medium">Out of {analytics.total_sent + analytics.total_failed} processed</div>
          </div>
          
          <div className="relative">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle className="text-slate-800" strokeWidth="8" stroke="currentColor" fill="transparent" r="40" cx="48" cy="48"/>
              <circle 
                className="text-blue-500" 
                strokeWidth="8" 
                strokeDasharray={40 * 2 * Math.PI} 
                strokeDashoffset={40 * 2 * Math.PI - (analytics.success_rate / 100) * 40 * 2 * Math.PI} 
                strokeLinecap="round" 
                stroke="currentColor" 
                fill="transparent" 
                r="40" cx="48" cy="48"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500 mb-2 font-semibold text-xs uppercase">
            <Calendar className="w-4 h-4" /> Today
          </div>
          <div className="text-2xl font-bold text-slate-900">{analytics.messages_sent_today}</div>
        </div>
        
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-slate-500 mb-2 font-semibold text-xs uppercase">
            <Calendar className="w-4 h-4" /> This Week
          </div>
          <div className="text-2xl font-bold text-slate-900">{analytics.messages_sent_week}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-red-500 mb-2 font-semibold text-xs uppercase">
            <XCircle className="w-4 h-4" /> Failures
          </div>
          <div className="text-2xl font-bold text-slate-900">{analytics.total_failed}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center gap-2 text-indigo-500 mb-2 font-semibold text-xs uppercase">
            <Clock className="w-4 h-4" /> Avg Send Time
          </div>
          <div className="text-2xl font-bold text-slate-900">{analytics.avg_send_time.toFixed(1)}s</div>
        </div>
      </div>
      
      {/* Charts */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-900 mb-6">Delivery Trend (Last 14 Days)</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.daily_trends}>
              <defs>
                <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
              <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <RechartsTooltip />
              <Area type="monotone" dataKey="sent" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorSent)" />
              <Area type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorFailed)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
