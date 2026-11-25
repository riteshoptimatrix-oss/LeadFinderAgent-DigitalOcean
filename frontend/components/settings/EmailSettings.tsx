'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { useAuthStore } from '@/src/features/auth/store';
import EmailProviderGuide, { DetectedProviderPayload } from '@/src/components/settings/EmailProviderGuide';
import { EmailProviderBadge } from '@/src/components/common/EmailProviderBadge';
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
  Radio,
  Lock,
  Sparkles,
  Server
} from 'lucide-react';
import { toast } from 'sonner';

type ConnectionStatus = 'NOT_CONFIGURED' | 'TESTING' | 'CONNECTED' | 'AUTH_FAILED' | 'CONNECTION_FAILED';

const AUTH_METHOD_OPTIONS = [
  { value: 'app_password', label: 'App Password (Recommended for 2FA)' },
  { value: 'oauth2', label: 'OAuth2 Modern Auth' },
  { value: 'smtp_auth', label: 'SMTP Username & Password' },
  { value: 'proton_bridge', label: 'Proton Mail Bridge (Localhost)' },
];

export default function EmailSettings({ setHasUnsavedChanges }: { setHasUnsavedChanges: (val: boolean) => void }) {
  const queryClient = useQueryClient();
  const authUser = useAuthStore((state) => state.user);

  const { data: userProfile } = useQuery({
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

  const accountEmail = str(userProfile?.email || authUser?.email || '').trim().toLowerCase();

  const [showPassword, setShowPassword] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [imapTestResult, setImapTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testImap, setTestImap] = useState(false);
  const [showImapConfig, setShowImapConfig] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>('NOT_CONFIGURED');
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [sampleRecipient, setSampleRecipient] = useState('');
  const [detectedProvider, setDetectedProvider] = useState<DetectedProviderPayload | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const hasInitializedRef = useRef(false);

  const [settings, setSettings] = useState({
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_pass: '',
    smtp_encryption: 'TLS',
    smtp_from_email: '',
    smtp_sender_name: '',
    imap_host: 'imap.gmail.com',
    imap_port: 993,
    imap_encryption: 'SSL',
    auth_method: 'app_password',
    detected_provider_id: 'gmail',
    daily_limit: 500,
    signature: 'Best regards,\nThe Growth Team\nwww.example.com',
    track_opens: true,
    has_password: false,
    smtp_status: 'NOT_CONFIGURED'
  });
  const [originalSettings, setOriginalSettings] = useState<any>(null);

  const { data: smtpData, isLoading } = useQuery({
    queryKey: ['smtpSettings'],
    queryFn: async () => {
      try {
        const res = await api.get('/settings/smtp');
        return res.data;
      } catch {
        const res = await api.get('/users/me');
        return res.data?.email_settings || null;
      }
    }
  });

  useEffect(() => {
    if (smtpData) {
      const effEmail = (smtpData.smtp_user || accountEmail || '').trim().toLowerCase();
      const loaded = {
        smtp_host: smtpData.smtp_host || 'smtp.gmail.com',
        smtp_port: smtpData.smtp_port || 587,
        smtp_user: effEmail,
        smtp_pass: '',
        smtp_encryption: smtpData.smtp_encryption || 'TLS',
        smtp_from_email: smtpData.smtp_from_email || smtpData.from_email || effEmail,
        smtp_sender_name: smtpData.smtp_sender_name || '',
        imap_host: smtpData.imap_host || '',
        imap_port: smtpData.imap_port || 993,
        imap_encryption: smtpData.imap_encryption || 'SSL',
        auth_method: smtpData.auth_method || 'app_password',
        detected_provider_id: smtpData.detected_provider?.provider_id || 'custom_domain',
        daily_limit: smtpData.daily_limit || 500,
        signature: smtpData.signature || 'Best regards,\nThe Growth Team\nwww.example.com',
        track_opens: smtpData.track_opens !== undefined ? smtpData.track_opens : true,
        has_password: !!smtpData.has_password,
        smtp_status: smtpData.smtp_status || 'NOT_CONFIGURED'
      };
      setSettings(loaded);
      setOriginalSettings(loaded);
      setStatus(loaded.smtp_status as ConnectionStatus);
      if (smtpData.detected_provider) {
        setDetectedProvider(smtpData.detected_provider);
      }
      if (effEmail) {
        setSampleRecipient(effEmail);
      }
      hasInitializedRef.current = true;
    } else if (accountEmail && !hasInitializedRef.current) {
      setSettings((prev) => ({
        ...prev,
        smtp_user: accountEmail,
        smtp_from_email: prev.smtp_from_email || accountEmail
      }));
      setSampleRecipient(accountEmail);
    }
  }, [smtpData, accountEmail]);

  // Dynamic provider detection whenever email changes
  useEffect(() => {
    const emailVal = settings.smtp_user.trim().toLowerCase();
    if (!emailVal || !emailVal.includes('@')) return;

    const timer = setTimeout(async () => {
      try {
        setIsDetecting(true);
        const res = await api.get('/settings/email-provider/detect', { params: { email: emailVal } });
        const payload: DetectedProviderPayload = res.data;
        setDetectedProvider(payload);

        const pInfo = payload?.provider;
        if (pInfo) {
          setSettings((prev) => {
            // Only auto-populate server settings if provider changed or host is empty/default from another provider
            const providerChanged = prev.detected_provider_id !== payload.provider_id;
            if (!providerChanged && prev.smtp_host) {
              return prev;
            }
            return {
              ...prev,
              detected_provider_id: payload.provider_id || 'custom_domain',
              smtp_host: pInfo.smtp?.supported && pInfo.smtp?.host ? pInfo.smtp.host : prev.smtp_host,
              smtp_port: pInfo.smtp?.supported && pInfo.smtp?.port ? pInfo.smtp.port : prev.smtp_port,
              smtp_encryption: pInfo.smtp?.supported && pInfo.smtp?.encryption ? pInfo.smtp.encryption : prev.smtp_encryption,
              imap_host: pInfo.imap?.supported ? pInfo.imap.host : '',
              imap_port: pInfo.imap?.port || 993,
              imap_encryption: pInfo.imap?.encryption || 'SSL',
              auth_method: pInfo.recommended_auth || prev.auth_method,
            };
          });
        }
      } catch {
        // Silent fallback if detection fails temporarily
      } finally {
        setIsDetecting(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [settings.smtp_user]);

  const handleChange = (key: string, value: any) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };
      if (key === 'smtp_port') {
        const p = parseInt(value, 10);
        if (p === 465 && prev.smtp_encryption !== 'SSL') {
          updated.smtp_encryption = 'SSL';
        } else if (p === 587 && prev.smtp_encryption !== 'TLS') {
          updated.smtp_encryption = 'TLS';
        }
      }
      if (key === 'smtp_user' && (!prev.smtp_from_email || prev.smtp_from_email === prev.smtp_user)) {
        updated.smtp_from_email = value;
      }
      return updated;
    });
  };

  useEffect(() => {
    if (originalSettings) {
      const isDirty =
        settings.smtp_pass.trim() !== '' ||
        settings.smtp_user !== originalSettings.smtp_user ||
        settings.smtp_host !== originalSettings.smtp_host ||
        settings.smtp_port !== originalSettings.smtp_port ||
        settings.smtp_encryption !== originalSettings.smtp_encryption ||
        settings.smtp_from_email !== originalSettings.smtp_from_email ||
        settings.smtp_sender_name !== originalSettings.smtp_sender_name ||
        settings.imap_host !== originalSettings.imap_host ||
        settings.imap_port !== originalSettings.imap_port ||
        settings.auth_method !== originalSettings.auth_method ||
        settings.daily_limit !== originalSettings.daily_limit ||
        settings.signature !== originalSettings.signature ||
        settings.track_opens !== originalSettings.track_opens;

      setHasUnsavedChanges(isDirty);
    }
  }, [settings, originalSettings, setHasUnsavedChanges]);

  // Test Connection Mutation
  const testMutation = useMutation({
    mutationFn: async ({ sendTest = false, recipient = '' }: { sendTest?: boolean; recipient?: string }) => {
      setTestError(null);
      setImapTestResult(null);
      setStatus('TESTING');

      const effUser = settings.smtp_user.trim().toLowerCase() || accountEmail;
      const payload = {
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        smtp_user: effUser,
        smtp_pass: settings.smtp_pass.trim() || undefined,
        smtp_encryption: settings.smtp_encryption,
        smtp_from_email: settings.smtp_from_email || effUser,
        smtp_sender_name: settings.smtp_sender_name,
        imap_host: settings.imap_host || undefined,
        imap_port: settings.imap_port || 993,
        imap_encryption: settings.imap_encryption || 'SSL',
        test_imap: testImap && !!settings.imap_host,
        send_test: sendTest,
        recipient: sendTest ? (recipient || effUser) : undefined
      };

      const res = await api.post('/settings/smtp/test', payload);
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.imap_tested) {
        setImapTestResult({
          success: !!data.imap_success,
          message: data.imap_message || (data.imap_success ? 'IMAP Verified' : 'IMAP Failed')
        });
      }
      if (data?.success) {
        setStatus('CONNECTED');
        setTestError(null);
        toast.success(data?.message || 'SMTP Connection & Authentication Verified!', {
          icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        });
        queryClient.invalidateQueries({ queryKey: ['smtpSettings'] });
        queryClient.invalidateQueries({ queryKey: ['email-ai-smtp'] });
        window.dispatchEvent(new CustomEvent('email-ai-live-event'));
        try {
          const bc = new BroadcastChannel('leadfinder_smtp_sync');
          bc.postMessage({ type: 'SMTP_UPDATED' });
          bc.close();
        } catch {}
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
    mutationFn: async (payload: any) => {
      const res = await api.put('/settings/smtp', payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success('Email Configuration & Credentials saved successfully!');
      const effEmail = data?.smtp_user || settings.smtp_user || accountEmail;
      const updated = {
        ...settings,
        smtp_user: effEmail,
        smtp_pass: '',
        has_password: !!data?.has_password,
        smtp_status: data?.smtp_status || 'CONNECTED'
      };
      setSettings(updated);
      setOriginalSettings(updated);
      if (data?.detected_provider) {
        setDetectedProvider(data.detected_provider);
      }
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['smtpSettings'] });
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
      queryClient.invalidateQueries({ queryKey: ['email-ai-smtp'] });
      window.dispatchEvent(new CustomEvent('email-ai-live-event'));
      try {
        const bc = new BroadcastChannel('leadfinder_smtp_sync');
        bc.postMessage({ type: 'SMTP_UPDATED' });
        bc.close();
      } catch {}
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.detail || 'Failed to save email configuration.';
      toast.error(msg);
    }
  });

  const executeSave = () => {
    const effUser = settings.smtp_user.trim().toLowerCase() || accountEmail;
    if (detectedProvider?.provider_id === 'tuta') {
      toast.error('Tuta Mail does not support SMTP or IMAP. Please configure a supported email provider.');
      return;
    }
    if (!settings.smtp_host) {
      toast.error('SMTP Host is required (e.g. smtp.gmail.com)');
      return;
    }
    if (!effUser) {
      toast.error('Email Address (Username) is required.');
      return;
    }
    if (!settings.smtp_pass.trim() && !settings.has_password) {
      toast.error('Please enter your Password / App Password.');
      return;
    }

    const payload = {
      smtp_host: settings.smtp_host,
      smtp_port: settings.smtp_port,
      smtp_user: effUser,
      smtp_pass: settings.smtp_pass.trim() || undefined,
      smtp_encryption: settings.smtp_encryption,
      smtp_from_email: settings.smtp_from_email.trim() || effUser,
      smtp_sender_name: settings.smtp_sender_name.trim(),
      imap_host: settings.imap_host.trim(),
      imap_port: settings.imap_port || 993,
      imap_encryption: settings.imap_encryption || 'SSL',
      auth_method: settings.auth_method,
      detected_provider_id: detectedProvider?.provider_id || settings.detected_provider_id,
      daily_limit: settings.daily_limit,
      signature: settings.signature,
      track_opens: settings.track_opens
    };

    saveMutation.mutate(payload);
  };

  useEffect(() => {
    const handleGlobalSave = (e: any) => {
      if (e.detail?.tab === 'email') {
        executeSave();
      }
    };
    window.addEventListener('save-active-settings-tab', handleGlobalSave);
    return () => window.removeEventListener('save-active-settings-tab', handleGlobalSave);
  }, [settings, originalSettings, accountEmail, detectedProvider]);

  const handleTestClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const effUser = settings.smtp_user.trim().toLowerCase() || accountEmail;
    if (detectedProvider?.provider_id === 'tuta') {
      toast.error('Tuta Mail does not support SMTP or IMAP.');
      return;
    }
    if (!settings.smtp_host) {
      toast.error('Please enter an SMTP Host');
      return;
    }
    if (!effUser) {
      toast.error('Please enter your Email Address (Username)');
      return;
    }
    if (!settings.smtp_pass.trim() && !settings.has_password) {
      toast.error('Please enter your Password / App Password');
      return;
    }
    testMutation.mutate({ sendTest: false });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    executeSave();
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
            <Loader2 className="h-3 w-3 animate-spin text-blue-500" /> Verifying...
          </span>
        );
      case 'AUTH_FAILED':
        return (
          <span className="flex items-center gap-2 text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-100">
            <XCircle className="h-3.5 w-3.5 text-rose-500" /> Auth Failed
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

  const providerInfo = detectedProvider?.provider;
  const isUnsupportedProvider = detectedProvider?.provider_id === 'tuta' || providerInfo?.smtp?.supported === false;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Email Automation</h2>
          <p className="text-sm text-slate-500 mt-1">
            Intelligent email provider auto-detection, setup guide, and SMTP/IMAP configuration for Email AI campaigns.
          </p>
        </div>
        {detectedProvider && (
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2 self-start sm:self-auto">
            <EmailProviderBadge
              providerName={detectedProvider.provider_name}
              logoKey={detectedProvider.logo_key}
              detectionStatus={detectedProvider.detection_status}
              detectionMethod={detectedProvider.detection_method}
              showStatus={true}
              compact={true}
            />
          </div>
        )}
      </div>

      {/* Responsive Two-Column Layout: Left = Provider Guide, Right = Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT SECTION — EMAIL PROVIDER GUIDE */}
        <div className="lg:col-span-5">
          <EmailProviderGuide detected={detectedProvider} email={settings.smtp_user} />
        </div>

        {/* RIGHT SECTION — EMAIL CONFIGURATION */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSave} className="space-y-6">
            <section className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/70 flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                    <Settings2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Email Configuration</h3>
                    <p className="text-[11px] text-slate-500">Auto-populated from your email provider</p>
                  </div>
                </div>
                {renderStatusBadge()}
              </div>

              <div className="p-6 space-y-5">
                {/* Auto-Detected Provider & Email Address */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Email Address (Username)
                      </label>
                      {isDetecting && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600">
                          <Loader2 className="w-3 h-3 animate-spin" /> Detecting...
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="email"
                        value={settings.smtp_user}
                        onChange={(e) => handleChange('smtp_user', e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                        placeholder="you@gmail.com"
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Changing your email dynamically detects the provider and updates defaults.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Detected Provider
                    </label>
                    <div className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 flex items-center justify-between min-h-[42px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="text-sm font-semibold text-slate-800 truncate">
                          {detectedProvider?.provider_name || 'Detecting...'}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 shrink-0">
                        {detectedProvider?.is_known_provider ? 'Auto' : 'Custom'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Authentication Method & Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Authentication Method
                    </label>
                    <div className="relative">
                      <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <select
                        value={settings.auth_method}
                        onChange={(e) => handleChange('auth_method', e.target.value)}
                        disabled={isUnsupportedProvider}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:bg-slate-50"
                      >
                        {AUTH_METHOD_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {settings.auth_method === 'oauth2' && (
                      <p className="mt-1 text-[11px] text-amber-700">
                        OAuth2 requires server client credentials; if not configured, use an App Password if supported.
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        {settings.auth_method === 'app_password' ? 'App Password' : 'Password / Token'} <span className="text-rose-500">*</span>
                      </label>
                      {settings.has_password ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Saved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                          Not Set
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={settings.smtp_pass}
                        onChange={(e) => handleChange('smtp_pass', e.target.value)}
                        disabled={isUnsupportedProvider}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-mono disabled:bg-slate-50"
                        placeholder={
                          settings.has_password
                            ? '•••••••••••••••• (Leave blank to keep saved)'
                            : 'Enter App Password or Password'
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* SMTP Host, Port & Encryption */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      SMTP Host
                    </label>
                    <div className="relative">
                      <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={settings.smtp_host}
                        onChange={(e) => handleChange('smtp_host', e.target.value)}
                        placeholder="smtp.gmail.com"
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      SMTP Port
                    </label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="number"
                        value={settings.smtp_port}
                        onChange={(e) => handleChange('smtp_port', parseInt(e.target.value, 10) || 587)}
                        placeholder="587"
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Encryption
                    </label>
                    <select
                      value={settings.smtp_encryption}
                      onChange={(e) => handleChange('smtp_encryption', e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-sm text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    >
                      <option value="TLS">TLS (STARTTLS)</option>
                      <option value="SSL">SSL / SMTPS</option>
                      <option value="NONE">None</option>
                    </select>
                  </div>
                </div>

                {/* Optional IMAP Configuration Toggle */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowImapConfig((v) => !v)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1.5"
                  >
                    <Server className="w-3.5 h-3.5" />
                    {showImapConfig ? 'Hide IMAP Settings' : 'Configure / View IMAP Settings (Inbound)'}
                  </button>

                  {showImapConfig && (
                    <div className="mt-3 p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">IMAP Host</label>
                        <input
                          type="text"
                          value={settings.imap_host}
                          onChange={(e) => handleChange('imap_host', e.target.value)}
                          placeholder="imap.gmail.com"
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs font-mono text-slate-900 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">IMAP Port</label>
                        <input
                          type="number"
                          value={settings.imap_port}
                          onChange={(e) => handleChange('imap_port', parseInt(e.target.value, 10) || 993)}
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-xs text-slate-900 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Encryption</label>
                        <select
                          value={settings.imap_encryption}
                          onChange={(e) => handleChange('imap_encryption', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white py-2 px-2.5 text-xs text-slate-900 outline-none"
                        >
                          <option value="SSL">SSL</option>
                          <option value="TLS">TLS</option>
                          <option value="NONE">None</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sender Email & Display Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Sender Email (From)
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="email"
                        value={settings.smtp_from_email}
                        onChange={(e) => handleChange('smtp_from_email', e.target.value)}
                        placeholder={settings.smtp_user || 'outreach@yourdomain.com'}
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Sender Display Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={settings.smtp_sender_name}
                        onChange={(e) => handleChange('smtp_sender_name', e.target.value)}
                        placeholder="e.g. Ritesh | OptiMatrix"
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                      />
                    </div>
                  </div>
                </div>

                {/* Test Error / IMAP Diagnostic Banners */}
                {testError && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                      <div className="font-bold">Connection or Authentication Failed</div>
                      <div className="text-rose-700 leading-relaxed">{testError}</div>
                    </div>
                  </div>
                )}

                {imapTestResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                      imapTestResult.success
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    {imapTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <span>{imapTestResult.message}</span>
                  </div>
                )}

                {/* Action Toolbar: Verify, Send Test Email, Save */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleTestClick}
                      disabled={testMutation.isPending || isUnsupportedProvider}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {testMutation.isPending && !showSampleModal ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Radio className="w-3.5 h-3.5 text-blue-600" />
                      )}
                      Test Connection
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowSampleModal(true)}
                      disabled={testMutation.isPending || isUnsupportedProvider || (!settings.has_password && !settings.smtp_pass)}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5 text-emerald-600" />
                      Send Test Email
                    </button>

                    {settings.imap_host && (
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer ml-1">
                        <input
                          type="checkbox"
                          checked={testImap}
                          onChange={(e) => setTestImap(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Also test IMAP</span>
                      </label>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={saveMutation.isPending || isUnsupportedProvider}
                    className="w-full sm:w-auto rounded-xl bg-blue-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white transition-all hover:bg-blue-700 disabled:opacity-50 shadow-sm active:scale-95 flex items-center gap-2 justify-center"
                  >
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Configuration
                  </button>
                </div>
              </div>
            </section>

            {/* Email Preferences & Safeguards */}
            <section className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="border-b border-slate-100 px-6 py-4 bg-slate-50/70">
                <h3 className="text-sm font-bold text-slate-900">Email Preferences &amp; Safeguards</h3>
              </div>

              <div className="divide-y divide-slate-100">
                <ToggleRow
                  label="Track Email Opens"
                  description="Insert a transparent 1x1 tracking pixel to monitor recipient open rates."
                  checked={settings.track_opens}
                  onChange={(v: boolean) => handleChange('track_opens', v)}
                  icon={Send}
                />
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Global Email Signature</label>
                  <textarea
                    value={settings.signature}
                    onChange={(e) => handleChange('signature', e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-sm text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Daily Sending Limit</label>
                  <div className="relative max-w-xs">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="number"
                      value={settings.daily_limit}
                      onChange={(e) => handleChange('daily_limit', parseInt(e.target.value, 10) || 500)}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">Protect your domain reputation by capping daily outbound emails.</p>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-900 mb-3">Email Templates</h4>
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-slate-400" />
                      <div>
                        <p className="text-sm font-bold text-slate-900">Cold Outreach V1</p>
                        <p className="text-xs text-slate-500">Default template for new leads.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toast.info('Manage full templates in Email AI Studio > AI Template Studio.')}
                      className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <PenTool className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </form>
        </div>
      </div>

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

function str(val: any): string {
  return typeof val === 'string' ? val : '';
}
