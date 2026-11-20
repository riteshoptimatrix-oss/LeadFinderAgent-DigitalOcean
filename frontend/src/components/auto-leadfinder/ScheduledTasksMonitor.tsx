'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';

import {
  Clock,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  Loader2,
  Calendar,
  Layers,
  ArrowRight,
  Activity,
  Compass,
  TrendingUp,
  Trash2,
  ShieldCheck,
  Check,
  Timer,
  Zap,
  Info
} from 'lucide-react';

export default function ScheduledTasksMonitor() {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Query live scheduled tasks from the actual backend scheduler & MongoDB states
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

  const summary = tasksData?.summary || {
    total_tasks: 0,
    running_now: 0,
    scheduled: 0,
    completed_runs: 0,
    failed_runs: 0
  };

  const tasksList: any[] = tasksData?.tasks || [];
  const historyList: any[] = tasksData?.recent_history || [];
  const serverTime = tasksData?.server_time_ist || 'Loading server time...';

  const filteredTasks = tasksList.filter((task) => {
    if (filterStatus === 'ALL') return true;
    return task.status === filterStatus;
  });

  // Render proper icon per task
  const renderTaskIcon = (task: any) => {
    if (task.id === 'auto_leadfinder_daily') {
      return <Compass className="w-5 h-5 text-teal-600" />;
    }
    if (task.id === 'daily_aggregate') {
      return <TrendingUp className="w-5 h-5 text-indigo-600" />;
    }
    if (task.id === 'daily_cleanup') {
      return <Trash2 className="w-5 h-5 text-amber-600" />;
    }
    return <Activity className="w-5 h-5 text-blue-600" />;
  };

  // Render status badge exactly as requested
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse shadow-xs">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
            <span>🔵 Running</span>
          </span>
        );
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>🟡 Scheduled</span>
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>🟢 Completed</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>🔴 Failed</span>
          </span>
        );
      case 'CANCELLED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>⚪ Cancelled</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Real-Time Status Header */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Real-Time Task Monitoring Dashboard</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync (3s)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Connected directly to the backend AsyncIOScheduler execution system.
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

        {/* Live Status Counter Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/70 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-amber-700 block">🟡 Scheduled & Waiting</span>
              <span className="text-xl font-bold text-amber-900 mt-0.5 block">{summary.scheduled}</span>
            </div>
            <Clock className="w-5 h-5 text-amber-500/80" />
          </div>

          <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200/70 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-blue-700 block">🔵 Running Currently</span>
              <span className="text-xl font-bold text-blue-900 mt-0.5 block">{summary.running_now}</span>
            </div>
            <Loader2 className={`w-5 h-5 text-blue-500/80 ${summary.running_now > 0 ? 'animate-spin' : ''}`} />
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200/70 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-emerald-700 block">🟢 Completed Runs</span>
              <span className="text-xl font-bold text-emerald-900 mt-0.5 block">{summary.completed_runs}</span>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-500/80" />
          </div>

          <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-200/70 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-rose-700 block">🔴 Failed Runs</span>
              <span className="text-xl font-bold text-rose-900 mt-0.5 block">{summary.failed_runs}</span>
            </div>
            <XCircle className="w-5 h-5 text-rose-500/80" />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-200/80 pb-2">
        {['ALL', 'SCHEDULED', 'RUNNING', 'FAILED'].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilterStatus(tab)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterStatus === tab
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab === 'ALL' && 'All Scheduled Tasks'}
            {tab === 'SCHEDULED' && '🟡 Scheduled'}
            {tab === 'RUNNING' && `🔵 Running (${summary.running_now})`}
            {tab === 'FAILED' && '🔴 Failed'}
          </button>
        ))}
      </div>

      {/* Scheduled Tasks Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading ? (
          <div className="col-span-2 py-16 text-center text-slate-400">
            <Loader2 className="w-8 h-8 rounded-full animate-spin mx-auto mb-2 text-indigo-600" />
            <span>Synchronizing live task execution data...</span>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="col-span-2 py-16 text-center text-slate-400 bg-white border border-slate-200/80 rounded-3xl">
            <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="font-semibold text-slate-600 text-sm">No tasks matching selected filter</p>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <div
              key={task.id}
              className={`bg-white border rounded-3xl p-5 shadow-2xs space-y-4 transition-all hover:border-slate-300 ${
                task.status === 'RUNNING' ? 'border-blue-300 ring-2 ring-blue-500/20' : 'border-slate-200/80'
              }`}
            >
              {/* Task Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center shrink-0 mt-0.5">
                    {renderTaskIcon(task)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{task.title}</h4>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                        {task.id}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {task.description}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  {renderStatusBadge(task.status)}
                </div>
              </div>

              {/* Execution Time Details Box */}
              <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-3.5 space-y-2 text-xs">
                {/* Next Execution */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-teal-600" />
                    Next Automatic Execution:
                  </span>
                  <div className="text-right">
                    <span className="font-bold text-slate-900 block">{task.next_execution_time}</span>
                    <span className="text-[10px] text-teal-600 font-bold block">{task.next_execution_relative}</span>
                  </div>
                </div>

                {/* Frequency & Timezone */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-200/50">
                  <span className="text-slate-500 font-medium">Schedule Frequency:</span>
                  <span className="font-semibold text-slate-700">{task.frequency}</span>
                </div>

                {/* Last Execution Info */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-200/50">
                  <span className="text-slate-500 font-medium">Last Run Finished:</span>
                  <span className="font-semibold text-slate-700">{task.last_completion_time}</span>
                </div>

                {/* Duration & Result */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-200/50">
                  <span className="text-slate-500 font-medium">Execution Duration:</span>
                  <span className="font-bold text-slate-800">{task.last_duration}</span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-200/50">
                  <span className="text-slate-500 font-medium">Last Result:</span>
                  <span className={`font-semibold ${task.status === 'FAILED' ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {task.last_result}
                  </span>
                </div>

                {task.error_message && (
                  <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] mt-1 font-mono break-all">
                    Error: {task.error_message}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Task Execution History Audit Table */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-center text-slate-700">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Task Execution Audit Log</h3>
              <p className="text-xs text-slate-500">
                Detailed record of recent scheduled task runs, durations, and output results.
              </p>
            </div>
          </div>

          <span className="text-xs font-semibold text-slate-400">
            Showing last {historyList.length} runs
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Task Name & ID</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Completed At (IST)</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Execution Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    <Clock className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    <span>No task executions logged yet. Tasks execute automatically according to their schedule.</span>
                  </td>
                </tr>
              ) : (
                historyList.map((h: any) => (
                  <tr key={h._id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      <span>{h.task_name || h.task_id}</span>
                      <span className="block text-[10px] font-mono text-slate-400 font-normal">
                        {h.task_id}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {renderStatusBadge(h.status)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium">
                      {h.completed_at || '-'}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                      {h.duration || '-'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`font-medium ${h.status === 'FAILED' ? 'text-rose-600' : 'text-slate-700'}`}>
                        {h.result || (h.status === 'COMPLETED' ? 'Success' : 'Failed')}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
