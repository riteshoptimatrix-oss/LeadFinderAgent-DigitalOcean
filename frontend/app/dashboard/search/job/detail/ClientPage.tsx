'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, StopCircle, Clock, CheckCircle2, XCircle, AlertTriangle, Download, ArrowRight, Save, LayoutDashboard, Globe, AlertCircle, FileText, DownloadCloud, ShieldCheck, ShieldAlert, Search, X, Target } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/src/components/common/PageHeader';

const formatTime = (seconds?: number) => {
  if (seconds === undefined || seconds === null || isNaN(Number(seconds))) return '--';
  const secNum = Number(seconds);
  if (secNum < 60) return `${Math.floor(secNum)}s`;
  const m = Math.floor(secNum / 60);
  const s = Math.floor(secNum % 60);
  return `${m}m ${s}s`;
};

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'STOPPED'];

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

  const { data: initialJob, isLoading } = useQuery({
    queryKey: ['searchJob', id],
    queryFn: async () => {
      const res = await api.get(`/search/${id}`);
      return res.data;
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'STOPPED'].includes(data.status)) {
        return false;
      }
      return wsConnected ? false : 3000;
    },
    enabled: !!id
  });

  const job = liveData || initialJob;

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
    } catch (err) {
      console.error(err);
      alert('Failed to export leads');
    }
  };

  // Pipeline Consistency Validation Report
  const isTerminal = job && ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'STOPPED'].includes(job.status);
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

  // Once true, the job is terminal: WebSocket stops reconnecting, polling stops,
  // and no delayed update is allowed to flip the state back to RUNNING.
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
    const currentStatus = (liveData || initialJob)?.status;
    if (terminalRef.current || (currentStatus && TERMINAL_STATUSES.includes(currentStatus))) {
      return;
    }

    const wsUrl = (process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.replace('http', 'ws') + `/ws/search/${id}`
      : `ws://127.0.0.1:8000/ws/search/${id}`).replace('localhost', '127.0.0.1');

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let isComponentMounted = true;
    let reconnectAttempts = 0;
    let hasConnected = false;
    let websocketUnavailable = false;

    const connectWs = () => {
      if (!isComponentMounted || websocketUnavailable || terminalRef.current) return;
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === 0) {
          ws.onopen = () => {
            try { ws?.close(); } catch (_) {}
          };
        } else {
          try { ws.close(); } catch (_) {}
        }
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const finalWsUrl = token ? `${wsUrl}?token=${token}` : wsUrl;

      ws = new WebSocket(finalWsUrl);
      const connectTimeout = window.setTimeout(() => {
        if (!isComponentMounted) return;
        if (ws && ws.readyState !== WebSocket.OPEN) {
          websocketUnavailable = true;
          setWsConnected(false);
          console.info('Search job WebSocket unavailable; continuing without live updates.');
          try {
            ws.close();
          } catch (_) {}
        }
      }, 15000);

      ws.onopen = () => {
        if (isComponentMounted) {
          clearTimeout(connectTimeout);
          hasConnected = true;
          websocketUnavailable = false;
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
            'EXTRACTION_COMPLETED', 'EMAIL_FOUND', 'job_stopped'
          ].includes(payload.event_type)) {
            queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['searchJob', id] });
            queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
            queryClient.invalidateQueries({ queryKey: ['dashboardCharts'] });
          }

          // 1. Format log message for timeline display
          let logMsg = null;
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
          const timeStr = eventTimestamp.toLocaleTimeString();

          if (payload.type === 'event' && payload.event_type) {
            logMsg = `[${timeStr}] ${payload.message || ''}`;
          } else if (payload.type === 'log') {
            const logEntry = payload.log;
            logMsg = typeof logEntry === 'string' ? logEntry : logEntry?.message;
          } else if (payload.event_type === 'LOG') {
            const logEntry = payload.data?.log || payload.log;
            logMsg = typeof logEntry === 'string' ? logEntry : logEntry?.message;
          }

          // Handle Phase 3 extraction events - display detailed info in logs
          if (['BUSINESS_OPENED', 'DETAILS_LOADING', 'PHONE_FOUND', 'WEBSITE_FOUND',
            'ADDRESS_FOUND', 'SOCIAL_FOUND', 'EMAIL_FOUND', 'LEAD_CREATED',
            'VALIDATION_PENDING', 'EXTRACTION_COMPLETED'].includes(payload.event_type)) {
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
            }
          }

          // 2. Handle liveLeads for the table display
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

          // 3. Construct updates from payload
          const updates: Record<string, any> = {};

          // Immediate stop handling: switch UI to STOPPED, freeze progress,
          // and stop the WebSocket so no further discovery rows arrive.
          if (payload.event_type === 'job_stopped') {
            terminalRef.current = true;
            updates.status = 'STOPPED';
            updates.progress = payload.progress ?? payload.data?.progress ?? 0;
            updates.current_step = 'Stopped by user';
            if (ws) ws.close();
          }

          // Raw root updates
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

          // recalculate_stats properties map
          if (payload.processed !== undefined) updates.businesses_processed = payload.processed;
          if (payload.saved !== undefined) {
            updates.completed_leads = payload.saved;
          }
          if (payload.failed !== undefined) updates.failed_leads = payload.failed;
          if (payload.duplicates !== undefined) updates.duplicates_removed = payload.duplicates;

          // new_lead properties map
          if (payload.type === 'new_lead' && payload.total_saved !== undefined) {
            updates.completed_leads = payload.total_saved;
            updates.total_leads = payload.total_saved;
          }

          // Structured event data extraction (e.g., telemetry)
          if (payload.type === 'event') {
            if (payload.event_type === 'SEARCH_STARTED') {
              updates.status = 'RUNNING';
            } else if (payload.event_type === 'SEARCH_COMPLETED') {
              updates.status = 'COMPLETED';
              const completedData = payload.data || {};
              if (completedData.progress !== undefined) {
                updates.progress = completedData.progress;
              } else {
                updates.progress = 100;
              }
              if (completedData.businesses_found !== undefined) {
                updates.completed_leads = completedData.businesses_found;
                updates.total_leads = completedData.businesses_found;
              }
              if (completedData.requested_target !== undefined) updates.requested_target = completedData.requested_target;
              if (completedData.actual_collected !== undefined) updates.actual_collected = completedData.actual_collected;
              if (completedData.target_reached !== undefined) updates.target_reached = completedData.target_reached;
              if (completedData.source_exhausted !== undefined) updates.source_exhausted = completedData.source_exhausted;
            } else if (payload.event_type === 'SEARCH_FAILED') {
              updates.status = 'FAILED';
            } else if (payload.event_type === 'SEARCH_PROGRESS' && payload.data) {
              const d = payload.data;
              if (d.status !== undefined) updates.status = d.status;
              if (d.current_state !== undefined) updates.status = d.current_state;
              if (d.progress !== undefined) updates.progress = d.progress;
              if (d.businesses_found !== undefined) {
                updates.total_leads = d.businesses_found;
                updates.completed_leads = d.businesses_found;
              }
              if (d.unique_urls !== undefined) updates.collected_urls = d.unique_urls;
              if (d.duplicate_count !== undefined) updates.duplicates_removed = d.duplicate_count;
              if (d.elapsed_time !== undefined) updates.duration_seconds = Math.floor(d.elapsed_time);
              if (d.worker_status !== undefined) {
                const workerId = d.worker_id || 'default_worker';
                updates.worker_states = {
                  [workerId]: d
                };
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

          // 4. Single setLiveData call to apply all updates & logs atomically
          setLiveData((prev: any) => {
            const current = prev || initialJobRef.current || {};

            // STOPPED (and every terminal state) is final: once the job is
            // stopped, ignore any delayed RUNNING / progress updates so the
            // UI never flips back. Logs are still appended for visibility.
            let incoming = updates;
            if (current.status && TERMINAL_STATUSES.includes(current.status)) {
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

            // Merge worker states dictionary correctly
            const mergedWorkerStates = {
              ...(current.worker_states || {}),
              ...(incoming.worker_states || {})
            };

            const newLogs = logMsg ? [...(current.logs || []), logMsg] : (current.logs || []);

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
        if (isComponentMounted && hasConnected && !websocketUnavailable && !terminalRef.current) {
          setWsConnected(false);
          // Exponential backoff reconnect
          const delay = Math.min(1000 * (2 ** reconnectAttempts), 10000);
          reconnectAttempts++;
          reconnectTimer = setTimeout(connectWs, delay);
        }
      };

      ws.onerror = () => {
        if (!isComponentMounted) return;
        if (!hasConnected && !websocketUnavailable) {
          websocketUnavailable = true;
          setWsConnected(false);
          console.info('Search job WebSocket unavailable; continuing without live updates.');
        }
      };
    };

    connectWs();

    return () => {
      isComponentMounted = false;
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        if (ws.readyState === 0) {
          ws.onopen = () => {
            try { ws?.close(); } catch (_) {}
          };
        } else {
          try { ws.close(); } catch (_) {}
        }
      }
    };
  }, [id, queryClient, liveData?.status, initialJob?.status]);

  const isTerminalStatus = job && ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'STOPPED'].includes(job.status);
  const displayDuration = job?.duration_seconds || 0;

  const getStatusIcon = () => {
    if (!job) return <Loader2 className="w-6 h-6 animate-spin" />;
    switch (job.status) {
      case 'COMPLETED': return <CheckCircle2 className="w-6 h-6" />;
      case 'FAILED': return <XCircle className="w-6 h-6" />;
      case 'CANCELLED':
      case 'STOPPED': return <StopCircle className="w-6 h-6" />;
      case 'TIMEOUT': return <AlertTriangle className="w-6 h-6" />;
      default: return <Loader2 className="w-6 h-6 animate-spin" />;
    }
  };

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500 gap-4">
        <XCircle className="w-12 h-12 text-red-400" />
        <p className="text-lg font-semibold">Job not found</p>
        <Link href="/dashboard/search" className="text-blue-500 hover:underline">
          Back to Search
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full px-4 lg:px-8 space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/search" className="p-2.5 bg-white/50 hover:bg-white backdrop-blur-md border border-slate-200/60 rounded-xl text-slate-500 hover:text-slate-900 transition-all shadow-sm hover:shadow">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <PageHeader
            title={
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 font-black tracking-tight">
                Search Execution Engine
              </span>
            }
            description={
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-xs border border-slate-200 shadow-sm">ID: {job._id}</span>
                <span className="text-slate-500 text-sm font-medium">{job.keyword} <span className="text-slate-300 mx-1">•</span> {job.location || job.city || ''}</span>
              </div>
            }
          />
        </div>

        {job && (job._id || job.job_id || id) && !isTerminalStatus && (
          <button
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
            className="group px-5 py-2.5 text-sm font-semibold rounded-xl text-red-600 bg-red-50/80 hover:bg-red-100 backdrop-blur-md border border-red-200 transition-all flex items-center gap-2 disabled:opacity-50 hover:shadow-sm hover:shadow-red-500/10"
          >
            {stopMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />}
            Stop Job
          </button>
        )}
      </div>

      {job.status === 'COMPLETED' && showCompletedModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xl transition-all">
          <div className="bg-white rounded-[2rem] p-10 max-w-2xl w-full shadow-2xl animate-in fade-in zoom-in-95 duration-500 border border-white/20 relative overflow-hidden">
            {/* Close button */}
            <button
              onClick={() => setShowCompletedModal(false)}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-all"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            {/* Decorative background glows */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-400/20 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-400/20 rounded-full blur-3xl"></div>

            <div className="relative flex flex-col items-center text-center mb-10">
              <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/30 rotate-3 hover:rotate-0 transition-transform duration-500">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Search Completed!</h2>
              <p className="text-slate-500 text-lg">
                {job.source_exhausted
                  ? `Google Maps ran out of unique results — collected ${job.actual_collected ?? job.completed_leads ?? 0} of ${job.requested_target ?? job.limit ?? 0} requested leads.`
                  : 'Your leads have been successfully extracted and saved.'}
              </p>
              {job.source_exhausted && (
                <div className="mt-4 flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold">
                  <AlertTriangle className="w-4 h-4" />
                  Target not fully reached — source exhausted
                </div>
              )}
              <div className="mt-4 px-4 py-1.5 bg-slate-100 rounded-full text-sm font-medium text-slate-600 animate-pulse">
                Redirecting to Leads in 10s...
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 relative">
              {[
                { label: 'Requested', value: job.requested_target ?? job.limit ?? 0, color: 'text-blue-600' },
                { label: 'Collected', value: job.actual_collected ?? job.completed_leads ?? 0, color: 'text-emerald-600' },
                { label: 'Duplicates', value: job.duplicates_removed || 0, color: 'text-amber-500' },
                { label: 'Duration', value: formatTime(job.duration_seconds), color: 'text-blue-600' }
              ].map((stat, idx) => (
                <div key={idx} className="bg-slate-50/80 rounded-2xl p-5 border border-slate-100 text-center hover:bg-slate-50 transition-colors">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">{stat.label}</p>
                  <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-4 relative">
              <Link href="/dashboard/leads" className="flex-1 px-6 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-semibold text-center transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20 hover:shadow-xl hover:-translate-y-0.5">
                <LayoutDashboard className="w-5 h-5" /> View Results
              </Link>
              <Link href="/dashboard/search" className="flex-1 px-6 py-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-2xl font-semibold text-center transition-all shadow-sm hover:shadow hover:-translate-y-0.5">
                New Search
              </Link>
            </div>

            <div className="mt-8 flex justify-center gap-6 relative">
              <button onClick={() => handleExport('csv')} className="group text-sm font-medium text-slate-500 hover:text-blue-600 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-blue-50 transition-colors">
                  <DownloadCloud className="w-4 h-4" />
                </div>
                Export CSV
              </button>
              <button onClick={() => handleExport('excel')} className="group text-sm font-medium text-slate-500 hover:text-emerald-600 flex items-center gap-2 transition-colors border-none bg-transparent cursor-pointer">
                <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-emerald-50 transition-colors">
                  <FileText className="w-4 h-4" />
                </div>
                Export Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {job.source_exhausted && job.status === 'COMPLETED' && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 shadow-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Source exhausted — target not fully reached</p>
            <p className="text-xs mt-0.5">
              Google Maps ran out of unique usable results for this query. Collected{' '}
              {job.actual_collected ?? job.completed_leads ?? 0} of {job.requested_target ?? job.limit ?? 0} requested leads.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">
          {/* Main Progress Card */}
          <div className="bg-white border border-slate-200 shadow-sm hover:shadow transition-shadow rounded-2xl p-8 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-100">
              <div
                className={`h-full transition-all duration-700 ease-out relative ${job.status === 'FAILED' ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500'}`}
                style={{ width: `${job.progress || 0}%` }}
              >
                {!isTerminalStatus && (
                  <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute inset-0 bg-white/30 translate-x-[-100%] animate-[shimmer_2s_infinite]"></div>
                  </div>
                )}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 mb-10">
              <div className="flex items-center gap-5">
                <div className={`p-4 rounded-2xl flex items-center justify-center shadow-inner ${job.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-500' :
                  job.status === 'FAILED' ? 'bg-red-50 text-red-500' :
                    job.status === 'STOPPED' ? 'bg-red-50 text-red-500' :
                      job.status === 'CANCELLED' ? 'bg-slate-100 text-slate-500' :
                        'bg-blue-50 text-blue-600'
                  }`}>
                  {getStatusIcon()}
                </div>
                <div>
                  <h3 className={`text-2xl font-black tracking-tight ${job.status === 'COMPLETED' ? 'text-emerald-600' :
                    job.status === 'FAILED' ? 'text-red-600' :
                      job.status === 'STOPPED' ? 'text-red-600' :
                        job.status === 'CANCELLED' ? 'text-slate-600' :
                          'text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600'
                    }`}>
                    {job.status}
                  </h3>
                  <p className="text-sm font-medium text-slate-500 mt-1 flex items-center gap-2">
                    {!isTerminalStatus && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>}
                    {job.current_step || job.current_action || 'Initializing Engine...'}
                  </p>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <div className="text-5xl font-black tracking-tighter text-slate-900 drop-shadow-sm">
                  {job.progress || 0}<span className="text-3xl text-slate-400 ml-1">%</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              {[
                { icon: Globe, label: 'Found', value: job.total_found || 0, color: 'blue', secondary: null },
                { icon: ShieldCheck, label: 'Accepted', value: job.accepted_leads || 0, color: 'indigo', secondary: null },
                { icon: ShieldAlert, label: 'Rejected', value: job.rejected_leads || 0, color: 'red', secondary: null },
                { icon: AlertCircle, label: 'Duplicates', value: job.duplicates_removed || 0, color: 'amber', secondary: null },
                { icon: Target, label: 'Target', value: job.requested_target ?? job.limit ?? 0, color: 'blue', secondary: null },
                { icon: Save, label: 'Saved', value: job.completed_leads || 0, color: 'emerald', secondary: `/ ${job.requested_target ?? job.limit ?? 0}` },
                { icon: Clock, label: 'Remaining', value: Math.max(0, (job.requested_target ?? job.limit ?? 0) - (job.completed_leads || 0)), color: 'purple', secondary: null },
              ].map((stat, idx) => {
                const Icon = stat.icon;
                return (
                  <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow transition-all duration-300 group/stat relative overflow-hidden">
                    <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full opacity-0 group-hover/stat:opacity-5 transition-opacity bg-${stat.color}-500 blur-2xl`}></div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-3">
                      <div className={`p-1.5 rounded-lg bg-${stat.color}-50 text-${stat.color}-500`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      {stat.label}
                    </div>
                    <p className="text-3xl font-black text-slate-800 tracking-tight flex items-baseline gap-1">
                      {stat.value}
                      {stat.secondary && <span className="text-sm font-medium text-slate-400">{stat.secondary}</span>}
                    </p>
                  </div>
                );
              })}
            </div>

            {job.worker_states && Object.keys(job.worker_states).length > 0 && (
              <div className="mt-8 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-slate-600 flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    Active Workers <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs">{Object.keys(job.worker_states).length}</span>
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(job.worker_states).map(([workerId, state]) => (
                    <div key={workerId} className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/60 flex flex-col justify-center hover:bg-white transition-colors hover:shadow-sm">
                      <span className="text-xs font-bold text-blue-600 mb-1.5 flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                        {workerId}
                      </span>
                      <span className="text-[11px] text-slate-600 font-mono truncate px-2 py-1 bg-white rounded border border-slate-100" title={typeof state === 'object' ? JSON.stringify(state) : String(state)}>
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[500px]">
            {/* Live Logs Panel */}
            <div className="bg-white rounded-2xl overflow-hidden flex flex-col shadow-sm hover:shadow transition-shadow border border-slate-200 relative group">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/50 pointer-events-none z-10 h-24 bottom-0"></div>
              <div className="px-6 py-5 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center z-20 sticky top-0">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]"></div>
                  <h3 className="text-sm font-bold tracking-widest text-slate-800 uppercase">Terminal Logs</h3>
                </div>
                {wsConnected ? (
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">WS LIVE</span>
                ) : !isTerminalStatus && (
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100">POLLING</span>
                )}
              </div>
              <div className="flex-1 p-6 overflow-y-auto font-mono text-[11px] text-slate-700 space-y-2.5 custom-scrollbar bg-slate-50/30">
                {job.logs?.length > 0 ? (
                  job.logs.map((log: any, i: number) => {
                    let msg = "";
                    let ts = "";
                    if (typeof log === 'string') {
                      msg = log;
                    } else if (log) {
                      msg = log.message || JSON.stringify(log);
                      let logDate: Date | null = null;
                      if (log.timestamp) {
                        const parsed = new Date(
                          typeof log.timestamp === 'number' || !isNaN(Number(log.timestamp))
                            ? Number(log.timestamp) * 1000
                            : log.timestamp
                        );
                        if (!isNaN(parsed.getTime())) {
                          logDate = parsed;
                        }
                      }
                      ts = logDate ? logDate.toISOString().split('T')[1].split('.')[0] : "";
                    }

                    const isLifecycle = msg.includes("LIFECYCLE_LOG");
                    const isError = msg.toLowerCase().includes("error") || msg.toLowerCase().includes("failed");
                    const isRejected = msg.includes("Rejected");
                    const isSuccess = msg.includes("✅");

                    return (
                      <div key={i} className={`flex gap-3 transition-opacity ${isLifecycle ? 'text-blue-600 font-semibold bg-blue-50 px-2 py-1 rounded' :
                        isError ? 'text-red-600 bg-red-50 px-2 py-1 rounded' :
                          isRejected ? 'text-amber-600 bg-amber-50 px-2 py-1 rounded' :
                            isSuccess ? 'text-emerald-600 font-semibold' : 'opacity-80 hover:opacity-100'
                        }`}>
                        {ts && <span className="text-slate-400 shrink-0 select-none">[{ts}]</span>}
                        <span className="break-all leading-relaxed">{msg}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-slate-600 h-full flex items-center justify-center flex-col gap-3">
                    <Loader2 className="w-5 h-5 animate-spin opacity-50" />
                    Waiting for output stream...
                  </div>
                )}
                <div ref={logsEndRef} className="h-4" />
              </div>
            </div>

            {/* Live Businesses Panel */}
            <div className="bg-white rounded-2xl overflow-hidden flex flex-col shadow-sm hover:shadow transition-shadow border border-slate-200">
              <div className="px-6 py-5 border-b border-slate-200/60 bg-white/50 backdrop-blur-md flex justify-between items-center z-10 sticky top-0">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                    <Globe className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold tracking-widest text-slate-800 uppercase">Live Discoveries</h3>
                </div>
                <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100 shadow-sm flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                  {liveLeads.length} NEW
                </span>
              </div>
              <div className="flex-1 p-0 overflow-y-auto custom-scrollbar bg-slate-50/30">
                {liveLeads.length > 0 ? (
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] text-slate-400 font-bold uppercase tracking-wider sticky top-0 bg-white/90 backdrop-blur-md z-10 border-b border-slate-200/60 shadow-sm">
                      <tr>
                        <th className="px-6 py-4">Business Info</th>
                        <th className="px-6 py-4">Contact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {liveLeads.map((lead, i) => (
                        <tr key={lead._id || i} className="hover:bg-white/80 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{lead.name || lead.business_name}</div>
                            <div className="text-[11px] font-medium text-slate-500 mt-1 flex items-center gap-1.5">
                              {lead.city || lead.location}
                              {lead.category && <><span className="text-slate-300">•</span> <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">{lead.category}</span></>}
                            </div>
                            {lead.google_rating && (
                              <div className="text-[11px] font-bold text-amber-500 flex items-center gap-1 mt-1.5">
                                ★ {lead.google_rating}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1.5">
                              {lead.phone ? (
                                <div className="text-[12px] font-medium text-slate-700 flex items-center gap-1.5"><div className="w-4 text-center">📞</div>{lead.phone}</div>
                              ) : (
                                <div className="text-[12px] text-slate-400 flex items-center gap-1.5"><div className="w-4 text-center opacity-50">📞</div>--</div>
                              )}
                              {lead.website ? (
                                <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-blue-500 hover:text-blue-700 hover:underline flex items-center gap-1.5 truncate max-w-[140px]">
                                  <div className="w-4 text-center">🌐</div>Website
                                </a>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 p-8 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center mb-2">
                      <Globe className="w-8 h-8 text-slate-300" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-700">Awaiting Discoveries</p>
                      <p className="text-xs text-slate-400 max-w-[200px]">The engine is searching the web. New businesses will appear here instantly.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {/* Search Configuration Card */}
          <div className="bg-white border border-slate-200 shadow-sm hover:shadow transition-shadow rounded-2xl p-6 lg:p-8 relative overflow-hidden group">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold tracking-widest text-slate-800 uppercase">What I'm searching for</h3>
            </div>

            <div className="space-y-5">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Provider</span>
                <span className="text-sm font-semibold text-slate-900">{job.provider || 'Google Maps'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Keyword / Industry</span>
                <span className="text-sm font-semibold text-slate-900">{job.keyword || '--'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Target Location</span>
                <span className="text-sm font-semibold text-slate-900">{job.location || job.city || '--'}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Extraction Limit</span>
                <span className="text-sm font-semibold text-slate-900">
                  {job.exhaustive ? 'Exhaustive scrape (Full area)' : `${job.limit || job.max_leads || 100} Leads`}
                </span>
              </div>
            </div>
          </div>

          {/* Pipeline Consistency Report Sidebar */}
          {consistencyReport && (
            <div className="bg-white border border-slate-200 shadow-sm hover:shadow transition-shadow rounded-2xl p-6 lg:p-8 relative overflow-hidden group">
              <div className={`absolute top-0 left-0 w-full h-1.5 ${consistencyReport.is_consistent ? 'bg-emerald-500' : 'bg-red-500'}`}></div>

              <div className="flex items-center gap-3 mb-6">
                <div className={`p-2 rounded-xl ${consistencyReport.is_consistent ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                  {consistencyReport.is_consistent ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                </div>
                <h3 className="text-sm font-bold tracking-widest text-slate-800 uppercase">Data Integrity</h3>
              </div>

              <div className={`p-4 rounded-2xl border mb-6 relative overflow-hidden ${consistencyReport.is_consistent
                ? 'bg-emerald-50/50 border-emerald-200 shadow-inner'
                : 'bg-red-50/50 border-red-200 shadow-inner'
                }`}>
                <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full opacity-20 blur-xl ${consistencyReport.is_consistent ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                <p className={`text-sm font-bold relative z-10 ${consistencyReport.is_consistent ? 'text-emerald-700' : 'text-red-700'
                  }`}>
                  {consistencyReport.verdict}
                </p>
              </div>

              <div className="space-y-4">
                {[
                  { label: 'Discovered', value: consistencyReport.summary?.businesses_discovered, color: 'bg-blue-500' },
                  { label: 'Processed', value: consistencyReport.summary?.businesses_processed, color: 'bg-purple-500' },
                  { label: 'MongoDB Docs', value: consistencyReport.summary?.mongo_lead_documents, icon: consistencyReport.summary?.mongo_lead_documents === consistencyReport.summary?.job_total_leads ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />, highlight: 'text-emerald-600' },
                  { label: 'Job Stats (Saved)', value: consistencyReport.summary?.job_total_leads, icon: consistencyReport.summary?.job_total_leads === consistencyReport.summary?.mongo_lead_documents ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />, highlight: 'text-blue-600' },
                  { label: 'Failed Leads', value: consistencyReport.summary?.failed_leads, color: 'bg-red-500', highlight: 'text-red-500' },
                  { label: 'Duplicates', value: consistencyReport.summary?.duplicates, color: 'bg-amber-500', highlight: 'text-amber-500' }
                ].map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center group">
                    <div className="flex items-center gap-2.5">
                      {item.icon ? item.icon : <span className={`w-2 h-2 rounded-full ${item.color}`}></span>}
                      <p className="text-sm font-medium text-slate-500">{item.label}</p>
                    </div>
                    <p className={`text-sm font-bold ${item.highlight || 'text-slate-800'}`}>{item.value ?? '--'}</p>
                  </div>
                ))}

                {(consistencyReport.summary?.orphan_queued ?? 0) > 0 && (
                  <div className="flex justify-between items-center mt-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <p className="text-sm font-medium text-amber-700">Orphan Queued</p>
                    </div>
                    <p className="text-sm font-bold text-amber-600">{consistencyReport.summary?.orphan_queued}</p>
                  </div>
                )}
              </div>

              {consistencyReport.mismatches?.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-100 space-y-4">
                  <p className="text-[10px] font-bold tracking-widest text-red-500 uppercase flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> Mismatches Found</p>
                  {consistencyReport.mismatches.map((m: any, i: number) => (
                    <div key={i} className="p-4 bg-white border border-red-100 shadow-sm shadow-red-100/50 rounded-xl">
                      <p className="text-xs font-bold text-slate-800 mb-1">{m.broken_stage}</p>
                      <p className="text-xs font-medium text-slate-500 mb-2">{m.description}</p>
                      <div className="flex flex-wrap gap-2 text-[10px] font-mono">
                        <span className="px-2 py-1 bg-slate-50 rounded text-slate-600 border border-slate-100">Exp: {m.expected}</span>
                        <span className="px-2 py-1 bg-red-50 rounded text-red-600 border border-red-100">Act: {m.actual}</span>
                        <span className={`px-2 py-1 rounded border ${m.delta > 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                          Δ: {m.delta > 0 ? `+${m.delta}` : m.delta}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[10px] font-medium text-slate-400 mt-6 text-center bg-slate-50 py-1.5 rounded-lg border border-slate-100">
                Validated in <span className="font-mono">{consistencyReport.validation_duration_seconds}s</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
