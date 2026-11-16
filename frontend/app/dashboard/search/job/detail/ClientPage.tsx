'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { toast } from 'sonner';
import {
  Loader2,
  ArrowLeft,
  StopCircle,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  ArrowRight,
  Save,
  LayoutDashboard,
  Globe,
  AlertCircle,
  FileText,
  DownloadCloud,
  ShieldCheck,
  ShieldAlert,
  Search,
  X,
  Target,
  Terminal,
  Copy,
  Check,
  MapPin,
  SlidersHorizontal,
  ExternalLink,
  Phone,
  Mail,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Filter,
  Eye,
  Activity,
  Zap,
  List,
  LayoutGrid,
  Building2,
  Star,
  Compass,
  Radio,
  Lock,
  Unlock,
  Trash2
} from 'lucide-react';
import Link from 'next/link';

const formatTime = (seconds?: number) => {
  if (seconds === undefined || seconds === null || isNaN(Number(seconds))) return '--';
  const secNum = Number(seconds);
  if (secNum < 60) return `${Math.floor(secNum)}s`;
  const m = Math.floor(secNum / 60);
  const s = Math.floor(secNum % 60);
  return `${m}m ${s}s`;
};

const TERMINAL_STATUSES = ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'STOPPED'];

const parseLogEntry = (log: any) => {
  let rawMsg = '';
  let timeStr = '';
  let stage = '';

  if (typeof log === 'string') {
    rawMsg = log.trim();
    const match = rawMsg.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) {
      timeStr = match[1];
      rawMsg = match[2].trim();
    }
  } else if (log && typeof log === 'object') {
    rawMsg = (log.message || log.msg || '').trim();
    stage = log.stage || log.event_type || '';
    if (log.timestamp) {
      const parsed = new Date(
        typeof log.timestamp === 'number' || !isNaN(Number(log.timestamp))
          ? Number(log.timestamp) * 1000
          : log.timestamp
      );
      if (!isNaN(parsed.getTime())) {
        timeStr = parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
    }
  }

  return {
    rawMsg,
    timeStr,
    stage
  };
};

export default function JobProgressPage() {
  const searchParams = useSearchParams();
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = (searchParams.get('id') as string) || (params?.jobId as string);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [liveData, setLiveData] = useState<any>(null);
  const [liveLeads, setLiveLeads] = useState<any[]>([]);
  const [showCompletedModal, setShowCompletedModal] = useState(true);

  // UX state enhancements
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [logFilter, setLogFilter] = useState<'all' | 'discoveries' | 'warnings' | 'errors'>('all');
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  const { data: initialJob, isLoading } = useQuery({
    queryKey: ['searchJob', id],
    queryFn: async () => {
      const res = await api.get(`/search/${id}`);
      return res.data;
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'STOPPED'].includes(data.status)) {
        return false;
      }
      return wsConnected ? false : 3000;
    },
    enabled: !!id
  });

  const job = liveData || initialJob;

  // Authoritative saved leads count and records for this search campaign
  const { data: jobLeadsData } = useQuery({
    queryKey: ['jobSavedLeads', id],
    queryFn: async () => {
      if (!id) return { data: [], total: 0 };
      const res = await api.get(`/leads?job_id=${id}&limit=100`);
      return res.data || { data: [], total: 0 };
    },
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const jobData = liveData || initialJob;
      const isTerm = jobData && ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'STOPPED'].includes(jobData.status);
      return isTerm ? false : 3000;
    },
    staleTime: 2000,
  });

  const totalCampaignLeads = Math.max(
    (jobLeadsData?.data?.length || 0),
    (liveLeads?.length || 0),
    jobLeadsData?.total ?? 0,
    job?.actual_collected ?? 0,
    job?.completed_leads ?? 0,
    job?.total_saved ?? 0,
    job?.saved ?? 0
  );

  const handleExport = async (format: 'csv' | 'excel') => {
    try {
      const jobId = job?._id || id;
      if (!jobId) throw new Error('Job ID is missing');
      const res = await api.get(`/search/${jobId}/export?format=${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `leads_job_${jobId}.${format === 'excel' ? 'xlsx' : 'csv'}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      toast.success(`Exported leads to ${format.toUpperCase()}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to export leads');
    }
  };

  // Pipeline Consistency Validation Report
  const isTerminal = job && ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'STOPPED'].includes(job.status);
  const { data: consistencyReport } = useQuery({
    queryKey: ['consistency', id],
    queryFn: async () => {
      const res = await api.get(`/search/${id}/consistency`);
      return res.data;
    },
    enabled: !!id && !!isTerminal,
    staleTime: 60000
  });

  const initialJobRef = useRef(initialJob);
  useEffect(() => {
    initialJobRef.current = initialJob;
    if (initialJob) {
      setLiveData((prev: any) => {
        if (!prev) return initialJob;
        return {
          ...prev,
          ...initialJob,
          logs: (prev.logs?.length || 0) > (initialJob.logs?.length || 0) ? prev.logs : initialJob.logs,
          worker_states: { ...(initialJob.worker_states || {}), ...(prev.worker_states || {}) },
        };
      });
    }
  }, [initialJob]);

  // Once true, the job is terminal: WebSocket stops reconnecting, polling stops
  const terminalRef = useRef(false);

  useEffect(() => {
    const status = (liveData || initialJob)?.status;
    if (status && TERMINAL_STATUSES.includes(status)) {
      terminalRef.current = true;
    }
  }, [liveData, initialJob]);

  const prevJobIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevJobIdRef.current !== undefined && prevJobIdRef.current !== id) {
      setLiveData(null);
      setLiveLeads([]);
      setWsConnected(false);
      setShowCompletedModal(true);
      terminalRef.current = false;
    }
    prevJobIdRef.current = id;
  }, [id]);

  const applyStopped = () => {
    terminalRef.current = true;
    setLiveData((prev: any) => {
      const current = prev || initialJobRef.current || {};
      if (current.status === 'STOPPED') return current;
      return {
        ...current,
        status: 'STOPPED',
        progress: current.progress ?? 0,
        current_step: 'Stopped by user',
        logs: [
          ...(current.logs || []),
          '--------------------------------',
          'User requested stop',
          'Stopping scraper...',
          'Closing browser...',
          'Cancelling workers...',
          'Search terminated.',
          'Status changed to STOPPED.',
          '--------------------------------',
        ],
      };
    });
  };

  useEffect(() => {
    if (!id) return;

    const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
    const wsBase = rawApiUrl.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '').replace('localhost', '127.0.0.1');
    const wsUrl = `${wsBase}/ws/search/${id}`;

    let ws: WebSocket | null = null;
    let reconnectTimer: any;
    let connectTimeout: any;
    let isComponentMounted = true;
    let reconnectAttempts = 0;
    let hasConnected = false;

    const connectWs = () => {
      if (!isComponentMounted || terminalRef.current) return;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        } else if (ws.readyState === WebSocket.CONNECTING) {
          const prevWs = ws;
          prevWs.onopen = () => {
            try { prevWs.close(); } catch {}
          };
        }
        ws = null;
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const finalWsUrl = token ? `${wsUrl}?token=${token}` : wsUrl;

      ws = new WebSocket(finalWsUrl);
      connectTimeout = window.setTimeout(() => {
        if (ws && ws.readyState !== WebSocket.OPEN) {
          setWsConnected(false);
          // Let onclose or polling handle continuity without crashing
        }
      }, 15000);

      ws.onopen = () => {
        if (isComponentMounted) {
          clearTimeout(connectTimeout);
          hasConnected = true;
          setWsConnected(true);
          reconnectAttempts = 0;
        }
      };

      ws.onmessage = (event) => {
        if (!isComponentMounted) return;
        const trimmedData = typeof event.data === 'string' ? event.data.trim() : '';
        if (trimmedData === 'pong' || trimmedData === 'ping' || trimmedData.toLowerCase() === 'pong' || trimmedData.toLowerCase() === 'ping') {
          if (trimmedData.toLowerCase() === 'ping') {
            ws?.send('pong');
          }
          return;
        }

        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'heartbeat' || payload.event_type === 'HEARTBEAT') {
            ws?.send('ping');
            return;
          }

          // Re-fetch lead lists or invalidations on specific events
          if ([
            'LEAD_SAVED', 'LEAD_INSERTED', 'LEAD_UPDATED', 'LEAD_MERGED',
            'SEARCH_COMPLETED', 'SEARCH_STARTED', 'SEARCH_PROGRESS',
            'STATISTICS_UPDATED', 'SEARCH_HISTORY_UPDATED',
            'BUSINESS_OPENED', 'DETAILS_LOADING', 'PHONE_FOUND', 'WEBSITE_FOUND',
            'ADDRESS_FOUND', 'SOCIAL_FOUND', 'LEAD_CREATED', 'VALIDATION_PENDING',
            'EXTRACTION_COMPLETED', 'EMAIL_FOUND', 'job_stopped', 'new_lead',
            'business_discovered', 'lead_saved'
          ].includes(payload.event_type || payload.type)) {
            queryClient.invalidateQueries({ queryKey: ['jobSavedLeads', id] });
            queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['searchJob', id] });
            queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
            queryClient.invalidateQueries({ queryKey: ['dashboardCharts'] });
          }

          // Format log message
          let logMsg: string | null = null;
          let eventTimestamp = new Date();
          if (payload.timestamp) {
            const parsed = new Date(
              typeof payload.timestamp === 'number' || !isNaN(Number(payload.timestamp))
                ? Number(payload.timestamp) * 1000
                : payload.timestamp
            );
            if (!isNaN(parsed.getTime())) {
              eventTimestamp = parsed;
            }
          }
          const timeStr = eventTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          if (payload.type === 'event' && payload.event_type) {
            if (payload.message && payload.message.trim()) {
              logMsg = `[${timeStr}] ${payload.message.trim()}`;
            }
          } else if (payload.type === 'log') {
            const logEntry = payload.log;
            const text = typeof logEntry === 'string' ? logEntry : logEntry?.message;
            if (text && text.trim()) logMsg = text.trim();
          } else if (payload.event_type === 'LOG') {
            const logEntry = payload.data?.log || payload.log;
            const text = typeof logEntry === 'string' ? logEntry : logEntry?.message;
            if (text && text.trim()) logMsg = text.trim();
          }

          if (['BUSINESS_OPENED', 'DETAILS_LOADING', 'PHONE_FOUND', 'WEBSITE_FOUND',
            'ADDRESS_FOUND', 'SOCIAL_FOUND', 'EMAIL_FOUND', 'LEAD_CREATED',
            'VALIDATION_PENDING', 'EXTRACTION_COMPLETED', 'business_discovered',
            'lead_saved', 'duplicate_found', 'lead_failed'].includes(payload.event_type)) {
            const eventData = payload.data || {};
            if (payload.event_type === 'PHONE_FOUND' && eventData.phone) {
              logMsg = `[${timeStr}] 📞 Found phone: ${eventData.phone}`;
            } else if (payload.event_type === 'WEBSITE_FOUND' && eventData.website) {
              logMsg = `[${timeStr}] 🌐 Found website: ${eventData.website}`;
            } else if (payload.event_type === 'EMAIL_FOUND' && eventData.email) {
              logMsg = `[${timeStr}] 📧 Found email: ${eventData.email}`;
            } else if (payload.event_type === 'ADDRESS_FOUND' && eventData.address) {
              logMsg = `[${timeStr}] 📍 Found address: ${eventData.address}`;
            } else if (payload.event_type === 'SOCIAL_FOUND' && eventData.social) {
              const socialNames = Object.keys(eventData.social);
              logMsg = `[${timeStr}] 🔗 Found social: ${socialNames.join(', ')}`;
            } else if (payload.event_type === 'LEAD_CREATED' && eventData.name) {
              logMsg = `[${timeStr}] ✅ Lead created: ${eventData.name} (Valid: ${eventData.is_valid})`;
            } else if (payload.event_type === 'business_discovered' && eventData.business?.name) {
              logMsg = `[${timeStr}] 🔍 Discovered: ${eventData.business.name}`;
            } else if (payload.event_type === 'lead_saved' && eventData.business?.name) {
              logMsg = `[${timeStr}] 💾 Saved lead: ${eventData.business.name}`;
            } else if (payload.event_type === 'duplicate_found' && eventData.business?.name) {
              logMsg = `[${timeStr}] ⚠️ Duplicate skipped: ${eventData.business.name}`;
            } else if (payload.event_type === 'lead_failed' && eventData.reason) {
              logMsg = `[${timeStr}] ❌ Rejected: ${eventData.reason}`;
            }
          }

          // Handle liveLeads for display
          if (payload.type === 'new_lead') {
            if (terminalRef.current) {
              queryClient.invalidateQueries({ queryKey: ['leads'] });
              return;
            }
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            const leadData = payload.lead;
            if (leadData) {
              setLiveLeads(prevLeads => {
                const exists = prevLeads.some(l => {
                  const hasIdMatch = l._id && leadData._id && l._id === leadData._id;
                  const name1 = l.name || l.business_name;
                  const name2 = leadData.name || leadData.business_name;
                  const hasNameMatch = name1 && name2 && name1 === name2 && l.address === leadData.address;
                  const hasUrlMatch = l.url && leadData.url && l.url === leadData.url;
                  return hasIdMatch || hasNameMatch || hasUrlMatch;
                });
                if (exists) return prevLeads;
                return [{ ...leadData, _id: leadData._id || Math.random().toString() }, ...prevLeads].slice(0, 50);
              });
            }
          }

          // Construct updates
          const updates: Record<string, any> = {};

          if (payload.event_type === 'job_stopped') {
            terminalRef.current = true;
            updates.status = 'STOPPED';
            updates.progress = payload.progress ?? payload.data?.progress ?? 0;
            updates.current_step = 'Stopped by user';
            if (ws) ws.close();
          }

          if (payload.status !== undefined) updates.status = payload.status;
          if (payload.progress !== undefined) updates.progress = payload.progress;
          if (payload.current_step !== undefined) updates.current_step = payload.current_step;
          if (payload.current_business !== undefined) updates.current_business = payload.current_business;
          if (payload.current_action !== undefined) updates.current_action = payload.current_action;
          if (payload.collected_urls !== undefined) updates.collected_urls = payload.collected_urls;
          if (payload.queue_remaining !== undefined) updates.queue_remaining = payload.queue_remaining;
          if (payload.duration_seconds !== undefined) updates.duration_seconds = payload.duration_seconds;
          if (payload.estimated_remaining_time !== undefined) updates.estimated_remaining_time = payload.estimated_remaining_time;
          if (payload.total_leads !== undefined) updates.total_leads = payload.total_leads;
          if (payload.total_found !== undefined) updates.total_found = payload.total_found;
          if (payload.accepted_leads !== undefined) updates.accepted_leads = payload.accepted_leads;
          if (payload.rejected_leads !== undefined) updates.rejected_leads = payload.rejected_leads;
          if (payload.completed_leads !== undefined) updates.completed_leads = payload.completed_leads;
          if (payload.businesses_processed !== undefined) updates.businesses_processed = payload.businesses_processed;
          if (payload.duplicates_removed !== undefined) updates.duplicates_removed = payload.duplicates_removed;
          if (payload.failed_leads !== undefined) updates.failed_leads = payload.failed_leads;
          if (payload.total_valid_phones !== undefined) updates.total_valid_phones = payload.total_valid_phones;
          if (payload.total_valid_websites !== undefined) updates.total_valid_websites = payload.total_valid_websites;
          if (payload.performance !== undefined) updates.performance = payload.performance;
          if (payload.requested_target !== undefined) updates.requested_target = payload.requested_target;
          if (payload.actual_collected !== undefined) updates.actual_collected = payload.actual_collected;
          if (payload.target_reached !== undefined) updates.target_reached = payload.target_reached;
          if (payload.source_exhausted !== undefined) updates.source_exhausted = payload.source_exhausted;

          if (payload.processed !== undefined) updates.businesses_processed = payload.processed;
          if (payload.saved !== undefined) updates.completed_leads = payload.saved;
          if (payload.failed !== undefined) updates.failed_leads = payload.failed;
          if (payload.duplicates !== undefined) updates.duplicates_removed = payload.duplicates;

          if (payload.type === 'new_lead' && payload.total_saved !== undefined) {
            updates.completed_leads = payload.total_saved;
            updates.total_leads = payload.total_saved;
          }

          if (payload.type === 'event') {
            if (payload.event_type === 'SEARCH_STARTED') {
              updates.status = 'RUNNING';
            } else if (payload.event_type === 'SEARCH_COMPLETED') {
              const completedData = payload.data || {};
              const targetReached = completedData.target_reached ?? payload.target_reached;
              const finalStatus = payload.status || completedData.status || (targetReached ? 'COMPLETED' : 'PARTIALLY_COMPLETED');
              updates.status = finalStatus;

              if (completedData.progress !== undefined) {
                updates.progress = completedData.progress;
              } else if (payload.progress !== undefined) {
                updates.progress = payload.progress;
              } else {
                updates.progress = targetReached ? 100 : Math.min(100, Math.round(((completedData.businesses_found || 0) / (targetLeads || 1)) * 100));
              }

              if (completedData.current_step) updates.current_step = completedData.current_step;
              else if (payload.current_step) updates.current_step = payload.current_step;
              else if (payload.message) updates.current_step = payload.message;

              if (completedData.businesses_found !== undefined) {
                updates.completed_leads = completedData.businesses_found;
                updates.total_leads = completedData.businesses_found;
              }
              if (completedData.requested_target !== undefined) updates.requested_target = completedData.requested_target;
              if (completedData.actual_collected !== undefined) updates.actual_collected = completedData.actual_collected;
              if (completedData.target_reached !== undefined) updates.target_reached = completedData.target_reached;
              if (completedData.source_exhausted !== undefined) updates.source_exhausted = completedData.source_exhausted;
              if (completedData.requested_provider !== undefined) updates.requested_provider = completedData.requested_provider;
              if (completedData.active_provider !== undefined) updates.active_provider = completedData.active_provider;
              if (completedData.fallback_used !== undefined) updates.fallback_used = completedData.fallback_used;
            } else if (payload.event_type === 'SEARCH_FAILED') {
              updates.status = 'FAILED';
              if (payload.message) updates.current_step = payload.message;
            } else if (payload.event_type === 'SEARCH_PROGRESS' && payload.data) {
              const d = payload.data;
              if (d.status !== undefined) updates.status = d.status;
              if (d.current_state !== undefined) updates.status = d.current_state;
              if (d.progress !== undefined) updates.progress = d.progress;
              if (d.current_step !== undefined) updates.current_step = d.current_step;
              if (d.current_action !== undefined) updates.current_action = d.current_action;
              if (d.businesses_found !== undefined) {
                updates.total_leads = d.businesses_found;
                updates.completed_leads = d.businesses_found;
              }
              if (d.unique_urls !== undefined) updates.collected_urls = d.unique_urls;
              if (d.duplicate_count !== undefined) updates.duplicates_removed = d.duplicate_count;
              if (d.elapsed_time !== undefined) updates.duration_seconds = Math.floor(d.elapsed_time);
              if (d.worker_status !== undefined) {
                const workerId = d.worker_id || 'default_worker';
                updates.worker_states = { [workerId]: d };
              }
            } else if ((payload.event_type === 'LEAD_SAVED' || payload.event_type === 'LEAD_INSERTED') && payload.data) {
              const d = payload.data;
              if (d.count !== undefined) {
                updates.total_leads = d.count;
                updates.completed_leads = d.count;
              }
              if (d.total_leads !== undefined) updates.total_leads = d.total_leads;
              if (d.completed_leads !== undefined) updates.completed_leads = d.completed_leads;
            }
          }

          setLiveData((prev: any) => {
            const current = prev || initialJobRef.current || {};
            let incoming = updates;
            if (current.status && TERMINAL_STATUSES.includes(current.status)) {
              if (!TERMINAL_STATUSES.includes(incoming.status)) {
                incoming = { ...updates };
                delete incoming.status;
                delete incoming.progress;
                delete incoming.current_step;
                delete incoming.current_action;
                delete incoming.current_business;
                delete incoming.total_found;
                delete incoming.total_leads;
                delete incoming.accepted_leads;
                delete incoming.rejected_leads;
                delete incoming.completed_leads;
                delete incoming.failed_leads;
                delete incoming.duplicates_removed;
                delete incoming.businesses_processed;
                delete incoming.duration_seconds;
                delete incoming.estimated_remaining_time;
              }
            }

            const mergedWorkerStates = {
              ...(current.worker_states || {}),
              ...(incoming.worker_states || {})
            };

            const newLogs = (logMsg && logMsg.trim()) ? [...(current.logs || []), logMsg.trim()] : (current.logs || []);

            return {
              ...current,
              ...incoming,
              worker_states: mergedWorkerStates,
              logs: newLogs
            };
          });

        } catch (e) {
          console.error("Error parsing WS message", e);
        }
      };

      ws.onclose = () => {
        clearTimeout(connectTimeout);
        if (isComponentMounted && !terminalRef.current) {
          setWsConnected(false);
          if (reconnectAttempts < 8) {
            const delay = Math.min(1000 * (1.5 ** reconnectAttempts), 8000);
            reconnectAttempts++;
            reconnectTimer = setTimeout(connectWs, delay);
          }
        }
      };

      ws.onerror = () => {
        if (!hasConnected) {
          setWsConnected(false);
        }
      };
    };

    connectWs();

    return () => {
      isComponentMounted = false;
      clearTimeout(reconnectTimer);
      clearTimeout(connectTimeout);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000, 'Component unmounted');
        } else if (ws.readyState === WebSocket.CONNECTING) {
          const socketToClose = ws;
          socketToClose.onopen = () => {
            try {
              socketToClose.close(1000, 'Component unmounted');
            } catch {}
          };
        }
        ws = null;
      }
    };
  }, [id]);

  // Auto-scroll logs to bottom if enabled
  useEffect(() => {
    if (autoScrollLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [job?.logs, autoScrollLogs]);

  const isTerminalStatus = job && ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'STOPPED'].includes(job.status);
  const displayDuration = job?.duration_seconds || 0;

  const targetLeads = job?.requested_target ?? job?.limit ?? 100;
  const completedLeads = job?.completed_leads || 0;
  const progressPercent = targetLeads > 0
    ? Math.min(100, Math.max(0, job?.progress !== undefined && (job.status === 'COMPLETED' || job.status === 'PARTIALLY_COMPLETED') ? job.progress : Math.round((completedLeads / targetLeads) * 100)))
    : 100;

  // Velocity calculation
  const leadsPerMin = displayDuration > 5 && completedLeads > 0
    ? ((completedLeads / displayDuration) * 60).toFixed(1)
    : null;

  const stopMutation = useMutation({
    mutationFn: async () => {
      const jobId = job?._id || id;
      if (!jobId) throw new Error('Job ID is missing');
      const res = await api.post(`/search/${jobId}/stop`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Search stopped successfully.');
      applyStopped();
      queryClient.invalidateQueries({ queryKey: ['searchJob', id] });
      queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardCharts'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to stop the search. Please try again.');
    }
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      const jobId = job?._id || id;
      if (!jobId) throw new Error('Job ID is missing');
      const res = await api.post(`/search/${jobId}/retry`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Resuming search for remaining leads...');
      terminalRef.current = false;
      setLiveData(null);
      queryClient.invalidateQueries({ queryKey: ['searchJob', id] });
      queryClient.invalidateQueries({ queryKey: ['jobSavedLeads', id] });
      queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardCharts'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to resume search.');
    }
  });

  const copyAllLogs = () => {
    if (!normalizedLogs.length) return;
    const text = normalizedLogs
      .map((l: any) => l.timeStr ? `[${l.timeStr}] ${l.rawMsg}` : l.rawMsg)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    toast.success('Terminal logs copied to clipboard');
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const copyPhoneNumber = (phone: string, leadId: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhoneId(leadId);
    toast.success(`Copied: ${phone}`);
    setTimeout(() => setCopiedPhoneId(null), 1800);
  };

  // Combined leads list (deduplicating database and live stream so nothing is missed)
  const allLeadsList = useMemo<any[]>(() => {
    const map = new Map<string, any>();
    (jobLeadsData?.data || []).forEach((lead: any) => {
      const key = lead._id || lead.id || lead.google_maps_url || lead.url || ((lead.name || '') + (lead.address || ''));
      if (key) map.set(key, lead);
    });
    liveLeads.forEach((lead: any) => {
      const key = lead._id || lead.id || lead.google_maps_url || lead.url || ((lead.name || '') + (lead.address || ''));
      if (key) map.set(key, { ...(map.get(key) || {}), ...lead });
    });
    return Array.from(map.values());
  }, [liveLeads, jobLeadsData]);

  // Filtered discoveries
  const filteredLeads = useMemo<any[]>(() => {
    if (!leadSearchQuery.trim()) return allLeadsList;
    const q = leadSearchQuery.toLowerCase();
    return allLeadsList.filter((lead: any) => {
      const name = (lead.name || lead.business_name || '').toLowerCase();
      const phone = (lead.phone || '').toLowerCase();
      const cat = (lead.category || '').toLowerCase();
      const loc = (lead.city || lead.location || lead.address || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || cat.includes(q) || loc.includes(q);
    });
  }, [allLeadsList, leadSearchQuery]);

  // Normalized non-empty logs with parsed timestamps and messages
  const normalizedLogs = useMemo(() => {
    const rawLogs = job?.logs || [];
    return rawLogs
      .map((log: any, index: number) => ({ ...parseLogEntry(log), originalIndex: index }))
      .filter((l: any) => l.rawMsg.length > 0);
  }, [job?.logs]);

  // Tab counts for all log categories
  const logCounts = useMemo(() => {
    let discoveries = 0;
    let warnings = 0;
    let errors = 0;

    normalizedLogs.forEach((log: any) => {
      const lowerMsg = log.rawMsg.toLowerCase();
      const lowerStage = (log.stage || '').toLowerCase();

      if (
        lowerStage === 'error' ||
        lowerStage === 'failed' ||
        lowerMsg.includes('error') ||
        lowerMsg.includes('failed') ||
        lowerMsg.includes('fatal') ||
        lowerMsg.includes('exception')
      ) {
        errors++;
      } else if (
        lowerStage === 'warning' ||
        lowerStage === 'rejected' ||
        lowerStage === 'duplicate' ||
        lowerStage === 'rejected_cap' ||
        lowerMsg.includes('warning') ||
        lowerMsg.includes('rejected') ||
        lowerMsg.includes('duplicate') ||
        lowerMsg.includes('skipped') ||
        lowerMsg.includes('filtered')
      ) {
        warnings++;
      } else if (
        lowerStage.includes('extract') ||
        lowerStage.includes('saving') ||
        lowerStage.includes('validat') ||
        lowerStage.includes('discover') ||
        lowerStage.includes('scan') ||
        lowerMsg.includes('extracting') ||
        lowerMsg.includes('saving') ||
        lowerMsg.includes('validating') ||
        lowerMsg.includes('found') ||
        lowerMsg.includes('discovered') ||
        lowerMsg.includes('saved') ||
        lowerMsg.includes('lead created') ||
        lowerMsg.includes('candidate')
      ) {
        discoveries++;
      }
    });

    return {
      all: normalizedLogs.length,
      discoveries,
      warnings,
      errors
    };
  }, [normalizedLogs]);

  // Filtered logs based on active tab
  const filteredLogs = useMemo(() => {
    return normalizedLogs.filter((log: any) => {
      if (logFilter === 'all') return true;

      const lowerMsg = log.rawMsg.toLowerCase();
      const lowerStage = (log.stage || '').toLowerCase();

      if (logFilter === 'errors') {
        return (
          lowerStage === 'error' ||
          lowerStage === 'failed' ||
          lowerMsg.includes('error') ||
          lowerMsg.includes('failed') ||
          lowerMsg.includes('fatal') ||
          lowerMsg.includes('exception')
        );
      }

      if (logFilter === 'warnings') {
        return (
          lowerStage === 'warning' ||
          lowerStage === 'rejected' ||
          lowerStage === 'duplicate' ||
          lowerStage === 'rejected_cap' ||
          lowerMsg.includes('warning') ||
          lowerMsg.includes('rejected') ||
          lowerMsg.includes('duplicate') ||
          lowerMsg.includes('skipped') ||
          lowerMsg.includes('filtered')
        );
      }

      if (logFilter === 'discoveries') {
        const isErrOrWarn =
          lowerStage === 'error' ||
          lowerStage === 'failed' ||
          lowerStage === 'warning' ||
          lowerStage === 'rejected' ||
          lowerStage === 'duplicate' ||
          lowerMsg.includes('error') ||
          lowerMsg.includes('failed') ||
          lowerMsg.includes('duplicate') ||
          lowerMsg.includes('rejected');

        if (isErrOrWarn) return false;

        return (
          lowerStage.includes('extract') ||
          lowerStage.includes('saving') ||
          lowerStage.includes('validat') ||
          lowerStage.includes('discover') ||
          lowerStage.includes('scan') ||
          lowerMsg.includes('extracting') ||
          lowerMsg.includes('saving') ||
          lowerMsg.includes('validating') ||
          lowerMsg.includes('found') ||
          lowerMsg.includes('discovered') ||
          lowerMsg.includes('saved') ||
          lowerMsg.includes('lead created') ||
          lowerMsg.includes('candidate')
        );
      }

      return true;
    });
  }, [normalizedLogs, logFilter]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh] gap-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm animate-pulse">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
        <p className="text-sm font-medium text-slate-500">Loading search engine session...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500 gap-4">
        <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-500 shadow-sm">
          <XCircle className="w-7 h-7" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-lg font-bold text-slate-800">Job Not Found</p>
          <p className="text-sm text-slate-400">The requested search execution record does not exist or has expired.</p>
        </div>
        <Link
          href="/dashboard/search"
          className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm shadow-blue-500/20"
        >
          Return to Search
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Context Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Breadcrumb + Title */}
          <div className="flex items-center gap-3.5">
            <Link
              href="/dashboard/search"
              className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 rounded-xl transition-all shadow-2xs group"
              title="Back to Search"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            </Link>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Search Execution Engine
                </h1>

                {/* Status Pill Badge */}
                {job.status === 'RUNNING' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                    </span>
                    RUNNING
                  </span>
                ) : job.status === 'COMPLETED' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    COMPLETED
                  </span>
                ) : job.status === 'PARTIALLY_COMPLETED' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    PARTIALLY COMPLETED
                  </span>
                ) : job.status === 'STOPPED' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
                    <StopCircle className="w-3.5 h-3.5 text-amber-600" />
                    STOPPED
                  </span>
                ) : (job.status === 'QUEUED' || job.status === 'PENDING') ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    PENDING
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    {job.status}
                  </span>
                )}

                {/* Connection Status Pill */}
                {wsConnected ? (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    WS Live
                  </span>
                ) : !isTerminalStatus && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    Polling
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono text-slate-400">ID: {job._id ? String(job._id).slice(-8) : 'Session'}</span>
                <span>•</span>
                <span>Created {new Date().toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2.5">
            {/* Drawer Toggle */}
            <button
              onClick={() => setShowConfigDrawer(true)}
              className="px-3.5 py-2 text-xs font-bold rounded-xl text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all flex items-center gap-2 hover:shadow-2xs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>Job Info</span>
              {consistencyReport && (
                <span className={`w-2 h-2 rounded-full ${consistencyReport.is_consistent ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
              )}
            </button>

            {/* Quick Export Button */}
            <button
              onClick={() => handleExport('csv')}
              className="px-3.5 py-2 text-xs font-bold rounded-xl text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all flex items-center gap-2 hover:shadow-2xs"
              title="Download CSV"
            >
              <DownloadCloud className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            {/* Retry / Resume Search Button for Partially Completed, Stopped, or Failed Jobs */}
            {isTerminalStatus && job.status !== 'COMPLETED' && (
              <button
                onClick={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
                className="px-4 py-2 text-xs font-bold rounded-xl text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 transition-all flex items-center gap-2 disabled:opacity-50 hover:shadow-2xs cursor-pointer"
                title={`Continue search for remaining ${Math.max(0, targetLeads - completedLeads)} leads without duplicating existing`}
              >
                {retryMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Resume Search
              </button>
            )}

            {/* Stop Job Button */}
            {!isTerminalStatus && (
              <button
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                className="px-4 py-2 text-xs font-bold rounded-xl text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-all flex items-center gap-2 disabled:opacity-50 hover:shadow-2xs"
              >
                {stopMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <StopCircle className="w-3.5 h-3.5" />
                )}
                Stop Job
              </button>
            )}

            {/* View Leads Link */}
            <Link
              href={`/dashboard/leads?job_id=${id || job?._id}`}
              className="px-4 py-2 text-xs font-bold rounded-xl text-white bg-blue-600 hover:bg-blue-700 transition-all flex items-center gap-1.5 shadow-sm shadow-blue-500/20"
              title={`View ${totalCampaignLeads} leads generated by this campaign`}
            >
              <span>View Leads ({totalCampaignLeads})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Compact Search Query Parameter Strip */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-slate-700 font-medium">
            <Radio className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-slate-400 font-normal">Provider:</span>
            <span className="font-semibold text-slate-900">{job.requested_provider || job.provider || 'Google Maps'}</span>
            {job.fallback_used && (
              <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100" title={job.fallback_reason || 'Routed via Google Maps index'}>
                via {job.active_provider || 'Google Maps'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-slate-700 font-medium">
            <Search className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-slate-400 font-normal">Query:</span>
            <span className="font-semibold text-slate-900">{job.keyword || '--'}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-slate-700 font-medium">
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-slate-400 font-normal">Location:</span>
            <span className="font-semibold text-slate-900">{job.location || job.city || '--'}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-slate-700 font-medium">
            <Target className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-slate-400 font-normal">Target:</span>
            <span className="font-semibold text-slate-900">
              {job.exhaustive ? 'Exhaustive Area Scrape' : `${targetLeads} Leads`}
            </span>
          </div>

          {leadsPerMin && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50/70 border border-blue-200/60 text-blue-700 font-medium ml-auto">
              <Zap className="w-3.5 h-3.5 text-blue-600" />
              <span>Velocity: <strong>{leadsPerMin}</strong> leads/min</span>
            </div>
          )}
        </div>
      </div>

      {/* Warning banner if source exhausted or partially completed */}
      {(job.source_exhausted || job.status === 'PARTIALLY_COMPLETED') && (job.status === 'COMPLETED' || job.status === 'PARTIALLY_COMPLETED') && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 shadow-2xs">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
          <div className="space-y-1 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-sm">Source exhausted — Target not fully reached</p>
              <button
                onClick={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
                className="px-3 py-1 text-xs font-bold rounded-lg text-amber-900 bg-amber-200/70 hover:bg-amber-200 border border-amber-300 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                {retryMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Resume Search ({Math.max(0, targetLeads - (job.actual_collected ?? completedLeads))} remaining)
              </button>
            </div>
            <p className="text-xs text-amber-700 leading-relaxed">
              {job.active_provider || job.fallback_provider || job.provider || 'Selected provider'} ran out of unique usable results for this search area. Extracted{' '}
              <strong>{job.actual_collected ?? completedLeads}</strong> of requested{' '}
              <strong>{targetLeads}</strong> leads.
              {job.fallback_used && (
                <span className="block mt-1 text-[11px] text-amber-700 font-medium">
                  Note: Query for <strong>{job.requested_provider || job.provider}</strong> was fulfilled via the <strong>{job.active_provider || 'Google Maps'}</strong> directory index.
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Progress & 4-Card KPI Funnel (Zero Truncation!) */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
        {/* Progress Bar & Current Activity Header */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Phase</span>
                {!isTerminalStatus && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                    <Activity className="w-3 h-3 animate-pulse" />
                    Executing Scraper
                  </span>
                )}
              </div>
              <p className="text-base font-bold text-slate-800 flex items-center gap-2">
                {!isTerminalStatus && <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
                {job.status === 'COMPLETED'
                  ? (completedLeads === 0
                      ? 'Search Completed — 0 Results Found'
                      : (job.current_step || 'Target Reached — All Requested Leads Collected'))
                  : job.status === 'PARTIALLY_COMPLETED'
                  ? (job.current_step || 'Source Exhausted — Partially Completed')
                  : job.status === 'STOPPED'
                  ? (job.current_step || 'Search Stopped by User')
                  : job.status === 'FAILED'
                  ? (job.error_message || job.current_step || 'Search Failed')
                  : (job.status === 'QUEUED' || job.status === 'PENDING')
                  ? 'Initializing Scraper & Browser Engine...'
                  : (job.current_step || job.current_action || 'Executing Scraper & Extracting Leads...')}
              </p>
            </div>

            {/* Big Progress Percentage */}
            <div className="text-right">
              <div className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight flex items-baseline justify-end">
                {progressPercent}
                <span className="text-xl lg:text-2xl font-bold text-slate-400 ml-1">%</span>
              </div>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                {completedLeads} of {targetLeads} leads collected
              </p>
            </div>
          </div>

          {/* Smooth High-Definition Progress Bar */}
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200/60 shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out relative ${
                job.status === 'FAILED'
                  ? 'bg-red-500'
                  : job.status === 'PARTIALLY_COMPLETED'
                  ? 'bg-amber-500'
                  : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            >
              {!isTerminalStatus && (
                <div className="absolute inset-0 bg-white/25 animate-[shimmer_2s_infinite] -skew-x-12"></div>
              )}
            </div>
          </div>
        </div>

        {/* 4 Spacious KPI Cards (Zero Truncation, Full Context!) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {/* 1. Saved Leads */}
          <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/70 rounded-xl p-4.5 transition-all shadow-2xs group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Saved Leads</span>
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 group-hover:scale-105 transition-transform">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                {completedLeads}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                / {targetLeads} target
              </span>
            </div>
            <div className="mt-2.5 w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round((completedLeads / (targetLeads || 1)) * 100))}%` }}
              ></div>
            </div>
          </div>

          {/* 2. Discovered Leads */}
          <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/70 rounded-xl p-4.5 transition-all shadow-2xs group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Discovered</span>
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 group-hover:scale-105 transition-transform">
                <Globe className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                {job.total_found || 0}
              </span>
              <span className="text-xs font-medium text-slate-500">found</span>
            </div>
            <p className="text-xs font-medium text-slate-500 mt-2">
              <span className="text-blue-600 font-bold">{job.accepted_leads || 0}</span> passed validation
            </p>
          </div>

          {/* 3. Filtered & Deduplicated */}
          <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/70 rounded-xl p-4.5 transition-all shadow-2xs group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filtered Out</span>
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 group-hover:scale-105 transition-transform">
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                {(job.duplicates_removed || 0) + (job.rejected_leads || 0)}
              </span>
              <span className="text-xs font-medium text-slate-500">skipped</span>
            </div>
            <p className="text-xs font-medium text-slate-500 mt-2">
              <span className="text-amber-600 font-bold">{job.duplicates_removed || 0}</span> dupes • <span className="text-red-500 font-bold">{job.rejected_leads || 0}</span> rejected
            </p>
          </div>

          {/* 4. Execution Time */}
          <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/70 rounded-xl p-4.5 transition-all shadow-2xs group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Elapsed Time</span>
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 group-hover:scale-105 transition-transform">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight font-mono">
                {formatTime(displayDuration)}
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 mt-2">
              {job.status === 'COMPLETED'
                ? 'Completed run'
                : job.status === 'PARTIALLY_COMPLETED'
                ? 'Partially completed run'
                : job.status === 'STOPPED'
                ? 'Stopped run'
                : job.status === 'FAILED'
                ? 'Failed run'
                : isTerminalStatus
                ? 'Finished run'
                : 'Real-time scraper'}
            </p>
          </div>
        </div>

        {/* Concurrency Worker Strip (if active) */}
        {job.worker_states && Object.keys(job.worker_states).length > 0 && (
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Active Pipeline Workers ({Object.keys(job.worker_states).length})
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {Object.entries(job.worker_states).map(([workerId, state]) => (
                <div key={workerId} className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                    <span className="font-bold text-slate-800 truncate">{workerId}</span>
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-blue-600 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0 ml-2">
                    {typeof state === 'object'
                      ? `${(state as any)?.status || (state as any)?.worker_status || 'Active'} [${(state as any)?.progress || 0}%]`
                      : String(state)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Workspace: Balanced 60/40 Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column (60%): Live Discoveries Stream */}
        <div className="xl:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[640px]">
            {/* Discoveries Header */}
            <div className="p-4 lg:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      Live Discoveries
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                      {totalCampaignLeads} leads generated
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Real-time extracted business records</p>
                </div>
              </div>

              {/* Controls: Search filter & view toggle */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter discoveries..."
                    value={leadSearchQuery}
                    onChange={(e) => setLeadSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 placeholder:text-slate-400 w-36 sm:w-48 transition-all"
                  />
                  {leadSearchQuery && (
                    <button
                      onClick={() => setLeadSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`p-1.5 rounded-lg text-xs transition-all ${
                      viewMode === 'cards'
                        ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Card View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`p-1.5 rounded-lg text-xs transition-all ${
                      viewMode === 'table'
                        ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Table View"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Discoveries Body */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/40">
              {filteredLeads.length > 0 ? (
                viewMode === 'cards' ? (
                  /* Cards View */
                  <div className="space-y-3">
                    {filteredLeads.map((lead: any, idx: number) => {
                      const businessName = lead.name || lead.business_name || 'Business Name';
                      const category = lead.category || job.keyword || 'Company';
                      const location = lead.city || lead.location || lead.address || job.location;
                      const leadId = lead._id || String(idx);

                      return (
                        <div
                          key={leadId}
                          className="bg-white border border-slate-200/80 hover:border-blue-200 rounded-xl p-4 transition-all shadow-2xs hover:shadow-sm space-y-3 group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center font-black text-blue-700 text-sm shadow-2xs shrink-0">
                                {businessName.charAt(0).toUpperCase()}
                              </div>
                              <div className="space-y-0.5">
                                <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors line-clamp-1">
                                  {businessName}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  <span className="px-2 py-0.5 rounded-md bg-slate-100 font-medium text-slate-600 text-[11px]">
                                    {category}
                                  </span>
                                  {location && (
                                    <span className="flex items-center gap-1 text-slate-500 text-[11px]">
                                      <MapPin className="w-3 h-3 text-slate-400" />
                                      {location}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {lead.google_rating && (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-700 text-xs font-bold shrink-0">
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                <span>{lead.google_rating}</span>
                                {lead.reviews_count && (
                                  <span className="text-[10px] text-amber-600/80 font-normal">({lead.reviews_count})</span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Contact Action Chips */}
                          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
                            {lead.phone ? (
                              <button
                                onClick={() => copyPhoneNumber(lead.phone, leadId)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium transition-colors"
                                title="Click to copy phone number"
                              >
                                {copiedPhoneId === leadId ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Phone className="w-3 h-3 text-emerald-600" />
                                )}
                                <span>{lead.phone}</span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 text-slate-400 text-[11px]">
                                <Phone className="w-3 h-3 opacity-40" />
                                No phone
                              </span>
                            )}

                            {lead.website ? (
                              <a
                                href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/60 hover:bg-blue-100/60 border border-blue-200/60 text-blue-700 font-medium transition-colors"
                              >
                                <Globe className="w-3 h-3 text-blue-600" />
                                <span className="truncate max-w-[140px]">Visit Website</span>
                                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                              </a>
                            ) : null}

                            {lead.email && (
                              <a
                                href={`mailto:${lead.email}`}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50/60 hover:bg-indigo-100/60 border border-indigo-200/60 text-indigo-700 font-medium transition-colors"
                              >
                                <Mail className="w-3 h-3 text-indigo-600" />
                                <span className="truncate max-w-[120px]">{lead.email}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Compact Table View */
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">Business</th>
                          <th className="px-4 py-3">Location</th>
                          <th className="px-4 py-3">Phone</th>
                          <th className="px-4 py-3 text-right">Links</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredLeads.map((lead: any, idx: number) => (
                          <tr key={lead._id || idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-bold text-slate-900">{lead.name || lead.business_name}</p>
                              <p className="text-[11px] text-slate-400">{lead.category || job.keyword}</p>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {lead.city || lead.location || '--'}
                            </td>
                            <td className="px-4 py-3">
                              {lead.phone ? (
                                <button
                                  onClick={() => copyPhoneNumber(lead.phone, lead._id || String(idx))}
                                  className="font-mono text-slate-700 hover:text-blue-600 flex items-center gap-1"
                                >
                                  {lead.phone}
                                  {copiedPhoneId === (lead._id || String(idx)) ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-2.5 h-2.5 text-slate-400" />
                                  )}
                                </button>
                              ) : (
                                <span className="text-slate-400">--</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {lead.website ? (
                                <a
                                  href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline font-semibold inline-flex items-center gap-1"
                                >
                                  Site <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <span className="text-slate-300">--</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                /* Empty / Awaiting State */
                <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center relative">
                    {!isTerminalStatus ? (
                      <>
                        <div className="absolute inset-0 rounded-2xl border-2 border-blue-500/20 animate-ping"></div>
                        <Compass className="w-8 h-8 text-blue-600 animate-spin" style={{ animationDuration: '6s' }} />
                      </>
                    ) : (
                      <Globe className="w-8 h-8 text-slate-300" />
                    )}
                  </div>
                  <div className="space-y-1.5 max-w-sm">
                    <h3 className="font-bold text-slate-800 text-sm">
                      {isTerminalStatus ? 'No Live Discoveries Recorded' : 'Awaiting Live Discoveries'}
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {isTerminalStatus
                        ? 'This session has finished. You can view all saved leads in the leads dashboard.'
                        : `The scraper is querying ${job.requested_provider || job.provider || 'the selected source'} and loading business profiles. Verified results will stream into this feed live.`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (40%): Live Engine Console & Terminal */}
        <div className="xl:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[640px]">
            {/* Terminal Header */}
            <div className="p-4 lg:p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white sticky top-0 z-10">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                      Terminal Logs
                    </h2>
                    <span className="text-[11px] font-mono text-slate-400">
                      ({filteredLogs.length})
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Live execution telemetry stream</p>
                </div>
              </div>

              {/* Terminal Action Tools */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                  className={`p-1.5 rounded-lg text-xs border transition-all ${
                    autoScrollLogs
                      ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-800'
                  }`}
                  title={autoScrollLogs ? 'Auto-scroll: ON' : 'Auto-scroll: OFF'}
                >
                  {autoScrollLogs ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={copyAllLogs}
                  className="p-1.5 rounded-lg text-xs bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all"
                  title="Copy All Logs"
                >
                  {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Filter Pills for Logs */}
            <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50 flex items-center gap-1.5 text-[11px] overflow-x-auto">
              {[
                { id: 'all', label: 'All', count: logCounts.all },
                { id: 'discoveries', label: 'Discoveries', count: logCounts.discoveries },
                { id: 'warnings', label: 'Warnings', count: logCounts.warnings },
                { id: 'errors', label: 'Errors', count: logCounts.errors },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setLogFilter(tab.id as any)}
                  className={`px-2.5 py-1 rounded-lg font-semibold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                    logFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                    logFilter === tab.id ? 'bg-slate-100 text-slate-800' : 'bg-slate-200/60 text-slate-500'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Terminal Body */}
            <div className="flex-1 p-4 overflow-y-auto font-mono text-[11px] space-y-2 custom-scrollbar bg-slate-50/80 border-t border-slate-100 text-slate-800">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log: any, i: number) => {
                  const isLifecycle = log.rawMsg.includes("LIFECYCLE_LOG");
                  const lowerMsg = log.rawMsg.toLowerCase();
                  const lowerStage = (log.stage || '').toLowerCase();

                  const isError =
                    lowerStage === 'error' ||
                    lowerStage === 'failed' ||
                    lowerMsg.includes('error') ||
                    lowerMsg.includes('failed') ||
                    lowerMsg.includes('fatal');

                  const isRejected =
                    lowerStage === 'warning' ||
                    lowerStage === 'rejected' ||
                    lowerStage === 'duplicate' ||
                    lowerMsg.includes('rejected') ||
                    lowerMsg.includes('duplicate') ||
                    lowerMsg.includes('skipped');

                  const isSuccess =
                    lowerStage.includes('saving') ||
                    lowerStage.includes('discover') ||
                    lowerStage.includes('extract') ||
                    log.rawMsg.includes('✅') ||
                    lowerMsg.includes('saved') ||
                    lowerMsg.includes('discovered') ||
                    lowerMsg.includes('extracting') ||
                    lowerMsg.includes('lead created');

                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2.5 leading-relaxed rounded px-2.5 py-1.5 transition-colors ${
                        isLifecycle
                          ? 'text-sky-900 bg-sky-50 border border-sky-200 font-semibold'
                          : isError
                          ? 'text-rose-900 bg-rose-50 border border-rose-200 font-semibold'
                          : isRejected
                          ? 'text-amber-900 bg-amber-50 border border-amber-200'
                          : isSuccess
                          ? 'text-emerald-900 bg-emerald-50 border border-emerald-200 font-semibold'
                          : 'text-slate-700 bg-white border border-slate-200/60 hover:bg-slate-100/70'
                      }`}
                    >
                      {log.timeStr && (
                        <span className="text-slate-400 shrink-0 select-none text-[10px] mt-0.5 font-bold">
                          [{log.timeStr}]
                        </span>
                      )}
                      <span className="break-all">{log.rawMsg}</span>
                    </div>
                  );
                })
              ) : (
                <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-3">
                  {logFilter === 'warnings' ? (
                    <>
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-2xs">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-700">No Warnings Encountered</p>
                        <p className="text-[11px] text-slate-400 max-w-xs">
                          All scanned candidates passed business quality validation and deduplication filters without warning.
                        </p>
                      </div>
                    </>
                  ) : logFilter === 'errors' ? (
                    <>
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-2xs">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-700">Zero Execution Errors</p>
                        <p className="text-[11px] text-slate-400 max-w-xs">
                          The scraper and browser engine executed smoothly without any runtime or extraction exceptions.
                        </p>
                      </div>
                    </>
                  ) : logFilter === 'discoveries' ? (
                    isTerminalStatus ? (
                      <>
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
                          <Building2 className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-700">Discovery Telemetry Complete</p>
                          <p className="text-[11px] text-slate-400 max-w-xs">
                            {allLeadsList.length > 0
                              ? `${allLeadsList.length} leads successfully extracted and persisted. View full records on the left panel.`
                              : 'No candidate businesses were extracted during this search session.'}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs animate-pulse">
                          <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-700">Awaiting Discoveries...</p>
                          <p className="text-[11px] text-slate-400 max-w-xs">
                            The scraper is querying the directory. Discovered and validated leads will log here in real time.
                          </p>
                        </div>
                      </>
                    )
                  ) : isTerminalStatus ? (
                    <>
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shadow-2xs">
                        <Terminal className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-700">Search Run Completed</p>
                        <p className="text-[11px] text-slate-400 max-w-xs">
                          Execution telemetry stream has finalized.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin opacity-40 text-blue-500" />
                      <span className="text-xs text-slate-400">Waiting for engine output stream...</span>
                    </>
                  )}
                </div>
              )}
              <div ref={logsEndRef} className="h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Slide-over Drawer: Search Configuration & Data Integrity Audit */}
      {showConfigDrawer && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Job Info & Integrity Audit</h3>
                  <p className="text-xs text-slate-400">Technical parameters and referential integrity</p>
                </div>
              </div>
              <button
                onClick={() => setShowConfigDrawer(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Configuration Parameters Card */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Search Parameters</h4>
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Search Engine Provider</span>
                    <span className="font-bold text-slate-900">
                      {job.requested_provider || job.provider || 'Google Maps'}
                      {job.fallback_used && (
                        <span className="ml-1 text-[11px] font-normal text-blue-600">
                          (via {job.active_provider || 'Google Maps'})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Keyword / Industry</span>
                    <span className="font-bold text-slate-900">{job.keyword || '--'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Target Location</span>
                    <span className="font-bold text-slate-900">{job.location || job.city || '--'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Extraction Target</span>
                    <span className="font-bold text-slate-900">{targetLeads} Leads</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Exhaustive Mode</span>
                    <span className="font-bold text-slate-900">{job.exhaustive ? 'Enabled (Full scrape)' : 'Disabled'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Job Identifier</span>
                    <span className="font-mono text-slate-700 font-semibold">{String(job._id || id)}</span>
                  </div>
                </div>
              </div>

              {/* Data Integrity Report (if available) */}
              {consistencyReport ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pipeline Data Integrity</h4>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                      consistencyReport.is_consistent
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {consistencyReport.is_consistent ? 'VERIFIED' : 'MISMATCH'}
                    </span>
                  </div>

                  <div className={`p-4 rounded-xl border ${
                    consistencyReport.is_consistent
                      ? 'bg-emerald-50/60 border-emerald-200/80 text-emerald-800'
                      : 'bg-red-50/60 border-red-200/80 text-red-800'
                  }`}>
                    <p className="text-xs font-bold">{consistencyReport.verdict}</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3 text-xs">
                    {[
                      { label: 'Discovered Businesses', value: consistencyReport.summary?.businesses_discovered },
                      { label: 'Processed Profiles', value: consistencyReport.summary?.businesses_processed },
                      { label: 'MongoDB Saved Documents', value: consistencyReport.summary?.mongo_lead_documents },
                      { label: 'Job Report Total Leads', value: consistencyReport.summary?.job_total_leads },
                      { label: 'Failed Leads', value: consistencyReport.summary?.failed_leads },
                      { label: 'Duplicates Removed', value: consistencyReport.summary?.duplicates },
                    ].map((row, idx) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="text-slate-500">{row.label}</span>
                        <span className="font-bold text-slate-900">{row.value ?? '--'}</span>
                      </div>
                    ))}
                  </div>

                  {consistencyReport.mismatches?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-red-600 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" /> Mismatches Found
                      </p>
                      {consistencyReport.mismatches.map((m: any, i: number) => (
                        <div key={i} className="p-3 bg-red-50/60 border border-red-200 rounded-xl text-xs space-y-1">
                          <p className="font-bold text-red-800">{m.broken_stage}</p>
                          <p className="text-red-700">{m.description}</p>
                          <div className="flex gap-2 text-[10px] font-mono pt-1">
                            <span className="bg-white px-2 py-0.5 rounded border border-red-100 text-slate-700">Exp: {m.expected}</span>
                            <span className="bg-white px-2 py-0.5 rounded border border-red-100 text-red-600">Act: {m.actual}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400 text-center">
                    Validation computed in {consistencyReport.validation_duration_seconds}s
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-500 text-center space-y-1">
                  <ShieldCheck className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="font-semibold text-slate-700">Data Integrity Validation</p>
                  <p className="text-[11px] text-slate-400">Referential consistency check will execute when the job reaches a terminal status.</p>
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex gap-2">
              <button
                onClick={() => setShowConfigDrawer(false)}
                className="w-full py-2.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors text-center"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Completed / Partially Completed Modal */}
      {(job.status === 'COMPLETED' || job.status === 'PARTIALLY_COMPLETED') && showCompletedModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-all">
          <div className="bg-white rounded-3xl p-8 max-w-xl w-full shadow-2xl border border-slate-200 relative overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            {/* Close Button */}
            <button
              onClick={() => setShowCompletedModal(false)}
              className="absolute top-5 right-5 z-20 p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-all border border-slate-200"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header / Celebration */}
            <div className="text-center space-y-3 mb-8">
              <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center shadow-sm ${
                job.status === 'PARTIALLY_COMPLETED'
                  ? 'bg-amber-50 border border-amber-200 text-amber-600'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-600'
              }`}>
                {job.status === 'PARTIALLY_COMPLETED' ? (
                  <AlertTriangle className="w-8 h-8" />
                ) : (
                  <CheckCircle2 className="w-8 h-8" />
                )}
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                {job.status === 'PARTIALLY_COMPLETED' ? 'Search Partially Completed' : 'Search Completed!'}
              </h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                {job.status === 'PARTIALLY_COMPLETED' || job.source_exhausted
                  ? `${job.active_provider || job.fallback_provider || job.provider || 'Selected provider'} ran out of unique usable results for this search area. Extracted ${job.actual_collected ?? completedLeads} of ${targetLeads} requested leads.`
                  : 'All qualified leads have been extracted, validated, and saved to your database.'}
              </p>
            </div>

            {/* Stats Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'Target', value: targetLeads, color: 'text-blue-600' },
                { label: 'Collected', value: job.actual_collected ?? completedLeads, color: 'text-emerald-600' },
                { label: 'Duplicates', value: job.duplicates_removed || 0, color: 'text-amber-600' },
                { label: 'Duration', value: formatTime(displayDuration), color: 'text-indigo-600' }
              ].map((stat, idx) => (
                <div key={idx} className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 text-center">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">{stat.label}</p>
                  <p className={`text-xl font-black ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Primary Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              {job.status === 'PARTIALLY_COMPLETED' && (
                <button
                  onClick={() => {
                    setShowCompletedModal(false);
                    retryMutation.mutate();
                  }}
                  disabled={retryMutation.isPending}
                  className="flex-1 px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-center text-sm transition-all flex items-center justify-center gap-2 shadow-sm shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                >
                  {retryMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Resume Search ({Math.max(0, targetLeads - completedLeads)} remaining)
                </button>
              )}
              <Link
                href={`/dashboard/leads?job_id=${id || job?._id}`}
                className="flex-1 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-center text-sm transition-all flex items-center justify-center gap-2 shadow-sm shadow-blue-500/20"
              >
                <LayoutDashboard className="w-4 h-4" /> View Campaign Leads ({totalCampaignLeads})
              </Link>
              <Link
                href="/dashboard/search"
                className="flex-1 px-5 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-center text-sm transition-all"
              >
                New Search
              </Link>
            </div>

            {/* Quick Export Links */}
            <div className="mt-6 pt-6 border-t border-slate-100 flex justify-center gap-6 text-xs font-semibold text-slate-500">
              <button
                onClick={() => handleExport('csv')}
                className="hover:text-blue-600 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <DownloadCloud className="w-4 h-4" /> Export CSV
              </button>
              <button
                onClick={() => handleExport('excel')}
                className="hover:text-emerald-600 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-4 h-4" /> Export Excel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
