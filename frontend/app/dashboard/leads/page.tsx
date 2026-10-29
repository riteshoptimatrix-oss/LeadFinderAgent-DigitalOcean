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
  CheckCheck,
  MoreHorizontal,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  X,
  Tag,
  Star
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import LeadAnalysisDrawer from '@/src/components/ai-analysis/LeadAnalysisDrawer';
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

  // Draft filters for popover (committed only on "Apply Filters")
  const [draftCity, setDraftCity] = useState(cityFilter);
  const [draftCategory, setDraftCategory] = useState(categoryFilter);
  const [draftWebsite, setDraftWebsite] = useState(websiteFilter);
  const [draftPhone, setDraftPhone] = useState(phoneFilter);
  const [draftEmail, setDraftEmail] = useState(emailFilter);
  const [draftRating, setDraftRating] = useState(ratingFilter);
  const [draftStatus, setDraftStatus] = useState(statusFilter);
  const [draftSortBy, setDraftSortBy] = useState(sortBy);
  const [draftSortOrder, setDraftSortOrder] = useState<-1 | 1>(sortOrder);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openFilters = () => {
    setDraftCity(cityFilter);
    setDraftCategory(categoryFilter);
    setDraftWebsite(websiteFilter);
    setDraftPhone(phoneFilter);
    setDraftEmail(emailFilter);
    setDraftRating(ratingFilter);
    setDraftStatus(statusFilter);
    setDraftSortBy(sortBy);
    setDraftSortOrder(sortOrder);
    setFiltersOpen(true);
  };

  const applyDraftFilters = () => {
    setCityFilter(draftCity);
    setCategoryFilter(draftCategory);
    setWebsiteFilter(draftWebsite);
    setPhoneFilter(draftPhone);
    setEmailFilter(draftEmail);
    setRatingFilter(draftRating);
    setStatusFilter(draftStatus);
    setSortBy(draftSortBy);
    setSortOrder(draftSortOrder);
    setPage(0);
    setFiltersOpen(false);
  };

  const clearDraftFilters = () => {
    setDraftCity('');
    setDraftCategory('');
    setDraftWebsite('ALL');
    setDraftPhone('ALL');
    setDraftEmail('ALL');
    setDraftRating('ALL');
    setDraftStatus('ALL');
    setDraftSortBy('created_at');
    setDraftSortOrder(-1);
  };

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
    clearDraftFilters();
    setActiveSession(null);
    setPage(0);
    setFiltersOpen(false);
  };

  const activeFilterCount =
    (cityFilter ? 1 : 0) +
    (categoryFilter ? 1 : 0) +
    (websiteFilter !== 'ALL' ? 1 : 0) +
    (phoneFilter !== 'ALL' ? 1 : 0) +
    (emailFilter !== 'ALL' ? 1 : 0) +
    (ratingFilter !== 'ALL' ? 1 : 0) +
    (statusFilter !== 'ALL' ? 1 : 0) +
    (sortBy !== 'created_at' || sortOrder !== -1 ? 1 : 0);

  const draftActiveFilterCount =
    (draftCity ? 1 : 0) +
    (draftCategory ? 1 : 0) +
    (draftWebsite !== 'ALL' ? 1 : 0) +
    (draftPhone !== 'ALL' ? 1 : 0) +
    (draftEmail !== 'ALL' ? 1 : 0) +
    (draftRating !== 'ALL' ? 1 : 0) +
    (draftStatus !== 'ALL' ? 1 : 0) +
    (draftSortBy !== 'created_at' || draftSortOrder !== -1 ? 1 : 0);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeQueueId, setActiveQueueId] = useState<string | null>(null);

  // Modern Analysis Drawer & Real-Time Sync States
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLead, setDrawerLead] = useState<any | null>(null);
  const [drawerQueueId, setDrawerQueueId] = useState<string | null>(null);
  const [analyzingLeadIds, setAnalyzingLeadIds] = useState<Set<string>>(new Set());

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
    // Real-time synchronization: Adaptive polling while any lead is analyzing
    refetchInterval: (query: any) => {
      const activeRunning = query?.state?.data?.data?.some((l: any) =>
        ['analyzing', 'running', 'started', 'collecting', 'scoring', 'saving', 'queued'].includes(
          (l.ai_status || l.ai_analysis?.status || '').toLowerCase()
        )
      );
      return activeRunning || analyzingLeadIds.size > 0 ? 3000 : 15000;
    },
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
      return { ...res.data, leadId };
    },
    onSuccess: (data) => {
      const qId = data?.queue_id || data?.queueId;
      if (qId) {
        setDrawerQueueId(qId);
      } else if (data?.worker_id === "skipped") {
        setAnalyzingLeadIds(prev => {
          const next = new Set(prev);
          next.delete(data.leadId);
          return next;
        });
        toast.info("Analysis skipped: No professional website available for this lead");
      }
    },
    onError: (error: any, leadId) => {
      setAnalyzingLeadIds(prev => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
      const errMsg = error?.response?.data?.detail || "An error occurred starting AI analysis.";
      toast.error(errMsg);
    }
  });

  const handleLeadUpdated = (leadId: string, updatedSummary: any) => {
    // Optimistically update React Query's leads cache
    queryClient.setQueriesData({ queryKey: ['leads'] }, (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.data)) return oldData;
      const ai = updatedSummary?.ai_analysis || {};
      const cd = updatedSummary?.contact_discovery || {};
      const newAiScore = ai.overall_score || ai.overall_ai_score || 0;
      const newLeadScore = updatedSummary?.lead_score || ai.lead_score || 0;

      const updatedList = oldData.data.map((l: any) => {
        if (l._id !== leadId) return l;
        return {
          ...l,
          ai_score: newAiScore > 0 ? newAiScore : l.ai_score,
          lead_score: newLeadScore > 0 ? newLeadScore : l.lead_score,
          email: l.email || (cd.emails && cd.emails[0]) || (ai.emails && ai.emails[0]) || l.email,
          phone: l.phone || (cd.phones && cd.phones[0]) || (ai.phones && ai.phones[0]) || l.phone,
          ai_analysis: {
            ...(l.ai_analysis || {}),
            status: 'Completed',
            analysis_status: 'Completed',
            overall_score: newAiScore,
            lead_score: newLeadScore,
          }
        };
      });

      return {
        ...oldData,
        data: updatedList
      };
    });

    setAnalyzingLeadIds(prev => {
      const next = new Set(prev);
      next.delete(leadId);
      return next;
    });

    queryClient.invalidateQueries({ queryKey: ['leads'] });
  };

  const triggerAnalyze = (lead: any) => {
    if (!lead.website) {
      toast.info("This lead does not have a website listed.");
      return;
    }
    setDrawerLead(lead);
    setDrawerQueueId(null);
    setDrawerOpen(true);
    setAnalyzingLeadIds(prev => new Set(prev).add(lead._id));
    singleAiAnalysisMutation.mutate(lead._id);
  };

  const openLeadDrawer = (lead: any) => {
    setDrawerLead(lead);
    setDrawerQueueId(null);
    setDrawerOpen(true);
  };

  const getLeadAiInfo = (lead: any, isAnalyzing: boolean) => {
    if (isAnalyzing) {
      const rawProgress = lead.ai_progress ?? lead.ai_analysis?.progress ?? 68;
      return {
        status: 'analyzing',
        progress: Math.max(rawProgress, 10),
        label: 'Analyzing...',
        sublabel: lead.ai_stage ? lead.ai_stage : 'Started 2 mins ago',
      };
    }

    const rawStatus = (lead.ai_status || lead.ai_analysis?.status || lead.ai_analysis?.analysis_status || '').toLowerCase();
    const rawProgress = lead.ai_progress ?? lead.ai_analysis?.progress;
    const score = lead.ai_score ?? lead.ai_analysis?.overall_score ?? 0;

    if (rawStatus === 'completed' || score > 0) {
      return {
        status: 'completed',
        progress: 100,
        label: 'Completed',
        sublabel: null,
      };
    }
    if (rawStatus === 'queued' || rawStatus === 'waiting') {
      return {
        status: 'queued',
        progress: rawProgress ?? 10,
        label: 'Queued',
        sublabel: null,
      };
    }
    if (rawStatus === 'processing' || rawStatus === 'running' || rawStatus === 'in_progress') {
      return {
        status: 'processing',
        progress: rawProgress ?? 45,
        label: 'Processing',
        sublabel: null,
      };
    }
    if (rawStatus === 'analyzing') {
      return {
        status: 'analyzing',
        progress: rawProgress ?? 68,
        label: 'Analyzing...',
        sublabel: lead.ai_stage ? lead.ai_stage : 'Started 2 mins ago',
      };
    }
    if (rawStatus === 'failed') {
      return {
        status: 'failed',
        progress: 0,
        label: 'Failed',
        sublabel: null,
      };
    }

    return {
      status: 'not_analyzed',
      progress: 0,
      label: 'Not Analyzed',
      sublabel: null,
    };
  };

  const bgGradients = [
    'from-blue-500/10 to-indigo-500/10 text-blue-700 border-blue-100',
    'from-emerald-500/10 to-teal-500/10 text-emerald-700 border-emerald-100',
    'from-violet-500/10 to-purple-500/10 text-violet-700 border-violet-100',
    'from-rose-500/10 to-pink-500/10 text-rose-700 border-rose-100',
    'from-amber-500/10 to-orange-500/10 text-amber-700 border-amber-100'
  ];

  return (
    <div className="space-y-6 w-full min-h-screen pb-12">
      {/* Modern AI Analysis Slide-Over Detail Drawer */}
      <LeadAnalysisDrawer
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerLead(null);
          setDrawerQueueId(null);
        }}
        leadId={drawerLead?._id || null}
        initialQueueId={drawerQueueId}
        leadData={drawerLead}
        onLeadUpdated={handleLeadUpdated}
        onAnalysisStarted={(lId, qId) => {
          setAnalyzingLeadIds(prev => new Set(prev).add(lId));
          setDrawerQueueId(qId);
        }}
      />

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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 sm:p-6 rounded-xl border border-gray-200 shadow-2xs">
        <PageHeader title="Leads Directory" description={`Managing ${total} total leads in your CRM`} />

        <div className="flex flex-wrap gap-3">
          <button
            onClick={openBulkModal}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm font-semibold text-white shadow-2xs hover:shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-98"
          >
            <Sparkles className="w-4 h-4 text-white/90" /> Bulk AI Analysis
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-2xs flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4 text-gray-400" /> Export CSV
          </button>
          <button
            onClick={() => handleExport('excel')}
            className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-2xs flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4 text-gray-400" /> Export Excel
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
            className={`px-4 py-2.5 border rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-sm ${activeSession
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
              type="button"
              onClick={() => {
                if (filtersOpen) {
                  setFiltersOpen(false);
                } else {
                  openFilters();
                }
              }}
              className={`h-10 px-3.5 border rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-sm ${
                activeFilterCount > 0
                  ? 'bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100/70'
                  : filtersOpen
                  ? 'bg-slate-100 border-slate-300 text-slate-900 ring-2 ring-blue-500/20'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4 text-slate-500" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold leading-none shadow-xs">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${filtersOpen ? 'rotate-180 text-blue-600' : ''}`} />
            </button>

            {filtersOpen && (
              <div className="absolute left-0 sm:left-0 z-40 mt-2 w-[340px] sm:w-[420px] max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 flex flex-col gap-3.5 animate-in fade-in-0 zoom-in-95 duration-150">
                {/* Header */}
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Filter Leads</h4>
                      <p className="text-[10px] text-slate-500">Refine by location, contact info, and status</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                    title="Close filters"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Text search filters (City & Category) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      City
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="e.g. Ahmedabad"
                        value={draftCity}
                        onChange={(e) => setDraftCity(e.target.value)}
                        className="w-full pl-3 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                      {draftCity && (
                        <button
                          type="button"
                          onClick={() => setDraftCity('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                          title="Clear city"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-slate-400" />
                      Category
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="e.g. Real Estate"
                        value={draftCategory}
                        onChange={(e) => setDraftCategory(e.target.value)}
                        className="w-full pl-3 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                      />
                      {draftCategory && (
                        <button
                          type="button"
                          onClick={() => setDraftCategory('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                          title="Clear category"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2-Column Select Filters Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-slate-400" />
                      Website
                    </label>
                    <select
                      value={draftWebsite}
                      onChange={(e) => setDraftWebsite(e.target.value)}
                      className="w-full h-8.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="ALL">All</option>
                      <option value="HAS_WEBSITE">Has Website</option>
                      <option value="NO_WEBSITE">No Website</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" />
                      Phone
                    </label>
                    <select
                      value={draftPhone}
                      onChange={(e) => setDraftPhone(e.target.value)}
                      className="w-full h-8.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="ALL">All</option>
                      <option value="HAS_PHONE">Has Phone</option>
                      <option value="NO_PHONE">No Phone</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Mail className="w-3 h-3 text-slate-400" />
                      Email
                    </label>
                    <select
                      value={draftEmail}
                      onChange={(e) => setDraftEmail(e.target.value)}
                      className="w-full h-8.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="ALL">All</option>
                      <option value="HAS_EMAIL">Has Email</option>
                      <option value="NO_EMAIL">No Email</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-500" />
                      Min Rating
                    </label>
                    <select
                      value={draftRating}
                      onChange={(e) => setDraftRating(e.target.value)}
                      className="w-full h-8.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="ALL">All Ratings</option>
                      <option value="4">4.0+ Stars</option>
                      <option value="4.5">4.5+ Stars</option>
                    </select>
                  </div>
                </div>

                {/* Status & Sorting */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Lead Status
                    </label>
                    <select
                      value={draftStatus}
                      onChange={(e) => setDraftStatus(e.target.value)}
                      className="w-full h-8.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="ALL">All</option>
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="disqualified">Disqualified</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Sort By & Direction
                    </label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={draftSortBy}
                        onChange={(e) => setDraftSortBy(e.target.value)}
                        className="flex-1 min-w-0 h-8.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer"
                      >
                        <option value="created_at">Date Added</option>
                        <option value="name">Name</option>
                        <option value="google_rating">Rating</option>
                        <option value="review_count">Reviews</option>
                        <option value="category">Category</option>
                        <option value="status">Status</option>
                      </select>

                      {/* Compact Segmented Control */}
                      <div className="inline-flex h-8.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5 shrink-0 items-center">
                        <button
                          type="button"
                          onClick={() => setDraftSortOrder(1)}
                          className={`h-full px-2 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                            draftSortOrder === 1
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                          title="Ascending"
                        >
                          <ArrowUp className="w-3 h-3" />
                          <span className="text-[10px]">Asc</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraftSortOrder(-1)}
                          className={`h-full px-2 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
                            draftSortOrder === -1
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                          title="Descending"
                        >
                          <ArrowDown className="w-3 h-3" />
                          <span className="text-[10px]">Desc</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer with Clear All and Apply Filters */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-1">
                  <button
                    type="button"
                    onClick={clearDraftFilters}
                    className="text-xs font-semibold text-slate-500 hover:text-red-600 px-2 py-1.5 rounded-md transition-colors"
                  >
                    Reset
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFiltersOpen(false)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={applyDraftFilters}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                    >
                      <span>Apply Filters</span>
                      {draftActiveFilterCount > 0 && (
                        <span className="w-4 h-4 rounded-full bg-blue-500 text-[10px] flex items-center justify-center font-bold">
                          {draftActiveFilterCount}
                        </span>
                      )}
                    </button>
                  </div>
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
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mr-1">
            <Filter className="w-3.5 h-3.5 text-blue-600" />
            Active:
          </span>

          {activeSession && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium shadow-2xs">
              <span>Campaign: &quot;{activeSession.keyword}&quot;</span>
              <button
                type="button"
                onClick={() => { setActiveSession(null); setPage(0); }}
                className="text-blue-400 hover:text-blue-800 rounded p-0.5 hover:bg-blue-100/60 transition-colors"
                title="Remove campaign filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {searchQuery && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-slate-700 border border-slate-200 text-xs font-medium shadow-2xs">
              <span>Search: &quot;{searchQuery}&quot;</span>
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setPage(0); }}
                className="text-slate-400 hover:text-slate-700 rounded p-0.5 hover:bg-slate-100 transition-colors"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {cityFilter && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-slate-700 border border-slate-200 text-xs font-medium shadow-2xs">
              <span>City: {cityFilter}</span>
              <button
                type="button"
                onClick={() => { setCityFilter(''); setDraftCity(''); setPage(0); }}
                className="text-slate-400 hover:text-slate-700 rounded p-0.5 hover:bg-slate-100 transition-colors"
                title="Remove city filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {categoryFilter && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-slate-700 border border-slate-200 text-xs font-medium shadow-2xs">
              <span>Category: {categoryFilter}</span>
              <button
                type="button"
                onClick={() => { setCategoryFilter(''); setDraftCategory(''); setPage(0); }}
                className="text-slate-400 hover:text-slate-700 rounded p-0.5 hover:bg-slate-100 transition-colors"
                title="Remove category filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {websiteFilter !== 'ALL' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-slate-700 border border-slate-200 text-xs font-medium shadow-2xs">
              <span>Website: {websiteFilter === 'HAS_WEBSITE' ? 'Available' : 'Missing'}</span>
              <button
                type="button"
                onClick={() => { setWebsiteFilter('ALL'); setDraftWebsite('ALL'); setPage(0); }}
                className="text-slate-400 hover:text-slate-700 rounded p-0.5 hover:bg-slate-100 transition-colors"
                title="Remove website filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {phoneFilter !== 'ALL' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-slate-700 border border-slate-200 text-xs font-medium shadow-2xs">
              <span>Phone: {phoneFilter === 'HAS_PHONE' ? 'Available' : 'Missing'}</span>
              <button
                type="button"
                onClick={() => { setPhoneFilter('ALL'); setDraftPhone('ALL'); setPage(0); }}
                className="text-slate-400 hover:text-slate-700 rounded p-0.5 hover:bg-slate-100 transition-colors"
                title="Remove phone filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {emailFilter !== 'ALL' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-slate-700 border border-slate-200 text-xs font-medium shadow-2xs">
              <span>Email: {emailFilter === 'HAS_EMAIL' ? 'Available' : 'Missing'}</span>
              <button
                type="button"
                onClick={() => { setEmailFilter('ALL'); setDraftEmail('ALL'); setPage(0); }}
                className="text-slate-400 hover:text-slate-700 rounded p-0.5 hover:bg-slate-100 transition-colors"
                title="Remove email filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {ratingFilter !== 'ALL' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-slate-700 border border-slate-200 text-xs font-medium shadow-2xs">
              <span>Rating: ≥{ratingFilter}★</span>
              <button
                type="button"
                onClick={() => { setRatingFilter('ALL'); setDraftRating('ALL'); setPage(0); }}
                className="text-slate-400 hover:text-slate-700 rounded p-0.5 hover:bg-slate-100 transition-colors"
                title="Remove rating filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {statusFilter !== 'ALL' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-slate-700 border border-slate-200 text-xs font-medium shadow-2xs capitalize">
              <span>Status: {statusFilter}</span>
              <button
                type="button"
                onClick={() => { setStatusFilter('ALL'); setDraftStatus('ALL'); setPage(0); }}
                className="text-slate-400 hover:text-slate-700 rounded p-0.5 hover:bg-slate-100 transition-colors"
                title="Remove status filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {(sortBy !== 'created_at' || sortOrder !== -1) && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-slate-700 border border-slate-200 text-xs font-medium shadow-2xs">
              <span>Sort: {sortBy === 'google_rating' ? 'Rating' : sortBy === 'review_count' ? 'Reviews' : sortBy === 'created_at' ? 'Date' : sortBy} ({sortOrder === 1 ? 'Asc' : 'Desc'})</span>
              <button
                type="button"
                onClick={() => {
                  setSortBy('created_at');
                  setSortOrder(-1);
                  setDraftSortBy('created_at');
                  setDraftSortOrder(-1);
                  setPage(0);
                }}
                className="text-slate-400 hover:text-slate-700 rounded p-0.5 hover:bg-slate-100 transition-colors"
                title="Reset sorting"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={clearAllFilters}
            className="ml-auto text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline px-2 py-0.5 transition-colors"
          >
            Clear all
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

            const isAnalyzing = analyzingLeadIds.has(lead._id);
            const aiInfo = getLeadAiInfo(lead, isAnalyzing);
            const isDrawerSelected = drawerLead?._id === lead._id;

            return (
              <div
                key={lead._id}
                onClick={() => openLeadDrawer(lead)}
                className={`bg-white rounded-2xl border ${isDrawerSelected ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/20' : selectedIds.has(lead._id) ? 'border-blue-300 ring-1 ring-blue-300' : 'border-slate-200'} p-5 shadow-sm hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between group cursor-pointer relative`}
              >
                {/* Header section of card */}
                <div>
                  <div className="flex justify-between items-start gap-2 mb-3.5">
                    <span className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full border truncate max-w-[170px] ${avatarStyle}`}>
                      {lead.category || 'REAL ESTATE'}
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
                        <span className="truncate">{lead.city ? `${lead.city}, ${lead.country || 'India'}` : formatLocation(lead)}</span>
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

                {/* AI Progress & Footer */}
                <div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-slate-600">
                        {aiInfo.status === 'analyzing' ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                            <span>Analyzing...</span>
                          </>
                        ) : aiInfo.status === 'completed' ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>Completed</span>
                          </>
                        ) : aiInfo.status === 'queued' ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span>Queued</span>
                          </>
                        ) : aiInfo.status === 'processing' ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-blue-600" />
                            <span>Processing</span>
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            <span className="text-slate-500">Not Analyzed</span>
                          </>
                        )}
                      </div>
                      <span className="font-semibold text-slate-700">{aiInfo.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${aiInfo.status === 'completed'
                          ? 'bg-emerald-500'
                          : aiInfo.status === 'not_analyzed' || aiInfo.status === 'failed'
                            ? 'bg-transparent'
                            : 'bg-blue-600'
                          }`}
                        style={{ width: `${aiInfo.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center gap-2 pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                    {aiInfo.status === 'not_analyzed' || aiInfo.status === 'failed' ? (
                      <button
                        onClick={() => triggerAnalyze(lead)}
                        disabled={!lead.website}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border shadow-2xs flex items-center justify-center gap-1.5 ${lead.website ? 'border-blue-200 text-blue-600 bg-white hover:bg-blue-50 active:scale-95' : 'border-slate-200 text-slate-300 bg-slate-50 cursor-not-allowed'
                          }`}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        Analyze
                      </button>
                    ) : (
                      <button
                        onClick={() => openLeadDrawer(lead)}
                        className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 shadow-2xs flex items-center justify-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        AI Insights
                      </button>
                    )}
                    <button
                      onClick={() => router.push(`/dashboard/leads/detail?id=${lead._id}`)}
                      className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      title="View Details"
                    >
                      <MoreHorizontal className="w-4 h-4" />
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
                    <th className="px-5 py-3.5 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={leads.length > 0 && selectedIds.size === leads.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-5 py-3.5 w-[28%] text-xs font-bold text-gray-500 uppercase tracking-wider">Business</th>
                    <th className="px-5 py-3.5 w-[24%] text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-5 py-3.5 w-[16%] hidden lg:table-cell text-xs font-bold text-gray-500 uppercase tracking-wider">Location</th>
                    <th className="px-5 py-3.5 w-[20%] text-xs font-bold text-gray-500 uppercase tracking-wider">AI Progress</th>
                    <th className="px-5 py-3.5 w-[12%] text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {leads.map((lead: any) => {
                    const displayName = lead.name || lead.business_name || 'Unnamed Business';
                    const initials = displayName ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'L';
                    const gradientIndex = displayName.length % bgGradients.length;
                    const avatarStyle = bgGradients[gradientIndex];
                    const isAnalyzing = analyzingLeadIds.has(lead._id);
                    const aiInfo = getLeadAiInfo(lead, isAnalyzing);
                    const isDrawerSelected = drawerLead?._id === lead._id;

                    return (
                      <tr
                        key={lead._id}
                        onClick={() => openLeadDrawer(lead)}
                        className={`group transition-all cursor-pointer ${isDrawerSelected
                          ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                          : selectedIds.has(lead._id)
                            ? 'bg-blue-50/40'
                            : 'hover:bg-slate-50/80'
                          }`}
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
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm bg-gradient-to-br border ${avatarStyle} shrink-0 shadow-2xs`}>
                              {initials}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-bold text-gray-900 text-sm truncate hover:text-blue-600 transition-colors" title={displayName}>
                                {displayName}
                              </span>
                              <span className="text-[11px] font-bold text-gray-400 mt-0.5 uppercase tracking-wider truncate" title={lead.category || 'REAL ESTATE'}>
                                {lead.category || 'REAL ESTATE'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-middle overflow-hidden" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col gap-1 w-full">
                            <div className="flex items-center gap-2 text-xs group/item max-w-[200px]">
                              <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              {lead.phone ? (
                                <>
                                  <a href={`tel:${lead.phone}`} className="text-gray-700 hover:text-blue-600 font-mono font-medium truncate" title={lead.phone}>{lead.phone}</a>
                                  <button onClick={() => { navigator.clipboard.writeText(lead.phone); toast.success('Phone copied'); }} className="opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 text-gray-400 hover:text-gray-700" title="Copy Phone"><Copy className="w-3 h-3" /></button>
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
                                  <button onClick={() => { navigator.clipboard.writeText(lead.email); toast.success('Email copied'); }} className="opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 text-gray-400 hover:text-gray-700" title="Copy Email"><Copy className="w-3 h-3" /></button>
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
                                <button onClick={() => { navigator.clipboard.writeText(lead.website); toast.success('Website copied'); }} className="opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 text-gray-400 hover:text-gray-700" title="Copy Website"><Copy className="w-3 h-3" /></button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-middle hidden lg:table-cell overflow-hidden">
                          <div className="flex items-start gap-2 min-w-0">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-medium text-gray-800 truncate" title={lead.city ? `${lead.city}${lead.state ? `, ${lead.state}` : ''}` : formatLocation(lead)}>
                                {lead.city ? `${lead.city}${lead.state ? `, ${lead.state}` : ''}` : formatLocation(lead)}
                              </span>
                              <span className="text-[11px] text-gray-400 font-normal truncate">
                                {lead.country || 'India'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-middle" onClick={(e) => { e.stopPropagation(); openLeadDrawer(lead); }}>
                          <div className="flex flex-col gap-1.5 w-full max-w-[190px]">
                            <div className="flex justify-end items-center text-xs font-semibold text-slate-700">
                              <span>{aiInfo.progress}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${aiInfo.status === 'completed'
                                  ? 'bg-emerald-500'
                                  : aiInfo.status === 'not_analyzed' || aiInfo.status === 'failed'
                                    ? 'bg-transparent'
                                    : 'bg-blue-600'
                                  }`}
                                style={{ width: `${aiInfo.progress}%` }}
                              />
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium pt-0.5">
                              {aiInfo.status === 'analyzing' ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                                  <span className="truncate text-slate-600">
                                    Analyzing...
                                    {aiInfo.sublabel && (
                                      <span className="text-[11px] text-slate-400 block sm:inline sm:ml-1">
                                        {aiInfo.sublabel}
                                      </span>
                                    )}
                                  </span>
                                </>
                              ) : aiInfo.status === 'completed' ? (
                                <>
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                  <span>Completed</span>
                                </>
                              ) : aiInfo.status === 'queued' ? (
                                <>
                                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                  <span>Queued</span>
                                </>
                              ) : aiInfo.status === 'processing' ? (
                                <>
                                  <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                                  <span>Processing</span>
                                </>
                              ) : (
                                <>
                                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                                  <span className="text-slate-500">Not Analyzed</span>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {aiInfo.status === 'not_analyzed' || aiInfo.status === 'failed' ? (
                              <button
                                onClick={() => triggerAnalyze(lead)}
                                disabled={!lead.website}
                                title={lead.website ? "Start AI Website Analysis" : "Website not available"}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 shadow-2xs ${lead.website
                                  ? 'border-blue-200 text-blue-600 hover:bg-blue-50 active:scale-95 cursor-pointer bg-white'
                                  : 'border-slate-200 text-slate-300 bg-slate-50 cursor-not-allowed'
                                  }`}
                              >
                                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                                Analyze
                              </button>
                            ) : (
                              <button
                                onClick={() => openLeadDrawer(lead)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                                title="View AI Analysis Insights"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                                AI Insights
                              </button>
                            )}
                            <button
                              onClick={() => router.push(`/dashboard/leads/detail?id=${lead._id}`)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              title="More Actions / View Details"
                            >
                              <MoreHorizontal className="w-4 h-4" />
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
              const isAnalyzing = analyzingLeadIds.has(lead._id);
              const aiInfo = getLeadAiInfo(lead, isAnalyzing);
              const isDrawerSelected = drawerLead?._id === lead._id;

              return (
                <div
                  key={lead._id}
                  onClick={() => openLeadDrawer(lead)}
                  className={`bg-white rounded-2xl border ${isDrawerSelected ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50/20' : selectedIds.has(lead._id) ? 'border-blue-300 ring-1 ring-blue-300' : 'border-gray-200'} p-4 shadow-sm flex flex-col cursor-pointer transition-all hover:shadow-md`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm bg-gradient-to-br border ${avatarStyle} shrink-0`}>
                        {initials}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-gray-900 text-sm truncate">{displayName}</span>
                        <span className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-wider truncate">{lead.category || 'REAL ESTATE'}</span>
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

                  <div className="bg-gray-50 rounded-xl p-3 flex flex-col gap-2 mb-3" onClick={(e) => e.stopPropagation()}>
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
                      <span className="text-gray-600 truncate">{lead.city ? `${lead.city}, ${lead.country || 'India'}` : formatLocation(lead)}</span>
                    </div>
                  </div>

                  {/* AI Progress inside Card */}
                  <div className="flex flex-col gap-1.5 pt-1 pb-3">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-slate-600">
                        {aiInfo.status === 'analyzing' ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                            <span>Analyzing...</span>
                          </>
                        ) : aiInfo.status === 'completed' ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>Completed</span>
                          </>
                        ) : aiInfo.status === 'queued' ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span>Queued</span>
                          </>
                        ) : aiInfo.status === 'processing' ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-blue-600" />
                            <span>Processing</span>
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            <span className="text-slate-500">Not Analyzed</span>
                          </>
                        )}
                      </div>
                      <span className="font-semibold text-slate-700">{aiInfo.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${aiInfo.status === 'completed'
                          ? 'bg-emerald-500'
                          : aiInfo.status === 'not_analyzed' || aiInfo.status === 'failed'
                            ? 'bg-transparent'
                            : 'bg-blue-600'
                          }`}
                        style={{ width: `${aiInfo.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center gap-2 pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                    {aiInfo.status === 'not_analyzed' || aiInfo.status === 'failed' ? (
                      <button
                        onClick={() => triggerAnalyze(lead)}
                        disabled={!lead.website}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border shadow-2xs flex items-center justify-center gap-1.5 ${lead.website ? 'border-blue-200 text-blue-600 bg-white hover:bg-blue-50 active:scale-95' : 'border-slate-200 text-slate-300 bg-slate-50 cursor-not-allowed'
                          }`}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        Analyze
                      </button>
                    ) : (
                      <button
                        onClick={() => openLeadDrawer(lead)}
                        className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 shadow-2xs flex items-center justify-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                        AI Insights
                      </button>
                    )}
                    <button
                      onClick={() => router.push(`/dashboard/leads/detail?id=${lead._id}`)}
                      className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      title="More Actions"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center px-6 py-3.5 bg-white border border-slate-200 rounded-2xl gap-4 shadow-2xs">
        <span className="text-xs font-medium text-slate-500">
          Showing <span className="font-bold text-slate-800">{total > 0 ? page * limit + 1 : 0}</span> to <span className="font-bold text-slate-800">{Math.min((page + 1) * limit, total)}</span> of <span className="font-bold text-slate-800">{total}</span> leads
        </span>
        <div className="flex items-center gap-1.5">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
            title="Previous Page"
          >
            &lt;
          </button>
          {Array.from({ length: Math.min(totalPages || 1, 5) }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setPage(idx)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center shadow-2xs ${page === idx
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
            >
              {idx + 1}
            </button>
          ))}
          <button
            disabled={(page + 1) * limit >= total}
            onClick={() => setPage(p => p + 1)}
            className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
            title="Next Page"
          >
            &gt;
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Show</span>
          <span className="font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">10</span>
          <span>per page</span>
        </div>
      </div>
    </div>
  );
}
