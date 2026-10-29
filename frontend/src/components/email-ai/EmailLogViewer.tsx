import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Search, Filter, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/src/lib/utils';

export default function EmailLogViewer() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['email-ai-logs'],
    queryFn: async () => {
      const res = await api.get('/email-ai/logs');
      return res.data;
    },
    refetchInterval: 15000
  });

  const filteredLogs = logs.filter((log: any) => {
    if (statusFilter !== 'ALL' && log.status !== statusFilter.toLowerCase()) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!log.campaign_name?.toLowerCase().includes(s) && !log.error?.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)]">
      <div className="p-4 border-b border-slate-200 flex gap-4 bg-slate-50/50">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search logs by campaign or error message..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="relative w-48">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select 
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="SKIPPED">Skipped</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 shadow-sm z-10">
            <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="p-4">Timestamp</th>
              <th className="p-4">Campaign</th>
              <th className="p-4">Status</th>
              <th className="p-4">Duration</th>
              <th className="p-4">Details / Errors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={5} className="p-8 text-center text-slate-400">Loading logs...</td></tr>
            ) : filteredLogs.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-slate-400">No logs found matching criteria.</td></tr>
            ) : (
              filteredLogs.map((log: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 whitespace-nowrap text-xs text-slate-500">
                    {log.processed_at ? format(new Date(log.processed_at), 'MMM d, yyyy HH:mm:ss') : 'N/A'}
                  </td>
                  <td className="p-4">
                    <div className="font-semibold text-slate-900 text-sm">{log.campaign_name || 'Unknown Campaign'}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">ID: {log.lead_id}</div>
                  </td>
                  <td className="p-4">
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold",
                      log.status === 'sent' ? "bg-green-100 text-green-700" :
                      log.status === 'failed' ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {log.status === 'sent' && <CheckCircle2 className="w-3 h-3" />}
                      {log.status === 'failed' && <XCircle className="w-3 h-3" />}
                      {log.status === 'skipped' && <Clock className="w-3 h-3" />}
                      {log.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4 text-xs font-medium text-slate-600">
                    {log.duration ? `${log.duration.toFixed(2)}s` : '-'}
                  </td>
                  <td className="p-4">
                    {log.error ? (
                      <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100 break-all">
                        {log.error}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Success</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
