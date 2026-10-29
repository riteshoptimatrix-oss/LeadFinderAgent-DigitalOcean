'use client';

import { useState, useMemo } from 'react';
import {
  Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Check, Globe, Phone, MapPin, Star, Loader2
} from 'lucide-react';

export interface WALead {
  _id: string;
  name?: string;
  category?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  lead_score?: number;
  status?: string;
  google_rating?: number;
}

interface LeadSelectionTableProps {
  leads: WALead[];
  total: number;
  isLoading: boolean;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: string;
  sortOrder: number;
  onSortChange: (field: string) => void;
}

export default function LeadSelectionTable({
  leads,
  total,
  isLoading,
  selectedIds,
  onSelectionChange,
  page,
  pageSize,
  onPageChange,
  searchQuery,
  onSearchChange,
  sortBy,
  sortOrder,
  onSortChange,
}: LeadSelectionTableProps) {
  const allCurrentSelected = leads.length > 0 && leads.every(l => selectedIds.has(l._id));
  const someCurrentSelected = leads.some(l => selectedIds.has(l._id));

  const totalPages = Math.ceil(total / pageSize);
  const startItem = page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, total);

  const toggleAll = () => {
    const newSet = new Set(selectedIds);
    if (allCurrentSelected) {
      leads.forEach(l => newSet.delete(l._id));
    } else {
      leads.forEach(l => newSet.add(l._id));
    }
    onSelectionChange(newSet);
  };

  const toggleOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    onSelectionChange(newSet);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <ChevronUp className="w-3 h-3 text-slate-300" />;
    return sortOrder === 1
      ? <ChevronUp className="w-3 h-3 text-slate-600" />
      : <ChevronDown className="w-3 h-3 text-slate-600" />;
  };

  const sortableHeader = (label: string, field: string) => (
    <button
      onClick={() => onSortChange(field)}
      className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-700 transition-colors"
    >
      {label}
      <SortIcon field={field} />
    </button>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search leads..."
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 w-64 transition-all"
            />
          </div>
          {selectedIds.size > 0 && (
            <span className="px-3 py-1 bg-slate-900 text-white text-xs font-semibold rounded-full">
              {selectedIds.size} selected
            </span>
          )}
        </div>
        <div className="text-xs text-slate-400">
          {total > 0 ? `${total} leads with valid phone numbers` : 'No valid leads found'}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              <th className="px-5 py-3 w-12">
                <button
                  onClick={toggleAll}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${allCurrentSelected
                      ? 'bg-slate-900 border-slate-900'
                      : someCurrentSelected
                        ? 'bg-slate-300 border-slate-400'
                        : 'border-slate-300 hover:border-slate-400'
                    }`}
                >
                  {(allCurrentSelected || someCurrentSelected) && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3">{sortableHeader('Business Name', 'name')}</th>
              <th className="px-4 py-3">{sortableHeader('Category', 'category')}</th>
              <th className="px-4 py-3">{sortableHeader('Phone Number', 'phone')}</th>
              <th className="px-4 py-3">Website</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">{sortableHeader('Lead Score', 'lead_score')}</th>
              <th className="px-4 py-3">WA Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="text-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto mb-2" />
                  <span className="text-sm text-slate-400">Loading leads...</span>
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-16">
                  <Phone className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 font-medium">No leads with valid phone numbers found</p>
                  <p className="text-xs text-slate-300 mt-1">Try adjusting your filters or scrape more leads</p>
                </td>
              </tr>
            ) : leads.map((lead) => {
              const isSelected = selectedIds.has(lead._id);
              return (
                <tr
                  key={lead._id}
                  onClick={() => toggleOne(lead._id)}
                  className={`cursor-pointer transition-all ${isSelected
                      ? 'bg-slate-50'
                      : 'hover:bg-slate-50/60'
                    }`}
                >
                  <td className="px-5 py-3.5">
                    <div
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected
                          ? 'bg-slate-900 border-slate-900'
                          : 'border-slate-300'
                        }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-semibold text-slate-800">{lead.name || '—'}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-slate-500 text-xs">{lead.category || '—'}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    {lead.phone ? (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-700 font-mono text-xs">{lead.phone}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {lead.website ? (
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-600 text-xs truncate max-w-[120px]">{lead.website}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {(lead.city || lead.address) ? (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-500 text-xs truncate max-w-[120px]">{lead.city || lead.address}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-600">{lead.lead_score || 0}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                      Ready
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Showing {startItem}–{endItem} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pageNum = page < 3 ? i : page - 2 + i;
              if (pageNum >= totalPages) return null;
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${pageNum === page
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100'
                    }`}
                >
                  {pageNum + 1}
                </button>
              );
            })}
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
