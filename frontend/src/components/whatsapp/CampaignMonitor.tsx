'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Clock,
  Send,
  XCircle,
  Loader2,
  Download,
  TrendingUp
} from 'lucide-react';
import api from '@/lib/axios';

interface CampaignMonitorProps {
  campaignId: string;
  onClose?: () => void;
}

interface CampaignStats {
  campaign_id: string;
  campaign_name: string;
  status: string;
  total_messages: number;
  sent: number;
  failed: number;
  pending: number;
  skipped: number;
  success_rate: number;
  failure_rate: number;
  duration_seconds: number | null;
  estimated_remaining_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
  status_breakdown: {
    PENDING?: number;
    PREPARING?: number;
    OPENING_WHATSAPP?: number;
    SENDING?: number;
    SENT?: number;
    FAILED?: number;
    SKIPPED?: number;
    DELIVERED?: number;
    READ?: number;
  };
}

interface MessageLog {
  id: string;
  lead_name: string;
  recipient_phone: string;
  status: string;
  error_message: string | null;
  retry_count: number;
  sent_at: string | null;
}

export default function CampaignMonitor({ campaignId, onClose }: CampaignMonitorProps) {
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [realtimeUpdates, setRealtimeUpdates] = useState<string[]>([]);

  // Fetch campaign stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get(`/whatsapp/campaigns/${campaignId}/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  // Fetch message logs
  const fetchLogs = useCallback(async () => {
    try {
      const response = await api.get(`/whatsapp/campaigns/${campaignId}/logs?limit=50`);
      setLogs(response.data);
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  }, [campaignId]);

  // Setup WebSocket for real-time updates
  useEffect(() => {
    const token = localStorage.getItem('token');
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
    const wsBase = baseUrl.replace(/^http/, 'ws').replace(/\/api\/v1$/, '') + '/api/v1';
    const socket = new WebSocket(`${wsBase}/ws/campaigns/${campaignId}?token=${token}`);

    socket.onopen = () => {
      console.log('WebSocket connected');
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('WebSocket message:', message);

      // Add to realtime updates feed
      setRealtimeUpdates((prev) => [
        `${new Date().toLocaleTimeString()}: ${message.type}`,
        ...prev.slice(0, 9),
      ]);

      // Refresh stats on important events
      if (
        message.type === 'message_sent' ||
        message.type === 'message_failed' ||
        message.type === 'campaign_completed'
      ) {
        fetchStats();
        fetchLogs();
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    socket.onclose = () => {
      console.log('WebSocket disconnected');
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [campaignId, fetchStats, fetchLogs]);

  // Initial data fetch
  useEffect(() => {
    fetchStats();
    fetchLogs();
  }, [fetchStats, fetchLogs]);

  // Auto-refresh stats when campaign is running
  useEffect(() => {
    if (stats?.status === 'RUNNING' || stats?.status === 'QUEUED') {
      const interval = setInterval(fetchStats, 5000);
      return () => clearInterval(interval);
    }
  }, [stats?.status, fetchStats]);

  // Campaign action
  const handleAction = async (action: string) => {
    setActionLoading(action);
    try {
      await api.post(`/whatsapp/campaigns/${campaignId}/${action}`);
      await fetchStats();
      await fetchLogs();
    } catch (error) {
      console.error(`Error performing ${action}:`, error);
    } finally {
      setActionLoading(null);
    }
  };

  // Export report
  const handleExport = () => {
    if (!stats) return;
    
    const report = {
      campaign_name: stats.campaign_name,
      status: stats.status,
      total_messages: stats.total_messages,
      sent: stats.sent,
      failed: stats.failed,
      pending: stats.pending,
      skipped: stats.skipped,
      success_rate: stats.success_rate,
      duration_seconds: stats.duration_seconds,
      started_at: stats.started_at,
      completed_at: stats.completed_at,
      logs: logs,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign_${campaignId}_report.json`;
    a.click();
  };

  // Format time
  const formatTime = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  // Status badge
  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; icon: any }> = {
      PENDING: { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock },
      PREPARING: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Loader2 },
      OPENING_WHATSAPP: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Loader2 },
      SENDING: { bg: 'bg-purple-100', text: 'text-purple-700', icon: Send },
      SENT: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
      FAILED: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
      SKIPPED: { bg: 'bg-gray-100', text: 'text-gray-700', icon: AlertCircle },
    };

    const badge = badges[status] || badges.PENDING;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        <Icon className="w-3 h-3" />
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center p-12 text-slate-500">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-300" />
        <p>Campaign not found</p>
      </div>
    );
  }

  const progressPercentage = stats.total_messages > 0
    ? ((stats.sent + stats.failed + stats.skipped) / stats.total_messages) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{stats.campaign_name}</h2>
          <p className="text-sm text-slate-500 mt-1">Campaign ID: {stats.campaign_id}</p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(stats.status)}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">Overall Progress</h3>
          <span className="text-2xl font-bold text-emerald-600">
            {progressPercentage.toFixed(1)}%
          </span>
        </div>
        <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-3 text-sm text-slate-600">
          <span>
            {stats.sent + stats.failed + stats.skipped} / {stats.total_messages} messages processed
          </span>
          {stats.estimated_remaining_seconds && (
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {formatTime(stats.estimated_remaining_seconds)} remaining
            </span>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-sm font-medium text-slate-600">Sent</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.sent}</p>
          <p className="text-xs text-green-600 mt-1">{stats.success_rate.toFixed(1)}% success</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <span className="text-sm font-medium text-slate-600">Failed</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.failed}</p>
          <p className="text-xs text-red-600 mt-1">{stats.failure_rate.toFixed(1)}% failure</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-slate-600">Pending</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.pending}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-gray-600" />
            </div>
            <span className="text-sm font-medium text-slate-600">Skipped</span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.skipped}</p>
        </div>
      </div>

      {/* Campaign Controls */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Campaign Controls</h3>
        <div className="flex flex-wrap gap-2">
          {stats.status === 'DRAFT' && (
            <button
              onClick={() => handleAction('start')}
              disabled={actionLoading === 'start'}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
            >
              {actionLoading === 'start' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Start Campaign
            </button>
          )}

          {stats.status === 'RUNNING' && (
            <button
              onClick={() => handleAction('pause')}
              disabled={actionLoading === 'pause'}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50"
            >
              {actionLoading === 'pause' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
              Pause
            </button>
          )}

          {stats.status === 'PAUSED' && (
            <button
              onClick={() => handleAction('resume')}
              disabled={actionLoading === 'resume'}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
            >
              {actionLoading === 'resume' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Resume
            </button>
          )}

          {(stats.status === 'RUNNING' || stats.status === 'PAUSED') && (
            <button
              onClick={() => handleAction('stop')}
              disabled={actionLoading === 'stop'}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              {actionLoading === 'stop' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              Stop
            </button>
          )}

          {stats.failed > 0 && (
            <button
              onClick={() => handleAction('retry-failed')}
              disabled={actionLoading === 'retry-failed'}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {actionLoading === 'retry-failed' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Retry Failed ({stats.failed})
            </button>
          )}

          <button
            onClick={() => handleAction('reset-queue')}
            disabled={actionLoading === 'reset-queue'}
            className="flex items-center gap-2 px-4 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50"
          >
            {actionLoading === 'reset-queue' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            Reset Queue
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {/* Real-time Updates Feed */}
      {realtimeUpdates.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            Real-time Updates
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {realtimeUpdates.map((update, index) => (
              <div key={index} className="text-sm text-slate-600 font-mono">
                {update}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message Logs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Recent Messages</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Lead</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Phone</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Retries</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">Sent At</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 text-sm text-slate-900">{log.lead_name}</td>
                  <td className="py-3 px-4 text-sm text-slate-600">{log.recipient_phone}</td>
                  <td className="py-3 px-4">{getStatusBadge(log.status)}</td>
                  <td className="py-3 px-4 text-sm text-slate-600">{log.retry_count}/3</td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    {log.sent_at ? new Date(log.sent_at).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
