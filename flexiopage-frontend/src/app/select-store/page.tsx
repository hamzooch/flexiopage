'use client';

/**
 * Post-login store picker — each store is rendered as its own card so the
 * seller picks ONE before entering the dashboard. The chosen store id is
 * persisted via useStoreStore and the dashboard pages scope themselves to it.
 *
 * If the seller has zero stores they are nudged to /dashboard/profile where
 * the creation wizard lives.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { storesApi } from '@/lib/api';
import { useStoreStore } from '@/stores/store-store';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import {
  Store as StoreIcon,
  Package,
  Cloud,
  ArrowRight,
  Plus,
  Loader2,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  isPublished?: boolean;
  storeType?: 'physical' | 'digital';
  description?: string;
}

export default function SelectStorePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setCurrentStore = useStoreStore((s) => s.setCurrentStore);
  const [stores, setStores] = useState<StoreDoc[] | null>(null);
  const [authed, setAuthed] = useState(false);

  // Persist with localStorage rehydrates synchronously during module init,
  // so by the time this effect runs the state is already correct. A
  // microtask (Promise.resolve()) lets any queued updates flush before we
  // read. getState() avoids React's subscription one-frame lag.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    Promise.resolve().then(() => {
      const { token } = useAuthStore.getState();
      if (!token) {
        router.replace('/login');
        return;
      }
      setAuthed(true);
      storesApi
        .list()
        .then((res) => setStores((res.data as { stores: StoreDoc[] }).stores || []))
        .catch(() => setStores([]));
    });
  }, [router]);

  function pick(storeId: string) {
    setCurrentStore(storeId);
    router.push('/dashboard');
  }

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  // Hold the render until the persist check confirms a session — otherwise
  // the page would briefly flash the greeting + empty list for guests.
  if (!authed) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Decorative background glows */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full gradient-brand opacity-10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-10 sm:px-6 sm:py-16">
        {/* Header */}
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
              Choisis une boutique pour entrer dans son tableau de bord.
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

        {/* Content */}
        {stores === null ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : stores.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4 animate-fade-in-up">
            {stores.map((store, i) => (
              <StoreCard
                key={store._id}
                store={store}
                index={i}
                onPick={() => pick(store._id)}
              />
            ))}

            {/* Create new — sends to profile where the wizard lives */}
            <Link
              href="/dashboard/profile?create=1"
              className="group block rounded-2xl border-2 border-dashed border-border/60 bg-card/40 p-5 text-center transition-all hover:border-primary/50 hover:bg-card"
            >
              <div className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-foreground">
                <Plus className="h-4 w-4" />
                Créer une nouvelle boutique
              </div>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Tu seras redirigé vers ton profil pour lancer le wizard de création.
              </p>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function StoreCard({
  store,
  index,
  onPick,
}: {
  store: StoreDoc;
  index: number;
  onPick: () => void;
}) {
  const isDigital = store.storeType === 'digital';
  const TypeIcon = isDigital ? Cloud : Package;
  return (
    <button
      type="button"
      onClick={onPick}
      style={{ animationDelay: `${index * 60}ms` }}
      className={cn(
        'group relative w-full overflow-hidden rounded-2xl border border-border/60 bg-card p-6 text-left transition-all duration-300 animate-fade-in-up',
        'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-xl'
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-25',
          isDigital ? 'from-fuchsia-500 to-pink-500' : 'from-indigo-500 to-violet-500'
        )}
        aria-hidden
      />

      <div className="relative flex items-center gap-4">
        <div
          className={cn(
            'grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md',
            isDigital
              ? 'from-fuchsia-500 to-pink-600 shadow-fuchsia-500/30'
              : 'from-indigo-500 to-violet-600 shadow-indigo-500/30'
          )}
        >
          <TypeIcon className="h-6 w-6" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg font-semibold tracking-tight">{store.name}</h3>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                store.isPublished
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : 'bg-amber-500/10 text-amber-700'
              )}
            >
              {store.isPublished ? 'Live' : 'Brouillon'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">/{store.slug}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className={cn(isDigital ? 'text-fuchsia-600' : 'text-indigo-600')}>
              {isDigital ? 'Digital' : 'Physique'}
            </span>
          </div>
          {store.description && (
            <p className="mt-2 truncate text-sm text-muted-foreground">{store.description}</p>
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-1 rounded-xl bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-all group-hover:bg-primary group-hover:text-white sm:inline-flex">
          Entrer
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-12 text-center animate-fade-in-up">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl gradient-brand text-white shadow-lg shadow-primary/30 animate-float">
        <StoreIcon className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-semibold">Tu n&apos;as pas encore de boutique</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Lance-toi en quelques clics — ton profil contient le wizard de création.
      </p>
      <Link href="/dashboard/profile?create=1" className="mt-6 inline-block">
        <Button className="h-11 gap-2 rounded-xl gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-95">
          <Plus className="h-4 w-4" />
          Créer ma première boutique
        </Button>
      </Link>
    </div>
  );
}
