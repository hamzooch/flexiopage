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
 * We read the persisted blob straight from localStorage instead of waiting
 * for zustand's hydration callback — the callback was occasionally never
 * firing and the page hung on "Loading..." indefinitely.
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

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const fetchUser = useAuthStore((s) => s.fetchUser);
  const [mounted, setMounted] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
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
    // Best-effort refresh des données serveur (emailVerified à jour si l'admin
    // a vérifié manuellement, toggles plateforme pour la bannière). Pas await
    // pour ne pas bloquer le render — les composants se mettront à jour quand
    // le store change.
    void fetchUser();
  }, [mounted, pathname, router, fetchUser]);

  if (!mounted || redirecting) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}
