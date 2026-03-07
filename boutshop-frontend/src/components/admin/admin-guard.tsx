'use client';

/**
 * AdminGuard — wraps the /admin layout.
 *   1. Redirects to /login if not authenticated
 *   2. Redirects to /dashboard if authenticated but role !== 'admin'
 *
 * Waits for the auth store to rehydrate from localStorage before deciding,
 * so we don't bounce out on a hard refresh.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Loader2, ShieldAlert } from 'lucide-react';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unsub = useAuthStore.persist?.onFinishHydration?.(() => setHydrated(true));
    const t = setTimeout(() => setHydrated(true), 300);
    return () => {
      clearTimeout(t);
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) {
      router.replace('/login?next=/admin');
      return;
    }
    if (user && (user as { role?: string }).role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [hydrated, token, user, router]);

  if (!hydrated || !token) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (user && (user as { role?: string }).role !== 'admin') {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div className="max-w-sm space-y-3">
          <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="text-xl font-bold">Accès admin requis</h1>
          <p className="text-sm text-muted-foreground">
            Ton compte n&apos;a pas les droits administrateur. Redirection vers le tableau de bord vendeur…
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
