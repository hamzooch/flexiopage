'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useStoreStore } from '@/stores/store-store';

/**
 * Two gates run before the dashboard renders:
 *   1. /login if no auth token
 *   2. /select-store if no `currentStoreId` is picked yet — the dashboard
 *      is scoped to a single store, so we force the picker first.
 *
 * We MUST wait for zustand persist to finish rehydrating from localStorage
 * before deciding — otherwise a hard refresh sees `token=null` and bounces
 * the seller to /login.
 *
 * The previous version used a 300ms timeout as a safety net, which itself
 * caused false /login bounces when hydration was slower than that. We now
 * skip the timer and read the persisted token straight from localStorage
 * as a last-resort fallback, so we can decide deterministically without
 * racing zustand's hydration microtask chain.
 */

const STORELESS_ALLOWED = new Set(['/dashboard/profile']);
const AUTH_STORAGE_KEY = 'flexiopage-auth';
const STORE_STORAGE_KEY = 'flexiopage-current-store';

function readPersisted<T = unknown>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: T };
    return (parsed && parsed.state) || null;
  } catch {
    return null;
  }
}

function resolveToken(): string | null {
  const live = useAuthStore.getState().token;
  if (live) return live;
  const persisted = readPersisted<{ token?: string | null }>(AUTH_STORAGE_KEY);
  return persisted?.token ?? null;
}

function resolveCurrentStoreId(): string | null {
  const live = useStoreStore.getState().currentStoreId;
  if (live) return live;
  const persisted = readPersisted<{ currentStoreId?: string | null }>(STORE_STORAGE_KEY);
  return persisted?.currentStoreId ?? null;
}

function awaitHydration(
  store: { persist?: { hasHydrated?: () => boolean; onFinishHydration?: (cb: () => void) => () => void } },
  onDone: () => void,
): () => void {
  if (!store.persist) {
    onDone();
    return () => {};
  }
  if (store.persist.hasHydrated?.()) {
    onDone();
    return () => {};
  }
  const unsub = store.persist.onFinishHydration?.(onDone);
  if (typeof unsub !== 'function') {
    // No subscription API → don't hang the UI; treat as already settled.
    onDone();
    return () => {};
  }
  return unsub;
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [hydrated, setHydrated] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // Wait for BOTH persisted stores to hydrate before reading their state.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let authDone = false;
    let storeDone = false;
    const check = () => {
      if (authDone && storeDone) setHydrated(true);
    };
    const unsubAuth = awaitHydration(useAuthStore, () => {
      authDone = true;
      check();
    });
    const unsubStore = awaitHydration(useStoreStore, () => {
      storeDone = true;
      check();
    });
    return () => {
      unsubAuth();
      unsubStore();
    };
  }, []);

  // Redirect logic runs only once hydration is settled. Falls back to
  // reading the persisted blob directly from localStorage so a slow
  // rehydration cannot make us think the user is logged out.
  useEffect(() => {
    if (!hydrated) return;
    const token = resolveToken();
    const currentStoreId = resolveCurrentStoreId();
    if (!token) {
      setRedirecting(true);
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!currentStoreId && !STORELESS_ALLOWED.has(pathname)) {
      setRedirecting(true);
      router.replace('/select-store');
      return;
    }
    setRedirecting(false);
  }, [hydrated, pathname, router]);

  if (!hydrated || redirecting) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}
