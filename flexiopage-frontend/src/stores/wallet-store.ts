/**
 * Tiny zustand store that mirrors the wallet for any component that wants to
 * read it (sidebar badges, generation cost preview, etc.). The wallet page
 * itself fetches via walletApi.get() directly to keep things explicit.
 */
import { create } from 'zustand';
import { walletApi, type WalletState } from '@/lib/api';

interface WalletStore {
  wallet: WalletState | null;
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
  setWallet: (w: WalletState) => void;
}

let inflight: Promise<void> | null = null;

export const useWalletStore = create<WalletStore>((set) => ({
  wallet: null,
  loading: false,
  refresh: async () => {
    if (inflight) return inflight;
    set({ loading: true, error: undefined });
    inflight = walletApi
      .get()
      .then((res) => {
        set({ wallet: res.data.wallet, loading: false });
      })
      .catch(() => {
        set({ loading: false, error: 'wallet fetch failed' });
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
  setWallet: (w) => set({ wallet: w }),
}));
