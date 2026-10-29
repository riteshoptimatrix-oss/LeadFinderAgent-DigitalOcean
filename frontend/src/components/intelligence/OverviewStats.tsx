'use client';

import { Users, CheckCircle2, Clock, Gauge } from 'lucide-react';
import { ReactNode } from 'react';
import { KPIData } from './KPIGrid';

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  note: string;
}

function StatCard({ label, value, icon, note }: StatCardProps) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-5 flex flex-col gap-1">
      <div className="flex items-center justify-between mb-2">
        <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500">
          {icon}
        </div>
        <span className="text-[11px] font-medium text-slate-400">{note}</span>
      </div>
      <p className="text-3xl font-bold tracking-tight text-slate-900 leading-none">{value}</p>
      <p className="text-[13px] font-medium text-slate-500 mt-2">{label}</p>
    </div>
  );
}

interface OverviewStatsProps {
  data: KPIData;
}

export function OverviewStats({ data }: OverviewStatsProps) {
  const total = data.total_leads || 0;
  const analyzed = data.analyzed_leads || 0;
  const pending = data.pending_analysis || 0;
  const analyzedPct = total > 0 ? Math.round((analyzed / total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <StatCard
        label="Total Leads"
        value={total.toLocaleString()}
        icon={<Users className="w-[18px] h-[18px]" />}
        note={`${analyzedPct}% analyzed`}
      />
      <StatCard
        label="Analyzed Leads"
        value={analyzed.toLocaleString()}
        icon={<CheckCircle2 className="w-[18px] h-[18px]" />}
        note={`of ${total.toLocaleString()} total`}
      />
      <StatCard
        label="Pending Analysis"
        value={pending.toLocaleString()}
        icon={<Clock className="w-[18px] h-[18px]" />}
        note="awaiting AI analysis"
      />
      <StatCard
        label="Average AI Score"
        value={data.avg_website_score?.toFixed(1) ?? '0.0'}
        icon={<Gauge className="w-[18px] h-[18px]" />}
        note="out of 100"
      />
    </div>
  );
}
