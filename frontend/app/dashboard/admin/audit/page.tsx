'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { PageHeader } from '@/src/components/common/PageHeader';
import { ShieldAlert, User, Laptop, Globe, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function AuditLogsPage() {
  const [page, setPage] = useState(0);
  const limit = 50;

  const { data: responseData, isLoading } = useQuery({
    queryKey: ['audit_logs', page],
    queryFn: async () => {
      const res = await api.get(`/system/audit?skip=${page * limit}&limit=${limit}`);
      return res.data;
    }
  });

  const logs = responseData?.data || [];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <PageHeader title="Global Audit Logs" description="Track all sensitive actions across the entire enterprise system." />

      <div className="bg-[#FAFAF8] border border-[#E7E5E4] rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-xs text-[#6B7280] uppercase bg-white border-b border-[#E7E5E4]">
            <tr>
              <th className="px-6 py-4 font-semibold">Action</th>
              <th className="px-6 py-4 font-semibold">User</th>
              <th className="px-6 py-4 font-semibold">Resource</th>
              <th className="px-6 py-4 font-semibold">IP Address</th>
              <th className="px-6 py-4 font-semibold">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center p-8 text-[#6B7280]">Loading audit logs...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center p-8 text-[#6B7280]">No audit logs found.</td></tr>
            ) : (
              logs.map((log: any) => (
                <tr key={log._id} className="border-b border-[#E7E5E4]/50 hover:bg-[#F5F5F3]/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-purple-500" />
                      <span className="font-bold text-[#111827]">{log.action}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-[#111827] font-medium flex items-center gap-1"><User className="w-3 h-3"/> {log.user_email}</span>
                      <span className="text-xs text-[#6B7280]">{log.user_id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {log.resource ? (
                      <div className="flex flex-col">
                        <span className="text-[#111827]">{log.resource}</span>
                        <span className="text-xs text-[#6B7280]">{log.resource_id}</span>
                      </div>
                    ) : (
                      <span className="text-neutral-600">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-[#6B7280] flex items-center gap-1"><Globe className="w-3 h-3"/> {log.ip_address || '-'}</span>
                      <span className="text-[10px] text-neutral-600 truncate max-w-[200px]" title={log.user_agent}>{log.user_agent || '-'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[#6B7280] flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    {log.created_at ? format(new Date(log.created_at), 'MMM d, yyyy HH:mm:ss') : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center text-sm text-[#6B7280]">
        <span>Page {page + 1}</span>
        <div className="flex gap-2">
          <button 
            disabled={page === 0} 
            onClick={() => setPage(p => p - 1)}
            className="px-4 py-2 bg-white border border-[#E7E5E4] rounded-lg hover:bg-[#FCFCFA] disabled:opacity-50 transition-colors"
          >
            Previous
          </button>
          <button 
            disabled={!logs || logs.length < limit} 
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 bg-white border border-[#E7E5E4] rounded-lg hover:bg-[#FCFCFA] disabled:opacity-50 transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
