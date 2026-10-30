'use client';

import { useState, useEffect, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
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
  ChevronLeft,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Copy,
  History,
  Loader2,
  CheckCheck,
  X,
  SlidersHorizontal,
  MoreHorizontal,
  Plus,
  Building2,
  MapPin,
  ExternalLink,
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import type { SearchSession } from '@/src/components/search-sessions/SearchSessionsModal';
import SearchSessionBanner from '@/src/components/search-sessions/SearchSessionBanner';
import { formatLocation } from '@/src/lib/utils';

// Dynamically import heavy drawer and modals to keep the initial page chunk light and fast
const LeadAnalysisDrawer = dynamic(() => import('@/src/components/leads/LeadAnalysisDrawer'), { ssr: false });
const BulkAIAnalysisMonitor = dynamic(() => import('@/src/components/ai-analysis/BulkAIAnalysisMonitor'), { ssr: false });
const BulkAnalysisModal = dynamic(() => import('@/src/components/ai-analysis/BulkAnalysisModal'), { ssr: false });
const SearchSessionsModal = dynamic(() => import('@/src/components/search-sessions/SearchSessionsModal'), { ssr: false });

// Helper to calculate time elapsed for running jobs
function formatStartedAgo(dateStr?: string | null): string {
  if (!dateStr) return 'just now';
  try {
    const started = new Date(dateStr).getTime();
    const now = Date.now();
    const diffMs = now - started;
    if (diffMs < 0 || isNaN(diffMs)) return 'just now';
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} mins ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
  } catch {
    return 'just now';
  }
}

// Helper to compute AI Analysis display state from backend-persisted fields
function getLeadAnalysisState(lead: any) {
  const ai = lead.ai_analysis;
  if (!ai) {
    return {
      status: 'not_analyzed',
      label: 'Not Analyzed',
      progress: 0,
      startedAt: null,
    };
  }

  const rawStatus = (ai.analysis_status || ai.status || '').toLowerCase();
  const rawProgress = typeof ai.progress === 'number' ? ai.progress : 0;
  const startedAt = ai.analysis_started_at || ai.started_at || null;

  const hasPositiveScore = Boolean(
    (lead.ai_score && lead.ai_score > 0) ||
    (ai.overall_score && ai.overall_score > 0) ||
    (ai.overall_ai_score && ai.overall_ai_score > 0) ||
    (lead.lead_score && lead.lead_score > 0)
  );

  // Completed states: completed, done, partial_success
  if (['completed', 'done', 'partial_success'].includes(rawStatus)) {
    return {
      status: 'completed',
      label: 'Completed',
      progress: 100,
      startedAt,
    };
  }

  // If score is present and not actively running
  if (hasPositiveScore && !['running', 'started', 'collecting', 'analyzing', 'scoring', 'saving'].includes(rawStatus)) {
    return {
      status: 'completed',
      label: 'Completed',
      progress: 100,
      startedAt,
    };
  }

  // Guard against stale stuck states: if started > 300 seconds (5 min) ago
  const isStale = Boolean(startedAt && (Date.now() - new Date(startedAt).getTime() > 300000));
  if (isStale && ['queued', 'waiting', 'running', 'in_progress', 'started', 'collecting', 'analyzing'].includes(rawStatus)) {
    if (hasPositiveScore) {
      return {
        status: 'completed',
        label: 'Completed',
        progress: 100,
        startedAt,
      };
    }
    return {
      status: 'failed',
      label: 'Failed',
      progress: 0,
      startedAt,
    };
  }

  // Queued / waiting states
  if (['queued', 'waiting'].includes(rawStatus)) {
    return {
      status: 'queued',
      label: 'Queued',
      progress: Math.max(rawProgress, 10),
      startedAt,
    };
  }

  // Active running / analyzing states
  if (['running', 'in_progress', 'started', 'collecting', 'analyzing', 'scoring', 'saving'].includes(rawStatus)) {
    return {
      status: 'analyzing',
      label: 'Analyzing...',
      progress: Math.max(rawProgress, 25),
      startedAt,
    };
  }

  // Processing state
  if (rawStatus === 'processing') {
    return {
      status: 'processing',
      label: 'Processing',
      progress: Math.max(rawProgress, 45),
      startedAt,
    };
  }

  // Failed / error states
  if (['failed', 'error', 'failed_timeout', 'cancelled'].includes(rawStatus)) {
    return {
      status: 'failed',
      label: 'Failed',
      progress: rawProgress || 0,
      startedAt,
    };
  }

  return {
    status: 'not_analyzed',
    label: 'Not Analyzed',
    progress: 0,
    startedAt: null,
  };
}

function LeadsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const urlJobId = searchParams.get('job_id');

  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Currently starting analysis indicator per lead
  const [startingAnalysisId, setStartingAnalysisId] = useState<string | null>(null);
  
  // Load analyzing IDs from sessionStorage to survive page refresh
  const [analyzingLeadIds, setAnalyzingLeadIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('optimatrix_analyzing_leads');
        if (stored) {
          const parsed: Record<string, number> = JSON.parse(stored);
          const now = Date.now();
          const valid = Object.entries(parsed)
            .filter(([_, ts]) => now - Number(ts) < 300000)
            .map(([id]) => id);
          return new Set(valid);
        }
      } catch {}
    }
    return new Set();
  });

  // Sync analyzingLeadIds to sessionStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const entries: Record<string, number> = {};
        const now = Date.now();
        analyzingLeadIds.forEach(id => {
          entries[id] = now;
        });
        sessionStorage.setItem('optimatrix_analyzing_leads', JSON.stringify(entries));
      } catch {}
    }
  }, [analyzingLeadIds]);

  // Lead Analysis Drawer state
  const [selectedDrawerLead, setSelectedDrawerLead] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerAutoStart, setDrawerAutoStart] = useState(false);

  // Add Lead Modal state
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({
    name: '',
    phone: '',
    email: '',
    website: '',
    category: '',
    city: '',
    state: '',
    address: ''
  });

  const handleOpenAnalysisDrawer = (targetLead: any, autoStart: boolean = false) => {
    setSelectedDrawerLead(targetLead);
    setDrawerAutoStart(autoStart);
    setDrawerOpen(true);
  };

  const handleSingleAnalysisComplete = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['leads'], refetchType: 'active' }),
      queryClient.invalidateQueries({ queryKey: ['lead'], refetchType: 'active' }),
      queryClient.invalidateQueries({ queryKey: ['leadAnalysisSummary'], refetchType: 'active' }),
    ]);
    await queryClient.refetchQueries({ queryKey: ['leads'], type: 'active' });
  };

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkModalNonce, setBulkModalNonce] = useState(0);
  const [bulkQueueId, setBulkQueueId] = useState<string | null>(null);
  const [bulkQueueName, setBulkQueueName] = useState('Bulk AI Website Analysis');
  const [bulkMinimized, setBulkMinimized] = useState(false);

  const [sessionsModalOpen, setSessionsModalOpen] = useState(false);
  const [activeSession, setActiveSession] = useState<SearchSession | null>(null);

  // Available campaigns for dropdown and lookup
  const { data: campaignOptionsData } = useQuery({
    queryKey: ['campaignOptions'],
    queryFn: async () => {
      try {
        const res = await api.get('/search/sessions?limit=50&sort_by=newest');
        return (res.data?.data || []) as SearchSession[];
      } catch {
        return [];
      }
    },
    staleTime: 30000,
  });

  // Sync activeSession with URL job_id parameter
  useEffect(() => {
    if (urlJobId) {
      if (!activeSession || (activeSession.job_id !== urlJobId && activeSession.id !== urlJobId)) {
        const found = campaignOptionsData?.find(c => (c.job_id || c.id) === urlJobId);
        if (found) {
          setActiveSession(found);
        } else {
          api.get(`/search/sessions/${urlJobId}`)
            .then((res) => {
              if (res.data?.data) {
                setActiveSession(res.data.data);
              }
            })
            .catch(() => {
              setActiveSession({
                id: urlJobId,
                job_id: urlJobId,
                keyword: 'Campaign Leads',
                country: '',
                state: '',
                city: '',
                area: '',
                provider: 'Google Maps',
                search_date: '',
                search_time: '',
                duration_seconds: 0,
                status: 'COMPLETED',
                progress: 100,
                requested_leads: 0,
                total_found: 0,
                total_saved: 0,
                leads_count: 0,
                accepted_leads: 0,
                duplicate_leads: 0,
                failed_leads: 0,
                ai_analysis_completed: 0,
                ai_analysis_pending: 0,
                created_at: '',
              });
            });
        }
      }
    }
  }, [urlJobId, campaignOptionsData]);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterCity, setFilterCity] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterHasWebsite, setFilterHasWebsite] = useState(false);
  const [filterHasPhone, setFilterHasPhone] = useState(false);
  const [filterHasEmail, setFilterHasEmail] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState(-1);

  const handleClearSession = () => {
    setActiveSession(null);
    setPage(0);
    router.replace('/dashboard/leads');
    queryClient.invalidateQueries({ queryKey: ['leads'] });
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setPage(0);
    setActiveSession(null);
    router.replace('/dashboard/leads');
    setFilterCity('');
    setFilterCategory('');
    setFilterHasWebsite(false);
    setFilterHasPhone(false);
    setFilterHasEmail(false);
    setFilterStatus('');
  };

  // Check backend for active bulk queues to restore state on navigation/refresh
  const { data: bulkQueuesData } = useQuery({
    queryKey: ['activeBulkQueues'],
    queryFn: async () => {
      try {
        const res = await api.get('/ai-analysis/bulk/queues');
        return res.data || [];
      } catch {
        return [];
      }
    },
    refetchInterval: (query: any) => {
      const queues = query.state.data || [];
      const hasActive = queues.some((q: any) =>
        ['RUNNING', 'PENDING', 'PAUSED'].includes((q.status || '').toUpperCase()) ||
        (q.running_jobs && q.running_jobs > 0) ||
        (q.pending_jobs && q.pending_jobs > 0)
      );
      return hasActive ? 3000 : 30000;
    },
  });

  const activeBulkQueue = Array.isArray(bulkQueuesData)
    ? bulkQueuesData.find((q: any) =>
      ['RUNNING', 'PENDING', 'PAUSED'].includes((q.status || '').toUpperCase()) ||
      (q.running_jobs && q.running_jobs > 0) ||
      (q.pending_jobs && q.pending_jobs > 0)
    )
    : null;

  // Auto-restore bulk queue ID if an active bulk job is running on the backend
  useEffect(() => {
    if (activeBulkQueue && !bulkQueueId) {
      setBulkQueueId(activeBulkQueue.id);
      setBulkQueueName(activeBulkQueue.name || 'Bulk AI Website Analysis');
      setBulkMinimized(true);
    }
  }, [activeBulkQueue, bulkQueueId]);

  // Main leads query with automatic backend sync
  const { data, isLoading } = useQuery({
    queryKey: [
      'leads',
      page,
      limit,
      searchQuery,
      activeSession?.job_id,
      filterCity,
      filterCategory,
      filterHasWebsite,
      filterHasPhone,
      filterHasEmail,
      filterStatus,
      sortBy,
      sortOrder
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
      if (filterCity) params.append('city', filterCity);
      if (filterCategory) params.append('category', filterCategory);
      if (filterHasWebsite) params.append('has_website', 'true');
      if (filterHasPhone) params.append('has_phone', 'true');
      if (filterHasEmail) params.append('has_email', 'true');
      if (filterStatus) params.append('status', filterStatus);

      const res = await api.get(`/leads?${params.toString()}`);
      return res.data;
    },
    // Auto-poll every 3s if any lead is actively analyzing/queued or bulk is active, else 15s
    refetchInterval: (query: any) => {
      const currentLeads = query.state.data?.data || [];
      const hasActiveLead = currentLeads.some((l: any) => {
        const s = (l.ai_analysis?.analysis_status || l.ai_analysis?.status || '').toLowerCase();
        return s === 'running' || s === 'queued' || s === 'processing' || s === 'in_progress';
      });
      return hasActiveLead || Boolean(activeBulkQueue) ? 3000 : 15000;
    },
  });

  const leads = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit) || 1;

  const activeFiltersCount = [
    filterCity,
    filterCategory,
    activeSession?.job_id,
    filterHasWebsite,
    filterHasPhone,
    filterHasEmail,
    filterStatus
  ].filter(Boolean).length;

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

  // Start individual AI analysis with immediate backend trigger and optimistic UI update
  const handleStartAnalysis = async (lead: any) => {
    if (!lead.website) {
      toast.error('Cannot analyze: Lead has no website available');
      return;
    }
    const leadId = lead._id;
    setStartingAnalysisId(leadId);
    setAnalyzingLeadIds(prev => new Set(prev).add(leadId));
    try {
      const res = await api.post(`/leads/${leadId}/start-analysis`);
      const resData = res.data;
      if (resData?.worker_id === 'skipped') {
        setAnalyzingLeadIds(prev => {
          const next = new Set(prev);
          next.delete(leadId);
          return next;
        });
        toast.info('Analysis skipped: No professional website available for this lead');
      } else {
        toast.success('AI Analysis started', {
          description: `Analysis queued for ${lead.name || lead.business_name || 'lead'}.`
        });

        // Invalidate queries so fresh backend telemetry syncs immediately
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      }
    } catch (err: any) {
      setAnalyzingLeadIds(prev => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
      toast.error(err?.response?.data?.detail || 'Failed to start AI analysis');
    } finally {
      setStartingAnalysisId(null);
    }
  };

  // Auto-clear active analyzing tracking when lead finishes analysis
  useEffect(() => {
    if (analyzingLeadIds.size > 0 && leads.length > 0) {
      leads.forEach((l: any) => {
        const state = getLeadAnalysisState(l);
        if (state.status === 'completed' && analyzingLeadIds.has(l._id)) {
          setAnalyzingLeadIds(prev => {
            const next = new Set(prev);
            next.delete(l._id);
            return next;
          });
        }
      });
    }
  }, [leads, analyzingLeadIds]);

  // Navigate to individual lead detail page
  const handleOpenLeadDetail = (leadId: string) => {
    router.push(`/dashboard/leads/detail?id=${leadId}`);
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
      const res = await api.get(`/leads/ids?${params.toString()}`);
      setSelectedIds(new Set(res.data?.data || []));
      toast.success(`Selected ${res.data?.total || 0} leads`);
    } catch {
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

  const createLeadMutation = useMutation({
    mutationFn: async (payload: typeof newLeadForm) => {
      const res = await api.post('/leads', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setIsAddLeadOpen(false);
      setNewLeadForm({
        name: '',
        phone: '',
        email: '',
        website: '',
        category: '',
        city: '',
        state: '',
        address: ''
      });
      toast.success('Lead created successfully');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to create lead');
    }
  });

  const handleBulkQueueCompletion = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['leads'], refetchType: 'active' }),
      queryClient.invalidateQueries({ queryKey: ['lead'], refetchType: 'active' }),
      queryClient.invalidateQueries({ queryKey: ['leadAnalysisSummary'], refetchType: 'active' }),
      queryClient.invalidateQueries({ queryKey: ['activeBulkQueues'], refetchType: 'active' }),
    ]);

    await queryClient.refetchQueries({ queryKey: ['leads'], type: 'active' });

    toast.success('Bulk AI Analysis Completed', {
      description: 'Bulk website analysis has finished. Your leads table has been updated.',
      duration: 6000,
    });
  };

  const buildBulkFilters = () => {
    const f: Record<string, string | boolean> = {};
    if (activeSession?.job_id) f.job_id = activeSession.job_id;
    if (searchQuery) f.keyword = searchQuery;
    if (filterCity) f.city = filterCity;
    if (filterCategory) f.category = filterCategory;
    if (filterHasWebsite) f.has_website = true;
    if (filterHasPhone) f.has_phone = true;
    if (filterHasEmail) f.has_email = true;
    if (filterStatus) f.status = filterStatus;
    return f;
  };

  const openBulkModal = () => {
    if (activeBulkQueue) {
      setBulkQueueId(activeBulkQueue.id);
      setBulkQueueName(activeBulkQueue.name || 'Bulk AI Website Analysis');
      setBulkMinimized(false);
      return;
    }
    setBulkQueueId(null);
    setBulkModalNonce(n => n + 1);
    setBulkModalOpen(true);
  };

  const handleBulkStarted = (queueId: string, name: string) => {
    setBulkModalOpen(false);
    setBulkQueueName(name);
    setBulkQueueId(queueId);
    setBulkMinimized(false);
    queryClient.invalidateQueries({ queryKey: ['activeBulkQueues'] });
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
    } catch {
      toast.error('Failed to export leads');
    }
  };

  // Avatar palette
  const avatarPalettes = [
    { bg: 'bg-rose-50 text-rose-600 border-rose-100' },
    { bg: 'bg-blue-50 text-blue-600 border-blue-100' },
    { bg: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
    { bg: 'bg-purple-50 text-purple-600 border-purple-100' },
    { bg: 'bg-amber-50 text-amber-600 border-amber-100' },
    { bg: 'bg-teal-50 text-teal-600 border-teal-100' },
  ];

  return (
    <div className="w-full space-y-5 pb-12">
      {/* Lead Analysis Drawer (Only opens when AI Insights or Analyzing is clicked) */}
      <LeadAnalysisDrawer
        isOpen={drawerOpen}
        leadId={selectedDrawerLead?._id || null}
        initialLead={selectedDrawerLead}
        autoStartAnalysis={drawerAutoStart}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedDrawerLead(null);
          setDrawerAutoStart(false);
        }}
        onAnalysisComplete={handleSingleAnalysisComplete}
      />

      {/* Bulk Analysis Live Monitor */}
      {bulkQueueId && (
        <BulkAIAnalysisMonitor
          queueId={bulkQueueId}
          queueName={bulkQueueName}
          isMinimized={bulkMinimized}
          onMinimizeChange={setBulkMinimized}
          onClose={() => {
            setBulkQueueId(null);
            setBulkMinimized(false);
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['activeBulkQueues'] });
          }}
          onComplete={handleBulkQueueCompletion}
        />
      )}

      {/* Bulk Analysis Modal */}
      <BulkAnalysisModal
        key={bulkModalNonce}
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onStarted={handleBulkStarted}
        leadIds={selectedIds.size > 0 ? Array.from(selectedIds) : undefined}
        filters={selectedIds.size > 0 ? undefined : buildBulkFilters()}
        scopeLabel={selectedIds.size > 0 ? `${selectedIds.size} selected lead${selectedIds.size === 1 ? '' : 's'}` : 'all matching leads'}
      />

      {/* Search Campaigns Modal */}
      <SearchSessionsModal
        isOpen={sessionsModalOpen}
        onClose={() => setSessionsModalOpen(false)}
        activeJobId={activeSession?.job_id ?? null}
        onClearFilter={handleClearSession}
        onViewLeads={(session) => {
          setActiveSession(session);
          setSessionsModalOpen(false);
          setPage(0);
          router.replace(`/dashboard/leads?job_id=${session.job_id || session.id}`);
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        }}
      />

      {activeSession && (
        <SearchSessionBanner
          session={activeSession}
          onClear={handleClearSession}
        />
      )}

      {/* Add Lead Modal Dialog */}
      {isAddLeadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Add New Lead</h3>
              <button
                onClick={() => setIsAddLeadOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase">Business Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Royale Realtors India"
                  value={newLeadForm.name}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase">Phone</label>
                  <input
                    type="text"
                    placeholder="e.g. 098183 12077"
                    value={newLeadForm.phone}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase">Email</label>
                  <input
                    type="email"
                    placeholder="e.g. info@royalerealtorsindia.com"
                    value={newLeadForm.email}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase">Website</label>
                <input
                  type="text"
                  placeholder="e.g. royalerealtorsindia.com"
                  value={newLeadForm.website}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, website: e.target.value })}
                  className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase">Category</label>
                  <input
                    type="text"
                    placeholder="Real Estate"
                    value={newLeadForm.category}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, category: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase">City</label>
                  <input
                    type="text"
                    placeholder="South Delhi"
                    value={newLeadForm.city}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, city: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase">State</label>
                  <input
                    type="text"
                    placeholder="Delhi"
                    value={newLeadForm.state}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, state: e.target.value })}
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsAddLeadOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={!newLeadForm.name.trim() || createLeadMutation.isPending}
                onClick={() => createLeadMutation.mutate(newLeadForm)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                {createLeadMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Save Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOP HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Leads</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage and analyze your business leads with AI-powered insights.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {/* Bulk AI Analysis Button: Shows live processing state when a bulk job is active */}
          {activeBulkQueue ? (
            <button
              onClick={() => {
                setBulkQueueId(activeBulkQueue.id);
                setBulkQueueName(activeBulkQueue.name || 'Bulk AI Website Analysis');
                setBulkMinimized(false);
              }}
              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              title="Click to view live bulk analysis monitor"
            >
              <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
              <span>
                Analyzing Bulk ({activeBulkQueue.completed_jobs || 0}/{activeBulkQueue.total_jobs || 0})
              </span>
            </button>
          ) : (
            <button
              onClick={openBulkModal}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              Bulk AI Analyze
            </button>
          )}

          {/* Search Campaign Button (Moved to main action area alongside Add Lead) */}
          <button
            onClick={() => setSessionsModalOpen(true)}
            className={`px-3.5 py-2.5 rounded-xl text-sm font-semibold border transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs active:scale-98 ${activeSession
              ? 'bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-500/20'
              : 'bg-white text-slate-700 hover:text-slate-900 border-slate-200 hover:bg-slate-50'
              }`}
            title="Browse search campaigns"
          >
            <History className="w-4 h-4 text-blue-600" />
            <span>Search Campaign</span>
            {activeSession && (
              <span className="w-2 h-2 rounded-full bg-blue-600" />
            )}
          </button>

          <div className="relative group">
            <button
              className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 hover:text-slate-900 transition-all shadow-xs cursor-pointer"
              title="More Actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-full mt-1.5 w-40 bg-white border border-slate-200 rounded-xl shadow-lg p-1 hidden group-hover:block z-30">
              <button
                onClick={() => handleExport('csv')}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" /> Export CSV
              </button>
              <button
                onClick={() => handleExport('excel')}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" /> Export Excel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH, FILTERS & VIEW CONTROLS */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search leads by business name, email, phone..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3.5 py-2.5 border rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-2xs cursor-pointer ${showFilters || activeFiltersCount > 0
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
            >
              <Filter className="w-4 h-4 text-slate-500" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center leading-none">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm shadow-2xs">
              <span className="text-xs text-slate-400">Sort by</span>
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(0);
                }}
                className="bg-transparent font-medium text-slate-700 outline-none text-xs cursor-pointer pr-1"
              >
                <option value="created_at">Date Added</option>
                <option value="google_rating">Google Rating</option>
                <option value="review_count">Reviews</option>
                <option value="name">Name</option>
                <option value="category">Category</option>
              </select>
            </div>

            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                title="Table View"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                title="Grid View"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ACTIVE FILTER CHIPS */}
        {(filterCity || filterCategory || filterHasWebsite || filterHasPhone || filterHasEmail || filterStatus || activeSession || searchQuery) && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {filterCity && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50/80 text-blue-700 border border-blue-200/60 rounded-lg text-xs font-semibold">
                City: {filterCity}
                <button onClick={() => setFilterCity('')} className="hover:text-blue-900 p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterCategory && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50/80 text-blue-700 border border-blue-200/60 rounded-lg text-xs font-semibold">
                Category: {filterCategory}
                <button onClick={() => setFilterCategory('')} className="hover:text-blue-900 p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {activeSession && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-50 text-violet-700 border border-violet-200/60 rounded-lg text-xs font-semibold">
                Campaign: {activeSession.keyword || 'Search'} ({activeSession.total_saved ?? activeSession.leads_count ?? 0} leads)
                <button onClick={handleClearSession} className="hover:text-violet-900 p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterHasWebsite && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50/80 text-blue-700 border border-blue-200/60 rounded-lg text-xs font-semibold">
                Website: Available
                <button onClick={() => setFilterHasWebsite(false)} className="hover:text-blue-900 p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterHasPhone && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50/80 text-blue-700 border border-blue-200/60 rounded-lg text-xs font-semibold">
                Phone: Available
                <button onClick={() => setFilterHasPhone(false)} className="hover:text-blue-900 p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterHasEmail && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50/80 text-blue-700 border border-blue-200/60 rounded-lg text-xs font-semibold">
                Email: Available
                <button onClick={() => setFilterHasEmail(false)} className="hover:text-blue-900 p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterStatus && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50/80 text-blue-700 border border-blue-200/60 rounded-lg text-xs font-semibold">
                Status: {filterStatus}
                <button onClick={() => setFilterStatus('')} className="hover:text-blue-900 p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            <button
              onClick={clearAllFilters}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 ml-2 cursor-pointer"
            >
              Clear all
            </button>
          </div>
        )}

        {/* EXPANDABLE FILTER DRAWER */}
        {showFilters && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm animate-in slide-in-from-top-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">City</label>
                <input
                  type="text"
                  placeholder="e.g. South Delhi"
                  value={filterCity}
                  onChange={(e) => { setFilterCity(e.target.value); setPage(0); }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
                <input
                  type="text"
                  placeholder="e.g. Real Estate"
                  value={filterCategory}
                  onChange={(e) => { setFilterCategory(e.target.value); setPage(0); }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                />
              </div>

              {/* Search Campaign Filter (Replacing Rating) */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500 uppercase">Search Campaign</label>
                  {activeSession && (
                    <button
                      type="button"
                      onClick={handleClearSession}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <select
                  value={activeSession?.job_id || activeSession?.id || ''}
                  onChange={(e) => {
                    const selectedJobId = e.target.value;
                    if (!selectedJobId) {
                      handleClearSession();
                    } else {
                      const found = campaignOptionsData?.find((c) => (c.job_id || c.id) === selectedJobId);
                      if (found) {
                        setActiveSession(found);
                      } else {
                        api.get(`/search/sessions/${selectedJobId}`).then(res => {
                          if (res.data?.data) setActiveSession(res.data.data);
                        });
                      }
                      router.replace(`/dashboard/leads?job_id=${selectedJobId}`);
                      setPage(0);
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none cursor-pointer"
                >
                  <option value="">All Campaigns</option>
                  {campaignOptionsData?.map((c) => {
                    const cId = c.job_id || c.id;
                    const count = c.total_saved ?? c.leads_count ?? 0;
                    const loc = [c.city, c.state].filter(Boolean).join(', ');
                    const label = `${c.keyword || 'Search'}${loc ? ` • ${loc}` : ''} (${count} leads)`;
                    return (
                      <option key={cId} value={cId}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none"
                >
                  <option value="">All Leads</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                </select>
              </div>

              <div className="lg:col-span-4 flex flex-wrap gap-4 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterHasWebsite}
                    onChange={(e) => { setFilterHasWebsite(e.target.checked); setPage(0); }}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600"
                  />
                  Has Website
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterHasPhone}
                    onChange={(e) => { setFilterHasPhone(e.target.checked); setPage(0); }}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600"
                  />
                  Has Phone
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterHasEmail}
                    onChange={(e) => { setFilterHasEmail(e.target.checked); setPage(0); }}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600"
                  />
                  Has Email
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SELECTED ITEMS BANNER */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-5 py-3 bg-blue-50 border border-blue-200 rounded-2xl shadow-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span>{selectedIds.size} of {total} leads selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openBulkModal}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Bulk AI Analyze
            </button>
            <button
              onClick={() => {
                if (confirm(`Are you sure you want to delete ${selectedIds.size} selected leads?`)) {
                  bulkDeleteMutation.mutate();
                }
              }}
              className="px-3 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 inline mr-1" /> Delete
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* MAIN TABLE */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-slate-200 shadow-2xs gap-3">
          <div className="w-9 h-9 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Loading your leads directory...</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-2xs text-center px-4">
          <Building2 className="w-12 h-12 text-slate-300 mb-3" />
          <h3 className="text-base font-bold text-slate-800">No leads found</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xs">Try adjusting your filters or keyword search, or click "+ Add Lead" to create one.</p>
        </div>
      ) : viewMode === 'list' ? (
        /* TABLE VIEW */
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap table-fixed">
              <thead className="bg-slate-50/70 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={leads.length > 0 && selectedIds.size === leads.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-5 py-3.5 w-[26%]">Business</th>
                  <th className="px-5 py-3.5 w-[23%]">Contact</th>
                  <th className="px-5 py-3.5 w-[16%]">Location</th>
                  <th className="px-5 py-3.5 w-[21%]">AI Progress</th>
                  <th className="px-5 py-3.5 w-[14%] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {leads.map((lead: any, idx: number) => {
                  const displayName = lead.name || lead.business_name || 'Unnamed Business';
                  const initials = displayName
                    ? displayName
                      .split(' ')
                      .filter(Boolean)
                      .map((n: string) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                    : 'L';

                  const palette = avatarPalettes[idx % avatarPalettes.length];
                  const rawAnalysisState = getLeadAnalysisState(lead);
                  const isActivelyAnalyzing = Boolean(
                    analyzingLeadIds.has(lead._id) ||
                    startingAnalysisId === lead._id ||
                    ['queued', 'analyzing', 'processing', 'running', 'started'].includes(rawAnalysisState.status)
                  );
                  const analysisState = isActivelyAnalyzing && rawAnalysisState.status !== 'completed'
                    ? {
                      status: 'analyzing',
                      label: 'Analyzing...',
                      progress: Math.max(rawAnalysisState.progress, 15),
                      startedAt: rawAnalysisState.startedAt || new Date().toISOString()
                    }
                    : rawAnalysisState;
                  const isSelectedInDrawer = selectedDrawerLead?._id === lead._id && drawerOpen;

                  return (
                    <tr
                      key={lead._id}
                      onClick={() => handleOpenLeadDetail(lead._id)}
                      className={`group transition-all duration-150 cursor-pointer ${isSelectedInDrawer
                        ? 'bg-blue-50/50 border-l-[3px] border-l-blue-600'
                        : selectedIds.has(lead._id)
                          ? 'bg-blue-50/30'
                          : 'hover:bg-slate-50/70'
                        }`}
                    >
                      {/* Checkbox: Selection only */}
                      <td className="px-5 py-4 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(lead._id)}
                          onChange={() => toggleSelect(lead._id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Business: Clicking navigates to individual lead detail page */}
                      <td className="px-5 py-4 align-middle overflow-hidden">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs border ${palette.bg} shrink-0`}>
                            {initials}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-900 text-sm truncate group-hover:text-blue-600 transition-colors" title={displayName}>
                              {displayName}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 truncate">
                              {lead.category || 'UNCATEGORIZED'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Contact: Links open directly without triggering row navigation */}
                      <td className="px-5 py-4 align-middle overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1 w-full text-xs">
                          {/* Phone */}
                          <div className="flex items-center gap-2 text-slate-600 truncate">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {lead.phone ? (
                              <a href={`tel:${lead.phone}`} className="hover:text-blue-600 font-mono text-[11px] truncate">
                                {lead.phone}
                              </a>
                            ) : (
                              <span className="text-slate-300 text-[11px]">—</span>
                            )}
                          </div>

                          {/* Email */}
                          <div className="flex items-center gap-2 text-slate-600 truncate">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {lead.email ? (
                              <a href={`mailto:${lead.email}`} className="hover:text-blue-600 text-[11px] truncate" title={lead.email}>
                                {lead.email}
                              </a>
                            ) : (
                              <span className="text-slate-300 text-[11px]">—</span>
                            )}
                          </div>

                          {/* Website */}
                          {lead.website && (
                            <div className="flex items-center gap-2 text-blue-600 truncate">
                              <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <a
                                href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline text-[11px] font-medium truncate"
                                title={lead.website}
                              >
                                {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                              </a>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Location */}
                      <td className="px-5 py-4 align-middle overflow-hidden">
                        <div className="flex items-start gap-2 text-xs text-slate-600">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-slate-800 truncate">
                              {lead.city || lead.state ? `${lead.city || ''}${lead.city && lead.state ? ', ' : ''}${lead.state || ''}` : 'Location Available'}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate">
                              {lead.country || 'India'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* AI Progress: Real-time progress bar + backend status indicator */}
                      <td className="px-5 py-4 align-middle">
                        <div className="flex flex-col gap-1.5 w-full pr-4">
                          <div className="flex items-center gap-3">
                            <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${analysisState.status === 'completed'
                                  ? 'bg-teal-500'
                                  : analysisState.status === 'failed'
                                    ? 'bg-rose-500'
                                    : 'bg-blue-600'
                                  }`}
                                style={{ width: `${analysisState.progress}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-700 w-8 text-right shrink-0">
                              {analysisState.progress}%
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {analysisState.status === 'not_analyzed' && (
                              <>
                                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                                <span className="text-xs font-medium text-slate-600">Not Analyzed</span>
                              </>
                            )}

                            {analysisState.status === 'queued' && (
                              <>
                                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                                <span className="text-xs font-medium text-slate-600">Queued</span>
                              </>
                            )}

                            {analysisState.status === 'analyzing' && (
                              <div className="flex items-start gap-1.5">
                                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0 mt-0.5" />
                                <div className="flex flex-col">
                                  <span className="text-xs font-medium text-slate-800">Analyzing...</span>
                                  <span className="text-[10px] text-slate-400">
                                    Started {formatStartedAgo(analysisState.startedAt)}
                                  </span>
                                </div>
                              </div>
                            )}

                            {analysisState.status === 'processing' && (
                              <>
                                <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                                <span className="text-xs font-medium text-slate-600">Processing</span>
                              </>
                            )}

                            {analysisState.status === 'completed' && (
                              <>
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="text-xs font-medium text-slate-600">Completed</span>
                              </>
                            )}

                            {analysisState.status === 'failed' && (
                              <>
                                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                                <span className="text-xs font-medium text-rose-600">Failed</span>
                              </>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Actions:
                          1. AI Button: Analyze / Analyzing... / AI Insights / Retry Analysis (Opens Drawer or Starts Analysis)
                          2. ChevronRight: Navigates to individual lead detail page (/dashboard/leads/detail?id=...)
                      */}
                      <td className="px-5 py-4 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {/* When Not Analyzed: Click starts genuine backend job & immediately switches to Analyzing... */}
                          {analysisState.status === 'not_analyzed' ? (
                            <button
                              onClick={() => handleStartAnalysis(lead)}
                              disabled={!lead.website || isActivelyAnalyzing}
                              title={lead.website ? "Start AI Website Analysis" : "Website not available"}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold shadow-2xs transition-all ${lead.website
                                ? 'text-blue-600 hover:bg-blue-50/70 hover:border-blue-200 active:scale-95 cursor-pointer'
                                : 'text-slate-300 border-slate-100 cursor-not-allowed'
                                }`}
                            >
                              {isActivelyAnalyzing ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                                  <span>Analyzing...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Analyze</span>
                                </>
                              )}
                            </button>
                          ) : analysisState.status === 'queued' || analysisState.status === 'analyzing' || analysisState.status === 'processing' || isActivelyAnalyzing ? (
                            /* While running/queued/processing: Persistent Analyzing... button with spinner.
                               Clicking opens AI drawer to inspect live progress without interrupting job. */
                            <button
                              onClick={() => handleOpenAnalysisDrawer(lead, false)}
                              title="Analysis in progress. Click to view live telemetry."
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50/80 text-xs font-semibold text-blue-700 shadow-2xs hover:bg-blue-100/80 transition-all active:scale-95 cursor-pointer"
                            >
                              <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
                              <span>Analyzing...</span>
                            </button>
                          ) : analysisState.status === 'completed' ? (
                            /* When completed: Shows AI Insights button opening the drawer */
                            <button
                              onClick={() => handleOpenAnalysisDrawer(lead, false)}
                              title="Analysis completed. Click to view AI Insights."
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-2xs active:scale-95 cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                              <span>AI Insights</span>
                            </button>
                          ) : (
                            /* When failed: Shows Retry Analysis button (or Analyzing... if user clicked retry) */
                            <button
                              onClick={() => handleStartAnalysis(lead)}
                              disabled={!lead.website || isActivelyAnalyzing}
                              title={isActivelyAnalyzing ? "Analysis in progress." : "Analysis failed. Click to retry analysis."}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer ${isActivelyAnalyzing
                                ? 'border-blue-200 bg-blue-50/80 text-blue-700'
                                : 'border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100/60'
                                }`}
                            >
                              {isActivelyAnalyzing ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                                  <span>Analyzing...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Retry Analysis</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* Right-facing arrow: EXCLUSIVELY opens the individual lead detail page */}
                          <button
                            onClick={() => handleOpenLeadDetail(lead._id)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Open Individual Lead Details"
                          >
                            <ChevronRight className="w-4 h-4" />
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
      ) : (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {leads.map((lead: any, idx: number) => {
            const displayName = lead.name || lead.business_name || 'Unnamed Business';
            const initials = displayName
              ? displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
              : 'L';
            const palette = avatarPalettes[idx % avatarPalettes.length];
            const rawAnalysisState = getLeadAnalysisState(lead);
            const isActivelyAnalyzing = Boolean(
              analyzingLeadIds.has(lead._id) ||
              startingAnalysisId === lead._id ||
              ['queued', 'analyzing', 'processing', 'running', 'started'].includes(rawAnalysisState.status)
            );
            const analysisState = isActivelyAnalyzing && rawAnalysisState.status !== 'completed'
              ? {
                status: 'analyzing',
                label: 'Analyzing...',
                progress: Math.max(rawAnalysisState.progress, 15),
                startedAt: rawAnalysisState.startedAt || new Date().toISOString()
              }
              : rawAnalysisState;

            return (
              <div
                key={lead._id}
                onClick={() => handleOpenLeadDetail(lead._id)}
                className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                      {lead.category || 'LEAD'}
                    </span>
                    <div onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead._id)}
                        onChange={() => toggleSelect(lead._id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm border ${palette.bg} shrink-0`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 truncate text-base hover:text-blue-600 transition-colors">
                        {displayName}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        {lead.city || lead.state || 'Location Available'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-1.5 text-xs text-slate-600" onClick={(e) => e.stopPropagation()}>
                    {lead.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono">{lead.phone}</span>
                      </div>
                    )}
                    {lead.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{lead.email}</span>
                      </div>
                    )}
                    {lead.website && (
                      <div className="flex items-center gap-2 text-blue-600">
                        <Globe className="w-3.5 h-3.5" />
                        <a href={lead.website} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                          {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3.5 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span className="text-slate-500 text-[10px] uppercase font-bold">AI Progress</span>
                    <span className="font-bold">{analysisState.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${analysisState.status === 'completed' ? 'bg-teal-500' : analysisState.status === 'failed' ? 'bg-rose-500' : 'bg-blue-600'}`}
                      style={{ width: `${analysisState.progress}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    {analysisState.status === 'not_analyzed' ? (
                      <button
                        onClick={() => handleStartAnalysis(lead)}
                        disabled={!lead.website || startingAnalysisId === lead._id || isActivelyAnalyzing}
                        className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-blue-50 text-xs font-bold text-blue-600 shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        {isActivelyAnalyzing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" /> Analyzing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" /> Analyze
                          </>
                        )}
                      </button>
                    ) : analysisState.status === 'queued' || analysisState.status === 'analyzing' || analysisState.status === 'processing' || isActivelyAnalyzing ? (
                      <button
                        onClick={() => handleOpenAnalysisDrawer(lead, false)}
                        className="flex-1 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700 shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" /> Analyzing...
                      </button>
                    ) : analysisState.status === 'completed' ? (
                      <button
                        onClick={() => handleOpenAnalysisDrawer(lead, false)}
                        className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-500" /> AI Insights
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartAnalysis(lead)}
                        disabled={!lead.website || isActivelyAnalyzing}
                        className={`flex-1 px-3 py-2 rounded-xl border text-xs font-semibold shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${isActivelyAnalyzing
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                          }`}
                      >
                        {isActivelyAnalyzing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" /> Analyzing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 text-rose-600" /> Retry
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenLeadDetail(lead._id)}
                      className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500 cursor-pointer"
                      title="Open Lead Details"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PAGINATION */}
      <div className="flex flex-col sm:flex-row justify-between items-center px-4 py-3 bg-white border border-slate-200/90 rounded-2xl gap-4 shadow-2xs">
        <span className="text-xs font-medium text-slate-500">
          Showing <span className="font-bold text-slate-800">{total === 0 ? 0 : page * limit + 1}</span> to <span className="font-bold text-slate-800">{Math.min((page + 1) * limit, total)}</span> of <span className="font-bold text-slate-800">{total.toLocaleString()}</span> leads
        </span>

        <div className="flex items-center gap-1.5">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-all text-xs cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const pageNum = i;
            const isActive = pageNum === page;
            return (
              <button
                key={i}
                onClick={() => setPage(pageNum)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all cursor-pointer ${isActive
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
              >
                {pageNum + 1}
              </button>
            );
          })}

          <button
            disabled={(page + 1) * limit >= total}
            onClick={() => setPage(p => p + 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-all text-xs cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Show</span>
          <select
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(0); }}
            className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 outline-none cursor-pointer"
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </select>
          <span>per page</span>
        </div>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="w-full py-12 flex items-center justify-center text-sm text-slate-400">Loading leads...</div>}>
      <LeadsPageContent />
    </Suspense>
  );
}
