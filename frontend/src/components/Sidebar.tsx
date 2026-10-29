'use client';

import { useAuthStore } from '@/src/features/auth/store';
import { useUIStore } from '@/src/features/ui/store';
import { 
  LogOut, Home, Users, Settings, Search, Mail, 
  History, MessageSquare, ShieldAlert, Phone,
  PanelLeftClose, PanelLeft, X
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/src/lib/utils';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';

export default function Sidebar() {
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'ADMIN';

  const { sidebarCollapsed, toggleSidebar, mobileMenuOpen, setMobileMenuOpen } = useUIStore();

  const navGroups = [
    {
      title: 'OVERVIEW',
      items: [
        { name: 'Home', href: '/dashboard', icon: Home },
      ]
    },
    {
      title: 'LEAD MANAGEMENT',
      items: [
        { name: 'Search Leads', href: '/dashboard/search', icon: Search },
        { name: 'Leads', href: '/dashboard/leads', icon: Users },
        { name: 'Search History', href: '/dashboard/search/history', icon: History },
      ]
    },
    {
      title: 'AUTOMATION',
      items: [
        { name: 'WhatsApp AI', href: '/dashboard/whatsapp-ai', icon: MessageSquare },
        { name: 'Calling AI Agent', href: '/dashboard/calling-ai', icon: Phone },
        { name: 'Email AI', href: '/dashboard/email-ai', icon: Mail },
      ]
    },
    {
      title: 'ACCOUNT',
      items: [
        { name: 'Settings', href: '/dashboard/settings', icon: Settings },
      ]
    }
  ];

  const adminItems = [
    { name: 'User Activity', href: '/dashboard/admin/user-activity', icon: ShieldAlert },
  ];

  const allNavHrefs = [
    ...navGroups.flatMap((g) => g.items.map((i) => i.href)),
    ...adminItems.map((i) => i.href),
  ];

  const isRouteActive = (href: string) => {
    if (pathname === href) {
      return true;
    }
    if (pathname.startsWith(href + '/')) {
      const hasMoreSpecificMatch = allNavHrefs.some(
        (otherHref) =>
          otherHref !== href &&
          otherHref.length > href.length &&
          (pathname === otherHref || pathname.startsWith(otherHref + '/'))
      );
      return !hasMoreSpecificMatch;
    }
    return false;
  };

  const navContent = (isMobile: boolean = false) => {
    const collapsed = !isMobile && sidebarCollapsed;

    return (
      <div className="flex flex-col h-full select-none">
        {/* Brand Header - matches h-16 of Navbar */}
        <div className={cn(
          "h-16 border-b border-gray-100 flex items-center shrink-0 transition-all duration-200",
          collapsed ? "px-3 justify-center" : "px-4 sm:px-5 justify-between"
        )}>
          <Link 
            href="/dashboard" 
            onClick={() => isMobile && setMobileMenuOpen(false)}
            className="flex items-center gap-2.5 group overflow-hidden"
          >
            <img 
              src="/logo.png" 
              alt="OptiMatrix LeadFinder" 
              className={cn(
                "h-7 w-auto object-contain transition-transform group-hover:scale-105 shrink-0",
                collapsed && "h-6"
              )} 
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <div className="hidden items-center justify-center w-7 h-7 rounded-lg bg-blue-600 text-white font-bold text-xs shrink-0">
              LF
            </div>
            {!collapsed && (
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-sm font-bold text-gray-900 tracking-tight truncate group-hover:text-blue-600 transition-colors">
                  LeadFinder
                </span>
                <span className="text-[10px] text-gray-400 font-medium tracking-wider uppercase">
                  Enterprise AI
                </span>
              </div>
            )}
          </Link>

          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 px-2.5 py-4 overflow-y-auto space-y-4">
          {navGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              {!collapsed ? (
                <p className="px-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  {group.title}
                </p>
              ) : (
                <div className="h-px bg-gray-100 my-2 mx-1" />
              )}
              {group.items.map((item) => {
                const active = isRouteActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    prefetch={false}
                    title={collapsed ? item.name : undefined}
                    onClick={() => isMobile && setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center rounded-lg text-[13px] font-medium transition-all duration-150",
                      collapsed ? "justify-center p-2.5" : "gap-2.5 px-2.5 py-2",
                      active
                        ? "bg-blue-50 text-blue-600 font-semibold border border-blue-100/80 shadow-2xs"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50/80"
                    )}
                  >
                    <Icon className={cn(
                      "w-4 h-4 shrink-0 transition-colors",
                      active ? "text-blue-600" : "text-gray-400 group-hover:text-gray-700"
                    )} />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          ))}

          {isAdmin && (
            <div className="space-y-1 pt-1">
              {!collapsed ? (
                <p className="px-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  ADMIN
                </p>
              ) : (
                <div className="h-px bg-gray-100 my-2 mx-1" />
              )}
              {adminItems.map((item) => {
                const active = isRouteActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    prefetch={false}
                    title={collapsed ? item.name : undefined}
                    onClick={() => isMobile && setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center rounded-lg text-[13px] font-medium transition-all duration-150",
                      collapsed ? "justify-center p-2.5" : "gap-2.5 px-2.5 py-2",
                      active
                        ? "bg-blue-50 text-blue-600 font-semibold border border-blue-100/80 shadow-2xs"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50/80"
                    )}
                  >
                    <Icon className={cn(
                      "w-4 h-4 shrink-0 transition-colors",
                      active ? "text-blue-600" : "text-gray-400"
                    )} />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* Footer Actions: Collapse & Sign Out */}
        <div className="p-2.5 border-t border-gray-100 bg-gray-50/50 shrink-0 flex items-center justify-between gap-1.5">
          {!isMobile && (
            <button
              onClick={toggleSidebar}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cn(
                "p-2 text-gray-400 hover:text-gray-700 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200 shadow-2xs",
                collapsed && "w-full flex items-center justify-center"
              )}
            >
              {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          )}

          <button
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className={cn(
              "flex items-center gap-2 p-2 text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors",
              collapsed && "hidden"
            )}
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className={cn(
        "hidden md:flex bg-white border-r border-gray-200/80 flex-col h-screen shrink-0 overflow-hidden transition-all duration-200 z-30",
        sidebarCollapsed ? "w-16" : "w-64"
      )}>
        {navContent(false)}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 md:hidden animate-fade-in"
        />
      )}

      {/* Mobile Drawer Content */}
      <div className={cn(
        "fixed inset-y-0 left-0 w-64 bg-white z-50 md:hidden shadow-2xl flex flex-col transition-transform duration-200 ease-in-out",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {navContent(true)}
      </div>
    </>
  );
}
