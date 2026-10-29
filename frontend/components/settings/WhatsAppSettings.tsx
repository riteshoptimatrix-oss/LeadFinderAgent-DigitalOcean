'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Loader2, Save, MessageSquare, Bot, Hash, Zap, FileText, PenTool, HeadphonesIcon, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/src/features/auth/store';

export default function WhatsAppSettings({ setHasUnsavedChanges }: { setHasUnsavedChanges: (val: boolean) => void }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'ADMIN';

  const [settings, setSettings] = useState({
    auto_reply: true,
    campaign_limit: 250,
    api_key: '',
    webhook_url: 'https://api.example.com/webhooks/whatsapp',
  });
  const [originalSettings, setOriginalSettings] = useState<any>(null);

  const { data: userProfile, isLoading } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const res = await api.get('/users/me');
      return res.data;
    }
  });

  useEffect(() => {
    if (userProfile && userProfile.whatsapp_settings) {
      setSettings(userProfile.whatsapp_settings);
      setOriginalSettings(userProfile.whatsapp_settings);
    }
  }, [userProfile]);

  const handleChange = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (originalSettings) {
      const isDirty = JSON.stringify(settings) !== JSON.stringify(originalSettings);
      setHasUnsavedChanges(isDirty);
    }
  }, [settings, originalSettings, setHasUnsavedChanges]);

  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.put('/users/me', { whatsapp_settings: payload });
      return res.data;
    },
    onSuccess: () => {
      toast.success('WhatsApp Settings updated successfully');
      setOriginalSettings(settings);
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    },
    onError: () => toast.error('Failed to update WhatsApp Settings')
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(settings);
  };

  const ToggleRow = ({ label, description, checked, onChange, icon: Icon }: any) => (
    <div className="flex items-center justify-between p-4 hover:bg-gray-50/50 rounded-xl transition-colors">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-4 focus:ring-green-100 ${checked ? 'bg-green-500' : 'bg-gray-200'
          }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'
            }`}
        />
      </button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // ── Non-admin users see a simple support message ──
  if (!isAdmin) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h2 className="text-xl font-bold text-gray-900">WhatsApp Automation</h2>
          <p className="text-sm text-gray-500 mt-1">Configure WhatsApp Business API, auto-replies, and message templates.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex flex-col items-center justify-center gap-5 px-8 py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-center shadow-sm">
              <MessageSquare className="h-8 w-8 text-green-500" />
            </div>
            <div className="max-w-sm">
              <h3 className="text-base font-bold text-gray-900 mb-2">WhatsApp Integration</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                WhatsApp Business API configuration is managed by your account administrator.
                Please contact support for assistance with WhatsApp setup.
              </p>
            </div>
            <a
              href="mailto:support@leadfinder.ai"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold shadow-sm transition-colors"
            >
              <HeadphonesIcon className="h-4 w-4" />
              Contact Support
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Admin view: full configuration form ──
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-gray-900">WhatsApp Automation</h2>
        <p className="text-sm text-gray-500 mt-1">Configure WhatsApp Business API, auto-replies, and message templates.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">

        {/* Connection */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50 flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-900">WhatsApp API Connection</h3>
            <span className="flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100"><span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Disconnected</span>
          </div>
          <div className="p-6 sm:p-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Meta / WhatsApp API Key</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="password"
                  value={settings.api_key}
                  onChange={(e) => handleChange('api_key', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                  placeholder="EAAL..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Webhook URL (For receiving messages)</label>
              <div className="relative">
                <Zap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  disabled
                  value={settings.webhook_url}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-500 outline-none cursor-not-allowed"
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">Configure this URL in your Meta App Dashboard to receive incoming messages.</p>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <button type="button" className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">Test Connection</button>
            </div>
          </div>
        </section>

        {/* Automation & Limits */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50">
            <h3 className="text-sm font-bold text-gray-900">Automation & Limits</h3>
          </div>

          <div className="p-4 sm:p-6 space-y-2 border-b border-gray-100">
            <ToggleRow
              label="AI Auto-Reply"
              description="Automatically respond to common inquiries using the AI model configured in AI Settings."
              checked={settings.auto_reply}
              onChange={(v: boolean) => handleChange('auto_reply', v)}
              icon={Bot}
            />
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div className="pt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Daily Campaign Limit</label>
              <div className="relative max-w-xs">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="number"
                  value={settings.campaign_limit}
                  onChange={(e) => handleChange('campaign_limit', parseInt(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">Protect your WhatsApp Business number from being flagged as spam.</p>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">Approved Message Templates</h4>
              <p className="text-xs text-gray-500 mb-4">WhatsApp requires pre-approved templates for initiating conversations outside the 24-hour window.</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-bold text-gray-900">intro_message_v1 <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 uppercase">Approved</span></p>
                      <p className="text-xs text-gray-500">Hi {"{{1}}"}, I saw your company {"{{2}}"} and wanted to connect...</p>
                    </div>
                  </div>
                  <button type="button" className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"><PenTool className="h-4 w-4" /></button>
                </div>
              </div>
              <button type="button" className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">+ Sync from Meta Dashboard</button>
            </div>
          </div>

          <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4 flex justify-end">
            <button
              type="submit"
              disabled={updateMutation.isPending || (originalSettings && JSON.stringify(settings) === JSON.stringify(originalSettings))}
              className="w-full sm:w-auto rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white transition-all hover:bg-gray-800 disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-gray-200 flex items-center gap-2 justify-center"
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save WhatsApp Config
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
