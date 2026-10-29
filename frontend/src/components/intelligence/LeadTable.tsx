'use client';

import { Globe, ExternalLink, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { AnalysisLead, getLeadLocation, getLeadPriority, getLeadScore, getLeadStatus } from './leadAnalysis';
import { ScoreBadge } from './ScoreBadge';
import { cn } from '@/src/lib/utils';

const PRIORITY_STYLES: Record<string, string> = {
  High: 'bg-red-50 text-red-600 ring-red-100',
  Normal: 'bg-blue-50 text-blue-600 ring-blue-100',
  Low: 'bg-slate-50 text-slate-500 ring-slate-200',
};

interface LeadTableProps {
  leads: AnalysisLead[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onSelectLead: (lead: AnalysisLead) => void;
}

export function LeadTable({ leads, total, page, pageSize, onPageChange, onSelectLead }: LeadTableProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Business', 'Location', 'Industry', 'Website', 'AI Score', 'Priority', 'Status', ''].map((col) => (
                <th
                  key={col}
                  className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead) => {
              const name = lead?.name || lead?.business_name || 'Unnamed Business';
              const score = getLeadScore(lead);
              const priority = getLeadPriority(lead);
              const status = getLeadStatus(lead);
              const location = getLeadLocation(lead);

              return (
                <tr
                  key={lead?._id || lead?.id || name}
                  onClick={() => onSelectLead(lead)}
                  className="group cursor-pointer hover:bg-slate-50/70 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold shrink-0">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate max-w-[220px]">{name}</p>
                        {lead?.google_rating ? (
                          <p className="text-[11px] text-amber-500 font-semibold">★ {lead.google_rating}</p>
                        ) : (
                          <p className="text-[11px] text-slate-400 capitalize">{lead?.category || '—'}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 text-[13px] text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <span className="truncate max-w-[180px]">{location || '—'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-slate-500">{lead?.category || '—'}</td>
                  <td className="px-5 py-3.5">
                    {lead?.website ? (
                      <a
                        href={lead.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[13px] text-blue-600 hover:text-blue-700 hover:underline max-w-[160px] truncate"
                      >
                        <Globe className="w-3.5 h-3.5 shrink-0" />
                        {lead.website.replace(/^https?:\/\//, '')}
                      </a>
                    ) : (
                      <span className="text-[13px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <ScoreBadge score={score} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
                        PRIORITY_STYLES[priority] || 'bg-slate-50 text-slate-500 ring-slate-200'
                      )}
                    >
                      {priority}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-600 capitalize">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      {status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectLead(lead);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[13px] font-semibold text-slate-600 hover:bg-white hover:border-blue-200 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-t border-slate-200 bg-slate-50/50">
        <p className="text-xs font-medium text-slate-500">
          Showing <span className="font-semibold text-slate-700">{start}-{end}</span> of{' '}
          <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> leads
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-xs font-semibold text-slate-600">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
