'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { toast } from 'sonner';

import {
  Clock,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Loader2,
  Calendar,
  MapPin,
  TrendingUp,
  ShieldCheck,
  Target,
  Sparkles,
  Compass,
  Check,
  Timer,
  Layers,
  ArrowUpRight,
  Trash2,
  AlertTriangle
} from 'lucide-react';

interface ScheduledTasksMonitorProps {
  userEmail?: string;
  isKutchUser?: boolean;
  onScheduleDeleted?: () => void;
}

export default function ScheduledTasksMonitor({
  userEmail,
  isKutchUser = false,
  onScheduleDeleted
}: ScheduledTasksMonitorProps) {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Query live scheduled tasks from the backend for this specific user
  const {
    data: tasksData,
    isLoading,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ['scheduled-tasks-live-monitor', userEmail],
    queryFn: async () => {
      const res = await api.get('/auto-leadfinder/scheduled-tasks', {
        params: { user_email: userEmail }
      });
      return res.data;
    },
    refetchInterval: 3000, // True real-time update every 3 seconds
  });

  const schedules: any[] = tasksData?.lead_schedules || [];
  const serverTime = tasksData?.server_time_ist || 'Loading server time...';

  // Calculate live counters
  const scheduledCount = schedules.filter((s) => s.status === 'SCHEDULED').length;
  const runningCount = schedules.filter((s) => s.status === 'RUNNING').length;
  const completedCount = schedules.filter((s) => s.status === 'COMPLETED').length;
  const failedCount = schedules.filter((s) => s.status === 'FAILED').length;

  const filteredSchedules = schedules.filter((item) => {
    if (filterStatus === 'ALL') return true;
    return item.status === filterStatus;
  });

  // Handler for Delete All Schedules (strictly scoped to this user)
  const handleDeleteAllSchedules = async () => {
    setIsDeleting(true);
    try {
      await api.delete('/auto-leadfinder/schedules', {
        params: { user_email: userEmail }
      });
      toast.success(`All schedules and execution logs for ${userEmail || 'selected user'} have been deleted successfully.`);
      setShowDeleteModal(false);
      refetch();
      onScheduleDeleted?.();
    } catch (err: unknown) {
      const errorObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = errorObj?.response?.data?.detail || errorObj?.message || 'Failed to delete schedules.';
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Render Status Badge with explicit requested colors & emojis
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200 shadow-xs animate-pulse">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
            <span>🔵 Running</span>
          </span>
        );
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>🟡 Scheduled</span>
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>🟢 Completed</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
            <XCircle className="w-4 h-4 text-rose-600" />
            <span>🔴 Failed</span>
          </span>
        );
      case 'CANCELLED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>⚪ Cancelled</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Real-Time Control & Metric Header */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900">
                  LeadFinder Schedule &amp; Execution Tracker
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync (3s)
                </span>
                {userEmail && (
                  <span className="text-[11px] text-slate-400 font-medium">
                    User: <strong className="text-slate-700">{userEmail}</strong>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Displays 10-day lookahead schedule queue with scheduled execution dates, target areas, live statuses, and leads received.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center flex-wrap">
            <div className="bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 text-[11px]">Server Time:</span>
              <span className="font-bold text-slate-800 text-[11px]">{serverTime}</span>
            </div>

            <button
              onClick={() => refetch()}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-all cursor-pointer"
              title="Force Refresh"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            </button>

            {/* Delete All Schedules Button (User-Scoped) */}
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 transition-colors cursor-pointer shadow-2xs active:scale-95"
              title="Delete all schedules for this user only"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Delete All Schedules</span>
            </button>
          </div>
        </div>

        {/* 4 Quick KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/70 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-amber-700 block">🟡 Scheduled</span>
              <span className="text-xl font-bold text-amber-900 mt-0.5 block">{scheduledCount}</span>
            </div>
            <Clock className="w-5 h-5 text-amber-500/80" />
          </div>

          <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200/70 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-blue-700 block">🔵 Running Now</span>
              <span className="text-xl font-bold text-blue-900 mt-0.5 block">{runningCount}</span>
            </div>
            <Loader2 className={`w-5 h-5 text-blue-500/80 ${runningCount > 0 ? 'animate-spin' : ''}`} />
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/70 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-emerald-700 block">🟢 Completed</span>
              <span className="text-xl font-bold text-emerald-900 mt-0.5 block">{completedCount}</span>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-500/80" />
          </div>

          <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-200/70 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-rose-700 block">🔴 Failed / Errored</span>
              <span className="text-xl font-bold text-rose-900 mt-0.5 block">{failedCount}</span>
            </div>
            <XCircle className="w-5 h-5 text-rose-500/80" />
          </div>
        </div>
      </div>

      {/* Filter Tabs Bar */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {['ALL', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${filterStatus === st
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
            >
              {st === 'ALL' ? 'All Schedules' : st.charAt(0) + st.slice(1).toLowerCase()}
              <span className="ml-1.5 text-[10px] opacity-75">
                ({st === 'ALL' ? schedules.length : schedules.filter((s) => s.status === st).length})
              </span>
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-400 font-medium">
          Showing {filteredSchedules.length} of {schedules.length} tasks
        </span>
      </div>

      {/* Schedules List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-teal-600 mb-2" />
            <span className="text-xs text-slate-400 font-medium">Loading live schedule queue...</span>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-2">
            <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-1" />
            <h4 className="text-sm font-bold text-slate-700">No Schedules Found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              There are currently no active or historical schedules matching this filter for {userEmail || 'this user'}.
            </p>
          </div>
        ) : (
          filteredSchedules.map((item) => {
            const isCompleted = item.status === 'COMPLETED';
            const isRunning = item.status === 'RUNNING';
            const targetQuota = item.target || 500;
            const progress = item.progress_percentage || 0;

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-3xl p-5 transition-all shadow-2xs hover:shadow-xs ${isRunning
                  ? 'border-blue-300 ring-2 ring-blue-500/10'
                  : item.is_upcoming
                    ? 'border-slate-200/90'
                    : 'border-slate-100 bg-slate-50/30'
                  }`}
              >
                {/* Header row with Day label & Title */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    {item.day_label ? (
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-teal-50 text-teal-700 border border-teal-200">
                        {item.day_label}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600">
                        Past Run
                      </span>
                    )}
                    <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
                  </div>

                  <span className="text-xs text-slate-400 font-medium">
                    Scheduled At: <strong className="text-slate-700">{item.scheduled_date_time || item.created_at}</strong>
                  </span>
                </div>

                {/* 4 Primary Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center text-xs">
                  {/* Detail 1: Scheduled Execution Time (3 cols) */}
                  <div className="md:col-span-3 space-y-1 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-4">
                    <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-teal-600" />
                      Next Execution
                    </span>
                    <p className="font-bold text-slate-900 text-xs">
                      {item.next_execution_time}
                    </p>
                    <span className="text-[11px] text-teal-600 font-semibold block">
                      {item.next_execution_relative}
                    </span>
                  </div>

                  {/* Detail 2: Area / Location (4 cols) */}
                  <div className="md:col-span-4 space-y-1 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-4">
                    <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-500" />
                      Target Area
                    </span>
                    <p className="font-bold text-slate-800 text-xs truncate" title={item.area_name || item.city}>
                      {item.area_name || item.city}
                      {item.pincode && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-md text-[9px] bg-slate-100 text-slate-700 font-extrabold">
                          📮 {item.pincode}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate font-mono" title={item.area}>
                      {item.area}
                    </p>
                  </div>

                  {/* Detail 3: Status (2 cols) */}
                  <div className="md:col-span-2 space-y-1.5 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-4">
                    <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                      Status
                    </span>
                    <div className="pt-0.5">
                      {renderStatusBadge(item.status)}
                    </div>
                  </div>

                  {/* Detail 4: Leads Received vs Target: 500 (3 cols) */}
                  <div className="md:col-span-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-emerald-600" />
                        Leads Received
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        Target: {targetQuota}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-black ${isCompleted ? 'text-emerald-600' : isRunning ? 'text-blue-600' : 'text-slate-900'
                          }`}>
                          {item.leads_received || 0}
                        </span>
                        <span className="text-xs font-bold text-slate-400">/ {targetQuota} leads</span>
                      </div>
                      <span className={`text-xs font-extrabold ${progress >= 100 ? 'text-emerald-600' : 'text-slate-500'
                        }`}>
                        {progress}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-700 ${progress >= 100
                          ? 'bg-emerald-500'
                          : isRunning
                            ? 'bg-blue-600'
                            : 'bg-amber-400'
                          }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Confirmation Modal for Delete All Schedules */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete All Schedules?</h3>
                <p className="text-xs text-slate-500">
                  User Context: <strong className="text-slate-700">{userEmail || 'selected user'}</strong>
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete all schedules and execution runs for <strong className="text-slate-900">{userEmail || 'this user'}</strong>? This will clear scheduled tasks and historical run records for this user only.
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 leading-normal">
              ⚠️ <strong>Strict User Isolation:</strong> This action will NOT delete or affect schedules belonging to any other user.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteAllSchedules}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete All Schedules</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
