import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { queryClient } from '@/src/lib/queryClient';

interface User {
  id: string;
  email: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  login: (user: User, token: string, refreshToken: string, rememberMe?: boolean) => void;
  logout: () => void;
  setHasHydrated: (state: boolean) => void;
}

const authStorage = {
  getItem: (name: string) => {
    return localStorage.getItem(name) || sessionStorage.getItem(name);
  },
  setItem: (name: string, value: string) => {
    if (localStorage.getItem('remember_me') === 'true') {
      localStorage.setItem(name, value);
      sessionStorage.removeItem(name);
    } else {
      sessionStorage.setItem(name, value);
      localStorage.removeItem(name);
    }
  },
  removeItem: (name: string) => {
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  }
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
      login: (user, token, refreshToken, rememberMe = false) => {
        if (rememberMe) {
          localStorage.setItem('remember_me', 'true');
          localStorage.setItem('access_token', token);
          localStorage.setItem('refresh_token', refreshToken);
          sessionStorage.removeItem('access_token');
          sessionStorage.removeItem('refresh_token');
        } else {
          localStorage.removeItem('remember_me');
          sessionStorage.setItem('access_token', token);
          sessionStorage.setItem('refresh_token', refreshToken);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
        set({ user, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('remember_me');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        sessionStorage.removeItem('access_token');
        sessionStorage.removeItem('refresh_token');
        queryClient.clear();
        set({ user: null, isAuthenticated: false });
        
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      },
      setHasHydrated: (state) => {
        set({ hasHydrated: state });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => authStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
        } else {
          useAuthStore.setState({ hasHydrated: true });
        }
      },
    }
  )
);
