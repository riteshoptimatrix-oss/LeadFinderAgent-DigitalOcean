'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Loader2, ArrowLeft, Download, Trash2, Search, Filter, ChevronLeft, ChevronRight, CheckSquare, Square } from 'lucide-react';
import Link from 'next/link';

export default function SearchHistoryPage() {
  const queryClient = useQueryClient();
  
  // State for advanced table
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('ALL');
  const [sortBy, setSortBy] = useState('started_at');
  const [sortOrder, setSortOrder] = useState(-1);
  
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['searchHistory', page, pageSize, keyword, status, sortBy, sortOrder],
    queryFn: async () => {
      const res = await api.get('/search/history', {
        params: {
          skip: page * pageSize,
          limit: pageSize,
          keyword: keyword || undefined,
          status: status || undefined,
          sort_by: sortBy,
          sort_order: sortOrder,
        }
      });
      return res.data;
    }
  });

  const jobs = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  // Phase 5: Real-time UI updates for active jobs without polling
  useEffect(() => {
    const activeJobs = jobs.filter((j: any) => ['RUNNING', 'PENDING'].includes(j.status));
    if (activeJobs.length === 0) return;

    const sockets: WebSocket[] = [];

    activeJobs.forEach((job: any) => {
      const jobId = job._id || job.id;
      if (!jobId) return;
      
      const wsUrl = process.env.NEXT_PUBLIC_API_URL 
        ? process.env.NEXT_PUBLIC_API_URL.replace(/^http/, 'ws').replace(/\/api\/v1$/, '') + `/ws/search/${jobId}`
        : (typeof window !== 'undefined' ? window.location.origin.replace(/^http/, 'ws').replace(/:\d+$/, ':8000') + `/ws/search/${jobId}` : '');
      
      if (!wsUrl) return;

      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
      const finalWsUrl = token ? `${wsUrl}?token=${token}` : wsUrl;

      const ws = new WebSocket(finalWsUrl);
      
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const type = payload.event_type || payload.type;
          
          if (!type || type === 'heartbeat' || type === 'LOG') return;

          queryClient.setQueryData(
            ['searchHistory', page, pageSize, keyword, status, sortBy, sortOrder],
            (oldData: any) => {
              if (!oldData || !oldData.data) return oldData;
              
              let changed = false;
              const newJobs = oldData.data.map((j: any) => {
                if ((j._id || j.id) === jobId) {
                  const updated = { ...j };
                  if (type === 'new_lead' && payload.total_saved !== undefined) {
                    updated.total_leads = payload.total_saved;
                    changed = true;
                  }
                  if (type === 'SEARCH_PROGRESS' && payload.data) {
                    if (payload.data.status !== undefined) updated.status = payload.data.status;
                    if (payload.data.elapsed_time !== undefined) updated.duration_seconds = Math.floor(payload.data.elapsed_time);
                    if (payload.data.businesses_found !== undefined) updated.total_leads = payload.data.businesses_found;
                    changed = true;
                  }
                  if (type === 'SEARCH_COMPLETED') {
                    updated.status = 'COMPLETED';
                    if (payload.data?.actual_collected !== undefined) updated.actual_collected = payload.data.actual_collected;
                    if (payload.data?.requested_target !== undefined) updated.requested_target = payload.data.requested_target;
                    if (payload.data?.businesses_found !== undefined) updated.total_leads = payload.data.businesses_found;
                    changed = true;
                    // API invalidation to lock in the final state
                    setTimeout(() => queryClient.invalidateQueries({ queryKey: ['searchHistory'] }), 1000);
                  }
                  if (type === 'SEARCH_FAILED') {
                    updated.status = 'FAILED';
                    changed = true;
                  }
                  return updated;
                }
                return j;
              });
              
              return changed ? { ...oldData, data: newJobs } : oldData;
            }
          );
        } catch (err) {
          // ignore parse errors
        }
      };
      
      sockets.push(ws);
    });

    return () => {
      sockets.forEach(ws => ws.close());
    };
  }, [jobs.map((j: any) => `${j._id}-${j.status}`).join(','), page, pageSize, keyword, status, sortBy, sortOrder, queryClient]);

  const deleteMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await api.delete(`/search/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
      setDeletingJobId(null);
    },
    onError: () => {
      setDeletingJobId(null);
      alert('Failed to delete job.');
    }
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (jobIds: string[]) => {
      await api.post('/search/bulk-delete', { job_ids: jobIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
      setSelectedJobs(new Set());
    }
  });

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 1 ? -1 : 1);
    } else {
      setSortBy(column);
      setSortOrder(-1);
    }
  };

  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedJobs(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedJobs.size === jobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(jobs.map((j: any) => j._id)));
    }
  };

  const exportExcelAndDownload = async (jobId: string) => {
    const res = await api.get(`/search/${jobId}/export`, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `leads_job_${jobId}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDeleteWithExport = async (jobId: string) => {
    setDeletingJobId(jobId);
    try {
      // Step 1 & 2: Generate and Download Excel Backup automatically
      await exportExcelAndDownload(jobId);
      
      // Step 3: Show confirmation dialog AFTER backup is secured
      setTimeout(() => {
        if (window.confirm("This action will permanently delete the selected data and cannot be undone.")) {
          // Delete MongoDB records only after confirmation
          deleteMutation.mutate(jobId);
        } else {
          setDeletingJobId(null);
        }
      }, 500); // Small timeout to allow the browser download to start before blocking the thread with confirm()
      
    } catch (e) {
      alert("Failed to export backup. Job was not deleted.");
      setDeletingJobId(null);
    }
  };

  const handleBulkDelete = () => {
    if (!window.confirm(`Are you sure you want to permanently delete ${selectedJobs.size} jobs and their leads?`)) return;
    bulkDeleteMutation.mutate(Array.from(selectedJobs));
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link 
            href="/dashboard/search"
            className="p-2 rounded-xl text-[#6B7280] hover:text-[#111827] hover:bg-[#FCFCFA] transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Search History</h1>
            <p className="text-[#6B7280] text-sm">Review, export, and manage past lead generation jobs.</p>
          </div>
        </div>

        {selectedJobs.size > 0 && (
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleteMutation.isPending}
            className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm font-medium flex items-center gap-2 border border-red-500/20 transition-colors"
          >
            {bulkDeleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Bulk Delete ({selectedJobs.size})
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
          <input
            type="text"
            placeholder="Search keywords..."
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#E7E5E4] rounded-xl text-sm text-[#111827] focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="relative max-w-xs">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#E7E5E4] rounded-xl text-sm text-[#111827] focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMPLETED">Completed</option>
            <option value="RUNNING">Running</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="bg-[#FAFAF8]/50 backdrop-blur-sm border border-[#E7E5E4] rounded-2xl flex-1 flex flex-col overflow-hidden">
        {isLoading ? (
          <div className="flex-1 flex justify-center items-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
        ) : (
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm text-[#6B7280]">
              <thead className="text-xs text-[#6B7280] uppercase bg-white border-b border-[#E7E5E4]">
                <tr>
                  <th className="px-6 py-4">
                    <button onClick={handleSelectAll} className="text-[#6B7280] hover:text-[#111827]">
                      {selectedJobs.size === jobs.length && jobs.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  <th className="px-6 py-4 font-medium cursor-pointer hover:text-[#111827]" onClick={() => handleSort('keyword')}>
                    Search ID
                  </th>
                  <th className="px-6 py-4 font-medium cursor-pointer hover:text-[#111827]" onClick={() => handleSort('keyword')}>
                    Keyword / Location {sortBy === 'keyword' && (sortOrder === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-4 font-medium cursor-pointer hover:text-[#111827]" onClick={() => handleSort('status')}>
                    Status {sortBy === 'status' && (sortOrder === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-4 font-medium cursor-pointer hover:text-[#111827]" onClick={() => handleSort('total_leads')}>
                    Collected / Target {sortBy === 'total_leads' && (sortOrder === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-4 font-medium cursor-pointer hover:text-[#111827]" onClick={() => handleSort('duration_seconds')}>
                    Duration {sortBy === 'duration_seconds' && (sortOrder === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E5E4]">
                {jobs.map((job: any) => {
                  const jobId = job._id || job.id || job.job_id;
                  return (
                    <tr key={jobId} className={`transition-colors ${selectedJobs.has(jobId) ? 'bg-blue-900/10' : 'hover:bg-[#F5F5F3]/30'}`}>
                      <td className="px-6 py-4">
                        <button onClick={() => handleSelect(jobId)} className="text-[#6B7280] hover:text-[#111827]">
                          {selectedJobs.has(jobId) ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-xs text-slate-500">{jobId}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-[#111827] font-medium">{job.keyword}</div>
                        <div className="text-xs mt-1 text-[#6B7280]">
                          {[job.city, job.state, job.country].filter(Boolean).join(', ') || 'Any Location'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider
                          ${job.status === 'RUNNING' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : ''}
                          ${job.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : ''}
                          ${job.status === 'FAILED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : ''}
                          ${job.status === 'STOPPED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : ''}
                          ${job.status === 'CANCELLED' ? 'bg-neutral-500/10 text-[#6B7280] border border-neutral-500/20' : ''}
                          ${job.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : ''}
                        `}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-semibold text-[#111827]">
                          {job.actual_collected ?? job.completed_leads ?? job.total_leads ?? 0}
                        </span>
                        <span className="text-[#9CA3AF]"> / {job.requested_target ?? job.limit ?? job.max_leads ?? '—'}</span>
                        {job.source_exhausted && job.status === 'COMPLETED' && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20" title="Source exhausted before target was reached">
                            partial
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {job.duration_seconds}s
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          {job.total_leads > 0 && (
                            <>
                              <button
                                onClick={() => exportExcelAndDownload(jobId)}
                                className="p-2 text-[#6B7280] hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                title="Export Excel"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDeleteWithExport(jobId)}
                            disabled={deletingJobId === jobId}
                            className="p-2 text-[#6B7280] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                            title="Delete (Downloads backup first)"
                          >
                            {deletingJobId === jobId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-[#6B7280]">
                      No search history found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        {total > 0 && (
          <div className="px-6 py-4 border-t border-[#E7E5E4] bg-[#FAFAF8] flex items-center justify-between">
            <span className="text-sm text-[#6B7280]">
              Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, total)} of {total} entries
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 rounded-lg hover:bg-[#FCFCFA] disabled:opacity-50 text-[#111827]"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 rounded-lg hover:bg-[#FCFCFA] disabled:opacity-50 text-[#111827]"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
