'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { PageHeader } from '@/src/components/common/PageHeader';
import { Plus, Play, Pause, Square, BarChart3, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function CampaignsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [limit] = useState(20);

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', page, limit],
    queryFn: async () => {
      const res = await api.get(`/campaigns?skip=${page * limit}&limit=${limit}`);
      return res.data;
    }
  });

  const campaigns = data?.data || [];
  const total = data?.total || 0;

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string, action: string }) => {
      await api.post(`/campaigns/${id}/${action}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] })
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'COMPLETED': return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'FAILED': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'PAUSED': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      case 'CANCELLED': return 'text-[#6B7280] bg-neutral-500/10 border-neutral-500/20';
      default: return 'text-[#111827] bg-[#FCFCFA] border-[#E7E5E4]';
    }
  };

  return (
    <div className="w-full space-y-6 pb-12">
      <div className="flex justify-between items-center">
        <PageHeader title="Campaign Engine" description="Manage all Email, WhatsApp, and SMS outreaches." />
        <Link 
          href="/dashboard/campaigns/builder"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-[#111827] rounded-xl font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Campaign
        </Link>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Campaigns', value: total, icon: BarChart3, color: 'text-blue-500' },
          { label: 'Active', value: campaigns.filter((c:any) => c.status === 'RUNNING').length, icon: Play, color: 'text-green-500' },
          { label: 'Pending', value: campaigns.reduce((acc:any, c:any) => acc + (c.pending_count || 0), 0), icon: Clock, color: 'text-yellow-500' },
          { label: 'Completed', value: campaigns.filter((c:any) => c.status === 'COMPLETED').length, icon: CheckCircle2, color: 'text-purple-500' },
        ].map((stat, i) => (
          <div key={i} className="bg-white border border-[#E7E5E4] rounded-2xl p-6 flex items-center gap-4">
            <div className={`p-3 bg-[#FAFAF8] rounded-xl ${stat.color}`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#6B7280]">{stat.label}</p>
              <h3 className="text-2xl font-bold text-[#111827]">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Campaign List */}
      <div className="bg-[#FAFAF8] border border-[#E7E5E4] rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-white border-b border-[#E7E5E4] text-[#6B7280] font-medium">
            <tr>
              <th className="px-6 py-4">Campaign Name</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Progress</th>
              <th className="px-6 py-4">Recipients</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E5E4]">
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-[#6B7280]">Loading campaigns...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-[#6B7280]">No campaigns found. Start by creating one.</td></tr>
            ) : campaigns.map((campaign: any) => {
              const progress = campaign.total_count > 0 ? ((campaign.success_count + campaign.failure_count) / campaign.total_count) * 100 : 0;
              
              return (
                <tr key={campaign._id} className="hover:bg-[#F5F5F3] transition-colors group">
                  <td className="px-6 py-4">
                    <Link href={`/dashboard/campaigns/detail?id=${campaign._id}`} className="font-semibold text-[#111827] hover:text-blue-400 transition-colors">
                      {campaign.name}
                    </Link>
                    <div className="text-xs text-[#6B7280] mt-1">
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-[#FCFCFA] rounded text-xs font-medium text-[#111827]">
                      {campaign.campaign_type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${getStatusColor(campaign.status)}`}>
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 w-48">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-[#FCFCFA] rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-xs text-[#6B7280]">{Math.round(progress)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-[#111827]">{campaign.total_count}</div>
                    <div className="text-xs text-[#6B7280] mt-0.5">
                      <span className="text-green-500">{campaign.success_count}</span> ok / <span className="text-red-500">{campaign.failure_count}</span> err
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {campaign.status === 'RUNNING' || campaign.status === 'QUEUED' ? (
                        <button onClick={() => actionMutation.mutate({ id: campaign._id, action: 'pause' })} className="p-2 text-yellow-500 hover:bg-yellow-500/10 rounded-lg">
                          <Pause className="w-4 h-4" />
                        </button>
                      ) : campaign.status === 'PAUSED' ? (
                        <button onClick={() => actionMutation.mutate({ id: campaign._id, action: 'resume' })} className="p-2 text-green-500 hover:bg-green-500/10 rounded-lg">
                          <Play className="w-4 h-4" />
                        </button>
                      ) : null}
                      
                      {['RUNNING', 'QUEUED', 'PAUSED', 'SCHEDULED'].includes(campaign.status) && (
                        <button onClick={() => { if(confirm('Cancel campaign?')) actionMutation.mutate({ id: campaign._id, action: 'cancel' }) }} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg">
                          <Square className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
