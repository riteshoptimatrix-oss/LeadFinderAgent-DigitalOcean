'use client';

import { useState, useEffect, Suspense, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1').replace('localhost', '127.0.0.1');
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
  FileSpreadsheet,
  Send,
  Share2,
  UserCheck,
  Eye,
  EyeOff,
  UserPlus,
  Users,
  Check,
  Clock
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { useAuthStore } from '@/src/features/auth/store';
import type { SearchSession } from '@/src/components/search-sessions/SearchSessionsModal';
import SearchSessionBanner from '@/src/components/search-sessions/SearchSessionBanner';
import { formatLocation } from '@/src/lib/utils';
import { getLeadAnalysisDisplayState, getLeadAnalysisState } from '@/src/lib/leadAnalysisStatus';

// Dynamically import heavy drawer and modals to keep the initial page chunk light and fast
const LeadAnalysisDrawer = dynamic(() => import('@/src/components/leads/LeadAnalysisDrawer'), { ssr: false });
const BulkAIAnalysisMonitor = dynamic(() => import('@/src/components/ai-analysis/BulkAIAnalysisMonitor'), { ssr: false });
const BulkAnalysisModal = dynamic(() => import('@/src/components/ai-analysis/BulkAnalysisModal'), { ssr: false });
const SearchSessionsModal = dynamic(() => import('@/src/components/search-sessions/SearchSessionsModal'), { ssr: false });
const AutoSendEASModal = dynamic(() => import('@/src/components/leads/AutoSendEASModal'), { ssr: false });

function loadTrackedAnalysisStarts(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = sessionStorage.getItem('optimatrix_analyzing_leads');
    if (!stored) return {};
    const parsed: Record<string, number> = JSON.parse(stored);
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).filter(([, ts]) => now - Number(ts) < 300000)
    );
  } catch {
    return {};
  }
}

function getPaginationPages(currentPage: number, totalPages: number): (number | 'ellipsis-start' | 'ellipsis-end')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  // When near the start (pages 1 to 4)
  if (currentPage < 4) {
    return [0, 1, 2, 3, 4, 'ellipsis-end', totalPages - 1];
  }

  // When near the end
  if (currentPage >= totalPages - 4) {
    return [
      0,
      'ellipsis-start',
      totalPages - 5,
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
    ];
  }

  // In the middle
  return [
    0,
    'ellipsis-start',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'ellipsis-end',
    totalPages - 1,
  ];
}

function LeadsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const urlJobId = searchParams.get('job_id');
  const urlPage = searchParams.get('page');
  const urlLimit = searchParams.get('limit');
  const urlSearch = searchParams.get('keyword') || searchParams.get('search');
  const urlCity = searchParams.get('city');
  const urlCategory = searchParams.get('category');
  const urlHasWebsite = searchParams.get('has_website') === 'true';
  const urlHasPhone = searchParams.get('has_phone') === 'true';
  const urlHasEmail = searchParams.get('has_email') === 'true';
  const urlStatus = searchParams.get('status') || '';
  const urlSortBy = searchParams.get('sort_by') || 'created_at';
  const urlSortOrder = searchParams.get('sort_order') ? parseInt(searchParams.get('sort_order')!, 10) : -1;
  const urlAssignedTo = searchParams.get('assigned_to') || '';
  const urlIsAutoLead = searchParams.get('is_auto_lead') || 'all';
  const urlVisibility = searchParams.get('visibility') || '';

  const [page, setPage] = useState(() => (urlPage ? Math.max(0, parseInt(urlPage, 10)) : 0));
  const [limit, setLimit] = useState(() => (urlLimit ? parseInt(urlLimit, 10) : 10));
  const [searchQuery, setSearchQuery] = useState(() => urlSearch || '');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showFilters, setShowFilters] = useState(() =>
    Boolean(urlCity || urlCategory || urlHasWebsite || urlHasPhone || urlHasEmail || urlStatus || urlAssignedTo || (urlIsAutoLead && urlIsAutoLead !== 'all') || urlVisibility)
  );
  const [filterCity, setFilterCity] = useState(() => urlCity || '');
  const [filterCategory, setFilterCategory] = useState(() => urlCategory || '');
  const [filterHasWebsite, setFilterHasWebsite] = useState(() => urlHasWebsite);
  const [filterHasPhone, setFilterHasPhone] = useState(() => urlHasPhone);
  const [filterHasEmail, setFilterHasEmail] = useState(() => urlHasEmail);
  const [filterStatus, setFilterStatus] = useState(() => urlStatus);
  const [filterAssignedTo, setFilterAssignedTo] = useState(() => urlAssignedTo);
  const [filterIsAutoLead, setFilterIsAutoLead] = useState<'all' | 'auto' | 'manual'>(() =>
    urlIsAutoLead === 'true' ? 'auto' : urlIsAutoLead === 'false' ? 'manual' : 'all'
  );
  const [filterVisibility, setFilterVisibility] = useState(() => urlVisibility);
  const [sortBy, setSortBy] = useState(() => urlSortBy);
  const [sortOrder, setSortOrder] = useState(() => urlSortOrder);

  // Keep search & filter states synchronized when URL search params change
  useEffect(() => {
    const currentUrlSearch = searchParams.get('keyword') || searchParams.get('search') || '';
    if (currentUrlSearch !== searchQuery) {
      setSearchQuery(currentUrlSearch);
      setPage(0);
    }
    const currentUrlAssignedTo = searchParams.get('assigned_to') || '';
    if (currentUrlAssignedTo !== filterAssignedTo) {
      setFilterAssignedTo(currentUrlAssignedTo);
      setPage(0);
    }
  }, [searchParams]);

  // Currently starting analysis indicator per lead
  const [startingAnalysisId, setStartingAnalysisId] = useState<string | null>(null);
  const [analysisStartedAt, setAnalysisStartedAt] = useState<Record<string, number>>(loadTrackedAnalysisStarts);

  // Load analyzing IDs from sessionStorage to survive page refresh
  const [analyzingLeadIds, setAnalyzingLeadIds] = useState<Set<string>>(
    () => new Set(Object.keys(loadTrackedAnalysisStarts()))
  );

  // Sync analyzingLeadIds to sessionStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const entries: Record<string, number> = {};
        analyzingLeadIds.forEach(id => {
          entries[id] = analysisStartedAt[id] || Date.now();
        });
        sessionStorage.setItem('optimatrix_analyzing_leads', JSON.stringify(entries));
      } catch { }
    }
  }, [analyzingLeadIds, analysisStartedAt]);

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

  const handleOpenAnalysisDrawer = (targetLead: any, autoStart: boolean = false, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

  // Send to EasyAdServer state (Dynamic for all authorized users)
  const authUser = useAuthStore((state) => state.user);
  const [showEasyAdServerModal, setShowEasyAdServerModal] = useState(false);
  const [showAutoSendEASModal, setShowAutoSendEASModal] = useState(false);
  const [isSendingToEasyAdServer, setIsSendingToEasyAdServer] = useState(false);
  const [easyAdServerMode, setEasyAdServerMode] = useState<'selected' | 'all'>('selected');
  const [skipAlreadySent, setSkipAlreadySent] = useState(true);
  const [singleLeadTarget, setSingleLeadTarget] = useState<any | null>(null);
  const [easyAdServerResult, setEasyAdServerResult] = useState<any | null>(null);

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      try {
        const res = await api.get('/users/me');
        return res.data;
      } catch {
        return null;
      }
    },
    staleTime: 60000,
  });

  const isAdmin =
    authUser?.role?.toLowerCase() === 'admin' ||
    userProfile?.role?.toLowerCase() === 'admin' ||
    userProfile?.is_superuser === true;

  // Assignable users for Admin assignment
  const { data: assignableUsersData = [] } = useQuery<{ id: string; email: string; full_name: string; role: string; company_name?: string }[]>({
    queryKey: ['assignable-users-leads-page'],
    queryFn: async () => {
      try {
        const res = await api.get('/leads/assignable-users');
        return Array.isArray(res.data?.data) ? res.data.data : [];
      } catch {
        return [];
      }
    },
    enabled: isAdmin,
  });

  // Leads by User Dropdown State (Admin Only)
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const userDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    }
    if (isUserDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isUserDropdownOpen]);

  const allUsersList = useMemo(() => {
    const raw = Array.isArray(assignableUsersData) ? assignableUsersData : [];
    const list = [...raw];
    if (!list.some(u => u && u.email && String(u.email).toLowerCase() === 'kutchtourguide@gmail.com')) {
      list.push({
        id: 'kutch_default',
        email: 'kutchtourguide@gmail.com',
        full_name: 'Kutch Tour Guide',
        role: 'USER',
        company_name: 'Kutch Tour Guide'
      });
    }
    return list;
  }, [assignableUsersData]);

  const filteredUsersList = useMemo(() => {
    if (!Array.isArray(allUsersList)) return [];
    if (!userSearchTerm || !userSearchTerm.trim()) return allUsersList;
    const term = userSearchTerm.trim().toLowerCase();
    return allUsersList.filter(u => {
      if (!u) return false;
      const fn = String(u.full_name || '').toLowerCase();
      const em = String(u.email || '').toLowerCase();
      const cn = String((u as any)?.company_name || '').toLowerCase();
      return fn.includes(term) || em.includes(term) || cn.includes(term);
    });
  }, [allUsersList, userSearchTerm]);

  const selectedUserObj = useMemo(() => {
    if (!filterAssignedTo) return null;
    const target = String(filterAssignedTo).trim().toLowerCase();
    if (!Array.isArray(allUsersList)) return null;
    return allUsersList.find(u => {
      if (!u) return false;
      const uEmail = String(u.email || '').toLowerCase();
      const uId = String(u.id || '');
      return uEmail === target || uId === filterAssignedTo;
    });
  }, [allUsersList, filterAssignedTo]);

  const selectedUserDisplayName = String(
    selectedUserObj?.full_name || selectedUserObj?.email || filterAssignedTo || ''
  );

  const currentAssignedFilterValue = useMemo(() => {
    if (!filterAssignedTo) return '';
    if (filterAssignedTo.toLowerCase() === 'unassigned') return 'unassigned';
    if (selectedUserObj) {
      return selectedUserObj.email || selectedUserObj.id || filterAssignedTo;
    }
    return filterAssignedTo;
  }, [filterAssignedTo, selectedUserObj]);

  // Admin Assignment modal state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignTargetUserId, setAssignTargetUserId] = useState('');
  const [assignTargetUserEmail, setAssignTargetUserEmail] = useState('');
  const [assignTargetVisibility, setAssignTargetVisibility] = useState<'visible' | 'hidden'>('visible');

  const assignLeadsMutation = useMutation({
    mutationFn: async ({
      userId,
      userEmail,
      visibility,
    }: {
      userId: string | null;
      userEmail: string | null;
      visibility: string;
    }) => {
      const res = await api.post('/leads/assign', {
        lead_ids: Array.from(selectedIds),
        user_id: userId,
        user_email: userEmail,
        visibility,
      });
      return res.data;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setIsAssignModalOpen(false);
      setSelectedIds(new Set());
      toast.success(`Successfully assigned ${res.modified_count ?? selectedIds.size} lead(s)!`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to assign leads');
    },
  });

  const updateVisibilityMutation = useMutation({
    mutationFn: async (visibility: string) => {
      const res = await api.post('/leads/visibility', {
        lead_ids: Array.from(selectedIds),
        visibility,
      });
      return res.data;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setSelectedIds(new Set());
      toast.success(`Visibility updated to "${res.visibility}" for ${res.modified_count ?? selectedIds.size} lead(s)!`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to update visibility');
    },
  });

  const impersonatedEmail = typeof window !== 'undefined' ? localStorage.getItem('impersonated_target_email') : '';
  const activeUserEmail = (impersonatedEmail || userProfile?.email || authUser?.email || '').toLowerCase();
  const isEasyAdServerEnabled = Boolean(
    userProfile?.easyadserver_access ||
    (authUser as any)?.easyadserver_access
  );

  const { data: easyAdServerStatus, refetch: refetchEasyAdServerStatus } = useQuery({
    queryKey: ['easyadserver-status'],
    queryFn: async () => {
      try {
        const res = await api.get('/easyadserver/status');
        return res.data;
      } catch {
        return null;
      }
    },
    enabled: isEasyAdServerEnabled && showEasyAdServerModal,
  });

  const { data: easScheduleData, refetch: refetchEASSchedule } = useQuery({
    queryKey: ['eas-schedule'],
    queryFn: async () => {
      try {
        const res = await api.get('/easyadserver/schedule');
        return res.data;
      } catch {
        return null;
      }
    },
    enabled: isEasyAdServerEnabled,
  });

  const handleSendToEasyAdServer = (singleLead?: any) => {
    if (singleLead) {
      setSingleLeadTarget(singleLead);
      setEasyAdServerMode('selected');
    } else {
      setSingleLeadTarget(null);
      setEasyAdServerMode(selectedIds.size > 0 ? 'selected' : 'all');
    }
    setEasyAdServerResult(null);
    setShowEasyAdServerModal(true);
  };

  const handleConfirmSendToEasyAdServer = async () => {
    setIsSendingToEasyAdServer(true);
    setEasyAdServerResult(null);
    try {
      const payload: any = {
        skip_already_sent: singleLeadTarget ? false : skipAlreadySent
      };

      if (singleLeadTarget) {
        payload.lead_id = singleLeadTarget._id || singleLeadTarget.id;
      } else if (easyAdServerMode === 'selected') {
        if (selectedIds.size === 0) {
          toast.error('Please select at least one lead from the table.');
          setIsSendingToEasyAdServer(false);
          return;
        }
        payload.lead_ids = Array.from(selectedIds);
      } else {
        payload.send_all = true;
      }

      const res = await api.post('/easyadserver/send', payload);
      const data = res.data;
      setEasyAdServerResult(data);

      if (data.successful_count > 0) {
        toast.success(`Leads dispatched to EasyAdServer!`, {
          description: `${data.successful_count} sent successfully${data.failed_count > 0 ? `, ${data.failed_count} failed` : ''}${data.skipped_count > 0 ? `, ${data.skipped_count} skipped` : ''}.`,
          duration: 5000,
        });
        queryClient.invalidateQueries({ queryKey: ['leads'] });
        refetchEasyAdServerStatus();
      } else if (data.skipped_count > 0 && data.failed_count === 0) {
        toast.info('All requested leads were skipped because they were already dispatched previously.');
      } else {
        toast.error(data.message || 'Failed to dispatch leads to EasyAdServer.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to send leads to EasyAdServer.';
      toast.error(msg);
    } finally {
      setIsSendingToEasyAdServer(false);
    }
  };

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



  // Construct current leads URL preserving search, filters, pagination, and campaign context
  const buildCurrentLeadsUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (page > 0) params.set('page', page.toString());
    if (limit !== 10) params.set('limit', limit.toString());
    if (searchQuery) params.set('keyword', searchQuery);
    if (activeSession?.job_id) params.set('job_id', activeSession.job_id);
    if (filterCity) params.set('city', filterCity);
    if (filterCategory) params.set('category', filterCategory);
    if (filterHasWebsite) params.set('has_website', 'true');
    if (filterHasPhone) params.set('has_phone', 'true');
    if (filterHasEmail) params.set('has_email', 'true');
    if (filterStatus) params.set('status', filterStatus);
    if (filterAssignedTo) params.set('assigned_to', filterAssignedTo);
    if (filterIsAutoLead === 'auto') params.set('is_auto_lead', 'true');
    if (filterIsAutoLead === 'manual') params.set('is_auto_lead', 'false');
    if (filterVisibility) params.set('visibility', filterVisibility);
    if (sortBy && sortBy !== 'created_at') params.set('sort_by', sortBy);
    if (sortOrder !== -1) params.set('sort_order', sortOrder.toString());

    const qs = params.toString();
    return `/dashboard/leads${qs ? `?${qs}` : ''}`;
  }, [page, limit, searchQuery, activeSession?.job_id, filterCity, filterCategory, filterHasWebsite, filterHasPhone, filterHasEmail, filterStatus, filterAssignedTo, filterIsAutoLead, filterVisibility, sortBy, sortOrder]);

  // Keep browser address bar synchronized with current filters & pagination
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const targetUrl = buildCurrentLeadsUrl();
      const currentUrl = window.location.pathname + window.location.search;
      if (targetUrl !== currentUrl) {
        window.history.replaceState(null, '', targetUrl);
      }
    }
  }, [buildCurrentLeadsUrl]);

  // Real-time WebSocket connection to receive instant AI analysis updates
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || '';
    const wsBase = API_BASE_URL.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '');
    const wsUrl = `${wsBase}/api/v1/ws/analysis-updates?token=${token}`;

    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let isMounted = true;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            const incomingLeadId = payload.lead_id || payload.leadId;
            const eventType = String(payload.type || payload.event_type || '');

            const isAnalysisEvent =
              ['LEAD_ANALYSIS_UPDATED', 'LEAD_COMPLETED', 'AI_ANALYSIS_COMPLETED', 'LEAD_FAILED', 'analysis_completed', 'STAGE_PROGRESS', 'BULK_QUEUE_CREATED', 'bulk_job_completed', 'queue_completed'].includes(eventType) ||
              /analysis|bulk/i.test(eventType);

            if (isAnalysisEvent) {
              queryClient.invalidateQueries({ queryKey: ['leads'] });
              queryClient.invalidateQueries({ queryKey: ['activeBulkQueues'] });

              if (incomingLeadId && ['COMPLETED', 'FAILED', 'PARTIAL_SUCCESS', 'analysis_completed', 'LEAD_COMPLETED', 'LEAD_FAILED'].includes(payload.status || payload.type)) {
                setAnalyzingLeadIds((prev) => {
                  const next = new Set(prev);
                  next.delete(String(incomingLeadId));
                  return next;
                });
              }
            }
          } catch { }
        };

        ws.onclose = () => {
          if (isMounted) {
            reconnectTimeout = setTimeout(connect, 5000);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        if (isMounted) {
          reconnectTimeout = setTimeout(connect, 5000);
        }
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [queryClient]);

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
    setFilterCity('');
    setFilterCategory('');
    setFilterHasWebsite(false);
    setFilterHasPhone(false);
    setFilterHasEmail(false);
    setFilterStatus('');
    setFilterAssignedTo('');
    setFilterIsAutoLead('all');
    setFilterVisibility('');
    setSortBy('created_at');
    setSortOrder(-1);
    router.replace('/dashboard/leads');
  };

  const isQueueActive = useCallback((q: any) => {
    const status = (q.status || '').toUpperCase();
    if (['COMPLETED', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'CANCELLED', 'SKIPPED'].includes(status)) {
      return false;
    }
    const total = Number(q.total_jobs || 0);
    const completed = Number(q.completed_jobs || 0);
    const failed = Number(q.failed_jobs || 0);
    const skipped = Number(q.skipped_jobs || 0);
    const done = completed + failed + skipped;
    const running = Number(q.running_jobs || 0);
    const pending = Number(q.pending_jobs || 0);

    // If all jobs are processed and none are running/pending, it is done!
    if (total > 0 && done >= total && running === 0 && pending === 0) {
      return false;
    }

    return ['RUNNING', 'PENDING', 'PAUSED'].includes(status) || running > 0 || pending > 0;
  }, []);

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
      const hasActive = queues.some(isQueueActive);
      return hasActive ? 3000 : 30000;
    },
  });

  const activeBulkQueue = Array.isArray(bulkQueuesData)
    ? bulkQueuesData.find(isQueueActive)
    : null;

  // Auto-restore or auto-dismiss bulk queue ID when active bulk queue state changes
  useEffect(() => {
    if (activeBulkQueue && !bulkQueueId) {
      setBulkQueueId(activeBulkQueue.id);
      setBulkQueueName(activeBulkQueue.name || 'Bulk AI Website Analysis');
      setBulkMinimized(true);
    } else if (!activeBulkQueue && bulkQueueId) {
      setBulkQueueId(null);
      setBulkMinimized(false);
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
      filterAssignedTo,
      filterIsAutoLead,
      filterVisibility,
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
      if (filterAssignedTo) params.append('assigned_to', filterAssignedTo);
      if (filterIsAutoLead === 'auto') params.append('is_auto_lead', 'true');
      if (filterIsAutoLead === 'manual') params.append('is_auto_lead', 'false');
      if (filterVisibility) params.append('visibility', filterVisibility);

      const res = await api.get(`/leads?${params.toString()}`);
      return res.data;
    },
    // Auto-poll every 3s while any analysis is non-terminal or bulk is active, else 15s
    refetchInterval: (query: any) => {
      const currentLeads = query.state.data?.data || [];
      const hasActiveLead = currentLeads.some((l: any) => getLeadAnalysisState(l).isActive);
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
    filterStatus,
    isAdmin && filterAssignedTo,
    isAdmin && filterIsAutoLead !== 'all' && filterIsAutoLead,
    isAdmin && filterVisibility
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
  const handleStartAnalysis = async (lead: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!lead.website) {
      toast.error('Cannot analyze: Lead has no website available');
      return;
    }
    const leadId = lead._id;
    setAnalysisStartedAt(prev => ({ ...prev, [leadId]: Date.now() }));
    setStartingAnalysisId(leadId);
    setAnalyzingLeadIds(prev => new Set(prev).add(leadId));
    try {
      const res = await api.post(`/leads/${leadId}/start-analysis`);
      const resData = res.data;
      if (resData?.worker_id === 'skipped') {
        setAnalysisStartedAt(prev => {
          const next = { ...prev };
          delete next[leadId];
          return next;
        });
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
      setAnalysisStartedAt(prev => {
        const next = { ...prev };
        delete next[leadId];
        return next;
      });
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

  // Clear local tracking as soon as the backend confirms a terminal state
  useEffect(() => {
    if (analyzingLeadIds.size > 0 && leads.length > 0) {
      leads.forEach((l: any) => {
        if (!analyzingLeadIds.has(l._id)) return;
        const state = getLeadAnalysisDisplayState(l, {
          isTracked: true,
          ignoreTerminalBefore: analysisStartedAt[l._id],
        });
        if (state.isTerminal) {
          setAnalysisStartedAt(prev => {
            const next = { ...prev };
            delete next[l._id];
            return next;
          });
          setAnalyzingLeadIds(prev => {
            const next = new Set(prev);
            next.delete(l._id);
            return next;
          });
        }
      });
    }
  }, [leads, analyzingLeadIds, analysisStartedAt]);

  // Navigate to individual lead detail page
  const handleOpenLeadDetail = (leadId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const returnUrl = buildCurrentLeadsUrl();
    router.push(`/dashboard/leads/detail?id=${leadId}&returnUrl=${encodeURIComponent(returnUrl)}`);
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
      if (filterCity) params.append('city', filterCity);
      if (filterCategory) params.append('category', filterCategory);
      if (filterHasWebsite) params.append('has_website', 'true');
      if (filterHasPhone) params.append('has_phone', 'true');
      if (filterHasEmail) params.append('has_email', 'true');
      if (filterStatus) params.append('status', filterStatus);
      if (filterAssignedTo) params.append('assigned_to', filterAssignedTo);
      if (filterIsAutoLead === 'auto') params.append('is_auto_lead', 'true');
      if (filterIsAutoLead === 'manual') params.append('is_auto_lead', 'false');
      if (filterVisibility) params.append('visibility', filterVisibility);
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
    setBulkQueueId(null);
    setBulkMinimized(false);

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
    if (filterAssignedTo) f.assigned_to = filterAssignedTo;
    if (filterIsAutoLead === 'auto') f.is_auto_lead = true;
    if (filterIsAutoLead === 'manual') f.is_auto_lead = false;
    if (filterVisibility) f.visibility = filterVisibility;
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

      {/* Auto Send to EasyAdServer Modal */}
      <AutoSendEASModal
        isOpen={showAutoSendEASModal}
        onClose={() => setShowAutoSendEASModal(false)}
        onScheduleUpdated={() => {
          refetchEASSchedule();
        }}
      />

      {/* EasyAdServer Live Integration Modal (Dynamic for all authorized users) */}
      {showEasyAdServerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xl max-w-xl w-full p-6 space-y-5 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-xs">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">Send to EasyAdServer</h3>
                    {easyAdServerStatus && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${easyAdServerStatus.has_token
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                        {easyAdServerStatus.has_token ? 'API Connected' : 'Token Required'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Dispatch verified lead data directly to EasyAdServer API.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEasyAdServerModal(false);
                  setEasyAdServerResult(null);
                  setSingleLeadTarget(null);
                }}
                disabled={isSendingToEasyAdServer}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning if Admin has not configured token */}
            {easyAdServerStatus && !easyAdServerStatus.has_token && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold block">EasyAdServer Token Not Configured</span>
                  <p className="text-amber-800 text-[11px]">
                    The Administrator has enabled EasyAdServer for your account, but an API Token has not been set yet.
                    Please contact your Administrator to configure your token in the Admin Panel.
                  </p>
                </div>
              </div>
            )}

            {/* If Dispatch Results are available */}
            {easyAdServerResult ? (
              <div className="space-y-4 animate-in fade-in">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Dispatch Summary:</span>
                    <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${easyAdServerResult.failed_count === 0
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                      {easyAdServerResult.failed_count === 0 ? 'All Dispatched' : 'Completed with Errors'}
                    </span>
                  </div>

                  {/* Stat Counters */}
                  <div className="grid grid-cols-4 gap-2 pt-1 text-center">
                    <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Requested</span>
                      <span className="text-base font-black text-slate-800">{easyAdServerResult.total_requested}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200">
                      <span className="text-[10px] text-emerald-600 block font-bold uppercase">Success</span>
                      <span className="text-base font-black text-emerald-700">{easyAdServerResult.successful_count}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-rose-50/80 border border-rose-200">
                      <span className="text-[10px] text-rose-600 block font-bold uppercase">Failed</span>
                      <span className="text-base font-black text-rose-700">{easyAdServerResult.failed_count}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200">
                      <span className="text-[10px] text-amber-600 block font-bold uppercase">Skipped</span>
                      <span className="text-base font-black text-amber-700">{easyAdServerResult.skipped_count || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Detailed Results List */}
                {easyAdServerResult.results && easyAdServerResult.results.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-slate-600 block">Lead Dispatch Details:</span>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-2xl p-2 bg-slate-50/50 divide-y divide-slate-100">
                      {easyAdServerResult.results.map((r: any, idx: number) => (
                        <div key={idx} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs gap-2">
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 block truncate">{r.name || `Lead #${r.lead_id}`}</span>
                            {r.error && (
                              <span className="text-[11px] text-rose-600 block truncate">{r.error}</span>
                            )}
                            {r.message && !r.error && (
                              <span className="text-[11px] text-slate-500 block truncate">{r.message}</span>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold shrink-0 border ${r.status === 'SUCCESS' || r.success
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : r.status === 'SKIPPED'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                            {r.action ? `${r.action.toUpperCase()}` : (r.status || (r.success ? 'SENT' : 'FAILED'))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEasyAdServerModal(false);
                      setEasyAdServerResult(null);
                      setSingleLeadTarget(null);
                    }}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 transition-colors cursor-pointer"
                  >
                    Done &amp; Close
                  </button>
                </div>
              </div>
            ) : (
              /* Before Sending Form */
              <div className="space-y-4">
                {/* Target lead preview (if single) or Option A / Option B Scope Picker */}
                {singleLeadTarget ? (
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Option A: Send Individual Lead</span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                        Single Lead
                      </span>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1">
                      <div className="font-bold text-slate-900 text-sm">
                        {singleLeadTarget.name || singleLeadTarget.business_name || 'Business Lead'}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500 text-[11px]">
                        <span>📞 {singleLeadTarget.phone || 'No Phone'}</span>
                        <span>✉️ {singleLeadTarget.email || 'No Email'}</span>
                        <span>📍 {singleLeadTarget.city || singleLeadTarget.area || '—'}</span>
                      </div>
                      {singleLeadTarget.easyadserver_sent && (
                        <div className="mt-2 text-[11px] text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1">
                          ℹ️ This lead was previously marked sent. Re-sending will dispatch it directly to EasyAdServer even if deleted there.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-700 block">Select Sending Option:</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Option A: Selected Leads */}
                      <button
                        type="button"
                        onClick={() => setEasyAdServerMode('selected')}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${easyAdServerMode === 'selected'
                          ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/20'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-900">Option A: Selected Leads</span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                            {selectedIds.size} Selected
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {selectedIds.size > 0
                            ? `Dispatch only the ${selectedIds.size} lead(s) currently checked in the table.`
                            : 'No leads selected. Check checkboxes in table to select.'}
                        </p>
                      </button>

                      {/* Option B: Send All Leads */}
                      <button
                        type="button"
                        onClick={() => setEasyAdServerMode('all')}
                        className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${easyAdServerMode === 'all'
                          ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/20'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-900">Option B: Send All Leads</span>
                          <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 text-[10px] font-extrabold">
                            All ({leads.length})
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Dispatch all available leads belonging to your account ({activeUserEmail}).
                        </p>
                      </button>
                    </div>
                  </div>
                )}

                {/* API Specs Information */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Target API Endpoint:</span>
                    <span className="font-mono text-[11px] text-slate-800 font-semibold truncate max-w-[260px]">
                      https://easyadserver.com/api/lead_finder.php
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Authorized User Account:</span>
                    <span className="font-bold text-teal-700">{activeUserEmail}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Data Mapping:</span>
                    <span className="font-semibold text-slate-700">Dynamic JSON payload (name, mobile, address, etc.)</span>
                  </div>
                </div>

                {/* Prevent Duplicate Submissions Checkbox (only for bulk/selected) */}
                {!singleLeadTarget && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <input
                      type="checkbox"
                      id="skipAlreadySentCheck"
                      checked={skipAlreadySent}
                      onChange={(e) => setSkipAlreadySent(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <label htmlFor="skipAlreadySentCheck" className="text-xs text-slate-700 cursor-pointer select-none">
                      <strong className="font-semibold">Prevent duplicate submissions:</strong> Skip leads that were already successfully dispatched to EasyAdServer.
                    </label>
                  </div>
                )}

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEasyAdServerModal(false);
                      setSingleLeadTarget(null);
                    }}
                    disabled={isSendingToEasyAdServer}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSendToEasyAdServer}
                    disabled={
                      isSendingToEasyAdServer ||
                      (easyAdServerStatus && !easyAdServerStatus.has_token) ||
                      (!singleLeadTarget && easyAdServerMode === 'selected' && selectedIds.size === 0)
                    }
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSendingToEasyAdServer ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending to EasyAdServer...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>{singleLeadTarget?.easyadserver_sent ? 'Re-send to EasyAdServer' : 'Confirm & Send to EasyAdServer'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Leads</h1>

            {/* Leads by User Button (Admin Only) */}
            {isAdmin && (
              <div className="relative" ref={userDropdownRef}>
                <div className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs ${filterAssignedTo
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 ring-2 ring-indigo-500/20'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    title="Filter leads by user (Admin only)"
                  >
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    <span>
                      {filterAssignedTo ? `Leads: ${selectedUserDisplayName}` : 'Leads by User'}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isUserDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {filterAssignedTo && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFilterAssignedTo('');
                        setPage(0);
                      }}
                      className="ml-1 p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                      title="Clear user filter"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {isUserDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 animate-in fade-in zoom-in-95">
                    <div className="px-2 py-1.5 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Filter by User</span>
                      {filterAssignedTo && (
                        <button
                          type="button"
                          onClick={() => {
                            setFilterAssignedTo('');
                            setPage(0);
                            setIsUserDropdownOpen(false);
                          }}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer"
                        >
                          Show All
                        </button>
                      )}
                    </div>

                    <div className="p-1.5">
                      <input
                        type="text"
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        placeholder="Search user..."
                        className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-indigo-400"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-0.5 mt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setFilterAssignedTo('');
                          setPage(0);
                          setIsUserDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${!filterAssignedTo ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span>All Users (All Leads)</span>
                        </div>
                        {!filterAssignedTo && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                      </button>

                      {(Array.isArray(filteredUsersList) ? filteredUsersList : []).map((u) => {
                        const isSelected =
                          Boolean(filterAssignedTo) &&
                          (String(filterAssignedTo).toLowerCase() === String(u?.email || '').toLowerCase() ||
                            filterAssignedTo === u?.id);
                        return (
                          <button
                            key={u?.id || u?.email || Math.random().toString()}
                            type="button"
                            onClick={() => {
                              setFilterAssignedTo(u?.email || u?.id || '');
                              setPage(0);
                              setIsUserDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                          >
                            <div className="truncate pr-2">
                              <div className="font-bold truncate text-slate-800">{u?.full_name || u?.email}</div>
                              <div className="text-[10px] text-slate-400 truncate">{u?.email}</div>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage and analyze your business leads with AI-powered insights.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {/* Send to EasyAdServer Button (Dynamic for all authorized users) */}
          {isEasyAdServerEnabled && (
            <button
              type="button"
              onClick={() => handleSendToEasyAdServer()}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-sm cursor-pointer active:scale-95"
              title="Send leads to EasyAdServer"
            >
              <Send className="w-3.5 h-3.5 text-white" />
              <span>Send to EasyAdServer</span>
              {selectedIds.size > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/25 text-white font-black ml-0.5">
                  {selectedIds.size}
                </span>
              )}
            </button>
          )}

          {/* Auto Send to EAS Button (with clock icon & active status badge) */}
          {isEasyAdServerEnabled && (
            <button
              type="button"
              onClick={() => setShowAutoSendEASModal(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-sm cursor-pointer active:scale-95 border ${easScheduleData?.has_schedule && easScheduleData?.is_active
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
              title="Configure automated scheduled sending to EasyAdServer"
            >
              <Clock className={`w-3.5 h-3.5 ${easScheduleData?.has_schedule && easScheduleData?.is_active ? 'text-emerald-600' : 'text-slate-500'}`} />
              <span>Auto Send to EAS</span>
              {easScheduleData?.has_schedule && easScheduleData?.is_active && easScheduleData.schedule_time && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-emerald-600 text-white font-extrabold ml-0.5 shadow-2xs">
                  {easScheduleData.schedule_time}
                </span>
              )}
            </button>
          )}

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
            {isAdmin && filterAssignedTo && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50/80 text-indigo-700 border border-indigo-200/60 rounded-lg text-xs font-semibold">
                User: {selectedUserDisplayName || filterAssignedTo}
                <button onClick={() => { setFilterAssignedTo(''); setPage(0); }} className="hover:text-indigo-900 p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {isAdmin && filterIsAutoLead !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50/80 text-teal-700 border border-teal-200/60 rounded-lg text-xs font-semibold">
                Source: {filterIsAutoLead === 'auto' ? 'Auto LeadFinder' : 'Manual'}
                <button onClick={() => setFilterIsAutoLead('all')} className="hover:text-teal-900 p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
              </span>
            )}
            {isAdmin && filterVisibility && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50/80 text-amber-700 border border-amber-200/60 rounded-lg text-xs font-semibold">
                Visibility: {filterVisibility}
                <button onClick={() => setFilterVisibility('')} className="hover:text-amber-900 p-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
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

              {isAdmin && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Assigned User</label>
                    <select
                      value={currentAssignedFilterValue}
                      onChange={(e) => { setFilterAssignedTo(e.target.value); setPage(0); }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none cursor-pointer"
                    >
                      <option value="">All Users</option>
                      <option value="unassigned">Unassigned Leads Only</option>
                      {(Array.isArray(allUsersList) ? allUsersList : []).map((u) => {
                        const optVal = u.email || u.id;
                        return (
                          <option key={u.id || u.email} value={optVal}>
                            {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Lead Source</label>
                    <select
                      value={filterIsAutoLead}
                      onChange={(e) => { setFilterIsAutoLead(e.target.value as any); setPage(0); }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none cursor-pointer"
                    >
                      <option value="all">All Sources</option>
                      <option value="auto">Auto LeadFinder Only</option>
                      <option value="manual">Manual / Search Jobs Only</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Visibility</label>
                    <select
                      value={filterVisibility}
                      onChange={(e) => { setFilterVisibility(e.target.value); setPage(0); }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none cursor-pointer"
                    >
                      <option value="">All Visibility</option>
                      <option value="visible">Visible to User</option>
                      <option value="hidden">Hidden (Admin Review)</option>
                    </select>
                  </div>
                </>
              )}

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
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-blue-50 border border-blue-200 rounded-2xl shadow-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <span>{selectedIds.size} of {total} leads selected</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Assign to User
                </button>

                <button
                  type="button"
                  onClick={() => updateVisibilityMutation.mutate('visible')}
                  disabled={updateVisibilityMutation.isPending}
                  className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  title="Make selected leads visible to assigned users"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-600" /> Make Visible
                </button>

                <button
                  type="button"
                  onClick={() => updateVisibilityMutation.mutate('hidden')}
                  disabled={updateVisibilityMutation.isPending}
                  className="px-3 py-1.5 bg-white border border-amber-300 hover:bg-amber-50 text-amber-700 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  title="Hide selected leads from assigned users"
                >
                  <EyeOff className="w-3.5 h-3.5 text-amber-600" /> Hide Leads
                </button>
              </>
            )}

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
                  const analysisState = getLeadAnalysisDisplayState(lead, {
                    isTracked: analyzingLeadIds.has(lead._id),
                    isStarting: startingAnalysisId === lead._id,
                    ignoreTerminalBefore: analysisStartedAt[lead._id],
                  });
                  const isActivelyAnalyzing = analysisState.isActive;
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
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm truncate group-hover:text-blue-600 transition-colors" title={displayName}>
                                {displayName}
                              </span>
                              {(lead.is_auto_lead || lead.source === 'auto_leadfinder' || lead.requested_provider === 'Auto LeadFinder') && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 border border-teal-200 text-teal-700 shrink-0">
                                  <Sparkles className="w-2.5 h-2.5" /> Auto Lead
                                </span>
                              )}
                              {isAdmin && lead.visibility === 'hidden' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-700 shrink-0">
                                  <EyeOff className="w-2.5 h-2.5" /> Hidden
                                </span>
                              )}
                              {lead.easyadserver_sent && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 border border-emerald-200 text-emerald-700 shrink-0" title={`Sent to EasyAdServer (Contact #${lead.easyadserver_contact_id || ''})`}>
                                  <Send className="w-2.5 h-2.5" /> EasyAdServer
                                </span>
                              )}
                            </div>
                            {lead.category && lead.category.trim().toUpperCase() !== 'UNCATEGORIZED' && (
                              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 truncate">
                                <span>{lead.category}</span>
                              </div>
                            )}
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
                                <span className="text-xs font-medium text-slate-600">{analysisState.label}</span>
                              </>
                            )}

                            {(analysisState.status === 'pending' || analysisState.status === 'queued') && (
                              <>
                                <span className={`w-2 h-2 rounded-full shrink-0 ${analysisState.status === 'pending' ? 'bg-amber-400' : 'bg-amber-500'}`} />
                                <span className="text-xs font-medium text-slate-600">{analysisState.label}</span>
                              </>
                            )}

                            {analysisState.status === 'analyzing' && (
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                                <span className="text-xs font-medium text-slate-800">{analysisState.label}</span>
                              </div>
                            )}

                            {analysisState.status === 'completed' && (
                              <>
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="text-xs font-medium text-slate-600">{analysisState.label}</span>
                              </>
                            )}

                            {analysisState.status === 'failed' && (
                              <>
                                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                                <span className="text-xs font-medium text-rose-600">{analysisState.label}</span>
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
                              onClick={(e) => handleStartAnalysis(lead, e)}
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
                          ) : analysisState.isActive ? (
                            /* While pending/queued/analyzing: Persistent Analyzing... button with spinner.
                               Clicking opens AI drawer to inspect live progress without interrupting job. */
                            <button
                              onClick={(e) => handleOpenAnalysisDrawer(lead, false, e)}
                              title="Analysis in progress. Click to view live telemetry."
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50/80 text-xs font-semibold text-blue-700 shadow-2xs hover:bg-blue-100/80 transition-all active:scale-95 cursor-pointer"
                            >
                              <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />
                              <span>Analyzing...</span>
                            </button>
                          ) : analysisState.status === 'completed' ? (
                            /* When completed: Shows AI Insights button opening the drawer */
                            <button
                              onClick={(e) => handleOpenAnalysisDrawer(lead, false, e)}
                              title="Analysis completed. Click to view AI Insights."
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-2xs active:scale-95 cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                              <span>AI Insights</span>
                            </button>
                          ) : (
                            /* When failed: Shows Retry Analysis button */
                            <button
                              onClick={(e) => handleStartAnalysis(lead, e)}
                              disabled={!lead.website}
                              title="Analysis failed. Click to retry analysis."
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100/60"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-rose-600" />
                              <span>Retry Analysis</span>
                            </button>
                          )}

                          {/* Send Individual Lead to EasyAdServer (Option A) */}
                          {isEasyAdServerEnabled && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSendToEasyAdServer(lead);
                              }}
                              title={lead.easyadserver_sent ? "Sent to EasyAdServer (Click to re-send)" : "Send this lead to EasyAdServer (Option A)"}
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${lead.easyadserver_sent
                                ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                                : 'text-slate-400 bg-white border-slate-200 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50/50'
                                }`}
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Right-facing arrow: EXCLUSIVELY opens the individual lead detail page */}
                          <button
                            onClick={(e) => handleOpenLeadDetail(lead._id, e)}
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
            const analysisState = getLeadAnalysisDisplayState(lead, {
              isTracked: analyzingLeadIds.has(lead._id),
              isStarting: startingAnalysisId === lead._id,
              ignoreTerminalBefore: analysisStartedAt[lead._id],
            });
            const isActivelyAnalyzing = analysisState.isActive;

            return (
              <div
                key={lead._id}
                onClick={() => handleOpenLeadDetail(lead._id)}
                className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {lead.category && lead.category.trim().toUpperCase() !== 'UNCATEGORIZED' && (
                        <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          {lead.category}
                        </span>
                      )}
                      {(lead.is_auto_lead || lead.source === 'auto_leadfinder' || lead.requested_provider === 'Auto LeadFinder') && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 border border-teal-200 text-teal-700">
                          <Sparkles className="w-2.5 h-2.5" /> Auto Lead
                        </span>
                      )}
                      {isAdmin && lead.visibility === 'hidden' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-700">
                          <EyeOff className="w-2.5 h-2.5" /> Hidden
                        </span>
                      )}
                      {lead.easyadserver_sent && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 border border-emerald-200 text-emerald-700" title={`Sent to EasyAdServer (Contact #${lead.easyadserver_contact_id || ''})`}>
                          <Send className="w-2.5 h-2.5" /> EasyAdServer
                        </span>
                      )}
                    </div>
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
                        onClick={(e) => handleStartAnalysis(lead, e)}
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
                    ) : analysisState.isActive ? (
                      <button
                        onClick={(e) => handleOpenAnalysisDrawer(lead, false, e)}
                        className="flex-1 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700 shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" /> Analyzing...
                      </button>
                    ) : analysisState.status === 'completed' ? (
                      <button
                        onClick={(e) => handleOpenAnalysisDrawer(lead, false, e)}
                        className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-blue-500" /> AI Insights
                      </button>
                    ) : (
                      <button
                        onClick={(e) => handleStartAnalysis(lead, e)}
                        disabled={!lead.website}
                        className="flex-1 px-3 py-2 rounded-xl border text-xs font-semibold shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-rose-600" /> Retry
                      </button>
                    )}
                    {isEasyAdServerEnabled && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendToEasyAdServer(lead);
                        }}
                        className={`p-2 border rounded-xl transition-all cursor-pointer ${lead.easyadserver_sent
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                          : 'text-slate-500 bg-white border-slate-200 hover:text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50/50'
                          }`}
                        title={lead.easyadserver_sent ? "Sent to EasyAdServer (Click to re-send)" : "Send to EasyAdServer (Option A)"}
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleOpenLeadDetail(lead._id, e)}
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
            onClick={() => setPage(p => Math.max(0, p - 1))}
            aria-label="Previous Page"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-all text-xs cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {getPaginationPages(page, totalPages).map((item, idx) => {
            if (typeof item === 'string') {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="w-8 h-8 flex items-center justify-center text-xs font-semibold text-slate-400 select-none"
                >
                  ...
                </span>
              );
            }

            const pageNum = item;
            const isActive = pageNum === page;
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                aria-current={isActive ? 'page' : undefined}
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
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            aria-label="Next Page"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-all text-xs cursor-pointer disabled:cursor-not-allowed"
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

      {/* Admin Assign Leads Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Assign Selected Leads</h3>
                  <p className="text-xs text-slate-500">
                    Assigning <strong className="text-indigo-600 font-bold">{selectedIds.size}</strong> selected lead{selectedIds.size === 1 ? '' : 's'}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Target User Account:
                </label>
                <select
                  value={assignTargetUserId}
                  onChange={(e) => {
                    const selId = e.target.value;
                    setAssignTargetUserId(selId);
                    const found = (Array.isArray(assignableUsersData) ? assignableUsersData : []).find((u) => u && u.id === selId);
                    setAssignTargetUserEmail(found ? found.email : '');
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                >
                  <option value="">Unassign (Clear User Assignment)</option>
                  {(Array.isArray(assignableUsersData) ? assignableUsersData : []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name ? `${u.full_name} (${u.email})` : u.email} [{u.role}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Lead Visibility:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAssignTargetVisibility('visible')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${assignTargetVisibility === 'visible'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Visible to User</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignTargetVisibility('hidden')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${assignTargetVisibility === 'hidden'
                      ? 'bg-amber-50 border-amber-300 text-amber-800 font-bold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                    <span>Hidden (Admin Only)</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  assignLeadsMutation.mutate({
                    userId: assignTargetUserId || null,
                    userEmail: assignTargetUserEmail || null,
                    visibility: assignTargetVisibility,
                  });
                }}
                disabled={assignLeadsMutation.isPending}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer disabled:opacity-50"
              >
                {assignLeadsMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Assignment</span>
              </button>
            </div>
          </div>
        </div>
      )}
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
