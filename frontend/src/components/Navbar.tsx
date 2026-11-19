'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  History
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

export default function Navbar() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const {
    toggleCollapse,
    toggleMobile
  } = useSidebarStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);

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

  // Keyboard shortcut Ctrl+K / Cmd+K to focus search input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
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
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/dashboard/search?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push('/dashboard/search');
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
        {/* Hamburger Toggle Button */}
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
      {/* 2. CENTER SECTION: Search Input with Ctrl+K badge */}
      {/* ======================================================== */}
      <div className="flex-1 max-w-[480px] min-w-0 mx-1 sm:mx-2">
        <form onSubmit={handleSearchSubmit} className="relative w-full">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search leads, contacts, or anything..."
              className="w-full bg-slate-50/90 hover:bg-slate-50 focus:bg-white border border-slate-200/80 focus:border-blue-500 rounded-xl pl-10 pr-16 sm:pr-20 py-2 sm:py-2.5 text-[13px] sm:text-[13.5px] text-slate-800 placeholder:text-slate-400 placeholder:text-[12.5px] sm:placeholder:text-[13px] outline-none transition-all shadow-xs"
            />
            {/* Keyboard shortcut Ctrl K */}
            <div className="absolute right-2.5 flex items-center gap-1 pointer-events-none">
              <span className="text-[10.5px] font-semibold text-slate-400 bg-white/90 border border-slate-200/90 rounded-md px-1.5 py-0.5 shadow-2xs">
                Ctrl
              </span>
              <span className="text-[10.5px] font-semibold text-slate-400 bg-white/90 border border-slate-200/90 rounded-md px-1.5 py-0.5 shadow-2xs">
                K
              </span>
            </div>
          </div>
        </form>
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
