import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface StoreItem {
  _id: string;
  name: string;
  slug: string;
  subdomain: string;
  isPublished?: boolean;
  [key: string]: unknown;
}

interface StoreState {
  currentStoreId: string | null;
  setCurrentStore: (id: string | null) => void;
  clearCurrentStore: () => void;
}

export const useStoreStore = create<StoreState>()(
  persist(
    (set) => ({
      currentStoreId: null,
      setCurrentStore: (id) => set({ currentStoreId: id }),
      clearCurrentStore: () => set({ currentStoreId: null }),
    }),
    { name: 'flexiopage-current-store' }
  )
);
