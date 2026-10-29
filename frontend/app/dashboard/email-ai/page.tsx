'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/src/components/common/PageHeader';
import { Sparkles, MessageSquare, ListTodo, History, BarChart3 } from 'lucide-react';
import EmailLeadsSelection from '@/src/components/email-ai/EmailLeadsSelection';
import EmailTemplateManager from '@/src/components/email-ai/EmailTemplateManager';
import EmailCampaignWizard from '@/src/components/email-ai/EmailCampaignWizard';
import EmailCampaignHistory from '@/src/components/email-ai/EmailCampaignHistory';
import EmailAnalyticsDashboard from '@/src/components/email-ai/EmailAnalyticsDashboard';
import EmailLiveDashboard from '@/src/components/email-ai/EmailLiveDashboard';
import EmailErrorBoundary from '@/src/components/email-ai/EmailErrorBoundary';
import { cn } from '@/src/lib/utils';

type Tab = 'dashboard' | 'leads' | 'templates' | 'campaigns' | 'history' | 'live';

const VALID_TABS: Tab[] = ['dashboard', 'leads', 'templates', 'campaigns', 'history', 'live'];

export default function EmailAIPage() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  useEffect(() => {
    const handleTabChange = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      const requested = String(detail);

      // Guard against invalid tab ids (e.g. legacy 'campaign'/'wizard'/'select-leads'
      // dispatches) so an unknown tab can never blank out the page.
      if (!VALID_TABS.includes(requested as Tab)) {
        console.error(`[EmailAI] Ignoring unknown change-tab request: "${requested}". Allowed: ${VALID_TABS.join(', ')}`);
        return;
      }

      const prev = activeTab;
      setActiveTab(requested as Tab);
      console.log(`[EmailAI] change-tab: ${prev} -> ${requested}`);
    };
    window.addEventListener('change-tab', handleTabChange);
    return () => window.removeEventListener('change-tab', handleTabChange);
  }, [activeTab]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, desc: 'Analytics & Overview' },
    { id: 'leads', label: 'Select Leads', icon: ListTodo, desc: 'Pick target audience' },
    { id: 'templates', label: 'AI Templates', icon: Sparkles, desc: 'Create message templates' },
    { id: 'campaigns', label: 'Campaign Wizard', icon: MessageSquare, desc: 'Launch new campaigns' },
    { id: 'history', label: 'History', icon: History, desc: 'View past runs' }
  ] as const;

  return (
    <div className="w-full flex flex-col min-h-[calc(100vh-8rem)]">
      <div className="flex-none mb-8">
        <PageHeader
          title="Email AI"
          description="Enterprise-grade Email automation with AI-powered template generation and intelligent targeting."
        />
        
        {/* Minimal Modern Tabs */}
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-100/60 backdrop-blur-md rounded-2xl border border-slate-200/60 inline-flex mt-6 overflow-x-auto w-full md:w-auto max-w-full">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={cn(
                  "flex items-center gap-2.5 px-5 py-2.5 rounded-xl transition-all duration-300 text-sm font-semibold whitespace-nowrap",
                  isActive 
                    ? "bg-white text-slate-900 shadow-sm shadow-slate-200/50 ring-1 ring-slate-200/80" 
                    : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                )}
              >
                <Icon className={cn("w-4 h-4 transition-colors", isActive ? "text-indigo-500" : "text-slate-400")} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-2xs p-5 lg:p-7 overflow-hidden flex flex-col relative">
        <div className="relative z-10 h-full flex flex-col">
          <EmailErrorBoundary>
            {activeTab === 'dashboard' && <EmailAnalyticsDashboard />}
            {activeTab === 'leads' && <EmailLeadsSelection />}
            {activeTab === 'templates' && <EmailTemplateManager />}
            {activeTab === 'campaigns' && <EmailCampaignWizard />}
            {activeTab === 'history' && <EmailCampaignHistory />}
            {activeTab === 'live' && <EmailLiveDashboard />}
          </EmailErrorBoundary>
        </div>
      </div>
    </div>
  );
}
