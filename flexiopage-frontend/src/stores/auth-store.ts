import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '@/lib/api';

export type TeamRole = 'manager' | 'confirmation_agent';

export interface User {
  _id: string;
  email: string;
  name: string;
  role?: string;
  avatar?: string;
  /** Set when this account is a team member of a seller. */
  parentUserId?: string;
  /** Role within the parent seller's team. */
  teamRole?: TeamRole;
  /** True quand le seller a cliqué sur le lien Resend de confirmation. */
  emailVerified?: boolean;
}

/**
 * Toggles plateforme exposés par /auth/me. Permettent au frontend de savoir
 * si certains comportements globaux sont actifs (ex: bannière vérification
 * email cachée si admin a désactivé le système).
 */
export interface PlatformToggles {
  emailVerificationEnabled: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  /**
   * Toggles plateforme. `null` tant que /auth/me n'a pas répondu — dans ce
   * cas on assume le défaut « activé » pour éviter de masquer la bannière
   * pendant l'hydratation.
   */
  platform: PlatformToggles | null;
  setAuth: (user: User | null, token: string | null) => void;
  /** Merge partiel — pratique pour patcher emailVerified après /verify-email. */
  updateUser: (patch: Partial<User>) => void;
  logout: () => void;
  fetchUser: () => Promise<void>;
  isAuthenticated: boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      platform: null,
      get isAuthenticated() {
        return !!get().token && !!get().user;
      },
      setAuth: (user, token) => {
        set({ user, token, isAuthenticated: !!(user && token) });
      },
      updateUser: (patch) => {
        const current = get().user;
        if (!current) return;
        set({ user: { ...current, ...patch } });
      },
      logout: async () => {
        try {
          await authApi.logout();
        } catch {}
        set({ user: null, token: null, platform: null, isAuthenticated: false });
      },
      fetchUser: async () => {
        const { token } = get();
        if (!token) return;
        try {
          const { data } = await authApi.me();
          const payload = data as { user: User; platform?: PlatformToggles };
          set({
            user: payload.user,
            platform: payload.platform || null,
            isAuthenticated: true,
          });
        } catch {
          set({ user: null, token: null, platform: null, isAuthenticated: false });
        }
      },
    }),
    {
      name: 'flexiopage-auth',
      // `platform` n'est volontairement pas persisté — c'est un état serveur
      // qu'on re-fetche à chaque session pour pas servir un toggle obsolète.
      partialize: (s) => ({ token: s.token, user: s.user }),
    }
  )
);
