'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Search,
  MapPin,
  Clock,
  CalendarDays,
  Users,
  Layers,
  Sparkles,
  CheckCircle2,
  Eye,
  Loader2,
  Timer,
  Target,
  TrendingUp,
  Activity,
  ListOrdered,
  History,
  ArrowLeft,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import api from '@/src/lib/axios';

export interface SearchSession {
  id: string;
  job_id: string;
  keyword: string;
  country: string;
  state: string;
  city: string;
  area: string;
  provider: string;
  search_date: string;
  search_time: string;
  duration_seconds: number;
  status: string;
  progress: number;
  requested_leads: number;
  total_found: number;
  total_saved: number;
  leads_count: number;
  accepted_leads: number;
  duplicate_leads: number;
  failed_leads: number;
  ai_analysis_completed: number;
  ai_analysis_pending: number;
  error_message?: string | null;
  created_at: string;
}

export interface SearchSessionsStats {
  total_searches: number;
  total_leads_generated: number;
  average_search_time_seconds: number;
  average_leads_per_search: number;
  total_completed_searches: number;
}

interface SearchSessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewLeads: (session: SearchSession) => void;
  onClearFilter: () => void;
  activeJobId?: string | null;
}

const PAGE_SIZE = 20;

export function formatSearchDuration(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || isNaN(Number(seconds))) return '--';
  const secNum = Math.floor(Number(seconds));
  if (secNum < 60) return `${secNum}s`;
  const m = Math.floor(secNum / 60);
  const s = secNum % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function formatSearchDate(iso?: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatSearchTime(iso?: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function searchSessionLocation(s: SearchSession | null): string {
  if (!s) return '';
  const parts = [s.country, s.state, s.city, s.area].filter(Boolean);
  return parts.join(' → ') || 'Any Location';
}

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RUNNING: 'bg-blue-50 text-blue-700 border-blue-200',
  QUEUED: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  STOPPED: 'bg-slate-100 text-slate-600 border-slate-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
  TIMEOUT: 'bg-orange-50 text-orange-700 border-orange-200',
};

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'most_leads', label: 'Most Leads' },
  { value: 'least_leads', label: 'Least Leads' },
  { value: 'fastest', label: 'Fastest Search' },
  { value: 'longest', label: 'Longest Search' },
];

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status?.toUpperCase()] || 'bg-slate-50 text-slate-600 border-slate-200';
  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${style}`}>
      {status || 'UNKNOWN'}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">{label}</p>
        <p className="text-lg font-extrabold text-slate-900 leading-tight truncate">{value}</p>
      </div>
    </div>
  );
}

function SessionCard({
  session,
  active,
  onViewLeads,
  onOpenDetails,
  onBackToAllLeads,
}: {
  session: SearchSession;
  active: boolean;
  onViewLeads: (s: SearchSession) => void;
  onOpenDetails: (s: SearchSession) => void;
  onBackToAllLeads?: () => void;
}) {
  const requested = session.requested_leads || 0;
  const collected = session.total_saved || 0;
  const pct = requested > 0 ? Math.min(100, Math.round((collected / requested) * 100)) : session.progress || 0;

  return (
    <div className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-sm transition-all ${active ? 'border-blue-300 ring-1 ring-blue-300' : 'border-slate-200 hover:border-blue-200 hover:shadow-md'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-slate-900 text-sm truncate" title={session.keyword}>
              {session.keyword || 'Unnamed Search'}
            </h4>
            <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1 truncate">
              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{searchSessionLocation(session)}</span>
            </p>
          </div>
        </div>
        <StatusBadge status={session.status} />
      </div>

      {/* Meta row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 text-[11px] text-slate-600">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span><span className="text-slate-400 font-semibold">Date:</span> {formatSearchDate(session.search_date)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span><span className="text-slate-400 font-semibold">Time:</span> {formatSearchTime(session.search_time)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Timer className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span><span className="text-slate-400 font-semibold">Duration:</span> {formatSearchDuration(session.duration_seconds)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span><span className="text-slate-400 font-semibold">Provider:</span> {session.provider || 'Google Maps'}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1.5">
          <span>Requested <span className="text-slate-900">{requested} Leads</span></span>
          <span>Collected <span className="text-blue-600">{collected} Leads</span></span>
          <span className={`${pct >= 100 ? 'text-emerald-600' : 'text-slate-700'}`}>{pct}%</span>
        </div>
        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
          <div
            className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {[
          { label: 'Found', value: session.total_found, cls: 'text-slate-900' },
          { label: 'Saved', value: session.total_saved, cls: 'text-emerald-600' },
          { label: 'Accepted', value: session.accepted_leads, cls: 'text-blue-600' },
          { label: 'Duplicates', value: session.duplicate_leads, cls: 'text-amber-600' },
          { label: 'Failed', value: session.failed_leads, cls: 'text-red-600' },
        ].map((item) => (
          <div key={item.label} className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-center">
            <p className={`text-sm font-extrabold leading-tight ${item.cls}`}>{item.value}</p>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{item.label}</p>
          </div>
        ))}
        <div className="bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 text-center">
          <p className="text-sm font-extrabold leading-tight text-slate-900">{session.total_saved}</p>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Leads</p>
        </div>
      </div>

      {/* AI Analysis */}
      <div className="flex items-center gap-4 mb-4 px-3 py-2 bg-violet-50/60 border border-violet-100 rounded-xl">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-violet-700">
          <Sparkles className="w-3.5 h-3.5" /> AI Analysis:
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" /> Completed {session.ai_analysis_completed}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
          <Activity className="w-3.5 h-3.5" /> Pending {session.ai_analysis_pending}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onViewLeads(session)}
          className="flex-1 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5" /> View Leads ({session.total_saved ?? session.leads_count ?? 0})
        </button>
        {active && onBackToAllLeads && (
          <button
            onClick={onBackToAllLeads}
            className="flex-1 px-3 py-2 bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to All Leads
          </button>
        )}
        <button
          onClick={() => onOpenDetails(session)}
          className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5 text-slate-500" /> Search Details
        </button>
      </div>
    </div>
  );
}

export default function SearchSessionsModal({ isOpen, onClose, onViewLeads, onClearFilter, activeJobId }: SearchSessionsModalProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm, isOpen]);

  const { data: stats } = useQuery({
    queryKey: ['searchSessionsStats'],
    queryFn: async () => (await api.get('/search/sessions/stats')).data,
    enabled: isOpen,
    staleTime: 30000,
  });

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['searchSessions', debouncedSearch, sortBy],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        skip: String(pageParam),
        limit: String(PAGE_SIZE),
        sort_by: sortBy,
      });
      if (debouncedSearch) params.append('keyword', debouncedSearch);
      const res = await api.get(`/search/sessions?${params.toString()}`);
      return res.data as { data: SearchSession[]; total: number };
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + (p.data?.length || 0), 0);
      return loaded < (lastPage.total || 0) ? loaded : undefined;
    },
    enabled: isOpen,
  });

  const sessions = data?.pages.flatMap((p) => p.data) || [];
  const total = data?.pages[0]?.total || 0;

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !isOpen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) handleLoadMore();
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isOpen, handleLoadMore, sessions.length]);

  const handleOpenDetails = (session: SearchSession) => {
    onClose();
    router.push(`/dashboard/search/job/detail?id=${session.job_id || session.id}`);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-50 w-full h-full flex flex-col sm:h-[86vh] sm:max-h-[900px] sm:max-w-4xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
            initial={isMobile ? { opacity: 1, x: '100%' } : { opacity: 0, y: 60, x: 0 }}
            animate={isMobile ? { opacity: 1, x: 0 } : { opacity: 1, y: 0, x: 0 }}
            exit={isMobile ? { opacity: 1, x: '100%' } : { opacity: 0, y: 40, x: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-5 sm:px-7 py-5 bg-white border-b border-slate-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shrink-0">
                  <History className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Search Campaign</h2>
                  <p className="text-xs text-slate-500 font-medium truncate">
                    Browse past searches and instantly filter the leads table.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all shrink-0"
                aria-label="Close search campaign"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stats */}
            <div className="px-5 sm:px-7 pt-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                <StatCard icon={History} label="Total Searches" value={stats?.total_searches ?? '--'} accent="bg-blue-100 text-blue-600" />
                <StatCard icon={Users} label="Total Leads" value={stats?.total_leads_generated ?? '--'} accent="bg-emerald-100 text-emerald-600" />
                <StatCard icon={Timer} label="Avg Search Time" value={stats ? formatSearchDuration(stats.average_search_time_seconds) : '--'} accent="bg-amber-100 text-amber-600" />
                <StatCard icon={TrendingUp} label="Avg Leads/Search" value={stats?.average_leads_per_search ?? '--'} accent="bg-violet-100 text-violet-600" />
                <StatCard icon={CheckCircle2} label="Completed" value={stats?.total_completed_searches ?? '--'} accent="bg-teal-100 text-teal-600" />
              </div>
            </div>

            {/* Toolbar */}
            <div className="px-5 sm:px-7 py-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by keyword, country, state, city, or date..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all shadow-sm"
                />
              </div>
              <div className="relative">
                <ListOrdered className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full sm:w-48 pl-9 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer shadow-sm"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-7 pb-6 space-y-3 custom-scrollbar">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <p className="text-sm font-medium">Loading search campaign...</p>
                </div>
              ) : sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                  <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mb-4 shadow-sm">
                    <History className="w-8 h-8 text-slate-300" />
                  </div>
                  <h3 className="text-base font-bold text-slate-700">No Search Campaign Found</h3>
                  <p className="text-sm text-slate-400 mt-1 max-w-xs">
                    Start your first search to generate leads.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs font-bold text-slate-500">
                      {total} search campaign{total === 1 ? '' : 's'}
                      {debouncedSearch && <span> for &quot;{debouncedSearch}&quot;</span>}
                    </p>
                  </div>
                  {sessions.map((session) => (
                    <SessionCard
                      key={session.id || session.job_id}
                      session={session}
                      active={!!activeJobId && activeJobId === (session.id || session.job_id)}
                      onViewLeads={onViewLeads}
                      onOpenDetails={handleOpenDetails}
                      onBackToAllLeads={onClearFilter}
                    />
                  ))}
                  <div ref={loadMoreRef} className="h-2" />
                  {isFetchingNextPage && (
                    <div className="flex justify-center py-4 text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                    </div>
                  )}
                  {!hasNextPage && sessions.length > 0 && (
                    <p className="text-center text-xs text-slate-400 pt-1">You&apos;ve reached the end of your search history.</p>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 sm:px-7 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Select &quot;View Leads&quot; to filter the Leads table by this campaign.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
