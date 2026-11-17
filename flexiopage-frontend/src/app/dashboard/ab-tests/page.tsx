'use client';

/**
 * Overview de tous les tests A/B d'une boutique. Liste les produits qui ont
 * au moins une variante de page produit, affiche un résumé par produit
 * (variantes actives, meilleur variant, uplift, CVR max) et un lien direct
 * vers l'éditeur par-produit (onglet A/B) pour éditer les variants ou lire
 * le détail du funnel.
 *
 * Le but : repérer en 3 secondes quel test gagne, lequel stagne, et sur
 * lequel il faut cliquer pour agir — sans ouvrir chaque produit un par un.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, FlaskConical, Loader2, Plus, Trophy, Info } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { cn } from '@/lib/utils';

type Range = '7d' | '30d' | '90d';

interface StoreLite { _id: string; name: string }

interface ProductRow {
  _id: string;
  name: string;
  slug: string;
  images?: string[];
  pageVariants?: Array<{
    _id?: string;
    name: string;
    enabled?: boolean;
    weight?: number;
  }>;
}

interface AbVariantStat {
  variantId: string;
  name: string;
  isControl: boolean;
  enabled: boolean;
  views: number;
  purchases: number;
  cvr: number;
  uplift?: number;
  pValue?: number;
  winner?: boolean;
}

interface ProductTestSummary {
  productId: string;
  productName: string;
  productSlug: string;
  image?: string;
  variantsCount: number;
  activeVariantsCount: number;
  totalViews: number;
  totalPurchases: number;
  bestVariant: AbVariantStat | null;
  controlCvr: number;
  loading: boolean;
  error?: string;
}

const RANGES: { value: Range; label: string }[] = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
];

function num(n: number): string {
  return n.toLocaleString('fr-FR');
}
function pct(n: number): string {
  return `${(Number.isFinite(n) ? n : 0).toFixed(1)} %`;
}

export default function AbTestsOverviewPage() {
  const searchParams = useSearchParams();
  const { storeId, setStoreId: setStoreIdScoped } = useScopedStoreId(searchParams.get('storeId'));
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [range, setRange] = useState<Range>('30d');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [summaries, setSummaries] = useState<Record<string, ProductTestSummary>>({});
  const [loading, setLoading] = useState(true);

  const setStoreId = (id: string) => setStoreIdScoped(id || null);

  // Load store list once — on bascule automatiquement sur la 1ʳᵉ si rien
  // n'est encore sélectionné.
  useEffect(() => {
    void storesApi
      .list()
      .then((res) => {
        const list = (res.data as { stores: StoreLite[] }).stores;
        setStores(list);
        if (!storeId && list.length > 0) setStoreId(list[0]._id);
      })
      .catch(() => setStores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Load products + ab-stats pour chacun qui a au moins une variante. On fait
  // les stats en parallèle (Promise.all) mais sans attendre le tout pour
  // afficher le squelette — chaque ligne passe loading→ready séparément.
  const loadAll = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setSummaries({});
    try {
      const res = await storesApi.listProducts(storeId, { limit: 200 });
      const list = ((res.data as { products: ProductRow[] }).products || []).filter(
        (p) => Array.isArray(p.pageVariants) && p.pageVariants.length > 0,
      );
      setProducts(list);
      setLoading(false);
      // Prime la map avec tous les produits en loading
      const seed: Record<string, ProductTestSummary> = {};
      for (const p of list) {
        seed[p._id] = {
          productId: p._id,
          productName: p.name,
          productSlug: p.slug,
          image: p.images?.[0],
          variantsCount: p.pageVariants?.length || 0,
          activeVariantsCount: (p.pageVariants || []).filter(
            (v) => v.enabled !== false && (typeof v.weight !== 'number' || v.weight > 0),
          ).length,
          totalViews: 0,
          totalPurchases: 0,
          bestVariant: null,
          controlCvr: 0,
          loading: true,
        };
      }
      setSummaries(seed);
      // Fetch ab-stats en parallèle
      await Promise.all(
        list.map(async (p) => {
          try {
            const statsRes = await storesApi.getProductAbStats(storeId, p._id, range);
            const d = statsRes.data;
            const variants = d.variants as AbVariantStat[];
            const control = variants.find((v) => v.isControl);
            const non = variants.filter((v) => !v.isControl);
            // Meilleure variante : d'abord un winner avéré (p<0.05 & uplift>0),
            // sinon celui qui a le meilleur uplift positif, sinon le meilleur CVR.
            let best: AbVariantStat | null =
              non.find((v) => v.winner) ||
              [...non].sort((a, b) => (b.uplift || -Infinity) - (a.uplift || -Infinity))[0] ||
              null;
            if (best && (best.uplift === undefined || best.views === 0)) best = null;
            setSummaries((prev) => ({
              ...prev,
              [p._id]: {
                ...prev[p._id],
                totalViews: variants.reduce((s, v) => s + v.views, 0),
                totalPurchases: variants.reduce((s, v) => s + v.purchases, 0),
                controlCvr: control?.cvr || 0,
                bestVariant: best,
                loading: false,
              },
            }));
          } catch {
            setSummaries((prev) => ({
              ...prev,
              [p._id]: { ...prev[p._id], loading: false, error: 'Stats indisponibles' },
            }));
          }
        }),
      );
    } catch {
      setProducts([]);
      setSummaries({});
      setLoading(false);
    }
  }, [storeId, range]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const currentStore = stores.find((s) => s._id === storeId);
  const summaryList = useMemo(() => Object.values(summaries), [summaries]);

  // KPIs d'en-tête : combien de tests actifs, variantes qui gagnent, vues totales
  const totalTests = summaryList.length;
  const winnersCount = summaryList.filter((s) => s.bestVariant?.winner).length;
  const totalViews = summaryList.reduce((s, r) => s + r.totalViews, 0);
  const totalPurchases = summaryList.reduce((s, r) => s + r.totalPurchases, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FlaskConical}
        title="Tests A/B"
        description="Compare les variantes de tes pages produit — la gagnante remplace l'originale quand les chiffres sont assez solides."
        actions={
          <>
            {stores.length === 1 && currentStore && (
              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-xs font-medium">
                {currentStore.name}
              </span>
            )}
            {stores.length > 1 && (
              <select
                className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
                value={storeId || ''}
                onChange={(e) => setStoreId(e.target.value)}
              >
                {stores.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <div className="inline-flex rounded-xl bg-muted/50 p-1">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRange(r.value)}
                  className={cn(
                    'rounded-lg px-3 py-1 text-xs font-medium transition-colors',
                    range === r.value
                      ? 'bg-card text-foreground shadow'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      {/* Barre d'info pédagogique — on explique le concept vite fait sans que
          ça pousse le contenu principal. Masquée quand il y a déjà des tests. */}
      {!loading && totalTests === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10">
              <FlaskConical className="h-7 w-7 text-primary" />
            </div>
            <div className="max-w-md space-y-2">
              <h2 className="text-lg font-semibold">Lance ton premier test A/B</h2>
              <p className="text-sm text-muted-foreground">
                Choisis un produit, crée une variante (nouveau titre, nouveau prix, nouvelle image) et le trafic sera
                réparti au hasard entre les deux. On te dit laquelle convertit le mieux, avec un vrai calcul
                statistique.
              </p>
            </div>
            <Button asChild variant="default" size="sm">
              <Link href={`/dashboard/products${storeId ? `?storeId=${storeId}` : ''}`}>
                <Plus className="mr-1 h-4 w-4" />
                Choisir un produit
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPI row — apparait dès qu'au moins un test tourne. */}
      {totalTests > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Tests en cours" value={num(totalTests)} />
          <KpiCard
            label="Variantes gagnantes"
            value={num(winnersCount)}
            hint="p < 0,05 vs contrôle"
            accent={winnersCount > 0 ? 'emerald' : undefined}
          />
          <KpiCard label="Visiteurs mesurés" value={num(totalViews)} />
          <KpiCard label="Commandes mesurées" value={num(totalPurchases)} />
        </div>
      )}

      {/* Table des tests par produit. Sur desktop → table alignée, sur mobile →
          cartes empilées pour rester lisibles. */}
      {loading ? (
        <div className="grid h-40 place-items-center">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : totalTests > 0 ? (
        <Card>
          <CardContent className="p-0">
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pl-4 pr-3 font-medium">Produit</th>
                    <th className="px-3 py-2 text-center font-medium">Variantes</th>
                    <th className="px-3 py-2 text-right font-medium">Visiteurs</th>
                    <th className="px-3 py-2 text-right font-medium">CVR contrôle</th>
                    <th className="px-3 py-2 font-medium">Meilleure variante</th>
                    <th className="px-3 py-2 text-right font-medium">Uplift</th>
                    <th className="py-2 pl-3 pr-4 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryList.map((row) => (
                    <TestRow key={row.productId} row={row} range={range} storeId={storeId} />
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile card list */}
            <ul className="divide-y divide-border/60 md:hidden">
              {summaryList.map((row) => (
                <TestCard key={row.productId} row={row} storeId={storeId} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Footer pédagogique pour rassurer sur l'interprétation stat. */}
      {totalTests > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Une variante devient « gagnante » quand l'écart avec le contrôle est si marqué qu'il a moins de 5 %
            de chances d'être du hasard (p &lt; 0,05). En dessous : il faut plus de visiteurs avant de trancher.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Lignes ────────────────────────────────────────────────────────

function TestRow({
  row,
  range,
  storeId,
}: {
  row: ProductTestSummary;
  range: Range;
  storeId: string | null;
}) {
  const manageHref = storeId
    ? `/dashboard/products/${row.productId}?storeId=${storeId}&tab=ab-test`
    : `/dashboard/products/${row.productId}?tab=ab-test`;
  return (
    <tr className="border-b border-border/40 last:border-b-0 hover:bg-muted/20">
      <td className="py-3 pl-4 pr-3">
        <div className="flex items-center gap-3">
          {row.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.image}
              alt=""
              className="h-10 w-10 rounded-md object-cover ring-1 ring-border/60"
            />
          ) : (
            <div className="grid h-10 w-10 place-items-center rounded-md bg-muted text-muted-foreground">
              <FlaskConical className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-medium">{row.productName}</div>
            <div className="truncate text-xs text-muted-foreground">/{row.productSlug}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-center">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {row.activeVariantsCount}/{row.variantsCount} active{row.variantsCount > 1 ? 's' : ''}
        </span>
      </td>
      <td className="px-3 py-3 text-right tabular-nums">
        {row.loading ? <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin opacity-60" /> : num(row.totalViews)}
      </td>
      <td className="px-3 py-3 text-right tabular-nums font-semibold">
        {row.loading ? '—' : pct(row.controlCvr)}
      </td>
      <td className="px-3 py-3">
        {row.loading ? (
          <span className="text-xs text-muted-foreground">Chargement…</span>
        ) : row.bestVariant ? (
          <div className="flex items-center gap-2">
            {row.bestVariant.winner && <Trophy className="h-3.5 w-3.5 text-emerald-600" aria-hidden />}
            <span className="truncate text-sm font-medium">{row.bestVariant.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">({pct(row.bestVariant.cvr)})</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Données insuffisantes</span>
        )}
      </td>
      <td
        className={cn(
          'px-3 py-3 text-right tabular-nums font-medium',
          row.bestVariant?.uplift === undefined
            ? 'text-muted-foreground'
            : row.bestVariant.uplift > 0
              ? 'text-emerald-600'
              : row.bestVariant.uplift < 0
                ? 'text-destructive'
                : 'text-muted-foreground',
        )}
      >
        {row.bestVariant?.uplift !== undefined
          ? `${row.bestVariant.uplift > 0 ? '+' : ''}${row.bestVariant.uplift.toFixed(1)} pt`
          : '—'}
      </td>
      <td className="py-3 pl-3 pr-4 text-right">
        <Button asChild variant="outline" size="sm">
          <Link href={manageHref} className="inline-flex items-center gap-1">
            Gérer
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </td>
    </tr>
  );
}

function TestCard({ row, storeId }: { row: ProductTestSummary; storeId: string | null }) {
  const manageHref = storeId
    ? `/dashboard/products/${row.productId}?storeId=${storeId}&tab=ab-test`
    : `/dashboard/products/${row.productId}?tab=ab-test`;
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex items-center gap-3">
        {row.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.image} alt="" className="h-10 w-10 rounded-md object-cover ring-1 ring-border/60" />
        ) : (
          <div className="grid h-10 w-10 place-items-center rounded-md bg-muted text-muted-foreground">
            <FlaskConical className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{row.productName}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.activeVariantsCount}/{row.variantsCount} variante{row.variantsCount > 1 ? 's' : ''} active
            {row.activeVariantsCount > 1 ? 's' : ''}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={manageHref} aria-label="Gérer">
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Mini label="Visiteurs" value={row.loading ? '…' : num(row.totalViews)} />
        <Mini label="CVR contrôle" value={row.loading ? '…' : pct(row.controlCvr)} />
        <Mini
          label="Meilleur uplift"
          value={
            row.bestVariant?.uplift !== undefined
              ? `${row.bestVariant.uplift > 0 ? '+' : ''}${row.bestVariant.uplift.toFixed(1)} pt`
              : '—'
          }
          accent={
            row.bestVariant?.uplift !== undefined && row.bestVariant.uplift > 0 ? 'emerald' : undefined
          }
        />
      </div>
      {row.bestVariant && (
        <div className="flex items-center gap-1.5 text-xs">
          {row.bestVariant.winner && <Trophy className="h-3 w-3 text-emerald-600" aria-hidden />}
          <span className="text-muted-foreground">Meilleure variante :</span>
          <span className="font-medium">{row.bestVariant.name}</span>
        </div>
      )}
    </li>
  );
}

// ─── Petits composants réutilisables ───────────────────────────────

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'emerald';
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div
          className={cn(
            'mt-1 text-2xl font-semibold tabular-nums',
            accent === 'emerald' ? 'text-emerald-600' : '',
          )}
        >
          {value}
        </div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function Mini({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald';
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn('mt-0.5 text-sm font-semibold tabular-nums', accent === 'emerald' ? 'text-emerald-600' : '')}
      >
        {value}
      </div>
    </div>
  );
}
