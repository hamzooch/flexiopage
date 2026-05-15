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
 * Zustand persist with localStorage rehydrates synchronously during module
 * init, so by the time this effect fires the state is already correct. We
 * read via `getState()` to avoid React's subscription one-frame lag that
 * used to bounce sellers back to /login on refresh.
 */

const STORELESS_ALLOWED = new Set(['/dashboard/profile']);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // localStorage reads are synchronous and zustand persist completes its
    // rehydration during module init — well before this effect runs. A
    // microtask (Promise.resolve()) is enough breathing room to let any
    // queued state updates flush before we read.
    Promise.resolve().then(() => {
      const { token } = useAuthStore.getState();
      const { currentStoreId } = useStoreStore.getState();
      if (!token) {
        router.replace('/login');
        return;
      }
      if (!currentStoreId && !STORELESS_ALLOWED.has(pathname)) {
        router.replace('/select-store');
        return;
      }
      setReady(true);
    });
  }, [pathname, router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}
