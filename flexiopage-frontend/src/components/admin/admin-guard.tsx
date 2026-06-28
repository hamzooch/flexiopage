'use client';

/**
 * AdminGuard — wraps the /admin layout.
 *   1. Redirects to /login if not authenticated
 *   2. Redirects to /dashboard if the user is a plain seller (role='user')
 *
 * Allowed staff roles: owner, superadmin, admin, supervisor.
 *
 * On lit le token/role en priorité depuis le store live, avec fallback sur le
 * blob persisté dans localStorage — comme le dashboard AuthGuard. On NE dépend
 * PAS du callback d'hydratation zustand (qui pouvait soit ne jamais se
 * déclencher → page figée, soit, avec un timeout de secours, marquer "hydraté"
 * avant la relecture du token → éjection vers /login au refresh). La décision
 * est différée après le 1ᵉʳ rendu client (`mounted`) pour éviter tout mismatch
 * SSR et toute redirection prématurée.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Loader2, ShieldAlert } from 'lucide-react';

const STAFF_ROLES = new Set(['owner', 'superadmin', 'admin', 'supervisor']);
const AUTH_STORAGE_KEY = 'flexiopage-auth';

function readPersistedAuth(): { token?: string | null; user?: { role?: string } | null } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string | null; user?: { role?: string } | null } };
    return parsed?.state ?? null;
  } catch {
    return null;
  }
}

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const liveToken = useAuthStore((s) => s.token);
  const liveUser = useAuthStore((s) => s.user) as { role?: string } | null;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Valeur effective : store live, sinon blob localStorage (le store live est
  // déjà réhydraté au render côté client, le fallback couvre les cas limites).
  // Lu seulement après mount → pas de divergence avec le rendu SSR (token null).
  const persisted = mounted ? readPersistedAuth() : null;
  const token = liveToken ?? persisted?.token ?? null;
  const user = liveUser ?? persisted?.user ?? null;
  const role = user?.role;
  const isStaff = role ? STAFF_ROLES.has(role) : false;

  useEffect(() => {
    if (!mounted) return;
    if (!token) {
      router.replace('/login?next=/admin');
      return;
    }
    if (user && !isStaff) {
      router.replace('/dashboard');
    }
  }, [mounted, token, user, isStaff, router]);

  if (!mounted || !token) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (user && !isStaff) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div className="max-w-sm space-y-3">
          <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="text-xl font-bold">Accès staff requis</h1>
          <p className="text-sm text-muted-foreground">
            Ton compte n&apos;a pas les droits sur la plateforme. Redirection vers le tableau de bord vendeur…
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
