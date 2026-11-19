'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { SessionStatus } from './types';
import {
  ExternalLink,
  RefreshCw,
  Globe,
  Loader2,
  Power
} from 'lucide-react';
import { toast } from 'sonner';

export default function SessionStatusBanner() {
  const queryClient = useQueryClient();
  const [isStarting, setIsStarting] = useState(false);

  // Poll session status every 30s or on demand
  const { data: session, isLoading, refetch, isRefetching } = useQuery<SessionStatus>({
    queryKey: ['gemini-session-status'],
    queryFn: async () => {
      const res = await api.get('/ai-content/session/status');
      return res.data;
    },
    refetchInterval: 25000,
    staleTime: 10000,
  });

  const startSessionMutation = useMutation({
    mutationFn: async (headless: boolean) => {
      setIsStarting(true);
      const res = await api.post('/ai-content/session/start', { headless });
      return res.data;
    },
    onSuccess: (data: SessionStatus) => {
      setIsStarting(false);
      queryClient.setQueryData(['gemini-session-status'], data);
      if (data.is_logged_in) {
        toast.success('Gemini session is active and authenticated.');
      } else {
        toast.info(data.message || 'Browser opened. Please sign in to your Google account.');
      }
    },
    onError: (err: unknown) => {
      setIsStarting(false);
      const errorObj = err as { response?: { data?: { detail?: string } } };
      toast.error(errorObj?.response?.data?.detail || 'Failed to start browser session.');
    }
  });

  const closeSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/ai-content/session/close');
      return res.data;
    },
    onSuccess: () => {
      refetch();
      toast.success('Browser session closed.');
    }
  });

  const isReady = session?.is_logged_in;
  const isRunning = session?.browser_running;

  return (
    <div className="w-full bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
          <Globe className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-slate-900">
              Gemini Web Playwright Engine
            </span>
            {isLoading ? (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium border border-slate-200">
                <Loader2 className="w-3 h-3 animate-spin" /> Checking...
              </span>
            ) : isReady ? (
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Google Authenticated
              </span>
            ) : isRunning ? (
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Browser Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Standby (Auto-launch on demand)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {session?.message || 'Persistent Chromium session automates Gemini Web without API keys.'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end md:self-center">
        {/* Refresh status */}
        <button
          onClick={() => refetch()}
          disabled={isRefetching || isLoading}
          title="Refresh session status"
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
        </button>

        {/* Launch visible browser for manual Google sign-in */}
        <button
          onClick={() => startSessionMutation.mutate(false)}
          disabled={isStarting || startSessionMutation.isPending}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-xs disabled:opacity-50"
        >
          {isStarting || startSessionMutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Opening Browser...
            </>
          ) : (
            <>
              <ExternalLink className="w-3.5 h-3.5" />
              {isReady ? 'Re-open Gemini Window' : 'Sign in to Google Account'}
            </>
          )}
        </button>

        {/* If browser running, option to close */}
        {isRunning && (
          <button
            onClick={() => closeSessionMutation.mutate()}
            disabled={closeSessionMutation.isPending}
            title="Stop browser session"
            className="p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl border border-rose-200 transition-colors"
          >
            <Power className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
