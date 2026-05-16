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
 * the seller to /login. We listen on both stores' `onFinishHydration` and
 * fall back to a short timeout in case hydration already fired.
 */

const STORELESS_ALLOWED = new Set(['/dashboard/profile']);

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
  return () => {
    if (typeof unsub === 'function') unsub();
  };
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
    // Safety net: if hydration somehow never fires (e.g. storage error),
    // fall back to whatever state is in memory after 300ms so we don't hang
    // on a blank Loading screen forever.
    const fallback = setTimeout(() => setHydrated(true), 300);
    return () => {
      unsubAuth();
      unsubStore();
      clearTimeout(fallback);
    };
  }, []);

  // Redirect logic runs only once hydration is settled.
  useEffect(() => {
    if (!hydrated) return;
    const { token } = useAuthStore.getState();
    const { currentStoreId } = useStoreStore.getState();
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
