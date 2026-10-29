'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, TrendingUp, TrendingDown, AlertTriangle, Shield, Palette, Activity } from 'lucide-react';

interface TopLead {
  lead_id: string;
  name?: string;
  website?: string;
  city?: string;
  country?: string;
  industry?: string;
  email?: string;
  phone?: string;
  website_score?: number;
  seo_score?: number;
  performance_score?: number;
  ui_score?: number;
  ux_score?: number;
  security_score?: number;
  accessibility_score?: number;
  business_opportunity_score?: number;
  lead_priority_score?: number;
  lcp_ms?: number;
  seo_issues_count?: number;
  security_issues_count?: number;
  ui_issues_count?: number;
  ux_issues_count?: number;
}

interface TopOpportunitiesData {
  highest_opportunity: TopLead[];
  worst_websites: TopLead[];
  best_websites: TopLead[];
  fastest_websites: TopLead[];
  slowest_websites: TopLead[];
  highest_seo_problems: TopLead[];
  security_risks: TopLead[];
  ui_problems: TopLead[];
  ux_problems: TopLead[];
}

function ScoreBadge({ score, invert = false }: { score?: number; invert?: boolean }) {
  if (score == null) return <span className="text-slate-400 text-xs">—</span>;
  const color = invert
    ? (score <= 20 ? 'bg-emerald-100 text-emerald-700' : score <= 40 ? 'bg-blue-100 text-blue-700' : score <= 60 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700')
    : (score >= 80 ? 'bg-emerald-100 text-emerald-700' : score >= 60 ? 'bg-blue-100 text-blue-700' : score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700');
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${color}`}>
      {score}
    </span>
  );
}

function LeadRow({ lead, rank, scoreField, label, invert }: {
  lead: TopLead; rank: number; scoreField: keyof TopLead; label: string; invert?: boolean;
}) {
  const score = lead[scoreField] as number | undefined;
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
      <td className="py-2.5 px-3 text-xs font-bold text-slate-400 w-8">{rank}</td>
      <td className="py-2.5 px-3">
        <div>
          <p className="text-xs font-semibold text-slate-800 dark:text-white truncate max-w-[180px]">{lead.name || 'Unknown'}</p>
          {lead.website && (
            <a href={lead.website} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5 truncate max-w-[180px]">
              {lead.website.replace(/^https?:\/\//, '')} <ExternalLink className="w-2.5 h-2.5 shrink-0" />
            </a>
          )}
        </div>
      </td>
      <td className="py-2.5 px-3 text-[11px] text-slate-500 dark:text-slate-400 hidden sm:table-cell">
        {[lead.city, lead.country].filter(Boolean).join(', ') || '—'}
      </td>
      <td className="py-2.5 px-3 text-[11px] text-slate-500 dark:text-slate-400 hidden lg:table-cell truncate max-w-[120px]">
        {lead.industry || '—'}
      </td>
      <td className="py-2.5 px-3">
        <ScoreBadge score={score} invert={invert} />
      </td>
    </tr>
  );
}

function TopTable({
  title, leads, scoreField, label, icon, invert
}: {
  title: string;
  leads: TopLead[];
  scoreField: keyof TopLead;
  label: string;
  icon: React.ReactNode;
  invert?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-1.5">{icon}</div>
        <div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h4>
          <p className="text-[10px] text-slate-400">Top {leads.length} leads</p>
        </div>
      </div>
      {leads.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">No data yet — run analysis to populate</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[400px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                <th className="py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">#</th>
                <th className="py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Business</th>
                <th className="py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden sm:table-cell">Location</th>
                <th className="py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden lg:table-cell">Industry</th>
                <th className="py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</th>
              </tr>
            </thead>
            <tbody>
              {leads.slice(0, 50).map((lead, i) => (
                <LeadRow key={lead.lead_id} lead={lead} rank={i + 1} scoreField={scoreField} label={label} invert={invert} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

const TABS = [
  { key: 'highest_opportunity', label: 'Top Opportunities', field: 'business_opportunity_score' as keyof TopLead, icon: <TrendingUp className="w-4 h-4 text-orange-500" />, label2: 'Opp. Score' },
  { key: 'best_websites', label: 'Best Websites', field: 'website_score' as keyof TopLead, icon: <TrendingUp className="w-4 h-4 text-emerald-500" />, label2: 'Website Score' },
  { key: 'worst_websites', label: 'Worst Websites', field: 'website_score' as keyof TopLead, icon: <TrendingDown className="w-4 h-4 text-rose-500" />, label2: 'Website Score', invert: true },
  { key: 'fastest_websites', label: 'Fastest', field: 'performance_score' as keyof TopLead, icon: <TrendingUp className="w-4 h-4 text-blue-500" />, label2: 'Perf. Score' },
  { key: 'slowest_websites', label: 'Slowest', field: 'performance_score' as keyof TopLead, icon: <TrendingDown className="w-4 h-4 text-amber-500" />, label2: 'Perf. Score', invert: true },
  { key: 'highest_seo_problems', label: 'SEO Problems', field: 'seo_issues_count' as keyof TopLead, icon: <AlertTriangle className="w-4 h-4 text-yellow-500" />, label2: 'Issues', invert: true },
  { key: 'security_risks', label: 'Security Risks', field: 'security_score' as keyof TopLead, icon: <Shield className="w-4 h-4 text-red-500" />, label2: 'Security', invert: true },
  { key: 'ui_problems', label: 'UI Problems', field: 'ui_score' as keyof TopLead, icon: <Palette className="w-4 h-4 text-pink-500" />, label2: 'UI Score', invert: true },
  { key: 'ux_problems', label: 'UX Problems', field: 'ux_score' as keyof TopLead, icon: <Activity className="w-4 h-4 text-purple-500" />, label2: 'UX Score', invert: true },
];

interface TopOpportunitiesProps {
  data: TopOpportunitiesData;
  isDark?: boolean;
}

export default function TopOpportunities({ data, isDark }: TopOpportunitiesProps) {
  const [activeTab, setActiveTab] = useState(0);
  const tab = TABS[activeTab];
  const leads = (data as any)[tab.key] as TopLead[] || [];

  return (
    <div>
      {/* Tab nav */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(i)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition
              ${activeTab === i
                ? 'bg-violet-600 text-white shadow-md'
                : isDark
                  ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <TopTable
        title={tab.label}
        leads={leads}
        scoreField={tab.field}
        label={tab.label2}
        icon={tab.icon}
        invert={tab.invert}
      />
    </div>
  );
}
