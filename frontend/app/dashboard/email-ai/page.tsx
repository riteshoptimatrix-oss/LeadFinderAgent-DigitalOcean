'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import {
  Sparkles,
  ListTodo,
  History,
  BarChart3,
  Activity,
  Server,
  ShieldAlert,
  Rocket,
  CheckCircle2
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
import { PageHeader } from '@/src/components/common/PageHeader';
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

// The 4 workflow-specific tabs that show the progress rail
const WORKFLOW_TAB_IDS: Tab[] = ['leads', 'templates', 'campaigns', 'live'];

const WORKFLOW_STEPS = [
  { id: 'leads' as Tab, label: 'Leads' },
  { id: 'templates' as Tab, label: 'Templates' },
  { id: 'campaigns' as Tab, label: 'Campaign' },
  { id: 'live' as Tab, label: 'Live' },
];

export default function EmailAIPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Verify user-wise access permission
  const { data: userProfile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      try {
        const res = await api.get('/users/me');
        return res.data;
      } catch {
        return null;
      }
    },
    refetchOnWindowFocus: false,
  });

  const isAdmin =
    userProfile?.role?.toLowerCase() === 'admin' ||
    userProfile?.is_superuser === true;

  const hasAccess = isAdmin || userProfile?.email_automation_access === true;

  // Fetch SMTP profiles for the status pill
  const { data: smtpProfiles = [] } = useQuery({
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

  // Real-time sync listener
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
      channel.onmessage = () => handleEmailSync();
    } catch (e) {}

    return () => {
      window.removeEventListener('email-ai-live-event', handleEmailSync);
      if (channel) channel.close();
    };
  }, [queryClient]);

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

  const activeSenders = Array.isArray(smtpProfiles)
    ? smtpProfiles.filter((s: any) => s.is_active !== false)
    : [];
  const hasActiveSender = activeSenders.length > 0;

  const tabs = [
    { id: 'dashboard' as Tab, label: 'Analytics & Overview', icon: BarChart3 },
    { id: 'live' as Tab, label: 'Live Dispatch', icon: Activity, badge: 'Live' },
    { id: 'leads' as Tab, label: 'Target Leads', icon: ListTodo },
    { id: 'templates' as Tab, label: 'AI Templates', icon: Sparkles },
    { id: 'campaigns' as Tab, label: 'Campaign Wizard', icon: Rocket },
    { id: 'history' as Tab, label: 'Campaign History', icon: History },
    { id: 'smtp' as Tab, label: 'Senders & SMTP', icon: Server },
    { id: 'errors' as Tab, label: 'Deliverability & Errors', icon: ShieldAlert },
  ] as const;

  // Access restricted
  if (!isProfileLoading && userProfile && !hasAccess) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-24 px-4 text-center animate-in fade-in">
        <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h2>
        <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
          Email Automation has been disabled for your account by your administrator. Please contact your system administrator to enable access.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const isWorkflowTab = WORKFLOW_TAB_IDS.includes(activeTab);
  const workflowStepIndex = WORKFLOW_TAB_IDS.indexOf(activeTab);

  return (
    <div className="w-full flex flex-col pb-12">

      {/* Page Header */}
      <div className="flex-none mb-5">
        <PageHeader
          breadcrumbs={[{ label: 'Outbound AI', href: '#' }, { label: 'Email Automation' }]}
          title="Email Automation"
          description="Cold email engine with AI-personalized copy, SMTP rotation, and real-time dispatch tracking."
        />
      </div>

      {/* ── Tab Bar + Status Pill ── */}
      <div className="border-b border-slate-200 mb-6">
        <div className="flex items-center justify-between pb-0">

          {/* Icon-only tabs */}
          <div className="flex items-center gap-0.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <div key={tab.id} className="relative group">
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-150',
                      isActive
                        ? 'text-blue-600'
                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                    )}
                    aria-label={tab.label}
                  >
                    <Icon className="w-5 h-5" />

                    {/* Live badge dot */}
                    {'badge' in tab && tab.badge === 'Live' && (
                      <span className="absolute top-2 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    )}

                    {/* Active underline */}
                    {isActive && (
                      <span className="absolute bottom-0 inset-x-1 h-0.5 bg-blue-600 rounded-t-full" />
                    )}
                  </button>

                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 px-2.5 py-1 bg-slate-900 text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50 shadow-lg">
                    {tab.label}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Status Pill */}
          <button
            onClick={() => setActiveTab('smtp')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors duration-150 mb-1',
              hasActiveSender
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
            )}
            title="Manage SMTP senders"
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                hasActiveSender ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              )}
            />
            {hasActiveSender
              ? `${activeSenders.length} Active Sender${activeSenders.length > 1 ? 's' : ''}`
              : 'Setup Required'}
          </button>
        </div>
      </div>

      {/* ── Workflow Progress Rail (Leads → Templates → Campaign → Live) ── */}
      {isWorkflowTab && (
        <div className="flex items-center gap-0 mb-6 animate-in fade-in duration-150">
          {WORKFLOW_STEPS.map((step, idx) => {
            const stepTabIndex = WORKFLOW_TAB_IDS.indexOf(step.id);
            const isActive = step.id === activeTab;
            const isCompleted = workflowStepIndex > stepTabIndex;

            return (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => {
                    if (isCompleted) setActiveTab(step.id);
                  }}
                  disabled={!isCompleted && !isActive}
                  className={cn(
                    'flex items-center gap-1.5 text-xs font-semibold transition-colors duration-150 px-1',
                    isActive
                      ? 'text-blue-600 cursor-default'
                      : isCompleted
                      ? 'text-emerald-600 hover:text-emerald-700 cursor-pointer'
                      : 'text-slate-400 cursor-default'
                  )}
                >
                  <span
                    className={cn(
                      'flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold border transition-colors duration-150 shrink-0',
                      isActive
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : isCompleted
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-600'
                        : 'bg-white border-slate-200 text-slate-400'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  {step.label}
                </button>

                {idx < WORKFLOW_STEPS.length - 1 && (
                  <div
                    className={cn(
                      'w-8 h-px mx-1 transition-colors duration-150',
                      isCompleted ? 'bg-emerald-300' : 'bg-slate-200'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Main Content Area ── */}
      <div className="flex-1 animate-in fade-in duration-150">
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
  );
}
