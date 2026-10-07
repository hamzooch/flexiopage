'use client';

/**
 * Intégrations boutique — domaine, pixels, livraison.
 *
 * Le DNS affiché ici suit exactement `domain.service` (CNAME vers
 * STOREFRONT_HOST, A vers STOREFRONT_IPS, ou nameservers FlexioPage).
 * La livraison n'écrit que des prestataires réellement branchés :
 * Best Delivery sur `integrations.delivery`, MogaDelivery via l'onboarding
 * plateforme (secret partagé, pas de HMAC par boutique). « Manuel » désactive
 * le dispatch — il ne doit jamais retomber sur le provider MogaDelivery.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import { extractApiError, storesApi } from '@/lib/api';
import { useStoreStore } from '@/stores/store-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn, storeAbsoluteUrl } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/page-header';
import { BrandLogo } from '@/components/dashboard/brand-logo';
import {
  Globe,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Loader2,
  Save,
  BarChart3,
  Truck,
  Warehouse,
  RefreshCw,
  Plug,
  Pause,
  Play,
  Info,
  Power,
} from 'lucide-react';

type TabId = 'domain' | 'pixels' | 'shipping';
type ShippingTab = 'carrier' | 'logistics';
type DomainMethod = 'cname' | 'a' | 'nameservers';

interface PickupAddress {
  contactName?: string;
  contactPhone?: string;
  line1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

interface DeliveryConfig {
  provider?: string;
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  webhookSecret?: string;
  login?: string;
  pwd?: string;
  autoDispatch?: boolean;
  pickupAddress?: PickupAddress;
}

interface LogisticsConfig {
  provider?: string;
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  webhookSecret?: string;
  warehouseId?: string;
  autoForward?: boolean;
}

interface MarketingConfig {
  facebookPixelId?: string;
  facebookConversionsApiToken?: string;
  googleAnalyticsId?: string;
  tiktokPixelId?: string;
  snapchatPixelId?: string;
  googleAdsConversionId?: string;
  googleAdsConversionLabel?: string;
  customHeadCode?: string;
}

interface MarketDelivery {
  country?: string;
  delivery?: { provider?: string; enabled?: boolean; storeIdMD?: string };
}

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  subdomain: string;
  storeType?: 'physical' | 'digital';
  customDomain?: string;
  customDomainVerified?: boolean;
  settings?: { currency?: string; country?: string };
  markets?: MarketDelivery[];
  integrations?: {
    delivery?: DeliveryConfig;
    logistics?: LogisticsConfig;
    marketing?: MarketingConfig;
    googleSheets?: { enabled?: boolean; webhookUrl?: string };
  };
}

interface DomainTarget {
  host: string;
  ips: string[];
  nameservers?: string[];
}

interface DomainCheck {
  verified: boolean;
  cname?: string[];
  aRecords?: string[];
  nameservers?: string[];
  reason?: string;
  expectedTarget?: string;
}

const TABS: { id: TabId; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'domain', label: 'Domaine', icon: Globe },
  { id: 'pixels', label: 'Pixels', icon: BarChart3 },
  { id: 'shipping', label: 'Livraison', icon: Truck },
];

const CARRIER_PROVIDERS = [
  { id: 'bestdelivery', label: 'Best Delivery', description: 'Transporteur Tunisie. Login et mot de passe du compte expéditeur.', logoUrl: '/brands/best-delivery.png', comingSoon: false },
  { id: 'firstdelivery', label: 'First Delivery', description: 'Transporteur Tunisie', logoUrl: '/brands/first-delivery.png', comingSoon: true },
  { id: 'dropex', label: 'Dropex', description: 'Transporteur Tunisie', logoUrl: '/brands/droppex.svg', comingSoon: true },
  { id: 'adex', label: 'Adex', description: 'Transporteur Tunisie', logoUrl: '/brands/adex-logo.png', comingSoon: true },
  { id: 'manual', label: 'Manuel', description: 'Tu expédies toi-même. Aucune commande n’est envoyée automatiquement.', logoUrl: undefined, comingSoon: false },
] as const;

const LOGISTICS_PROVIDERS = [
  { id: 'mogadelivery', label: 'MogaDelivery', description: 'Stockage et dispatch Afrique. Les produits sont matchés par SKU.', logoUrl: '/integrations/mogadelivery.png', comingSoon: false },
  { id: 'shipbob', label: 'ShipBob', description: '3PL global — pas encore branché.', logoUrl: '/brands/shipbob.svg', comingSoon: true },
  { id: 'manual', label: 'Aucune logistique', description: 'Pas de prestataire 3PL. La livraison last-mile reste dans l’autre onglet.', logoUrl: undefined, comingSoon: false },
] as const;

function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
}

function isValidDomain(d: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d);
}

/** example.com → apex. shop.example.com → sous-domaine. */
function isApex(domain: string): boolean {
  return normalizeDomain(domain).split('.').filter(Boolean).length <= 2;
}

/** Hôte à saisir chez le registrar. `@` pour l’apex, sinon le préfixe. */
function dnsHost(domain: string): string {
  const parts = normalizeDomain(domain).split('.').filter(Boolean);
  if (parts.length <= 2) return '@';
  return parts.slice(0, -2).join('.');
}

function isMogaLive(store: StoreDoc): boolean {
  const delivery = store.integrations?.delivery;
  if (delivery?.provider === 'mogadelivery' && delivery.enabled) return true;
  const logistics = store.integrations?.logistics;
  if (logistics?.provider === 'mogadelivery' && logistics.enabled) return true;
  return false;
}

function mogaOnboarded(store: StoreDoc): boolean {
  if (isMogaLive(store)) return true;
  return (store.markets || []).some(
    (m) => m.delivery?.provider === 'mogadelivery' && !!m.delivery.storeIdMD,
  );
}

function bestLive(store: StoreDoc): boolean {
  const delivery = store.integrations?.delivery;
  return delivery?.provider === 'bestdelivery' && !!delivery.enabled;
}

function pixelCount(store: StoreDoc): number {
  const m = store.integrations?.marketing || {};
  return [
    m.facebookPixelId,
    m.googleAnalyticsId,
    m.tiktokPixelId,
    m.snapchatPixelId,
    m.googleAdsConversionId,
    m.customHeadCode,
  ].filter((v) => !!v?.trim()).length;
}

function shippingStatus(store: StoreDoc): { label: string; tone: 'ok' | 'warn' | 'muted' } {
  if (store.storeType === 'digital') return { label: 'Boutique digitale', tone: 'muted' };
  if (bestLive(store) && isMogaLive(store)) return { label: 'Best Delivery prioritaire', tone: 'warn' };
  if (bestLive(store)) return { label: 'Best Delivery actif', tone: 'ok' };
  if (isMogaLive(store)) return { label: 'MogaDelivery actif', tone: 'ok' };
  if (mogaOnboarded(store)) return { label: 'Moga enregistré, dispatch off', tone: 'warn' };
  return { label: 'Non connectée', tone: 'muted' };
}

async function saveIntegrations(
  store: StoreDoc,
  patch: Partial<NonNullable<StoreDoc['integrations']>>,
): Promise<void> {
  await storesApi.update(store._id, {
    integrations: { ...(store.integrations || {}), ...patch },
  });
}

export default function IntegrationsPage() {
  const { currentStoreId, setCurrentStore } = useStoreStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [stores, setStores] = useState<StoreDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const tabParam = searchParams.get('tab');
  const tab: TabId = tabParam === 'pixels' || tabParam === 'shipping' ? tabParam : 'domain';

  const patchQuery = useCallback((patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const sid = searchParams.get('storeId');
    if (sid && sid !== currentStoreId) setCurrentStore(sid);
  }, [searchParams, currentStoreId, setCurrentStore]);

  const refreshStores = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const res = await storesApi.list();
      const list = (res.data.stores as StoreDoc[]) || [];
      setStores(list);
      if (!useStoreStore.getState().currentStoreId && list[0]) setCurrentStore(list[0]._id);
    } catch (err) {
      setLoadError(extractApiError(err, 'Impossible de charger les boutiques.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [setCurrentStore]);

  useEffect(() => { void refreshStores(false); }, [refreshStores]);

  const onSaved = useCallback(() => refreshStores(true), [refreshStores]);

  const activeStore = useMemo(
    () => stores.find((s) => s._id === currentStoreId) || stores[0] || null,
    [stores, currentStoreId],
  );

  if (loading) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {loadError}
      </div>
    );
  }

  if (!activeStore) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Tu n’as pas encore de boutique. Crée-en une depuis le tableau de bord avant de configurer les intégrations.
        </p>
      </div>
    );
  }

  const domainTone = activeStore.customDomainVerified
    ? 'ok'
    : activeStore.customDomain
      ? 'warn'
      : 'muted';
  const domainLabel = activeStore.customDomainVerified
    ? activeStore.customDomain || 'Vérifié'
    : activeStore.customDomain
      ? 'DNS en attente'
      : 'Non configuré';
  const pixels = pixelCount(activeStore);
  const ship = shippingStatus(activeStore);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Plug}
        title={`Intégrations · ${activeStore.name}`}
        description={
          <>
            Domaine, pixels et livraison de cette boutique. Les apps productivité sont dans{' '}
            <Link href="/dashboard/apps" className="font-medium text-primary hover:underline">Applications</Link>.
          </>
        }
        actions={stores.length > 1 ? (
          <select
            aria-label="Boutique"
            className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            value={activeStore._id}
            onChange={(e) => setCurrentStore(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>
        ) : undefined}
      />

      <div role="tablist" aria-label="Intégrations" className="grid gap-3 sm:grid-cols-3">
        {TABS.map((item) => {
          const active = tab === item.id;
          const detail = item.id === 'domain'
            ? domainLabel
            : item.id === 'pixels'
              ? pixels === 0 ? 'Aucun pixel' : `${pixels} actif${pixels > 1 ? 's' : ''}`
              : ship.label;
          const tone = item.id === 'domain' ? domainTone : item.id === 'pixels' ? (pixels ? 'ok' : 'muted') : ship.tone;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => patchQuery({ tab: item.id })}
              className={cn(
                'flex min-h-11 items-start gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-card hover:bg-muted/40',
              )}
            >
              <span className={cn(
                'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
                active ? 'gradient-brand text-white' : 'bg-muted text-muted-foreground',
              )}>
                <item.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className={cn(
                  'mt-0.5 flex items-center gap-1.5 text-xs',
                  tone === 'ok' && 'text-emerald-700',
                  tone === 'warn' && 'text-amber-700',
                  tone === 'muted' && 'text-muted-foreground',
                )}>
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    tone === 'ok' && 'bg-emerald-500',
                    tone === 'warn' && 'bg-amber-500',
                    tone === 'muted' && 'bg-muted-foreground/40',
                  )} />
                  <span className="truncate">{detail}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {tab === 'domain' && (
        <DomainPanel key={activeStore._id} store={activeStore} onSaved={onSaved} />
      )}
      {tab === 'pixels' && (
        <PixelsPanel key={activeStore._id} store={activeStore} onSaved={onSaved} />
      )}
      {tab === 'shipping' && (
        <ShippingPanel
          key={activeStore._id}
          store={activeStore}
          onSaved={onSaved}
          onSubChange={(sub) => patchQuery({ tab: 'shipping', sub })}
        />
      )}
    </div>
  );
}

function DomainPanel({ store, onSaved }: { store: StoreDoc; onSaved: () => Promise<void> }) {
  const [domain, setDomain] = useState(store.customDomain || '');
  const [target, setTarget] = useState<DomainTarget>({ host: '', ips: [], nameservers: [] });
  const [check, setCheck] = useState<DomainCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [method, setMethod] = useState<DomainMethod>('cname');
  const [methodTouched, setMethodTouched] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storesApi.getDomainTarget(store._id).then((r) => {
      if (!cancelled) setTarget(r.data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [store._id]);

  const savedDomain = store.customDomain || '';
  const typed = normalizeDomain(domain);
  const savedAndMatching = !!savedDomain && typed === savedDomain;

  useEffect(() => {
    if (methodTouched || !savedDomain) return;
    setMethod(isApex(savedDomain) && target.ips.length > 0 ? 'a' : 'cname');
  }, [methodTouched, savedDomain, target.ips.length]);

  useEffect(() => {
    if (!savedAndMatching || store.customDomainVerified || paused) return;
    let stop = false;
    let timer = 0;
    const tick = async () => {
      if (stop) return;
      try {
        const res = await storesApi.verifyDomain(store._id);
        if (stop) return;
        setCheck(res.data);
        if (res.data.verified) {
          stop = true;
          window.clearInterval(timer);
          await onSaved();
        }
      } catch {
        /* La propagation DNS échoue souvent : on retente au tick suivant. */
      }
    };
    void tick();
    timer = window.setInterval(() => { void tick(); }, 10_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [savedAndMatching, store.customDomainVerified, store._id, paused, onSaved]);

  async function handleSaveDomain() {
    setSaving(true);
    setSaveError(null);
    setJustSaved(false);
    setCheck(null);
    try {
      if (typed && !isValidDomain(typed)) {
        setSaveError('Format invalide. Exemple : shop.tonsite.com');
        return;
      }
      await storesApi.update(store._id, { customDomain: typed || null });
      setDomain(typed);
      setJustSaved(true);
      setPaused(false);
      await onSaved();
    } catch (err) {
      setSaveError(extractApiError(err, 'Échec de l’enregistrement'));
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify() {
    if (!savedDomain) {
      setSaveError('Enregistre le domaine avant de vérifier le DNS.');
      return;
    }
    setChecking(true);
    setSaveError(null);
    try {
      const res = await storesApi.verifyDomain(store._id);
      setCheck(res.data);
      setJustSaved(false);
      await onSaved();
    } catch (err) {
      setSaveError(extractApiError(err, 'Vérification DNS impossible.'));
    } finally {
      setChecking(false);
    }
  }

  const verified = !!store.customDomainVerified;
  const devOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const previewUrl = savedDomain && verified
    ? `https://${savedDomain}`
    : storeAbsoluteUrl(store.slug).startsWith('http')
      ? storeAbsoluteUrl(store.slug)
      : `${devOrigin}/${store.slug}`;
  const dirty = typed !== savedDomain;
  const hostLabel = savedDomain ? dnsHost(savedDomain) : '@';
  const cnameTarget = target.host || 'stores.flexiopage.com';

  return (
    <Card
      icon={<Globe className="h-5 w-5" />}
      title="Domaine personnalisé"
      subtitle="Pointe le DNS vers FlexioPage. La vérification reprend les mêmes règles que le serveur : CNAME, adresse A, ou nameservers."
    >
      <div className="space-y-5">
        <div>
          <Label htmlFor="domain">Ton domaine</Label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <Input
              id="domain"
              value={domain}
              onChange={(e) => { setDomain(e.target.value); setJustSaved(false); }}
              placeholder="shop.tonsite.com"
              className="h-11"
            />
            <Button onClick={handleSaveDomain} disabled={saving || !dirty} className="h-11 gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Adresse actuelle :{' '}
            <a href={previewUrl} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline">{previewUrl}</a>
          </p>
          {saveError && <p className="mt-2 text-xs font-medium text-destructive">{saveError}</p>}
          {dirty && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              Cette saisie n’est pas encore enregistrée. Le DNS se vérifie sur le domaine sauvegardé.
            </p>
          )}
          {justSaved && !verified && !dirty && (
            <p className="mt-2 text-xs font-medium text-emerald-700">
              Enregistré. Configure le DNS ci-dessous. La vérification tourne toute seule.
            </p>
          )}
        </div>

        {savedDomain && !dirty && (
          <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Configuration DNS</h3>
              {verified ? (
                <StatusPill tone="ok" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>Actif</StatusPill>
              ) : (
                <StatusPill tone="warn" icon={<AlertCircle className="h-3.5 w-3.5" />}>En attente</StatusPill>
              )}
            </div>

            {!verified && (
              <p className="text-xs text-muted-foreground">
                {isApex(savedDomain)
                  ? 'Domaine racine : l’enregistrement A est le plus fiable. Le CNAME sur @ est refusé par beaucoup de registrars.'
                  : 'Sous-domaine : un CNAME suffit. L’enregistrement A reste possible si tu préfères une IP.'}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <MethodButton
                active={method === 'cname'}
                title="CNAME"
                hint={isApex(savedDomain) ? 'Souvent refusé sur @' : 'Recommandé'}
                onClick={() => { setMethodTouched(true); setMethod('cname'); }}
              />
              <MethodButton
                active={method === 'a'}
                title="Enregistrement A"
                hint={target.ips.length ? (isApex(savedDomain) ? 'Recommandé' : 'Alternative') : 'IP non configurée'}
                onClick={() => { setMethodTouched(true); setMethod('a'); }}
              />
              <MethodButton
                active={method === 'nameservers'}
                title="Nameservers"
                hint="Délégation complète"
                onClick={() => { setMethodTouched(true); setMethod('nameservers'); }}
              />
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-4">
              {method === 'cname' && (
                <ol className="mb-3 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                  <li>Ouvre la zone DNS de <span className="font-mono text-foreground">{savedDomain}</span>.</li>
                  <li>Supprime un ancien A ou CNAME sur le même hôte s’il pointe ailleurs.</li>
                  <li>Ajoute l’enregistrement ci-dessous.</li>
                </ol>
              )}
              {method === 'cname' && (
                <RecordTable rows={[
                  { label: 'Type', value: 'CNAME' },
                  { label: 'Nom', value: hostLabel === '@' ? '@ (ou vide)' : hostLabel, copy: hostLabel === '@' ? '@' : hostLabel },
                  { label: 'Cible', value: cnameTarget, copy: cnameTarget },
                  { label: 'TTL', value: '3600, ou la valeur par défaut' },
                ]} />
              )}
              {method === 'a' && (
                target.ips.length > 0 ? (
                  <div className="space-y-3">
                    {target.ips.map((ip) => (
                      <RecordTable key={ip} rows={[
                        { label: 'Type', value: 'A' },
                        { label: 'Nom', value: hostLabel === '@' ? '@ (ou vide)' : hostLabel, copy: hostLabel === '@' ? '@' : hostLabel },
                        { label: 'Valeur', value: ip, copy: ip },
                        { label: 'TTL', value: '3600, ou la valeur par défaut' },
                      ]} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Ce serveur n’expose pas d’adresse IP de storefront. Utilise le CNAME vers <span className="font-mono text-foreground">{cnameTarget}</span>, ou les nameservers.
                  </p>
                )
              )}
              {method === 'nameservers' && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Chez le registrar, remplace les nameservers du domaine par ceux-ci. FlexioPage devient alors le DNS de toute la zone. La propagation prend souvent 24 à 48 h.
                  </p>
                  {(target.nameservers || []).length > 0 ? (
                    <ul className="space-y-2">
                      {(target.nameservers || []).map((ns) => (
                        <li key={ns} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                          <span className="truncate font-mono text-xs font-medium">{ns}</span>
                          <CopyButton value={ns} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">Nameservers indisponibles pour le moment.</p>
                  )}
                </div>
              )}
              {method === 'cname' && isApex(savedDomain) && (
                <p className="mt-3 text-xs text-amber-800">
                  Beaucoup de registrars refusent un CNAME sur le domaine racine. Si l’ajout est bloqué, passe à l’enregistrement A.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleVerify} disabled={checking} className="gap-1.5">
                {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Vérifier le DNS
              </Button>
              {!verified && (
                paused ? (
                  <Button variant="ghost" size="sm" onClick={() => setPaused(false)} className="gap-1.5 text-xs">
                    <Play className="h-3.5 w-3.5" /> Relancer la vérification auto
                  </Button>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                      Vérification toutes les 10 s
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setPaused(true)} className="gap-1.5 text-xs">
                      <Pause className="h-3.5 w-3.5" /> Pause
                    </Button>
                  </>
                )
              )}
            </div>

            {check && !check.verified && <DnsFailure check={check} expected={cnameTarget} />}
            {check?.verified && (
              <p className="text-xs font-medium text-emerald-700">DNS correct. La boutique répond sur https://{savedDomain}.</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function DnsFailure({ check, expected }: { check: DomainCheck; expected: string }) {
  const seen = [...(check.cname || []), ...(check.aRecords || [])].filter(Boolean);
  if (check.reason === 'dns_conflict_cname_and_a') {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900">
        <p className="font-semibold">Conflit DNS</p>
        <p className="mt-1">
          Un CNAME est présent mais il ne pointe pas vers <span className="font-mono">{expected}</span>, et un enregistrement A est aussi là.
          Garde un seul enregistrement qui pointe vers FlexioPage.
        </p>
        {check.cname && check.cname.length > 0 && (
          <p className="mt-1 font-mono">CNAME actuel : {check.cname.join(', ')}</p>
        )}
        {check.aRecords && check.aRecords.length > 0 && (
          <p className="font-mono">A actuel : {check.aRecords.join(', ')}</p>
        )}
      </div>
    );
  }
  if (check.reason === 'no_domain_set') {
    return <p className="text-xs text-destructive">Aucun domaine enregistré sur la boutique.</p>;
  }
  if (check.reason === 'invalid_domain') {
    return <p className="text-xs text-destructive">Le domaine enregistré n’a pas un format valide.</p>;
  }
  return (
    <p className="text-xs text-muted-foreground">
      DNS détecté : {seen.join(', ') || 'aucun enregistrement'}. Attendu : {expected}. La propagation prend en général 5 à 15 minutes.
    </p>
  );
}

function PixelsPanel({ store, onSaved }: { store: StoreDoc; onSaved: () => Promise<void> }) {
  const m = store.integrations?.marketing || {};
  const [fb, setFb] = useState(m.facebookPixelId || '');
  const [fbToken, setFbToken] = useState(m.facebookConversionsApiToken || '');
  const [ga, setGa] = useState(m.googleAnalyticsId || '');
  const [tt, setTt] = useState(m.tiktokPixelId || '');
  const [snap, setSnap] = useState(m.snapchatPixelId || '');
  const [adsId, setAdsId] = useState(m.googleAdsConversionId || '');
  const [adsLbl, setAdsLbl] = useState(m.googleAdsConversionLabel || '');
  const [custom, setCustom] = useState(m.customHeadCode || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const errors = validatePixels({ fb, ga, tt, snap, adsId, adsLbl });
  const dirty =
    fb !== (m.facebookPixelId || '') ||
    fbToken !== (m.facebookConversionsApiToken || '') ||
    ga !== (m.googleAnalyticsId || '') ||
    tt !== (m.tiktokPixelId || '') ||
    snap !== (m.snapchatPixelId || '') ||
    adsId !== (m.googleAdsConversionId || '') ||
    adsLbl !== (m.googleAdsConversionLabel || '') ||
    custom !== (m.customHeadCode || '');

  async function handleSave() {
    const nextErrors = validatePixels({ fb, ga, tt, snap, adsId, adsLbl });
    const first = Object.values(nextErrors).find(Boolean);
    if (first) {
      setError(first);
      setSavedOk(false);
      return;
    }
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      await saveIntegrations(store, {
        marketing: {
          facebookPixelId: fb.trim() || undefined,
          facebookConversionsApiToken: fbToken.trim() || undefined,
          googleAnalyticsId: ga.trim() || undefined,
          tiktokPixelId: tt.trim() || undefined,
          snapchatPixelId: snap.trim() || undefined,
          googleAdsConversionId: adsId.trim() || undefined,
          googleAdsConversionLabel: adsLbl.trim() || undefined,
          customHeadCode: custom.trim() || undefined,
        },
      });
      await onSaved();
      setSavedOk(true);
    } catch (err) {
      setError(extractApiError(err, 'Enregistrement des pixels impossible.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      icon={<BarChart3 className="h-5 w-5" />}
      title="Pixels marketing"
      subtitle="Injectés sur la boutique publique. PageView, ViewContent, InitiateCheckout et Purchase partent tout seuls."
    >
      <div className="space-y-4">
        <PixelRow logoUrl="/brands/meta-icon.svg" label="Meta Pixel" help="Events Manager. Uniquement des chiffres." error={errors.fb}>
          <Input value={fb} onChange={(e) => { setFb(e.target.value); setSavedOk(false); }} placeholder="1234567890123456" className="font-mono" />
        </PixelRow>
        <PixelRow logoUrl="/brands/meta-icon.svg" label="Jeton Conversions API" help="Optionnel. Tracking serveur, en plus du pixel navigateur.">
          <Input value={fbToken} onChange={(e) => { setFbToken(e.target.value); setSavedOk(false); }} placeholder="EAAG…" className="font-mono" type="password" autoComplete="off" />
        </PixelRow>
        <PixelRow logoUrl="/brands/google-analytics.svg" label="Google Analytics 4" help="Measurement ID, du type G-XXXXXXXX." error={errors.ga}>
          <Input value={ga} onChange={(e) => { setGa(e.target.value); setSavedOk(false); }} placeholder="G-XXXXXXXXXX" className="font-mono" />
        </PixelRow>
        <PixelRow logoUrl="/brands/tiktok.svg" label="TikTok Pixel" help="Ads Manager → Assets → Events." error={errors.tt}>
          <Input value={tt} onChange={(e) => { setTt(e.target.value); setSavedOk(false); }} placeholder="CXXXXXXXXXXXXXXXX" className="font-mono" />
        </PixelRow>
        <PixelRow logoUrl="/brands/snapchat.svg" logoBg="#FFFC00" label="Snapchat Pixel" help="UUID affiché dans l’Events Manager Snapchat." error={errors.snap}>
          <Input value={snap} onChange={(e) => { setSnap(e.target.value); setSavedOk(false); }} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="font-mono" />
        </PixelRow>
        <PixelRow logoUrl="/brands/google-ads.svg" label="Google Ads" help="ID de conversion et libellé, les deux ensemble." error={errors.ads}>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={adsId} onChange={(e) => { setAdsId(e.target.value); setSavedOk(false); }} placeholder="AW-XXXXXXXXXX" className="font-mono" aria-label="ID de conversion Google Ads" />
            <Input value={adsLbl} onChange={(e) => { setAdsLbl(e.target.value); setSavedOk(false); }} placeholder="libellé de conversion" className="font-mono" aria-label="Libellé de conversion Google Ads" />
          </div>
        </PixelRow>
        <PixelRow icon={<Info className="h-4 w-4 text-fuchsia-600" />} label="Code head personnalisé" help="Hotjar, Clarity, etc. Collé tel quel dans le head des pages publiques.">
          <textarea
            value={custom}
            onChange={(e) => { setCustom(e.target.value); setSavedOk(false); }}
            placeholder="<script>…</script>"
            rows={4}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
          />
        </PixelRow>
        <SaveBar
          dirty={dirty}
          saving={saving}
          onSave={handleSave}
          error={error}
          success={savedOk ? 'Pixels enregistrés.' : null}
          idle="Aucun changement."
        />
      </div>
    </Card>
  );
}

function validatePixels(v: { fb: string; ga: string; tt: string; snap: string; adsId: string; adsLbl: string }) {
  const out: { fb?: string; ga?: string; tt?: string; snap?: string; ads?: string } = {};
  if (v.fb.trim() && !/^\d{6,20}$/.test(v.fb.trim())) out.fb = 'Le Pixel Meta ne contient que des chiffres.';
  if (v.ga.trim() && !/^G-[A-Z0-9]+$/i.test(v.ga.trim())) out.ga = 'Format attendu : G-XXXXXXXX.';
  if (v.tt.trim() && !/^[A-Z0-9]{8,32}$/i.test(v.tt.trim())) out.tt = 'ID TikTok invalide.';
  if (v.snap.trim() && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.snap.trim())) {
    out.snap = 'Le Pixel Snapchat est un UUID.';
  }
  const id = v.adsId.trim();
  const label = v.adsLbl.trim();
  if ((id && !label) || (!id && label)) out.ads = 'Renseigne l’ID AW-… et le libellé ensemble.';
  else if (id && !/^AW-\d+$/i.test(id)) out.ads = 'L’ID Google Ads commence par AW-.';
  return out;
}

function ShippingPanel({
  store,
  onSaved,
  onSubChange,
}: {
  store: StoreDoc;
  onSaved: () => Promise<void>;
  onSubChange: (sub: ShippingTab) => void;
}) {
  const searchParams = useSearchParams();
  const sub: ShippingTab = searchParams.get('sub') === 'logistics' ? 'logistics' : 'carrier';

  if (store.storeType === 'digital') {
    return (
      <Card icon={<Truck className="h-5 w-5" />} title="Livraison" subtitle="Cette boutique vend des produits digitaux.">
        <p className="text-sm text-muted-foreground">
          Il n’y a pas d’expédition à connecter. Les pixels et le domaine restent disponibles dans les autres onglets.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Type de livraison" className="inline-flex max-w-full rounded-2xl border border-border/60 bg-card p-1">
        <SubTab active={sub === 'carrier'} icon={<Truck className="h-4 w-4" />} onClick={() => onSubChange('carrier')}>
          Société de livraison
        </SubTab>
        <SubTab active={sub === 'logistics'} icon={<Warehouse className="h-4 w-4" />} onClick={() => onSubChange('logistics')}>
          Société de logistique
        </SubTab>
      </div>
      {bestLive(store) && isMogaLive(store) && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
          Best Delivery est activé : il est utilisé en priorité. MogaDelivery ne reçoit une commande que si Best Delivery est désactivé.
        </p>
      )}
      {sub === 'carrier' ? (
        <CarrierPanel store={store} onSaved={onSaved} />
      ) : (
        <LogisticsPanel store={store} onSaved={onSaved} />
      )}
    </div>
  );
}

function CarrierPanel({ store, onSaved }: { store: StoreDoc; onSaved: () => Promise<void> }) {
  const d = store.integrations?.delivery || {};
  // MogaDelivery n’est pas un choix de cet onglet : on ne le fait pas passer
  // pour « manuel », sinon Enregistrer resterait désactivé et un save
  // effacerait Moga sans geste explicite.
  const savedCarrier: 'bestdelivery' | 'manual' | '' = d.provider === 'bestdelivery'
    ? 'bestdelivery'
    : (d.provider === 'manual' || !d.provider ? 'manual' : '');
  const [provider, setProvider] = useState<string>(savedCarrier);
  const [enabled, setEnabled] = useState(savedCarrier === 'bestdelivery' && !!d.enabled);
  const [login, setLogin] = useState(d.provider === 'bestdelivery' ? (d.login || '') : '');
  const [pwd, setPwd] = useState(d.provider === 'bestdelivery' ? (d.pwd || '') : '');
  const [baseUrl, setBaseUrl] = useState(d.provider === 'bestdelivery' ? (d.baseUrl || '') : '');
  const [autoDispatch, setAutoDispatch] = useState(d.autoDispatch ?? true);
  const [pickup, setPickup] = useState<PickupAddress>(d.provider === 'bestdelivery' ? (d.pickupAddress || {}) : {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const confirm = useConfirm();

  const dirty = provider === 'bestdelivery'
    ? savedCarrier !== 'bestdelivery' ||
      enabled !== !!d.enabled ||
      login !== (d.login || '') ||
      pwd !== (d.pwd || '') ||
      baseUrl !== (d.baseUrl || '') ||
      autoDispatch !== (d.autoDispatch ?? true) ||
      JSON.stringify(compactPickup(pickup) || {}) !== JSON.stringify(compactPickup(d.pickupAddress || {}) || {})
    : provider === 'manual' && savedCarrier !== 'manual';

  async function persist(nextProvider: 'bestdelivery' | 'manual') {
    if (nextProvider === 'bestdelivery') {
      await saveIntegrations(store, {
        delivery: {
          provider: 'bestdelivery',
          enabled,
          login: login.trim() || undefined,
          pwd: pwd.trim() || undefined,
          baseUrl: baseUrl.trim() || undefined,
          autoDispatch,
          pickupAddress: compactPickup(pickup),
        },
      });
      return;
    }
    await saveIntegrations(store, {
      delivery: { provider: 'manual', enabled: false, autoDispatch: false },
    });
  }

  async function handleSave() {
    if (provider !== 'bestdelivery' && provider !== 'manual') return;
    if (provider === 'bestdelivery' && enabled && (!login.trim() || !pwd.trim())) {
      setError('Renseigne le login et le mot de passe Best Delivery avant d’activer.');
      setSavedOk(false);
      return;
    }
    if (provider === 'manual' && d.provider === 'mogadelivery' && d.enabled) {
      const ok = await confirm({
        title: 'Couper MogaDelivery comme transporteur ?',
        description: 'Les commandes ne partiront plus via le transporteur MogaDelivery. Si la logistique Moga reste activée dans l’autre onglet, elle continuera de les recevoir.',
        confirmLabel: 'Passer en manuel',
        tone: 'destructive',
      });
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      await persist(provider === 'bestdelivery' ? 'bestdelivery' : 'manual');
      await onSaved();
      setSavedOk(true);
    } catch (err) {
      setError(extractApiError(err, 'Enregistrement impossible.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    const ok = await confirm({
      title: 'Passer en expédition manuelle ?',
      description: isMogaLive(store)
        ? 'Best Delivery sera déconnecté. MogaDelivery reste actif dans Société de logistique et continuera de recevoir les commandes.'
        : 'Les identifiants Best Delivery seront effacés. Les commandes resteront à expédier à la main.',
      confirmLabel: 'Déconnecter',
      tone: 'destructive',
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await persist('manual');
      setProvider('manual');
      setEnabled(false);
      setLogin('');
      setPwd('');
      setBaseUrl('');
      setPickup({});
      await onSaved();
      setSavedOk(true);
    } catch (err) {
      setError(extractApiError(err, 'Déconnexion impossible.'));
    } finally {
      setSaving(false);
    }
  }

  const unsupported = d.provider && !['bestdelivery', 'manual', 'mogadelivery'].includes(d.provider);

  return (
    <Card
      icon={<Truck className="h-5 w-5" />}
      title="Société de livraison"
      subtitle="Transporteur qui récupère le colis et le livre au client. MogaDelivery se configure dans Société de logistique."
    >
      <div className="space-y-5">
        {d.provider === 'mogadelivery' && d.enabled && (
          <p className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            MogaDelivery est le transporteur actif. Choisir Best Delivery le remplace. Le mode manuel le coupe, sans couper une logistique Moga encore activée.
          </p>
        )}
        {unsupported && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
            Le transporteur « {d.provider} » n’est pas branché. Tant que tu n’enregistres pas Best Delivery ou le mode manuel, aucune commande ne part.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CARRIER_PROVIDERS.map((p) => (
            <ProviderCard
              key={p.id}
              name={p.label}
              description={p.description}
              icon={<Truck className="h-5 w-5" />}
              logoUrl={p.logoUrl}
              selected={provider === p.id}
              active={p.id === 'bestdelivery' && bestLive(store) && provider === p.id}
              comingSoon={p.comingSoon}
              onSelect={() => { setProvider(p.id); setSavedOk(false); }}
            />
          ))}
        </div>

        {provider === 'manual' ? (
          <p className="text-sm text-muted-foreground">
            Mode manuel : FlexioPage n’appelle aucun transporteur. Tu suis les commandes depuis la page Commandes.
          </p>
        ) : provider !== 'bestdelivery' ? (
          <p className="text-sm text-muted-foreground">
            Choisis Best Delivery ou le mode manuel. MogaDelivery se règle dans Société de logistique.
          </p>
        ) : (
          <>
            <ToggleRow
              checked={enabled}
              onChange={(v) => { setEnabled(v); setSavedOk(false); }}
              label="Activer Best Delivery"
              sublabel="Désactivé, les commandes ne sont pas envoyées à Best Delivery."
            />
            <ToggleRow
              checked={autoDispatch}
              onChange={(v) => { setAutoDispatch(v); setSavedOk(false); }}
              label="Envoi automatique"
              sublabel="Chaque commande payée ou en paiement à la livraison part chez Best Delivery."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="bd-login">Login</Label>
                <Input id="bd-login" value={login} onChange={(e) => { setLogin(e.target.value); setSavedOk(false); }} autoComplete="off" placeholder="Compte expéditeur" className="mt-1.5 h-11" />
              </div>
              <div>
                <Label htmlFor="bd-pwd">Mot de passe</Label>
                <Input id="bd-pwd" type="password" value={pwd} onChange={(e) => { setPwd(e.target.value); setSavedOk(false); }} autoComplete="new-password" placeholder="Mot de passe" className="mt-1.5 h-11" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="bd-wsdl">WSDL (optionnel)</Label>
                <Input id="bd-wsdl" value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); setSavedOk(false); }} placeholder="https://api.best-delivery.net/serviceShipments.php?wsdl" className="mt-1.5 h-11 font-mono text-xs" />
                <p className="mt-1 text-xs text-muted-foreground">Laisse vide pour l’endpoint par défaut. Le gouvernorat vient du champ région de l’adresse.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
              <h3 className="mb-3 text-sm font-semibold">Adresse de collecte</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <PickupField label="Nom du contact" value={pickup.contactName} onChange={(v) => setPickup({ ...pickup, contactName: v })} />
                <PickupField label="Téléphone" value={pickup.contactPhone} onChange={(v) => setPickup({ ...pickup, contactPhone: v })} />
                <PickupField label="Adresse" value={pickup.line1} onChange={(v) => setPickup({ ...pickup, line1: v })} />
                <PickupField label="Ville" value={pickup.city} onChange={(v) => setPickup({ ...pickup, city: v })} />
                <PickupField label="Gouvernorat" value={pickup.state} onChange={(v) => setPickup({ ...pickup, state: v })} />
                <PickupField label="Code postal" value={pickup.postalCode} onChange={(v) => setPickup({ ...pickup, postalCode: v })} />
                <div className="sm:col-span-2">
                  <PickupField label="Pays (TN)" value={pickup.country} onChange={(v) => setPickup({ ...pickup, country: v })} />
                </div>
              </div>
            </div>
          </>
        )}

        <SaveBar
          dirty={dirty}
          saving={saving}
          onSave={handleSave}
          error={error}
          success={savedOk ? 'Livraison enregistrée.' : null}
          idle={bestLive(store) ? 'Best Delivery actif.' : 'Aucune société de livraison active.'}
          extra={bestLive(store) ? (
            <Button variant="outline" onClick={handleDisconnect} disabled={saving} className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Power className="h-4 w-4" /> Déconnecter
            </Button>
          ) : null}
        />
      </div>
    </Card>
  );
}

function LogisticsPanel({ store, onSaved }: { store: StoreDoc; onSaved: () => Promise<void> }) {
  const logistics = store.integrations?.logistics || {};
  const delivery = store.integrations?.delivery;
  const initial = logistics.provider === 'mogadelivery' || isMogaLive(store) ? 'mogadelivery' : 'manual';
  const [provider, setProvider] = useState(initial);
  const [enabled, setEnabled] = useState(isMogaLive(store));
  const [autoForward, setAutoForward] = useState(
    delivery?.provider === 'mogadelivery'
      ? (delivery.autoDispatch ?? true)
      : (logistics.autoForward ?? true),
  );
  const [baseUrl, setBaseUrl] = useState(logistics.baseUrl || delivery?.baseUrl || '');
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const confirm = useConfirm();

  const isMoga = provider === 'mogadelivery';
  const country = (store.settings?.country || '').trim().toUpperCase();
  const savedKind = logistics.provider === 'mogadelivery' || isMogaLive(store) ? 'mogadelivery' : 'manual';
  const dirty =
    (isMoga ? 'mogadelivery' : 'manual') !== savedKind ||
    (isMoga && (
      enabled !== isMogaLive(store) ||
      autoForward !== (delivery?.provider === 'mogadelivery' ? (delivery.autoDispatch ?? true) : (logistics.autoForward ?? true)) ||
      baseUrl !== (logistics.baseUrl || delivery?.baseUrl || '')
    ));

  function buildMogaPatch(nextEnabled: boolean): Partial<NonNullable<StoreDoc['integrations']>> {
    const keepBest = delivery?.provider === 'bestdelivery';
    return {
      logistics: {
        provider: 'mogadelivery',
        enabled: nextEnabled,
        autoForward,
        baseUrl: baseUrl.trim() || undefined,
        ...(logistics.webhookSecret ? { webhookSecret: logistics.webhookSecret } : {}),
        ...(logistics.apiKey ? { apiKey: logistics.apiKey } : {}),
      },
      delivery: keepBest
        ? delivery
        : {
            ...(delivery || {}),
            provider: 'mogadelivery',
            enabled: nextEnabled,
            autoDispatch: autoForward,
            baseUrl: baseUrl.trim() || delivery?.baseUrl || undefined,
          },
    };
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setNotice(null);
    setSavedOk(false);
    try {
      if (!isMoga) {
        const patch: Partial<NonNullable<StoreDoc['integrations']>> = {
          logistics: { provider: 'manual', enabled: false, autoForward: false },
        };
        if (delivery?.provider === 'mogadelivery') {
          patch.delivery = { ...delivery, provider: 'manual', enabled: false, autoDispatch: false };
        }
        await saveIntegrations(store, patch);
      } else {
        await saveIntegrations(store, buildMogaPatch(enabled));
      }
      await onSaved();
      setSavedOk(true);
    } catch (err) {
      setError(extractApiError(err, 'Enregistrement impossible.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleConnect() {
    if (country.length !== 2) {
      setError('Indique le pays de la boutique (2 lettres) dans Identité avant de connecter MogaDelivery.');
      return;
    }
    setConnecting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await storesApi.connectMogaDelivery(store._id, { country });
      const fresh = await storesApi.list();
      const current = ((fresh.data.stores as StoreDoc[]) || []).find((s) => s._id === store._id) || store;
      const bestStill = current.integrations?.delivery?.provider === 'bestdelivery' && current.integrations.delivery.enabled;
      await saveIntegrations(current, {
        logistics: {
          ...(current.integrations?.logistics || {}),
          provider: 'mogadelivery',
          enabled: true,
          autoForward: true,
        },
        ...(bestStill ? {} : {
          delivery: {
            ...(current.integrations?.delivery || {}),
            provider: 'mogadelivery',
            enabled: true,
            autoDispatch: true,
          },
        }),
      });
      setEnabled(true);
      setProvider('mogadelivery');
      await onSaved();
      setNotice(res.data.mode === 'auto'
        ? 'Boutique enregistrée chez MogaDelivery. L’authentification utilise le secret plateforme.'
        : (res.data.message || 'Demande à MogaDelivery d’enregistrer le Store ID ci-dessous. Aucune clé secrète à leur envoyer.'));
    } catch (err) {
      setError(extractApiError(err, 'Connexion MogaDelivery impossible.'));
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    const ok = await confirm({
      title: 'Déconnecter MogaDelivery ?',
      description: 'Les commandes ne seront plus envoyées à MogaDelivery. Le Store ID déjà communiqué reste valable pour une reconnexion.',
      confirmLabel: 'Déconnecter',
      tone: 'destructive',
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      const patch: Partial<NonNullable<StoreDoc['integrations']>> = {
        logistics: { provider: 'manual', enabled: false, autoForward: false },
      };
      if (delivery?.provider === 'mogadelivery') {
        patch.delivery = { ...delivery, provider: 'manual', enabled: false, autoDispatch: false };
      }
      await saveIntegrations(store, patch);
      setProvider('manual');
      setEnabled(false);
      await onSaved();
      setSavedOk(true);
    } catch (err) {
      setError(extractApiError(err, 'Déconnexion impossible.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      icon={<Warehouse className="h-5 w-5" />}
      title="Société de logistique"
      subtitle="Le prestataire stocke, prépare et expédie. MogaDelivery est le seul 3PL branché aujourd’hui."
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LOGISTICS_PROVIDERS.map((p) => (
            <ProviderCard
              key={p.id}
              name={p.label}
              description={p.description}
              icon={<Warehouse className="h-5 w-5" />}
              logoUrl={'logoUrl' in p ? p.logoUrl : undefined}
              selected={provider === p.id}
              active={p.id === 'mogadelivery' && isMogaLive(store) && provider === p.id}
              comingSoon={p.comingSoon}
              onSelect={() => {
                setProvider(p.id);
                setSavedOk(false);
                if (p.id === 'mogadelivery') setEnabled(true);
              }}
            />
          ))}
        </div>

        {isMoga ? (
          <>
            <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-4">
              <div className="flex items-start gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Info className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">Connexion MogaDelivery</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Le secret HMAC est celui de la plateforme. Tu n’as pas de clé à générer ni à coller. MogaDelivery identifie la boutique avec le Store ID.
                  </p>
                </div>
              </div>
              <div>
                <Label>Store ID</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-card px-3 py-2 font-mono text-xs">{store._id}</code>
                  <CopyButton value={store._id} />
                </div>
              </div>
              {country.length === 2 ? (
                <p className="text-xs text-muted-foreground">Pays utilisé pour l’onboarding : <span className="font-medium text-foreground">{country}</span></p>
              ) : (
                <p className="text-xs text-amber-800">
                  Pays manquant.{' '}
                  <Link href={`/dashboard/stores/${store._id}?block=identity`} className="font-medium underline">Renseigne-le dans Identité</Link>
                  {' '}(code à 2 lettres) avant la connexion automatique.
                </p>
              )}
              <Button type="button" onClick={handleConnect} disabled={connecting || country.length !== 2} className="gap-2">
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                {isMogaLive(store) ? 'Resynchroniser' : 'Connecter MogaDelivery'}
              </Button>
              {mogaOnboarded(store) && !isMogaLive(store) && (
                <p className="text-xs text-amber-800">La boutique est connue de MogaDelivery, mais le dispatch est coupé. Active l’intégration puis enregistre.</p>
              )}
            </div>

            <ToggleRow
              checked={enabled}
              onChange={(v) => { setEnabled(v); setSavedOk(false); }}
              label="Activer l’envoi des commandes"
              sublabel={bestLive(store)
                ? 'Best Delivery reste prioritaire tant qu’il est activé. MogaDelivery prendra le relais s’il est coupé.'
                : 'Chaque nouvelle commande part chez MogaDelivery.'}
            />
            <ToggleRow
              checked={autoForward}
              onChange={(v) => { setAutoForward(v); setSavedOk(false); }}
              label="Envoi automatique"
              sublabel="Décoche pour ne dispatcher qu’à la main depuis Commandes."
            />
            <div className="rounded-xl border border-border/60 bg-card px-3 py-2 text-xs text-muted-foreground">
              Chaque produit doit avoir le même SKU dans FlexioPage et dans MogaDelivery. Le SKU se pose sur la fiche produit.
            </div>
            <details className="rounded-xl border border-border/60 bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">URL d’envoi (optionnel)</summary>
              <div className="border-t border-border/60 p-4">
                <Label htmlFor="moga-url">Endpoint MogaDelivery</Label>
                <Input
                  id="moga-url"
                  value={baseUrl}
                  onChange={(e) => { setBaseUrl(e.target.value); setSavedOk(false); }}
                  placeholder="https://api.admin-mogadelivery.com/api/webhooks/flexiopage"
                  className="mt-1.5 h-10 font-mono text-xs"
                />
                <p className="mt-1 text-xs text-muted-foreground">Laisse vide pour l’endpoint de production.</p>
              </div>
            </details>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun 3PL. Les commandes suivent uniquement la société de livraison, ou restent manuelles.
          </p>
        )}

        {notice && <p className="text-xs font-medium text-emerald-700">{notice}</p>}

        <SaveBar
          dirty={dirty}
          saving={saving}
          onSave={handleSave}
          error={error}
          success={savedOk ? 'Logistique enregistrée.' : null}
          idle={isMogaLive(store) ? 'MogaDelivery actif.' : 'Aucune logistique active.'}
          extra={isMogaLive(store) ? (
            <Button variant="outline" onClick={handleDisconnect} disabled={saving} className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Power className="h-4 w-4" /> Déconnecter
            </Button>
          ) : null}
        />
      </div>
    </Card>
  );
}

function compactPickup(pickup: PickupAddress): PickupAddress | undefined {
  const out: PickupAddress = {};
  (Object.keys(pickup) as (keyof PickupAddress)[]).forEach((key) => {
    const value = pickup[key]?.trim();
    if (value) out[key] = value;
  });
  return Object.keys(out).length ? out : undefined;
}

function PickupField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input value={value || ''} onChange={(e) => onChange(e.target.value)} className="mt-1.5" />
    </div>
  );
}

function Card({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
      <header className="mb-5 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl gradient-brand text-white">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function MethodButton({ active, title, hint, onClick }: { active: boolean; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
        </span>
        {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
      </span>
    </button>
  );
}

function RecordTable({ rows }: { rows: { label: string; value: string; copy?: string }[] }) {
  return (
    <dl className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-background">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3 px-3 py-2.5">
          <dt className="w-16 shrink-0 text-xs text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 flex-1 truncate font-mono text-xs font-medium">{row.value}</dd>
          {row.copy ? <CopyButton value={row.copy} /> : null}
        </div>
      ))}
    </dl>
  );
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch { /* presse-papiers refusé */ }
      }}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'Copié' : 'Copier'}
    </button>
  );
}

function StatusPill({ tone, icon, children }: { tone: 'ok' | 'warn'; icon: ReactNode; children: ReactNode }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
      tone === 'ok' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700',
    )}>
      {icon}
      {children}
    </span>
  );
}

function SubTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4',
        active ? 'gradient-brand text-white shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function PixelRow({ icon, logoUrl, logoBg, label, help, error, children }: { icon?: ReactNode; logoUrl?: string; logoBg?: string; label: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border bg-muted/20 p-4', error ? 'border-destructive/50' : 'border-border/60')}>
      <div className="mb-2 flex items-center gap-2">
        {logoUrl ? (
          <BrandLogo src={logoUrl} bg={logoBg} className="h-8 w-8 rounded-lg" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-card">{icon}</span>
        )}
        <div>
          <Label className="text-sm font-semibold">{label}</Label>
          {help && <p className="text-xs text-muted-foreground">{help}</p>}
        </div>
      </div>
      {children}
      {error && <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function ProviderCard({
  name,
  description,
  icon,
  logoUrl,
  selected,
  active = false,
  comingSoon = false,
  onSelect,
}: {
  name: string;
  description: string;
  icon: ReactNode;
  logoUrl?: string;
  selected: boolean;
  active?: boolean;
  comingSoon?: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={cn(
      'flex flex-col rounded-2xl border bg-card p-4',
      selected ? 'border-primary ring-2 ring-primary/15' : 'border-border/60',
      comingSoon && 'opacity-70',
    )}>
      <div className="flex items-start justify-between gap-2">
        <ProviderLogo logoUrl={logoUrl} name={name} fallback={icon} />
        {active ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Actif
          </span>
        ) : selected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            Sélectionné
          </span>
        ) : comingSoon ? (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700">Bientôt</span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Disponible</span>
        )}
      </div>
      <h3 className="mt-3 text-sm font-semibold">{name}</h3>
      <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{description}</p>
      <Button
        type="button"
        size="sm"
        variant={selected || comingSoon ? 'outline' : 'default'}
        onClick={comingSoon || selected ? undefined : onSelect}
        disabled={comingSoon || selected}
        className={cn('mt-3 w-full', !selected && !comingSoon && 'gradient-brand text-white')}
      >
        {comingSoon ? 'Bientôt disponible' : selected ? (active ? 'Actif' : 'Sélectionné') : 'Choisir'}
      </Button>
    </div>
  );
}

function ProviderLogo({ logoUrl, name, fallback }: { logoUrl?: string; name: string; fallback: ReactNode }) {
  const [broken, setBroken] = useState(false);
  if (logoUrl && !broken) {
    return (
      <span className="grid h-12 w-16 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-border/60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name} className="max-h-9 max-w-[3.4rem] object-contain" onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span className="grid h-10 w-10 place-items-center rounded-xl gradient-brand text-white">
      {fallback}
    </span>
  );
}

function ToggleRow({ checked, onChange, label, sublabel }: { checked: boolean; onChange: (b: boolean) => void; label: string; sublabel?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {sublabel && <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )} />
      </button>
    </div>
  );
}

function SaveBar({
  dirty,
  saving,
  onSave,
  error,
  success,
  idle,
  extra,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  error: string | null;
  success: string | null;
  idle: string;
  extra?: ReactNode;
}) {
  return (
    <div className={cn(
      'flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3',
      error ? 'border-destructive/40 bg-destructive/5' : dirty ? 'border-amber-500/40 bg-amber-500/10' : 'border-border/60 bg-muted/20',
    )}>
      <p className={cn(
        'text-sm',
        error ? 'text-destructive' : dirty ? 'font-medium text-amber-800' : 'text-muted-foreground',
      )}>
        {error || (dirty ? 'Changements non enregistrés.' : success || idle)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        <Button onClick={onSave} disabled={saving || !dirty} className={cn('gap-2', dirty && 'gradient-brand text-white')}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
