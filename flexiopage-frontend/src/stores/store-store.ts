import { create } from 'zustand';

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
}

export const useStoreStore = create<StoreState>()((set) => ({
  currentStoreId: null,
  setCurrentStore: (id) => set({ currentStoreId: id }),
}));
