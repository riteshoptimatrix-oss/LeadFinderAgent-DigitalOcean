'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { 
  Search, 
  Calendar, 
  Mail, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Eye, 
  Download, 
  X, 
  Copy, 
  Check, 
  Clock, 
  Building2, 
  Send,
  RefreshCw,
  Phone,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';

interface CampaignEmailRecord {
  lead_id: string;
  business_name: string;
  email: string;
  phone?: string;
  city?: string;
  status: 'Delivered' | 'Failed' | 'Skipped' | 'Sending' | 'Pending';
  error?: string | null;
  processed_at?: string | null;
  duration?: number;
}

interface CampaignEmailsResponse {
  campaign_id: string;
  campaign_name: string;
  status: string;
  created_at?: string;
  completed_at?: string;
  total_targets: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  emails: CampaignEmailRecord[];
}

// Modal Component for Viewing Sent/Failed Emails in a Campaign
function CampaignEmailsModal({ 
  campaign, 
  onClose 
}: { 
  campaign: any; 
  onClose: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Delivered' | 'Failed' | 'Skipped'>('ALL');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<CampaignEmailsResponse>({
    queryKey: ['email-campaign-emails', campaign._id],
    queryFn: async () => {
      const res = await api.get(`/email-ai/campaigns/${campaign._id}/emails`);
      return res.data;
    }
  });

  const emails = data?.emails || [];

  const filteredEmails = useMemo(() => {
    return emails.filter(item => {
      const matchesStatus = statusFilter === 'ALL' || item.status.toLowerCase() === statusFilter.toLowerCase();
      const s = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        item.business_name.toLowerCase().includes(s) ||
        item.email.toLowerCase().includes(s) ||
        (item.city && item.city.toLowerCase().includes(s)) ||
        (item.error && item.error.toLowerCase().includes(s));
      return matchesStatus && matchesSearch;
    });
  }, [emails, statusFilter, searchTerm]);

  const copyToClipboard = (text: string) => {
    if (!text || text === 'No Email Found' || text === 'N/A') return;
    navigator.clipboard.writeText(text);
    setCopiedEmail(text);
    toast.success('Email copied to clipboard');
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const handleExportCampaignCsv = () => {
    if (!emails.length) {
      toast.error('No emails available to export');
      return;
    }
    const headers = ['Business Name', 'Email', 'Phone', 'City', 'Status', 'Error Reason', 'Processed At', 'Lead ID'];
    const rows = filteredEmails.map(e => [
      `"${(e.business_name || '').replace(/"/g, '""')}"`,
      `"${(e.email || '').replace(/"/g, '""')}"`,
      `"${(e.phone || '').replace(/"/g, '""')}"`,
      `"${(e.city || '').replace(/"/g, '""')}"`,
      `"${e.status}"`,
      `"${(e.error || '').replace(/"/g, '""')}"`,
      `"${e.processed_at || ''}"`,
      `"${e.lead_id || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Campaign_${campaign._id}_Emails.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Campaign emails CSV exported');
  };

  const totalTargets = data?.total_targets ?? (campaign.stats?.sent || 0) + (campaign.stats?.failed || 0);
  const deliveredCount = data?.sent_count ?? campaign.stats?.sent ?? 0;
  const failedCount = data?.failed_count ?? campaign.stats?.failed ?? 0;
  const skippedCount = data?.skipped_count ?? campaign.stats?.skipped ?? 0;
  const deliveryRate = totalTargets > 0 ? Math.round((deliveredCount / totalTargets) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200 bg-slate-50/70 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-slate-900">
                {campaign.name || `Campaign ${campaign._id.substring(0, 8)}`}
              </h2>
              <span className={cn(
                "px-2.5 py-0.5 text-xs font-bold rounded-full flex items-center gap-1.5",
                campaign.status === 'COMPLETED' ? "bg-green-100 text-green-700 border border-green-200" :
                campaign.status === 'CANCELLED' ? "bg-slate-100 text-slate-700 border border-slate-200" :
                "bg-red-100 text-red-700 border border-red-200"
              )}>
                {campaign.status === 'COMPLETED' ? <CheckCircle2 className="w-3.5 h-3.5" /> : 
                 campaign.status === 'CANCELLED' ? <AlertCircle className="w-3.5 h-3.5" /> : 
                 <XCircle className="w-3.5 h-3.5" />}
                {campaign.status}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
              <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                ID: {campaign._id}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(campaign.created_at).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-colors"
              title="Refresh Emails"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 bg-white border-b border-slate-200">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              Total Targeted
            </div>
            <div className="text-2xl font-black text-slate-900">{totalTargets}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-green-50/70 border border-green-200/80">
            <div className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
              Sent (Delivered)
            </div>
            <div className="text-2xl font-black text-green-700">{deliveredCount}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-red-50/70 border border-red-200/80">
            <div className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-red-600" />
              Failed
            </div>
            <div className="text-2xl font-black text-red-600">{failedCount}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-blue-600" />
              Deliverability Rate
            </div>
            <div className="text-2xl font-black text-blue-700">{deliveryRate}%</div>
          </div>
        </div>

        {/* Search, Filter Tabs & Export */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[260px] max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search recipient email, business, or error..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium shadow-2xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
              {(['ALL', 'Delivered', 'Failed', 'Skipped'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                    statusFilter === st
                      ? "bg-slate-900 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  )}
                >
                  {st === 'ALL' ? 'All' : st}
                </button>
              ))}
            </div>

            <button
              onClick={handleExportCampaignCsv}
              className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
              title="Export this campaign's email dispatch list to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Emails Table */}
        <div className="flex-1 overflow-auto p-4 custom-scrollbar">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-16 text-center text-slate-500">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-2" />
              <p className="font-bold text-slate-800">Failed to load emails for this campaign.</p>
              <button 
                onClick={() => refetch()} 
                className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Mail className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-bold text-slate-700">No emails match the selected filters.</p>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="mt-2 text-xs text-blue-600 hover:underline font-medium"
                >
                  Clear search term
                </button>
              )}
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10 shadow-2xs">
                  <tr>
                    <th className="p-3.5 pl-4">Target Business</th>
                    <th className="p-3.5">Sent To Email</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Error / Details</th>
                    <th className="p-3.5 text-right pr-4">Processed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredEmails.map((item, idx) => {
                    const isDelivered = item.status === 'Delivered';
                    const isFailed = item.status === 'Failed';
                    const isSkipped = item.status === 'Skipped';

                    return (
                      <tr key={item.lead_id || idx} className="hover:bg-slate-50/70 transition-colors">
                        {/* Target Business */}
                        <td className="p-3.5 pl-4">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{item.business_name}</span>
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                            {item.city && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {item.city}
                              </span>
                            )}
                            {item.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {item.phone}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Recipient Email */}
                        <td className="p-3.5">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "font-mono text-xs font-semibold px-2 py-1 rounded-md border",
                              item.email && item.email !== 'No Email Found'
                                ? "bg-slate-50 text-slate-900 border-slate-200"
                                : "bg-amber-50 text-amber-700 border-amber-200 italic"
                            )}>
                              {item.email}
                            </span>
                            {item.email && item.email !== 'No Email Found' && (
                              <button
                                onClick={() => copyToClipboard(item.email)}
                                className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition-colors"
                                title="Copy Email"
                              >
                                {copiedEmail === item.email ? (
                                  <Check className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="p-3.5">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border",
                            isDelivered
                              ? "bg-green-50 text-green-700 border-green-200"
                              : isFailed
                              ? "bg-red-50 text-red-700 border-red-200"
                              : isSkipped
                              ? "bg-slate-100 text-slate-700 border-slate-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          )}>
                            {isDelivered && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                            {isFailed && <XCircle className="w-3 h-3 text-red-600" />}
                            {isSkipped && <AlertCircle className="w-3 h-3 text-slate-500" />}
                            {item.status}
                          </span>
                        </td>

                        {/* Error / Details */}
                        <td className="p-3.5">
                          {item.error ? (
                            <div className="flex items-start gap-1.5 text-xs text-red-700 max-w-xs font-medium bg-red-50/60 p-1.5 rounded border border-red-200/60">
                              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                              <span className="truncate" title={item.error}>{item.error}</span>
                            </div>
                          ) : isDelivered ? (
                            <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                              Delivered successfully {item.duration ? `(${item.duration}s)` : ''}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No errors reported</span>
                          )}
                        </td>

                        {/* Processed At */}
                        <td className="p-3.5 text-right pr-4 text-xs font-medium text-slate-600">
                          {item.processed_at ? (
                            <div>
                              <div>{new Date(item.processed_at).toLocaleDateString()}</div>
                              <div className="text-[11px] text-slate-400">{new Date(item.processed_at).toLocaleTimeString()}</div>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">
            Showing <strong className="text-slate-800">{filteredEmails.length}</strong> of <strong className="text-slate-800">{emails.length}</strong> recipients
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors shadow-xs"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmailCampaignHistory() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  
  const { data, isLoading } = useQuery({
    queryKey: ['email-campaign-history', statusFilter],
    queryFn: async () => {
      const res = await api.get(`/email-ai/history?limit=50${statusFilter ? `&status=${statusFilter}` : ''}`);
      return res.data;
    }
  });

  const campaigns = data?.data || [];
  
  const filteredCampaigns = campaigns.filter((c: any) => 
    !search || 
    (c.name && c.name.toLowerCase().includes(search.toLowerCase())) ||
    c._id.includes(search)
  );

  const handleExportAllHistory = () => {
    if (!filteredCampaigns.length) {
      toast.error('No campaigns to export');
      return;
    }
    const headers = ['Campaign Name', 'Campaign ID', 'Status', 'Sent', 'Failed', 'Created Date'];
    const rows = filteredCampaigns.map((c: any) => [
      `"${(c.name || `Campaign ${c._id.substring(0, 8)}`).replace(/"/g, '""')}"`,
      `"${c._id}"`,
      `"${c.status}"`,
      `"${c.stats?.sent || c.leads_processed?.length || 0}"`,
      `"${c.stats?.failed || 0}"`,
      `"${new Date(c.created_at).toLocaleString()}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'Email_Campaigns_History.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Campaign history exported as CSV');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-slate-50/50 animate-in fade-in">
      
      {/* Header */}
      <div className="flex-none p-8 bg-white border-b border-slate-200">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Campaign History</h1>
        <p className="text-slate-500 font-medium">View past executions, analytics, and deliverability reports.</p>
        
        <div className="mt-8 flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 max-w-md min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input 
              type="text"
              placeholder="Search by campaign name or ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>
          
          <select 
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none shadow-2xs"
          >
            <option value="">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="FAILED">Failed</option>
          </select>
          
          <button 
            onClick={handleExportAllHistory}
            className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold flex items-center gap-2 ml-auto transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-8 custom-scrollbar">
        {isLoading ? (
          <div className="space-y-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-20 bg-white border border-slate-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-200 border-dashed">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-1">No History Found</h3>
            <p className="text-slate-500">There are no completed campaigns matching your filters.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Campaign</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Sent</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Failed</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((c: any) => (
                  <tr 
                    key={c._id} 
                    onClick={() => setSelectedCampaign(c)}
                    className="border-b border-slate-100 hover:bg-blue-50/40 transition-colors group cursor-pointer"
                  >
                    <td className="p-4">
                      <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {c.name || `Campaign ${c._id.substring(0,8)}`}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">{c._id}</div>
                    </td>
                    <td className="p-4">
                      <span className={cn(
                        "px-2.5 py-1 text-xs font-bold rounded-md flex items-center w-fit gap-1.5",
                        c.status === 'COMPLETED' ? "bg-green-100 text-green-700" :
                        c.status === 'CANCELLED' ? "bg-slate-100 text-slate-700" :
                        "bg-red-100 text-red-700"
                      )}>
                        {c.status === 'COMPLETED' ? <CheckCircle2 className="w-3.5 h-3.5" /> : 
                         c.status === 'CANCELLED' ? <AlertCircle className="w-3.5 h-3.5" /> : 
                         <XCircle className="w-3.5 h-3.5" />}
                        {c.status}
                      </span>
                    </td>
                    <td className="p-4 font-bold text-slate-700">
                      {c.stats?.sent || c.leads_processed?.length || 0}
                    </td>
                    <td className="p-4 font-bold text-red-500">
                      {c.stats?.failed || 0}
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-medium text-slate-900">
                        {new Date(c.created_at).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(c.created_at).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className="p-4 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => setSelectedCampaign(c)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded-xl text-xs font-bold transition-all shadow-2xs border border-blue-200/80 cursor-pointer"
                        title="View Sent Emails"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Emails</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Campaign Email Details Modal */}
      {selectedCampaign && (
        <CampaignEmailsModal 
          campaign={selectedCampaign} 
          onClose={() => setSelectedCampaign(null)} 
        />
      )}
    </div>
  );
}
