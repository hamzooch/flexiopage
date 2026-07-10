import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Store } from '../types';

/** Boutique actuellement sélectionnée (équivalent du store-store.ts web). */
interface StoreState {
  current: Store | null;
  setCurrent: (store: Store | null) => void;
}

export const useStoreStore = create<StoreState>()(
  persist(
    (set) => ({
      current: null,
      setCurrent: (store) => set({ current: store }),
    }),
    {
      name: 'flexiopage-current-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
