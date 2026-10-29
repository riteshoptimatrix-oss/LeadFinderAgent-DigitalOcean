'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Building2,
  Phone,
  Mail,
  Globe,
  Star,
  Shield,
  Gauge,
  Wrench,
  CircleAlert,
  Lightbulb,
  Layers,
} from 'lucide-react';
import { AnalysisLead, getLeadScore, getLeadEmails, getLeadPhones, getLeadLocation, getLeadPriority } from './leadAnalysis';
import { ScoreBadge, getScoreTier } from './ScoreBadge';
import { cn } from '@/src/lib/utils';

interface AnalysisDrawerProps {
  lead: AnalysisLead | null;
  open: boolean;
  onClose: () => void;
}

function DrawerSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 border-b border-slate-100">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-slate-400">{icon}</span>
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, fallback = '—' }: { label: string; value?: string | number | null; fallback?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[13px] text-slate-400">{label}</span>
      <span className="text-[13px] font-semibold text-slate-700 text-right truncate">
        {value === undefined || value === null || value === '' ? fallback : value}
      </span>
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1', className)}>
      {children}
    </span>
  );
}

export function AnalysisDrawer({ lead, open, onClose }: AnalysisDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const name = lead?.name || lead?.business_name || 'Unnamed Business';
  const score = lead ? getLeadScore(lead) : 0;
  const tier = getScoreTier(score);
  const priority = lead ? getLeadPriority(lead) : 'Normal';
  const emails = lead ? getLeadEmails(lead) : [];
  const phones = lead ? getLeadPhones(lead) : [];
  const ai = lead?.ai_analysis;

  const missingData: string[] = [];
  if (emails.length === 0) missingData.push('Email');
  if (phones.length === 0) missingData.push('Phone');
  if (!lead?.website) missingData.push('Website');
  if (!lead?.category) missingData.push('Category');
  if (!lead || !getLeadLocation(lead)) missingData.push('Address');

  const techItems = [
    ai?.cms && ['CMS', ai.cms],
    ai?.frontend && ['Frontend', ai.frontend],
    ai?.backend && ['Backend', ai.backend],
    ai?.hosting && ['Hosting', ai.hosting],
    ai?.analytics && ['Analytics', ai.analytics],
  ].filter(Boolean) as [string, string][];

  return (
    <AnimatePresence>
      {open && lead && (
        <motion.div
          className="fixed inset-0 z-50"
          initial="closed"
          animate="open"
          exit="closed"
          aria-hidden={!open}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
            variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`Analysis details for ${name}`}
            className="absolute top-0 right-0 bottom-0 w-full max-w-[480px] bg-white shadow-2xl flex flex-col"
            variants={{ open: { x: 0 }, closed: { x: '100%' } }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold shrink-0">
                  {name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-slate-900 truncate">{name}</h3>
                  <p className="text-xs text-slate-400 truncate">
                    {[lead?.category, getLeadLocation(lead)].filter(Boolean).join(' · ') || 'Business'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close analysis details"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {/* AI Score */}
              <DrawerSection icon={<Layers className="w-4 h-4" />} title="AI Score">
                <div className="flex items-center gap-3">
                  <ScoreBadge score={score} size="md" />
                  <span className={cn('text-xs font-semibold', tier.text)}>
                    {tier.label} performing website
                  </span>
                </div>
              </DrawerSection>

              {/* Business Info */}
              <DrawerSection icon={<Building2 className="w-4 h-4" />} title="Business Info">
                <div className="space-y-1">
                  {lead?.google_rating ? (
                    <div className="flex items-center justify-between gap-3 py-1">
                      <span className="text-[13px] text-slate-400">Rating</span>
                      <span className="text-[13px] font-semibold text-amber-500">★ {lead.google_rating}</span>
                    </div>
                  ) : null}
                  <div className="flex items-start justify-between gap-3 py-1">
                    <span className="text-[13px] text-slate-400 shrink-0">Address</span>
                    <span className="text-[13px] font-semibold text-slate-700 text-right">
                      {getLeadLocation(lead) || lead?.address || '—'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3 py-1">
                    <span className="text-[13px] text-slate-400 shrink-0">Phone</span>
                    <span className="text-[13px] font-semibold text-slate-700 text-right">{phones[0] || '—'}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3 py-1">
                    <span className="text-[13px] text-slate-400 shrink-0">Email</span>
                    <span className="text-[13px] font-semibold text-slate-700 text-right break-all">{emails[0] || '—'}</span>
                  </div>
                  {lead?.website && (
                    <a
                      href={lead.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 py-1 group"
                    >
                      <span className="text-[13px] text-slate-400">Website</span>
                      <span className="text-[13px] font-semibold text-blue-600 group-hover:underline inline-flex items-center gap-1 max-w-[60%] truncate">
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        {lead.website.replace(/^https?:\/\//, '')}
                      </span>
                    </a>
                  )}
                </div>
              </DrawerSection>

              {/* Website Analysis */}
              <DrawerSection icon={<Globe className="w-4 h-4" />} title="Website Analysis">
                <div className="space-y-1">
                  <Row label="HTTP Status" value={ai?.http_status?.toString()} />
                  <Row label="SSL" value={ai?.ssl === null || ai?.ssl === undefined ? null : ai.ssl ? 'Enabled' : 'Missing'} />
                  <Row label="Response Time" value={ai?.response_time != null ? `${ai.response_time}ms` : null} />
                </div>
              </DrawerSection>

              {/* SEO */}
              <DrawerSection icon={<Gauge className="w-4 h-4" />} title="SEO Score">
                <Row label="SEO Score" value={ai?.seo_score != null ? `${ai.seo_score}/100` : null} />
                {(ai?.top_seo_issues?.length ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ai!.top_seo_issues!.slice(0, 4).map((issue, i) => (
                      <Pill key={i} className="bg-amber-50 text-amber-600 ring-amber-100">
                        {issue}
                      </Pill>
                    ))}
                  </div>
                )}
              </DrawerSection>

              {/* Performance */}
              <DrawerSection icon={<Gauge className="w-4 h-4" />} title="Performance">
                <Row label="Performance Score" value={ai?.performance_score != null ? `${ai.performance_score}/100` : null} />
              </DrawerSection>

              {/* Technology */}
              {techItems.length > 0 && (
                <DrawerSection icon={<Wrench className="w-4 h-4" />} title="Technology">
                  <div className="space-y-1">
                    {techItems.map(([label, value]) => (
                      <Row key={label} label={label} value={value} />
                    ))}
                  </div>
                </DrawerSection>
              )}

              {/* Missing Data */}
              <DrawerSection icon={<CircleAlert className="w-4 h-4" />} title="Missing Data">
                {missingData.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {missingData.map((item) => (
                      <Pill key={item} className="bg-red-50 text-red-600 ring-red-100">
                        {item}
                      </Pill>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-slate-400">No missing contact data found.</p>
                )}
              </DrawerSection>

              {/* Recommendation */}
              <DrawerSection icon={<Lightbulb className="w-4 h-4" />} title="Recommendation">
                {(ai?.recommendations?.length ?? 0) > 0 ? (
                  <ul className="space-y-1.5">
                    {ai!.recommendations!.slice(0, 5).map((rec, i) => (
                      <li key={i} className="text-[13px] text-slate-600 flex gap-2">
                        <span className="text-blue-500 shrink-0">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-slate-400">No recommendations available.</p>
                )}
              </DrawerSection>

              {/* Priority & Revenue */}
              <DrawerSection icon={<Star className="w-4 h-4" />} title="Priority">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3 py-1">
                    <span className="text-[13px] text-slate-400">Priority</span>
                    <Pill
                      className={
                        priority === 'High'
                          ? 'bg-red-50 text-red-600 ring-red-100'
                          : priority === 'Normal'
                            ? 'bg-blue-50 text-blue-600 ring-blue-100'
                            : 'bg-slate-50 text-slate-500 ring-slate-200'
                      }
                    >
                      {priority}
                    </Pill>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-1">
                    <span className="text-[13px] text-slate-400">Potential Revenue</span>
                    <span className="text-[13px] font-semibold text-slate-700">
                      {ai?.business_opportunity?.estimated_project_value != null
                        ? `$${ai.business_opportunity.estimated_project_value.toLocaleString()}`
                        : '—'}
                    </span>
                  </div>
                </div>
              </DrawerSection>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-200 shrink-0">
              <div className="flex gap-2 text-[11px] font-medium text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" /> AI Verified
                </span>
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" /> {phones.length} contact
                </span>
                <span className="inline-flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" /> {emails.length} email
                </span>
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
