'use client';

/**
 * Newsletter dashboard — left side: popup settings (toggles + texts +
 * trigger + linked coupon). Right side: subscriber list with search and
 * CSV export. Live mock preview of the popup floats on the sticky right
 * pane so the seller sees what visitors will see.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MediaPicker } from '@/components/dashboard/MediaPicker';
import { FieldToggle } from '@/components/dashboard/store-editor';
import { StoreSubPageShell, type SaveStatus } from '@/components/dashboard/store-sub-page';
import { storesApi, extractApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Mail, Download, Trash2, Search, BadgePercent, Eye, Loader2, X,
} from 'lucide-react';
import type { NewsletterSettings, Subscriber, SubscriberCounts } from '@/types/newsletter';
import type { Coupon } from '@/types/coupon';
import type { StoreType } from '@/components/dashboard/store-editor';

export default function NewsletterPage() {
  const params = useParams();
  const storeId = params.storeId as string;

  const [store, setStore] = useState<StoreType | null>(null);
  const [cfg, setCfg] = useState<NewsletterSettings>({
    enabled: false,
    delaySeconds: 5,
    exitIntent: true,
    dismissalDays: 7,
  });
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [counts, setCounts] = useState<SubscriberCounts>({ total: 0, thisMonth: 0 });
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storeRes, subsRes, couponsRes] = await Promise.all([
        storesApi.get(storeId),
        storesApi.listSubscribers(storeId),
        storesApi.listCoupons(storeId),
      ]);
      const s = (storeRes.data as { store: StoreType & { settings?: { newsletter?: NewsletterSettings } } }).store;
      setStore(s as StoreType);
      setCfg({
        enabled: false,
        delaySeconds: 5,
        exitIntent: true,
        dismissalDays: 7,
        ...(s.settings?.newsletter || {}),
      });
      setSubscribers((subsRes.data as { subscribers: Subscriber[] }).subscribers || []);
      setCounts((subsRes.data as { counts: SubscriberCounts }).counts || { total: 0, thisMonth: 0 });
      setCoupons((couponsRes.data as { coupons: Coupon[] }).coupons || []);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  // Server-side search via the API — debounced so we don't pound the
  // backend on every keystroke.
  useEffect(() => {
    if (loading) return;
    const t = window.setTimeout(() => {
      storesApi
        .listSubscribers(storeId, { search: search || undefined })
        .then((res) => {
          setSubscribers((res.data as { subscribers: Subscriber[] }).subscribers || []);
        })
        .catch(() => {});
    }, 250);
    return () => window.clearTimeout(t);
    // We intentionally don't depend on `loading` — re-run only on search changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleSave() {
    if (!store) return;
    setStatus('saving');
    setErrorMessage('');
    try {
      const newSettings = { ...(store.settings || {}), newsletter: cfg };
      const res = await storesApi.update(storeId, { settings: newSettings });
      const updated = (res.data as { store: StoreType & { settings?: { newsletter?: NewsletterSettings } } }).store;
      setStore(updated as StoreType);
      setCfg({
        enabled: false,
        delaySeconds: 5,
        exitIntent: true,
        dismissalDays: 7,
        ...(updated.settings?.newsletter || {}),
      });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2200);
    } catch (err: unknown) {
      setErrorMessage(extractApiError(err, 'Sauvegarde échouée.'));
      setStatus('error');
    }
  }

  const update = <K extends keyof NewsletterSettings>(key: K, value: NewsletterSettings[K]) =>
    setCfg((c) => ({ ...c, [key]: value }));

  async function deleteSubscriber(s: Subscriber) {
    if (!window.confirm(`Supprimer ${s.email} de la liste ?`)) return;
    await storesApi.deleteSubscriber(storeId, s._id);
    setSubscribers((arr) => arr.filter((x) => x._id !== s._id));
    setCounts((c) => ({ ...c, total: Math.max(0, c.total - 1) }));
  }

  if (loading || !store) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <StoreSubPageShell
      storeId={storeId}
      storeName={store.name}
      title="Newsletter & pop-up de bienvenue"
      description="Capture des emails au premier visit en échange d'un code promo. Les leads atterrissent dans ta liste exportable."
      status={status}
      errorMessage={errorMessage}
      onSave={handleSave}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {/* Activation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                Activation
              </CardTitle>
              <CardDescription>
                Le pop-up apparaît automatiquement sur les pages de la boutique selon les règles ci-dessous.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldToggle
                label="Pop-up actif"
                sublabel="Décoche pour mettre en pause sans perdre la config."
                checked={!!cfg.enabled}
                onChange={(v) => update('enabled', v)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="delay">Délai avant affichage (secondes)</Label>
                  <Input
                    id="delay"
                    type="number"
                    min={0}
                    step={1}
                    value={cfg.delaySeconds ?? 5}
                    onChange={(e) => update('delaySeconds', Math.max(0, parseInt(e.target.value, 10) || 0))}
                  />
                  <p className="text-[11px] text-muted-foreground">0 = immédiat. 3-7s = le sweet spot.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dismiss">Re-affichage après refus (jours)</Label>
                  <Input
                    id="dismiss"
                    type="number"
                    min={0}
                    step={1}
                    value={cfg.dismissalDays ?? 7}
                    onChange={(e) => update('dismissalDays', Math.max(0, parseInt(e.target.value, 10) || 0))}
                  />
                  <p className="text-[11px] text-muted-foreground">Stocké en localStorage côté visiteur.</p>
                </div>
              </div>
              <FieldToggle
                label="Trigger sur exit-intent (desktop)"
                sublabel="Surface aussi le pop-up quand la souris quitte la fenêtre par le haut — dernière chance avant de fermer l'onglet."
                checked={cfg.exitIntent !== false}
                onChange={(v) => update('exitIntent', v)}
              />
            </CardContent>
          </Card>

          {/* Content */}
          <Card>
            <CardHeader>
              <CardTitle>Contenu du pop-up</CardTitle>
              <CardDescription>
                Tu peux changer le visuel, le titre et le texte du bouton. Tout met à jour l&apos;aperçu à droite en temps réel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="headline">Titre *</Label>
                <Input
                  id="headline"
                  value={cfg.headline || ''}
                  onChange={(e) => update('headline', e.target.value)}
                  placeholder="Profite de 10% sur ta première commande"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sub">Sous-titre</Label>
                <Input
                  id="sub"
                  value={cfg.subheadline || ''}
                  onChange={(e) => update('subheadline', e.target.value)}
                  placeholder="Laisse ton email pour recevoir le code"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cta">Texte du bouton</Label>
                <Input
                  id="cta"
                  value={cfg.ctaLabel || ''}
                  onChange={(e) => update('ctaLabel', e.target.value)}
                  placeholder="Recevoir mon code"
                />
              </div>
              <div className="max-w-[180px]">
                <MediaPicker
                  storeId={storeId}
                  value={cfg.image}
                  onChange={(url) => update('image', url || '')}
                  label="Image (optionnel)"
                  shape="square"
                  helper="Affichée à gauche sur desktop · cachée sur mobile."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="success">Message de succès (optionnel)</Label>
                <Input
                  id="success"
                  value={cfg.successMessage || ''}
                  onChange={(e) => update('successMessage', e.target.value)}
                  placeholder="Merci, voici ton code :"
                />
              </div>
            </CardContent>
          </Card>

          {/* Reward */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BadgePercent className="h-4 w-4 text-primary" />
                Récompense
              </CardTitle>
              <CardDescription>
                Choisis un code promo (existant) à offrir aux abonnés. Le code apparaît dans l&apos;écran
                de succès du pop-up — le visiteur peut l&apos;utiliser tout de suite.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {coupons.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                  Aucun code disponible —
                  {' '}<a href="../coupons" className="text-primary hover:underline">crée d&apos;abord un code promo</a>.
                </div>
              ) : (
                <select
                  value={cfg.rewardCouponCode || ''}
                  onChange={(e) => update('rewardCouponCode', e.target.value || undefined)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Aucune récompense —</option>
                  {coupons.map((c) => (
                    <option key={c._id} value={c.code}>
                      {c.code} ({c.type === 'percent' ? `−${c.value}%` : `−${c.value}`})
                      {!c.isActive && ' · inactif'}
                    </option>
                  ))}
                </select>
              )}
              {cfg.rewardCouponCode && (
                <p className="text-[11px] text-muted-foreground">
                  Le code <code className="rounded bg-muted px-1 font-mono">{cfg.rewardCouponCode}</code> sera affiché à l&apos;abonné. Pense à le garder actif dans la page Codes promo.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Subscribers list */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Abonnés</CardTitle>
                  <CardDescription>
                    <strong>{counts.total}</strong> total · <strong>{counts.thisMonth}</strong> sur les 30 derniers jours.
                  </CardDescription>
                </div>
                <a
                  href={storesApi.subscribersCsvUrl(storeId)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Download className="h-3.5 w-3.5" />
                  Exporter CSV
                </a>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filtrer par email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-10 pl-9"
                />
              </div>
              {subscribers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                  {search ? `Aucun email ne contient « ${search} »` : 'Aucun abonné pour le moment.'}
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {subscribers.map((s) => (
                    <li key={s._id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{s.email}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(s.createdAt).toLocaleDateString('fr-FR')}
                          {' · '}
                          <span className="rounded bg-muted px-1 text-[10px]">{s.source.replace('_', ' ')}</span>
                          {s.rewardCouponCode && (
                            <span className="ml-1 inline-flex items-center gap-1 rounded bg-primary/10 px-1 text-[10px] text-primary">
                              <BadgePercent className="h-2.5 w-2.5" />
                              {s.rewardCouponCode}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteSubscriber(s)}
                        className="grid h-8 w-8 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                        aria-label="Supprimer"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right — live mock preview */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <PopupPreview cfg={cfg} storeName={store.name} />
        </aside>
      </div>
    </StoreSubPageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Mock preview — what the visitor sees. Mirrors the storefront popup
// structure but doesn't actually subscribe.
// ─────────────────────────────────────────────────────────────────────

function PopupPreview({ cfg, storeName }: { cfg: NewsletterSettings; storeName: string }) {
  const headline = cfg.headline || `Bienvenue chez ${storeName}`;
  const sub = cfg.subheadline || 'Inscris-toi pour recevoir nos meilleures offres.';
  const cta = cfg.ctaLabel || "Je m'inscris";

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-gradient-to-r from-muted/30 to-muted/10 px-3 py-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Eye className="h-3 w-3" />
          Aperçu pop-up
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold',
            cfg.enabled
              ? 'bg-emerald-500/15 text-emerald-700'
              : 'bg-amber-500/15 text-amber-700'
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', cfg.enabled ? 'bg-emerald-500' : 'bg-amber-500')} />
          {cfg.enabled ? 'Actif' : 'Inactif'}
        </span>
      </div>

      <div className="bg-muted/20 p-3">
        {/* Faux page background to set context */}
        <div className="relative h-[380px] overflow-hidden rounded-xl bg-gradient-to-br from-muted/40 to-card">
          {/* Faux store stripes */}
          <div className="absolute inset-x-3 top-3 space-y-1.5">
            <div className="h-3 w-1/3 rounded bg-muted-foreground/15" />
            <div className="h-2 w-1/4 rounded bg-muted-foreground/15" />
          </div>
          {/* The popup */}
          <div className="absolute inset-0 grid place-items-center">
            <div className="relative w-[260px] overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl">
              <button
                type="button"
                aria-label="Fermer"
                className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
              {cfg.image && (
                <div
                  className="h-[88px] w-full"
                  style={{ background: `url(${cfg.image}) center/cover` }}
                />
              )}
              <div className="space-y-2.5 p-3.5 text-center">
                <div className="text-[12px] font-extrabold leading-tight">{headline}</div>
                <div className="text-[10px] leading-snug text-muted-foreground">{sub}</div>
                <div className="space-y-1.5 pt-1">
                  <div className="h-7 rounded-md border border-border/60 bg-muted/40" />
                  <div className="h-7 rounded-md bg-gradient-to-r from-primary to-fuchsia-600 text-[10px] font-bold leading-7 text-white">
                    {cta}
                  </div>
                </div>
                {cfg.rewardCouponCode && (
                  <div className="rounded-md bg-emerald-500/10 px-2 py-1 text-[9px] font-semibold text-emerald-700">
                    Code offert : <code className="font-mono">{cfg.rewardCouponCode}</code>
                  </div>
                )}
                <div className="text-[8px] text-muted-foreground">
                  Pas de spam · désabonnement libre
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-[9px] text-muted-foreground">
          Reflète le pop-up affiché sur la vitrine après {cfg.delaySeconds ?? 5}s.
        </p>
      </div>
    </div>
  );
}
