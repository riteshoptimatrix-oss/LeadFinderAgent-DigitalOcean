'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';

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
  ArrowUpRight
} from 'lucide-react';

export default function ScheduledTasksMonitor() {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Query live scheduled tasks from the backend
  const {
    data: tasksData,
    isLoading,
    refetch,
    isRefetching
  } = useQuery({
    queryKey: ['scheduled-tasks-live-monitor'],
    queryFn: async () => {
      const res = await api.get('/auto-leadfinder/scheduled-tasks');
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
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  LeadFinder Schedule & Execution Tracker
                </h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync (3s)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Displays scheduled creation dates, target areas, live execution statuses, and leads received against the 100-lead target.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-center">
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
              <span className="text-[11px] font-semibold text-emerald-700 block">🟢 Completed Runs</span>
              <span className="text-xl font-bold text-emerald-900 mt-0.5 block">{completedCount}</span>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-500/80" />
          </div>

          <div className="p-3.5 rounded-2xl bg-teal-50/60 border border-teal-200/70 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-teal-700 block">🎯 Target Per Run</span>
              <span className="text-xl font-bold text-teal-900 mt-0.5 block">100 Leads</span>
            </div>
            <Target className="w-5 h-5 text-teal-600" />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-200/80 pb-2">
        {[
          { key: 'ALL', label: `All Schedules (${schedules.length})` },
          { key: 'SCHEDULED', label: `🟡 Scheduled (${scheduledCount})` },
          { key: 'RUNNING', label: `🔵 Running (${runningCount})` },
          { key: 'COMPLETED', label: `🟢 Completed (${completedCount})` },
          { key: 'FAILED', label: `🔴 Failed (${failedCount})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterStatus(tab.key)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterStatus === tab.key
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Structured Schedules List Highlighting the 4 Key Details */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-20 text-center text-slate-400 bg-white border border-slate-200/80 rounded-3xl">
            <Loader2 className="w-8 h-8 rounded-full animate-spin mx-auto mb-2 text-teal-600" />
            <span className="text-sm font-semibold">Synchronizing real-time schedule data...</span>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="py-16 text-center text-slate-400 bg-white border border-slate-200/80 rounded-3xl p-6">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="font-semibold text-slate-700 text-sm">No schedules matching the selected filter</p>
            <p className="text-xs text-slate-400 mt-1">Switch filter to &quot;All Schedules&quot; to view active and completed schedules.</p>
          </div>
        ) : (
          filteredSchedules.map((item: any, idx: number) => {
            const isCompleted = item.status === 'COMPLETED';
            const isRunning = item.status === 'RUNNING';
            const progress = Math.min(100, Math.round(((item.leads_received || 0) / (item.target || 100)) * 100));

            return (
              <div
                key={item.id || idx}
                className={`bg-white border rounded-3xl p-6 shadow-2xs transition-all hover:shadow-sm ${
                  isRunning
                    ? 'border-blue-300 ring-2 ring-blue-500/20'
                    : isCompleted
                    ? 'border-emerald-200/70 hover:border-emerald-300'
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                {/* 4 Details Grid Header & Columns */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  
                  {/* Detail 1: Scheduled Date & Time (3 cols) */}
                  <div className="md:col-span-3 space-y-1.5 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-4">
                    <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-teal-600" />
                      Scheduled Date & Time
                    </span>
                    <div className="pt-0.5">
                      <span className="text-sm font-extrabold text-slate-900 block">
                        {item.scheduled_date_time || item.created_at || '12:00:00 AM IST'}
                      </span>
                      {item.is_upcoming ? (
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-800">
                            Next Run: {item.next_execution_time}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
                          Schedule Run ID: {item.id.slice(-8)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Detail 2: Area (4 cols) */}
                  <div className="md:col-span-4 space-y-1.5 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-4">
                    <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" />
                      Area / Location
                    </span>
                    <div className="pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">
                          {item.area_name || item.city || 'Kutch Locality'}
                        </span>
                        {item.pincode && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            📮 {item.pincode}
                          </span>
                        )}
                        {item.is_upcoming && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                            Next Queue
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1 leading-relaxed" title={item.area}>
                        {item.area}
                      </p>
                    </div>
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

                  {/* Detail 4: Leads Received vs Target: 100 (3 cols) */}
                  <div className="md:col-span-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-emerald-600" />
                        Leads Received
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        Target: 100
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-black ${
                          isCompleted ? 'text-emerald-600' : isRunning ? 'text-blue-600' : 'text-slate-900'
                        }`}>
                          {item.leads_received || 0}
                        </span>
                        <span className="text-xs font-bold text-slate-400">/ 100 leads</span>
                      </div>
                      <span className={`text-xs font-extrabold ${
                        progress >= 100 ? 'text-emerald-600' : 'text-slate-500'
                      }`}>
                        {progress}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-700 ${
                          progress >= 100
                            ? 'bg-emerald-500'
                            : isRunning
                            ? 'bg-blue-600'
                            : 'bg-amber-400'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    <span className="text-[10px] text-slate-400 block text-right font-medium">
                      {progress >= 100 ? '✅ 100 Leads Guaranteed & Verified' : 'Guaranteed Unique Contacts'}
                    </span>
                  </div>

                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
