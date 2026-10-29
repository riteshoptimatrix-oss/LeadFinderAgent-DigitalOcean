'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/src/features/auth/store';
import api from '@/src/lib/axios';
import { Loader2 } from 'lucide-react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Safety timeout: Never leave the user stuck in a checking state
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setIsChecking(false);
      }
    }, 2500);

    // Direct token check in storage
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('access_token') || sessionStorage.getItem('access_token'))
      : null;

    // If no token exists and store is either hydrated or empty
    if (!token && (!isAuthenticated || hasHydrated)) {
      if (typeof window !== 'undefined') {
        window.location.replace('/login');
      } else {
        router.replace('/login');
      }
      return () => {
        isMounted = false;
        clearTimeout(safetyTimer);
      };
    }

    // If authenticated or has token, unblock UI immediately
    if (isAuthenticated || token) {
      setIsChecking(false);

      // Validate session with backend in the background without blocking the UI
      api.get('/auth/me')
        .then(res => {
          if (!isMounted) return;
          const realUser = { id: res.data.id || res.data._id, email: res.data.email };
          const current = useAuthStore.getState().user;
          if (current && (current.id !== realUser.id || current.email !== realUser.email)) {
            useAuthStore.setState({ user: realUser });
          }
        })
        .catch(() => {
          // Handled by axios interceptor if 401 refresh fails
        })
        .finally(() => {
          if (isMounted) {
            clearTimeout(safetyTimer);
            setIsChecking(false);
          }
        });
    }

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
    };
  }, [isAuthenticated, hasHydrated, router, pathname]);

  if (isChecking) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-xs font-semibold text-slate-500">Loading LeadFinder...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
