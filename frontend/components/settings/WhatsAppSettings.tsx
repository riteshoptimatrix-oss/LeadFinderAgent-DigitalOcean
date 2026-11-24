'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import {
  Loader2,
  Save,
  MessageSquare,
  Key,
  Hash,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Zap,
  Eye,
  EyeOff,
  ExternalLink,
  Phone
} from 'lucide-react';
import { toast } from 'sonner';

export default function WhatsAppSettings({ setHasUnsavedChanges }: { setHasUnsavedChanges: (val: boolean) => void }) {
  const queryClient = useQueryClient();
  const [showToken, setShowToken] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const [formData, setFormData] = useState({
    access_token: '',
    phone_number_id: '',
    waba_id: '',
    verify_token: 'leadfinder_verify_token'
  });
  const [originalFormData, setOriginalFormData] = useState<any>(null);

  const [verifyStatus, setVerifyStatus] = useState<{
    tested: boolean;
    valid: boolean;
    details?: any;
    error?: string;
  }>({ tested: false, valid: false });

  // Fetch current user's isolated WhatsApp Cloud API configuration
  const { data: config, isLoading } = useQuery({
    queryKey: ['wa-ai-config'],
    queryFn: async () => {
      const res = await api.get('/whatsapp-ai/config');
      return res.data;
    }
  });

  useEffect(() => {
    if (config) {
      const loaded = {
        access_token: '', // Never preload plaintext secret token
        phone_number_id: config.phone_number_id || '',
        waba_id: config.waba_id || '',
        verify_token: config.verify_token || 'leadfinder_verify_token'
      };
      setFormData(loaded);
      setOriginalFormData(loaded);

      if (config.is_configured && config.verified_phone) {
        setVerifyStatus({
          tested: true,
          valid: true,
          details: {
            display_phone_number: config.verified_phone,
            verified_name: config.display_name,
            quality_rating: config.quality_rating
          }
        });
      } else if (!config.is_configured) {
        setVerifyStatus({ tested: false, valid: false });
      }
    }
  }, [config]);

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => {
      const updated = { ...prev, [key]: value };
      if (originalFormData) {
        const isDirty =
          updated.access_token.trim() !== '' ||
          updated.phone_number_id !== originalFormData.phone_number_id ||
          updated.waba_id !== originalFormData.waba_id ||
          updated.verify_token !== originalFormData.verify_token;
        setHasUnsavedChanges(isDirty);
      }
      return updated;
    });
  };

  // Live test verification against Meta Cloud API
  const testMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {};
      if (formData.access_token.trim()) payload.access_token = formData.access_token.trim();
      if (formData.phone_number_id.trim()) payload.phone_number_id = formData.phone_number_id.trim();

      const res = await api.post('/whatsapp-ai/config/verify', payload);
      return res.data;
    },
    onSuccess: (data) => {
      if (data.valid) {
        setVerifyStatus({ tested: true, valid: true, details: data.details });
        toast.success(`Connected! Verified phone: ${data.details.display_phone_number || 'Valid'}`);
      } else {
        setVerifyStatus({ tested: true, valid: false, error: data.error });
        toast.error(data.error || 'Connection verification failed');
      }
    },
    onError: (err: any) => {
      const errDetail = err?.response?.data?.detail || 'Failed to verify WhatsApp credentials';
      setVerifyStatus({ tested: true, valid: false, error: errDetail });
      toast.error(errDetail);
    }
  });

  // Save credentials mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {};
      if (formData.access_token.trim()) payload.access_token = formData.access_token.trim();
      if (formData.phone_number_id.trim()) payload.phone_number_id = formData.phone_number_id.trim();
      if (formData.waba_id.trim()) payload.waba_id = formData.waba_id.trim();
      if (formData.verify_token.trim()) payload.verify_token = formData.verify_token.trim();

      const res = await api.post('/whatsapp-ai/config', payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('WhatsApp API credentials saved successfully!');
      setOriginalFormData({ ...formData, access_token: '' });
      setFormData((prev) => ({ ...prev, access_token: '' }));
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['wa-ai-config'] });
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });

      if (data.verified_phone) {
        setVerifyStatus({
          tested: true,
          valid: true,
          details: {
            display_phone_number: data.verified_phone,
            verified_name: data.display_name,
            quality_rating: data.quality_rating
          }
        });
      }
    },
    onError: (err: any) => {
      const errDetail = err?.response?.data?.detail || 'Failed to save WhatsApp configuration';
      toast.error(errDetail);
    }
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.phone_number_id.trim()) {
      toast.error('WhatsApp Phone Number ID is required.');
      return;
    }
    saveMutation.mutate();
  };

  const handleCopyWebhook = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const fullUrl = `${origin}/api/v1/whatsapp-ai/webhook`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedWebhook(true);
    toast.success('Webhook URL copied to clipboard');
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 text-xs">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
        <span>Loading your WhatsApp Gateway configuration...</span>
      </div>
    );
  }

  const webhookFullUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1/whatsapp-ai/webhook`
    : '/api/v1/whatsapp-ai/webhook';

  const isConnected = verifyStatus.valid || (config?.is_configured && !verifyStatus.tested);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">WhatsApp Gateway Configuration</h2>
        <p className="text-sm text-slate-500 mt-1">
          Connect your official Meta WhatsApp Business Cloud API (WABA) credentials to automate outbound messages and campaigns.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* Connection Status Banner */}
        <section className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <MessageSquare className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Meta Cloud API Connection</h3>
            </div>

            {isConnected ? (
              <span className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200/80">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Connected: {verifyStatus.details?.display_phone_number || config?.verified_phone || 'Meta Cloud API Active'}
              </span>
            ) : (
              <span className="flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200/80">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Not Configured / Disconnected
              </span>
            )}
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Meta Access Token */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Meta Permanent Access Token <span className="text-rose-500">*</span>
                </label>
                {config?.masked_token && !formData.access_token && (
                  <span className="text-[11px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                    Configured: {config.masked_token}
                  </span>
                )}
              </div>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showToken ? 'text' : 'password'}
                  value={formData.access_token}
                  onChange={(e) => handleChange('access_token', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-xs sm:text-sm font-mono text-slate-900 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  placeholder={config?.masked_token ? 'Leave blank to preserve current saved token' : 'EAAL... (System User Permanent Token)'}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                From Meta Business Suite: Business Settings &gt; System Users &gt; Generate Token with{' '}
                <code className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded font-bold">whatsapp_business_messaging</code> permissions.
              </p>
            </div>

            {/* Grid: Phone ID & WABA ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Phone Number ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Phone Number ID <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={formData.phone_number_id}
                    onChange={(e) => handleChange('phone_number_id', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs sm:text-sm font-mono text-slate-900 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                    placeholder="e.g. 104829104812345"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Found in Meta Developer Console &gt; WhatsApp &gt; API Setup &gt; Phone Number ID.
                </p>
              </div>

              {/* WABA ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  WhatsApp Business Account ID (WABA ID)
                </label>
                <div className="relative">
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={formData.waba_id}
                    onChange={(e) => handleChange('waba_id', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-xs sm:text-sm font-mono text-slate-900 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                    placeholder="e.g. 109283019283456"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Required to sync approved Meta message templates into your templates manager.
                </p>
              </div>
            </div>

            {/* Webhook Configuration Section */}
            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Meta Webhook Integration</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Webhook URL */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Callback URL (Webhook)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webhookFullUrl}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 px-3 text-xs font-mono text-slate-600 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyWebhook}
                      className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1 text-xs shrink-0 cursor-pointer"
                      title="Copy URL"
                    >
                      {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Paste this in your Meta App Dashboard under WhatsApp &gt; Configuration &gt; Webhook.
                  </p>
                </div>

                {/* Webhook Verify Token */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Verify Token</label>
                  <input
                    type="text"
                    value={formData.verify_token}
                    onChange={(e) => handleChange('verify_token', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-xs font-mono text-slate-900 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                    placeholder="leadfinder_verify_token"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Must match the verify token configured in your Meta Developer App.
                  </p>
                </div>
              </div>
            </div>

            {/* Test Connection Button & Status */}
            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending || (!formData.phone_number_id.trim() && !config?.phone_number_id)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  {testMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Testing Connection...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Test Connection
                    </>
                  )}
                </button>

                {verifyStatus.tested && verifyStatus.valid && (
                  <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Verified: {verifyStatus.details?.verified_name || verifyStatus.details?.display_phone_number} (Quality: {verifyStatus.details?.quality_rating || 'N/A'})
                  </span>
                )}

                {verifyStatus.tested && !verifyStatus.valid && (
                  <span className="text-xs font-semibold text-rose-600 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                    {verifyStatus.error || 'Connection test failed'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Footer Save Action */}
          <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4 flex justify-end">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="w-full sm:w-auto rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 text-xs font-bold transition-all disabled:opacity-50 shadow-sm active:scale-95 flex items-center gap-2 justify-center cursor-pointer"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving Configuration...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save WhatsApp Config
                </>
              )}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
