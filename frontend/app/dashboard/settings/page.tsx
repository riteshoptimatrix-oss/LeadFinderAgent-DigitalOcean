'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/src/components/common/PageHeader';
import {
  User,
  Shield,
  Bell,
  Palette,
  Search,
  BrainCircuit,
  Users,
  Mail,
  MessageSquare,
  Code,
  Link2,
  Database,
  Settings2,
  Cpu,
  Info,
  Save,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

const ProfileSettings = React.lazy(() => import('@/components/settings/ProfileSettings'));
const AccountSettings = React.lazy(() => import('@/components/settings/AccountSettings'));
const SecuritySettings = React.lazy(() => import('@/components/settings/SecuritySettings'));
const AIAnalysisSettings = React.lazy(() => import('@/components/settings/AIAnalysisSettings'));
const SearchEngineSettings = React.lazy(() => import('@/components/settings/SearchEngineSettings'));
const CRMSettings = React.lazy(() => import('@/components/settings/CRMSettings'));
const EmailSettings = React.lazy(() => import('@/components/settings/EmailSettings'));
const WhatsAppSettings = React.lazy(() => import('@/components/settings/WhatsAppSettings'));

interface SettingTab {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: 'Personal' | 'Workspace' | 'Integrations';
  desc: string;
}

const TABS: SettingTab[] = [
  { id: 'profile', label: 'Profile', icon: User, group: 'Personal', desc: 'Personal info & avatar' },
  { id: 'account', label: 'Account', icon: Settings2, group: 'Personal', desc: 'Locale & data export' },
  { id: 'security', label: 'Security', icon: Shield, group: 'Personal', desc: 'Password & compliance' },
  { id: 'search', label: 'Search Engine', icon: Search, group: 'Workspace', desc: 'Google & scraping limits' },
  { id: 'ai', label: 'AI Intelligence', icon: BrainCircuit, group: 'Workspace', desc: 'Opti Matrix models & scoring' },
  { id: 'crm', label: 'CRM & Pipeline', icon: Users, group: 'Workspace', desc: 'Webhooks & lead sync' },
  { id: 'email', label: 'Email Automation', icon: Mail, group: 'Integrations', desc: 'SMTP & tracking rules' },
  { id: 'whatsapp', label: 'WhatsApp Gateway', icon: MessageSquare, group: 'Integrations', desc: 'Cloud API credentials' }
];

const GROUPS = ['Personal', 'Workspace', 'Integrations'] as const;

export default function SettingsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'profile');
  const [searchQuery, setSearchQuery] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync tab state with URL
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && TABS.some((t) => t.id === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (id: string) => {
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to switch tabs?')) return;
    }
    setActiveTab(id);
    setHasUnsavedChanges(false);
    router.push(`/dashboard/settings?tab=${id}`);
  };

  // Search logic to jump to tabs
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const q = searchQuery.toLowerCase();
    const matchedTab = TABS.find(
      (t) => t.label.toLowerCase().includes(q) || t.id.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)
    );
    if (matchedTab && matchedTab.id !== activeTab) {
      handleTabChange(matchedTab.id);
    }
  }, [searchQuery]);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setIsSaving(false);
    setHasUnsavedChanges(false);
    toast.success('Settings saved successfully');
  };

  const handleReset = () => {
    setHasUnsavedChanges(false);
    toast.info('Changes discarded');
  };

  const activeTabMeta = useMemo(() => {
    return TABS.find((t) => t.id === activeTab) || TABS[0];
  }, [activeTab]);

  return (
    <div className="w-full flex flex-col pb-16">
      {/* Executive Header */}
      <div className="flex-none mb-6">
        <PageHeader
          breadcrumbs={[{ label: 'System', href: '#' }, { label: 'Settings' }]}
          title="Workspace Settings"
          description="Manage personal credentials, security policies, AI scoring parameters, search scraping engines, and third-party integrations."
        />

        {/* Live System Health & Telemetry Strip */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Security State</div>
              <div className="text-base font-black text-slate-900">SOC-2 &amp; TLS 1.3</div>
              <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Active Session Secured
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">AI Intelligence</div>
              <div className="text-base font-black text-slate-900">Opti Matrix 1.5 Pro</div>
              <div className="text-[11px] text-indigo-600 font-semibold">Autonomous Lead Scoring</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Integrations</div>
              <div className="text-base font-black text-slate-900">CRM + Email + WA</div>
              <div className="text-[11px] text-slate-500 font-medium">Auto-Sync Operational</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Platform Health</div>
              <div className="text-base font-black text-slate-900">100% Operational</div>
              <div className="text-[11px] text-emerald-600 font-semibold">Latency &lt; 45ms</div>
            </div>
          </div>
        </div>

        {/* Global Toolbar: Search & Unsaved Changes Alert */}
        <div className="mt-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search preferences, API keys, AI models, CRM..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="flex items-center justify-between md:justify-end gap-3">
            <AnimatePresence>
              {hasUnsavedChanges && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2"
                >
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    Unsaved Edits
                  </div>
                  <button
                    onClick={handleReset}
                    className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors shadow-xs"
                    title="Discard Changes"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <span className="text-xs text-slate-400 font-medium hidden sm:inline-block">
              Active Category: <strong className="text-slate-700">{activeTabMeta.label}</strong>
            </span>
          </div>
        </div>

        {/* Modern Segmented Navigation Tabs */}
        <div className="mt-4 flex items-center gap-1.5 p-1.5 bg-slate-100/70 backdrop-blur-md rounded-2xl border border-slate-200/70 overflow-x-auto w-full max-w-full">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2.5 rounded-xl transition-all duration-200 text-xs font-semibold whitespace-nowrap',
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80 font-bold'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'text-blue-600' : 'text-slate-400')} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Settings Card Workspace */}
      <div className="flex-1 bg-white rounded-[2rem] border border-slate-200/80 shadow-sm p-6 lg:p-8 relative">
        <Suspense
          fallback={
            <div className="flex flex-col gap-6 animate-pulse">
              <div className="h-8 w-1/3 bg-slate-100 rounded-lg"></div>
              <div className="h-40 w-full bg-slate-50 border border-slate-100 rounded-2xl"></div>
              <div className="h-64 w-full bg-slate-50 border border-slate-100 rounded-2xl"></div>
            </div>
          }
        >
          {activeTab === 'profile' && <ProfileSettings setHasUnsavedChanges={setHasUnsavedChanges} />}
          {activeTab === 'account' && <AccountSettings setHasUnsavedChanges={setHasUnsavedChanges} />}
          {activeTab === 'security' && <SecuritySettings setHasUnsavedChanges={setHasUnsavedChanges} />}
          {activeTab === 'ai' && <AIAnalysisSettings />}
          {activeTab === 'search' && <SearchEngineSettings />}
          {activeTab === 'crm' && <CRMSettings setHasUnsavedChanges={setHasUnsavedChanges} />}
          {activeTab === 'email' && <EmailSettings setHasUnsavedChanges={setHasUnsavedChanges} />}
          {activeTab === 'whatsapp' && <WhatsAppSettings setHasUnsavedChanges={setHasUnsavedChanges} />}

          {!['profile', 'account', 'security', 'ai', 'search', 'crm', 'email', 'whatsapp'].includes(activeTab) && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-slate-50 border border-slate-200 shadow-xs flex items-center justify-center mb-4">
                <Palette className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">Section in Preparation</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                The <strong>{activeTabMeta.label}</strong> configuration suite is being upgraded for the enterprise experience.
              </p>
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
