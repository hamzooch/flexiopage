'use client';

/**
 * Hub des boutiques du vendeur. Page dédiée (ex-redirect vers /profile#stores) —
 * affichage focalisé : seules les boutiques dont le vendeur est propriétaire
 * sont listées (le backend `GET /api/stores` filtre déjà via effectiveOwnerId).
 * UI : héro + KPIs, recherche + filtres, grille de cartes premium.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Search,
  Store as StoreIcon,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/dashboard/page-header';
import { useStoreStore } from '@/stores/store-store';
import { useAuthStore } from '@/stores/auth-store';
import { storesApi } from '@/lib/api';
import { CreateStoreWizard } from '@/components/dashboard/create-store-wizard';
import { cn, formatCurrency, mediaUrl, publicStoreUrl } from '@/lib/utils';

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  isPublished?: boolean;
  storeType?: 'physical' | 'digital';
  description?: string;
  customDomain?: string;
  customDomainVerified?: boolean;
  logo?: string;
  updatedAt?: string;
  settings?: { currency?: string };
  integrations?: { delivery?: { enabled?: boolean } };
  hub?: { productCount: number; openOrders: number; monthSales: number };
}

type StatusFilter = 'all' | 'live' | 'draft';
type TypeFilter = 'all' | 'physical' | 'digital';

export default function MyStoresPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const setCurrentStore = useStoreStore((s) => s.setCurrentStore);
  // Limite par-compte : override admin (`user.storeLimit`) sinon défaut aligné
  // avec le backend (`STORE_LIMIT_PER_USER`, 4 par défaut).
  const authUser = useAuthStore((s) => s.user);
  const MAX_STORES = typeof authUser?.storeLimit === 'number' ? authUser.storeLimit : 4;

  const [stores, setStores] = useState<StoreDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  useEffect(() => {
    storesApi
      .list()
      .then((res) => {
        setStores(((res.data as { stores: StoreDoc[] }).stores) || []);
      })
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
  }, []);

  // ?create=1 → just scroll into the wizard area; the wizard itself opens on click.
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      const el = document.getElementById('create-store');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searchParams]);

  function handleStoreCreated(newId: string) {
    storesApi.list().then((res) => {
      setStores(((res.data as { stores: StoreDoc[] }).stores) || []);
    });
    setCurrentStore(newId);
    router.push('/dashboard');
  }

  function pickStore(storeId: string) {
    setCurrentStore(storeId);
    router.push('/dashboard');
  }

  const counts = useMemo(() => {
    const total = stores.length;
    const live = stores.filter((s) => s.isPublished).length;
    const drafts = total - live;
    const digital = stores.filter((s) => s.storeType === 'digital').length;
    return { total, live, drafts, digital, physical: total - digital };
  }, [stores]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = stores.filter((s) => {
      if (statusFilter === 'live' && !s.isPublished) return false;
      if (statusFilter === 'draft' && s.isPublished) return false;
      if (typeFilter !== 'all' && (s.storeType || 'physical') !== typeFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.customDomain || '').toLowerCase().includes(q)
      );
    });
    list.sort((a, b) => {
      if (a._id === currentStoreId) return -1;
      if (b._id === currentStoreId) return 1;
      return 0;
    });
    return list;
  }, [stores, query, statusFilter, typeFilter, currentStoreId]);

  const limitReached = stores.length >= MAX_STORES;

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={StoreIcon}
        title="Mes boutiques"
        description={
          stores.length === 0
            ? 'Crée ta première boutique pour commencer à vendre.'
            : 'Le tableau de bord suit la boutique que tu ouvres.'
        }
        actions={
          !limitReached ? (
            <div id="create-store">
              <CreateStoreWizard
                onCreated={handleStoreCreated}
                triggerLabel={stores.length === 0 ? 'Créer ma première boutique' : 'Nouvelle boutique'}
              />
            </div>
          ) : null
        }
      />

      {/* ─────────────────── LIMITE ATTEINTE ─────────────────── */}
      {limitReached && (
        <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">
              Limite atteinte — {stores.length}/{MAX_STORES} boutiques
            </p>
            <p className="mt-0.5 text-xs text-amber-800/80">
              Chaque compte peut créer jusqu&apos;à {MAX_STORES} boutiques. Supprime une boutique
              existante ou contacte le support pour augmenter ta limite.
            </p>
          </div>
        </div>
      )}

      {stores.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, (stores.length / Math.max(MAX_STORES, 1)) * 100)}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {stores.length}/{MAX_STORES} boutiques
          </span>
        </div>
      )}

      {stores.length >= 3 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher par nom, slug ou domaine…"
              className="h-10 rounded-xl pl-9 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Effacer la recherche"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterGroup
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { id: 'all', label: 'Tous', count: counts.total },
                { id: 'live', label: 'En ligne', count: counts.live },
                { id: 'draft', label: 'Brouillons', count: counts.drafts },
              ]}
            />
            <FilterGroup
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { id: 'all', label: 'Tous types', count: counts.total },
                { id: 'physical', label: 'Physique', count: counts.physical },
                { id: 'digital', label: 'Digital', count: counts.digital },
              ]}
            />
          </div>
        </div>
      )}

      {/* ─────────────────── LISTE ─────────────────── */}
      {stores.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aucune boutique ne correspond à ce filtre.</p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setStatusFilter('all');
              setTypeFilter('all');
            }}
            className="mt-3 text-xs font-semibold text-primary hover:underline"
          >
            Réinitialiser les filtres
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((store) => (
            <li key={store._id}>
              <StoreCard
                store={store}
                isActive={store._id === currentStoreId}
                onUse={() => pickStore(store._id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─────────────────── COMPOSANTS ─────────────────── */

interface FilterOption<T extends string> {
  id: T;
  label: string;
  count: number;
}

function FilterGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: FilterOption<T>[];
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-border/60 bg-card p-1 shadow-sm">
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all',
              active
                ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {opt.label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none tabular-nums',
                active ? 'bg-white/25 text-white' : 'bg-muted text-foreground/70',
              )}
            >
              {opt.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StoreCard({
  store,
  isActive,
  onUse,
}: {
  store: StoreDoc;
  isActive: boolean;
  onUse: () => void;
}) {
  const isDigital = store.storeType === 'digital';
  const publicUrl = publicStoreUrl(store);
  const manageHref = `/dashboard/stores/${store.slug || store._id}`;
  const currency = store.settings?.currency || 'USD';
  const hub = store.hub;
  const gaps = store.isPublished ? [] : draftGaps(store, manageHref);

  return (
    <article
      className={cn(
        'rounded-2xl border bg-card p-4 sm:p-5',
        isActive ? 'border-primary/40 p-5 shadow-sm sm:p-6' : 'border-border/60',
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {store.logo ? (
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/60 bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(store.logo) || store.logo} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <StoreIcon className="h-5 w-5" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold tracking-tight">{store.name}</h2>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                  store.isPublished
                    ? 'bg-emerald-500/10 text-emerald-700'
                    : 'bg-amber-500/10 text-amber-800',
                )}
              >
                <span
                  className={cn('h-1.5 w-1.5 rounded-full', store.isPublished ? 'bg-emerald-500' : 'bg-amber-500')}
                  aria-hidden
                />
                {store.isPublished ? 'En ligne' : 'Brouillon'}
              </span>
              <span className="text-xs text-muted-foreground">{isDigital ? 'Digital' : 'Physique'}</span>
              {isActive && (
                <span className="text-xs font-medium text-muted-foreground">Tableau de bord</span>
              )}
            </div>
            <CopyLink url={publicUrl} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
          {isActive ? (
            <Button className="h-10 gap-1.5" asChild>
              <Link href={manageHref}>Gérer</Link>
            </Button>
          ) : (
            <Button onClick={onUse} className="h-10 gap-1.5">
              <ArrowRight className="h-4 w-4" />
              Ouvrir
            </Button>
          )}
          <Link
            href={publicUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex h-10 items-center gap-1.5 px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
            Vitrine
          </Link>
          <StoreMenu storeId={store._id} />
        </div>
      </div>

      <div className={cn('mt-4 grid grid-cols-3 gap-2', isActive && 'sm:gap-3')}>
        <Stat label="Ventes du mois" value={formatCurrency(hub?.monthSales ?? 0, currency)} emphasize={isActive} />
        <Stat label="À traiter" value={String(hub?.openOrders ?? 0)} emphasize={isActive} />
        <Stat label="Produits" value={String(hub?.productCount ?? 0)} emphasize={isActive} />
      </div>

      {gaps.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-border/60 pt-3">
          {gaps.map((gap) => (
            <li key={gap.label}>
              <Link href={gap.href} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/60">
                <span className="font-medium text-amber-800">{gap.label}</span>
                <span className="text-xs font-semibold text-muted-foreground">Régler</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!store.isPublished && gaps.length === 0 && (
        <Link
          href={`${manageHref}?block=identity`}
          className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm"
        >
          <span className="font-medium text-emerald-800">Prête à publier</span>
          <span className="text-xs font-semibold text-emerald-800">Mettre en ligne</span>
        </Link>
      )}
    </article>
  );
}

function draftGaps(store: StoreDoc, manageHref: string): Array<{ label: string; href: string }> {
  const gaps: Array<{ label: string; href: string }> = [];
  if (!store.logo) gaps.push({ label: 'Logo manquant', href: `${manageHref}?block=branding` });
  if ((store.hub?.productCount ?? 0) === 0) {
    gaps.push({ label: 'Aucun produit', href: `/dashboard/products?storeId=${store._id}` });
  }
  if ((store.storeType || 'physical') !== 'digital' && !store.integrations?.delivery?.enabled) {
    gaps.push({ label: 'Livraison non connectée', href: `${manageHref}?block=delivery` });
  }
  return gaps;
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 truncate font-semibold tabular-nums', emphasize ? 'text-base' : 'text-sm')}>{value}</div>
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const display = url.replace(/^https?:\/\//, '');
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          // clipboard refused
        }
      }}
      className="mt-1 inline-flex max-w-full items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      title="Copier le lien public"
    >
      <span className="truncate">{display}</span>
      {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
    </button>
  );
}

function StoreMenu({ storeId }: { storeId: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Plus d'actions"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-border/60 bg-card p-1 shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(storeId);
                setCopied(true);
                window.setTimeout(() => setOpen(false), 700);
              } catch {
                setOpen(false);
              }
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Identifiant copié' : "Copier l'identifiant"}
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card px-6 py-14 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <StoreIcon className="h-6 w-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">Aucune boutique pour le moment</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Lance ta première boutique en quelques minutes. Choisis le type (physique ou digital),
        sélectionne un thème, et c&apos;est parti.
      </p>
    </div>
  );
}
