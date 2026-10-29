'use client';

import { Brain, CircleCheck, Sparkles, AlertTriangle, MailX, Globe2, TrendingUp } from 'lucide-react';
import { AnalysisCard } from './AnalysisCard';
import { ScoreBadge } from './ScoreBadge';
import { AnalysisLead, getLeadEmails, getLeadPhones, getLeadPriority, getLeadScore } from './leadAnalysis';
import { KPIData } from './KPIGrid';

interface SummarySidebarProps {
  kpi?: KPIData;
  leads: AnalysisLead[];
}

interface SummaryRow {
  label: string;
  value: string;
  icon: React.ReactNode;
}

function SummaryList({ items }: { items: SummaryRow[] }) {
  return (
    <div className="divide-y divide-slate-50">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
          <span className="flex items-center gap-2.5 text-[13px] text-slate-500">
            <span className="text-slate-300">{item.icon}</span>
            {item.label}
          </span>
          <span className="text-sm font-bold text-slate-800">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function SummarySidebar({ kpi, leads }: SummarySidebarProps) {
  const total = leads.length;
  const recommended = leads.filter((l) => getLeadScore(l) >= 60).length;
  const poor = leads.filter((l) => getLeadScore(l) < 40).length;
  const noWebsite = leads.filter((l) => !l?.website).length;
  const missingEmail = leads.filter((l) => getLeadEmails(l).length === 0).length;
  const missingContact = leads.filter((l) => getLeadEmails(l).length === 0 || getLeadPhones(l).length === 0).length;
  const highPriority = leads.filter((l) => getLeadPriority(l) === 'High').length;
  const excellent = leads.filter((l) => getLeadScore(l) >= 80).length;

  const avgScore = kpi?.avg_website_score;

  return (
    <div className="space-y-6">
      <AnalysisCard
        title="AI Summary"
        subtitle="Snapshot of analyzed leads"
        icon={<Brain className="w-4 h-4" />}
      >
        <div className="flex items-center justify-between pb-3 mb-1 border-b border-slate-100">
          <span className="text-[13px] text-slate-500">Average Score</span>
          {avgScore !== undefined ? (
            <ScoreBadge score={avgScore} />
          ) : (
            <span className="text-sm font-bold text-slate-800">—</span>
          )}
        </div>
        <SummaryList
          items={[
            { label: 'Recommended Leads', value: recommended.toLocaleString(), icon: <TrendingUp className="w-3.5 h-3.5" /> },
            { label: 'Website Issues', value: poor.toLocaleString(), icon: <AlertTriangle className="w-3.5 h-3.5" /> },
            { label: 'Missing Contact', value: missingContact.toLocaleString(), icon: <MailX className="w-3.5 h-3.5" /> },
            { label: 'High Priority Leads', value: highPriority.toLocaleString(), icon: <Sparkles className="w-3.5 h-3.5" /> },
          ]}
        />
      </AnalysisCard>

      <AnalysisCard
        title="AI Suggestions"
        subtitle="Automatic improvements detected"
        icon={<Sparkles className="w-4 h-4" />}
      >
        <div className="space-y-2.5">
          {[
            { label: 'Improve contact quality', count: missingContact },
            { label: 'Website unavailable', count: noWebsite },
            { label: 'Missing email', count: missingEmail },
            { label: 'High conversion opportunity', count: excellent },
          ].map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5 text-[13px] text-slate-600">
                <CircleCheck className="w-4 h-4 text-blue-500 shrink-0" />
                {s.label}
              </span>
              <span className="text-xs font-bold text-slate-400">{s.count}</span>
            </div>
          ))}
          {total === 0 && (
            <p className="text-[13px] text-slate-400">
              {leads.length === 0 ? 'No leads loaded yet.' : 'No suggestions for the current selection.'}
            </p>
          )}
        </div>
      </AnalysisCard>

      <div className="rounded-xl bg-blue-50/60 border border-blue-100 p-4 flex items-start gap-3">
        <Globe2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-[13px] text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-800">Tip:</span> Open a lead to view its full AI analysis,
          including website, SEO, and technology insights.
        </p>
      </div>
    </div>
  );
}
