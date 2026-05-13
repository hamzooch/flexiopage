import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '@/lib/api';

export interface User {
  _id: string;
  email: string;
  name: string;
  role?: string;
  avatar?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User | null, token: string | null) => void;
  logout: () => void;
  fetchUser: () => Promise<void>;
  isAuthenticated: boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      get isAuthenticated() {
        return !!get().token && !!get().user;
      },
      setAuth: (user, token) => {
        if (typeof window !== 'undefined' && token) localStorage.setItem('token', token);
        set({ user, token, isAuthenticated: !!(user && token) });
      },
      logout: async () => {
        try {
          await authApi.logout();
        } catch {}
        if (typeof window !== 'undefined') localStorage.removeItem('token');
        set({ user: null, token: null, isAuthenticated: false });
      },
      fetchUser: async () => {
        const { token } = get();
        if (!token) return;
        try {
          const { data } = await authApi.me();
          const user = (data as { user: User }).user;
          set({ user, isAuthenticated: true });
        } catch {
          set({ user: null, token: null, isAuthenticated: false });
        }
      },
    }),
    { name: 'boutshop-auth', partialize: (s) => ({ token: s.token, user: s.user }) }
  )
);
