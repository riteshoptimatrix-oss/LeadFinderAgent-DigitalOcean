'use client';

import { useState, useEffect, useCallback } from 'react';
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
  CheckCircle2,
  Lock
} from 'lucide-react';
import { toast } from 'sonner';
import EmailLeadsSelection from '@/src/components/email-ai/EmailLeadsSelection';
import EmailTemplateManager from '@/src/components/email-ai/EmailTemplateManager';
import EmailCampaignWizard from '@/src/components/email-ai/EmailCampaignWizard';
import EmailCampaignHistory from '@/src/components/email-ai/EmailCampaignHistory';
import EmailAnalyticsDashboard from '@/src/components/email-ai/EmailAnalyticsDashboard';
import EmailLiveDashboard from '@/src/components/email-ai/EmailLiveDashboard';
import SMTPManager from '@/src/components/email-ai/SMTPManager';
import EmailErrorCenter from '@/src/components/email-ai/EmailErrorCenter';
import EmailErrorBoundary from '@/src/components/email-ai/EmailErrorBoundary';
import EmailTrackingDashboard from '@/src/components/email-ai/EmailTrackingDashboard';
import EmailTestingPanel from '@/src/components/email-ai/EmailTestingPanel';
import { PageHeader } from '@/src/components/common/PageHeader';
import { cn } from '@/src/lib/utils';
import { Eye, FlaskConical } from 'lucide-react';

export type Tab =
  | 'dashboard'
  | 'live'
  | 'tracking'
  | 'testing'
  | 'leads'
  | 'templates'
  | 'campaigns'
  | 'history'
  | 'smtp'
  | 'errors';

const VALID_TABS: Tab[] = [
  'dashboard',
  'live',
  'tracking',
  'testing',
  'leads',
  'templates',
  'campaigns',
  'history',
  'smtp',
  'errors'
];

// The 4 mandatory workflow steps in strict sequential order
const WORKFLOW_TAB_IDS: Tab[] = ['leads', 'templates', 'campaigns', 'live'];

const WORKFLOW_STEPS = [
  { id: 'leads' as Tab, label: '1. Select Leads', stepNum: 1 },
  { id: 'templates' as Tab, label: '2. Select Template', stepNum: 2 },
  { id: 'campaigns' as Tab, label: '3. Campaign Wizard', stepNum: 3 },
  { id: 'live' as Tab, label: '4. Start Campaign', stepNum: 4 },
];

export default function EmailAIPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // Track workflow prerequisites in state
  const [selectedLeadsCount, setSelectedLeadsCount] = useState<number>(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const refreshWorkflowState = useCallback(() => {
    try {
      const rawLeads = typeof window !== 'undefined' ? localStorage.getItem('email_selected_leads') : null;
      const leads = rawLeads ? JSON.parse(rawLeads) : [];
      setSelectedLeadsCount(Array.isArray(leads) ? leads.length : 0);

      const template = typeof window !== 'undefined' ? (localStorage.getItem('email_selected_template') || '') : '';
      setSelectedTemplateId(template);
    } catch {
      setSelectedLeadsCount(0);
      setSelectedTemplateId('');
    }
  }, []);

  useEffect(() => {
    refreshWorkflowState();
    const handleSync = () => refreshWorkflowState();
    window.addEventListener('storage', handleSync);
    window.addEventListener('email-ai-workflow-sync', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('email-ai-workflow-sync', handleSync);
    };
  }, [refreshWorkflowState]);

  // Strict sequential validation rule
  const validateNavigation = (targetTab: Tab, notify = true): { allowed: boolean; redirectTab?: Tab } => {
    if (targetTab === 'testing' && (userProfile?.email || '').trim().toLowerCase() !== 'khushi.optimatrix@gmail.com') {
      return { allowed: false, redirectTab: 'dashboard' };
    }
    // Non-workflow tabs (Dashboard, History, SMTP, Errors) are always accessible
    if (!WORKFLOW_TAB_IDS.includes(targetTab)) {
      return { allowed: true };
    }

    // Step 1: Target Leads is the mandatory starting point
    if (targetTab === 'leads') {
      return { allowed: true };
    }

    // Step 2: Templates requires Step 1 (at least 1 lead selected)
    let leadCount = selectedLeadsCount;
    try {
      const rawLeads = localStorage.getItem('email_selected_leads');
      const parsed = rawLeads ? JSON.parse(rawLeads) : [];
      leadCount = Array.isArray(parsed) ? parsed.length : 0;
    } catch {}

    if (leadCount === 0) {
      if (notify) {
        toast.error('Step 1 Required: Select Targeted Leads', {
          description: 'You must select at least one targeted lead before choosing an email template.'
        });
      }
      return { allowed: false, redirectTab: 'leads' };
    }

    if (targetTab === 'templates') {
      return { allowed: true };
    }

    // Step 3: Campaign Wizard requires Step 1 (leads) AND Step 2 (template selected)
    const templateId = typeof window !== 'undefined' ? localStorage.getItem('email_selected_template') : null;
    if (!templateId) {
      if (notify) {
        toast.error('Step 2 Required: Select Email Template', {
          description: 'You must choose or build an email template before entering the Campaign Wizard.'
        });
      }
      return { allowed: false, redirectTab: 'templates' };
    }

    if (targetTab === 'campaigns') {
      return { allowed: true };
    }

    // Step 4: Live Dispatch requires campaign to be launched from Wizard
    if (targetTab === 'live') {
      // If user is in the middle of creation flow and has not launched yet
      const hasActiveCampaign = typeof window !== 'undefined' && Boolean(localStorage.getItem('email_active_campaign'));
      if (!hasActiveCampaign && (activeTab === 'leads' || activeTab === 'templates' || activeTab === 'campaigns')) {
        if (notify) {
          toast.error('Step 3 Required: Complete Campaign Wizard', {
            description: 'You must complete the Campaign Wizard and click "Start Campaign" to enter live dispatch.'
          });
        }
        return { allowed: false, redirectTab: 'campaigns' };
      }
    }

    return { allowed: true };
  };

  const handleTabClick = (targetTab: Tab) => {
    refreshWorkflowState();
    const result = validateNavigation(targetTab, true);
    if (!result.allowed) {
      if (result.redirectTab) {
        setActiveTab(result.redirectTab);
      }
      return;
    }
    setActiveTab(targetTab);
  };

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
  const canAccessEmailTesting = (userProfile?.email || '').trim().toLowerCase() === 'khushi.optimatrix@gmail.com';

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
      channel = new BroadcastChannel('email-ai-sync');
      channel.onmessage = (event) => {
        if (event.data?.type === 'campaign_updated' || event.data?.type === 'stats_updated') {
          handleEmailSync();
        }
      };
    } catch {}

    return () => {
      window.removeEventListener('email-ai-live-event', handleEmailSync);
      if (channel) channel.close();
    };
  }, [queryClient]);

  // Sync tab with URL
  useEffect(() => {
    const tabParam = searchParams.get('tab') as Tab;
    if (tabParam && VALID_TABS.includes(tabParam)) {
      const check = validateNavigation(tabParam, false);
      if (check.allowed) {
        setActiveTab(tabParam);
      } else if (check.redirectTab) {
        setActiveTab(check.redirectTab);
      }
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
        refreshWorkflowState();
        const check = validateNavigation(mapped as Tab, true);
        if (check.allowed) {
          setActiveTab(mapped as Tab);
        } else if (check.redirectTab) {
          setActiveTab(check.redirectTab);
        }
      }
    };

    window.addEventListener('change-tab', handleTabChange);
    return () => window.removeEventListener('change-tab', handleTabChange);
  }, [refreshWorkflowState]);

  const activeSenders = Array.isArray(smtpProfiles)
    ? smtpProfiles.filter((s: any) => s.is_active !== false)
    : [];
  const hasActiveSender = activeSenders.length > 0;

  // Tabs configured with distinct names alongside icons
  const tabs = [
    { id: 'dashboard' as Tab, label: 'Analytics', icon: BarChart3 },
    { id: 'live' as Tab, label: 'Live Dispatch', icon: Activity, badge: 'Live' },
    { id: 'tracking' as Tab, label: 'Email Tracking', icon: Eye },
    ...(canAccessEmailTesting ? [{ id: 'testing' as Tab, label: 'Email Testing', icon: FlaskConical }] : []),
    { id: 'leads' as Tab, label: 'Target Leads', icon: ListTodo },
    { id: 'templates' as Tab, label: 'Templates', icon: Sparkles },
    { id: 'campaigns' as Tab, label: 'Campaign Wizard', icon: Rocket },
    { id: 'history' as Tab, label: 'History', icon: History },
    { id: 'smtp' as Tab, label: 'SMTP Senders', icon: Server },
    { id: 'errors' as Tab, label: 'Deliverability', icon: ShieldAlert },
  ];

  // Access restricted view
  if (!isProfileLoading && userProfile && !hasAccess) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-24 px-4 text-center animate-in fade-in">
        <div className="w-16 h-16 rounded-3xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-600 mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h2>
        <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
          Mail Sender has been disabled for your account by your administrator. Please contact your system administrator to enable access.
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

  return (
    <div className="w-full flex flex-col pb-12">

      {/* Page Header */}
      <div className="flex-none mb-5">
        <PageHeader
          breadcrumbs={[{ label: 'Outbound AI', href: '#' }, { label: 'Mail Sender' }]}
          title="Mail Sender"
          description="Cold email engine with AI-personalized copy, SMTP rotation, and real-time dispatch tracking."
        />
      </div>

      {/* ── Tab Bar + Status Pill (Icons and Names displayed together) ── */}
      <div className="border-b border-slate-200 mb-6 pb-2">
        <div className="flex items-center justify-between flex-wrap gap-3">

          {/* Navigation Tabs with Visible Icon and Name */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className={cn(
                    'relative flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer select-none',
                    isActive
                      ? 'text-blue-600 bg-blue-50/80 border border-blue-200 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border border-transparent'
                  )}
                >
                  <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-blue-600' : 'text-slate-400')} />
                  <span>{tab.label}</span>

                  {/* Live status badge */}
                  {'badge' in tab && tab.badge === 'Live' && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 ml-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Status Pill */}
          <button
            onClick={() => setActiveTab('smtp')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors duration-150 shrink-0 cursor-pointer',
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

      {/* ── Mandatory Workflow Progress Rail (Step 1 → Step 2 → Step 3 → Step 4) ── */}
      {isWorkflowTab && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-6 animate-in fade-in duration-150">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar">
              {WORKFLOW_STEPS.map((step, idx) => {
                const isActive = step.id === activeTab;
                const isStep1Done = selectedLeadsCount > 0;
                const isStep2Done = isStep1Done && Boolean(selectedTemplateId);
                const isStep3Done = isStep2Done && Boolean(typeof window !== 'undefined' && localStorage.getItem('email_active_campaign'));

                // Sequential Lock rules
                const isLocked =
                  step.id === 'templates' ? !isStep1Done :
                  step.id === 'campaigns' ? !isStep2Done :
                  step.id === 'live' ? !isStep2Done : false;

                const isCompleted =
                  step.id === 'leads' ? isStep1Done :
                  step.id === 'templates' ? isStep2Done :
                  step.id === 'campaigns' ? isStep3Done : false;

                return (
                  <div key={step.id} className="flex items-center">
                    <button
                      onClick={() => handleTabClick(step.id)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer',
                        isActive
                          ? 'bg-blue-600 text-white shadow-xs'
                          : isCompleted
                          ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                          : isLocked
                          ? 'bg-slate-100 text-slate-400 hover:bg-slate-200/80 cursor-not-allowed border border-slate-200'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      )}
                      title={isLocked ? 'This step is locked. Complete the previous steps first.' : step.label}
                    >
                      <span
                        className={cn(
                          'flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold shrink-0',
                          isActive
                            ? 'bg-white/20 text-white'
                            : isCompleted
                            ? 'bg-emerald-600 text-white'
                            : isLocked
                            ? 'bg-slate-200 text-slate-500'
                            : 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {isCompleted && !isActive ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : isLocked ? (
                          <Lock className="w-2.5 h-2.5" />
                        ) : (
                          step.stepNum
                        )}
                      </span>
                      <span>{step.label}</span>
                    </button>

                    {idx < WORKFLOW_STEPS.length - 1 && (
                      <div
                        className={cn(
                          'w-6 sm:w-10 h-0.5 mx-1 transition-colors duration-150',
                          isCompleted ? 'bg-emerald-400' : 'bg-slate-200'
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Live workflow indicator */}
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <span>
                {activeTab === 'leads' && (selectedLeadsCount > 0 ? `${selectedLeadsCount.toLocaleString()} leads selected` : 'Step 1: Select leads to begin')}
                {activeTab === 'templates' && (selectedTemplateId ? 'Step 2: Template selected' : 'Step 2: Choose a template')}
                {activeTab === 'campaigns' && 'Step 3: Configure Campaign Wizard'}
                {activeTab === 'live' && 'Step 4: Campaign Live Dispatch'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Content Area ── */}
      <div className="flex-1 animate-in fade-in duration-150">
        <EmailErrorBoundary>
          {activeTab === 'dashboard' && <EmailAnalyticsDashboard />}
          {activeTab === 'live' && <EmailLiveDashboard />}
          {activeTab === 'tracking' && <EmailTrackingDashboard />}
          {activeTab === 'testing' && canAccessEmailTesting && <EmailTestingPanel />}
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
