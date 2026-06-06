'use client';

/**
 * Post-login space picker for staff accounts (owner/superadmin/admin/supervisor).
 * Lets them choose between their seller dashboard and the platform admin area
 * instead of being silently routed to one of them.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  ShieldCheck,
  ArrowRight,
  Loader2,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { isStaff } from '@/lib/is-staff';
import { cn } from '@/lib/utils';

export default function SelectSpacePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const readPersistedToken = (): string | null => {
      const live = useAuthStore.getState().token;
      if (live) return live;
      try {
        const raw = window.localStorage.getItem('flexiopage-auth');
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
        return parsed?.state?.token ?? null;
      } catch {
        return null;
      }
    };

    const decide = () => {
      if (cancelled) return;
      const token = readPersistedToken();
      const currentUser = useAuthStore.getState().user;
      if (!token) {
        router.replace('/login');
        return;
      }
      // Non-staff accounts have nothing to pick — bounce them straight to
      // the seller store picker.
      if (!isStaff(currentUser)) {
        router.replace('/select-store');
        return;
      }
      setReady(true);
    };

    let unsub: (() => void) | undefined;
    if (useAuthStore.persist?.hasHydrated?.()) {
      decide();
    } else {
      unsub = useAuthStore.persist?.onFinishHydration?.(decide);
      const safety = window.setTimeout(decide, 800);
      return () => {
        cancelled = true;
        window.clearTimeout(safety);
        if (typeof unsub === 'function') unsub();
      };
    }
    return () => {
      cancelled = true;
      if (typeof unsub === 'function') unsub();
    };
  }, [router]);

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full gradient-brand opacity-10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-rose-500/10 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-10 sm:px-6 sm:py-16">
        <header className="mb-10 flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Connecté
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Bonjour <span className="gradient-brand-text">{user?.name?.split(' ')[0] || 'là'}</span> 👋
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Où veux-tu aller ? Tu peux changer d&apos;espace à tout moment depuis le menu.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Déconnexion
          </button>
        </header>

        <div className="grid gap-4 animate-fade-in-up sm:grid-cols-2">
          <SpaceCard
            title="Espace boutique"
            description="Gère tes produits, commandes et clients comme un vendeur."
            tone="brand"
            icon={<Briefcase className="h-6 w-6" />}
            onClick={() => router.push('/select-store')}
          />
          <SpaceCard
            title="Espace admin"
            description="Pilote la plateforme : utilisateurs, boutiques, paiements."
            tone="rose"
            icon={<ShieldCheck className="h-6 w-6" />}
            onClick={() => router.push('/admin')}
          />
        </div>
      </div>
    </div>
  );
}

function SpaceCard({
  title,
  description,
  icon,
  tone,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  tone: 'brand' | 'rose';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-left transition-all duration-300',
        'hover:-translate-y-0.5 hover:shadow-xl',
        tone === 'brand' ? 'hover:border-amber-500/40' : 'hover:border-rose-500/40'
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-25',
          tone === 'brand' ? 'from-amber-500 to-orange-600' : 'from-rose-500 to-pink-600'
        )}
        aria-hidden
      />
      <div
        className={cn(
          'relative grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md',
          tone === 'brand'
            ? 'from-amber-500 to-orange-600 shadow-orange-500/30'
            : 'from-rose-500 to-pink-600 shadow-rose-500/30'
        )}
      >
        {icon}
      </div>
      <h3 className="relative mt-4 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="relative mt-1 text-sm text-muted-foreground">{description}</p>
      <div
        className={cn(
          'relative mt-4 inline-flex items-center gap-1 text-sm font-medium transition-colors',
          tone === 'brand' ? 'text-amber-600 group-hover:text-amber-700' : 'text-rose-600 group-hover:text-rose-700'
        )}
      >
        Entrer
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}
