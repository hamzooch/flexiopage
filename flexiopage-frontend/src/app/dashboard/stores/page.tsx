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
            : `${counts.total} sur ${MAX_STORES}. Le tableau de bord suit la boutique marquée Active.`
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

      {stores.length > 1 && (
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
  const TypeIcon = isDigital ? Cloud : Package;
  const publicUrl = publicStoreUrl(store);
  const hostDisplay = store.customDomain && store.customDomainVerified
    ? store.customDomain
    : `/${store.slug}`;

  return (
    <article
      className={cn(
        'flex flex-col gap-4 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5',
        isActive ? 'border-primary/40' : 'border-border/60',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
      {store.logo ? (
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/60 bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(store.logo) || store.logo} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <TypeIcon className="h-5 w-5" />
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
          {isActive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Active
            </span>
          )}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="truncate">{hostDisplay}</span>
          <span aria-hidden>·</span>
          <span>{isDigital ? 'Digital' : 'Physique'}</span>
          {store.customDomain && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Globe className="h-3.5 w-3.5" />
                {store.customDomainVerified ? 'Domaine vérifié' : 'Domaine en attente'}
              </span>
            </>
          )}
          <StoreIdBadge storeId={store._id} />
        </p>
        {store.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{store.description}</p>
        ) : null}
      </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        {!isActive && (
          <Button onClick={onUse} className="h-10 gap-1.5">
            <ArrowRight className="h-4 w-4" />
            Utiliser
          </Button>
        )}
        <Button variant="outline" className="h-10 gap-1.5" asChild>
          <Link href={`/dashboard/stores/${store.slug || store._id}`}>
            <Pencil className="h-4 w-4" />
            Modifier
          </Link>
        </Button>
        <Button
          variant="outline"
          className={cn(
            'h-10 gap-1.5',
            !store.isPublished && 'border-amber-500/40 text-amber-800 hover:bg-amber-500/10',
          )}
          asChild
        >
          <Link href={publicUrl} target="_blank" rel="noopener">
            <ExternalLink className="h-4 w-4" />
            Voir
          </Link>
        </Button>
      </div>
    </article>
  );
}

function StoreIdBadge({ storeId }: { storeId: string }) {
  const [copied, setCopied] = useState(false);
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
      className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      title="Copier l'identifiant"
      aria-label={copied ? 'Identifiant copié' : "Copier l'identifiant de la boutique"}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copié' : 'ID'}
    </button>
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
