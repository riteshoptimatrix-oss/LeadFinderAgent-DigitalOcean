'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/src/features/auth/store';
import api from '@/src/lib/axios';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!hasHydrated) return;

    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('access_token') || sessionStorage.getItem('access_token'))
      : null;

    if (!isAuthenticated || !token) {
      useAuthStore.getState().logout();
      router.replace('/login');
      setIsChecking(false);
      return;
    }

    // Validate session with backend silently
    api.get('/auth/me').then(res => {
      const realUser = { id: res.data.id || res.data._id, email: res.data.email };
      const current = useAuthStore.getState().user;
      if (current && (current.id !== realUser.id || current.email !== realUser.email)) {
        useAuthStore.setState({ user: realUser });
      }
    }).catch(() => {
      // Axios interceptor will handle 401 and refresh, 
      // if refresh fails it logs out and clears storage.
    }).finally(() => {
      setIsChecking(false);
    });
  }, [isAuthenticated, hasHydrated, router]);

  if (isChecking) {
    return null; // Return absolutely nothing while checking auth to prevent UI flashes
  }

  return <>{children}</>;
}
