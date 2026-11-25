'use client';

import React from 'react';
import { Mail, Globe, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export interface ProviderVisualMeta {
  bg: string;
  text: string;
  border: string;
  shortLabel: string;
}

const PROVIDER_STYLES: Record<string, ProviderVisualMeta> = {
  gmail: { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200/80', shortLabel: 'G' },
  outlook: { bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-200/80', shortLabel: 'O' },
  yahoo: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200/80', shortLabel: 'Y!' },
  icloud: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200/80', shortLabel: 'iC' },
  proton: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200/80', shortLabel: 'PM' },
  zoho: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200/80', shortLabel: 'Z' },
  aol: { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300/80', shortLabel: 'AOL' },
  gmx: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200/80', shortLabel: 'GMX' },
  mail_com: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200/80', shortLabel: '@' },
  tuta: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200/80', shortLabel: 'T' },
  fastmail: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/80', shortLabel: 'FM' },
  yandex: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200/80', shortLabel: 'Ya' },
  rediffmail: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200/80', shortLabel: 'R' },
  qq: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200/80', shortLabel: 'QQ' },
  netease_163: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200/80', shortLabel: '163' },
  netease_126: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200/80', shortLabel: '126' },
  naver: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200/80', shortLabel: 'N' },
  seznam: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200/80', shortLabel: 'S' },
  web_de: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200/80', shortLabel: 'W' },
  mailfence: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200/80', shortLabel: 'MF' },
  hushmail: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200/80', shortLabel: 'H' },
  startmail: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300/80', shortLabel: 'SM' },
  posteo: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200/80', shortLabel: 'P' },
  mailbox_org: { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200/80', shortLabel: 'MB' },
  runbox: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200/80', shortLabel: 'RB' },
  custom: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', shortLabel: 'DNS' },
};

export function EmailProviderLogo({
  logoKey = 'custom',
  size = 'md',
  className,
}: {
  logoKey?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const style = PROVIDER_STYLES[logoKey] || PROVIDER_STYLES.custom;
  const dims =
    size === 'sm'
      ? 'w-7 h-7 text-[10px] rounded-lg'
      : size === 'lg'
      ? 'w-11 h-11 text-xs rounded-2xl'
      : 'w-9 h-9 text-[11px] rounded-xl';

  if (logoKey === 'gmail') {
    return (
      <div className={cn('flex items-center justify-center border font-black shrink-0', style.bg, style.border, dims, className)}>
        <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
          <path fill="#EA4335" d="M20 18h-2V9.25L12 13 6 9.25V18H4V6h1.2l6.8 4.25L18.8 6H20z" />
        </svg>
      </div>
    );
  }

  if (logoKey === 'outlook') {
    return (
      <div className={cn('flex items-center justify-center border font-black shrink-0', style.bg, style.border, dims, className)}>
        <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
          <path fill="#0078D4" d="M3 5.5L13.5 3v18L3 18.5V5.5zm11.5-1L21 6v12l-6.5 1.5v-15z" />
        </svg>
      </div>
    );
  }

  if (logoKey === 'custom') {
    return (
      <div className={cn('flex items-center justify-center border shrink-0', style.bg, style.text, style.border, dims, className)}>
        <Globe className="w-4 h-4" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center border font-extrabold tracking-tight shrink-0',
        style.bg,
        style.text,
        style.border,
        dims,
        className
      )}
    >
      {style.shortLabel || <Mail className="w-4 h-4" />}
    </div>
  );
}

export function EmailProviderBadge({
  providerName,
  logoKey = 'custom',
  detectionStatus,
  detectionMethod,
  showStatus = true,
  compact = false,
}: {
  providerName?: string;
  logoKey?: string;
  detectionStatus?: string;
  detectionMethod?: string;
  showStatus?: boolean;
  compact?: boolean;
}) {
  const isIdentified = detectionStatus === 'identified';
  const label = providerName || (isIdentified ? 'Verified Provider' : 'Custom Domain / Unknown');

  return (
    <div className={cn('inline-flex items-center gap-2.5', compact ? 'gap-2' : 'gap-2.5')}>
      <EmailProviderLogo logoKey={logoKey} size={compact ? 'sm' : 'md'} />
      <div className="min-w-0">
        <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">{label}</div>
        {showStatus && (
          <div className="mt-0.5 flex items-center gap-1">
            {isIdentified ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                {detectionMethod === 'mx_lookup' ? 'Identified (MX)' : 'Identified'}
              </span>
            ) : detectionStatus === 'invalid' ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-full">
                <AlertCircle className="w-2.5 h-2.5 text-rose-600" />
                Invalid Email
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
                <ShieldCheck className="w-2.5 h-2.5 text-amber-600" />
                Custom / Unknown
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
