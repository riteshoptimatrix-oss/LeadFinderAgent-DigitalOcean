'use client';

import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Loader2, Activity, Database, Server, AlertCircle, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function SystemHealthPage() {
  const { data: health, isLoading: loadingHealth } = useQuery({
    queryKey: ['systemHealth'],
    queryFn: async () => (await api.get('/system/health')).data,
    refetchInterval: 15000 // Poll every 15s
  });

  const { data: jobs, isLoading: loadingJobs } = useQuery({
    queryKey: ['systemJobs'],
    queryFn: async () => (await api.get('/system/jobs')).data,
    refetchInterval: 15000
  });

  if (loadingHealth) {
    return <div className="flex h-[80vh] items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-[#111827] flex items-center gap-3">
          <Activity className="w-8 h-8 text-blue-500" />
          System Health
        </h1>
        <p className="text-[#6B7280] mt-1">Monitor background workers, database connectivity, and job queues.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Database Status */}
        <div className="bg-white border border-[#E7E5E4] rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <Database className="w-5 h-5 text-[#6B7280]" />
            <h3 className="text-sm font-semibold text-[#111827]">Database Connection</h3>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <div className={`w-3 h-3 rounded-full ${health?.database === 'ONLINE' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-lg font-bold text-[#111827]">{health?.database}</span>
          </div>
        </div>

        {/* Worker Status */}
        {health?.nodes?.map((node: any) => (
          <div key={node._id} className="bg-white border border-[#E7E5E4] rounded-2xl p-5">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-3">
                <Server className="w-5 h-5 text-[#6B7280]" />
                <h3 className="text-sm font-semibold text-[#111827]">Worker: {node.node_id}</h3>
              </div>
            </div>
            <div className="flex flex-col mt-2 space-y-1">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${node.status === 'ONLINE' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-lg font-bold text-[#111827]">{node.status}</span>
              </div>
              <p className="text-xs text-[#6B7280]">
                Last Heartbeat: {node.last_heartbeat ? formatDistanceToNow(new Date(node.last_heartbeat), { addSuffix: true }) : 'Never'}
              </p>
            </div>
          </div>
        ))}
        {(!health?.nodes || health.nodes.length === 0) && (
          <div className="bg-white border border-[#E7E5E4] rounded-2xl p-5 flex items-center text-red-400 gap-2">
            <AlertCircle className="w-5 h-5" /> No worker nodes detected.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-5 text-center">
          <p className="text-sm font-semibold text-indigo-400 mb-1">Email Queue</p>
          <p className="text-3xl font-bold text-[#111827]">{health?.queues?.email_pending || 0}</p>
          <p className="text-xs text-[#6B7280] mt-1">Pending Dispatches</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-5 text-center">
          <p className="text-sm font-semibold text-green-400 mb-1">WhatsApp Queue</p>
          <p className="text-3xl font-bold text-[#111827]">{health?.queues?.wa_pending || 0}</p>
          <p className="text-xs text-[#6B7280] mt-1">Pending Dispatches</p>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5 text-center">
          <p className="text-sm font-semibold text-blue-400 mb-1">Search Scrapers</p>
          <p className="text-3xl font-bold text-[#111827]">{health?.queues?.searches_running || 0}</p>
          <p className="text-xs text-[#6B7280] mt-1">Active Playwright Jobs</p>
        </div>
      </div>

      <div className="bg-white border border-[#E7E5E4] rounded-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-[#E7E5E4] bg-[#FAFAF8] flex justify-between items-center">
          <h3 className="text-lg font-bold text-[#111827] flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-[#6B7280]" /> Unified Job Logs
          </h3>
          <span className="text-xs text-[#6B7280]">Auto-refreshing</span>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          {loadingJobs ? (
            <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></div>
          ) : (
            <table className="w-full text-left text-sm text-[#6B7280]">
              <thead className="text-xs text-[#6B7280] uppercase bg-white sticky top-0">
                <tr>
                  <th className="px-6 py-3">Time</th>
                  <th className="px-6 py-3">Job Type</th>
                  <th className="px-6 py-3">Level</th>
                  <th className="px-6 py-3">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E5E4]">
                {jobs?.map((job: any) => (
                  <tr key={job._id} className="hover:bg-[#FCFCFA] transition-colors">
                    <td className="px-6 py-3 whitespace-nowrap text-xs text-[#6B7280] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-6 py-3 font-medium text-[#111827]">{job.job_type}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider ${
                        job.level === 'FATAL' ? 'bg-red-500/20 text-red-500 border border-red-500/30' :
                        job.level === 'ERROR' ? 'bg-red-400/10 text-red-400 border border-red-400/20' :
                        job.level === 'WARNING' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                        'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>
                        {job.level}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-[#111827]">
                      {job.message}
                      {job.target_id && <span className="block text-[10px] text-neutral-600 font-mono mt-0.5">Target: {job.target_id}</span>}
                    </td>
                  </tr>
                ))}
                {jobs?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-[#6B7280]">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-green-500/50" />
                      <p>No job logs found. Systems are running smoothly.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
