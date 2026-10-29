'use client';
import { useAuthStore } from '@/src/features/auth/store';
import { 
  LogOut, Home, Users, Settings, Search, Mail, 
  History, MessageSquare, User, ShieldAlert, Phone
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

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const res = await api.get('/users/me');
      return res.data;
    },
    refetchOnWindowFocus: false,
  });

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

  return (
    <aside className="w-[280px] bg-white border-r border-gray-100 flex flex-col h-screen shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.01)] overflow-hidden">
      <div className="p-8 pb-6 shrink-0">
        <div className="flex flex-col items-center justify-center gap-4">
          <img 
            src="/logo.png" 
            alt="Optimatrix" 
            className="w-full max-w-[140px] h-auto object-contain transition-transform hover:scale-105 duration-300" 
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div className="hidden flex-col items-center justify-center">
            <div className="flex items-center text-2xl font-bold tracking-tight">
              <span className="text-gray-900">Opti</span>
              <span className="text-[#c1121f]">Matrix</span>
            </div>
            <span className="text-[10px] text-gray-400 font-medium tracking-widest uppercase mt-0.5">Turns idea into Reality</span>
          </div>
          <div className="mt-2 flex flex-col items-center justify-center text-center">
            <span className="text-[14px] text-gray-800 font-bold tracking-wide">
              LeadFinderAgent
            </span>
            <span className="text-[11px] text-gray-500 font-semibold tracking-wide">
              Enterprise AI CRM
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-5 py-4 overflow-y-auto hide-scrollbar space-y-6">
        {navGroups.map((group, idx) => (
          <div key={idx} className="space-y-1.5">
            <p className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{group.title}</p>
            {group.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  prefetch={false}
                  className={cn(
                    "group flex items-center gap-3.5 px-4 py-2.5 rounded-xl transition-all duration-300 font-medium text-[13.5px]",
                    isActive
                      ? "bg-gray-900 text-white shadow-md shadow-gray-900/10"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  )}
                >
                  <Icon className={cn(
                    "w-[18px] h-[18px] transition-colors duration-300", 
                    isActive ? "text-white" : "text-gray-400 group-hover:text-gray-900"
                  )} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        ))}

        {isAdmin && (
          <div className="space-y-1.5 pt-2">
            <p className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">ADMIN</p>
            {adminItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  prefetch={false}
                  className={cn(
                    "group flex items-center gap-3.5 px-4 py-2.5 rounded-xl transition-all duration-300 font-medium text-[13.5px]",
                    isActive
                      ? "bg-gray-900 text-white shadow-md shadow-gray-900/10"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  )}
                >
                  <Icon className={cn(
                    "w-[18px] h-[18px] transition-colors duration-300", 
                    isActive ? "text-white" : "text-gray-400 group-hover:text-gray-900"
                  )} />
                  {item.name}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      <div className="p-5 border-t border-gray-100/80 bg-gray-50/30 mt-auto shrink-0">
        
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="w-10 h-10 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 shrink-0 overflow-hidden">
            {userProfile?.avatar ? (
              <img src={userProfile.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5" />
            )}
          </div>
          <div className="flex flex-col overflow-hidden leading-tight">
            <span className="text-sm font-bold text-slate-900 truncate">{userProfile?.full_name || user?.email || 'Loading...'}</span>
            <span className="text-xs text-slate-500 capitalize truncate mt-0.5">{userProfile?.role?.toLowerCase() || 'Administrator'}</span>
          </div>
        </div>

        <button
          onClick={logout}
          className="group flex items-center gap-3.5 w-full px-4 py-3 text-[14px] font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all duration-300"
        >
          <LogOut className="w-[18px] h-[18px] text-gray-400 group-hover:text-red-500 transition-colors" />
          Sign out
        </button>
      </div>
    </aside>
  );
}