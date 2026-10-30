'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  Plus, 
  ChevronDown, 
  Bell, 
  LayoutGrid, 
  Settings, 
  Shield, 
  LogOut, 
  Phone, 
  Mail, 
  Menu,
  CheckCircle2,
  Users,
  History,
  Sparkles,
  ExternalLink,
  X,
  CheckCheck,
  Trash2,
  Clock
} from 'lucide-react';
import { useAuthStore } from '@/src/features/auth/store';
import { useSidebarStore } from '@/src/lib/sidebarStore';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';
import { cn } from '@/src/lib/utils';

// Authentic WhatsApp SVG Icon
function WhatsAppIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <path 
        d="M8.5 9.5c.3 1.3 1.2 2.2 2.5 2.5l.8-.8a.7.7 0 0 1 .8-.1l1.8.6a.7.7 0 0 1 .5.7v1.1a1 1 0 0 1-1 1c-3.3 0-6-2.7-6-6a1 1 0 0 1 1-1h1.1a.7.7 0 0 1 .7.5l.6 1.8a.7.7 0 0 1-.1.8l-.8.8z" 
        fill="currentColor" 
        stroke="none" 
      />
    </svg>
  );
}

// Logo emblem fallback
function OptiMatrixEmblem({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M20 2C16 10 10 16 2 20C10 24 16 30 20 38C24 30 30 24 38 20C30 16 24 10 20 2Z" fill="url(#nav-grad)" />
      <path d="M20 6C17 12 12 17 6 20C12 23 17 28 20 34C23 28 28 23 34 20C28 17 23 12 20 6Z" fill="url(#nav-grad2)" />
      <defs>
        <linearGradient id="nav-grad" x1="2" y1="2" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="0.33" stopColor="#3b82f6" />
          <stop offset="0.66" stopColor="#ec4899" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="nav-grad2" x1="6" y1="6" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60a5fa" />
          <stop offset="0.5" stopColor="#a855f7" />
          <stop offset="1" stopColor="#ef4444" />
        </linearGradient>
      </defs>
    </svg>
  );
}

interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  metadata?: Record<string, any>;
  created_at: string;
}

function formatTimeAgo(dateString?: string): string {
  if (!dateString) return 'Just now';
  try {
    const now = new Date();
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Recently';
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 45) return 'Just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

function NotificationIcon({ type }: { type: string }) {
  const t = (type || '').toLowerCase();
  if (t === 'lead') {
    return (
      <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
        <Users className="w-4 h-4" />
      </div>
    );
  }
  if (t === 'whatsapp') {
    return (
      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
        <WhatsAppIcon className="w-4 h-4" />
      </div>
    );
  }
  if (t === 'calling') {
    return (
      <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
        <Phone className="w-4 h-4" />
      </div>
    );
  }
  if (t === 'email') {
    return (
      <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
        <Mail className="w-4 h-4" />
      </div>
    );
  }
  if (t === 'ai') {
    return (
      <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
      <CheckCircle2 className="w-4 h-4 text-blue-600" />
    </div>
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all');
  const [logoError, setLogoError] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const addLeadRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const appsRef = useRef<HTMLDivElement>(null);

  const { 
    data: notifData, 
    refetch: refetchNotifications,
    isLoading: notifsLoading 
  } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      try {
        const res = await api.get('/notifications?limit=30');
        return res.data as {
          notifications: NotificationItem[];
          unread_count: number;
          total: number;
        };
      } catch {
        return { notifications: [], unread_count: 0, total: 0 };
      }
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const unreadCount = notifData?.unread_count ?? 0;
  const notificationsList = notifData?.notifications ?? [];
  const filteredNotifications = notificationFilter === 'unread'
    ? notificationsList.filter(n => !n.read)
    : notificationsList;

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read');
      refetchNotifications();
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.read) {
      try {
        await api.patch(`/notifications/${item.id}/read`);
        refetchNotifications();
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }
    setNotificationsOpen(false);
    if (item.link) {
      router.push(item.link);
    }
  };

  const handleDeleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${id}`);
      refetchNotifications();
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleClearAll = async () => {
    try {
      await api.delete('/notifications');
      refetchNotifications();
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  };

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
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false);
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
      {/* 1. LEFT SECTION: Hamburger Toggle + Logo + Vertical Line */}
      {/* ======================================================== */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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

        {/* Brand Logo */}
        <Link 
          href="/dashboard"
          className="flex items-center gap-2 transition-transform hover:opacity-95 shrink-0"
          title="LeadFinderAgent Dashboard"
        >
          {!logoError ? (
            <img 
              src="/logo.png" 
              alt="Opti Matrix - Turn Ideas into Reality" 
              className="h-8 sm:h-9 w-auto max-w-[155px] object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="flex items-center gap-2">
              <OptiMatrixEmblem className="w-8 h-8 shrink-0" />
              <div className="flex flex-col">
                <div className="flex items-center text-[16px] sm:text-[17px] font-bold tracking-tight leading-tight">
                  <span className="text-slate-900">Opti</span>
                  <span className="text-[#dc2626] ml-1">Matrix</span>
                </div>
                <span className="text-[9px] text-slate-400 font-medium tracking-wide">
                  Turn Ideas into Reality
                </span>
              </div>
            </div>
          )}
        </Link>

        {/* Vertical Separator */}
        <div className="h-6 w-px bg-slate-200/80 mx-1 sm:mx-2 hidden md:block" />
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

        {/* Notification Bell */}
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            onClick={() => setNotificationsOpen((prev) => !prev)}
            title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : "Notifications"}
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 relative cursor-pointer active:scale-95",
              notificationsOpen 
                ? "bg-blue-50 text-blue-600 ring-2 ring-blue-100" 
                : "hover:bg-slate-100/80 text-slate-500 hover:text-slate-800"
            )}
          >
            <Bell className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 bg-red-500 text-white text-[9.5px] font-bold rounded-full flex items-center justify-center ring-2 ring-white shadow-xs">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200/90 rounded-2xl shadow-2xl z-50 animate-fade-up overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-bold text-slate-900">Notifications</span>
                  {unreadCount > 0 ? (
                    <span className="text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                      {unreadCount} New
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      All read
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      title="Mark all as read"
                      className="text-slate-500 hover:text-blue-600 text-xs font-semibold flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5 text-blue-600" />
                      <span className="hidden sm:inline">Mark read</span>
                    </button>
                  )}
                  {notificationsList.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      title="Clear all notifications"
                      className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center px-3 pt-2 pb-1.5 border-b border-slate-100 text-xs gap-1.5 bg-white">
                <button
                  type="button"
                  onClick={() => setNotificationFilter('all')}
                  className={cn(
                    "px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer",
                    notificationFilter === 'all'
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  )}
                >
                  All ({notificationsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setNotificationFilter('unread')}
                  className={cn(
                    "px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1.5",
                    notificationFilter === 'unread'
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  )}
                >
                  Unread ({unreadCount})
                </button>
              </div>

              {/* Notification List */}
              <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100/90 overscroll-contain">
                {notifsLoading && notificationsList.length === 0 ? (
                  <div className="py-8 px-4 text-center text-xs text-slate-400">
                    Loading notifications...
                  </div>
                ) : filteredNotifications.length === 0 ? (
                  <div className="py-10 px-4 text-center flex flex-col items-center justify-center">
                    <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-100 text-slate-400 flex items-center justify-center mb-2.5">
                      <Bell className="w-5 h-5 opacity-40" />
                    </div>
                    <span className="text-[13px] font-semibold text-slate-700">No notifications</span>
                    <span className="text-[11.5px] text-slate-400 mt-0.5 max-w-[220px]">
                      {notificationFilter === 'unread' 
                        ? "You have no unread notifications." 
                        : "You're all caught up with your latest alerts and campaigns."}
                    </span>
                  </div>
                ) : (
                  filteredNotifications.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleNotificationClick(item)}
                      className={cn(
                        "group relative p-3 sm:p-3.5 flex items-start gap-3 transition-colors cursor-pointer text-left",
                        !item.read ? "bg-blue-50/40 hover:bg-blue-50/70" : "bg-white hover:bg-slate-50/90"
                      )}
                    >
                      <NotificationIcon type={item.type} />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <span className={cn(
                            "text-[12.5px] sm:text-[13px] leading-snug line-clamp-1",
                            !item.read ? "font-bold text-slate-900" : "font-medium text-slate-800"
                          )}>
                            {item.title}
                          </span>
                          {!item.read && (
                            <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1" />
                          )}
                        </div>

                        <p className="text-[11.5px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                          {item.message}
                        </p>

                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {formatTimeAgo(item.created_at)}
                          </span>

                          <button
                            type="button"
                            onClick={(e) => handleDeleteNotification(e, item.id)}
                            title="Dismiss notification"
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500 rounded-md hover:bg-slate-100 shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
                <Link
                  href="/dashboard/leads"
                  onClick={() => setNotificationsOpen(false)}
                  className="font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                >
                  <span>View All Leads</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
                <Link
                  href="/dashboard"
                  onClick={() => setNotificationsOpen(false)}
                  className="text-slate-400 hover:text-slate-600 font-medium transition-colors"
                >
                  Dashboard Home
                </Link>
              </div>
            </div>
          )}
        </div>

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
