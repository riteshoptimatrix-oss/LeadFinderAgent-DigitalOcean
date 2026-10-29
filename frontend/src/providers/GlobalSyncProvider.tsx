'use client';

import React, { useEffect, useRef, createContext, useContext } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const GlobalSyncContext = createContext(null);

export function GlobalSyncProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const getBaseWsUrl = () => {
      // 1. Explicit WS URL env
      if (process.env.NEXT_PUBLIC_WS_URL) {
        return (
          process.env.NEXT_PUBLIC_WS_URL.replace(/\/+$/, '').replace(/\/api\/v1$/, '') +
          '/api/v1/ws/events'
        );
      }
      // 2. Derive from NEXT_PUBLIC_API_URL
      if (process.env.NEXT_PUBLIC_API_URL) {
        return (
          process.env.NEXT_PUBLIC_API_URL.replace(/^http/, 'ws')
            .replace(/\/+$/, '')
            .replace(/\/api\/v1$/, '') + '/api/v1/ws/events'
        );
      }
      // 3. Fallback to current browser window location
      if (typeof window !== 'undefined') {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${window.location.host}/api/v1/ws/events`;
      }
      return 'ws://127.0.0.1:8000/api/v1/ws/events';
    };

    const getToken = () => {
      if (typeof window === 'undefined') return null;
      return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    };

    const cleanupSocket = () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        const s = socketRef.current;
        socketRef.current = null;
        // Detach handlers first so unmounting doesn't emit console errors or trigger reconnect
        s.onopen = null;
        s.onmessage = null;
        s.onerror = null;
        s.onclose = null;
        if (s.readyState === WebSocket.OPEN) {
          try {
            s.close(1000, 'Component unmounted');
          } catch {}
        } else if (s.readyState === WebSocket.CONNECTING) {
          s.onopen = () => {
            try {
              s.close(1000, 'Closed after mount');
            } catch {}
          };
        }
      }
    };

    const connect = () => {
      if (!isMountedRef.current) return;
      cleanupSocket();

      const token = getToken();
      const baseUrl = getBaseWsUrl();
      const finalWsUrl = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;

      try {
        console.info(`Connecting to Global Sync WebSocket: ${finalWsUrl}`);
        const socket = new WebSocket(finalWsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          if (!isMountedRef.current) {
            try {
              socket.close(1000);
            } catch {}
            return;
          }
          reconnectAttemptsRef.current = 0;
          console.info('Global Sync WebSocket connected successfully');

          // Keep connection alive through Nginx / Cloudflare proxy with a 25s ping
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              try {
                socket.send('ping');
              } catch {}
            }
          }, 25000);
        };

        socket.onmessage = (event) => {
          if (!isMountedRef.current) return;
          const trimmedData = typeof event.data === 'string' ? event.data.trim().toLowerCase() : '';
          if (trimmedData === 'pong' || trimmedData === 'ping') {
            if (trimmedData === 'ping') {
              try {
                socket.send('pong');
              } catch {}
            }
            return;
          }

          try {
            const payload = JSON.parse(event.data);

            if (payload.type === 'heartbeat' || payload.event_type === 'HEARTBEAT') {
              try {
                socket.send('ping');
              } catch {}
              return;
            }

            const eventType = payload.event_type || payload.type;

            const standardEvents = [
              'new_lead',
              'LEAD_SAVED',
              'LEAD_INSERTED',
              'LEAD_UPDATED',
              'SEARCH_COMPLETED',
              'SEARCH_STARTED',
              'SEARCH_PROGRESS',
              'STATISTICS_UPDATED',
              'SEARCH_HISTORY_UPDATED',
              'PHONE_FOUND',
              'EMAIL_FOUND',
              'EXTRACTION_COMPLETED',
              'LEAD_CREATED',
            ];

            const analysisEvents = [
              'analysis_started',
              'analysis_progress',
              'analysis_partial_saved',
              'analysis_completed',
              'analysis_failed',
              'score_updated',
              'technology_updated',
              'contacts_updated',
              'recommendations_updated',
              'history_updated',
              'STAGE_PROGRESS',
              'LEAD_STARTED',
              'LEAD_PROGRESS',
              'SEO_COMPLETED',
              'PERFORMANCE_COMPLETED',
              'UI_COMPLETED',
              'UX_COMPLETED',
              'analysis_success',
              'bulk_progress',
            ];

            if (standardEvents.includes(eventType) || analysisEvents.includes(eventType)) {
              const leadId =
                payload.lead_id ||
                payload.data?.id ||
                payload.lead?.id ||
                payload.data?._id ||
                payload.lead?._id;

              if (leadId) {
                queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
                queryClient.invalidateQueries({ queryKey: ['leadAi', leadId] });
                queryClient.invalidateQueries({ queryKey: ['leadAnalysisSummary', leadId] });
                queryClient.invalidateQueries({ queryKey: ['leadAnalysisHistory', leadId] });
                queryClient.invalidateQueries({ queryKey: ['leadAnalysisComparison', leadId] });
              }

              queryClient.invalidateQueries({ queryKey: ['leads'] });
              queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
              queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
              queryClient.invalidateQueries({ queryKey: ['dashboardCharts'] });
              queryClient.invalidateQueries({ queryKey: ['whatsapp-leads'] });
              queryClient.invalidateQueries({ queryKey: ['email-sync-leads'] });

              if (eventType === 'new_lead' || eventType === 'LEAD_SAVED') {
                const leadName =
                  payload.data?.name || payload.data?.business_name || payload.lead?.name || 'Business';
                const category = payload.data?.category || payload.lead?.category || 'Category unknown';

                toast.success(`Real-time Sync: New lead discovered: ${leadName}`, {
                  description: category,
                  duration: 4000,
                });
              }

              if (eventType === 'SEARCH_COMPLETED') {
                toast.success('Search Completed', {
                  description: 'A search job has finished running. Dashboard updated.',
                  duration: 5000,
                });
              }

              if (eventType === 'analysis_completed') {
                toast.success('AI Analysis Completed', {
                  description: 'The AI Website Analysis has finished. Lead data updated.',
                  duration: 5000,
                  action: leadId
                    ? {
                        label: 'Open Lead Details',
                        onClick: () => (window.location.href = `/dashboard/leads/detail?id=${leadId}`),
                      }
                    : undefined,
                });
              }
            }
          } catch (err) {
            console.error('Error parsing Global Sync WS message:', err);
          }
        };

        socket.onclose = (event) => {
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          if (!isMountedRef.current) return;

          // If auth failed (4003), delay slightly longer before retry
          const isAuthError = event.code === 4003;
          const baseDelay = isAuthError ? 8000 : 1500;
          const delay = Math.min(baseDelay * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;

          console.info(
            `Global Sync WebSocket closed (code: ${event.code}). Reconnecting in ${Math.round(delay)}ms...`
          );
          reconnectTimerRef.current = setTimeout(connect, delay);
        };

        socket.onerror = () => {
          // onerror is immediately followed by onclose where reconnection is safely scheduled
        };
      } catch (err) {
        console.warn('Failed to initialize Global Sync WebSocket:', err);
        const delay = Math.min(2000 * Math.pow(1.5, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };

    connect();

    return () => {
      isMountedRef.current = false;
      cleanupSocket();
    };
  }, [queryClient]);

  return <GlobalSyncContext.Provider value={null}>{children}</GlobalSyncContext.Provider>;
}

export const useGlobalSync = () => useContext(GlobalSyncContext);
