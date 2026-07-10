import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../types';
import { setToken, clearToken } from '../lib/token';

/**
 * État d'authentification.
 *
 * Le JWT lui-même vit dans SecureStore (token.ts), PAS ici — SecureStore est
 * chiffré (Keychain/Keystore) et plafonné à ~2KB. On ne persiste donc dans
 * AsyncStorage que le profil utilisateur et le flag isAuthenticated, qui
 * permettent d'afficher l'UI tout de suite au démarrage.
 */
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  signIn: (user: User, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      hydrated: false,
      signIn: async (user, token) => {
        await setToken(token);
        set({ user, isAuthenticated: true });
      },
      signOut: async () => {
        await clearToken();
        set({ user: null, isAuthenticated: false });
      },
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'flexiopage-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
