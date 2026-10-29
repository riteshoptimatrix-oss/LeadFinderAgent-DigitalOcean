'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { Search, MapPin, Building2, Phone, Mail, Globe, Sparkles, CheckSquare, Square, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { useRouter } from 'next/navigation';

interface Lead {
  _id: string;
  business_name: string;
  phone: string;
  primary_phone?: string;
  all_phones?: string[];
  whatsapp_number: string;
  email: string;
  primary_email?: string;
  all_emails?: string[];
  website: string;
  ai_score: number;
  category: string;
  country: string;
  state: string;
  city: string;
}

const STEPS = [
  { id: 1, label: 'Select Leads', active: true },
  { id: 2, label: 'AI Templates', active: false },
  { id: 3, label: 'Campaign Wizard', active: false },
  { id: 4, label: 'Live Campaign', active: false },
];

export default function LeadsSelection() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem('wa_selected_leads');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setSelectedIds(new Set(parsed));
        }
      } catch (e) {
        // Ignore parse error
      }
    }
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('wa_selected_leads', JSON.stringify(Array.from(selectedIds)));
    }
  }, [selectedIds, isMounted]);

  const { data, isLoading } = useQuery({
    queryKey: ['wa-ai-leads', page, search],
    queryFn: async () => {
      const res = await api.get('/whatsapp-ai/leads', {
        params: { page, limit: 10, search }
      });
      return res.data;
    }
  });

  const leads: Lead[] = data?.leads || [];
  const total = data?.total || 0;

  const handleSelectAll = () => {
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
      const res = await api.get('/whatsapp-ai/leads/select-all', {
        params: { search }
      });
      const allIds = res.data.ids || [];
      setSelectedIds(new Set(allIds));
      toast.success('All available leads selected successfully.');
    } catch (error) {
      toast.error('Failed to select all leads.');
    } finally {
      setIsSelectingAll(false);
    }
  };

  const handleGoAhead = () => {
    if (selectedIds.size === 0) {
      toast.error('Please select at least one lead.');
      return;
    }
    router.push('/dashboard/whatsapp-ai/templates');
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
          <h2 className="text-xl font-bold text-slate-900">Select Target Leads</h2>
          <p className="text-slate-500 text-sm mt-1">Choose the audience for your next campaign</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-64 shadow-sm"
            />
          </div>
          <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold border border-blue-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            Selected {selectedIds.size} / {total}
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
          
          {selectedIds.size > 0 && (
            <button
              onClick={handleGoAhead}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-500/30 animate-in slide-in-from-right-4 fade-in"
            >
              Go-Ahead
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50/50 rounded-2xl border border-slate-200">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-white sticky top-0 z-10 border-b border-slate-200 shadow-sm">
            <tr>
              <th className="p-4 w-12">
                <button onClick={handleSelectAll} className="text-slate-400 hover:text-blue-500 transition-colors">
                  {leads.length > 0 && leads.every(l => selectedIds.has(l._id)) ? (
                    <CheckSquare className="w-5 h-5 text-blue-500" />
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>
              </th>
              <th className="p-4 font-semibold text-slate-900">Business Details</th>
              <th className="p-4 font-semibold text-slate-900">Contact</th>
              <th className="p-4 font-semibold text-slate-900">Location</th>
              <th className="p-4 font-semibold text-slate-900">AI Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="p-4"><div className="w-5 h-5 bg-slate-200 rounded"></div></td>
                  <td className="p-4"><div className="h-10 bg-slate-200 rounded-lg w-3/4"></div></td>
                  <td className="p-4"><div className="h-10 bg-slate-200 rounded-lg w-1/2"></div></td>
                  <td className="p-4"><div className="h-10 bg-slate-200 rounded-lg w-1/2"></div></td>
                  <td className="p-4"><div className="h-10 bg-slate-200 rounded-lg w-1/4"></div></td>
                </tr>
              ))
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-slate-500">
                  No leads found.
                </td>
              </tr>
            ) : (
              leads.map((lead) => {
                const isSelected = selectedIds.has(lead._id);
                return (
                  <tr 
                    key={lead._id} 
                    className={cn(
                      "transition-colors hover:bg-slate-50 cursor-pointer",
                      isSelected ? "bg-blue-50/50 hover:bg-blue-50/80" : ""
                    )}
                    onClick={() => toggleSelect(lead._id)}
                  >
                    <td className="p-4">
                      <button className={cn("transition-colors", isSelected ? "text-blue-500" : "text-slate-300 hover:text-slate-400")}>
                        {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                      </button>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          {lead.business_name}
                        </span>
                        <span className="text-xs text-slate-500 mt-1">{lead.category || 'Uncategorized'}</span>
                      </div>
                    </td>
                    <td className="p-4 space-y-1">
                      <div className="flex items-center gap-2 text-slate-600 group relative">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{lead.whatsapp_number || lead.primary_phone || lead.all_phones?.[0] || lead.phone || 'N/A'}</span>
                        {lead.all_phones && lead.all_phones.length > 1 && (
                          <>
                            <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded cursor-help">
                              +{lead.all_phones.length - 1}
                            </span>
                            <div className="hidden group-hover:block absolute left-0 top-full mt-1 bg-slate-800 text-white text-xs rounded p-2 z-50 whitespace-nowrap shadow-lg">
                              <div className="font-semibold text-slate-300 mb-1 border-b border-slate-600 pb-1">All Numbers</div>
                              <div className="flex flex-col gap-1">
                                {lead.all_phones.map((p, idx) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <Phone className="w-3 h-3 text-slate-400" />
                                    {p}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[150px]">{lead.primary_email || lead.all_emails?.[0] || lead.email || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-600">
                        <Globe className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[150px]">{lead.website || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-600">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        {[lead.city, lead.state, lead.country].filter(Boolean).join(', ') || 'Unknown Location'}
                      </div>
                    </td>
                    <td className="p-4">
                      {lead.ai_score !== undefined && lead.ai_score !== null ? (
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5",
                            lead.ai_score >= 80 ? "bg-green-100 text-green-700 border border-green-200" :
                            lead.ai_score >= 50 ? "bg-amber-100 text-amber-700 border border-amber-200" :
                            "bg-red-100 text-red-700 border border-red-200"
                          )}>
                            <Sparkles className="w-3 h-3" />
                            {lead.ai_score}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Not Scored</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-slate-500">
          Showing {leads.length} of {total} leads
        </span>
        <div className="flex items-center gap-2">
          <button 
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white"
          >
            Previous
          </button>
          <button 
            disabled={leads.length < 10}
            onClick={() => setPage(p => p + 1)}
            className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed bg-white"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

