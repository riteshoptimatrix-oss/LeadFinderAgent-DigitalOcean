'use client';

import {
  Layers,
  MapPin,
  CalendarDays,
  Clock,
  Timer,
  Target,
  CheckCircle2,
  X,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import {
  SearchSession,
  formatSearchDate,
  formatSearchTime,
  formatSearchDuration,
  searchSessionLocation,
} from '@/src/components/search-sessions/SearchSessionsModal';

interface SearchSessionBannerProps {
  session: SearchSession;
  onClear: () => void;
}

export default function SearchSessionBanner({ session, onClear }: SearchSessionBannerProps) {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl border border-blue-700 shadow-lg p-5 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
      <div className="relative flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-white shrink-0 mt-0.5">
            <Layers className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-blue-100 uppercase tracking-widest">Showing Leads From:</p>
            <p className="text-[13px] font-bold text-white mt-0.5">
              Keyword: <span className="font-extrabold">{session.keyword || 'Unnamed Search'}</span>
            </p>
            <p className="text-xs text-blue-100 font-medium flex items-center gap-1 truncate">
              <span className="font-bold text-blue-50">Location:</span>
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{searchSessionLocation(session)}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 lg:ml-auto">
          <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2">
            <p className="text-[9px] font-bold text-blue-100 uppercase tracking-wider flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Date</p>
            <p className="text-sm font-bold text-white">{formatSearchDate(session.search_date)}</p>
          </div>
          <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2">
            <p className="text-[9px] font-bold text-blue-100 uppercase tracking-wider flex items-center gap-1"><Clock className="w-3 h-3" /> Time</p>
            <p className="text-sm font-bold text-white">{formatSearchTime(session.search_time)}</p>
          </div>
          <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2">
            <p className="text-[9px] font-bold text-blue-100 uppercase tracking-wider flex items-center gap-1"><Timer className="w-3 h-3" /> Duration</p>
            <p className="text-sm font-bold text-white">{formatSearchDuration(session.duration_seconds)}</p>
          </div>
          <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2">
            <p className="text-[9px] font-bold text-blue-100 uppercase tracking-wider flex items-center gap-1"><Target className="w-3 h-3" /> Generated</p>
            <p className="text-sm font-bold text-white">{session.total_saved} <span className="font-semibold text-blue-200">Leads</span></p>
          </div>
          <div className="bg-white/10 border border-white/15 rounded-xl px-3 py-2">
            <p className="text-[9px] font-bold text-blue-100 uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> AI Done</p>
            <p className="text-sm font-bold text-white">{session.ai_analysis_completed} <span className="font-semibold text-blue-200">/ {session.ai_analysis_pending} pending</span></p>
          </div>
        </div>

        <div className="flex items-center gap-2 lg:ml-3 shrink-0">
          <Link
            href={`/dashboard/search/job/detail?id=${session.job_id || session.id}`}
            className="px-3.5 py-2.5 bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
            title="View complete campaign details & logs"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Campaign Details
          </Link>
          <button
            onClick={onClear}
            className="px-4 py-2.5 bg-white text-blue-700 hover:bg-blue-50 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> Back to All Leads
          </button>
        </div>
      </div>
    </div>
  );
}
