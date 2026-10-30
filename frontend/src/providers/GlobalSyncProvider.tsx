'use client';

import React, { useEffect, createContext, useContext } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const GlobalSyncContext = createContext(null);

export function GlobalSyncProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const wsUrl = (process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.replace(/^http/, 'ws').replace(/\/api\/v1$/, '') + '/api/v1/ws/events'
      : window.location.origin.replace(/^http/, 'ws').replace(/:\d+$/, ':8000') + '/api/v1/ws/events').replace('localhost', '127.0.0.1');

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let isMounted = true;
    let reconnectAttempts = 0;
    let hasConnected = false;
    let socketUnavailable = false;

    const connect = () => {
      if (!isMounted || socketUnavailable) return;
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const finalWsUrl = token ? `${wsUrl}?token=${token}` : wsUrl;
      console.info(`Connecting to Global Sync WebSocket: ${finalWsUrl}`);
      socket = new WebSocket(finalWsUrl);

      const connectTimeout = window.setTimeout(() => {
        if (socket && socket.readyState !== WebSocket.OPEN) {
          socket.close();
          socketUnavailable = true;
          console.info('Global Sync WebSocket unavailable; continuing without live updates.');
        }
      }, 15000);

      socket.onopen = () => {
        if (isMounted) {
          clearTimeout(connectTimeout);
          hasConnected = true;
          socketUnavailable = false;
          reconnectAttempts = 0;
          console.info('Global Sync WebSocket connected successfully');
        }
      };

      socket.onmessage = (event) => {
        if (!isMounted) return;
        const trimmedData = typeof event.data === 'string' ? event.data.trim() : '';
        if (!trimmedData || trimmedData.toLowerCase() === 'pong' || trimmedData.toLowerCase() === 'ping') {
          if (trimmedData.toLowerCase() === 'ping') {
            socket?.send('pong');
          }
          return;
        }
        try {
          const payload = JSON.parse(trimmedData);

          if (payload.type === 'heartbeat' || payload.event_type === 'HEARTBEAT') {
            socket?.send('ping');
            return;
          }

          const eventType = payload.event_type || payload.type;

          // Phase 5: Real-time Synchronization Engine
          // Invalidate React Query cache to load fresh data globally
          const standardEvents = [
            'new_lead', 'LEAD_SAVED', 'LEAD_INSERTED', 'LEAD_UPDATED',
            'SEARCH_COMPLETED', 'SEARCH_STARTED', 'SEARCH_PROGRESS',
            'STATISTICS_UPDATED', 'SEARCH_HISTORY_UPDATED',
            'PHONE_FOUND', 'EMAIL_FOUND', 'EXTRACTION_COMPLETED', 'LEAD_CREATED'
          ];

          const analysisEvents = [
            'analysis_started', 'analysis_progress', 'analysis_partial_saved',
            'analysis_completed', 'analysis_failed', 'score_updated',
            'technology_updated', 'contacts_updated', 'recommendations_updated',
            'history_updated', 'STAGE_PROGRESS', 'LEAD_STARTED', 'LEAD_PROGRESS',
            'SEO_COMPLETED', 'PERFORMANCE_COMPLETED', 'UI_COMPLETED', 'UX_COMPLETED',
            'analysis_success'
          ];

          if (standardEvents.includes(eventType) || analysisEvents.includes(eventType)) {
            const leadId = payload.lead_id || payload.data?.id || payload.lead?.id || payload.data?._id || payload.lead?._id;

            // Precision Invalidation for the specific Lead (if ID exists)
            if (leadId) {
              queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
              queryClient.invalidateQueries({ queryKey: ['leadAi', leadId] });
              queryClient.invalidateQueries({ queryKey: ['leadAnalysisSummary', leadId] });
              queryClient.invalidateQueries({ queryKey: ['leadAnalysisHistory', leadId] });
              queryClient.invalidateQueries({ queryKey: ['leadAnalysisComparison', leadId] });
            }

            // Global Invalidation for Dashboards and Lists
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
            queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
            queryClient.invalidateQueries({ queryKey: ['dashboardCharts'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-charts'] });
            queryClient.invalidateQueries({ queryKey: ['whatsapp-leads'] });
            queryClient.invalidateQueries({ queryKey: ['email-sync-leads'] });

            // Note: We don't toast for every SEARCH_PROGRESS as it's too noisy.
            if (eventType === 'new_lead' || eventType === 'LEAD_SAVED') {
              const leadName = payload.data?.name || payload.data?.business_name || payload.lead?.name || 'Business';
              const category = payload.data?.category || payload.lead?.category || 'Category unknown';

              toast.success(`Real-time Sync: New lead discovered: ${leadName}`, {
                description: category,
                duration: 4000
              });
            }

            if (eventType === 'SEARCH_COMPLETED') {
              toast.success('Search Completed', {
                description: 'A search job has finished running. Dashboard updated.',
                duration: 5000
              });
            }

            if (eventType === 'analysis_completed') {
              toast.success('AI Analysis Completed', {
                description: 'The AI Website Analysis has finished. Lead data updated.',
                duration: 5000,
                action: leadId ? {
                  label: "Open Lead Details",
                  onClick: () => window.location.href = `/dashboard/leads/detail?id=${leadId}`
                } : undefined
              });
            }
          }
        } catch (err) {
          console.error("Error parsing Global Sync WS message:", err);
        }
      };

      socket.onclose = () => {
        clearTimeout(connectTimeout);
        if (isMounted && hasConnected && !socketUnavailable) {
          const delay = Math.min(1000 * (2 ** reconnectAttempts), 10000);
          console.info(`Global Sync WebSocket disconnected. Reconnecting in ${delay}ms...`);
          reconnectAttempts++;
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      socket.onerror = () => {
        if (!hasConnected && !socketUnavailable) {
          socketUnavailable = true;
          console.info('Global Sync WebSocket unavailable; continuing without live updates.');
        }
      };
    };

    connect();

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimer);
      if (socket) {
        if (socket.readyState === 0) {
          socket.onopen = () => socket?.close();
        } else {
          socket.close();
        }
      }
    };
  }, [queryClient]);

  return (
    <GlobalSyncContext.Provider value={null}>
      {children}
    </GlobalSyncContext.Provider>
  );
}

export const useGlobalSync = () => useContext(GlobalSyncContext);
