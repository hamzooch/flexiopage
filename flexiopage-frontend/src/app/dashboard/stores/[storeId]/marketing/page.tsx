'use client';

/**
 * Marketing & pixels editor — single page where the seller pastes their
 * tracking IDs once and FlexioPage injects every script into the public
 * storefront. Same pattern as /delivery: form on the left, real-time
 * readiness checklist on the right.
 *
 * Supported providers:
 *   - Meta Pixel (Facebook / Instagram) + Conversions API (server-side)
 *   - TikTok Pixel
 *   - Snapchat Pixel
 *   - Google Analytics 4
 *   - Google Ads conversion (id + label)
 *   - Custom <head> code (advanced)
 *
 * Backend schema (Store.integrations.marketing) already exists; this page
 * only ships the dashboard UI + the public injector.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi, extractApiError } from '@/lib/api';
import { StoreSubPageShell, type SaveStatus } from '@/components/dashboard/store-sub-page';
import type { MarketingIntegration, StoreType } from '@/components/dashboard/store-editor';
import {
  CheckCircle2, Circle, Eye, ShieldAlert, TrendingUp,
  Code2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProviderDef {
  key: keyof MarketingIntegration;
  label: string;
  /** "PX12345…" formatted hint of what the seller pastes. */
  placeholder: string;
  /** Where the ID is found in the provider's dashboard. */
  hint: string;
  /** Visual accent for the field card. */
  accent: string;
  /** Validator — returns true when the value LOOKS like a real ID. */
  looksValid?: (v: string) => boolean;
}

const PROVIDERS: ProviderDef[] = [
  {
    key: 'facebookPixelId',
    label: 'Meta Pixel (Facebook / Instagram)',
    placeholder: '1234567890123456',
    hint: 'Trouve-le dans Meta Business Suite → Gestionnaire d\'événements → Sources de données.',
    accent: 'from-blue-500 to-indigo-600',
    looksValid: (v) => /^\d{10,20}$/.test(v.trim()),
  },
  {
    key: 'tiktokPixelId',
    label: 'TikTok Pixel',
    placeholder: 'CXXXXXXXXXXXXXXX',
    hint: 'TikTok Ads Manager → Outils → Événements → ID du Pixel (20 caractères).',
    accent: 'from-rose-500 to-pink-600',
    looksValid: (v) => /^[A-Z0-9]{18,30}$/.test(v.trim()),
  },
  {
    key: 'snapchatPixelId',
    label: 'Snapchat Pixel',
    placeholder: '00000000-0000-0000-0000-000000000000',
    hint: 'Snap Ads Manager → Événements → Pixel ID (UUID).',
    accent: 'from-amber-400 to-yellow-500',
    looksValid: (v) => /^[0-9a-f-]{30,40}$/i.test(v.trim()),
  },
  {
    key: 'googleAnalyticsId',
    label: 'Google Analytics 4',
    placeholder: 'G-XXXXXXXXXX',
    hint: 'GA4 → Administration → Flux de données → ID de mesure.',
    accent: 'from-orange-500 to-red-500',
    looksValid: (v) => /^G-[A-Z0-9]{8,12}$/i.test(v.trim()),
  },
];

export default function StoreMarketingPage() {
  const params = useParams();
  const storeId = params.storeId as string;
  const [store, setStore] = useState<StoreType | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [cfg, setCfg] = useState<MarketingIntegration>({});

  useEffect(() => {
    if (!storeId) return;
    storesApi
      .get(storeId)
      .then((res) => {
        const s = (res.data as { store: StoreType }).store;
        setStore(s);
        setCfg(s.integrations?.marketing || {});
      })
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, [storeId]);

  async function handleSave() {
    if (!store) return;
    setStatus('saving');
    setErrorMessage('');
    try {
      const cleaned: MarketingIntegration = Object.fromEntries(
        Object.entries(cfg).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || undefined : v])
      ) as MarketingIntegration;
      const newIntegrations = { ...(store.integrations || {}), marketing: cleaned };
      const res = await storesApi.update(storeId, { integrations: newIntegrations });
      const updated = (res.data as { store: StoreType }).store;
      setStore(updated);
      setCfg(updated.integrations?.marketing || {});
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2400);
    } catch (err: unknown) {
      console.error('[store/marketing] save failed', err);
      setErrorMessage(extractApiError(err, "L'enregistrement a échoué. Réessaie."));
      setStatus('error');
    }
  }

  function update<K extends keyof MarketingIntegration>(key: K, value: MarketingIntegration[K]) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  if (loading || !store) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <StoreSubPageShell
      storeId={storeId}
      storeName={store.name}
      title="Marketing & Pixels"
      description="Connecte tes pixels publicitaires en 1 clic — Meta, TikTok, Snap, Google. FlexioPage envoie les événements PageView, ViewContent, AddToCart et Purchase pour toi."
      status={status}
      errorMessage={errorMessage}
      onSave={handleSave}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Pixels de remarketing
              </CardTitle>
              <CardDescription>
                Colle l&apos;ID brut depuis le tableau de bord de chaque plateforme. Aucune balise
                manuelle à insérer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {PROVIDERS.map((p) => {
                const value = (cfg[p.key] as string) || '';
                const filled = !!value.trim();
                const validFormat = filled && (p.looksValid?.(value) ?? true);
                return (
                  <div key={p.key} className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className={cn('grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br text-white shadow-sm', p.accent)}>
                        <TrendingUp className="h-3.5 w-3.5" />
                      </span>
                      <Label className="flex-1 text-sm font-semibold">{p.label}</Label>
                      {filled && (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                            validFormat
                              ? 'bg-emerald-500/10 text-emerald-700'
                              : 'bg-amber-500/10 text-amber-700'
                          )}
                        >
                          <span className={cn('h-1.5 w-1.5 rounded-full', validFormat ? 'bg-emerald-500' : 'bg-amber-500')} />
                          {validFormat ? 'Format OK' : 'Vérifie le format'}
                        </span>
                      )}
                    </div>
                    <Input
                      value={value}
                      placeholder={p.placeholder}
                      onChange={(e) => update(p.key, e.target.value)}
                      className="h-10 font-mono text-sm"
                    />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{p.hint}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Google Ads (conversion)</CardTitle>
              <CardDescription>
                Pour mesurer les ventes générées par tes annonces Google. Renseigne l&apos;ID et le
                Label de l&apos;action de conversion « Achat ».
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="gads-id">ID de conversion</Label>
                  <Input
                    id="gads-id"
                    placeholder="AW-123456789"
                    value={cfg.googleAdsConversionId || ''}
                    onChange={(e) => update('googleAdsConversionId', e.target.value)}
                    className="h-10 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gads-label">Label de l&apos;action</Label>
                  <Input
                    id="gads-label"
                    placeholder="xyzABCDEFghijklm"
                    value={cfg.googleAdsConversionLabel || ''}
                    onChange={(e) => update('googleAdsConversionLabel', e.target.value)}
                    className="h-10 font-mono text-sm"
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Format complet d&apos;envoi : <code className="rounded bg-muted px-1 py-0.5">AW-XXXXXXXXX/xxxxxxxx</code>.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-fuchsia-600" />
                Meta Conversions API
                <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700">
                  Serveur
                </span>
              </CardTitle>
              <CardDescription>
                Double les événements en server-side pour contourner les bloqueurs de publicité.
                Recommandé pour les boutiques qui dépensent &gt; 100 €/mois sur Meta Ads.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cap-token">Access token (Conversions API)</Label>
                <Input
                  id="cap-token"
                  type="password"
                  autoComplete="off"
                  placeholder="EAA..."
                  value={cfg.facebookConversionsApiToken || ''}
                  onChange={(e) => update('facebookConversionsApiToken', e.target.value)}
                  className="h-10 font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Meta Business Suite → Gestionnaire d&apos;événements → Paramètres → Conversions API.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cap-test">Code de test (optionnel)</Label>
                <Input
                  id="cap-test"
                  placeholder="TEST12345"
                  value={cfg.facebookTestEventCode || ''}
                  onChange={(e) => update('facebookTestEventCode', e.target.value)}
                  className="h-10 font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Marque les événements comme « test » pendant la validation, ne les compte pas en prod.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-4 w-4 text-amber-600" />
                Code personnalisé dans &lt;head&gt;
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  Avancé
                </span>
              </CardTitle>
              <CardDescription>
                Injection brute pour outils non listés (Hotjar, Clarity, Tag Manager…). Tout est
                gardé tel quel — ne colle que du code de confiance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                value={cfg.customHeadCode || ''}
                onChange={(e) => update('customHeadCode', e.target.value)}
                rows={8}
                placeholder={'<!-- Hotjar -->\n<script>...</script>'}
                className="w-full rounded-xl border border-input bg-background p-3 font-mono text-xs leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
              />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Injecté sur <strong>toutes</strong> les pages publiques de la boutique, juste avant
                la fermeture de <code className="rounded bg-muted px-1 py-0.5">&lt;/head&gt;</code>.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Sticky right — coverage panel */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <MarketingCoveragePreview cfg={cfg} />
        </aside>
      </div>
    </StoreSubPageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Coverage preview — shows which providers are wired and which events
// they'll receive. Updates as the seller types so the connection feels
// instant.
// ─────────────────────────────────────────────────────────────────────

function MarketingCoveragePreview({ cfg }: { cfg: MarketingIntegration }) {
  const items = [
    { key: 'facebookPixelId',  label: 'Meta Pixel',        accent: 'from-blue-500 to-indigo-600' },
    { key: 'tiktokPixelId',    label: 'TikTok Pixel',      accent: 'from-rose-500 to-pink-600' },
    { key: 'snapchatPixelId',  label: 'Snapchat Pixel',    accent: 'from-amber-400 to-yellow-500' },
    { key: 'googleAnalyticsId',label: 'Google Analytics',  accent: 'from-orange-500 to-red-500' },
    { key: 'googleAdsConversionId', label: 'Google Ads',   accent: 'from-cyan-500 to-blue-500' },
  ] as const;

  const connected = items.filter((i) => (cfg[i.key as keyof MarketingIntegration] as string)?.trim());
  const capServerSide = !!cfg.facebookConversionsApiToken?.trim();
  const hasCustom = !!cfg.customHeadCode?.trim();

  const EVENTS = [
    { label: 'PageView',         hint: 'Émis sur chaque page' },
    { label: 'ViewContent',      hint: 'Page produit affichée' },
    { label: 'AddToCart',        hint: 'Quantité augmentée' },
    { label: 'InitiateCheckout', hint: 'Formulaire COD ouvert' },
    { label: 'Purchase',         hint: 'Commande confirmée (server)' },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-gradient-to-r from-muted/30 to-muted/10 px-3 py-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Eye className="h-3 w-3" />
          Couverture marketing
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold',
            connected.length > 0
              ? 'bg-emerald-500/15 text-emerald-700'
              : 'bg-muted text-muted-foreground'
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', connected.length > 0 ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
          {connected.length}/{items.length}
        </span>
      </div>

      <div className="space-y-3 p-4">
        {/* Banner */}
        <div
          className={cn(
            'rounded-xl border p-3 text-[11px]',
            connected.length === 0
              ? 'border-border/60 bg-muted/30 text-muted-foreground'
              : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800'
          )}
        >
          {connected.length === 0
            ? 'Aucun pixel actif — colle un ID pour commencer à mesurer ton ROAS.'
            : (
              <>
                <strong>{connected.length} pixel{connected.length > 1 ? 's' : ''} actif{connected.length > 1 ? 's' : ''}</strong> —
                {' '}les événements suivants seront émis automatiquement à chaque visite.
              </>
            )}
        </div>

        {/* Connected providers */}
        <ul className="space-y-1.5">
          {items.map((i) => {
            const filled = !!(cfg[i.key as keyof MarketingIntegration] as string)?.trim();
            return (
              <li
                key={i.key}
                className={cn(
                  'flex items-center gap-2 rounded-lg border p-2 text-[11px]',
                  filled
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-border/60 bg-muted/20'
                )}
              >
                <span
                  className={cn(
                    'grid h-6 w-6 shrink-0 place-items-center rounded bg-gradient-to-br text-white',
                    filled ? i.accent : 'opacity-30'
                  )}
                >
                  <TrendingUp className="h-3 w-3" />
                </span>
                <span className={cn('flex-1 font-medium', filled ? 'text-foreground' : 'text-muted-foreground')}>
                  {i.label}
                </span>
                {filled
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  : <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />}
              </li>
            );
          })}
        </ul>

        {/* Server-side badge */}
        {capServerSide && (
          <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-2 text-[10px]">
            <strong className="text-fuchsia-700">Meta Conversions API actif</strong> —
            les événements <em>Purchase</em> sont aussi envoyés en server-side, plus précis pour
            les enchères Meta.
          </div>
        )}

        {/* Custom code badge */}
        {hasCustom && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[10px]">
            <strong className="text-amber-700">Code personnalisé injecté</strong> —
            ton code &lt;head&gt; tournera sur toutes les pages publiques.
          </div>
        )}

        {/* Events that will fire */}
        {connected.length > 0 && (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Événements automatiques
            </div>
            <ul className="space-y-1">
              {EVENTS.map((e) => (
                <li key={e.label} className="flex items-center gap-2">
                  <span className="inline-flex h-5 items-center rounded bg-primary/10 px-1.5 font-mono text-[9px] font-bold text-primary">
                    {e.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{e.hint}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
