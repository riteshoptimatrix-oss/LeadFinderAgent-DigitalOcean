'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { 
  X, Key, Hash, ShieldCheck, CheckCircle2, AlertCircle, 
  Loader2, Copy, Check, ExternalLink, Zap, HelpCircle, Eye, EyeOff
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';

interface WhatsAppConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WhatsAppConfigModal({ isOpen, onClose }: WhatsAppConfigModalProps) {
  const queryClient = useQueryClient();
  const [showToken, setShowToken] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const [formData, setFormData] = useState({
    access_token: '',
    phone_number_id: '',
    waba_id: '',
    verify_token: 'leadfinder_verify_token'
  });

  const [verifyStatus, setVerifyStatus] = useState<{
    tested: boolean;
    valid: boolean;
    details?: any;
    error?: string;
  }>({ tested: false, valid: false });

  // Fetch current config
  const { data: config, isLoading } = useQuery({
    queryKey: ['wa-ai-config'],
    queryFn: async () => {
      const res = await api.get('/whatsapp-ai/config');
      return res.data;
    },
    enabled: isOpen
  });

  useEffect(() => {
    if (config) {
      setFormData({
        access_token: '', // Don't prefill plaintext token
        phone_number_id: config.phone_number_id || '',
        waba_id: config.waba_id || '',
        verify_token: config.verify_token || 'leadfinder_verify_token'
      });
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
      }
    }
  }, [config]);

  // Test credentials mutation
  const testMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {};
      if (formData.access_token) payload.access_token = formData.access_token;
      if (formData.phone_number_id) payload.phone_number_id = formData.phone_number_id;

      const res = await api.post('/whatsapp-ai/config/verify', payload);
      return res.data;
    },
    onSuccess: (data) => {
      if (data.valid) {
        setVerifyStatus({ tested: true, valid: true, details: data.details });
        toast.success(`Connected! Verified phone: ${data.details.display_phone_number || 'Valid'}`);
      } else {
        setVerifyStatus({ tested: true, valid: false, error: data.error });
        toast.error(data.error || 'Connection failed');
      }
    },
    onError: (err: any) => {
      const errDetail = err?.response?.data?.detail || 'Failed to verify connection';
      setVerifyStatus({ tested: true, valid: false, error: errDetail });
      toast.error(errDetail);
    }
  });

  // Save credentials mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {};
      if (formData.access_token) payload.access_token = formData.access_token;
      if (formData.phone_number_id) payload.phone_number_id = formData.phone_number_id;
      if (formData.waba_id) payload.waba_id = formData.waba_id;
      if (formData.verify_token) payload.verify_token = formData.verify_token;

      const res = await api.post('/whatsapp-ai/config', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wa-ai-config'] });
      toast.success('WhatsApp Cloud API configuration saved!');
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to save configuration');
    }
  });

  const fullWebhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1/whatsapp-ai/webhook`
    : '/api/v1/whatsapp-ai/webhook';

  const copyWebhook = () => {
    navigator.clipboard.writeText(fullWebhookUrl);
    setCopiedWebhook(true);
    toast.success('Webhook URL copied to clipboard');
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">
              WhatsApp Cloud API Setup
            </h3>
            <p className="text-sm text-slate-500">
              Official Meta Business Cloud API configuration for automated outreach
            </p>
          </div>
        </div>

        {/* Live Status Pill */}
        {config?.is_configured ? (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <div className="text-sm font-bold text-emerald-900">
                  Connected: {config.display_name || 'WhatsApp Business'}
                </div>
                <div className="text-xs text-emerald-700">
                  Verified Sender: {config.verified_phone || config.phone_number_id}
                  {config.quality_rating && ` • Quality: ${config.quality_rating}`}
                </div>
              </div>
            </div>
            <span className="text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">
              Active
            </span>
          </div>
        ) : (
          <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="text-xs text-amber-800">
              WhatsApp Cloud API is currently <strong>not configured</strong>. Enter your Meta credentials below to enable sending messages.
            </div>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-5">
          {/* Access Token */}
          <div>
            <label className="flex items-center justify-between text-sm font-semibold text-slate-800 mb-1.5">
              <span className="flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-600" />
                Meta System User Access Token
              </span>
              <a
                href="https://developers.facebook.com/apps"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
              >
                Meta Developer Portal <ExternalLink className="w-3 h-3" />
              </a>
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={formData.access_token}
                onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                placeholder={config?.masked_token ? `Current: ${config.masked_token}` : "EAAL..."}
                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm bg-slate-50 text-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Permanent System User Token generated from Meta Business Suite with `whatsapp_business_messaging` permission.
            </p>
          </div>

          {/* Phone Number ID & WABA ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-1.5">
                <Hash className="w-4 h-4 text-emerald-600" />
                Phone Number ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.phone_number_id}
                onChange={(e) => setFormData({ ...formData, phone_number_id: e.target.value })}
                placeholder="e.g. 106598234857291"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm bg-slate-50 text-slate-900"
              />
              <p className="text-[11px] text-slate-400 mt-1">From Meta App Dashboard → WhatsApp → API Setup.</p>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-1.5">
                <Hash className="w-4 h-4 text-slate-400" />
                WhatsApp Business Account ID (WABA ID)
              </label>
              <input
                type="text"
                value={formData.waba_id}
                onChange={(e) => setFormData({ ...formData, waba_id: e.target.value })}
                placeholder="e.g. 109283746501928"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm bg-slate-50 text-slate-900"
              />
              <p className="text-[11px] text-slate-400 mt-1">Required for syncing approved message templates.</p>
            </div>
          </div>

          {/* Webhook Settings Section */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-blue-500" /> Webhook Setup (Delivery & Read Receipts + Opt-Out)
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Callback URL (Paste into Meta Dashboard)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={fullWebhookUrl}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-700 select-all"
                />
                <button
                  type="button"
                  onClick={copyWebhook}
                  className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors"
                >
                  {copiedWebhook ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedWebhook ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Verify Token</label>
              <input
                type="text"
                value={formData.verify_token}
                onChange={(e) => setFormData({ ...formData, verify_token: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-mono text-xs text-slate-700"
              />
            </div>
          </div>

          {/* Verification Result Box */}
          {verifyStatus.tested && (
            <div className={cn(
              "p-4 rounded-2xl border text-sm transition-all animate-in fade-in",
              verifyStatus.valid ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
            )}>
              {verifyStatus.valid ? (
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Meta Graph API Verified Successfully!</div>
                    <div className="text-xs mt-1 text-emerald-700">
                      Display Name: {verifyStatus.details?.verified_name || 'Registered'}<br />
                      Phone Number: {verifyStatus.details?.display_phone_number || formData.phone_number_id}<br />
                      Quality Rating: {verifyStatus.details?.quality_rating || 'GREEN'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Verification Failed</div>
                    <div className="text-xs mt-1 text-red-700 font-mono">
                      {verifyStatus.error}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || (!formData.access_token && !config?.masked_token) || !formData.phone_number_id}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {testMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-emerald-600" />}
              Test Connection
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending || !formData.phone_number_id}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-2"
              >
                {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Configuration
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
