'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import {
  Clock, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp,
  Play, Trash2, AlertTriangle, BarChart3, MessageSquare
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

interface CampaignListProps {
  onOpenBuilder?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; bg: string; text: string; border: string }> = {
  QUEUED: { label: 'Queued', icon: Clock, bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  RUNNING: { label: 'Running', icon: Play, bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  COMPLETED: { label: 'Completed', icon: CheckCircle2, bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
  FAILED: { label: 'Failed', icon: XCircle, bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
};

export default function CampaignList({ onOpenBuilder }: CampaignListProps) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['wa-campaigns'],
    queryFn: async () => {
      const res = await api.get('/whatsapp/campaigns');
      return Array.isArray(res.data) ? res.data : [];
    },
    refetchInterval: 10000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/whatsapp/campaigns/${id}`);
    },
    onSuccess: () => {
      toast.success('Campaign deleted');
      queryClient.invalidateQueries({ queryKey: ['wa-campaigns'] });
    },
    onError: () => toast.error('Failed to delete campaign'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <MessageSquare className="w-6 h-6 text-slate-300" />
        </div>
        <p className="text-base font-semibold text-slate-700">No campaigns yet</p>
        <p className="text-sm text-slate-400 mt-1 mb-5 max-w-sm">
          Create your first campaign to start sending personalized WhatsApp messages
        </p>
        <button
          onClick={onOpenBuilder}
          className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-md"
        >
          Create Campaign
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {campaigns.map((campaign: any) => {
        const status = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.QUEUED;
        const StatusIcon = status.icon;
        const total = campaign.total_count || 0;
        const processed = (campaign.sent_count || 0) + (campaign.failed_count || 0);
        const progress = total > 0 ? Math.round((processed / total) * 100) : 0;
        const isExpanded = expandedId === campaign._id;

        return (
          <div
            key={campaign._id}
            className="border border-slate-200 rounded-xl overflow-hidden bg-white hover:border-slate-300 hover:shadow-sm transition-all"
          >
            {/* Campaign Row */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : campaign._id)}
              className="flex items-center gap-4 px-5 py-4 cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1.5">
                  <h3 className="text-sm font-bold text-slate-800 truncate">{campaign.name}</h3>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${status.bg} ${status.text} border ${status.border}`}>
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span>{campaign.total_count || 0} recipients</span>
                  <span>{campaign.sent_count || 0} sent</span>
                  <span>{campaign.failed_count || 0} failed</span>
                  {campaign.created_at && (
                    <span className="text-slate-300">
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Progress */}
              <div className="flex items-center gap-3 w-48 flex-shrink-0">
                <div className="flex-1">
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        campaign.status === 'FAILED' ? 'bg-red-400' : 'bg-slate-800'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-bold text-slate-600 w-8 text-right">{progress}%</span>
              </div>

              <div className="flex items-center gap-1">
                <Link
                  href={`/dashboard/whatsapp/detail?id=${campaign._id}`}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                  onClick={(e) => e.stopPropagation()}
                  title="View details"
                >
                  <BarChart3 className="w-4 h-4" />
                </Link>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this campaign?')) {
                      deleteMutation.mutate(campaign._id);
                    }
                  }}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-300" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-300" />
                )}
              </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-white rounded-lg border border-slate-100 p-3">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total</span>
                    <div className="text-lg font-bold text-slate-800 mt-0.5">{campaign.total_count || 0}</div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-100 p-3">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sent</span>
                    <div className="text-lg font-bold text-emerald-600 mt-0.5">{campaign.sent_count || 0}</div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-100 p-3">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Failed</span>
                    <div className="text-lg font-bold text-red-500 mt-0.5">{campaign.failed_count || 0}</div>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-100 p-3">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Delivered</span>
                    <div className="text-lg font-bold text-blue-600 mt-0.5">{campaign.delivered_count || 0}</div>
                  </div>
                </div>
                {campaign.description && (
                  <p className="text-sm text-slate-500">{campaign.description}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
