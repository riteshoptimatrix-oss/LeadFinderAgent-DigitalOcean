'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import {
  Loader2,
  Save,
  Mail,
  PenTool,
  Hash,
  Settings2,
  FileText,
  Send,
  Shield,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  EyeOff,
  User,
  Radio
} from 'lucide-react';
import { toast } from 'sonner';

type ConnectionStatus = 'NOT_CONFIGURED' | 'TESTING' | 'CONNECTED' | 'AUTH_FAILED' | 'CONNECTION_FAILED';

export default function EmailSettings({ setHasUnsavedChanges }: { setHasUnsavedChanges: (val: boolean) => void }) {
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('NOT_CONFIGURED');
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [sampleRecipient, setSampleRecipient] = useState('');

  const [settings, setSettings] = useState({
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    smtp_encryption: 'TLS',
    smtp_from_email: '',
    smtp_sender_name: '',
    daily_limit: 500,
    signature: 'Best regards,\nThe Growth Team\nwww.example.com',
    track_opens: true,
    has_password: false,
    smtp_status: 'NOT_CONFIGURED'
  });
  const [originalSettings, setOriginalSettings] = useState<any>(null);

  // Fetch SMTP Settings from dedicated centralized endpoint
  const { data: smtpData, isLoading } = useQuery({
    queryKey: ['smtpSettings'],
    queryFn: async () => {
      try {
        const res = await api.get('/settings/smtp');
        return res.data;
      } catch {
        // Fallback to /users/me if /settings/smtp fails
        const res = await api.get('/users/me');
        return res.data?.email_settings || null;
      }
    }
  });

  useEffect(() => {
    if (smtpData) {
      const loaded = {
        smtp_host: smtpData.smtp_host || 'smtp.gmail.com',
        smtp_port: smtpData.smtp_port || 587,
        smtp_user: smtpData.smtp_user || '',
        smtp_pass: smtpData.smtp_pass || (smtpData.has_password ? '••••••••••••••••' : ''),
        smtp_encryption: smtpData.smtp_encryption || 'TLS',
        smtp_from_email: smtpData.smtp_from_email || smtpData.from_email || '',
        smtp_sender_name: smtpData.smtp_sender_name || '',
        daily_limit: smtpData.daily_limit || 500,
        signature: smtpData.signature || 'Best regards,\nThe Growth Team\nwww.example.com',
        track_opens: smtpData.track_opens !== undefined ? smtpData.track_opens : true,
        has_password: !!smtpData.has_password,
        smtp_status: smtpData.smtp_status || 'NOT_CONFIGURED'
      };
      setSettings(loaded);
      setOriginalSettings(loaded);
      setStatus(loaded.smtp_status as ConnectionStatus);
      if (loaded.smtp_user) {
        setSampleRecipient(loaded.smtp_user);
      }
    }
  }, [smtpData]);

  const handleChange = (key: string, value: any) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };
      // Convenience auto-switch for port and encryption
      if (key === 'smtp_port') {
        const p = parseInt(value, 10);
        if (p === 465 && prev.smtp_encryption !== 'SSL') {
          updated.smtp_encryption = 'SSL';
        } else if (p === 587 && prev.smtp_encryption !== 'TLS') {
          updated.smtp_encryption = 'TLS';
        }
      }
      return updated;
    });
  };

  useEffect(() => {
    if (originalSettings) {
      const isDirty = JSON.stringify(settings) !== JSON.stringify(originalSettings);
      setHasUnsavedChanges(isDirty);
    }
  }, [settings, originalSettings, setHasUnsavedChanges]);

  // Test Connection Mutation
  const testMutation = useMutation({
    mutationFn: async ({ sendTest = false, recipient = '' }: { sendTest?: boolean; recipient?: string }) => {
      setTestError(null);
      setStatus('TESTING');

      const payload = {
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        smtp_user: settings.smtp_user,
        smtp_pass: settings.smtp_pass,
        smtp_encryption: settings.smtp_encryption,
        smtp_from_email: settings.smtp_from_email || settings.smtp_user,
        smtp_sender_name: settings.smtp_sender_name,
        send_test: sendTest,
        recipient: sendTest ? (recipient || settings.smtp_user) : undefined
      };

      const res = await api.post('/settings/smtp/test', payload);
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.success) {
        setStatus('CONNECTED');
        setTestError(null);
        toast.success(data?.message || 'SMTP Connection & Authentication Verified!', {
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        });
        queryClient.invalidateQueries({ queryKey: ['smtpSettings'] });
        queryClient.invalidateQueries({ queryKey: ['email-ai-smtp'] });
        // Real-time synchronization event for open Email AI tabs
        window.dispatchEvent(new CustomEvent('email-ai-live-event'));
        try {
          const bc = new BroadcastChannel('leadfinder_smtp_sync');
          bc.postMessage({ type: 'SMTP_UPDATED' });
          bc.close();
        } catch (e) {}
      } else {
        const nextStatus = data?.status === 'AUTH_FAILED' ? 'AUTH_FAILED' : 'CONNECTION_FAILED';
        setStatus(nextStatus);
        const err = data?.error || data?.message || 'SMTP Connection Test Failed';
        setTestError(err);
        toast.error(err);
      }
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail || error?.message || 'Connection test failed.';
      const isAuth = detail.toLowerCase().includes('auth') || detail.includes('535') || detail.toLowerCase().includes('password');
      const nextStatus = isAuth ? 'AUTH_FAILED' : 'CONNECTION_FAILED';
      setStatus(nextStatus);
      setTestError(detail);
      toast.error(detail);
    }
  });

  // Save Configuration Mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: typeof settings) => {
      const res = await api.put('/settings/smtp', payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('SMTP Configuration saved and active across Email AI Studio!');
      const updated = {
        ...settings,
        has_password: true,
        smtp_pass: '••••••••••••••••'
      };
      setSettings(updated);
      setOriginalSettings(updated);
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['smtpSettings'] });
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      queryClient.invalidateQueries({ queryKey: ['email-ai-smtp'] });
      // Notify other open tabs without manual refresh
      window.dispatchEvent(new CustomEvent('email-ai-live-event'));
      try {
        const bc = new BroadcastChannel('leadfinder_smtp_sync');
        bc.postMessage({ type: 'SMTP_UPDATED' });
        bc.close();
      } catch (e) {}
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.detail || 'Failed to save SMTP configuration.';
      toast.error(msg);
    }
  });

  const handleTestClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!settings.smtp_host) {
      toast.error('Please enter an SMTP Host (e.g. smtp.gmail.com)');
      return;
    }
    if (!settings.smtp_user) {
      toast.error('Please enter your Username (Email)');
      return;
    }
    if (!settings.smtp_pass && !settings.has_password) {
      toast.error('Please enter your SMTP App Password');
      return;
    }
    testMutation.mutate({ sendTest: false });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings.smtp_host || !settings.smtp_user) {
      toast.error('SMTP Host and Username are required');
      return;
    }
    saveMutation.mutate(settings);
  };

  const renderStatusBadge = () => {
    switch (status) {
      case 'CONNECTED':
        return (
          <span className="flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Connected
          </span>
        );
      case 'TESTING':
        return (
          <span className="flex items-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
            <Loader2 className="h-3 w-3 animate-spin text-blue-500" /> Verifying Connection...
          </span>
        );
      case 'AUTH_FAILED':
        return (
          <span className="flex items-center gap-2 text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-100">
            <XCircle className="h-3.5 w-3.5 text-rose-500" /> Authentication Failed
          </span>
        );
      case 'CONNECTION_FAILED':
        return (
          <span className="flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Connection Failed
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span> Not Configured
          </span>
        );
    }
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
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-100 ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Email Automation</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure SMTP servers, outreach limits, and global email templates. Configured SMTP is automatically utilized across Email AI campaigns.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {/* SMTP Server Configuration */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50 flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-900">SMTP Server Configuration</h3>
            {renderStatusBadge()}
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            {/* Host & Port */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">SMTP Host</label>
                <div className="relative">
                  <Settings2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={settings.smtp_host}
                    onChange={(e) => handleChange('smtp_host', e.target.value)}
                    placeholder="smtp.gmail.com"
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Port</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="number"
                    value={settings.smtp_port}
                    onChange={(e) => handleChange('smtp_port', parseInt(e.target.value) || 587)}
                    placeholder="587"
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                  />
                </div>
              </div>
            </div>

            {/* Username & App Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Username (Email)</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    value={settings.smtp_user}
                    onChange={(e) => handleChange('smtp_user', e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                    placeholder="sales@example.com"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">App Password</label>
                  {settings.has_password && (
                    <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                      Encrypted at rest
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={settings.smtp_pass}
                    onChange={(e) => handleChange('smtp_pass', e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100 font-mono"
                    placeholder="••••••••••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  For Gmail, use a 16-character App Password (Google Security &gt; 2-Step Verification &gt; App passwords).
                </p>
              </div>
            </div>

            {/* Encryption & Sender Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Encryption Mode</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <select
                    value={settings.smtp_encryption}
                    onChange={(e) => handleChange('smtp_encryption', e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                  >
                    <option value="TLS">TLS (STARTTLS - Port 587)</option>
                    <option value="SSL">SSL / SMTPS (Port 465)</option>
                    <option value="NONE">None / Plaintext (Port 25/2525)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sender Email (From)</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    value={settings.smtp_from_email}
                    onChange={(e) => handleChange('smtp_from_email', e.target.value)}
                    placeholder={settings.smtp_user || 'outreach@yourdomain.com'}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Sender Display Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={settings.smtp_sender_name}
                    onChange={(e) => handleChange('smtp_sender_name', e.target.value)}
                    placeholder="e.g. Ritesh | OptiMatrix"
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                  />
                </div>
              </div>
            </div>

            {/* Test Error Banner (Actionable diagnostic) */}
            {testError && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <div className="font-bold">SMTP Connection or Authentication Failed</div>
                  <div className="text-rose-700 leading-relaxed">{testError}</div>
                </div>
              </div>
            )}

            {/* Test Connection Button & Actions */}
            <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestClick}
                  disabled={testMutation.isPending}
                  className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors"
                >
                  {testMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      Testing Connection...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </button>
                <span className="text-gray-300">·</span>
                <button
                  type="button"
                  onClick={() => setShowSampleModal(true)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Send Sample Test Email
                </button>
              </div>

              <div className="text-xs text-gray-400">
                {status === 'CONNECTED' && '✓ Ready for Email AI Outbound Campaigns'}
              </div>
            </div>
          </div>
        </section>

        {/* Content & Limits */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50">
            <h3 className="text-sm font-bold text-gray-900">Content &amp; Limits</h3>
          </div>

          <div className="p-4 sm:p-6 space-y-2 border-b border-gray-100">
            <ToggleRow
              label="Track Email Opens"
              description="Inject a tracking pixel into outbound emails to measure engagement."
              checked={settings.track_opens}
              onChange={(v: boolean) => handleChange('track_opens', v)}
              icon={Send}
            />
          </div>

          <div className="p-6 sm:p-8 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Global Email Signature</label>
              <div className="relative">
                <textarea
                  value={settings.signature}
                  onChange={(e) => handleChange('signature', e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100 font-mono"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Daily Sending Limit</label>
              <div className="relative max-w-xs">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="number"
                  value={settings.daily_limit}
                  onChange={(e) => handleChange('daily_limit', parseInt(e.target.value) || 500)}
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all focus:border-gray-300 focus:ring-4 focus:ring-gray-100"
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">Protect your domain reputation by capping daily outbound emails.</p>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <h4 className="text-sm font-bold text-gray-900 mb-4">Email Templates</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-bold text-gray-900">Cold Outreach V1</p>
                      <p className="text-xs text-gray-500">Default template for new leads.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <PenTool className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toast.info('Manage full templates in Email AI Studio > AI Template Studio.')}
                className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
              >
                + Create Template
              </button>
            </div>
          </div>

          <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-4 flex justify-end">
            <button
              type="submit"
              disabled={saveMutation.isPending || (originalSettings && JSON.stringify(settings) === JSON.stringify(originalSettings))}
              className="w-full sm:w-auto rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white transition-all hover:bg-blue-700 disabled:opacity-50 shadow-sm active:scale-95 flex items-center gap-2 justify-center"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Email Config
            </button>
          </div>
        </section>
      </form>

      {/* Sample Email Test Modal */}
      {showSampleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Dispatch Sample Test Email</h3>
            <p className="text-xs text-slate-500 mb-4">
              Send a test delivery to confirm real inbox reception through your configured relay.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Recipient Email
                </label>
                <input
                  type="email"
                  value={sampleRecipient}
                  onChange={(e) => setSampleRecipient(e.target.value)}
                  placeholder="your-personal@email.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSampleModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={testMutation.isPending || !sampleRecipient}
                  onClick={() => {
                    testMutation.mutate({ sendTest: true, recipient: sampleRecipient });
                    setShowSampleModal(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                >
                  {testMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send Test Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
