'use client';
import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const getWsUrl = () => {
  if (process.env.NEXT_PUBLIC_WS_URL) return (process.env.NEXT_PUBLIC_WS_URL + '/api/v1/ws/intelligence-updates').replace('localhost', '127.0.0.1');
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
  return (baseUrl.replace(/^http/, 'ws').replace(/\/api\/v1$/, '') + '/api/v1/ws/intelligence-updates').replace('localhost', '127.0.0.1');
};
const MAX_RECONNECT_DELAY = 16000;

export type IntelligenceWSEvent = {
  type: string;
  timestamp: string;
  lead_id?: string;
  website?: string;
  seo_score?: number;
  overall_score?: number;
};

export function useIntelligenceWS(onUpdate?: (event: IntelligenceWSEvent) => void) {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(1000);
  const mountedRef = useRef(true);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const invalidateQueries = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['intelligence-kpis'] });
    qc.invalidateQueries({ queryKey: ['intelligence-charts'] });
    qc.invalidateQueries({ queryKey: ['intelligence-leaderboards'] });
    qc.invalidateQueries({ queryKey: ['intelligence-top-opportunities'] });
  }, [qc]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    try {
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectDelay.current = 1000;
        // Keepalive ping every 20s
        pingInterval.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        if (!event.data || typeof event.data !== 'string') return;
        const trimmed = event.data.trim();
        if (!trimmed || trimmed === 'pong' || trimmed === 'ping') return;
        try {
          const data: IntelligenceWSEvent = JSON.parse(trimmed);
          if (data.type === 'INTELLIGENCE_KPI_UPDATE') {
            invalidateQueries();
            onUpdate?.(data);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        if (pingInterval.current) clearInterval(pingInterval.current);
        if (!mountedRef.current) return;
        // Exponential backoff reconnect
        setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_DELAY);
          connect();
        }, reconnectDelay.current);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // WebSocket not available in SSR
    }
  }, [invalidateQueries, onUpdate]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (pingInterval.current) clearInterval(pingInterval.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
