'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, LogOut, Loader2, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/src/features/auth/store';
import { queryClient } from '@/src/lib/queryClient';
import api from '@/src/lib/axios';
import { toast } from 'sonner';

export default function ImpersonationBanner() {
  const router = useRouter();
  const authUser = useAuthStore((state) => state.user);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [targetEmail, setTargetEmail] = useState('');
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const checkImpersonation = () => {
      if (typeof window === 'undefined') return;
      const impersonating = localStorage.getItem('is_impersonating') === 'true';
      const email = localStorage.getItem('impersonated_target_email') || authUser?.email || '';
      setIsImpersonating(impersonating);
      setTargetEmail(email);
    };

    checkImpersonation();
    window.addEventListener('storage', checkImpersonation);
    return () => window.removeEventListener('storage', checkImpersonation);
  }, [authUser]);

  if (!isImpersonating) {
    return null;
  }

  const handleExitImpersonation = async () => {
    try {
      setIsExiting(true);
      
      // Best-effort audit log to backend
      try {
        await api.post('/admin/users/impersonate/stop');
      } catch (e) {
        console.warn('Impersonate stop logging failed:', e);
      }

      const backupToken = localStorage.getItem('admin_backup_access_token');
      const backupRefresh = localStorage.getItem('admin_backup_refresh_token');
      const backupUserStr = localStorage.getItem('admin_backup_user');

      if (backupToken && backupUserStr) {
        const adminUser = JSON.parse(backupUserStr);

        localStorage.setItem('access_token', backupToken);
        if (backupRefresh) {
          localStorage.setItem('refresh_token', backupRefresh);
        }

        // Clean up backup keys
        localStorage.removeItem('is_impersonating');
        localStorage.removeItem('impersonated_target_email');
        localStorage.removeItem('admin_backup_access_token');
        localStorage.removeItem('admin_backup_refresh_token');
        localStorage.removeItem('admin_backup_user');

        // Restore auth store state
        useAuthStore.setState({ user: adminUser, isAuthenticated: true });
        queryClient.clear();

        toast.success('Exited impersonation mode. Welcome back, Administrator!');
        window.location.href = '/dashboard/admin/users';
      } else {
        // Fallback logout if backup is missing
        localStorage.removeItem('is_impersonating');
        localStorage.removeItem('impersonated_target_email');
        useAuthStore.getState().logout();
      }
    } catch (err) {
      console.error('Error exiting impersonation:', err);
      toast.error('Failed to exit impersonation mode cleanly.');
    } finally {
      setIsExiting(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-white px-4 py-2.5 shadow-md flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40 border-b border-amber-700/30">
      <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
        <span className="p-1 rounded-lg bg-amber-700/40 text-amber-100 flex items-center justify-center">
          <Eye className="w-4 h-4 animate-pulse" />
        </span>
        <span>
          <strong className="font-bold uppercase tracking-wider text-[11px] bg-amber-700/60 px-2 py-0.5 rounded-md mr-1.5">
            Admin Impersonation Active
          </strong>
          You are currently accessing the platform as <strong className="underline underline-offset-2">{targetEmail}</strong>.
        </span>
      </div>

      <button
        onClick={handleExitImpersonation}
        disabled={isExiting}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white text-amber-900 hover:bg-amber-50 text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
        title="Return to your original Admin account"
      >
        {isExiting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Returning to Admin...</span>
          </>
        ) : (
          <>
            <LogOut className="w-3.5 h-3.5 text-amber-700" />
            <span>Exit Impersonation & Return to Admin</span>
          </>
        )}
      </button>
    </div>
  );
}
