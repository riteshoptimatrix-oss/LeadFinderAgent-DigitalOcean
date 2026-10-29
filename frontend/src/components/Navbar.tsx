'use client';

import { Bell, LogOut, User, ChevronDown, Settings, Menu } from 'lucide-react';
import { useAuthStore } from '@/src/features/auth/store';
import { useUIStore } from '@/src/features/ui/store';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import api from '@/src/lib/axios';

import PageHeader from './PageHeader';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const { toggleMobileMenu } = useUIStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const res = await api.get('/users/me');
      return res.data;
    },
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 border-b border-gray-200/80 bg-white flex items-center justify-between px-4 sm:px-6 lg:px-8 sticky top-0 z-20 shrink-0">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Button */}
        <button
          onClick={toggleMobileMenu}
          className="md:hidden p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <PageHeader />
      </div>

      <div className="flex items-center gap-3">
        <button 
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors relative"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full border-2 border-white"></span>
        </button>

        <div className="h-5 w-px bg-gray-200"></div>

        {/* User Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2.5 p-1 rounded-full hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700 shrink-0 overflow-hidden font-semibold text-xs">
              {userProfile?.avatar ? (
                <img src={userProfile.avatar} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-gray-500" />
              )}
            </div>
            <div className="text-left hidden sm:block leading-tight">
              <div className="text-xs font-bold text-gray-900 max-w-[120px] truncate">
                {userProfile?.full_name || user?.email?.split('@')[0] || 'User'}
              </div>
              <div className="text-[10px] text-gray-500 capitalize">
                {userProfile?.role?.toLowerCase() || 'Admin'}
              </div>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 z-50 animate-fade-in">
              <div className="px-3.5 py-2 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-900 truncate">
                  {userProfile?.full_name || user?.email || 'User'}
                </p>
                <p className="text-[11px] text-gray-500 truncate mt-0.5">
                  {user?.email}
                </p>
              </div>
              <Link
                href="/dashboard/settings"
                onClick={() => setDropdownOpen(false)}
                className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-gray-500" />
                Settings
              </Link>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors border-t border-gray-100 mt-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
