'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import api from '@/src/lib/axios';
import { toast } from 'sonner';
import { PageHeader } from '@/src/components/common/PageHeader';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import { AlertTriangle, CheckCircle, Search, XCircle, ArrowLeft } from 'lucide-react';

interface TimelineEvent {
  timestamp: string;
  message: string;
}

export default function SearchProgressPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const jobId = searchParams.get('jobId') as string;

  const { data: job, isLoading } = useQuery({
    queryKey: ['searchJob', jobId],
    queryFn: async () => {
      const res = await api.get(`/search/${jobId}/status`);
      return res.data;
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && ['COMPLETED', 'FAILED', 'CANCELLED', 'STOPPED', 'TIMEOUT'].includes(data.status)) {
        return false;
      }
      return 2000;
    },
  });

  const [liveJob, setLiveJob] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    if (!jobId) return;

    const getWsUrl = () => {
      const base = process.env.NEXT_PUBLIC_WS_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
      const normalized = base.startsWith('ws') ? base : base.replace(/^http/, 'ws');
      const root = normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`;
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const url = `${root}/ws/search/${jobId}`;
      return token ? `${url}?token=${token}` : url;
    };

    const socket = new WebSocket(getWsUrl());

    socket.onopen = () => setWsConnected(true);
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (!payload || payload.type === 'heartbeat') return;

        const message = payload.type === 'log'
          ? payload.log?.message
          : payload.message || payload.current_step || payload.current_action || payload.status;

        if (message) {
          setTimeline((prev) => [
            ...prev.slice(-49),
            {
              timestamp: new Date().toLocaleTimeString(),
              message,
            },
          ]);
        }

        const updates: Record<string, any> = {};
        if (payload.event_type === 'job_stopped') {
          updates.status = 'STOPPED';
          updates.progress = payload.progress ?? payload.data?.progress ?? 0;
          socket.close();
        }
        if (payload.type === 'progress_update') {
          if (payload.status !== undefined) updates.status = payload.status;
          if (payload.current_step !== undefined) updates.current_step = payload.current_step;
          if (payload.duration_seconds !== undefined) updates.duration_seconds = payload.duration_seconds;
        }

        if (payload.status !== undefined) updates.status = payload.status;
        if (payload.progress !== undefined) updates.progress = payload.progress;
        if (payload.current_step !== undefined) updates.current_step = payload.current_step;
        if (payload.current_business !== undefined) updates.current_business = payload.current_business;
        if (payload.current_action !== undefined) updates.current_action = payload.current_action;
        if (payload.collected_urls !== undefined) updates.collected_urls = payload.collected_urls;
        if (payload.queue_remaining !== undefined) updates.queue_remaining = payload.queue_remaining;
        if (payload.duration_seconds !== undefined) updates.duration_seconds = payload.duration_seconds;
        if (payload.total_leads !== undefined) updates.total_leads = payload.total_leads;
        if (payload.type === 'new_lead' && payload.total_saved !== undefined) {
          updates.total_leads = payload.total_saved;
        }
        if (payload.type === 'event' && payload.data) {
          if (payload.data.status !== undefined) updates.status = payload.data.status;
          if (payload.data.current_step !== undefined) updates.current_step = payload.data.current_step;
          if (payload.data.count !== undefined) updates.total_leads = payload.data.count;
        }

        if (Object.keys(updates).length > 0) {
          setLiveJob((prev: any) => ({ ...(prev || {}), ...updates }));
        }
      } catch {
        // ignore malformed websocket payloads
      }
    };

    socket.onerror = () => setWsConnected(false);
    socket.onclose = () => setWsConnected(false);

    return () => socket.close();
  }, [jobId]);

  useEffect(() => {
    if (job) {
      setLiveJob((prev: any) => ({ ...(prev || {}), ...job }));
    }
  }, [job]);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/search/${jobId}/stop`);
    },
    onSuccess: () => {
      toast.success('Search stopped successfully.');
      setLiveJob((prev: any) => ({ ...(prev || {}), status: 'STOPPED' }));
      queryClient.invalidateQueries({ queryKey: ['searchJob', jobId] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to stop the search. Please try again.');
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Search Progress" description="Monitoring job execution..." />
        <div className="p-12 text-center text-[#6B7280]">Loading job data...</div>
      </div>
    );
  }

  const currentJob = liveJob || job;

  if (!currentJob) {
    return (
      <div className="space-y-6">
        <PageHeader title="Search Progress" description="Job not found." />
        <button onClick={() => router.push('/dashboard/search')} className="text-blue-500">Go Back</button>
      </div>
    );
  }

  const isFinished = ['COMPLETED', 'FAILED', 'CANCELLED', 'STOPPED', 'TIMEOUT'].includes(currentJob.status);
  const progress = Math.max(0, Math.min(Number(currentJob.progress || 0), 100));
  const discoveredCount = currentJob.total_leads ?? currentJob.total_saved ?? currentJob.collected_urls ?? 0;

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center gap-4 mb-4">
        <button 
          onClick={() => router.push('/dashboard/search')}
          className="p-2 text-[#6B7280] hover:text-[#111827] bg-white rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <PageHeader 
          title="Search Progress" 
          description={`Monitoring Search: ${currentJob.keyword || 'Live discovery run'}`} 
          action={<StatusBadge status={currentJob.status} className="text-sm px-4 py-1" />}
        />
      </div>

      <div className="bg-[#FAFAF8]/50 backdrop-blur-sm border border-[#E7E5E4] rounded-2xl p-8 space-y-8">
        <div>
          <div className="flex justify-between text-sm mb-3">
            <span className="text-[#111827] font-medium">Job Completion</span>
            <span className="text-[#111827] font-bold text-lg">{progress}%</span>
          </div>
          <div className="w-full bg-white rounded-full h-4 overflow-hidden border border-[#E7E5E4] shadow-inner">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${currentJob.status === 'FAILED' || currentJob.status === 'STOPPED' ? 'bg-red-500' : 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.5)]'}`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="p-6 rounded-xl bg-white border border-[#E7E5E4] shadow-lg">
            <p className="text-xs text-[#6B7280] uppercase font-semibold tracking-wider">Leads Found</p>
            <p className="text-4xl font-black text-[#111827] mt-2">{discoveredCount}</p>
          </div>
          <div className="p-6 rounded-xl bg-white border border-[#E7E5E4] shadow-lg">
            <p className="text-xs text-[#6B7280] uppercase font-semibold tracking-wider">Duration</p>
            <p className="text-4xl font-black text-[#111827] mt-2">{currentJob.duration_seconds ?? 0}s</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-5 rounded-xl bg-white border border-[#E7E5E4] shadow-sm">
            <p className="text-xs text-[#6B7280] uppercase font-semibold tracking-wider">Current Step</p>
            <p className="text-lg font-semibold text-[#111827] mt-2">{currentJob.current_step || currentJob.current_action || 'Waiting for updates'}</p>
            <p className="text-sm text-[#6B7280] mt-2">{currentJob.current_business ? `Business: ${currentJob.current_business}` : 'Discovery engine is warming up.'}</p>
          </div>
          <div className="p-5 rounded-xl bg-white border border-[#E7E5E4] shadow-sm">
            <p className="text-xs text-[#6B7280] uppercase font-semibold tracking-wider">Live Discovery</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-[#111827]">
              <div>
                <p className="text-[#6B7280]">Leads discovered</p>
                <p className="font-semibold">{discoveredCount}</p>
              </div>
              <div>
                <p className="text-[#6B7280]">Duplicates</p>
                <p className="font-semibold">{currentJob.duplicates_removed ?? 0}</p>
              </div>
              <div>
                <p className="text-[#6B7280]">Queue remaining</p>
                <p className="font-semibold">{currentJob.queue_remaining ?? '—'}</p>
              </div>
              <div>
                <p className="text-[#6B7280]">Connection</p>
                <p className="font-semibold">{wsConnected ? 'Live' : 'Reconnecting'}</p>
              </div>
            </div>
          </div>
        </div>

        {timeline.length > 0 && (
          <div className="p-5 rounded-xl bg-white border border-[#E7E5E4] shadow-sm">
            <p className="text-xs text-[#6B7280] uppercase font-semibold tracking-wider">Latest Activity</p>
            <div className="mt-3 space-y-2 text-sm text-[#111827]">
              {timeline.slice(-5).reverse().map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} className="flex items-start gap-2 rounded-lg bg-[#FAFAF8] px-3 py-2">
                  <span className="text-[#6B7280] whitespace-nowrap">{entry.timestamp}</span>
                  <span className="break-words">{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentJob.error_message && (
          <div className="p-5 rounded-xl bg-red-950/30 border border-red-900/50 flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{currentJob.error_message}</p>
          </div>
        )}

        <div className="pt-4 border-t border-[#E7E5E4] flex gap-4">
          {!isFinished && (
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="flex-1 py-3.5 px-4 flex justify-center items-center gap-2 text-sm font-bold rounded-xl text-red-400 bg-red-500/10 hover:bg-red-500/20 focus:ring-2 focus:ring-red-600 transition-all"
            >
              <XCircle className="w-5 h-5" />
              Cancel Search
            </button>
          )}

          {currentJob.status === 'COMPLETED' && (
            <button
              onClick={() => router.push('/dashboard/leads')}
              className="flex-1 py-3.5 px-4 flex justify-center items-center gap-2 text-sm font-bold rounded-xl text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 focus:ring-2 focus:ring-emerald-600 transition-all"
            >
              <CheckCircle className="w-5 h-5" />
              View Extracted Leads
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


