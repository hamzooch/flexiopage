'use client';

/**
 * Hub des boutiques du vendeur. Page dédiée (ex-redirect vers /profile#stores) —
 * affichage focalisé : seules les boutiques dont le vendeur est propriétaire
 * sont listées (le backend `GET /api/stores` filtre déjà via effectiveOwnerId).
 * UI : héro + KPIs, recherche + filtres, grille de cartes premium.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Package,
  Pencil,
  Search,
  Sparkles,
  Store as StoreIcon,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStoreStore } from '@/stores/store-store';
import { storesApi } from '@/lib/api';
import { CreateStoreWizard } from '@/components/dashboard/create-store-wizard';
import { cn, mediaUrl, publicStoreUrl } from '@/lib/utils';

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
}

type StatusFilter = 'all' | 'live' | 'draft';
type TypeFilter = 'all' | 'physical' | 'digital';

const MAX_STORES = 4;

export default function MyStoresPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const setCurrentStore = useStoreStore((s) => s.setCurrentStore);

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
    return stores.filter((s) => {
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
  }, [stores, query, statusFilter, typeFilter]);

  const limitReached = stores.length >= MAX_STORES;
  const activeStore = stores.find((s) => s._id === currentStoreId);

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─────────────────── HERO ─────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-indigo-500/20 via-violet-500/10 to-transparent blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-gradient-to-tr from-fuchsia-500/15 to-transparent blur-3xl" aria-hidden />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500/10 to-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-violet-700">
              <Sparkles className="h-3 w-3" />
              Espace vendeur
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Mes boutiques</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Toutes les boutiques que tu possèdes. Sélectionne celle sur laquelle travailler,
              ouvre les réglages ou consulte le storefront public.
            </p>
          </div>
          {!limitReached && (
            <div id="create-store" className="shrink-0">
              <CreateStoreWizard
                onCreated={handleStoreCreated}
                triggerLabel={stores.length === 0 ? 'Créer ma première boutique' : 'Nouvelle boutique'}
              />
            </div>
          )}
        </div>

        {/* KPIs — quick read on the seller's portfolio. */}
        <div className="relative mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <KpiPill label="Total" value={counts.total} accent="indigo" />
          <KpiPill label="En ligne" value={counts.live} accent="emerald" />
          <KpiPill label="Brouillons" value={counts.drafts} accent="amber" />
          <KpiPill label="Quota" value={`${counts.total} / ${MAX_STORES}`} accent="violet" />
        </div>
      </section>

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

      {/* ─────────────────── FILTRES ─────────────────── */}
      {stores.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
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
                { id: 'all', label: 'Type', count: counts.total },
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((store) => (
            <StoreCard
              key={store._id}
              store={store}
              isActive={store._id === currentStoreId}
              onUse={() => pickStore(store._id)}
            />
          ))}
        </div>
      )}

      {/* ─────────────────── BOUTIQUE ACTIVE ─────────────────── */}
      {activeStore && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-foreground/80">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
          <span>
            Boutique active : <strong>{activeStore.name}</strong> — le tableau de bord est scopé à cette boutique.
          </span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────── COMPOSANTS ─────────────────── */

function KpiPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: 'indigo' | 'emerald' | 'amber' | 'violet';
}) {
  const tones: Record<string, string> = {
    indigo: 'from-indigo-500/15 to-indigo-500/5 text-indigo-700 ring-indigo-500/20',
    emerald: 'from-emerald-500/15 to-emerald-500/5 text-emerald-700 ring-emerald-500/20',
    amber: 'from-amber-500/15 to-amber-500/5 text-amber-700 ring-amber-500/20',
    violet: 'from-violet-500/15 to-violet-500/5 text-violet-700 ring-violet-500/20',
  };
  return (
    <div
      className={cn(
        'rounded-2xl bg-gradient-to-br p-3 ring-1 ring-inset sm:p-4',
        tones[accent],
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</div>
    </div>
  );
}

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
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all sm:text-xs',
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
  const TypeIcon = isDigital ? Cloud : Package;
  const publicUrl = publicStoreUrl(store);
  const hostDisplay = store.customDomain && store.customDomainVerified
    ? store.customDomain
    : `/${store.slug}`;

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-300',
        isActive
          ? 'border-primary shadow-lg ring-2 ring-primary/20'
          : 'border-border/60 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg',
      )}
    >
      {/* Glow */}
      <div
        className={cn(
          'pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-25',
          isDigital ? 'from-fuchsia-500 to-pink-500' : 'from-indigo-500 to-violet-500',
        )}
        aria-hidden
      />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-3 p-5 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          {store.logo ? (
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/60 bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(store.logo) || store.logo} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div
              className={cn(
                'grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md',
                isDigital
                  ? 'from-fuchsia-500 to-pink-600 shadow-fuchsia-500/30'
                  : 'from-indigo-500 to-violet-600 shadow-indigo-500/30',
              )}
            >
              <TypeIcon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight">{store.name}</h3>
            <p className="truncate text-xs text-muted-foreground">{hostDisplay}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
              store.isPublished
                ? 'bg-emerald-500/10 text-emerald-700'
                : 'bg-amber-500/10 text-amber-700',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                store.isPublished ? 'bg-emerald-500' : 'bg-amber-500',
              )}
            />
            {store.isPublished ? 'En ligne' : 'Brouillon'}
          </span>
          {isActive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              <CheckCircle2 className="h-3 w-3" />
              Active
            </span>
          )}
        </div>
      </div>

      {/* Body — description + metadata */}
      <div className="relative space-y-3 px-5 pb-3">
        {store.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{store.description}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground/70">
            <TypeIcon className="h-3 w-3" />
            {isDigital ? 'Digital' : 'Physique'}
          </span>
          {store.customDomain && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                store.customDomainVerified
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : 'bg-amber-500/10 text-amber-700',
              )}
            >
              <Globe className="h-3 w-3" />
              {store.customDomainVerified ? 'Domaine vérifié' : 'Domaine en attente'}
            </span>
          )}
        </div>

        <StoreIdBadge storeId={store._id} />
      </div>

      {/* Footer — actions */}
      <div className="relative mt-auto flex flex-wrap gap-2 border-t border-border/60 bg-muted/20 p-4">
        {!isActive ? (
          <Button
            size="sm"
            onClick={onUse}
            className="h-9 flex-1 gap-1.5 rounded-lg gradient-brand text-white"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Utiliser
          </Button>
        ) : (
          <div className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/10 text-xs font-semibold text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Boutique active
          </div>
        )}
        <Link href={`/dashboard/stores/${store._id}`}>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg">
            <Pencil className="h-3.5 w-3.5" />
            Modifier boutique
          </Button>
        </Link>
        <Link href={publicUrl} target="_blank" rel="noopener">
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-9 gap-1.5 rounded-lg',
              !store.isPublished && 'border-amber-500/40 text-amber-700 hover:bg-amber-500/10',
            )}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Voir
          </Button>
        </Link>
      </div>
    </div>
  );
}

function StoreIdBadge({ storeId }: { storeId: string }) {
  const [copied, setCopied] = useState(false);
  const short = `${storeId.slice(0, 8)}…${storeId.slice(-4)}`;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(storeId);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          // clipboard refused — ignore silently
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      title="Copier l'ID de la boutique"
    >
      <span>{short}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-dashed border-border/60 bg-card/40 p-10 text-center sm:p-14">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-violet-500/5" aria-hidden />
      <div className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
        <StoreIcon className="h-7 w-7" />
      </div>
      <h2 className="relative mt-4 text-lg font-semibold tracking-tight">Aucune boutique pour le moment</h2>
      <p className="relative mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Lance ta première boutique en quelques minutes. Choisis le type (physique ou digital),
        sélectionne un thème, et c&apos;est parti.
      </p>
    </div>
  );
}
