'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Redirects to /login only after store has rehydrated from localStorage.
 * Avoids redirect on refresh when token is still loading from persist.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [hydrated, setHydrated] = useState(false);

  // Wait for Zustand persist to rehydrate from localStorage before checking auth.
  // hasHydrated()/onFinishHydration cover the normal paths; the timeout is a
  // hard fallback because persist with sync storage can finish before this
  // effect subscribes, leaving onFinishHydration with nothing to fire.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const markHydrated = () => setHydrated(true);
    if (useAuthStore.persist?.hasHydrated?.()) {
      markHydrated();
      return;
    }
    const unsub = useAuthStore.persist?.onFinishHydration?.(markHydrated);
    const t = setTimeout(markHydrated, 200);
    return () => {
      clearTimeout(t);
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    if (!token) {
      router.replace('/login');
    }
  }, [hydrated, token, router]);

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Redirecting to login...</p>
      </div>
    );
  }

  return <>{children}</>;
}
