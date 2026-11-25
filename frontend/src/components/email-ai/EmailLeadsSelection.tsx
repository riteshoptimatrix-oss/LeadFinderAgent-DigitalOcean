'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import {
  Search, MapPin, Building2, Phone, Mail, Globe, Sparkles,
  CheckSquare, Square, Loader2, ArrowRight, Filter, ChevronDown,
  SortAsc, Calendar, Tag, AlertCircle, Trash2, X, Check
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
  is_auto_lead?: boolean;
  source?: string;
  requested_provider?: string;
  auto_scraped_area?: string;
  area?: string;
}



function AreaMultiSelect({
  areas,
  selectedAreas,
  onChange,
  className
}: {
  areas: { area: string; count: number }[];
  selectedAreas: string[];
  onChange: (areas: string[]) => void;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalAllLeads = useMemo(
    () => areas.reduce((sum, a) => sum + (a.count || 0), 0),
    [areas]
  );

  const selectedCount = selectedAreas.length;

  const totalSelectedLeads = useMemo(
    () =>
      areas
        .filter(a => selectedAreas.includes(a.area))
        .reduce((sum, a) => sum + (a.count || 0), 0),
    [areas, selectedAreas]
  );

  const filteredAreas = useMemo(
    () =>
      areas.filter(a =>
        a.area.toLowerCase().includes(search.toLowerCase())
      ),
    [areas, search]
  );

  const toggleArea = (area: string) => {
    if (selectedAreas.includes(area)) {
      onChange(selectedAreas.filter(a => a !== area));
    } else {
      onChange([...selectedAreas, area]);
    }
  };

  const selectAllFiltered = () => {
    const allFilteredNames = filteredAreas.map(a => a.area);
    const combined = Array.from(new Set([...selectedAreas, ...allFilteredNames]));
    onChange(combined);
  };

  const clearSelection = () => {
    onChange([]);
  };

  return (
    <div className={cn("relative inline-block", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "px-3.5 py-2.5 bg-teal-50 border border-teal-300 rounded-xl text-sm font-semibold text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 cursor-pointer shadow-xs transition-all flex items-center justify-between gap-2 min-w-[200px] max-w-[340px]",
          isOpen && "ring-2 ring-teal-500/30 border-teal-400"
        )}
        title="Filter by Multiple Areas / Localities"
      >
        <span className="truncate flex items-center gap-1.5 text-xs sm:text-sm">
          <span>📍</span>
          {selectedCount === 0 && (
            <span>All Areas ({totalAllLeads.toLocaleString()} leads)</span>
          )}
          {selectedCount === 1 && (
            <span>{selectedAreas[0]} ({totalSelectedLeads.toLocaleString()} leads)</span>
          )}
          {selectedCount > 1 && (
            <span>{selectedCount} Areas Selected ({totalSelectedLeads.toLocaleString()} leads)</span>
          )}
        </span>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {selectedCount > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                clearSelection();
              }}
              className="p-0.5 rounded-full hover:bg-teal-200/60 text-teal-700 hover:text-teal-900 transition-colors"
              title="Clear area filter"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-4 h-4 text-teal-600 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search Bar */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search areas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200/60 text-[11px] font-semibold">
              <span className="text-slate-500">
                {selectedCount} of {areas.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-teal-600 hover:text-teal-700 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={selectedCount === 0}
                  className="text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:hover:no-underline hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* List of Areas */}
          <div className="max-h-60 overflow-y-auto p-1 divide-y divide-slate-50">
            {filteredAreas.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No matching areas found
              </div>
            ) : (
              filteredAreas.map((a) => {
                const isChecked = selectedAreas.includes(a.area);
                return (
                  <div
                    key={a.area}
                    onClick={() => toggleArea(a.area)}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs select-none",
                      isChecked
                        ? "bg-teal-50/70 text-teal-950 font-semibold"
                        : "hover:bg-slate-50 text-slate-700"
                    )}
                  >
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <div
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0",
                          isChecked
                            ? "bg-teal-600 border-teal-600 text-white"
                            : "border-slate-300 bg-white"
                        )}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="truncate">📍 {a.area}</span>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium",
                        isChecked
                          ? "bg-teal-100/80 text-teal-800"
                          : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {a.count.toLocaleString()} leads
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignMultiSelect({
  campaigns,
  selectedJobIds,
  onChange,
  className
}: {
  campaigns: any[];
  selectedJobIds: string[];
  onChange: (jobIds: string[]) => void;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalAllLeads = useMemo(
    () => campaigns.reduce((sum, c) => sum + (c.total_saved ?? c.leads_count ?? 0), 0),
    [campaigns]
  );

  const selectedCount = selectedJobIds.length;

  const totalSelectedLeads = useMemo(
    () =>
      campaigns
        .filter(c => selectedJobIds.includes(c.job_id || c.id))
        .reduce((sum, c) => sum + (c.total_saved ?? c.leads_count ?? 0), 0),
    [campaigns, selectedJobIds]
  );

  const filteredCampaigns = useMemo(() => {
    const q = search.toLowerCase();
    return campaigns.filter(c => {
      const loc = [c.city, c.state].filter(Boolean).join(', ').toLowerCase();
      const kw = (c.keyword || '').toLowerCase();
      return kw.includes(q) || loc.includes(q);
    });
  }, [campaigns, search]);

  const toggleCampaign = (id: string) => {
    if (selectedJobIds.includes(id)) {
      onChange(selectedJobIds.filter(x => x !== id));
    } else {
      onChange([...selectedJobIds, id]);
    }
  };

  const selectAllFiltered = () => {
    const allFilteredIds = filteredCampaigns.map(c => c.job_id || c.id);
    const combined = Array.from(new Set([...selectedJobIds, ...allFilteredIds]));
    onChange(combined);
  };

  const clearSelection = () => {
    onChange([]);
  };

  const firstSelectedName = useMemo(() => {
    if (selectedCount === 1) {
      const c = campaigns.find(item => (item.job_id || item.id) === selectedJobIds[0]);
      if (c) {
        const loc = [c.city, c.state].filter(Boolean).join(', ');
        return `${c.keyword || 'Search'}${loc ? ` • ${loc}` : ''}`;
      }
    }
    return '';
  }, [campaigns, selectedJobIds, selectedCount]);

  return (
    <div className={cn("relative inline-block", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "px-3.5 py-2.5 bg-teal-50 border border-teal-300 rounded-xl text-sm font-semibold text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 cursor-pointer shadow-xs transition-all flex items-center justify-between gap-2 min-w-[200px] max-w-[340px]",
          isOpen && "ring-2 ring-teal-500/30 border-teal-400"
        )}
        title="Filter by Multiple Search Campaigns"
      >
        <span className="truncate flex items-center gap-1.5 text-xs sm:text-sm">
          <span>📍</span>
          {selectedCount === 0 && (
            <span>All Search Campaigns ({campaigns.length})</span>
          )}
          {selectedCount === 1 && (
            <span className="truncate">{firstSelectedName || '1 Campaign'} ({totalSelectedLeads.toLocaleString()} leads)</span>
          )}
          {selectedCount > 1 && (
            <span>{selectedCount} Campaigns Selected ({totalSelectedLeads.toLocaleString()} leads)</span>
          )}
        </span>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {selectedCount > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                clearSelection();
              }}
              className="p-0.5 rounded-full hover:bg-teal-200/60 text-teal-700 hover:text-teal-900 transition-colors"
              title="Clear campaign filter"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-4 h-4 text-teal-600 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-80 sm:w-96 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search Bar */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search campaigns by keyword, city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-200/60 text-[11px] font-semibold">
              <span className="text-slate-500">
                {selectedCount} of {campaigns.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-teal-600 hover:text-teal-700 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={selectedCount === 0}
                  className="text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:hover:no-underline hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* List of Campaigns */}
          <div className="max-h-60 overflow-y-auto p-1 divide-y divide-slate-50">
            {filteredCampaigns.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No matching search campaigns found
              </div>
            ) : (
              filteredCampaigns.map((c) => {
                const cId = c.job_id || c.id;
                const isChecked = selectedJobIds.includes(cId);
                const count = c.total_saved ?? c.leads_count ?? 0;
                const loc = [c.city, c.state].filter(Boolean).join(', ');
                const label = `${c.keyword || 'Search'}${loc ? ` • ${loc}` : ''}`;

                return (
                  <div
                    key={cId}
                    onClick={() => toggleCampaign(cId)}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs select-none",
                      isChecked
                        ? "bg-teal-50/70 text-teal-950 font-semibold"
                        : "hover:bg-slate-50 text-slate-700"
                    )}
                  >
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <div
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0",
                          isChecked
                            ? "bg-teal-600 border-teal-600 text-white"
                            : "border-slate-300 bg-white"
                        )}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="truncate">📍 {label}</span>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium",
                        isChecked
                          ? "bg-teal-100/80 text-teal-800"
                          : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {count.toLocaleString()} leads
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AllSourcesMultiSelect({
  campaigns,
  areas,
  selectedJobIds,
  selectedAreas,
  onJobIdsChange,
  onAreasChange,
  className
}: {
  campaigns: any[];
  areas: { area: string; count: number }[];
  selectedJobIds: string[];
  selectedAreas: string[];
  onJobIdsChange: (ids: string[]) => void;
  onAreasChange: (areas: string[]) => void;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategoryTab, setActiveCategoryTab] = useState<'all' | 'campaigns' | 'areas'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalCampaignLeads = useMemo(
    () => campaigns.reduce((sum, c) => sum + (c.total_saved ?? c.leads_count ?? 0), 0),
    [campaigns]
  );
  const totalAreaLeads = useMemo(
    () => areas.reduce((sum, a) => sum + (a.count || 0), 0),
    [areas]
  );

  const selectedCampaignLeads = useMemo(
    () =>
      campaigns
        .filter(c => selectedJobIds.includes(c.job_id || c.id))
        .reduce((sum, c) => sum + (c.total_saved ?? c.leads_count ?? 0), 0),
    [campaigns, selectedJobIds]
  );
  const selectedAreaLeads = useMemo(
    () =>
      areas
        .filter(a => selectedAreas.includes(a.area))
        .reduce((sum, a) => sum + (a.count || 0), 0),
    [areas, selectedAreas]
  );

  const totalSelectedCount = selectedJobIds.length + selectedAreas.length;
  const totalSelectedLeads = selectedCampaignLeads + selectedAreaLeads;

  const filteredCampaigns = useMemo(() => {
    if (activeCategoryTab === 'areas') return [];
    const q = search.toLowerCase();
    return campaigns.filter(c => {
      const loc = [c.city, c.state].filter(Boolean).join(', ').toLowerCase();
      const kw = (c.keyword || '').toLowerCase();
      return kw.includes(q) || loc.includes(q);
    });
  }, [campaigns, search, activeCategoryTab]);

  const filteredAreas = useMemo(() => {
    if (activeCategoryTab === 'campaigns') return [];
    const q = search.toLowerCase();
    return areas.filter(a => a.area.toLowerCase().includes(q));
  }, [areas, search, activeCategoryTab]);

  const toggleCampaign = (id: string) => {
    if (selectedJobIds.includes(id)) {
      onJobIdsChange(selectedJobIds.filter(x => x !== id));
    } else {
      onJobIdsChange([...selectedJobIds, id]);
    }
  };

  const toggleArea = (area: string) => {
    if (selectedAreas.includes(area)) {
      onAreasChange(selectedAreas.filter(a => a !== area));
    } else {
      onAreasChange([...selectedAreas, area]);
    }
  };

  const selectAllVisible = () => {
    if (activeCategoryTab === 'all' || activeCategoryTab === 'campaigns') {
      const cIds = filteredCampaigns.map(c => c.job_id || c.id);
      onJobIdsChange(Array.from(new Set([...selectedJobIds, ...cIds])));
    }
    if (activeCategoryTab === 'all' || activeCategoryTab === 'areas') {
      const aNames = filteredAreas.map(a => a.area);
      onAreasChange(Array.from(new Set([...selectedAreas, ...aNames])));
    }
  };

  const clearAll = () => {
    onJobIdsChange([]);
    onAreasChange([]);
  };

  return (
    <div className={cn("relative inline-block", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "px-3.5 py-2.5 bg-teal-50 border border-teal-300 rounded-xl text-sm font-semibold text-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 cursor-pointer shadow-xs transition-all flex items-center justify-between gap-2 min-w-[200px] max-w-[340px]",
          isOpen && "ring-2 ring-teal-500/30 border-teal-400"
        )}
        title="Filter by Campaigns & Areas"
      >
        <span className="truncate flex items-center gap-1.5 text-xs sm:text-sm">
          <span>📍</span>
          {totalSelectedCount === 0 && (
            <span>All Sources ({campaigns.length + areas.length})</span>
          )}
          {totalSelectedCount === 1 && (
            <span>1 Filter Selected ({totalSelectedLeads.toLocaleString()} leads)</span>
          )}
          {totalSelectedCount > 1 && (
            <span>{totalSelectedCount} Sources Selected ({totalSelectedLeads.toLocaleString()} leads)</span>
          )}
        </span>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {totalSelectedCount > 0 && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
              className="p-0.5 rounded-full hover:bg-teal-200/60 text-teal-700 hover:text-teal-900 transition-colors"
              title="Clear all selected"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-4 h-4 text-teal-600 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-80 sm:w-96 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header & Tabs */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/60 space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search campaigns & areas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Source Category Tabs */}
            <div className="flex items-center gap-1 bg-slate-200/60 p-0.5 rounded-lg text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setActiveCategoryTab('all')}
                className={cn("flex-1 py-1 rounded-md transition-colors", activeCategoryTab === 'all' ? "bg-white text-teal-900 shadow-2xs" : "text-slate-600 hover:text-slate-900")}
              >
                All ({campaigns.length + areas.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveCategoryTab('campaigns')}
                className={cn("flex-1 py-1 rounded-md transition-colors", activeCategoryTab === 'campaigns' ? "bg-white text-teal-700 shadow-2xs" : "text-slate-600 hover:text-slate-900")}
              >
                Campaigns ({campaigns.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveCategoryTab('areas')}
                className={cn("flex-1 py-1 rounded-md transition-colors", activeCategoryTab === 'areas' ? "bg-white text-teal-700 shadow-2xs" : "text-slate-600 hover:text-slate-900")}
              >
                Areas ({areas.length})
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px] font-semibold">
              <span className="text-slate-500">
                {totalSelectedCount} selected ({totalSelectedLeads.toLocaleString()} leads)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="text-teal-600 hover:text-teal-700 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={totalSelectedCount === 0}
                  className="text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:hover:no-underline hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* List */}
          <div className="max-h-60 overflow-y-auto p-1 divide-y divide-slate-50">
            {filteredCampaigns.length === 0 && filteredAreas.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No matching campaigns or areas found
              </div>
            ) : (
              <>
                {/* Campaigns */}
                {filteredCampaigns.map((c) => {
                  const cId = c.job_id || c.id;
                  const isChecked = selectedJobIds.includes(cId);
                  const count = c.total_saved ?? c.leads_count ?? 0;
                  const loc = [c.city, c.state].filter(Boolean).join(', ');
                  const label = `${c.keyword || 'Search'}${loc ? ` • ${loc}` : ''}`;

                  return (
                    <div
                      key={`c-${cId}`}
                      onClick={() => toggleCampaign(cId)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs select-none",
                        isChecked ? "bg-teal-50/70 text-teal-950 font-semibold" : "hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <div className="flex items-center gap-2.5 truncate pr-2">
                        <div
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0",
                            isChecked ? "bg-teal-600 border-teal-600 text-white" : "border-slate-300 bg-white"
                          )}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="truncate">📍 {label}</span>
                      </div>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium", isChecked ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-500")}>
                        {count.toLocaleString()}
                      </span>
                    </div>
                  );
                })}

                {/* Areas */}
                {filteredAreas.map((a) => {
                  const isChecked = selectedAreas.includes(a.area);
                  return (
                    <div
                      key={`a-${a.area}`}
                      onClick={() => toggleArea(a.area)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs select-none",
                        isChecked ? "bg-teal-50/70 text-teal-950 font-semibold" : "hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <div className="flex items-center gap-2.5 truncate pr-2">
                        <div
                          className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0",
                            isChecked ? "bg-teal-600 border-teal-600 text-white" : "border-slate-300 bg-white"
                          )}
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="truncate">📍 {a.area}</span>
                      </div>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium", isChecked ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-500")}>
                        {a.count.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
    status: 'ALL',
    search_campaign: 'ALL' as 'ALL' | 'auto' | 'normal',
    selected_areas: [] as string[],
    selected_job_ids: [] as string[]
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
        if (parsed.filters) {
          const loadedAreas = Array.isArray(parsed.filters.selected_areas)
            ? parsed.filters.selected_areas
            : parsed.filters.selected_area
              ? [parsed.filters.selected_area]
              : [];
          const loadedJobs = Array.isArray(parsed.filters.selected_job_ids)
            ? parsed.filters.selected_job_ids
            : parsed.filters.selected_job_id
              ? [parsed.filters.selected_job_id]
              : [];
          setFilters(prev => ({
            ...prev,
            ...parsed.filters,
            selected_areas: loadedAreas,
            selected_job_ids: loadedJobs
          }));
        }
        if (parsed.sort) setSort(parsed.sort);
      }
    } catch (e) { }
  }, []);

  // Save persistent state
  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem('email_selected_leads', JSON.stringify(Array.from(selectedIds)));
    localStorage.setItem('email_leads_state', JSON.stringify({
      page, search: debouncedSearch, filters, sort
    }));
    window.dispatchEvent(new CustomEvent('email-ai-workflow-sync'));
  }, [selectedIds, page, debouncedSearch, filters, sort, isMounted]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const isAutoLeadParam =
    filters.search_campaign === 'auto'
      ? true
      : filters.search_campaign === 'normal'
        ? false
        : undefined;

  // Fetch distinct Auto Lead Areas for cascading dropdown
  const { data: autoAreas = [] } = useQuery({
    queryKey: ['autoLeadAreas'],
    queryFn: async () => {
      try {
        const res = await api.get('/leads/auto-areas');
        return (res.data || []) as { area: string; count: number }[];
      } catch {
        return [];
      }
    },
    staleTime: 30000,
    enabled: isMounted
  });

  // Fetch Normal Search Campaigns for cascading dropdown
  const { data: campaignOptions = [] } = useQuery({
    queryKey: ['searchCampaignOptions'],
    queryFn: async () => {
      try {
        const res = await api.get('/search/sessions?limit=50&sort_by=newest');
        return (res.data?.data || []) as any[];
      } catch {
        return [];
      }
    },
    staleTime: 30000,
    enabled: isMounted
  });

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
          is_auto_lead: isAutoLeadParam,
          area: (filters.search_campaign === 'auto' || filters.search_campaign === 'ALL') && filters.selected_areas.length > 0 ? filters.selected_areas.join(',') : undefined,
          job_id: (filters.search_campaign === 'normal' || filters.search_campaign === 'ALL') && filters.selected_job_ids.length > 0 ? filters.selected_job_ids.join(',') : undefined,
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

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
    toast.success('All leads deselected.');
  };

  const isAllSelected = total > 0 && selectedIds.size >= total;

  const handleSelectAllGlobally = async () => {
    if (isAllSelected) {
      handleDeselectAll();
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
          status: filters.status !== 'ALL' ? filters.status : undefined,
          is_auto_lead: isAutoLeadParam,
          area: (filters.search_campaign === 'auto' || filters.search_campaign === 'ALL') && filters.selected_areas.length > 0 ? filters.selected_areas.join(',') : undefined,
          job_id: (filters.search_campaign === 'normal' || filters.search_campaign === 'ALL') && filters.selected_job_ids.length > 0 ? filters.selected_job_ids.join(',') : undefined
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
      toast.error('Step 1 Required: Please select at least one targeted lead to proceed.');
      return;
    }
    localStorage.setItem('email_selected_leads', JSON.stringify(Array.from(selectedIds)));
    window.dispatchEvent(new CustomEvent('email-ai-workflow-sync'));
    toast.success(`Selected ${selectedIds.size.toLocaleString()} leads! Proceeding to Step 2: Choose Template.`);
    window.dispatchEvent(new CustomEvent('change-tab', { detail: 'templates' }));
  };

  if (!isMounted) return null;

  return (
    <div className="flex flex-col h-full animate-in fade-in">

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
          {selectedIds.size > 0 && (
            <button
              onClick={handleDeselectAll}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-600 rounded-xl text-sm font-semibold border border-slate-200 hover:border-red-200 transition-all shadow-xs cursor-pointer"
              title="Deselect all selected leads"
            >
              <X className="w-4 h-4" />
              Deselect All
            </button>
          )}
          <button
            onClick={isAllSelected ? handleDeselectAll : handleSelectAllGlobally}
            disabled={isSelectingAll || total === 0}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 shadow-xs cursor-pointer",
              isAllSelected
                ? "bg-slate-800 text-white hover:bg-slate-900"
                : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            {isSelectingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isAllSelected ? (
              <Square className="w-4 h-4" />
            ) : (
              <CheckSquare className="w-4 h-4" />
            )}
            {isAllSelected ? 'Deselect All' : 'Select All Leads'}
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

          {/* Search Campaign Filter */}
          <select
            value={filters.search_campaign}
            onChange={(e) => {
              const val = e.target.value as any;
              setFilters({ ...filters, search_campaign: val, selected_areas: [], selected_job_ids: [] });
              setPage(1);
            }}
            className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-700 cursor-pointer shadow-xs"
            title="Filter by Search Campaign"
          >
            <option value="ALL">Search Campaign: All Leads</option>
            <option value="auto">Auto Lead (LeadFinderAgent)</option>
            <option value="normal">Normal Lead (Manual / Regular)</option>
          </select>

          {/* Cascading Filter for All Leads (Campaigns & Areas) */}
          {filters.search_campaign === 'ALL' && (
            <AllSourcesMultiSelect
              campaigns={campaignOptions}
              areas={autoAreas}
              selectedJobIds={filters.selected_job_ids}
              selectedAreas={filters.selected_areas}
              onJobIdsChange={(ids) => {
                setFilters(prev => ({ ...prev, selected_job_ids: ids }));
                setPage(1);
              }}
              onAreasChange={(newAreas) => {
                setFilters(prev => ({ ...prev, selected_areas: newAreas }));
                setPage(1);
              }}
            />
          )}

          {/* Cascading Multi-Select Area Filter (Auto Leads) */}
          {filters.search_campaign === 'auto' && (
            <AreaMultiSelect
              areas={autoAreas}
              selectedAreas={filters.selected_areas}
              onChange={(newAreas) => {
                setFilters({ ...filters, selected_areas: newAreas });
                setPage(1);
              }}
            />
          )}

          {/* Cascading Multi-Select Campaign Filter (Normal Leads) */}
          {filters.search_campaign === 'normal' && (
            <CampaignMultiSelect
              campaigns={campaignOptions}
              selectedJobIds={filters.selected_job_ids}
              onChange={(newJobIds) => {
                setFilters({ ...filters, selected_job_ids: newJobIds });
                setPage(1);
              }}
            />
          )}

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition-colors",
              showFilters || Object.entries(filters).some(([k, v]) =>
                (k === 'selected_areas' || k === 'selected_job_ids')
                  ? (v as string[]).length > 0
                  : v !== '' && v !== undefined && v !== 'ALL'
              )
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
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Search Campaign</label>
              <select
                value={filters.search_campaign}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setFilters({ ...filters, search_campaign: val, selected_areas: [], selected_job_ids: [] });
                  setPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">All Leads</option>
                <option value="auto">Auto Lead (LeadFinderAgent)</option>
                <option value="normal">Normal Lead (Manual / Regular)</option>
              </select>
            </div>
            {filters.search_campaign === 'ALL' ? (
              <div>
                <label className="text-xs font-semibold text-teal-700 mb-1.5 block">Sources (Multi-Select)</label>
                <AllSourcesMultiSelect
                  campaigns={campaignOptions}
                  areas={autoAreas}
                  selectedJobIds={filters.selected_job_ids}
                  selectedAreas={filters.selected_areas}
                  onJobIdsChange={(ids) => {
                    setFilters(prev => ({ ...prev, selected_job_ids: ids }));
                    setPage(1);
                  }}
                  onAreasChange={(newAreas) => {
                    setFilters(prev => ({ ...prev, selected_areas: newAreas }));
                    setPage(1);
                  }}
                  className="w-full"
                />
              </div>
            ) : filters.search_campaign === 'auto' ? (
              <div>
                <label className="text-xs font-semibold text-teal-700 mb-1.5 block">Area / Locality (Multi-Select)</label>
                <AreaMultiSelect
                  areas={autoAreas}
                  selectedAreas={filters.selected_areas}
                  onChange={(newAreas) => {
                    setFilters({ ...filters, selected_areas: newAreas });
                    setPage(1);
                  }}
                  className="w-full"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold text-teal-700 mb-1.5 block">Campaigns (Multi-Select)</label>
                <CampaignMultiSelect
                  campaigns={campaignOptions}
                  selectedJobIds={filters.selected_job_ids}
                  onChange={(newJobIds) => {
                    setFilters({ ...filters, selected_job_ids: newJobIds });
                    setPage(1);
                  }}
                  className="w-full"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Category / Industry</label>
              <input
                type="text"
                placeholder="e.g. Software, Plumber..."
                value={filters.category}
                onChange={(e) => { setFilters({ ...filters, category: e.target.value }); setPage(1); }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">City</label>
              <input
                type="text"
                placeholder="e.g. New York, London..."
                value={filters.city}
                onChange={(e) => { setFilters({ ...filters, city: e.target.value }); setPage(1); }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Contact Info Available</label>
              <select
                value={filters.has_email === undefined ? "" : filters.has_email.toString()}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilters({ ...filters, has_email: val === "" ? undefined : val === "true" });
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
                onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}
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
                  <button
                    onClick={handleSelectAllOnPage}
                    className="text-slate-400 hover:text-blue-500 transition-colors cursor-pointer"
                    title={leads.length > 0 && leads.every(l => selectedIds.has(l._id)) ? "Deselect leads on this page" : "Select all leads on this page"}
                  >
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
                          setFilters({ city: '', category: '', has_website: undefined, has_phone: undefined, has_email: undefined, min_rating: undefined, status: 'ALL', search_campaign: 'ALL', selected_areas: [], selected_job_ids: [] });
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
                          <div className="flex items-center gap-1.5 mt-1">
                            {(lead.is_auto_lead || lead.source === 'auto_leadfinder' || lead.requested_provider === 'Auto LeadFinder') ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 border border-teal-200 text-teal-700 shrink-0">
                                # Auto Lead
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 border border-teal-200 text-teal-700 shrink-0">
                                # Normal Lead
                              </span>
                            )}
                            {lead.status && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                • {lead.status}
                              </span>
                            )}
                          </div>
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
                              {[lead.auto_scraped_area || lead.area, lead.city, lead.state, lead.country].filter(Boolean).join(', ') || 'Unknown Location'}
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
