'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LogOut,
  Home,
  Users,
  Settings,
  Search,
  Mail,
  RotateCcw,
  Phone,
  Shield,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Compass
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useAuthStore } from '@/src/features/auth/store';
import { useSidebarStore } from '@/src/lib/sidebarStore';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';

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

interface NavItemConfig {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  status?: string;
  badgeBox?: {
    bg: string;
    text: string;
    border: string;
  };
}

interface NavGroupConfig {
  title: string;
  items: NavItemConfig[];
}

export default function Sidebar() {
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);

  const {
    isCollapsed,
    toggleCollapse,
    isMobileOpen,
    setMobileOpen,
    collapsedSections,
    toggleSection
  } = useSidebarStore();

  const [logoError, setLogoError] = useState(false);

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

  const isAdmin =
    user?.role?.toLowerCase() === 'admin' ||
    userProfile?.role?.toLowerCase() === 'admin' ||
    userProfile?.is_superuser === true;

  const userEmail = (user?.email || userProfile?.email || '')?.toLowerCase();
  const isKutchTourGuide = userEmail === 'kutchtourguide@gmail.com';

  const navGroups: NavGroupConfig[] = [
    {
      title: 'OVERVIEW',
      items: [
        {
          name: 'Home',
          href: '/dashboard',
          icon: Home,
          badgeBox: {
            bg: 'bg-blue-50',
            text: 'text-blue-600',
            border: 'border-blue-100/60'
          }
        },
      ]
    },
    {
      title: 'LEAD MANAGEMENT',
      items: [
        {
          name: 'Search Leads',
          href: '/dashboard/search',
          icon: Search,
          badgeBox: {
            bg: 'bg-blue-50',
            text: 'text-blue-600',
            border: 'border-blue-100/60'
          }
        },
        {
          name: 'Leads',
          href: '/dashboard/leads',
          icon: Users,
          badgeBox: {
            bg: 'bg-indigo-50',
            text: 'text-indigo-600',
            border: 'border-indigo-100/60'
          }
        },
        {
          name: 'Search History',
          href: '/dashboard/search/history',
          icon: RotateCcw,
          badgeBox: {
            bg: 'bg-amber-50',
            text: 'text-amber-600',
            border: 'border-amber-100/60'
          }
        },
      ]
    },
    {
      title: 'AUTOMATION',
      items: [
        ...(isKutchTourGuide ? [{
          name: 'Auto LeadFinder',
          href: '/dashboard/auto-leadfinder',
          icon: Compass,
          status: 'Active',
          badgeBox: {
            bg: 'bg-teal-50',
            text: 'text-teal-600',
            border: 'border-teal-200/70'
          }
        }] : []),
        {
          name: 'AI Content Generator',
          href: '/dashboard/ai-content',
          icon: Sparkles,
          badgeBox: {
            bg: 'bg-emerald-50',
            text: 'text-emerald-600',
            border: 'border-emerald-100/60'
          }
        },
        {
          name: 'WhatsApp Automation',
          href: '/dashboard/whatsapp-ai',
          icon: WhatsAppIcon,
          badgeBox: {
            bg: 'bg-emerald-50',
            text: 'text-emerald-600',
            border: 'border-emerald-100/60'
          }
        },
        {
          name: 'Calling AI Agent',
          status: 'In Progress',
          href: '/dashboard/calling-ai',
          icon: Phone,
          badgeBox: {
            bg: 'bg-purple-50',
            text: 'text-purple-600',
            border: 'border-purple-100/60'
          }
        },
        {
          name: 'Email Automation',
          href: '/dashboard/email-ai',
          icon: Mail,
          badgeBox: {
            bg: 'bg-orange-50',
            text: 'text-orange-600',
            border: 'border-orange-100/60'
          }
        },
      ]
    },
    {
      title: 'ACCOUNT',
      items: [
        {
          name: 'Settings',
          href: '/dashboard/settings',
          icon: Settings,
          badgeBox: {
            bg: 'bg-sky-50',
            text: 'text-sky-600',
            border: 'border-sky-100/60'
          }
        },
      ]
    }
  ];

  const adminGroup: NavGroupConfig = {
    title: 'ADMIN',
    items: [
      {
        name: 'User Management',
        href: '/dashboard/admin/users',
        icon: Users,
        badgeBox: {
          bg: 'bg-indigo-50',
          text: 'text-indigo-600',
          border: 'border-indigo-100/60'
        }
      },
      {
        name: 'User Activity',
        href: '/dashboard/admin/user-activity',
        icon: Shield,
        badgeBox: {
          bg: 'bg-rose-50',
          text: 'text-rose-600',
          border: 'border-rose-100/60'
        }
      },
    ]
  };

  const allGroups = isAdmin ? [...navGroups, adminGroup] : navGroups;

  // Compute user display details
  const displayEmail = userProfile?.email || user?.email || 'info@optiinfo.com';
  const displayRole = userProfile?.role || user?.role || 'Administrator';
  const initialLetter = (displayEmail[0] || 'N').toUpperCase();

  const handleLinkClick = () => {
    if (isMobileOpen) {
      setMobileOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-40 lg:hidden transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Aside */}
      <aside
        className={cn(
          "bg-white border-r border-slate-100 flex flex-col h-screen shrink-0 z-50 select-none shadow-[2px_0_12px_rgba(0,0,0,0.015)] transition-[width,transform] duration-300 ease-in-out",
          // Desktop sizing: 76px when collapsed, 264px (xl: 272px) when expanded
          isCollapsed ? "w-[76px]" : "w-[264px] xl:w-[272px]",
          // Mobile off-canvas drawer
          "fixed lg:static inset-y-0 left-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Top Header: Logo + Collapse Button + App Title */}
        <div className={cn(
          "pt-4 pb-3 shrink-0 transition-all duration-300",
          isCollapsed ? "px-2" : "px-5"
        )}>
          {!isCollapsed ? (
            /* EXPANDED HEADER */
            <>
              <div className="flex items-center justify-between gap-1.5">
                <Link href="/dashboard" className="flex items-center min-w-0">
                  {!logoError ? (
                    <img
                      src="/logo.png"
                      alt="Opti Matrix - Turn Ideas into Reality"
                      className="h-9 w-auto max-w-[170px] object-contain transition-transform duration-200"
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <img src="/logo_mark.png" alt="OptiMatrix" className="w-8 h-8 object-contain shrink-0" />
                      <div className="flex flex-col">
                        <div className="flex items-center text-[17px] font-bold tracking-tight leading-tight">
                          <span className="text-slate-900">Opti</span>
                          <span className="text-[#dc2626] ml-1">Matrix</span>
                        </div>
                        <span className="text-[9.5px] text-slate-400 font-medium tracking-wide">
                          Turn Ideas into Reality
                        </span>
                      </div>
                    </div>
                  )}
                </Link>

                {/* Collapse Button */}
                <button
                  onClick={toggleCollapse}
                  aria-label="Collapse sidebar"
                  className="w-7 h-7 rounded-xl bg-slate-50 hover:bg-slate-100/90 border border-slate-200/80 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all duration-200 shadow-xs shrink-0 cursor-pointer"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-slate-500" strokeWidth={2.5} />
                </button>
              </div>

              {/* App Title */}
              <div className="mt-4 flex flex-col items-center justify-center text-center">
                <h2 className="text-[17px] font-bold text-slate-900 tracking-tight leading-snug">
                  LeadFinderAgent
                </h2>
                <p className="text-[11.5px] text-slate-400 font-medium tracking-normal mt-0.5">
                  Enterprise AI CRM
                </p>
              </div>
            </>
          ) : (
            /* COLLAPSED HEADER: Centered logo mark with expand button below */
            <div className="flex flex-col items-center justify-center gap-2.5">
              <Link href="/dashboard" className="flex items-center justify-center p-0.5" title="OptiMatrix LeadFinderAgent">
                <img
                  src="/logo_mark.png?v=2"
                  alt="OptiMatrix"
                  className="w-9 h-9 object-contain transition-transform duration-200 hover:scale-105"
                />
              </Link>
              <button
                onClick={toggleCollapse}
                aria-label="Expand sidebar"
                className="w-7 h-7 rounded-xl bg-slate-50 hover:bg-slate-100/90 border border-slate-200/80 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all duration-200 shadow-xs cursor-pointer"
                title="Expand sidebar"
              >
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>

        {/* Navigation Section */}
        <nav className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar py-2 transition-all duration-300",
          isCollapsed ? "px-2 space-y-1" : "px-3.5 space-y-3.5"
        )}>
          {allGroups.map((group, groupIndex) => {
            const isSectionCollapsed = collapsedSections[group.title] || false;

            return (
              <div key={group.title} className={cn(isCollapsed ? "space-y-1" : "space-y-1")}>
                {/* Category Header with Divider Line in Expanded Mode */}
                {!isCollapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleSection(group.title)}
                    className="w-full flex items-center justify-between px-2 pt-2 pb-1 group cursor-pointer text-left"
                    title={`Toggle ${group.title}`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
                      <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase shrink-0 transition-colors group-hover:text-slate-600">
                        {group.title}
                      </span>
                      <div className="h-px bg-slate-100 flex-1 transition-colors group-hover:bg-slate-200" />
                    </div>
                    <ChevronDown
                      className={cn(
                        "w-3 h-3 text-slate-300 group-hover:text-slate-500 transition-transform duration-200 shrink-0",
                        isSectionCollapsed && "-rotate-90"
                      )}
                    />
                  </button>
                ) : (
                  /* In Collapsed mode: subtle, centered divider only between groups (not above the first) */
                  groupIndex > 0 ? (
                    <div className="w-8 h-px bg-slate-100 my-1.5 mx-auto" />
                  ) : null
                )}

                {/* Items in Category */}
                {(!isSectionCollapsed || isCollapsed) && (
                  <div className={cn(isCollapsed ? "space-y-1" : "space-y-0.5")}>
                    {group.items.map((item) => {
                      // Collect all hrefs across all groups for specificity check
                      const allHrefs = allGroups.flatMap(g => g.items.map(i => i.href));
                      // Exact match for current path
                      const isExact = pathname === item.href;
                      // Prefix match: only if no other nav item has a more specific (longer) href that also matches
                      const isPrefix = !isExact && item.href !== '/dashboard' && pathname?.startsWith(item.href + '/');
                      const hasMoreSpecificMatch = isPrefix && allHrefs.some(
                        href => href !== item.href && href.startsWith(item.href + '/') && pathname?.startsWith(href)
                      );
                      const isActive = isExact || (isPrefix && !hasMoreSpecificMatch);
                      const Icon = item.icon;
                      const hasBadgeBox = Boolean(item.badgeBox);
                      const tooltipLabel = item.status ? `${item.name} — ${item.status}` : item.name;

                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={handleLinkClick}
                          title={isCollapsed ? tooltipLabel : undefined}
                          className={cn(
                            "relative group flex items-center transition-all duration-200",
                            isCollapsed
                              ? "justify-center w-11 h-11 mx-auto my-0.5 rounded-xl"
                              : "justify-between px-3 py-2 my-0.5 rounded-xl font-medium",
                            isActive
                              ? isCollapsed
                                ? "bg-blue-50/90 text-blue-600 border border-blue-200/80 shadow-xs before:absolute before:-left-2 before:top-2 before:bottom-2 before:w-[3px] before:bg-blue-600 before:rounded-r-full"
                                : "bg-gradient-to-r from-blue-50/90 via-blue-50/40 to-transparent text-slate-900 font-bold before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3.5px] before:bg-blue-600 before:rounded-r-md"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50/80"
                          )}
                        >
                          <div className={cn(
                            "flex items-center min-w-0",
                            isCollapsed ? "justify-center" : "gap-3"
                          )}>
                            {/* Icon with badge box */}
                            {hasBadgeBox && item.badgeBox ? (
                              <div className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border transition-all duration-200 shadow-xs",
                                item.badgeBox.bg,
                                item.badgeBox.text,
                                item.badgeBox.border,
                                "group-hover:scale-105"
                              )}>
                                <Icon className="w-4 h-4" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                                <Icon className={cn(
                                  "w-[19px] h-[19px] transition-colors duration-200",
                                  isActive
                                    ? "text-blue-600"
                                    : "text-slate-500 group-hover:text-slate-800"
                                )} />
                              </div>
                            )}

                            {/* Item Label & Status (Expanded Mode) */}
                            {!isCollapsed && (
                              <div className="flex flex-col min-w-0 leading-tight">
                                <span className={cn(
                                  "text-[13.5px] truncate transition-colors duration-200",
                                  isActive ? "text-slate-900 font-bold" : "text-slate-700 font-medium group-hover:text-slate-900"
                                )}>
                                  {item.name}
                                </span>
                                {item.status && (
                                  <span className="text-[10px] text-amber-600 font-medium tracking-tight mt-0.5">
                                    {item.status}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Right Chevron (Expanded Mode) */}
                          {!isCollapsed && (
                            <ChevronRight className={cn(
                              "w-4 h-4 transition-all duration-200 shrink-0",
                              isActive
                                ? "text-blue-600 font-bold"
                                : "text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5"
                            )} />
                          )}

                          {/* Hover Tooltip (Collapsed Mode) */}
                          {isCollapsed && (
                            <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50 whitespace-nowrap flex items-center gap-1.5">
                              <span>{item.name}</span>
                              {item.status && (
                                <span className="text-[10px] font-medium text-amber-300">
                                  ({item.status})
                                </span>
                              )}
                              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer / User Profile & Sign Out */}
        <div className={cn(
          "border-t border-slate-100 pt-2.5 pb-3.5 mt-auto shrink-0 bg-white transition-all duration-300",
          isCollapsed ? "px-2" : "px-3.5"
        )}>
          {/* User Profile Card */}
          <Link
            href="/dashboard/settings"
            onClick={handleLinkClick}
            title={isCollapsed ? `${displayEmail} (${displayRole})` : undefined}
            className={cn(
              "group rounded-2xl bg-slate-50/70 hover:bg-slate-100/70 border border-slate-100/90 transition-all duration-200 flex items-center cursor-pointer relative",
              isCollapsed
                ? "w-11 h-11 mx-auto justify-center p-1"
                : "justify-between p-2.5 gap-2.5"
            )}
          >
            <div className={cn(
              "flex items-center min-w-0",
              isCollapsed ? "justify-center" : "gap-2.5"
            )}>
              {/* Avatar circle with online status badge */}
              <div className="w-8 h-8 rounded-full bg-[#1e293b] text-white font-bold flex items-center justify-center text-xs shadow-xs relative shrink-0">
                {userProfile?.avatar ? (
                  <img src={userProfile.avatar} alt="Profile" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span>{initialLetter}</span>
                )}
                {/* Emerald Online Status Dot */}
                <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border border-white ring-1 ring-slate-100" />
              </div>

              {/* User Email & Role */}
              {!isCollapsed && (
                <div className="flex flex-col min-w-0 leading-tight">
                  <span className="text-[13px] font-semibold text-slate-800 truncate group-hover:text-slate-900 transition-colors">
                    {displayEmail}
                  </span>
                  <span className="text-[11px] text-slate-400 capitalize font-medium mt-0.5">
                    {displayRole}
                  </span>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-0.5 transition-all shrink-0" />
            )}

            {/* Hover Tooltip (Collapsed Mode) */}
            {isCollapsed && (
              <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50 whitespace-nowrap">
                {displayEmail} ({displayRole})
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
              </div>
            )}
          </Link>

          {/* Sign Out Button */}
          <button
            onClick={logout}
            title={isCollapsed ? "Sign out" : undefined}
            className={cn(
              "rounded-xl bg-rose-50/70 hover:bg-rose-100/80 border border-rose-100/60 text-rose-600 font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98] cursor-pointer relative group",
              isCollapsed ? "w-11 h-11 mx-auto mt-2" : "w-full mt-2.5 py-2.5 px-4"
            )}
          >
            <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
            {!isCollapsed && <span>Sign out</span>}

            {/* Hover Tooltip (Collapsed Mode) */}
            {isCollapsed && (
              <div className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50 whitespace-nowrap">
                Sign out
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
              </div>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
