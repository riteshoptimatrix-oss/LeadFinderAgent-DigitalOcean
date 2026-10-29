'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { PageHeader } from '@/src/components/common/PageHeader';
import {
  Download,
  Trash2,
  Search,
  Filter,
  ChevronDown,
  Mail,
  Phone,
  Globe,
  ChevronRight,
  ShieldCheck,
  Zap,
  Grid,
  List,
  MapPin,
  Building2,
  Sparkles,
  CheckCircle2,
  MailCheck,
  AlertCircle,
  Copy,
  History,
  Loader2,
  CheckCheck
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import AIAnalysisMonitor from '@/src/components/ai-analysis/AIAnalysisMonitor';
import BulkAIAnalysisMonitor from '@/src/components/ai-analysis/BulkAIAnalysisMonitor';
import BulkAnalysisModal from '@/src/components/ai-analysis/BulkAnalysisModal';
import SearchSessionsModal, { SearchSession } from '@/src/components/search-sessions/SearchSessionsModal';
import SearchSessionBanner from '@/src/components/search-sessions/SearchSessionBanner';
import { formatLocation } from '@/src/lib/utils';

export default function LeadsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(0);
  const [limit] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [websiteFilter, setWebsiteFilter] = useState('ALL');
  const [phoneFilter, setPhoneFilter] = useState('ALL');
  const [emailFilter, setEmailFilter] = useState('ALL');
  const [ratingFilter, setRatingFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<-1 | 1>(-1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const activeFilterCount =
    (cityFilter ? 1 : 0) + (categoryFilter ? 1 : 0) +
    (websiteFilter !== 'ALL' ? 1 : 0) + (phoneFilter !== 'ALL' ? 1 : 0) +
    (emailFilter !== 'ALL' ? 1 : 0) + (ratingFilter !== 'ALL' ? 1 : 0) +
    (statusFilter !== 'ALL' ? 1 : 0);
  const clearAllFilters = () => {
    setSearchQuery('');
    setCityFilter('');
    setCategoryFilter('');
    setWebsiteFilter('ALL');
    setPhoneFilter('ALL');
    setEmailFilter('ALL');
    setRatingFilter('ALL');
    setStatusFilter('ALL');
    setSortBy('created_at');
    setSortOrder(-1);
    setPage(0);
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkModalNonce, setBulkModalNonce] = useState(0);
  const [bulkQueueId, setBulkQueueId] = useState<string | null>(null);
  const [bulkQueueName, setBulkQueueName] = useState('Bulk AI Website Analysis');

  const [sessionsModalOpen, setSessionsModalOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<SearchSession | null>(null);


  const { data, isLoading } = useQuery({
    queryKey: [
      'leads',
      page,
      limit,
      searchQuery,
      cityFilter,
      categoryFilter,
      websiteFilter,
      phoneFilter,
      emailFilter,
      ratingFilter,
      statusFilter,
      sortBy,
      sortOrder,
      activeSession?.job_id
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        skip: (page * limit).toString(),
        limit: limit.toString(),
        sort_by: sortBy,
        sort_order: sortOrder.toString(),
      });
      if (activeSession?.job_id) params.append('job_id', activeSession.job_id);
      if (searchQuery) params.append('keyword', searchQuery);
      if (cityFilter) params.append('city', cityFilter);
      if (categoryFilter) params.append('category', categoryFilter);
      if (websiteFilter === 'HAS_WEBSITE') params.append('has_website', 'true');
      if (websiteFilter === 'NO_WEBSITE') params.append('has_website', 'false');
      if (phoneFilter === 'HAS_PHONE') params.append('has_phone', 'true');
      if (phoneFilter === 'NO_PHONE') params.append('has_phone', 'false');
      if (emailFilter === 'HAS_EMAIL') params.append('has_email', 'true');
      if (emailFilter === 'NO_EMAIL') params.append('has_email', 'false');
      if (ratingFilter !== 'ALL') params.append('min_rating', ratingFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);

      const res = await api.get(`/leads?${params.toString()}`);
      return res.data;
    },
    // Realtime: re-poll while the page is open so leads saved by a running
    // search campaign appear immediately without a manual reload/refresh.
    refetchInterval: 15000,
  });

  const leads = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  type DebugLead = {
    phone?: unknown;
    primary_phone?: unknown;
    all_phones?: unknown[];
    phones?: unknown[];
    state?: unknown;
    city?: unknown;
    area?: unknown;
  };

  // Logging for empty states / debugging
  useEffect(() => {
    if (data) {
      if (data.total === 0) {
        console.warn("Leads page loaded with 0 records from API. API Response:", data, "Table Rows Rendered: 0");
      } else {
        console.log("Leads page loaded. API Response Count:", data.total, "Table Rows Rendered:", leads.length);
      }
      const rendered = leads.filter((l: DebugLead) => l.phone || l.primary_phone || (l.all_phones && l.all_phones.length));
      console.log(
        "PHONES_RENDERED: rows=", leads.length,
        "leads_with_phone=", rendered.length,
        "sample_phones=", leads.slice(0, 3).map((l: DebugLead) => l.phone || l.primary_phone || (l.phones && l.phones[0])),
        "locations=", leads.slice(0, 3).map((l: DebugLead) => formatLocation(l)),
      );
      console.log(
        "LOCATION_RENDERED: rows=", leads.length,
        "leads_with_location=", leads.filter((l: DebugLead) => l.state || l.city || l.area).length,
      );
    }
  }, [data, leads.length]);

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length && leads.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l: any) => l._id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const [selectAllLoading, setSelectAllLoading] = useState(false);
  const [selectAllError, setSelectAllError] = useState<string | null>(null);

  const handleSelectAllMatching = async () => {
    setSelectAllLoading(true);
    setSelectAllError(null);
    try {
      const params = new URLSearchParams();
      if (activeSession?.job_id) params.append('job_id', activeSession.job_id);
      if (searchQuery) params.append('keyword', searchQuery);
      if (cityFilter) params.append('city', cityFilter);
      if (categoryFilter) params.append('category', categoryFilter);
      if (websiteFilter === 'HAS_WEBSITE') params.append('has_website', 'true');
      if (websiteFilter === 'NO_WEBSITE') params.append('has_website', 'false');
      if (phoneFilter === 'HAS_PHONE') params.append('has_phone', 'true');
      if (phoneFilter === 'NO_PHONE') params.append('has_phone', 'false');
      if (emailFilter === 'HAS_EMAIL') params.append('has_email', 'true');
      if (emailFilter === 'NO_EMAIL') params.append('has_email', 'false');
      if (ratingFilter !== 'ALL') params.append('min_rating', ratingFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      const res = await api.get(`/leads/ids?${params.toString()}`);
      setSelectedIds(new Set(res.data?.data || []));
      toast.success(`Selected ${res.data?.total || 0} leads`);
    } catch (error) {
      setSelectAllError('Failed to select all leads. Please try again.');
    } finally {
      setSelectAllLoading(false);
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      await api.post('/leads/bulk-delete', { lead_ids: Array.from(selectedIds) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setSelectedIds(new Set());
      toast.success('Leads deleted successfully');
    }
  });

  const handleQueueCompletion = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['leads'], refetchType: 'active' }),
      queryClient.invalidateQueries({ queryKey: ['lead'], refetchType: 'active' }),
      queryClient.invalidateQueries({ queryKey: ['leadAnalysisSummary'], refetchType: 'active' }),
      queryClient.invalidateQueries({ queryKey: ['leadAi'], refetchType: 'active' }),
      queryClient.invalidateQueries({ queryKey: ['leadAnalysisHistory'], refetchType: 'active' }),
      queryClient.invalidateQueries({ queryKey: ['leadAnalysisComparison'], refetchType: 'active' }),
    ]);

    await queryClient.refetchQueries({ queryKey: ['leads'], type: 'active' });

    setActiveQueueId(null);
    setBulkQueueId(null);
    router.push('/dashboard/leads');

    toast.success('Advanced AI Analysis Completed', {
      description: 'Website analysis completed successfully and has been saved to this Lead.',
      duration: 5000,
      action: {
        label: 'View Updated Lead',
        onClick: () => router.push('/dashboard/leads'),
      },
    });
  };

  const buildBulkFilters = () => {
    const f: Record<string, string | boolean> = {};
    if (searchQuery) f.keyword = searchQuery;
    if (cityFilter) f.city = cityFilter;
    if (categoryFilter) f.category = categoryFilter;
    if (websiteFilter === 'HAS_WEBSITE') f.has_website = true;
    if (websiteFilter === 'NO_WEBSITE') f.has_website = false;
    if (phoneFilter === 'HAS_PHONE') f.has_phone = true;
    if (phoneFilter === 'NO_PHONE') f.has_phone = false;
    if (emailFilter === 'HAS_EMAIL') f.has_email = true;
    if (emailFilter === 'NO_EMAIL') f.has_email = false;
    if (ratingFilter !== 'ALL') f.min_rating = ratingFilter;
    if (statusFilter !== 'ALL') f.status = statusFilter;
    return f;
  };

  const openBulkModal = () => {
    setBulkQueueId(null);
    setBulkModalNonce(n => n + 1);
    setBulkModalOpen(true);
  };

  const handleBulkStarted = (queueId: string, name: string) => {
    setBulkModalOpen(false);
    setBulkQueueName(name);
    setBulkQueueId(queueId);
  };

  const handleExport = async (format: string) => {
    try {
      const res = await api.get(`/leads/export?format=${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const date = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `leads_export_${date}.${format === 'excel' ? 'xlsx' : 'csv'}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      toast.success(`Leads exported to ${format.toUpperCase()} successfully`);
    } catch (error) {
      toast.error('Failed to export leads');
    }
  };

  const singleAiAnalysisMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await api.post(`/leads/${leadId}/start-analysis`);
      return res.data;
    },
    onSuccess: (data) => {
      if (data && (data.queue_id || data.queueId)) {
        setActiveQueueId(data.queue_id || data.queueId);
      } else if (data?.worker_id === "skipped") {
        toast.info("Analysis skipped: No professional website available for this lead");
      } else {
        toast.error("Failed to start analysis: No queue ID returned");
      }
    },
    onError: (error: any) => {
      const errMsg = error?.response?.data?.detail || "An error occurred starting AI analysis.";
      toast.error(errMsg);
    }
  });

  const bgGradients = [
    'from-blue-500/10 to-indigo-500/10 text-blue-700 border-blue-100',
    'from-emerald-500/10 to-teal-500/10 text-emerald-700 border-emerald-100',
    'from-violet-500/10 to-purple-500/10 text-violet-700 border-violet-100',
    'from-rose-500/10 to-pink-500/10 text-rose-700 border-rose-100',
    'from-amber-500/10 to-orange-500/10 text-amber-700 border-amber-100'
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto min-h-screen pb-12">
      {activeQueueId && (
        <AIAnalysisMonitor
          queueId={activeQueueId}
          onClose={() => setActiveQueueId(null)}
          onComplete={handleQueueCompletion}
        />
      )}

      {bulkQueueId && (
        <BulkAIAnalysisMonitor
          queueId={bulkQueueId}
          queueName={bulkQueueName}
          onClose={() => setBulkQueueId(null)}
          onComplete={handleQueueCompletion}
        />
      )}

      <BulkAnalysisModal
        key={bulkModalNonce}
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onStarted={handleBulkStarted}
        leadIds={selectedIds.size > 0 ? Array.from(selectedIds) : undefined}
        filters={selectedIds.size > 0 ? undefined : buildBulkFilters()}
        scopeLabel={selectedIds.size > 0 ? `${selectedIds.size} selected lead${selectedIds.size === 1 ? '' : 's'}` : 'all matching leads'}
      />

      <SearchSessionsModal
        isOpen={sessionsModalOpen}
        onClose={() => setSessionsModalOpen(false)}
        activeJobId={activeSession?.job_id ?? null}
        onClearFilter={() => {
          setActiveSession(null);
          setPage(0);
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        }}
        onViewLeads={(session) => {
          setActiveSession(session);
          setSessionsModalOpen(false);
          setPage(0);
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        }}
      />

      {activeSession && (
        <SearchSessionBanner
          session={activeSession}
          onClear={() => {
            setActiveSession(null);
            setPage(0);
            queryClient.invalidateQueries({ queryKey: ['leads'] });
          }}
        />
      )}

      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
        <PageHeader title="Leads Directory" description={`Managing ${total} total leads in your CRM`} />

        <div className="flex flex-wrap gap-3">
          <button
            onClick={openBulkModal}
            className="px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 rounded-xl text-sm font-bold text-white shadow-sm transition-all flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" /> Bulk AI Analysis
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm flex items-center gap-2"
          >
            <Download className="w-4 h-4 text-slate-500" /> Export CSV
          </button>
          <button
            onClick={() => handleExport('excel')}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm flex items-center gap-2"
          >
            <Download className="w-4 h-4 text-slate-500" /> Export Excel
          </button>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          {/* Compact Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search business, email, phone..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
            />
          </div>

          {/* Search Campaign Button */}
          <button
            onClick={() => setSessionsModalOpen(true)}
            className={`px-4 py-2.5 border rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-sm ${
              activeSession
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
            }`}
          >
            <History className="w-4 h-4" />
            Search Campaign
            {activeSession && (
              <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-none">
                1
              </span>
            )}
          </button>

          {/* Filters Popover */}
          <div className="relative" ref={filtersRef}>
            <button
              onClick={() => setFiltersOpen(o => !o)}
              className={`px-4 py-2.5 border rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-sm ${
                activeFilterCount > 0
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold leading-none">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
            </button>

            {filtersOpen && (
              <div className="absolute z-30 mt-2 w-[340px] max-w-[90vw] bg-white border border-slate-200 rounded-2xl shadow-xl p-4 flex flex-col gap-4">
                {/* Text filters */}
                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Filter by city..."
                      value={cityFilter}
                      onChange={(e) => { setCityFilter(e.target.value); setPage(0); }}
                      className="w-full pl-4 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                    />
                    {cityFilter && (
                      <button onClick={() => { setCityFilter(''); setPage(0); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold">&times;</button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Filter by category..."
                      value={categoryFilter}
                      onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}
                      className="w-full pl-4 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                    />
                    {categoryFilter && (
                      <button onClick={() => { setCategoryFilter(''); setPage(0); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold">&times;</button>
                    )}
                  </div>
                </div>

                {/* Select filters grid */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-slate-500">Website</span>
                    <select
                      value={websiteFilter}
                      onChange={(e) => { setWebsiteFilter(e.target.value); setPage(0); }}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="ALL">All</option>
                      <option value="HAS_WEBSITE">Has Website</option>
                      <option value="NO_WEBSITE">No Website</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-slate-500">Phone</span>
                    <select
                      value={phoneFilter}
                      onChange={(e) => { setPhoneFilter(e.target.value); setPage(0); }}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="ALL">All</option>
                      <option value="HAS_PHONE">Has Phone</option>
                      <option value="NO_PHONE">No Phone</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-slate-500">Email</span>
                    <select
                      value={emailFilter}
                      onChange={(e) => { setEmailFilter(e.target.value); setPage(0); }}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="ALL">All</option>
                      <option value="HAS_EMAIL">Has Email</option>
                      <option value="NO_EMAIL">No Email</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-slate-500">Rating</span>
                    <select
                      value={ratingFilter}
                      onChange={(e) => { setRatingFilter(e.target.value); setPage(0); }}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="ALL">All</option>
                      <option value="4">4.0+ Stars</option>
                      <option value="4.5">4.5+ Stars</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-slate-500">Status</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="ALL">All</option>
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="disqualified">Disqualified</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-slate-500">Sort By</span>
                    <select
                      value={sortBy}
                      onChange={(e) => { setSortBy(e.target.value); setPage(0); }}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none hover:border-slate-300 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="created_at">Date Added</option>
                      <option value="name">Name</option>
                      <option value="google_rating">Rating</option>
                      <option value="review_count">Reviews</option>
                      <option value="category">Category</option>
                      <option value="status">Status</option>
                    </select>
                  </label>
                </div>

                {/* Sort order */}
                <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <span className="text-[11px] font-semibold text-slate-500">Sort Order</span>
                  <button
                    onClick={() => { setSortOrder(o => o === 1 ? -1 : 1); setPage(0); }}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    {sortOrder === 1 ? "▲ Asc" : "▼ Desc"}
                  </button>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <button
                    onClick={clearAllFilters}
                    className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-white hover:bg-blue-600 hover:text-white border border-blue-200 rounded-lg transition-all shadow-sm"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={() => setFiltersOpen(false)}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-sm"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* View Toggle & Bulk Actions */}
        <div className="flex items-center gap-3 justify-end border-t lg:border-t-0 pt-3 lg:pt-0">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-100 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {selectedIds.size} Selected
              </span>
              {selectedIds.size < total && (
                <button
                  onClick={handleSelectAllMatching}
                  disabled={selectAllLoading}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Select all leads matching the current filters"
                >
                  {selectAllLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                  {selectAllLoading ? 'Selecting...' : `Select All ${total}`}
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to delete these leads?')) {
                    bulkDeleteMutation.mutate();
                  }
                }}
                className="p-2.5 bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 rounded-xl transition-all shadow-sm"
                title="Delete Selected Leads"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="h-8 w-px bg-slate-200 hidden sm:block" />

          {/* Grid/List View Toggles */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'grid'
                ? 'bg-white text-blue-600 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
                }`}
              title="Grid Card View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list'
                ? 'bg-white text-blue-600 shadow-sm font-semibold'
                : 'text-slate-500 hover:text-slate-800'
                }`}
              title="List Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Active Filters Display */}
      {(cityFilter || categoryFilter || websiteFilter !== 'ALL' || phoneFilter !== 'ALL' || emailFilter !== 'ALL' || ratingFilter !== 'ALL' || statusFilter !== 'ALL' || searchQuery || sortBy !== 'created_at' || sortOrder !== -1 || activeSession) && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-blue-50 border border-blue-100 rounded-xl shadow-sm">
          <Filter className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-semibold text-blue-700 flex flex-wrap gap-1.5 items-center">
            Active filters:
            {activeSession && <span className="px-2 py-0.5 bg-white rounded shadow-sm text-[10px]">Campaign: &quot;{activeSession.keyword}&quot; — {activeSession.city || activeSession.state || 'All'}</span>}
            {searchQuery && <span className="px-2 py-0.5 bg-white rounded shadow-sm text-[10px]">Keyword: &quot;{searchQuery}&quot;</span>}
            {cityFilter && <span className="px-2 py-0.5 bg-white rounded shadow-sm text-[10px]">City: &quot;{cityFilter}&quot;</span>}
            {categoryFilter && <span className="px-2 py-0.5 bg-white rounded shadow-sm text-[10px]">Category: &quot;{categoryFilter}&quot;</span>}
            {websiteFilter !== 'ALL' && <span className="px-2 py-0.5 bg-white rounded shadow-sm text-[10px]">Website: {websiteFilter.replace('_', ' ')}</span>}
            {phoneFilter !== 'ALL' && <span className="px-2 py-0.5 bg-white rounded shadow-sm text-[10px]">Phone: {phoneFilter.replace('_', ' ')}</span>}
            {emailFilter !== 'ALL' && <span className="px-2 py-0.5 bg-white rounded shadow-sm text-[10px]">Email: {emailFilter.replace('_', ' ')}</span>}
            {ratingFilter !== 'ALL' && <span className="px-2 py-0.5 bg-white rounded shadow-sm text-[10px]">Rating: &gt;={ratingFilter} Stars</span>}
            {statusFilter !== 'ALL' && <span className="px-2 py-0.5 bg-white rounded shadow-sm text-[10px]">Status: {statusFilter}</span>}
            {(sortBy !== 'created_at' || sortOrder !== -1) && <span className="px-2 py-0.5 bg-white rounded shadow-sm text-[10px]">Sort: {sortBy} ({sortOrder === 1 ? 'Asc' : 'Desc'})</span>}
          </span>
          <button
            onClick={() => {
              setSearchQuery('');
              setCityFilter('');
              setCategoryFilter('');
              setWebsiteFilter('ALL');
              setPhoneFilter('ALL');
              setEmailFilter('ALL');
              setRatingFilter('ALL');
              setStatusFilter('ALL');
              setSortBy('created_at');
              setSortOrder(-1);
              setPage(0);
              setActiveSession(null);
            }}
            className="ml-auto px-2.5 py-1 text-[10px] font-bold text-blue-600 bg-white hover:bg-blue-600 hover:text-white border border-blue-200 rounded-lg transition-all shadow-sm"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Content Rendering based on ViewMode */}
      {leads.length > 0 && leads.every((l: any) => selectedIds.has(l._id)) && selectedIds.size < total && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-blue-50 border border-blue-200 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              All {leads.length} leads on this page are selected.
              {total > selectedIds.size && (
                <span className="text-blue-600">
                  {' '}Select all <b>{total}</b> leads matching the current filters instead.
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectAllError && (
              <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1">
                {selectAllError}
              </span>
            )}
            {selectAllLoading ? (
              <span className="flex items-center gap-1.5 text-xs font-bold text-blue-700">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Selecting...
              </span>
            ) : total > selectedIds.size ? (
              <button
                onClick={handleSelectAllMatching}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Select all {total} leads
              </button>
            ) : (
              <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> All {total} leads selected
              </span>
            )}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-2 text-xs font-bold text-blue-700 bg-white hover:bg-blue-100 border border-blue-200 rounded-xl transition-all shadow-sm"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      {/* Content Rendering based on ViewMode */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-slate-200 shadow-sm gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Loading your leads directory...</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm text-center px-4">
          <Building2 className="w-12 h-12 text-slate-300 mb-3" />
          <h3 className="text-base font-bold text-slate-700">No leads found</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xs">Try adjusting your filters, keyword search or run a new Lead Scraper campaign.</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {leads.map((lead: any) => {
            const displayName = lead.name || lead.business_name || 'Unnamed Business';
            const initials = displayName
              ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
              : 'L';
            const gradientIndex = displayName.length % bgGradients.length;
            const avatarStyle = bgGradients[gradientIndex];

            return (
              <div
                key={lead._id}
                onClick={() => router.push(`/dashboard/leads/detail?id=${lead._id}`)}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between group cursor-pointer relative"
              >
                {/* Header section of card */}
                <div>
                  <div className="flex justify-between items-start gap-2 mb-3.5">
                    <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border truncate max-w-[170px] ${avatarStyle}`}>
                      {lead.category || 'Lead'}
                    </span>
                    <div onClick={(e) => e.stopPropagation()} className="relative z-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead._id)}
                        onChange={() => toggleSelect(lead._id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Body details */}
                  <div className="flex gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm bg-gradient-to-br border ${avatarStyle} shrink-0`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate text-base leading-snug">
                        {displayName}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{formatLocation(lead)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Contact Badges */}
                  <div className="mt-4 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    {lead.phone ? (
                      <a href={`tel:${lead.phone}`} className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 border border-slate-200 rounded-lg text-xs transition-colors font-mono font-medium">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {lead.phone}
                      </a>
                    ) : (
                      <span className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 text-slate-400 border border-slate-100 rounded-lg text-xs cursor-not-allowed">
                        <Phone className="w-3 h-3 text-slate-300" />
                        No Phone
                      </span>
                    )}

                    {lead.email ? (
                      <a href={`mailto:${lead.email}`} className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 border border-slate-200 rounded-lg text-xs transition-colors font-medium">
                        <Mail className="w-3 h-3 text-slate-400" />
                        Email
                      </a>
                    ) : (
                      <span className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 text-slate-400 border border-slate-100 rounded-lg text-xs cursor-not-allowed">
                        <Mail className="w-3 h-3 text-slate-300" />
                        No Email
                      </span>
                    )}

                    {lead.website && (
                      <a
                        href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-600 border border-slate-200 rounded-lg text-xs transition-colors font-medium"
                      >
                        <Globe className="w-3 h-3 text-blue-500" />
                        Website
                      </a>
                    )}
                  </div>
                </div>

                {/* Score Meters & Footer */}
                <div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex justify-between items-center gap-4 text-xs font-semibold text-slate-600">
                    <div className="flex-1">
                      <div className="flex justify-between mb-1.5">
                        <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Lead Score</span>
                        <span className="text-slate-800">{lead.lead_score || 0}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200 shadow-inner">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 shadow-[0_0_10px_rgba(59,130,246,0.5)] rounded-full transition-all duration-500" style={{ width: `${lead.lead_score || 0}%` }} />
                      </div>
                    </div>
                    {/* <div className="flex-1">
                      <div className="flex justify-between mb-1.5">
                        <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-violet-500 shrink-0" /> AI Rating
                        </span>
                        <span className="text-violet-600 font-bold">{lead.ai_score || 0}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-150">
                        <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all" style={{ width: `${lead.ai_score || 0}%` }} />
                      </div>
                    </div> */}
                  </div>

                  <div className="flex justify-between items-center gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => singleAiAnalysisMutation.mutate(lead._id)}
                      disabled={!lead.website || singleAiAnalysisMutation.isPending}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 ${lead.website
                        ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white hover:shadow active:scale-98'
                        : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                        }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      AI Analysis
                    </button>
                    <button
                      onClick={() => router.push(`/dashboard/leads/detail?id=${lead._id}`)}
                      className="p-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-slate-500 hover:text-slate-800 rounded-xl transition-all shadow-sm"
                      title="View Details"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW TABLE (Desktop & Tablet) */
        <>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden hidden md:flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap table-fixed">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-4 w-14 text-center">
                      <input
                        type="checkbox"
                        checked={leads.length > 0 && selectedIds.size === leads.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-5 py-4 w-[30%] text-xs font-bold text-gray-500 uppercase tracking-wider">Business</th>
                    <th className="px-5 py-4 w-[25%] text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-5 py-4 w-[15%] hidden lg:table-cell text-xs font-bold text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="px-5 py-4 w-[15%] text-xs font-bold text-gray-500 uppercase tracking-wider">Scores</th>
                    <th className="px-5 py-4 w-32 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {leads.map((lead: any) => {
                    const displayName = lead.name || lead.business_name || 'Unnamed Business';
                    const initials = displayName ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'L';
                    const gradientIndex = displayName.length % bgGradients.length;
                    const avatarStyle = bgGradients[gradientIndex];

                    return (
                      <tr
                        key={lead._id}
                        onClick={() => router.push(`/dashboard/leads/detail?id=${lead._id}`)}
                        className={`group transition-colors cursor-pointer ${selectedIds.has(lead._id) ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
                      >
                        <td className="px-5 py-4 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(lead._id)}
                            onChange={() => toggleSelect(lead._id)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-5 py-4 align-middle overflow-hidden">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm bg-gradient-to-br border ${avatarStyle} shrink-0 shadow-sm`}>
                              {initials}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-gray-900 text-sm truncate hover:text-blue-600 transition-colors" title={displayName}>
                                {displayName}
                              </span>
                              <span className="text-[10px] font-bold text-gray-500 mt-1 uppercase tracking-wider truncate" title={lead.category || 'Uncategorized'}>
                                {lead.category || 'Uncategorized'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-middle overflow-hidden" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col gap-1.5 w-full">
                            <div className="flex items-center gap-2 text-xs group/item max-w-[200px]">
                              <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              {lead.phone ? (
                                <>
                                  <a href={`tel:${lead.phone}`} className="text-gray-700 hover:text-blue-600 font-mono font-medium truncate" title={lead.phone}>{lead.phone}</a>
                                  <button onClick={() => { navigator.clipboard.writeText(lead.phone); toast.success('Phone copied'); }} className="opacity-0 group-hover/item:opacity-100 transition-opacity p-1 text-gray-400 hover:text-gray-700" title="Copy Phone"><Copy className="w-3 h-3" /></button>
                                </>
                              ) : (
                                <span className="text-gray-400 font-medium">—</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs group/item max-w-[200px]">
                              <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              {lead.email ? (
                                <>
                                  <a href={`mailto:${lead.email}`} className="text-gray-700 hover:text-blue-600 font-medium truncate" title={lead.email}>{lead.email}</a>
                                  <button onClick={() => { navigator.clipboard.writeText(lead.email); toast.success('Email copied'); }} className="opacity-0 group-hover/item:opacity-100 transition-opacity p-1 text-gray-400 hover:text-gray-700" title="Copy Email"><Copy className="w-3 h-3" /></button>
                                </>
                              ) : (
                                <span className="text-gray-400 font-medium">—</span>
                              )}
                            </div>
                            {lead.website && (
                              <div className="flex items-center gap-2 text-xs group/item max-w-[200px]">
                                <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <a
                                  href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline font-medium truncate"
                                  title={lead.website}
                                >
                                  {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                                </a>
                                <button onClick={() => { navigator.clipboard.writeText(lead.website); toast.success('Website copied'); }} className="opacity-0 group-hover/item:opacity-100 transition-opacity p-1 text-gray-400 hover:text-gray-700" title="Copy Website"><Copy className="w-3 h-3" /></button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-middle hidden lg:table-cell overflow-hidden">
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-semibold text-gray-800 truncate" title={formatLocation(lead)}>
                              {formatLocation(lead)}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-middle">
                          <div className="flex flex-col gap-2.5 w-full pr-4">
                            <div className="flex flex-col gap-1" title="AI Website Analysis Rating">
                              <div className="flex justify-between items-center text-[10px] font-bold">
                                <span className="text-violet-600">AI</span>
                                <span className="text-violet-700">{lead.ai_score || 0}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full" style={{ width: `${lead.ai_score || 0}%` }}></div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1" title="Standard Lead Score">
                              <div className="flex justify-between items-center text-[10px] font-bold">
                                <span className="text-gray-500">SCORE</span>
                                <span className="text-gray-700">{lead.lead_score || 0}</span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden shadow-inner border border-gray-200">
                                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 shadow-[0_0_10px_rgba(59,130,246,0.5)] rounded-full transition-all duration-500" style={{ width: `${lead.lead_score || 0}%` }}></div>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => singleAiAnalysisMutation.mutate(lead._id)}
                              disabled={!lead.website || singleAiAnalysisMutation.isPending}
                              title={lead.website ? "Start AI Website Analysis" : "Website not available"}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 ${lead.website
                                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white active:scale-95'
                                : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                                }`}
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              Analyze
                            </button>
                            <button
                              onClick={() => router.push(`/dashboard/leads/detail?id=${lead._id}`)}
                              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="View Details"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* MOBILE RESPONSIVE CARDS (only visible on mobile) */}
          <div className="md:hidden flex flex-col gap-4">
            {leads.map((lead: any) => {
              const displayName = lead.name || lead.business_name || 'Unnamed Business';
              const initials = displayName ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'L';
              const gradientIndex = displayName.length % bgGradients.length;
              const avatarStyle = bgGradients[gradientIndex];

              return (
                <div
                  key={lead._id}
                  onClick={() => router.push(`/dashboard/leads/detail?id=${lead._id}`)}
                  className={`bg-white rounded-2xl border ${selectedIds.has(lead._id) ? 'border-blue-300 ring-1 ring-blue-300' : 'border-gray-200'} p-4 shadow-sm flex flex-col cursor-pointer transition-all hover:shadow-md`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm bg-gradient-to-br border ${avatarStyle} shrink-0`}>
                        {initials}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-gray-900 text-sm truncate">{displayName}</span>
                        <span className="text-[10px] font-bold text-gray-500 mt-0.5 uppercase tracking-wider truncate">{lead.category || 'Uncategorized'}</span>
                      </div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()} className="ml-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead._id)}
                        onChange={() => toggleSelect(lead._id)}
                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col gap-2 mb-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2 text-xs">
                      <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      {lead.phone ? <a href={`tel:${lead.phone}`} className="text-gray-700 font-mono font-medium truncate">{lead.phone}</a> : <span className="text-gray-400">—</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      {lead.email ? <a href={`mailto:${lead.email}`} className="text-gray-700 font-medium truncate">{lead.email}</a> : <span className="text-gray-400">—</span>}
                    </div>
                    {lead.website && (
                      <div className="flex items-center gap-2 text-xs">
                        <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 truncate">{lead.website}</a>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="text-gray-600 truncate">{formatLocation(lead)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-3 flex-1 pr-2">
                      <div className="flex flex-col gap-1 w-full" title="AI Score">
                        <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className="text-violet-600">AI</span>
                          <span className="text-violet-700">{lead.ai_score || 0}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full" style={{ width: `${lead.ai_score || 0}%` }}></div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); singleAiAnalysisMutation.mutate(lead._id); }}
                      disabled={!lead.website || singleAiAnalysisMutation.isPending}
                      className={`px-3 py-2 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 ${lead.website ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white active:scale-95' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Analyze
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center px-6 py-4 bg-white border border-slate-200 rounded-2xl gap-4 shadow-sm">
        <span className="text-sm font-medium text-slate-500">
          Showing <span className="font-bold text-slate-800">{Math.min(page * limit + 1, total)}</span> to <span className="font-bold text-slate-800">{Math.min((page + 1) * limit, total)}</span> of <span className="font-bold text-slate-800">{total}</span> leads
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-all shadow-sm"
          >
            Previous
          </button>
          <div className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 min-w-[40px] text-center shadow-inner">
            {page + 1}
          </div>
          <button
            disabled={(page + 1) * limit >= total}
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-all shadow-sm"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
