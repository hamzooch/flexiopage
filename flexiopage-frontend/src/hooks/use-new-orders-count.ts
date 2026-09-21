'use client';

/**
 * Badge « nouvelles commandes » pour la sidebar.
 *
 * Compte les commandes créées après la dernière visite de /dashboard/orders
 * (par boutique, en localStorage). Ouvrir Commandes remet le compteur à 0.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { storesApi } from '@/lib/api';

const POLL_MS = 30_000;

function storageKey(storeId: string): string {
  return `flexiopage:orders-last-seen:${storeId}`;
}

function readLastSeen(storeId: string): string {
  try {
    const raw = window.localStorage.getItem(storageKey(storeId));
    if (raw && !Number.isNaN(new Date(raw).getTime())) return raw;
  } catch {
    /* private mode */
  }
  return markOrdersSeen(storeId);
}

export function markOrdersSeen(storeId: string): string {
  const now = new Date().toISOString();
  try {
    window.localStorage.setItem(storageKey(storeId), now);
  } catch {
    /* private mode */
  }
  return now;
}

function isOrdersPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === '/dashboard/orders' || pathname.startsWith('/dashboard/orders/');
}

export function useNewOrdersCount(storeId: string | null): number {
  const pathname = usePathname();
  const onOrdersPage = isOrdersPath(pathname);
  const [count, setCount] = useState(0);

  const refresh = useCallback(async (signal?: { cancelled: boolean }) => {
    if (!storeId) {
      if (!signal?.cancelled) setCount(0);
      return;
    }
    if (onOrdersPage) {
      markOrdersSeen(storeId);
      if (!signal?.cancelled) setCount(0);
      return;
    }
    const since = readLastSeen(storeId);
    try {
      const res = await storesApi.countNewOrders(storeId, since);
      if (!signal?.cancelled) setCount(res.data.count || 0);
    } catch {
      /* badge stays at last known count */
    }
  }, [storeId, onOrdersPage]);

  useEffect(() => {
    const signal = { cancelled: false };
    void refresh(signal);
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refresh(signal);
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void refresh(signal);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      signal.cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      if (storeId && onOrdersPage) markOrdersSeen(storeId);
    };
  }, [refresh, storeId, onOrdersPage]);

  return onOrdersPage ? 0 : count;
}
