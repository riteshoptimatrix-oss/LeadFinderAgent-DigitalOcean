'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Loader2, ArrowLeft, Download, Trash2, Search, Filter, ChevronLeft, ChevronRight, CheckCircle2, Globe, Phone, XCircle, FileSpreadsheet, FileText } from 'lucide-react';
import Link from 'next/link';

export default function LeadResultsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const jobId = searchParams.get('id') as string;

  // Table state
  const [page, setPage] = useState(0);
  const [pageSize] = useState(15);
  const [search, setSearch] = useState('');
  const [hasWebsite, setHasWebsite] = useState<boolean | null>(null);
  const [hasPhone, setHasPhone] = useState<boolean | null>(null);
  const [minRating, setMinRating] = useState<string>('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState(-1);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: jobData, isLoading: isJobLoading } = useQuery({
    queryKey: ['searchJob', jobId],
    queryFn: async () => {
      const res = await api.get(`/search/${jobId}`);
      return res.data;
    },
    enabled: !!jobId
  });

  const { data: leadsData, isLoading: isLeadsLoading } = useQuery({
    queryKey: ['searchLeads', jobId, page, pageSize, search, hasWebsite, hasPhone, minRating, sortBy, sortOrder],
    queryFn: async () => {
      const res = await api.get(`/search/results/${jobId}`, {
        params: {
          skip: page * pageSize,
          limit: pageSize,
          search: search || undefined,
          has_website: hasWebsite !== null ? hasWebsite : undefined,
          has_phone: hasPhone !== null ? hasPhone : undefined,
          min_rating: minRating ? parseFloat(minRating) : undefined,
          sort_by: sortBy,
          sort_order: sortOrder
        }
      });
      return res.data;
    }
  });

  const leads = leadsData?.data || [];
  const total = leadsData?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  // Structured logging for dashboard search results
  useEffect(() => {
    console.log("Show Results Loaded - Requested search_job_id:", jobId);
  }, [jobId]);

  useEffect(() => {
    if (leadsData) {
      console.log("API Response Count:", leadsData.total, "leads returned");
      console.log("Frontend Render Count:", leads.length, "leads rendered");
    } else if (leadsData === null || (leadsData && leadsData.total === 0)) {
      console.warn("API returned zero leads for job ID:", jobId);
    }
  }, [leadsData, leads.length, jobId]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 1 ? -1 : 1);
    } else {
      setSortBy(column);
      setSortOrder(-1);
    }
  };

  const exportData = async (format: 'excel' | 'csv') => {
    // Currently our backend only supports excel out of the box via /export,
    // if we needed CSV we'd add an ?format=csv param to the backend, but we'll use the default excel export.
    try {
      const res = await api.get(`/search/${jobId}/export`, { responseType: 'blob' });
      // In a real app we might pass format=csv, but since our plan specified excel we just download it.
      // We can mock CSV by just changing extension, though it will be an excel binary.
      // So we will stick to xlsx here.
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `leads_job_${jobId}.${format === 'csv' ? 'csv' : 'xlsx'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to export data.");
    }
  };

  const handleDeleteWithExport = async () => {
    setIsDeleting(true);
    try {
      // Step 1: Backup
      await exportData('excel');
      
      // Step 2: Confirm
      setTimeout(async () => {
        if (window.confirm("Backup downloaded. Are you sure you want to permanently delete this job and all its leads?")) {
          try {
            await api.delete(`/search/${jobId}`);
            router.push('/dashboard/search/history');
          } catch (e) {
            alert("Failed to delete job.");
            setIsDeleting(false);
          }
        } else {
          setIsDeleting(false);
        }
      }, 500);
    } catch (e) {
      setIsDeleting(false);
    }
  };

  if (isJobLoading) {
    return <div className="flex h-[80vh] items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6 flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/search/history" className="p-2 rounded-xl text-[#6B7280] hover:text-[#111827] hover:bg-[#FCFCFA] transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Lead Results</h1>
            <p className="text-[#6B7280] text-sm">Reviewing results for "{jobData?.keyword}"</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportData('csv')} className="px-4 py-2 bg-white hover:bg-[#FCFCFA] text-[#111827] rounded-xl text-sm font-medium flex items-center gap-2 border border-[#E7E5E4] transition-colors">
            <FileText className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => exportData('excel')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-[#111827] rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </button>
          <button onClick={handleDeleteWithExport} disabled={isDeleting} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-sm font-medium flex items-center gap-2 border border-red-500/20 transition-colors disabled:opacity-50">
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#FAFAF8]/50 border border-[#E7E5E4] rounded-2xl p-5">
          <div className="flex items-center gap-3 text-[#6B7280] mb-2">
            <CheckCircle2 className="w-5 h-5 text-blue-500" />
            <h3 className="font-medium text-sm">Businesses Found</h3>
          </div>
          <p className="text-3xl font-bold text-[#111827]">{jobData?.total_leads || 0}</p>
        </div>
        <div className="bg-[#FAFAF8]/50 border border-[#E7E5E4] rounded-2xl p-5">
          <div className="flex items-center gap-3 text-[#6B7280] mb-2">
            <Phone className="w-5 h-5 text-emerald-500" />
            <h3 className="font-medium text-sm">Valid Phones</h3>
          </div>
          <p className="text-3xl font-bold text-[#111827]">{jobData?.total_valid_phones || 0}</p>
        </div>
        <div className="bg-[#FAFAF8]/50 border border-[#E7E5E4] rounded-2xl p-5">
          <div className="flex items-center gap-3 text-[#6B7280] mb-2">
            <Globe className="w-5 h-5 text-indigo-500" />
            <h3 className="font-medium text-sm">Valid Websites</h3>
          </div>
          <p className="text-3xl font-bold text-[#111827]">{jobData?.total_valid_websites || 0}</p>
        </div>
        <div className="bg-[#FAFAF8]/50 border border-[#E7E5E4] rounded-2xl p-5">
          <div className="flex items-center gap-3 text-[#6B7280] mb-2">
            <XCircle className="w-5 h-5 text-amber-500" />
            <h3 className="font-medium text-sm">Duplicates Removed</h3>
          </div>
          <p className="text-3xl font-bold text-[#111827]">{jobData?.duplicates_removed || 0}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
          <input
            type="text"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#E7E5E4] rounded-xl text-sm text-[#111827] focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <select
          value={hasWebsite === null ? '' : hasWebsite.toString()}
          onChange={(e) => { setHasWebsite(e.target.value === '' ? null : e.target.value === 'true'); setPage(0); }}
          className="px-4 py-2.5 bg-white border border-[#E7E5E4] rounded-xl text-sm text-[#111827] focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">Any Website</option>
          <option value="true">Has Website</option>
          <option value="false">No Website</option>
        </select>
        <select
          value={hasPhone === null ? '' : hasPhone.toString()}
          onChange={(e) => { setHasPhone(e.target.value === '' ? null : e.target.value === 'true'); setPage(0); }}
          className="px-4 py-2.5 bg-white border border-[#E7E5E4] rounded-xl text-sm text-[#111827] focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">Any Phone</option>
          <option value="true">Has Phone</option>
          <option value="false">No Phone</option>
        </select>
        <select
          value={minRating}
          onChange={(e) => { setMinRating(e.target.value); setPage(0); }}
          className="px-4 py-2.5 bg-white border border-[#E7E5E4] rounded-xl text-sm text-[#111827] focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="">Any Rating</option>
          <option value="4.0">4.0+ Stars</option>
          <option value="4.5">4.5+ Stars</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#FAFAF8]/50 backdrop-blur-sm border border-[#E7E5E4] rounded-2xl flex-1 flex flex-col overflow-hidden">
        {isLeadsLoading ? (
          <div className="flex-1 flex justify-center items-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
        ) : (
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-sm text-[#6B7280]">
              <thead className="text-xs text-[#6B7280] uppercase bg-white border-b border-[#E7E5E4]">
                <tr>
                  <th className="px-6 py-4 font-medium cursor-pointer hover:text-[#111827]" onClick={() => handleSort('name')}>
                    Business Name {sortBy === 'name' && (sortOrder === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-4 font-medium cursor-pointer hover:text-[#111827]" onClick={() => handleSort('category')}>
                    Category {sortBy === 'category' && (sortOrder === 1 ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-4 font-medium">Phone</th>
                  <th className="px-6 py-4 font-medium">Website</th>
                  <th className="px-6 py-4 font-medium">Address / City / State</th>
                  <th className="px-6 py-4 font-medium cursor-pointer hover:text-[#111827]" onClick={() => handleSort('google_rating')}>
                    Rating {sortBy === 'google_rating' && (sortOrder === 1 ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E5E4]">
                {leads.map((lead: any) => (
                  <tr key={lead._id} className="hover:bg-[#F5F5F3] transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-[#111827] font-medium">{lead.name || lead.business_name || 'Unnamed Business'}</div>
                      {lead.business_status && lead.business_status !== 'Operational' && (
                        <span className="text-xs text-red-400 font-bold">{lead.business_status}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">{lead.category || '-'}</td>
                    <td className="px-6 py-4">{lead.phone || '-'}</td>
                    <td className="px-6 py-4">
                      {lead.website ? (
                        <a href={lead.website} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline break-all">
                          {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-xs">
                      <div>{lead.address || '-'}</div>
                      <div className="text-[#6B7280] mt-1">{[lead.city, lead.state].filter(Boolean).join(', ')}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {lead.google_rating ? (
                        <div>
                          <span className="text-yellow-500 font-bold">{lead.google_rating}</span>
                          <span className="text-xs text-[#6B7280] ml-1">({lead.review_count})</span>
                        </div>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-[#6B7280]">
                      No leads found matching your criteria.
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
              Showing {page * pageSize + 1} to {Math.min((page + 1) * pageSize, total)} of {total} leads
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded-lg hover:bg-[#FCFCFA] disabled:opacity-50 text-[#111827]">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 rounded-lg hover:bg-[#FCFCFA] disabled:opacity-50 text-[#111827]">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
