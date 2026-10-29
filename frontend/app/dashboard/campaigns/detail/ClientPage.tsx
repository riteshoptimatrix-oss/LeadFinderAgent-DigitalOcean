'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { ArrowLeft, Play, Pause, Square, CheckCircle2, XCircle, Clock, Terminal } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

export default function CampaignDetailsPage() {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get('id') as string;

  const { data: campaign, isLoading: campLoading, refetch: refetchCamp } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: async () => {
      const res = await api.get(`/campaigns/${campaignId}`);
      return res.data;
    }
  });

  const { data: logs = [], refetch: refetchLogs } = useQuery({
    queryKey: ['campaignLogs', campaignId],
    queryFn: async () => {
      const res = await api.get(`/campaigns/${campaignId}/logs`);
      return res.data;
    }
  });

  // Auto-refresh if running
  useEffect(() => {
    if (campaign && (campaign.status === 'RUNNING' || campaign.status === 'QUEUED')) {
      const interval = setInterval(() => {
        refetchCamp();
        refetchLogs();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [campaign, refetchCamp, refetchLogs]);

  if (campLoading) return <div className="p-12 text-center text-[#6B7280]">Loading Campaign...</div>;
  if (!campaign) return <div className="p-12 text-center text-red-500">Campaign not found.</div>;

  const total = campaign.total_count || 1;
  const processed = campaign.success_count + campaign.failure_count;
  const progress = (processed / total) * 100;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard/campaigns" className="p-2 text-[#6B7280] hover:text-[#111827] bg-white rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-[#111827]">{campaign.name}</h1>
            <span className="px-3 py-1 bg-[#FCFCFA] text-[#111827] rounded-lg text-sm font-semibold tracking-wide uppercase">
              {campaign.campaign_type}
            </span>
          </div>
          <p className="text-[#6B7280] text-sm mt-1">Status: <span className="font-bold text-[#111827]">{campaign.status}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Main Progress Card */}
        <div className="md:col-span-2 bg-[#FAFAF8]/50 backdrop-blur-sm border border-[#E7E5E4] rounded-2xl p-8 space-y-8">
          
          <div>
            <div className="flex justify-between items-end mb-4">
              <h2 className="text-lg font-bold text-[#111827]">Live Progress</h2>
              <span className="text-2xl font-bold text-blue-500">{Math.round(progress)}%</span>
            </div>
            
            <div className="h-4 w-full bg-white rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${campaign.status === 'FAILED' ? 'bg-red-500' : 'bg-blue-500'}`} 
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-[#E7E5E4] flex flex-col gap-1">
              <span className="text-xs text-[#6B7280] font-semibold uppercase">Pending</span>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-500" />
                <span className="text-xl font-bold text-[#111827]">{campaign.pending_count}</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#E7E5E4] flex flex-col gap-1">
              <span className="text-xs text-[#6B7280] font-semibold uppercase">Delivered</span>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-xl font-bold text-[#111827]">{campaign.success_count}</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-xl border border-[#E7E5E4] flex flex-col gap-1">
              <span className="text-xs text-[#6B7280] font-semibold uppercase">Failed</span>
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-xl font-bold text-[#111827]">{campaign.failure_count}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Timestamps */}
        <div className="bg-[#FAFAF8]/50 backdrop-blur-sm border border-[#E7E5E4] rounded-2xl p-6 space-y-6">
          <h2 className="text-lg font-bold text-[#111827]">Timeline</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-[#6B7280] uppercase font-semibold">Created At</p>
              <p className="text-sm text-[#111827] mt-1">{new Date(campaign.created_at).toLocaleString()}</p>
            </div>
            {campaign.started_at && (
              <div>
                <p className="text-xs text-[#6B7280] uppercase font-semibold">Started At</p>
                <p className="text-sm text-[#111827] mt-1">{new Date(campaign.started_at).toLocaleString()}</p>
              </div>
            )}
            {campaign.completed_at && (
              <div>
                <p className="text-xs text-[#6B7280] uppercase font-semibold">Completed At</p>
                <p className="text-sm text-[#111827] mt-1">{new Date(campaign.completed_at).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Terminal Logs */}
      <div className="bg-black border border-[#E7E5E4] rounded-2xl overflow-hidden flex flex-col h-96">
        <div className="bg-white px-4 py-3 border-b border-[#E7E5E4] flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#6B7280]" />
          <h3 className="text-sm font-semibold text-[#111827]">Execution Logs</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-neutral-600 text-center py-10">Waiting for campaign to start...</p>
          ) : (
            logs.map((log: any) => (
              <div key={log._id} className="flex gap-4">
                <span className="text-neutral-600 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={`shrink-0 w-24 uppercase font-bold
                  ${log.action === 'Sent' ? 'text-green-500' : ''}
                  ${log.action === 'Failed' ? 'text-red-500' : ''}
                  ${!['Sent', 'Failed'].includes(log.action) ? 'text-blue-500' : ''}
                `}>
                  [{log.action}]
                </span>
                <span className="text-[#111827] break-all">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
