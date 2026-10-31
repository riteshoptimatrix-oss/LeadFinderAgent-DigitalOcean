'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { PageHeader } from '@/src/components/common/PageHeader';
import { Sparkles, MessageSquare, ListTodo, History, CheckCircle2, BarChart3, Settings2, AlertCircle } from 'lucide-react';
import LeadsSelection from '@/src/components/whatsapp-ai/LeadsSelection';
import TemplateManager from '@/src/components/whatsapp-ai/TemplateManager';
import CampaignWizard from '@/src/components/whatsapp-ai/CampaignWizard';
import CampaignHistory from '@/src/components/whatsapp-ai/CampaignHistory';
import AnalyticsDashboard from '@/src/components/whatsapp-ai/AnalyticsDashboard';
import WhatsAppConfigModal from '@/src/components/whatsapp-ai/WhatsAppConfigModal';
import { cn } from '@/src/lib/utils';

type Tab = 'dashboard' | 'leads' | 'templates' | 'campaigns' | 'history';

export default function WhatsAppAIPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Fetch WhatsApp Cloud API connection status
  const { data: config } = useQuery({
    queryKey: ['wa-ai-config'],
    queryFn: async () => {
      const res = await api.get('/whatsapp-ai/config');
      return res.data;
    }
  });

  useEffect(() => {
    const tabParam = searchParams.get('tab') as Tab | null;
    if (tabParam && ['dashboard', 'leads', 'templates', 'campaigns', 'history'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, desc: 'Analytics & Overview' },
    { id: 'leads', label: 'Select Leads', icon: ListTodo, desc: 'Pick target audience' },
    { id: 'templates', label: 'AI Templates', icon: Sparkles, desc: 'Create message templates' },
    { id: 'campaigns', label: 'Campaign Wizard', icon: MessageSquare, desc: 'Launch new campaigns' },
    { id: 'history', label: 'History', icon: History, desc: 'View past runs' }
  ] as const;

  return (
    <div className="w-full flex flex-col pb-12 animate-in fade-in">
      <div className="flex-none mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <PageHeader
            title="WhatsApp AI"
            description="Enterprise-grade WhatsApp automation powered by Meta Cloud API and intelligent AI personalization."
          />

          {/* WhatsApp API Connection Pill & Button */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            {config?.is_configured ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Meta API: {config.verified_phone || 'Connected'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>API Not Configured</span>
              </div>
            )}
            <button
              onClick={() => setShowConfigModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 bg-white shadow-sm transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5 text-slate-500" />
              Settings
            </button>
          </div>
        </div>

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
                <Icon className={cn("w-4 h-4 transition-colors", isActive ? "text-blue-500" : "text-slate-400")} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 lg:p-8 overflow-hidden flex flex-col relative ring-1 ring-slate-900/5">
        <div className="relative z-10 h-full flex flex-col">
          {activeTab === 'dashboard' && <AnalyticsDashboard />}
          {activeTab === 'leads' && <LeadsSelection />}
          {activeTab === 'templates' && <TemplateManager />}
          {activeTab === 'campaigns' && <CampaignWizard />}
          {activeTab === 'history' && <CampaignHistory />}
        </div>
      </div>

      <WhatsAppConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
      />
    </div>
  );
}
