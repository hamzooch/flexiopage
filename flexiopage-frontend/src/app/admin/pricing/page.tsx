'use client';

/**
 * Admin → AI pricing.
 *
 * Coût (en tokens) par type de génération + ratio USD→tokens (combien
 * de tokens le vendeur reçoit pour 1 USD versé). Stockés dans le
 * Settings doc ; lecture ouverte aux admins, écriture superadmin+.
 *
 * La table `rates` (USD → devise locale) est legacy : elle ne sert plus
 * qu'au script `migrate-wallets-to-usd` et n'est pas exposée dans l'UI.
 */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCcw, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { adminApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

type Prices = { landing: number; poster: number; product_page: number; text_only: number };

const KIND_LABELS: Record<keyof Prices, { label: string; hint: string }> = {
  landing:      { label: 'Landing page',      hint: 'Génération complète (texte + ~10 visuels)' },
  poster:       { label: 'Affiche (poster)',  hint: 'Image promo unique pour réseaux sociaux' },
  product_page: { label: 'Page produit',      hint: 'Page produit détaillée style fiche cinematic' },
  text_only:    { label: 'Texte seul',        hint: 'Landing sans génération d\'images (copy only)' },
};

type Status = 'idle' | 'saving' | 'saved' | 'error';

export default function AdminPricingPage() {
  const isSuperAdmin = useAuthStore((s) => ['superadmin', 'owner'].includes(String(s.user?.role)));

  const [prices, setPrices] = useState<Prices>({ landing: 3, poster: 3, product_page: 3, text_only: 1 });
  const [usdToTokens, setUsdToTokens] = useState<number>(1.5);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [defaults, setDefaults] = useState<{ prices: Prices; usdToTokens: number; rates: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [updatedAt, setUpdatedAt] = useState<string>('');

  // Pull state on mount
  useEffect(() => {
    adminApi
      .getAiPricing()
      .then((res) => {
        setPrices(res.data.aiPricing.prices);
        setUsdToTokens(res.data.aiPricing.usdToTokens || 1.5);
        setRates(res.data.aiPricing.rates || {});
        setDefaults(res.data.defaults);
        setUpdatedAt(res.data.updatedAt);
      })
      .catch((err) => {
        console.error('[admin/pricing] load failed', err);
        setErrorMessage('Impossible de charger la configuration.');
        setStatus('error');
      })
      .finally(() => setLoading(false));
  }, []);

  // Sorted currency list for stable rendering
  const sortedCurrencies = useMemo(
    () => Object.keys(rates).sort((a, b) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b))),
    [rates],
  );

  async function handleSave() {
    setStatus('saving');
    setErrorMessage('');
    try {
      const res = await adminApi.updateAiPricing({ prices, usdToTokens, rates });
      setPrices(res.data.aiPricing.prices);
      setUsdToTokens(res.data.aiPricing.usdToTokens || 1.5);
      setRates(res.data.aiPricing.rates);
      setUpdatedAt(res.data.updatedAt);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2400);
    } catch (err: unknown) {
      console.error('[admin/pricing] save failed', err);
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : (err as Error)?.message;
      setErrorMessage(msg || "Sauvegarde impossible. Réessaie.");
      setStatus('error');
    }
  }

  function resetToDefaults() {
    if (!defaults) return;
    setPrices({ ...defaults.prices });
    setUsdToTokens(defaults.usdToTokens);
    setRates({ ...defaults.rates });
  }

  function updatePrice(kind: keyof Prices, value: string) {
    const n = Number(value);
    setPrices((p) => ({ ...p, [kind]: Number.isFinite(n) && n >= 0 ? n : 0 }));
  }

  function updateRate(code: string, value: string) {
    const n = Number(value);
    setRates((r) => ({ ...r, [code]: Number.isFinite(n) && n > 0 ? n : r[code] }));
  }

  if (loading) {
    return <p className="text-muted-foreground">Chargement…</p>;
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Tarifs de génération AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Coût en tokens par type de génération + ratio USD → tokens appliqué quand un vendeur recharge son solde IA.
          </p>
          {updatedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Dernière mise à jour : {new Date(updatedAt).toLocaleString('fr-FR')}
            </p>
          )}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={resetToDefaults} disabled={!defaults} className="gap-1.5">
          <RefreshCcw className="h-3.5 w-3.5" />
          Réinitialiser
        </Button>
      </div>

      {!isSuperAdmin && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          Lecture seule — seuls les comptes <strong>superadmin</strong> ou <strong>owner</strong> peuvent modifier les tarifs.
        </div>
      )}

      {/* ── Ratio USD → tokens ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Ratio USD → tokens</CardTitle>
          <CardDescription>
            Combien de tokens un vendeur reçoit pour 1 USD versé au top-up.
            Exemple : 1.5 → un paiement de 10 USD crédite 15 tokens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label htmlFor="usd-to-tokens" className="text-sm font-semibold">1 USD =</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  id="usd-to-tokens"
                  type="number"
                  min={0.01}
                  step={0.1}
                  value={usdToTokens}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setUsdToTokens(Number.isFinite(n) && n > 0 ? n : usdToTokens);
                  }}
                  disabled={!isSuperAdmin}
                  className="w-32"
                />
                <span className="text-sm font-medium text-muted-foreground">tokens</span>
              </div>
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              Aperçu : un top-up de <strong>10 USD</strong> créditera{' '}
              <strong>{Math.round(10 * usdToTokens)} tokens</strong> sur le solde IA du vendeur.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Token cost per generation ──────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Coût par génération (en tokens)</CardTitle>
          <CardDescription>
            Nombre de tokens débités du solde IA du vendeur à chaque génération.
            La valeur peut être décimale (ex : 2.5) si tu veux un coût plus fin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {(Object.keys(KIND_LABELS) as (keyof Prices)[]).map((k) => (
              <div key={k} className="rounded-xl border border-border/60 bg-card p-4">
                <Label htmlFor={`price-${k}`} className="text-sm font-semibold">
                  {KIND_LABELS[k].label}
                </Label>
                <p className="mb-3 text-xs text-muted-foreground">{KIND_LABELS[k].hint}</p>
                <div className="flex items-center gap-2">
                  <Input
                    id={`price-${k}`}
                    type="number"
                    min={0}
                    step={0.5}
                    value={prices[k]}
                    onChange={(e) => updatePrice(k, e.target.value)}
                    disabled={!isSuperAdmin}
                  />
                  <span className="text-sm font-medium text-muted-foreground">tokens</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Conversion table (legacy) ──────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Taux USD → devise locale (legacy)</CardTitle>
          <CardDescription>
            Table conservée uniquement pour le script <code>migrate-wallets-to-usd</code>.
            Plus utilisée au runtime : depuis le passage aux tokens, le wallet IA n&apos;a plus de devise.
            La devise <strong>USD</strong> reste fixée à 1.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedCurrencies.map((cur) => (
              <div key={cur} className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2">
                <span className="w-12 shrink-0 text-sm font-bold text-foreground">{cur}</span>
                <span className="text-xs text-muted-foreground">1&nbsp;USD =</span>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={rates[cur] ?? 0}
                  onChange={(e) => updateRate(cur, e.target.value)}
                  disabled={!isSuperAdmin || cur === 'USD'}
                  className="h-9"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Sticky save bar ────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-4 py-3 sm:px-6">
          {status === 'saved' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 animate-fade-in">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Enregistré
            </span>
          )}
          {status === 'error' && (
            <span
              className="inline-flex max-w-[60ch] items-center gap-1.5 truncate rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive"
              title={errorMessage}
            >
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              {errorMessage || 'Erreur'}
            </span>
          )}
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isSuperAdmin || status === 'saving'}
            className={cn('gap-1.5 gradient-brand text-white', status === 'saving' && 'opacity-70')}
          >
            {status === 'saving' && <Loader2 className="h-4 w-4 animate-spin" />}
            {status === 'saving' ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  );
}
