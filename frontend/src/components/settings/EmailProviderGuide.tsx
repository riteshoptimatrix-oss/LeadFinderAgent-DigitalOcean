'use client';

import React from 'react';
import {
  BookOpen,
  ShieldAlert,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Key,
  Server,
  HelpCircle,
  Lock
} from 'lucide-react';
import { EmailProviderBadge } from '@/src/components/common/EmailProviderBadge';

export interface DetectedProviderPayload {
  email?: string;
  domain?: string;
  provider_id?: string;
  provider_name?: string;
  logo_key?: string;
  detection_status?: string;
  detection_method?: string;
  mx_hosts?: string[];
  is_known_provider?: boolean;
  provider?: {
    id: string;
    name: string;
    logo_key: string;
    smtp: { supported: boolean; host: string; port: number; encryption: string };
    imap: { supported: boolean; host: string; port: number; encryption: string };
    auth_methods: string[];
    recommended_auth: string;
    app_password_supported: boolean;
    oauth2_supported: boolean;
    requires_paid_plan: boolean;
    requires_bridge: boolean;
    security_note: string;
    setup_steps: string[];
    troubleshooting: Array<{ issue: string; solution: string }>;
    docs_url?: string;
  };
}

const AUTH_LABEL_MAP: Record<string, string> = {
  app_password: 'App Password (Recommended)',
  oauth2: 'OAuth2 Modern Auth',
  smtp_auth: 'SMTP Username & Password',
  proton_bridge: 'Proton Mail Bridge (Localhost)',
  unsupported: 'SMTP / IMAP Not Supported',
};

export default function EmailProviderGuide({
  detected,
  email,
}: {
  detected: DetectedProviderPayload | null;
  email: string;
}) {
  const provider = detected?.provider;
  const providerName = detected?.provider_name || provider?.name || 'Custom Domain / Unknown';
  const logoKey = detected?.logo_key || provider?.logo_key || 'custom';
  const status = detected?.detection_status || 'unknown_custom_domain';
  const recommendedAuth = provider?.recommended_auth || 'smtp_auth';
  const isUnsupported = recommendedAuth === 'unsupported' || provider?.smtp?.supported === false;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col h-full">
      {/* Guide Header */}
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Email Provider Guide</h3>
            <p className="text-[11px] text-slate-500">Dynamic setup instructions</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5 flex-1">
        {/* Provider Identity Card */}
        <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 space-y-3">
          <EmailProviderBadge
            providerName={providerName}
            logoKey={logoKey}
            detectionStatus={status}
            detectionMethod={detected?.detection_method}
            showStatus={true}
          />
          {detected?.mx_hosts && detected.mx_hosts.length > 0 && (
            <div className="text-[11px] text-slate-500 flex items-center justify-between gap-2">
              <span>Primary MX:</span>
              <span className="font-mono text-slate-700 truncate max-w-[200px]">{detected.mx_hosts[0]}</span>
            </div>
          )}
          <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-500 font-medium">Detected Email:</span>
            <span className="font-mono font-semibold text-slate-800 truncate max-w-[220px]">
              {email || detected?.email || 'Not specified'}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-500 font-medium">Recommended Auth:</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/70 font-semibold text-[11px]">
              <Key className="w-3 h-3" />
              {AUTH_LABEL_MAP[recommendedAuth] || recommendedAuth}
            </span>
          </div>
        </div>

        {/* Security / Plan / Bridge Warning Banner */}
        {provider?.security_note && (
          <div
            className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
              isUnsupported
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : provider.requires_paid_plan || provider.requires_bridge || provider.oauth2_supported
                ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                : 'bg-blue-50/70 border-blue-200/80 text-blue-900'
            }`}
          >
            {isUnsupported ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="font-bold">
                {isUnsupported
                  ? 'Protocol Restriction'
                  : provider.requires_bridge
                  ? 'Bridge Required'
                  : provider.requires_paid_plan
                  ? 'Paid Plan / Account Requirement'
                  : 'Security Requirement'}
              </div>
              <p>{provider.security_note}</p>
            </div>
          </div>
        )}

        {/* Protocol Defaults Summary */}
        {provider && (provider.smtp?.supported || provider.imap?.supported) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
            <div className="p-3 rounded-xl border border-slate-200/70 bg-white">
              <div className="flex items-center gap-1.5 font-bold text-slate-700 mb-1">
                <Server className="w-3.5 h-3.5 text-blue-600" />
                SMTP (Outbound)
              </div>
              {provider.smtp.supported ? (
                <div className="font-mono text-slate-600 space-y-0.5">
                  <div className="truncate">{provider.smtp.host || 'Custom host'}</div>
                  <div>
                    Port {provider.smtp.port} · {provider.smtp.encryption}
                  </div>
                </div>
              ) : (
                <div className="text-rose-600 font-semibold">Not supported directly</div>
              )}
            </div>

            <div className="p-3 rounded-xl border border-slate-200/70 bg-white">
              <div className="flex items-center gap-1.5 font-bold text-slate-700 mb-1">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                IMAP (Inbound)
              </div>
              {provider.imap.supported ? (
                <div className="font-mono text-slate-600 space-y-0.5">
                  <div className="truncate">{provider.imap.host || 'Custom host'}</div>
                  <div>
                    Port {provider.imap.port} · {provider.imap.encryption}
                  </div>
                </div>
              ) : (
                <div className="text-rose-600 font-semibold">Not supported directly</div>
              )}
            </div>
          </div>
        )}

        {/* Step-by-step Setup Instructions */}
        {provider?.setup_steps && provider.setup_steps.length > 0 && (
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Step-by-Step Setup Guide
            </h4>
            <ol className="space-y-2.5">
              {provider.setup_steps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-600 leading-relaxed">
                  <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Common Errors & Troubleshooting */}
        {provider?.troubleshooting && provider.troubleshooting.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
              Common Errors &amp; Solutions
            </h4>
            <div className="space-y-2">
              {provider.troubleshooting.map((item, idx) => (
                <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-[11px]">
                  <div className="font-bold text-slate-800">{item.issue}</div>
                  <div className="text-slate-600 mt-0.5">{item.solution}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Official Documentation Link */}
        {provider?.docs_url && (
          <div className="pt-2">
            <a
              href={provider.docs_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
            >
              <span>Official {providerName} Documentation</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
