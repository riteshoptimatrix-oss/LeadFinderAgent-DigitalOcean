'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { PageHeader } from '@/src/components/common/PageHeader';
import {
  Sparkles,
  MessageSquare,
  ListTodo,
  History,
  BarChart3,
  Activity,
  Server,
  ShieldAlert,
  Rocket,
  Zap,
  CheckCircle2,
  Clock,
  Send,
  Radio,
  Mail,
  Shield,
  Layers,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  Play
} from 'lucide-react';
import EmailLeadsSelection from '@/src/components/email-ai/EmailLeadsSelection';
import EmailTemplateManager from '@/src/components/email-ai/EmailTemplateManager';
import EmailCampaignWizard from '@/src/components/email-ai/EmailCampaignWizard';
import EmailCampaignHistory from '@/src/components/email-ai/EmailCampaignHistory';
import EmailAnalyticsDashboard from '@/src/components/email-ai/EmailAnalyticsDashboard';
import EmailLiveDashboard from '@/src/components/email-ai/EmailLiveDashboard';
import SMTPManager from '@/src/components/email-ai/SMTPManager';
import EmailErrorCenter from '@/src/components/email-ai/EmailErrorCenter';
import EmailErrorBoundary from '@/src/components/email-ai/EmailErrorBoundary';
import { cn } from '@/src/lib/utils';

export type Tab =
  | 'dashboard'
  | 'live'
  | 'leads'
  | 'templates'
  | 'campaigns'
  | 'history'
  | 'smtp'
  | 'errors';

const VALID_TABS: Tab[] = [
  'dashboard',
  'live',
  'leads',
  'templates',
  'campaigns',
  'history',
  'smtp',
  'errors'
];

export default function EmailAIPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Fetch summary analytics for the executive header telemetry
  const { data: analytics, isLoading: isAnalyticsLoading } = useQuery({
    queryKey: ['email-ai-header-analytics'],
    queryFn: async () => {
      try {
        const res = await api.get('/email-ai/analytics');
        return res.data;
      } catch {
        return null;
      }
    },
    refetchInterval: 4000,
    staleTime: 2000
  });

  // Fetch SMTP profiles to determine real engine dispatch status
  const { data: smtpProfiles = [], isLoading: isSmtpLoading } = useQuery({
    queryKey: ['email-ai-smtp'],
    queryFn: async () => {
      try {
        const res = await api.get('/email-ai/smtp');
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
    },
    staleTime: 10000
  });

  // Real-time synchronization event listener (supports intra-page and cross-tab sync)
  useEffect(() => {
    const handleEmailSync = () => {
      queryClient.invalidateQueries({ queryKey: ['email-ai-header-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['email-ai-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['email-ai-smtp'] });
    };
    window.addEventListener('email-ai-live-event', handleEmailSync);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('leadfinder_smtp_sync');
      channel.onmessage = () => {
        handleEmailSync();
      };
    } catch (e) {}

    return () => {
      window.removeEventListener('email-ai-live-event', handleEmailSync);
      if (channel) {
        channel.close();
      }
    };
  }, [queryClient]);

  const activeSenders = Array.isArray(smtpProfiles) ? smtpProfiles.filter((s: any) => s.is_active !== false) : [];
  const hasActiveSender = activeSenders.length > 0;

  const totalSent = analytics?.total_sent != null ? Number(analytics.total_sent) : 0;
  const totalFailed = analytics?.total_failed != null ? Number(analytics.total_failed) : 0;
  const totalProcessed = totalSent + totalFailed;
  const successRate = totalProcessed > 0 ? (Number(analytics?.success_rate) || 0) : 0;
  const avgSendTime = analytics?.avg_send_time != null ? Number(analytics.avg_send_time) : 0;
  const messagesToday = analytics?.messages_sent_today != null ? Number(analytics.messages_sent_today) : 0;

  // Handle URL search params tab sync
  useEffect(() => {
    const tabParam = searchParams.get('tab') as Tab | null;
    if (tabParam && VALID_TABS.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Handle cross-component tab change events
  useEffect(() => {
    const handleTabChange = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      const requested = String(detail);

      let mapped: string = requested;
      if (requested === 'wizard' || requested === 'campaign') mapped = 'campaigns';
      if (requested === 'analytics' || requested === 'overview') mapped = 'dashboard';
      if (requested === 'select-leads') mapped = 'leads';
      if (requested === 'senders') mapped = 'smtp';

      if (VALID_TABS.includes(mapped as Tab)) {
        setActiveTab(mapped as Tab);
      }
    };

    window.addEventListener('change-tab', handleTabChange);
    return () => window.removeEventListener('change-tab', handleTabChange);
  }, []);

  const tabs = [
    {
      id: 'dashboard',
      label: 'Analytics & Overview',
      icon: BarChart3,
      badge: null
    },
    {
      id: 'live',
      label: 'Live Dispatch Monitor',
      icon: Activity,
      badge: 'Live'
    },
    {
      id: 'leads',
      label: 'Select Target Leads',
      icon: ListTodo,
      badge: null
    },
    {
      id: 'templates',
      label: 'AI Template Studio',
      icon: Sparkles,
      badge: 'AI'
    },
    {
      id: 'campaigns',
      label: 'Campaign Wizard',
      icon: Rocket,
      badge: null
    },
    {
      id: 'history',
      label: 'Campaign History',
      icon: History,
      badge: null
    },
    {
      id: 'smtp',
      label: 'Senders & SMTP Pools',
      icon: Server,
      badge: null
    },
    {
      id: 'errors',
      label: 'Deliverability & Errors',
      icon: ShieldAlert,
      badge: null
    }
  ] as const;

  return (
    <div className="w-full flex flex-col pb-12">
      {/* Executive Command Header */}
      <div className="flex-none mb-6">
        <PageHeader
          breadcrumbs={[{ label: 'Outbound AI', href: '#' }, { label: 'Email AI Automation Studio' }]}
          title="Email AI Automation Studio"
          description="Enterprise cold email engine with hyper-personalized AI copy, multi-inbox SMTP rotation, automated deliverability safeguards, and real-time dispatch tracking."
        />

        {/* Live Engine Status Banner & Telemetry KPIs */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Engine Status Hero Strip */}
          <div className="lg:col-span-4 p-4.5 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-slate-50 border border-blue-100 text-slate-900 shadow-xs relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 z-10">
              <div className="relative flex h-3.5 w-3.5 items-center justify-center">
                {hasActiveSender ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400"></span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm tracking-wide text-slate-900">
                    {hasActiveSender
                      ? `Email Dispatcher Ready · ${activeSenders.length} Active Sender${activeSenders.length > 1 ? 's' : ''}`
                      : 'Email Dispatcher Idle · No SMTP Senders Configured'}
                  </span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider',
                      hasActiveSender
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border-amber-200'
                    )}
                  >
                    {hasActiveSender ? 'Online' : 'Setup Required'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  {hasActiveSender
                    ? 'SPF/DKIM Verified Relay · In-Flight Throttling · Randomized Human Jitter Delay'
                    : 'Add and authenticate an outbound SMTP relay in the Senders tab to dispatch campaigns.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 z-10 w-full md:w-auto">
              <button
                onClick={() => setActiveTab('campaigns')}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-sm transition-all"
              >
                <Rocket className="w-3.5 h-3.5" />
                Launch New Campaign
              </button>
              <button
                onClick={() => setActiveTab('live')}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 shadow-xs transition-all"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-600" />
                Live Dispatch
              </button>
              <button
                onClick={() => setActiveTab('smtp')}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 shadow-xs transition-all"
                title="Manage SMTP Senders"
              >
                <Server className="w-3.5 h-3.5 text-indigo-600" />
                Senders
              </button>
            </div>

            {/* Subtle background glow */}
            <div className="absolute right-0 top-0 bottom-0 w-96 bg-blue-500/5 blur-3xl pointer-events-none" />
          </div>

          {/* 4 Telemetry Metrics Cards */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Success Rate</div>
              <div className="text-lg font-black text-slate-900">
                {isAnalyticsLoading ? '...' : totalProcessed > 0 ? `${successRate.toFixed(1)}%` : '0.0%'}
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {totalProcessed > 0
                  ? `${totalSent.toLocaleString()} of ${totalProcessed.toLocaleString()} processed`
                  : 'No dispatches yet'}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Sent</div>
              <div className="text-lg font-black text-slate-900">
                {isAnalyticsLoading ? '...' : totalSent.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {messagesToday > 0 ? `${messagesToday} sent today` : '0 sent today'}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className={cn("p-3 rounded-xl", hasActiveSender ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500")}>
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sender Reputation</div>
              <div className="text-lg font-black text-slate-900">
                {isSmtpLoading ? '...' : hasActiveSender ? 'Healthy' : 'Not Connected'}
              </div>
              <div className={cn("text-[11px] font-semibold", hasActiveSender ? "text-indigo-600" : "text-slate-400")}>
                {hasActiveSender ? `${activeSenders.length} Active SMTP Profile${activeSenders.length > 1 ? 's' : ''}` : 'Configure SMTP Profile'}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Send Latency</div>
              <div className="text-lg font-black text-slate-900">
                {isAnalyticsLoading ? '...' : avgSendTime > 0 ? `${avgSendTime.toFixed(1)}s` : '0.0s'}
              </div>
              <div className="text-[11px] text-slate-500 font-medium">Smart human jitter pacing</div>
            </div>
          </div>
        </div>

        {/* Minimal Modern Tab Strip */}
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-100/70 backdrop-blur-md rounded-2xl border border-slate-200/70 inline-flex mt-6 overflow-x-auto w-full md:w-auto max-w-full">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200 text-xs md:text-sm font-semibold whitespace-nowrap',
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                )}
              >
                <Icon
                  className={cn(
                    'w-4 h-4 transition-colors',
                    isActive ? 'text-indigo-600' : 'text-slate-400'
                  )}
                />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider',
                      tab.badge === 'Live'
                        ? 'bg-emerald-100 text-emerald-700 animate-pulse'
                        : 'bg-indigo-100 text-indigo-700'
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Workspace Card */}
      <div className="flex-1 bg-white rounded-[2rem] border border-slate-200/80 shadow-sm p-6 lg:p-8 overflow-hidden flex flex-col relative ring-1 ring-slate-900/5">
        <div className="relative z-10 h-full flex flex-col">
          <EmailErrorBoundary>
            {activeTab === 'dashboard' && <EmailAnalyticsDashboard />}
            {activeTab === 'live' && <EmailLiveDashboard />}
            {activeTab === 'leads' && <EmailLeadsSelection />}
            {activeTab === 'templates' && <EmailTemplateManager />}
            {activeTab === 'campaigns' && <EmailCampaignWizard />}
            {activeTab === 'history' && <EmailCampaignHistory />}
            {activeTab === 'smtp' && <SMTPManager />}
            {activeTab === 'errors' && <EmailErrorCenter />}
          </EmailErrorBoundary>
        </div>
      </div>
    </div>
  );
}
