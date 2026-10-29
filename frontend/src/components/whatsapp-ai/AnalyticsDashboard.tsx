'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { 
  BarChart3, 
  Send, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  TrendingUp,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface Analytics {
  success_rate: number;
  failure_rate: number;
  avg_send_time: number;
  total_campaigns: number;
  messages_sent_today: number;
  messages_sent_week: number;
  messages_sent_month: number;
  total_sent: number;
  total_failed: number;
}

export default function AnalyticsDashboard() {
  const { data: analytics, isLoading } = useQuery<Analytics>({
    queryKey: ['wa-ai-analytics'],
    queryFn: async () => {
      const res = await api.get('/whatsapp-ai/analytics');
      return res.data;
    },
    refetchInterval: 10000 // Refetch every 10s
  });

  if (isLoading) {
    return (
      <div className="flex-1 animate-pulse flex flex-col gap-6">
        <div className="h-32 bg-slate-100 rounded-3xl" />
        <div className="grid grid-cols-3 gap-6">
          <div className="h-40 bg-slate-100 rounded-3xl" />
          <div className="h-40 bg-slate-100 rounded-3xl" />
          <div className="h-40 bg-slate-100 rounded-3xl" />
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Messages Today",
      value: analytics?.messages_sent_today || 0,
      icon: Send,
      trend: "+12%", // Mock trend
      trendUp: true,
      color: "blue"
    },
    {
      title: "Success Rate",
      value: `${analytics?.success_rate.toFixed(1) || 0}%`,
      icon: CheckCircle2,
      trend: "Optimal",
      trendUp: true,
      color: "green"
    },
    {
      title: "Avg Send Time",
      value: `${analytics?.avg_send_time.toFixed(1) || 0}s`,
      icon: Clock,
      trend: "Fast",
      trendUp: true,
      color: "purple"
    }
  ];

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-blue-600" />
          Campaign Analytics
        </h2>
        <p className="text-slate-500 mt-1">Overview of your WhatsApp automation performance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {statCards.map((stat, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm relative overflow-hidden group">
            <div className={cn(
              "absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10 transition-transform group-hover:scale-150",
              stat.color === 'blue' ? "bg-blue-500" :
              stat.color === 'green' ? "bg-green-500" : "bg-purple-500"
            )} />
            <div className="flex justify-between items-start mb-4">
              <div className={cn(
                "p-3 rounded-2xl",
                stat.color === 'blue' ? "bg-blue-50 text-blue-600" :
                stat.color === 'green' ? "bg-green-50 text-green-600" : "bg-purple-50 text-purple-600"
              )}>
                <stat.icon className="w-6 h-6" />
              </div>
              <span className={cn(
                "text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1",
                stat.trendUp ? "text-green-700 bg-green-100" : "text-amber-700 bg-amber-100"
              )}>
                {stat.trendUp && <TrendingUp className="w-3 h-3" />}
                {stat.trend}
              </span>
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</div>
              <div className="text-sm font-medium text-slate-500">{stat.title}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-slate-400" />
            Volume Overview
          </h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium text-slate-500">This Week</span>
                <span className="font-bold text-slate-900">{analytics?.messages_sent_week || 0} msgs</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: '60%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium text-slate-500">This Month</span>
                <span className="font-bold text-slate-900">{analytics?.messages_sent_month || 0} msgs</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-blue-400 h-2 rounded-full" style={{ width: '85%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium text-slate-500">All Time</span>
                <span className="font-bold text-slate-900">{analytics?.total_sent || 0} msgs</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-slate-800 h-2 rounded-full" style={{ width: '100%' }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
          <h3 className="text-lg font-bold text-slate-900 absolute top-6 left-6">Delivery Health</h3>
          
          <div className="relative w-48 h-48 mt-8">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="96" cy="96" r="80"
                className="stroke-slate-100"
                strokeWidth="20"
                fill="none"
              />
              <circle
                cx="96" cy="96" r="80"
                className="stroke-green-500 transition-all duration-1000"
                strokeWidth="20"
                fill="none"
                strokeDasharray="502"
                strokeDashoffset={502 - (502 * (analytics?.success_rate || 0)) / 100}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-slate-900">{analytics?.success_rate.toFixed(0) || 0}%</span>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Delivered</span>
            </div>
          </div>
          
          <div className="mt-8 flex gap-8 w-full px-8">
            <div className="flex-1 text-center">
              <div className="text-xl font-bold text-green-600">{analytics?.total_sent || 0}</div>
              <div className="text-xs font-medium text-slate-500 mt-1">Successful</div>
            </div>
            <div className="w-px bg-slate-200"></div>
            <div className="flex-1 text-center">
              <div className="text-xl font-bold text-red-600">{analytics?.total_failed || 0}</div>
              <div className="text-xs font-medium text-slate-500 mt-1">Failed</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
