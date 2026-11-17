'use client';

/**
 * Tableau de résultats du test A/B pour un produit. Appelle
 * `/stores/:storeId/products/:productId/ab-stats` et affiche, par variant :
 * visiteurs / add-to-cart / commandes / taux de conversion + uplift et
 * p-value du z-test contre le contrôle. Rafraîchi auto toutes les 30s —
 * suffisamment lent pour ne pas spam le backend, assez frais pour qu'un
 * vendeur voie bouger ses chiffres pendant qu'il scrolle.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Trophy, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { storesApi, extractApiError } from '@/lib/api';

type Range = '7d' | '30d' | '90d';

interface Props {
  storeId: string;
  productId: string;
}

interface VariantRow {
  variantId: string;
  name: string;
  isControl: boolean;
  enabled: boolean;
  weight: number;
  views: number;
  addToCart: number;
  purchases: number;
  revenue: number;
  cvr: number;
  cartRate: number;
  uplift?: number;
  pValue?: number;
  winner?: boolean;
}

interface Payload {
  productName: string;
  hasActiveVariants: boolean;
  variants: VariantRow[];
}

const RANGE_LABEL: Record<Range, string> = { '7d': '7 jours', '30d': '30 jours', '90d': '90 jours' };

function num(n: number): string {
  return n.toLocaleString('fr-FR');
}
function pct(n: number): string {
  // Le backend renvoie déjà des pourcentages (ex: 3.3). On garde une décimale.
  if (!Number.isFinite(n)) return '0 %';
  return `${n.toFixed(1)} %`;
}
function signedPct(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)} pt`;
}

export function ProductAbStatsPanel({ storeId, productId }: Props) {
  const [range, setRange] = useState<Range>('30d');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setError(null);
    try {
      const res = await storesApi.getProductAbStats(storeId, productId, range);
      setData(res.data);
    } catch (err) {
      setError(extractApiError(err, 'Impossible de charger les résultats'));
    } finally {
      setLoading(false);
    }
  }, [storeId, productId, range]);

  useEffect(() => {
    setLoading(true);
    void fetchStats();
    const t = window.setInterval(fetchStats, 30_000);
    return () => window.clearInterval(t);
  }, [fetchStats]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Résultats du test A/B</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-border/60 text-xs">
              {(['7d', '30d', '90d'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={
                    'px-2.5 py-1 font-medium transition-colors ' +
                    (range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')
                  }
                >
                  {RANGE_LABEL[r]}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setLoading(true);
                void fetchStats();
              }}
              aria-label="Rafraîchir"
            >
              <RefreshCw className={'h-3.5 w-3.5' + (loading ? ' animate-spin' : '')} />
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Rafraîchi auto toutes les 30 secondes. Une variante est déclarée gagnante quand sa conversion
          bat le contrôle avec p &lt; 0,05 (hautement probable que ce n'est pas du hasard).
        </p>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : data.variants.length <= 1 && !data.hasActiveVariants ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            Aucune variante active. Ajoute une variante dans l'éditeur ci-dessus pour lancer un test.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Variante</th>
                  <th className="px-3 py-2 text-right font-medium">Visiteurs</th>
                  <th className="px-3 py-2 text-right font-medium">Au panier</th>
                  <th className="px-3 py-2 text-right font-medium">Commandes</th>
                  <th className="px-3 py-2 text-right font-medium">CA</th>
                  <th className="px-3 py-2 text-right font-medium">Conversion</th>
                  <th className="px-3 py-2 text-right font-medium">Uplift</th>
                  <th className="px-3 py-2 text-right font-medium">p-value</th>
                </tr>
              </thead>
              <tbody>
                {data.variants.map((v) => (
                  <tr
                    key={v.variantId}
                    className={
                      'border-b border-border/40 last:border-b-0 ' +
                      (v.winner ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : '')
                    }
                  >
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        {v.winner && <Trophy className="h-3.5 w-3.5 text-emerald-600" aria-hidden />}
                        <span className="font-medium">
                          {v.name}
                        </span>
                        {!v.enabled && !v.isControl && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                            désactivée
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(v.views)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(v.addToCart)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(v.purchases)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {v.revenue > 0 ? num(Math.round(v.revenue)) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{pct(v.cvr)}</td>
                    <td
                      className={
                        'px-3 py-2 text-right tabular-nums ' +
                        (v.uplift === undefined
                          ? 'text-muted-foreground'
                          : v.uplift > 0
                            ? 'text-emerald-600'
                            : v.uplift < 0
                              ? 'text-destructive'
                              : 'text-muted-foreground')
                      }
                    >
                      {v.isControl ? '—' : signedPct(v.uplift)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {v.isControl
                        ? '—'
                        : typeof v.pValue === 'number'
                          ? v.pValue.toFixed(3)
                          : 'données insuffisantes'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
