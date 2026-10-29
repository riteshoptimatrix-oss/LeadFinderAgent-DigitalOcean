'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Search, Filter, Calendar, Mail, FileText, CheckCircle2, XCircle, AlertCircle, Eye, Download } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export default function EmailCampaignHistory() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-slate-50/50 animate-in fade-in">
      
      {/* Header */}
      <div className="flex-none p-8 bg-white border-b border-slate-200">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Campaign History</h1>
        <p className="text-slate-500 font-medium">View past executions, analytics, and deliverability reports.</p>
        
        <div className="mt-8 flex gap-4">
          <div className="relative flex-1 max-w-md">
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
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="FAILED">Failed</option>
          </select>
          
          <button className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold flex items-center gap-2 ml-auto transition-colors">
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
                  <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((c: any) => (
                  <tr key={c._id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors group">
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{c.name || `Campaign ${c._id.substring(0,8)}`}</div>
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
                    <td className="p-4 text-right">
                      <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100" title="View Details">
                        <Eye className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
