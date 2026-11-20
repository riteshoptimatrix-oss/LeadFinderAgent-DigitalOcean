'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  ChevronDown,
  LayoutGrid,
  Settings,
  Shield,
  LogOut,
  Phone,
  Mail,
  Menu,
  Users,
  History,
  Sparkles,
  X,
  Loader2,
  ArrowRight,
  Building2,
  MapPin,
  Compass,
  Globe
} from 'lucide-react';
import { useAuthStore } from '@/src/features/auth/store';
import { useSidebarStore } from '@/src/lib/sidebarStore';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { cn } from '@/src/lib/utils';

// Authentic WhatsApp SVG Icon (Bootstrap Icons bi-whatsapp)
function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
    >
      <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232" />
    </svg>
  );
}

interface SearchLeadItem {
  id?: string;
  _id?: string;
  name?: string;
  category?: string;
  city?: string;
  state?: string;
  phone?: string;
  primary_phone?: string;
  email?: string;
  status?: string;
  google_rating?: number;
}

interface QuickNavItem {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
  keywords: string[];
}

const QUICK_NAV_ITEMS: QuickNavItem[] = [
  {
    title: 'Leads Database',
    description: 'Inspect verified CRM leads & contact records',
    href: '/dashboard/leads',
    icon: Users,
    category: 'Leads',
    keywords: ['leads', 'contacts', 'database', 'crm', 'companies', 'prospects', 'all leads']
  },
  {
    title: 'Search & Scrape Leads',
    description: 'Autonomous Google Maps extraction',
    href: '/dashboard/search',
    icon: Search,
    category: 'Scraper',
    keywords: ['search', 'scrape', 'maps', 'extractor', 'finder', 'new search', 'google']
  },
  {
    title: 'Search History',
    description: 'Review past extraction runs and session stats',
    href: '/dashboard/search/history',
    icon: History,
    category: 'Scraper',
    keywords: ['history', 'runs', 'past', 'sessions', 'logs', 'previous']
  },
  {
    title: 'WhatsApp AI Agent',
    description: 'Automated messaging, follow-ups & campaigns',
    href: '/dashboard/whatsapp-ai',
    icon: WhatsAppIcon,
    category: 'AI Agents',
    keywords: ['whatsapp', 'wa', 'chat', 'message', 'messages', 'outreach', 'campaign']
  },
  {
    title: 'Calling Voice AI',
    description: 'Autonomous AI phone calls & voice qualification',
    href: '/dashboard/calling-ai',
    icon: Phone,
    category: 'AI Agents',
    keywords: ['call', 'voice', 'calling', 'phone', 'dialer', 'telephony']
  },
  {
    title: 'Email AI Agent',
    description: 'Cold email generation & delivery sequences',
    href: '/dashboard/email-ai',
    icon: Mail,
    category: 'AI Agents',
    keywords: ['email', 'mail', 'sequence', 'cold email', 'inbox']
  },
  {
    title: 'AI Content Generation',
    description: 'AI copywriting, scripts, and content templates',
    href: '/dashboard/ai-content',
    icon: Sparkles,
    category: 'AI Tools',
    keywords: ['content', 'copy', 'ai content', 'copywriting', 'generate', 'text']
  },
  {
    title: 'CRM Pipeline',
    description: 'Manage sales stages, opportunities, and deals',
    href: '/dashboard/crm',
    icon: LayoutGrid,
    category: 'Management',
    keywords: ['crm', 'pipeline', 'deals', 'stages', 'sales']
  },
  {
    title: 'Settings',
    description: 'Account settings, API keys, and security',
    href: '/dashboard/settings',
    icon: Settings,
    category: 'System',
    keywords: ['settings', 'config', 'profile', 'keys', 'account', 'security']
  },
];

export default function Navbar() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const {
    toggleCollapse,
    toggleMobile
  } = useSidebarStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchLeadItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const addLeadRef = useRef<HTMLDivElement>(null);
  const appsRef = useRef<HTMLDivElement>(null);

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      try {
        const res = await api.get('/users/me');
        return res.data;
      } catch {
        return null;
      }
    },
    refetchOnWindowFocus: false,
  });

  // Debounced Live Lead Search from API
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/leads', {
          params: { search: trimmed, limit: 5 }
        });
        const items = res.data?.data || res.data || [];
        setSearchResults(Array.isArray(items) ? items : []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filter Quick Nav items by search query
  const filteredNavItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return QUICK_NAV_ITEMS.slice(0, 5);
    }
    return QUICK_NAV_ITEMS.filter((item) => {
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.includes(q))
      );
    }).slice(0, 4);
  }, [searchQuery]);

  // Combined flat list for keyboard arrow navigation
  const selectableItems = useMemo(() => {
    const list: Array<{ type: 'lead' | 'nav' | 'action'; id: string; href: string; title: string }> = [];

    // 1. Leads
    searchResults.forEach((lead, i) => {
      const id = String(lead.id || lead._id || `lead-${i}`);
      list.push({
        type: 'lead',
        id: `lead-${id}`,
        href: `/dashboard/leads/detail?id=${id}`,
        title: lead.name || 'Lead'
      });
    });

    // 2. Nav items
    filteredNavItems.forEach((nav) => {
      list.push({
        type: 'nav',
        id: `nav-${nav.href}`,
        href: nav.href,
        title: nav.title
      });
    });

    // 3. Actions (when searchQuery is non-empty)
    const trimmed = searchQuery.trim();
    if (trimmed) {
      list.push({
        type: 'action',
        id: 'action-search-leads',
        href: `/dashboard/leads?search=${encodeURIComponent(trimmed)}`,
        title: `Search leads for "${trimmed}"`
      });
      list.push({
        type: 'action',
        id: 'action-scrape-leads',
        href: `/dashboard/search?keyword=${encodeURIComponent(trimmed)}`,
        title: `Start new scrape for "${trimmed}"`
      });
    }

    return list;
  }, [searchResults, filteredNavItems, searchQuery]);

  // Keyboard shortcut Ctrl+K / Cmd+K to focus search input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle outside clicks to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setDropdownOpen(false);
      }
      if (addLeadRef.current && !addLeadRef.current.contains(target)) {
        setAddLeadOpen(false);
      }
      if (appsRef.current && !appsRef.current.contains(target)) {
        setAppsOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setIsSearchOpen(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectRoute = (href: string) => {
    setIsSearchOpen(false);
    searchInputRef.current?.blur();
    setHighlightedIndex(-1);
    router.push(href);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (highlightedIndex >= 0 && highlightedIndex < selectableItems.length) {
      handleSelectRoute(selectableItems[highlightedIndex].href);
      return;
    }
    setIsSearchOpen(false);
    searchInputRef.current?.blur();
    setHighlightedIndex(-1);
    const trimmed = searchQuery.trim();
    if (trimmed) {
      router.push(`/dashboard/leads?search=${encodeURIComponent(trimmed)}`);
    } else {
      router.push('/dashboard/leads');
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsSearchOpen(true);
      setHighlightedIndex((prev) => {
        if (selectableItems.length === 0) return -1;
        return prev < selectableItems.length - 1 ? prev + 1 : 0;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsSearchOpen(true);
      setHighlightedIndex((prev) => {
        if (selectableItems.length === 0) return -1;
        return prev > 0 ? prev - 1 : selectableItems.length - 1;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < selectableItems.length) {
        handleSelectRoute(selectableItems[highlightedIndex].href);
      } else {
        handleSearchSubmit(e);
      }
    } else if (e.key === 'Escape') {
      setIsSearchOpen(false);
      searchInputRef.current?.blur();
      setHighlightedIndex(-1);
    }
  };

  const handleMenuToggle = () => {
    if (window.innerWidth < 1024) {
      toggleMobile();
    } else {
      toggleCollapse();
    }
  };

  const displayEmail = userProfile?.email || user?.email || 'info@optiinfo.com';
  const displayRole = userProfile?.role || user?.role || 'User';
  const initialLetter = (displayEmail[0] || 'N').toUpperCase();
  const userRole = (userProfile?.role || user?.role || '')?.toLowerCase();
  const isAdmin = userRole === 'admin' || userProfile?.is_superuser === true;

  return (
    <header className="h-[70px] border-b border-slate-100 bg-white/95 backdrop-blur-md sticky top-0 z-40 transition-colors px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 sm:gap-4 select-none">

      {/* ======================================================== */}
      {/* 1. LEFT SECTION: Hamburger Toggle */}
      {/* ======================================================== */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={handleMenuToggle}
          aria-label="Toggle Navigation Menu"
          title="Toggle Navigation Menu"
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-50/80 hover:bg-slate-100/90 border border-slate-200/80 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-all duration-200 shadow-xs cursor-pointer active:scale-95 shrink-0"
        >
          <Menu className="w-4 h-4 sm:w-[18px] sm:h-[18px]" strokeWidth={2.2} />
        </button>
      </div>

      {/* ======================================================== */}
      {/* 2. CENTER SECTION: Global Search with Live Dropdown */}
      {/* ======================================================== */}
      <div className="flex-1 max-w-[500px] min-w-0 mx-1 sm:mx-2 relative" ref={searchContainerRef}>
        <form onSubmit={handleSearchSubmit} className="relative w-full">
          <div className="relative flex items-center">
            {isSearching ? (
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin absolute left-3.5 pointer-events-none" />
            ) : (
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            )}
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onFocus={() => setIsSearchOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
                setHighlightedIndex(-1);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Search leads, contacts, tools, pages..."
              className={cn(
                "w-full bg-slate-50/90 hover:bg-slate-50 focus:bg-white border border-slate-200/80 rounded-xl pl-10 text-[13px] sm:text-[13.5px] text-slate-800 placeholder:text-slate-400 placeholder:text-[12.5px] sm:placeholder:text-[13px] outline-none transition-all shadow-xs py-2 sm:py-2.5",
                searchQuery.length > 0 ? "pr-10" : "pr-16 sm:pr-20",
                isSearchOpen ? "border-blue-500 ring-2 ring-blue-500/10 bg-white" : "focus:border-blue-500"
              )}
            />

            {/* Clear button (X) when search text is present, or Ctrl+K shortcut badge */}
            {searchQuery.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setHighlightedIndex(-1);
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2.5 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="absolute right-2.5 flex items-center gap-1 pointer-events-none">
                <span className="text-[10.5px] font-semibold text-slate-400 bg-white/90 border border-slate-200/90 rounded-md px-1.5 py-0.5 shadow-2xs">
                  Ctrl
                </span>
                <span className="text-[10.5px] font-semibold text-slate-400 bg-white/90 border border-slate-200/90 rounded-md px-1.5 py-0.5 shadow-2xs">
                  K
                </span>
              </div>
            )}
          </div>
        </form>

        {/* Global Search Interactive Dropdown */}
        {isSearchOpen && (
          <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200/90 rounded-2xl shadow-2xl overflow-hidden z-50 text-left animate-in fade-in zoom-in-95 duration-100">
            <div className="max-h-[460px] overflow-y-auto divide-y divide-slate-100">

              {/* 1. MATCHING LEADS SECTION */}
              {searchResults.length > 0 && (
                <div className="py-1">
                  <div className="px-3.5 py-1.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-500" /> Matching Leads ({searchResults.length})
                    </span>
                    <span className="text-[10.5px] text-slate-400">Click to view details</span>
                  </div>
                  <div className="p-1 space-y-0.5">
                    {searchResults.map((lead, idx) => {
                      const leadId = lead.id || lead._id || '';
                      const isHighlighted = highlightedIndex === idx;
                      const category = lead.category || '';
                      const location = [lead.city, lead.state].filter(Boolean).join(', ');
                      const phone = lead.phone || lead.primary_phone || '';
                      return (
                        <div
                          key={`lead-${leadId || idx}`}
                          onMouseEnter={() => setHighlightedIndex(idx)}
                          onClick={() => handleSelectRoute(`/dashboard/leads/detail?id=${leadId}`)}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 rounded-xl text-left cursor-pointer transition-colors group",
                            isHighlighted ? "bg-blue-50 text-blue-900" : "hover:bg-slate-50 text-slate-800"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold transition-transform group-hover:scale-105",
                              isHighlighted ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                            )}>
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold truncate text-slate-900">
                                  {lead.name || 'Unnamed Business'}
                                </span>
                                {lead.google_rating ? (
                                  <span className="text-[10.5px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded shrink-0">
                                    ★ {lead.google_rating}
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-slate-400 truncate mt-0.5">
                                {category && <span className="font-medium text-slate-500">{category}</span>}
                                {category && (location || phone) && <span>•</span>}
                                {location && (
                                  <span className="flex items-center gap-0.5">
                                    <MapPin className="w-3 h-3 text-slate-400 inline shrink-0" /> {location}
                                  </span>
                                )}
                                {location && phone && <span>•</span>}
                                {phone && <span>{phone}</span>}
                              </div>
                            </div>
                          </div>
                          <ArrowRight className={cn(
                            "w-4 h-4 shrink-0 transition-transform",
                            isHighlighted ? "text-blue-600 translate-x-0.5" : "text-slate-300 opacity-0 group-hover:opacity-100"
                          )} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. PAGES & QUICK NAVIGATION SECTION */}
              {filteredNavItems.length > 0 && (
                <div className="py-1">
                  <div className="px-3.5 py-1.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-indigo-500" /> {searchQuery.trim() ? 'Pages & Tools' : 'Quick Navigation'}
                    </span>
                  </div>
                  <div className="p-1 space-y-0.5">
                    {filteredNavItems.map((nav, j) => {
                      const itemIndex = searchResults.length + j;
                      const isHighlighted = highlightedIndex === itemIndex;
                      const IconComp = nav.icon;
                      return (
                        <div
                          key={`nav-${nav.href}`}
                          onMouseEnter={() => setHighlightedIndex(itemIndex)}
                          onClick={() => handleSelectRoute(nav.href)}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 rounded-xl text-left cursor-pointer transition-colors group",
                            isHighlighted ? "bg-indigo-50/80 text-indigo-950" : "hover:bg-slate-50 text-slate-800"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                              isHighlighted ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600"
                            )}>
                              <IconComp className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold text-slate-900 truncate">
                                  {nav.title}
                                </span>
                                <span className="text-[10px] uppercase font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                                  {nav.category}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                                {nav.description}
                              </span>
                            </div>
                          </div>
                          <ArrowRight className={cn(
                            "w-4 h-4 shrink-0 transition-transform",
                            isHighlighted ? "text-indigo-600 translate-x-0.5" : "text-slate-300 opacity-0 group-hover:opacity-100"
                          )} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. SEARCH ACTIONS SECTION (When query typed) */}
              {searchQuery.trim() && (
                <div className="py-1">
                  <div className="px-3.5 py-1.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-emerald-500" /> Search Actions
                    </span>
                  </div>
                  <div className="p-1 space-y-0.5">
                    {/* Action 1: Search in leads database */}
                    {(() => {
                      const actIdx = searchResults.length + filteredNavItems.length;
                      const isHighlighted = highlightedIndex === actIdx;
                      return (
                        <div
                          onMouseEnter={() => setHighlightedIndex(actIdx)}
                          onClick={() => handleSelectRoute(`/dashboard/leads?search=${encodeURIComponent(searchQuery.trim())}`)}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 rounded-xl text-left cursor-pointer transition-colors group",
                            isHighlighted ? "bg-blue-50 text-blue-900" : "hover:bg-slate-50 text-slate-800"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                              isHighlighted ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"
                            )}>
                              <Search className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-[13px] font-semibold text-slate-900 block truncate">
                                Search all leads for &ldquo;{searchQuery.trim()}&rdquo;
                              </span>
                              <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                                Open full CRM database filtered by this query
                              </span>
                            </div>
                          </div>
                          <span className="text-[11px] font-medium text-blue-600 shrink-0">Press Enter ↵</span>
                        </div>
                      );
                    })()}

                    {/* Action 2: Scrape Google Maps */}
                    {(() => {
                      const actIdx = searchResults.length + filteredNavItems.length + 1;
                      const isHighlighted = highlightedIndex === actIdx;
                      return (
                        <div
                          onMouseEnter={() => setHighlightedIndex(actIdx)}
                          onClick={() => handleSelectRoute(`/dashboard/search?keyword=${encodeURIComponent(searchQuery.trim())}`)}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 rounded-xl text-left cursor-pointer transition-colors group",
                            isHighlighted ? "bg-emerald-50 text-emerald-900" : "hover:bg-slate-50 text-slate-800"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                              isHighlighted ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-600"
                            )}>
                              <Globe className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="text-[13px] font-semibold text-slate-900 block truncate">
                                Start new scraper search for &ldquo;{searchQuery.trim()}&rdquo;
                              </span>
                              <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                                Launch automated Google Maps lead finder with this keyword
                              </span>
                            </div>
                          </div>
                          <ArrowRight className={cn(
                            "w-4 h-4 shrink-0 transition-transform",
                            isHighlighted ? "text-emerald-600 translate-x-0.5" : "text-slate-300 opacity-0 group-hover:opacity-100"
                          )} />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* 4. EMPTY STATE */}
              {searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && filteredNavItems.length === 0 && (
                <div className="p-6 text-center">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                    <Search className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">No direct matches for &ldquo;{searchQuery}&rdquo;</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    You can search across all leads in the database or extract new ones from Google Maps.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectRoute(`/dashboard/leads?search=${encodeURIComponent(searchQuery.trim())}`)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      Search Leads Database
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectRoute(`/dashboard/search?keyword=${encodeURIComponent(searchQuery.trim())}`)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Scrape Google Maps
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* 5. FOOTER HELPER BAR */}
            <div className="px-3.5 py-2 bg-slate-50/90 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono shadow-2xs">↑</kbd>
                  <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono shadow-2xs">↓</kbd>
                  <span>Navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono shadow-2xs">↵</kbd>
                  <span>Select</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono shadow-2xs">Esc</kbd>
                  <span>Close</span>
                </span>
              </div>
              <span className="text-[10.5px] font-medium text-slate-400">OptiMatrix Search</span>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 3. RIGHT SECTION: Add Lead + 3 AI Buttons + Bell + Grid + User */}
      {/* ======================================================== */}
      <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">

        {/* "+ Add Lead" Button with Dropdown Options */}
        <div className="relative" ref={addLeadRef}>
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setAddLeadOpen((prev) => !prev)}
              className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-[13px] sm:text-[13.5px] rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 flex items-center gap-1.5 shadow-xs transition-all duration-200 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden xs:inline">Add Lead</span>
              <ChevronDown className={cn("w-3.5 h-3.5 opacity-90 transition-transform duration-200", addLeadOpen && "rotate-180")} />
            </button>
          </div>

          {/* Add Lead Dropdown */}
          {addLeadOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-100 rounded-2xl shadow-xl py-2 z-50 animate-fade-up">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Lead Actions</p>
              </div>
              <Link
                href="/dashboard/search"
                onClick={() => setAddLeadOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13.5px] text-slate-700 hover:bg-blue-50/70 hover:text-blue-700 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Search className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-900">Search New Leads</span>
                  <span className="text-[11px] text-slate-400">Autonomous Google Maps extraction</span>
                </div>
              </Link>
              <Link
                href="/dashboard/leads"
                onClick={() => setAddLeadOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13.5px] text-slate-700 hover:bg-emerald-50/70 hover:text-emerald-700 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-900">View Leads Database</span>
                  <span className="text-[11px] text-slate-400">Inspect verified CRM records</span>
                </div>
              </Link>
              <Link
                href="/dashboard/search/history"
                onClick={() => setAddLeadOpen(false)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[13.5px] text-slate-700 hover:bg-purple-50/70 hover:text-purple-700 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <History className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-900">Search History</span>
                  <span className="text-[11px] text-slate-400">Review past extraction runs</span>
                </div>
              </Link>
            </div>
          )}
        </div>

        {/* 3 AI Quick-Access Action Buttons (WhatsApp, Calling, Email) */}
        <div className="hidden sm:flex items-center gap-1.5 sm:gap-2">
          {/* WhatsApp AI */}
          <Link
            href="/dashboard/whatsapp-ai"
            title="WhatsApp AI Agent"
            className="w-9 h-9 rounded-full bg-emerald-50 hover:bg-emerald-100/90 text-emerald-600 border border-emerald-100 flex items-center justify-center transition-all duration-200 hover:scale-105 shadow-2xs active:scale-95 cursor-pointer"
          >
            <WhatsAppIcon className="w-4 h-4" />
          </Link>

          {/* Calling AI Agent */}
          <Link
            href="/dashboard/calling-ai"
            title="Calling AI Agent"
            className="w-9 h-9 rounded-full bg-purple-50 hover:bg-purple-100/90 text-purple-600 border border-purple-100 flex items-center justify-center transition-all duration-200 hover:scale-105 shadow-2xs active:scale-95 cursor-pointer"
          >
            <Phone className="w-4 h-4" />
          </Link>

          {/* Email AI */}
          <Link
            href="/dashboard/email-ai"
            title="Email AI Agent"
            className="w-9 h-9 rounded-full bg-orange-50 hover:bg-orange-100/90 text-orange-600 border border-orange-100 flex items-center justify-center transition-all duration-200 hover:scale-105 shadow-2xs active:scale-95 cursor-pointer"
          >
            <Mail className="w-4 h-4" />
          </Link>
        </div>

        {/* Vertical Separator */}
        <div className="h-6 w-px bg-slate-200/80 mx-1 hidden sm:block" />

        {/* 9-Dots Grid (App Launcher) */}
        <div className="relative" ref={appsRef}>
          <button
            type="button"
            onClick={() => setAppsOpen((prev) => !prev)}
            title="App Launcher"
            className="w-9 h-9 rounded-full hover:bg-slate-100/80 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <LayoutGrid className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
          </button>

          {/* App Launcher Dropdown */}
          {appsOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-100 rounded-2xl shadow-xl p-3 z-50 animate-fade-up">
              <div className="px-2 py-1 mb-2 border-b border-slate-100 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Opti Matrix AI Suite</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Link
                  href="/dashboard/search"
                  onClick={() => setAppsOpen(false)}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-center group"
                >
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                    <Search className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700">Search</span>
                </Link>
                <Link
                  href="/dashboard/leads"
                  onClick={() => setAppsOpen(false)}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-center group"
                >
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                    <Users className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700">Leads DB</span>
                </Link>
                <Link
                  href="/dashboard/whatsapp-ai"
                  onClick={() => setAppsOpen(false)}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-center group"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                    <WhatsAppIcon className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700">WhatsApp</span>
                </Link>
                <Link
                  href="/dashboard/calling-ai"
                  onClick={() => setAppsOpen(false)}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-center group"
                >
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                    <Phone className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700">Voice AI</span>
                </Link>
                <Link
                  href="/dashboard/email-ai"
                  onClick={() => setAppsOpen(false)}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-center group"
                >
                  <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                    <Mail className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700">Email AI</span>
                </Link>
                <Link
                  href="/dashboard/settings"
                  onClick={() => setAppsOpen(false)}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl hover:bg-slate-50 transition-colors text-center group"
                >
                  <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-1 group-hover:scale-105 transition-transform">
                    <Settings className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700">Settings</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Pill & Dropdown (Matching Reference Image) */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 pl-1.5 pr-2 sm:pr-3 py-1 rounded-full hover:bg-slate-100/70 transition-colors cursor-pointer"
          >
            {/* Avatar Circle with Online Status Indicator */}
            <div className="w-8 h-8 rounded-full bg-[#1e293b] text-white flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden shadow-xs relative">
              {userProfile?.avatar ? (
                <img src={userProfile.avatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span>{initialLetter}</span>
              )}
              {/* Emerald Online Status Dot */}
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white ring-1 ring-slate-100" />
            </div>

            {/* Email & Role Label */}
            <div className="hidden md:flex flex-col items-start leading-tight">
              <span className="text-[13px] font-semibold text-slate-900 truncate max-w-[135px]">
                {displayEmail}
              </span>
              <span className="text-[11px] text-slate-400 capitalize font-medium">
                {displayRole}
              </span>
            </div>

            {/* Chevron Down */}
            <ChevronDown
              className={cn("w-3.5 h-3.5 text-slate-400 transition-transform duration-200", dropdownOpen && "rotate-180")}
            />
          </button>

          {/* User Profile Dropdown (Explicitly matching Reference Image!) */}
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-100 rounded-2xl shadow-xl p-3 z-50 animate-fade-up">
              {/* Profile Card Header */}
              <div className="bg-slate-50/80 rounded-xl p-3 flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full bg-[#1e293b] text-white flex items-center justify-center font-bold text-sm shrink-0">
                  <span>{initialLetter}</span>
                </div>
                <div className="flex flex-col min-w-0 leading-tight">
                  <span className="text-[13px] font-bold text-slate-900 truncate">
                    {displayEmail}
                  </span>
                  <span className="text-[11px] text-slate-400 capitalize font-medium mt-0.5">
                    {displayRole}
                  </span>
                </div>
              </div>

              {/* Menu Links */}
              <div className="space-y-1">
                <Link
                  href="/dashboard/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                >
                  <Settings className="w-4 h-4 text-slate-500" />
                  <span>Settings</span>
                </Link>

                {isAdmin && (
                  <Link
                    href="/dashboard/admin/user-activity"
                    onClick={() => setDropdownOpen(false)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                  >
                    <Shield className="w-4 h-4 text-slate-500" />
                    <span>User Activity</span>
                  </Link>
                )}
              </div>

              {/* Sign Out Button in soft pink pill */}
              <div className="pt-2 mt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={logout}
                  className="w-full rounded-xl bg-rose-50/70 hover:bg-rose-100/80 text-rose-600 font-semibold text-[13.5px] py-2 px-3 flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-rose-600" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
