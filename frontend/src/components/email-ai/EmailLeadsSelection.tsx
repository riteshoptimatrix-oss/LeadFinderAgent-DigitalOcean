'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { 
  Search, MapPin, Building2, Phone, Mail, Globe, Sparkles,  
  CheckSquare, Square, Loader2, ArrowRight, Filter, ChevronDown, 
  SortAsc, Calendar, Tag, AlertCircle, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { useRouter } from 'next/navigation';

interface Lead {
  _id: string;
  business_name: string;
  name?: string;
  company_name?: string;
  email: string;
  primary_email?: string;
  all_emails?: string[];
  phone: string;
  whatsapp_number?: string;
  website: string;
  ai_score?: number;
  lead_score?: number;
  category: string;
  industry?: string;
  country: string;
  state: string;
  city: string;
  status?: string;
  business_status?: string;
  created_at?: string;
  user_id?: string;
}

const STEPS = [
  { id: 1, label: 'Select Leads', active: true },
  { id: 2, label: 'AI Templates', active: false },
  { id: 3, label: 'Campaign Wizard', active: false },
  { id: 4, label: 'Live Campaign', active: false },
];

export default function EmailLeadsSelection() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);

  // Persistent States
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectingAll, setIsSelectingAll] = useState(false);

  const [filters, setFilters] = useState({
    city: '',
    category: '',
    has_website: undefined as boolean | undefined,
    has_phone: undefined as boolean | undefined,
    has_email: undefined as boolean | undefined,
    min_rating: undefined as number | undefined,
    status: 'ALL'
  });

  const [sort, setSort] = useState({
    sort_by: 'created_at',
    sort_order: -1
  });

  const [showFilters, setShowFilters] = useState(false);

  // Load persistent state
  useEffect(() => {
    setIsMounted(true);
    try {
      const savedIds = localStorage.getItem('email_selected_leads');
      if (savedIds) setSelectedIds(new Set(JSON.parse(savedIds)));

      const savedState = localStorage.getItem('email_leads_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        if (parsed.page) setPage(parsed.page);
        if (parsed.search) {
          setSearch(parsed.search);
          setDebouncedSearch(parsed.search);
        }
        if (parsed.filters) setFilters(parsed.filters);
        if (parsed.sort) setSort(parsed.sort);
      }
    } catch (e) {}
  }, []);

  // Save persistent state
  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem('email_selected_leads', JSON.stringify(Array.from(selectedIds)));
    localStorage.setItem('email_leads_state', JSON.stringify({
      page, search: debouncedSearch, filters, sort
    }));
  }, [selectedIds, page, debouncedSearch, filters, sort, isMounted]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch Data using Global Leads API
  const { data, isLoading, error } = useQuery({
    queryKey: ['email-ai-global-leads', page, debouncedSearch, filters, sort],
    queryFn: async () => {
      const res = await api.get('/leads', {
        params: { 
          limit: 15,
          skip: (page - 1) * 15,
          search: debouncedSearch,
          city: filters.city || undefined,
          category: filters.category || undefined,
          has_website: filters.has_website,
          has_phone: filters.has_phone,
          has_email: filters.has_email,
          min_rating: filters.min_rating,
          status: filters.status !== 'ALL' ? filters.status : undefined,
          sort_by: sort.sort_by,
          sort_order: sort.sort_order
        }
      });
      return res.data;
    },
    enabled: isMounted
  });

  const leads: Lead[] = data?.data || [];
  const total = data?.total || 0;

  // Handlers
  const handleSelectAllOnPage = () => {
    const next = new Set(selectedIds);
    if (leads.length > 0 && leads.every(l => selectedIds.has(l._id))) {
      leads.forEach(l => next.delete(l._id));
    } else {
      leads.forEach(l => next.add(l._id));
    }
    setSelectedIds(next);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAllGlobally = async () => {
    if (selectedIds.size === total && total > 0) {
      setSelectedIds(new Set());
      toast.success('All leads deselected.');
      return;
    }

    setIsSelectingAll(true);
    try {
      const res = await api.get('/email-ai/leads/select-all', {
        params: { 
          search: debouncedSearch,
          city: filters.city || undefined,
          category: filters.category || undefined,
          has_website: filters.has_website,
          has_phone: filters.has_phone,
          has_email: filters.has_email,
          min_rating: filters.min_rating,
          status: filters.status !== 'ALL' ? filters.status : undefined
        }
      });
      const allIds = res.data.ids || [];
      setSelectedIds(new Set(allIds));
      toast.success(`Successfully selected ${allIds.length} leads.`);
    } catch (error) {
      toast.error('Failed to select all leads. Please try again.');
    } finally {
      setIsSelectingAll(false);
    }
  };

  const handleGoAhead = () => {
    if (selectedIds.size === 0) {
      toast.error('Please select at least one lead to continue.');
      return;
    }
    window.dispatchEvent(new CustomEvent('change-tab', { detail: 'templates' }));
  };

  if (!isMounted) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in">
      
      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-200">
        <div className="flex items-center gap-4 sm:gap-8 overflow-x-auto w-full no-scrollbar">
          {STEPS.map((step, idx) => (
            <div key={step.id} className="flex items-center">
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-300",
                step.active 
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" 
                  : "bg-slate-100 text-slate-400"
              )}>
                <span className={cn(
                  "flex items-center justify-center w-5 h-5 rounded-full text-[10px]",
                  step.active ? "bg-white text-blue-600" : "bg-slate-200 text-slate-500"
                )}>
                  {step.id}
                </span>
                {step.label}
              </div>
              {idx < STEPS.length - 1 && (
                <div className="w-8 sm:w-12 h-[2px] mx-2 bg-slate-200 rounded-full" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Select Target Leads</h2>
          <p className="text-slate-500 text-sm mt-1">Choose the audience for your next email campaign.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold border border-blue-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            Selected {selectedIds.size.toLocaleString()} / {total.toLocaleString()}
          </div>
          <button
            onClick={handleSelectAllGlobally}
            disabled={isSelectingAll || total === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {isSelectingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : selectedIds.size === total && total > 0 ? (
              <Square className="w-4 h-4" />
            ) : (
              <CheckSquare className="w-4 h-4" />
            )}
            {selectedIds.size === total && total > 0 ? 'Deselect All' : 'Select All Leads'}
          </button>
        </div>
      </div>

      {/* Advanced Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search by name, email, phone, website..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full transition-all"
            />
          </div>
          
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition-colors",
              showFilters || Object.values(filters).some(v => v !== '' && v !== undefined && v !== 'ALL')
                ? "bg-blue-50 border-blue-200 text-blue-700" 
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            )}
          >
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className={cn("w-4 h-4 transition-transform", showFilters && "rotate-180")} />
          </button>
          
          <select 
            value={`${sort.sort_by}|${sort.sort_order}`}
            onChange={(e) => {
              const [by, order] = e.target.value.split('|');
              setSort({ sort_by: by, sort_order: parseInt(order) });
              setPage(1);
            }}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-700"
          >
            <option value="created_at|-1">Newest First</option>
            <option value="created_at|1">Oldest First</option>
            <option value="google_rating|-1">Highest AI Score</option>
            <option value="google_rating|1">Lowest AI Score</option>
            <option value="name|1">Business Name A-Z</option>
            <option value="name|-1">Business Name Z-A</option>
          </select>
        </div>
        
        {/* Expanded Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Category / Industry</label>
              <input 
                type="text" 
                placeholder="e.g. Software, Plumber..." 
                value={filters.category}
                onChange={(e) => { setFilters({...filters, category: e.target.value}); setPage(1); }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">City</label>
              <input 
                type="text" 
                placeholder="e.g. New York, London..." 
                value={filters.city}
                onChange={(e) => { setFilters({...filters, city: e.target.value}); setPage(1); }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Contact Info Available</label>
              <select 
                value={filters.has_email === undefined ? "" : filters.has_email.toString()}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilters({...filters, has_email: val === "" ? undefined : val === "true"});
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Any Email Status</option>
                <option value="true">Has Email</option>
                <option value="false">No Email</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Status</label>
              <select 
                value={filters.status}
                onChange={(e) => { setFilters({...filters, status: e.target.value}); setPage(1); }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="NEW">New</option>
                <option value="CONTACTED">Contacted</option>
                <option value="QUALIFIED">Qualified</option>
                <option value="LOST">Lost</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center p-12 bg-red-50 rounded-2xl border border-red-100 flex-1">
          <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
          <h3 className="text-lg font-bold text-red-900">Failed to load leads</h3>
          <p className="text-red-600 mt-1">Please check your connection and try again.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto bg-white rounded-2xl border border-slate-200 shadow-sm relative">
          <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
            <thead className="bg-slate-50/80 backdrop-blur-md sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="p-4 w-12 text-center">
                  <button onClick={handleSelectAllOnPage} className="text-slate-400 hover:text-blue-500 transition-colors">
                    {leads.length > 0 && leads.every(l => selectedIds.has(l._id)) ? (
                      <CheckSquare className="w-5 h-5 text-blue-500" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
                <th className="p-4 font-semibold text-slate-900">Business Name</th>
                <th className="p-4 font-semibold text-slate-900">Primary Email</th>
                <th className="p-4 font-semibold text-slate-900">Phone & Web</th>
                <th className="p-4 font-semibold text-slate-900">Industry & Location</th>
                <th className="p-4 font-semibold text-slate-900">AI Score</th>
                <th className="p-4 font-semibold text-slate-900">Date Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="p-4 text-center"><div className="w-5 h-5 bg-slate-200 rounded inline-block"></div></td>
                    <td className="p-4"><div className="h-4 bg-slate-200 rounded w-48 mb-2"></div><div className="h-3 bg-slate-100 rounded w-24"></div></td>
                    <td className="p-4"><div className="h-4 bg-slate-200 rounded w-40"></div></td>
                    <td className="p-4"><div className="h-4 bg-slate-200 rounded w-32 mb-2"></div><div className="h-4 bg-slate-200 rounded w-32"></div></td>
                    <td className="p-4"><div className="h-4 bg-slate-200 rounded w-24 mb-2"></div><div className="h-3 bg-slate-100 rounded w-32"></div></td>
                    <td className="p-4"><div className="h-6 bg-slate-200 rounded-full w-16"></div></td>
                    <td className="p-4"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                  </tr>
                ))
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-24 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 text-slate-300" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mb-1">No leads found</h3>
                      <p className="text-slate-500">Try adjusting your filters or search query.</p>
                      <button 
                        onClick={() => {
                          setSearch('');
                          setFilters({ city: '', category: '', has_website: undefined, has_phone: undefined, has_email: undefined, min_rating: undefined, status: 'ALL' });
                        }}
                        className="mt-6 px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-colors"
                      >
                        Clear all filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const isSelected = selectedIds.has(lead._id);
                  const businessName = lead.business_name || lead.company_name || lead.name || 'Unknown Business';
                  const email = lead.email || lead.primary_email || lead.all_emails?.[0] || 'N/A';
                  const phone = lead.whatsapp_number || lead.phone || 'N/A';
                  const industry = lead.industry || lead.category || 'Uncategorized';
                  const score = lead.ai_score || lead.lead_score || lead.ai_score || null;
                  
                  return (
                    <tr 
                      key={lead._id} 
                      className={cn(
                        "transition-all duration-200 hover:bg-slate-50 cursor-pointer group",
                        isSelected ? "bg-blue-50/60 hover:bg-blue-50/80" : ""
                      )}
                      onClick={() => toggleSelect(lead._id)}
                    >
                      <td className="p-4 text-center">
                        <button className={cn("transition-colors", isSelected ? "text-blue-500" : "text-slate-300 group-hover:text-slate-400")}>
                          {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                        </button>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900 flex items-center gap-2 max-w-[250px] truncate">
                            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="truncate">{businessName}</span>
                          </span>
                          {lead.status && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">
                              {lead.status}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <div className={cn("flex items-center gap-2", email === 'N/A' ? "text-slate-400" : "text-slate-700")}>
                            <Mail className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[200px] font-medium">{email}</span>
                          </div>
                          {lead.all_emails && lead.all_emails.length > 1 && (
                            <span className="text-[10px] text-slate-500 ml-5">
                              +{lead.all_emails.length - 1} more emails
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 space-y-2">
                        <div className="flex items-center gap-2 text-slate-600">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[150px]">{phone}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[150px]">{lead.website || 'No website'}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 text-slate-700">
                            <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[150px]">{industry}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-500 text-xs">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate max-w-[150px]">
                              {[lead.city, lead.state, lead.country].filter(Boolean).join(', ') || 'Unknown Location'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        {score !== null && score !== undefined ? (
                          <div className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5",
                            score >= 80 ? "bg-green-100 text-green-700 border border-green-200" :
                            score >= 50 ? "bg-amber-100 text-amber-700 border border-amber-200" :
                            "bg-red-100 text-red-700 border border-red-200"
                          )}>
                            <Sparkles className="w-3 h-3" />
                            {score}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic px-2">Unscored</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-xs">
                            {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between pb-24">
        <span className="text-sm text-slate-500 font-medium">
          Showing {leads.length} of {total.toLocaleString()} leads
        </span>
        <div className="flex items-center gap-2">
          <button 
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white transition-colors"
          >
            Previous
          </button>
          <button 
            disabled={page * 15 >= total}
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {/* Sticky Go-Ahead Button */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 right-8 z-50 animate-in slide-in-from-bottom-8 fade-in duration-300">
          <button
            onClick={handleGoAhead}
            className="group flex items-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold text-lg shadow-xl shadow-blue-500/30 transition-all hover:scale-105 hover:shadow-blue-500/40"
          >
            Go-Ahead
            <div className="bg-white/20 rounded-full p-1.5 group-hover:translate-x-1 transition-transform">
              <ArrowRight className="w-5 h-5" />
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
