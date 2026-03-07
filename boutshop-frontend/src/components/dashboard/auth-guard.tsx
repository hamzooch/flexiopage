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

  // Wait for Zustand persist to rehydrate from localStorage before checking auth
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unsub = useAuthStore.persist?.onFinishHydration?.(() => setHydrated(true));
    // Fallback: consider hydrated after short delay (in case onFinishHydration already ran)
    const t = setTimeout(() => setHydrated(true), 300);
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
