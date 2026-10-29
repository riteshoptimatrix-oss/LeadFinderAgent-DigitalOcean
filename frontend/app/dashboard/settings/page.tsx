'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Shield, Bell, Palette, Search, BrainCircuit, Users,
  Mail, MessageSquare, Code, Link2, Database, Settings2,
  Cpu, Info, Save, RotateCcw, AlertTriangle, CheckCircle2, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';

const ProfileSettings = React.lazy(() => import('@/components/settings/ProfileSettings'));
const AccountSettings = React.lazy(() => import('@/components/settings/AccountSettings'));
const SecuritySettings = React.lazy(() => import('@/components/settings/SecuritySettings'));
const AIAnalysisSettings = React.lazy(() => import('@/components/settings/AIAnalysisSettings'));
const SearchEngineSettings = React.lazy(() => import('@/components/settings/SearchEngineSettings'));
const CRMSettings = React.lazy(() => import('@/components/settings/CRMSettings'));
const EmailSettings = React.lazy(() => import('@/components/settings/EmailSettings'));
const WhatsAppSettings = React.lazy(() => import('@/components/settings/WhatsAppSettings'));
// Add others as needed

const TABS = [
  { id: 'profile', label: 'Profile', icon: User, group: 'Personal' },
  { id: 'account', label: 'Account', icon: Settings2, group: 'Personal' },
  { id: 'security', label: 'Security', icon: Shield, group: 'Personal' },
  { id: 'search', label: 'Search Engine', icon: Search, group: 'Workspace' },
  { id: 'ai', label: 'AI Analysis', icon: BrainCircuit, group: 'Workspace' },
  { id: 'crm', label: 'CRM & Pipeline', icon: Users, group: 'Workspace' },
  { id: 'email', label: 'Email Automation', icon: Mail, group: 'Integrations' },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, group: 'Integrations' },
];

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
    if (tab && TABS.some(t => t.id === tab)) {
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
    if (!searchQuery) return;
    const q = searchQuery.toLowerCase();

    // Check if query matches a tab directly
    const matchedTab = TABS.find(t => t.label.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
    if (matchedTab && matchedTab.id !== activeTab) {
      handleTabChange(matchedTab.id);
    }
  }, [searchQuery]);

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate save (we will pass handleSave down as prop later to actually trigger child submits, or child updates settings via React Query directly)
    await new Promise(r => setTimeout(r, 800));
    setIsSaving(false);
    setHasUnsavedChanges(false);
    toast.success('Settings saved successfully');
  };

  const handleReset = () => {
    setHasUnsavedChanges(false);
    toast.info('Changes discarded');
  };

  const activeGroup = useMemo(() => {
    return TABS.find(t => t.id === activeTab)?.group || 'Personal';
  }, [activeTab]);

  return (
    <div className="w-full text-gray-900 pb-16 space-y-6">
      {/* Settings Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-2xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Manage your workspace preferences and integrations.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2 pl-10 pr-4 text-sm outline-none transition-all focus:border-gray-300 focus:bg-white focus:ring-4 focus:ring-gray-100"
            />
          </div>

          <AnimatePresence>
            {hasUnsavedChanges && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3"
              >
                <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 border border-amber-100">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span className="text-xs font-semibold text-amber-700">Unsaved Changes</span>
                </div>

                <button
                  onClick={handleReset}
                  className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-gray-800 focus:outline-none focus:ring-4 focus:ring-gray-200 disabled:opacity-70"
                >
                  {isSaving ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                      <RotateCcw className="h-4 w-4" />
                    </motion.div>
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row w-full pt-6 gap-8">
        {/* Left Navigation */}
        <aside className="w-full lg:w-64 shrink-0">
          <nav className="sticky top-32 space-y-8">
            {['Personal', 'Workspace', 'Integrations'].map((group) => (
              <div key={group} className="space-y-1">
                <h3 className="px-3 text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">{group}</h3>
                {TABS.filter(t => t.group === group).map((tab) => {
                  const isActive = activeTab === tab.id;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabChange(tab.id)}
                      className={`group flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-all ${isActive
                        ? 'bg-white text-gray-900 shadow-sm border border-gray-200/60'
                        : 'text-gray-500 hover:bg-gray-100/50 hover:text-gray-900 transparent border border-transparent'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`h-4 w-4 ${isActive ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-600'}`} />
                        {tab.label}
                      </div>
                      {isActive && <ChevronRight className="h-4 w-4 text-gray-400" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* Right Settings Panel */}
        <main className="flex-1 max-w-4xl min-h-[600px]">
          <Suspense fallback={
            <div className="flex flex-col gap-6 animate-pulse">
              <div className="h-8 w-1/3 bg-gray-100 rounded-lg"></div>
              <div className="h-32 w-full bg-gray-50 border border-gray-100 rounded-2xl"></div>
              <div className="h-64 w-full bg-gray-50 border border-gray-100 rounded-2xl"></div>
            </div>
          }>
            {activeTab === 'profile' && <ProfileSettings setHasUnsavedChanges={setHasUnsavedChanges} />}
            {activeTab === 'account' && <AccountSettings setHasUnsavedChanges={setHasUnsavedChanges} />}
            {activeTab === 'security' && <SecuritySettings setHasUnsavedChanges={setHasUnsavedChanges} />}
            {activeTab === 'ai' && <AIAnalysisSettings />}
            {activeTab === 'search' && <SearchEngineSettings />}
            {activeTab === 'crm' && <CRMSettings setHasUnsavedChanges={setHasUnsavedChanges} />}
            {activeTab === 'email' && <EmailSettings setHasUnsavedChanges={setHasUnsavedChanges} />}
            {activeTab === 'whatsapp' && <WhatsAppSettings setHasUnsavedChanges={setHasUnsavedChanges} />}

            {/* Fallback for unbuilt sections */}
            {!['profile', 'account', 'security', 'ai', 'search', 'crm', 'email', 'whatsapp'].includes(activeTab) && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-16 w-16 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-center mb-6">
                  <Palette className="h-8 w-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Section Coming Soon</h3>
                <p className="text-gray-500 max-w-sm">
                  The <strong>{TABS.find(t => t.id === activeTab)?.label}</strong> settings are currently being redesigned for the new enterprise experience.
                </p>
              </div>
            )}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
