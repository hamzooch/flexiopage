'use client';

/**
 * Integrations page — store-level connections.
 *
 *   1. Domaine personnalisé — DNS verification (CNAME / A)
 *   2. Pixels marketing — Facebook Pixel, GA4, TikTok Pixel, custom <head>
 *   3. Livraison — split in two sub-tabs:
 *        a. Société de livraison (last-mile carrier: MogaDelivery, Yalidine…)
 *        b. Société de logistique (3PL fulfillment: ShipBob, Cubyn…)
 *
 * Workflow apps (Google Sheets, Mailchimp, Slack) live under
 * /dashboard/apps — this page is for store-level platform plumbing.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { storesApi } from '@/lib/api';
import { useStoreStore } from '@/stores/store-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, storeAbsoluteUrl } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/page-header';
import {
  Globe,
  CheckCircle2,
  AlertCircle,
  Copy,
  Loader2,
  Save,
  Sparkles,
  Facebook,
  BarChart3,
  PlayCircle,
  Ghost,
  Truck,
  Warehouse,
  RefreshCw,
  Plug,
  KeyRound,
  Lock,
  Info,
} from 'lucide-react';

type TabId = 'domain' | 'pixels' | 'shipping';
type ShippingTab = 'carrier' | 'logistics';

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
  provider?: 'mogadelivery' | 'yalidine' | 'noest' | 'aramex' | 'manual' | 'other';
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  autoDispatch?: boolean;
  pickupAddress?: PickupAddress;
}

interface LogisticsConfig {
  provider?: 'mogadelivery' | 'shipbob' | 'cubyn' | 'amazon-mcf' | 'sendcloud' | 'easyship' | 'manual' | 'other';
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  webhookSecret?: string;
  warehouseId?: string;
  autoForward?: boolean;
}

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  subdomain: string;
  customDomain?: string;
  customDomainVerified?: boolean;
  customDomainVerifiedAt?: string;
  customDomainTarget?: string;
  settings?: { currency?: string };
  integrations?: {
    delivery?: DeliveryConfig;
    logistics?: LogisticsConfig;
    marketing?: {
      facebookPixelId?: string;
      facebookConversionsApiToken?: string;
      googleAnalyticsId?: string;
      tiktokPixelId?: string;
      snapchatPixelId?: string;
      googleAdsConversionId?: string;
      googleAdsConversionLabel?: string;
      customHeadCode?: string;
    };
  };
}

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'domain', label: 'Domaine', icon: Globe },
  { id: 'pixels', label: 'Pixels marketing', icon: BarChart3 },
  { id: 'shipping', label: 'Livraison', icon: Truck },
];

export default function IntegrationsPage() {
  const { currentStoreId, setCurrentStore } = useStoreStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialTab: TabId = (() => {
    const t = searchParams.get('tab');
    return t === 'shipping' || t === 'pixels' || t === 'domain' ? t : 'domain';
  })();
  const [stores, setStores] = useState<StoreDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>(initialTab);
  const [savingTab, setSavingTab] = useState<TabId | null>(null);

  // Sync l'onglet courant à l'URL pour que refresh / partage de lien
  // garde le contexte. Wrap dans useEffect pour ne pas spam le router à
  // chaque render et pour préserver `storeId` + `sub` (sous-onglet livraison).
  useEffect(() => {
    const next = new URLSearchParams(searchParams?.toString() || '');
    if (next.get('tab') === tab) return; // pas de churn
    next.set('tab', tab);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [tab, router, pathname, searchParams]);

  // Allow ?storeId=… to override the currently selected store (used by the
  // onboarding checklist links that pass the store id explicitly).
  useEffect(() => {
    const sid = searchParams.get('storeId');
    if (sid && sid !== currentStoreId) setCurrentStore(sid);
  }, [searchParams, currentStoreId, setCurrentStore]);

  const activeStore = useMemo(
    () => stores.find((s) => s._id === currentStoreId) || stores[0] || null,
    [stores, currentStoreId]
  );

  const refreshStores = useCallback(async () => {
    setLoading(true);
    try {
      const res = await storesApi.list();
      const list = (res.data.stores as StoreDoc[]) || [];
      setStores(list);
      if (!currentStoreId && list[0]) setCurrentStore(list[0]._id);
    } finally {
      setLoading(false);
    }
  }, [currentStoreId, setCurrentStore]);

  useEffect(() => { void refreshStores(); }, [refreshStores]);

  if (loading) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeStore) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Tu n'as pas encore de boutique. Crée-en une depuis le dashboard avant de configurer les intégrations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Plug}
        title={`Intégrations · ${activeStore.name}`}
        description={<>Domaine, pixels marketing, livraison. Apps productivité dans <a href="/dashboard/apps" className="font-medium text-primary hover:underline">Applications →</a></>}
        actions={stores.length > 1 ? (
          <select
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

      <nav role="tablist" className="inline-flex rounded-2xl border border-border/60 bg-card p-1 shadow-sm overflow-x-auto">
        {TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all whitespace-nowrap sm:px-4',
                isActive
                  ? 'gradient-brand text-white shadow-md shadow-primary/30'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon className="h-4 w-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {tab === 'domain' && (
        <DomainPanel
          store={activeStore}
          onSaved={refreshStores}
          saving={savingTab === 'domain'}
          setSaving={(b) => setSavingTab(b ? 'domain' : null)}
        />
      )}
      {tab === 'pixels' && (
        <PixelsPanel
          store={activeStore}
          onSaved={refreshStores}
          saving={savingTab === 'pixels'}
          setSaving={(b) => setSavingTab(b ? 'pixels' : null)}
        />
      )}
      {tab === 'shipping' && (
        <ShippingPanel
          store={activeStore}
          onSaved={refreshStores}
          saving={savingTab === 'shipping'}
          setSaving={(b) => setSavingTab(b ? 'shipping' : null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// DOMAIN
// ─────────────────────────────────────────────────────────────────────
function DomainPanel({ store, onSaved, saving, setSaving }: PanelProps) {
  const [domain, setDomain] = useState(store.customDomain || '');
  const [target, setTarget] = useState<{ host: string; ips: string[] }>({ host: '', ips: [] });
  const [check, setCheck] = useState<null | { verified: boolean; cname?: string[]; aRecords?: string[]; reason?: string }>(null);
  const [checking, setChecking] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    storesApi.getDomainTarget(store._id).then((r) => setTarget(r.data)).catch(() => {});
  }, [store._id]);

  // Normalize what the user types (no protocol, no path, no trailing dot).
  function normalize(d: string): string {
    return d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  }

  async function handleSaveDomain() {
    setSaving(true);
    setSaveError(null);
    setJustSaved(false);
    setCheck(null);
    try {
      const clean = normalize(domain);
      // Empty input → clear the domain. Non-empty → must match the basic shape;
      // backend re-validates, this just spares a round-trip on obvious typos.
      if (clean && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) {
        setSaveError('Format invalide. Exemple : shop.tonsite.com');
        return;
      }
      await storesApi.update(store._id, { customDomain: clean || null });
      setDomain(clean);
      setJustSaved(true);
      await onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
        || (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Échec de l\'enregistrement';
      setSaveError(msg);
    } finally { setSaving(false); }
  }

  async function handleVerify() {
    setChecking(true);
    try {
      const res = await storesApi.verifyDomain(store._id);
      setCheck(res.data);
      setJustSaved(false);
      await onSaved();
    } finally { setChecking(false); }
  }

  const verified = !!store.customDomainVerified;
  // Build the dev preview URL from the current origin so it follows whichever
  // port Next is running on (3000, 3002, etc.) instead of being pinned. In
  // prod, fall back to the canonical subdomain URL via storeAbsoluteUrl.
  const devOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const previewUrl = store.customDomain && verified
    ? `https://${store.customDomain}`
    : storeAbsoluteUrl(store.slug).startsWith('http')
      ? storeAbsoluteUrl(store.slug)
      : `${devOrigin}/${store.slug}`;

  return (
    <Card icon={<Globe className="h-5 w-5" />} title="Domaine personnalisé"
      subtitle="Connecte ton propre domaine (ex. shop.tonsite.com). On vérifie le DNS pour toi.">
      <div className="space-y-5">
        <div>
          <Label htmlFor="domain">Ton domaine</Label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <Input
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="shop.tonsite.com"
              className="h-11"
            />
            <Button onClick={handleSaveDomain} disabled={saving} className="h-11 gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            URL actuelle : <a href={previewUrl} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline">{previewUrl}</a>
          </p>
          {saveError && (
            <p className="mt-2 text-xs font-medium text-destructive">{saveError}</p>
          )}
          {justSaved && !verified && (
            <p className="mt-2 text-xs font-medium text-emerald-600">
              Enregistré. Configure les enregistrements DNS ci-dessous puis clique sur « Vérifier le DNS ».
            </p>
          )}
        </div>

        {domain.trim() && (
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Configuration DNS</h4>
              {verified ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Vérifié
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" /> Non vérifié
                </span>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Suis ces étapes chez ton fournisseur de domaine (le site où tu as acheté <span className="font-mono text-foreground">{domain}</span> — OVH, GoDaddy, Namecheap, Hostinger, Gandi, etc.) :
            </p>

            <ol className="mt-3 space-y-3 text-xs">
              <li className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">1</span>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">Connecte-toi à ton fournisseur de domaine</p>
                  <p className="mt-0.5 text-muted-foreground">
                    Va sur le site où tu as acheté le domaine et connecte-toi à ton compte.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">2</span>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">Ouvre la zone DNS du domaine</p>
                  <p className="mt-0.5 text-muted-foreground">
                    Cherche un menu nommé <span className="font-mono text-foreground">Zone DNS</span>, <span className="font-mono text-foreground">Manage DNS</span>, <span className="font-mono text-foreground">Advanced DNS</span> ou <span className="font-mono text-foreground">DNS Records</span> selon le fournisseur.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">3</span>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">Ajoute le(s) enregistrement(s) ci-dessous</p>
                  <p className="mt-0.5 text-muted-foreground">
                    Clique sur <span className="font-mono text-foreground">Ajouter un enregistrement</span> et recopie exactement les valeurs (bouton « Copier » à droite).
                  </p>
                  <div className="mt-2.5 space-y-2">
                    <DnsRow type="CNAME" host={domain} value={target.host || 'stores.flexiopage.com'} />
                    {target.ips.length > 0 && (
                      <DnsRow type="A (apex)" host={domain} value={target.ips.join(', ')} />
                    )}
                  </div>
                  <div className="mt-2.5 rounded-lg border border-border/50 bg-card/60 p-2.5 text-[11px] text-muted-foreground">
                    <p className="font-semibold text-foreground">Comment remplir le formulaire ?</p>
                    <ul className="mt-1 space-y-0.5">
                      <li>• <span className="font-mono text-foreground">Type</span> : <span className="font-mono">CNAME</span> {target.ips.length > 0 && <>(ou <span className="font-mono">A</span> pour la ligne « apex »)</>}</li>
                      <li>• <span className="font-mono text-foreground">Nom</span> / <span className="font-mono text-foreground">Host</span> : la partie avant ton domaine principal (ex. <span className="font-mono">shop</span>) — ou laisse vide / <span className="font-mono">@</span> pour le domaine nu.</li>
                      <li>• <span className="font-mono text-foreground">Valeur</span> / <span className="font-mono text-foreground">Target</span> : ce qui est affiché à droite de la flèche dans le tableau ci-dessus.</li>
                      <li>• <span className="font-mono text-foreground">TTL</span> : laisse la valeur par défaut (ou <span className="font-mono">3600</span>).</li>
                    </ul>
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">4</span>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">Enregistre puis attends la propagation</p>
                  <p className="mt-0.5 text-muted-foreground">
                    Sauvegarde la zone DNS chez ton fournisseur. La propagation prend généralement <span className="font-medium text-foreground">5 à 30 minutes</span> (parfois jusqu'à 24 h).
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">5</span>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">Reviens ici et clique sur « Vérifier le DNS »</p>
                  <p className="mt-0.5 text-muted-foreground">
                    Une fois le badge vert « Vérifié » affiché, ton domaine est actif et ta boutique sera accessible via <span className="font-mono text-foreground">https://{domain}</span>.
                  </p>
                </div>
              </li>
            </ol>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleVerify} disabled={checking} className="gap-1.5">
                {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Vérifier le DNS
              </Button>
              {check && !check.verified && (
                <span className="text-xs text-destructive">
                  {check.reason === 'dns_not_matching'
                    ? `DNS détecté : ${[...(check.cname || []), ...(check.aRecords || [])].join(', ') || '—'} — la propagation n'est peut-être pas terminée, réessaie dans quelques minutes.`
                    : check.reason}
                </span>
              )}
              {check && check.verified && (
                <span className="text-xs text-emerald-600 font-medium">DNS correct ✓</span>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function DnsRow({ type, host, value }: { type: string; host: string; value: string }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2 text-xs sm:grid-cols-[80px_1fr_auto]">
      <span className="rounded-md bg-card px-2 py-1 font-semibold">{type}</span>
      <span className="rounded-md bg-card px-2 py-1 font-mono text-muted-foreground truncate">
        {host} → <span className="text-foreground">{value}</span>
      </span>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(value)}
        className="hidden sm:inline-flex items-center gap-1 rounded-md bg-card px-2 py-1 hover:bg-muted text-muted-foreground"
        aria-label="Copier"
      >
        <Copy className="h-3 w-3" /> Copier
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PIXELS
// ─────────────────────────────────────────────────────────────────────
function PixelsPanel({ store, onSaved, saving, setSaving }: PanelProps) {
  const m = store.integrations?.marketing || {};
  const [fb, setFb] = useState(m.facebookPixelId || '');
  const [fbToken, setFbToken] = useState(m.facebookConversionsApiToken || '');
  const [ga, setGa] = useState(m.googleAnalyticsId || '');
  const [tt, setTt] = useState(m.tiktokPixelId || '');
  const [snap, setSnap] = useState(m.snapchatPixelId || '');
  const [adsId, setAdsId] = useState(m.googleAdsConversionId || '');
  const [adsLbl, setAdsLbl] = useState(m.googleAdsConversionLabel || '');
  const [custom, setCustom] = useState(m.customHeadCode || '');

  async function handleSave() {
    setSaving(true);
    try {
      await storesApi.update(store._id, {
        integrations: {
          ...store.integrations,
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
        },
      });
      await onSaved();
    } finally { setSaving(false); }
  }

  return (
    <Card icon={<BarChart3 className="h-5 w-5" />} title="Pixels marketing"
      subtitle="On injecte les tags dans ta boutique et on déclenche PageView, ViewContent, InitiateCheckout, Purchase automatiquement.">
      <div className="space-y-5">
        <PixelRow icon={<Facebook className="h-5 w-5 text-blue-600" />}
          label="Facebook / Meta Pixel ID"
          help="Found in Meta Events Manager. Ex: 1234567890123456">
          <Input value={fb} onChange={(e) => setFb(e.target.value)} placeholder="1234567890123456" className="font-mono" />
        </PixelRow>

        <PixelRow icon={<Facebook className="h-5 w-5 text-blue-700" />}
          label="Meta Conversions API token (optionnel)"
          help="Pour le tracking server-side (anti-iOS 14.5). Onglet Conversion API → Generate Access Token.">
          <Input value={fbToken} onChange={(e) => setFbToken(e.target.value)} placeholder="EAAG..." className="font-mono" type="password" />
        </PixelRow>

        <PixelRow icon={<BarChart3 className="h-5 w-5 text-amber-600" />}
          label="Google Analytics 4 — Measurement ID"
          help="Dans Admin GA4 → Data Streams. Ex: G-XXXXXXXXXX">
          <Input value={ga} onChange={(e) => setGa(e.target.value)} placeholder="G-XXXXXXXXXX" className="font-mono" />
        </PixelRow>

        <PixelRow icon={<PlayCircle className="h-5 w-5 text-rose-600" />}
          label="TikTok Pixel ID"
          help="TikTok Ads Manager → Assets → Events. Ex: CXXXXXXXXXXXXXXXX">
          <Input value={tt} onChange={(e) => setTt(e.target.value)} placeholder="CXXXXXXXXXXXXXXXX" className="font-mono" />
        </PixelRow>

        <PixelRow icon={<Ghost className="h-5 w-5 text-yellow-500" />}
          label="Snapchat Pixel ID"
          help="Snapchat Ads Manager → Events Manager → ton Pixel. Format UUID (ex: 12a3b4c5-...).">
          <Input value={snap} onChange={(e) => setSnap(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="font-mono" />
        </PixelRow>

        <PixelRow icon={<Sparkles className="h-5 w-5 text-emerald-600" />}
          label="Google Ads (optionnel)"
          help="AW-XXXXXXXXXX + label pour le conversion tracking.">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={adsId} onChange={(e) => setAdsId(e.target.value)} placeholder="AW-XXXXXXXXXX" className="font-mono" />
            <Input value={adsLbl} onChange={(e) => setAdsLbl(e.target.value)} placeholder="conversion-label" className="font-mono" />
          </div>
        </PixelRow>

        <PixelRow icon={<Sparkles className="h-5 w-5 text-fuchsia-600" />}
          label="Code <head> personnalisé"
          help="Pour Hotjar, Clarity, Snap Pixel, etc. Inséré tel quel dans la <head> de tes pages publiques.">
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="<script>...</script>"
            rows={4}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs"
          />
        </PixelRow>

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer les pixels
        </Button>
      </div>
    </Card>
  );
}

function PixelRow({ icon, label, help, children }: { icon: React.ReactNode; label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-card">{icon}</span>
        <div>
          <Label className="text-sm font-semibold">{label}</Label>
          {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SHIPPING — sub-tabs: carrier (livraison) + logistics (3PL)
// ─────────────────────────────────────────────────────────────────────
// MogaDelivery vit dans la liste 3PL ci-dessous — c'est notre partenaire
// logistique end-to-end (stockage + dispatch + transporteurs), pas un simple
// transporteur last-mile. On ne le propose donc plus comme « société de
// livraison » pour ne pas brouiller le positionnement.
const CARRIER_PROVIDERS = [
  { id: 'yalidine',     label: 'Yalidine (Algérie)',       description: 'Livraison nationale Algérie' },
  { id: 'noest',        label: 'Noest Express (Algérie)',  description: 'Livraison express Algérie' },
  { id: 'aramex',       label: 'Aramex (MENA)',            description: 'International MENA + Asie' },
  { id: 'manual',       label: 'Manuel (sans API)',         description: 'Tu gères toi-même les expéditions' },
  { id: 'other',        label: 'Autre',                     description: 'Autre transporteur' },
] as const;

const LOGISTICS_PROVIDERS = [
  { id: 'mogadelivery', label: 'MogaDelivery', description: 'Stockage + dispatch automatique Afrique. SKU matching natif.', logoUrl: '/integrations/mogadelivery.png' },
  { id: 'shipbob',      label: 'ShipBob',      description: '3PL global — entrepôts US, EU, AU, CA' },
  { id: 'manual',       label: 'Manuel',       description: 'Pas de logistique externe' },
] as const;

function ShippingPanel({ store, onSaved, saving, setSaving }: PanelProps) {
  // Sous-onglet persisté via `?sub=carrier|logistics` — comme le tab parent,
  // on garde l'état au refresh pour ne pas renvoyer le vendeur sur Carrier
  // alors qu'il était sur Logistique.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialSub: ShippingTab = searchParams?.get('sub') === 'logistics' ? 'logistics' : 'carrier';
  const [subTab, setSubTab] = useState<ShippingTab>(initialSub);
  useEffect(() => {
    const next = new URLSearchParams(searchParams?.toString() || '');
    if (next.get('sub') === subTab) return;
    next.set('sub', subTab);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [subTab, router, pathname, searchParams]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/60 bg-card p-1.5 inline-flex">
        <button
          type="button"
          onClick={() => setSubTab('carrier')}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all',
            subTab === 'carrier' ? 'bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Truck className="h-4 w-4" />
          Société de livraison
        </button>
        <button
          type="button"
          onClick={() => setSubTab('logistics')}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all',
            subTab === 'logistics' ? 'bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Warehouse className="h-4 w-4" />
          Société de logistique
        </button>
      </div>

      {subTab === 'carrier' ? (
        <CarrierPanel store={store} onSaved={onSaved} saving={saving} setSaving={setSaving} />
      ) : (
        <LogisticsPanel store={store} onSaved={onSaved} saving={saving} setSaving={setSaving} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Carrier (last-mile delivery company)
// ─────────────────────────────────────────────────────────────────────
function CarrierPanel({ store, onSaved, saving, setSaving }: PanelProps) {
  const d = store.integrations?.delivery || {};
  const [provider, setProvider] = useState<string>(d.provider || 'manual');
  const [enabled, setEnabled] = useState(!!d.enabled);
  const [apiKey, setApiKey] = useState(d.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(d.baseUrl || '');
  const [autoDispatch, setAutoDispatch] = useState(d.autoDispatch ?? true);
  const [pickup, setPickup] = useState<PickupAddress>(d.pickupAddress || {});

  // Une intégration est considérée "active" dès qu'un provider non-manual est
  // choisi OU qu'une clé API est saisie. Le bouton Déconnecter ne sort que
  // dans ce cas — pas d'intérêt à proposer de déconnecter le défaut "manual".
  const isConnected = (d.provider && d.provider !== 'manual') || !!d.apiKey || !!d.enabled;

  async function handleSave() {
    setSaving(true);
    try {
      await storesApi.update(store._id, {
        integrations: {
          ...store.integrations,
          delivery: {
            provider,
            enabled,
            apiKey: apiKey.trim() || undefined,
            baseUrl: baseUrl.trim() || undefined,
            autoDispatch,
            pickupAddress: pickup,
          },
        },
      });
      await onSaved();
    } finally { setSaving(false); }
  }

  async function handleDisconnect() {
    const ok = window.confirm(
      `Déconnecter ${d.provider || 'le transporteur'} ?\n\nLa clé API, l'URL et l'adresse de pickup seront effacées. Les commandes resteront en attente de dispatch manuel.`
    );
    if (!ok) return;
    setSaving(true);
    try {
      await storesApi.update(store._id, {
        integrations: {
          ...store.integrations,
          delivery: { provider: 'manual', enabled: false },
        },
      });
      // Reset state local pour refléter la déconnexion sans attendre le refetch
      setProvider('manual');
      setEnabled(false);
      setApiKey('');
      setBaseUrl('');
      setAutoDispatch(true);
      setPickup({});
      await onSaved();
    } finally { setSaving(false); }
  }

  return (
    <Card icon={<Truck className="h-5 w-5" />} title="Société de livraison"
      subtitle="Transporteur last-mile qui prend en charge le colis chez toi et le livre au client.">
      <div className="space-y-5">
        <div>
          <Label>Sociétés de livraison disponibles</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Clique sur « Intégrer » pour choisir ton transporteur, puis configure-le ci-dessous.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CARRIER_PROVIDERS.map((p) => (
              <ProviderCard
                key={p.id}
                name={p.label}
                description={p.description}
                icon={<Truck className="h-5 w-5" />}
                selected={provider === p.id}
                onSelect={() => setProvider(p.id)}
              />
            ))}
          </div>
        </div>

        <ToggleRow checked={enabled} onChange={setEnabled}
          label="Activer l'intégration"
          sublabel="Quand désactivé, les commandes restent en attente de dispatch manuel." />

        <ToggleRow checked={autoDispatch} onChange={setAutoDispatch}
          label="Auto-dispatch des commandes"
          sublabel="Envoie automatiquement chaque commande payée (ou COD) au transporteur." />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Clé API</Label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1.5 h-11 font-mono" />
          </div>
          <div>
            <Label>Base URL (optionnel)</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.transporteur.com" className="mt-1.5 h-11 font-mono text-xs" />
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
          <h4 className="mb-3 text-sm font-semibold">Adresse de pickup</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Nom contact" value={pickup.contactName || ''}
              onChange={(e) => setPickup({ ...pickup, contactName: e.target.value })} />
            <Input placeholder="Téléphone" value={pickup.contactPhone || ''}
              onChange={(e) => setPickup({ ...pickup, contactPhone: e.target.value })} />
            <Input placeholder="Adresse" value={pickup.line1 || ''}
              onChange={(e) => setPickup({ ...pickup, line1: e.target.value })} />
            <Input placeholder="Ville" value={pickup.city || ''}
              onChange={(e) => setPickup({ ...pickup, city: e.target.value })} />
            <Input placeholder="Wilaya / État" value={pickup.state || ''}
              onChange={(e) => setPickup({ ...pickup, state: e.target.value })} />
            <Input placeholder="Code postal" value={pickup.postalCode || ''}
              onChange={(e) => setPickup({ ...pickup, postalCode: e.target.value })} />
            <Input placeholder="Pays (TN, DZ, FR…)" value={pickup.country || ''}
              onChange={(e) => setPickup({ ...pickup, country: e.target.value })}
              className="sm:col-span-2" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </Button>
          {isConnected && (
            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={saving}
              className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Plug className="h-4 w-4" />
              Déconnecter l&apos;intégration
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Logistics (3PL fulfillment company)
// ─────────────────────────────────────────────────────────────────────
function LogisticsPanel({ store, onSaved, saving, setSaving }: PanelProps) {
  const l = store.integrations?.logistics || {};
  const [provider, setProvider] = useState<string>(l.provider || 'manual');
  const [enabled, setEnabled] = useState(!!l.enabled);
  const [apiKey, setApiKey] = useState(l.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(l.baseUrl || '');
  const [warehouseId, setWarehouseId] = useState(l.warehouseId || '');
  const [webhookSecret, setWebhookSecret] = useState(l.webhookSecret || '');
  const [autoForward, setAutoForward] = useState(l.autoForward ?? true);
  const [copied, setCopied] = useState<string | null>(null);

  const isMoga = provider === 'mogadelivery';

  // Une intégration 3PL est considérée "active" dès qu'un provider non-manual
  // est configuré ou qu'une clé API est saisie. Le bouton Déconnecter
  // n'apparaît que dans ce cas (pas d'intérêt sinon).
  const isConnected = (l.provider && l.provider !== 'manual') || !!l.apiKey || !!l.enabled;

  // Detect unsaved changes so we can nudge the user to click "Enregistrer".
  // Without this banner sellers routinely select a provider then leave the
  // page thinking the integration is live (the card visually flips to
  // "Intégré" but that's only local state until they save).
  const dirty =
    provider !== (l.provider || 'manual') ||
    enabled !== !!l.enabled ||
    apiKey !== (l.apiKey || '') ||
    baseUrl !== (l.baseUrl || '') ||
    warehouseId !== (l.warehouseId || '') ||
    webhookSecret !== (l.webhookSecret || '') ||
    autoForward !== (l.autoForward ?? true);

  // Selecting MogaDelivery is the "intent to integrate" — auto-flip the
  // enabled + autoForward toggles so the seller only has to fill the secret
  // and hit Save. They can always toggle off manually if they change their
  // mind. For other providers we don't auto-enable because they need API
  // keys etc. that aren't optional.
  function handleSelectProvider(id: string) {
    setProvider(id);
    if (id === 'mogadelivery') {
      setEnabled(true);
      setAutoForward(true);
    }
  }

  // Auto-generate a 64-hex webhook secret if the seller doesn't have one.
  // They can still paste their own to match what MogaDelivery has on their
  // side — this is just a one-click convenience.
  function generateSecret() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    setWebhookSecret(hex);
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1200);
    } catch {}
  }

  async function handleSave() {
    setSaving(true);
    try {
      await storesApi.update(store._id, {
        integrations: {
          ...store.integrations,
          logistics: {
            provider,
            enabled,
            apiKey: apiKey.trim() || undefined,
            baseUrl: baseUrl.trim() || undefined,
            webhookSecret: webhookSecret.trim() || undefined,
            warehouseId: warehouseId.trim() || undefined,
            autoForward,
          },
        },
      });
      await onSaved();
    } finally { setSaving(false); }
  }

  async function handleDisconnect() {
    const ok = window.confirm(
      `Déconnecter ${l.provider || 'le 3PL'} ?\n\nLa clé API, l'URL, le secret webhook et le warehouse ID seront effacés. Les commandes ne seront plus forwardées au prestataire.`
    );
    if (!ok) return;
    setSaving(true);
    try {
      await storesApi.update(store._id, {
        integrations: {
          ...store.integrations,
          logistics: { provider: 'manual', enabled: false },
        },
      });
      setProvider('manual');
      setEnabled(false);
      setApiKey('');
      setBaseUrl('');
      setWebhookSecret('');
      setWarehouseId('');
      setAutoForward(true);
      await onSaved();
    } finally { setSaving(false); }
  }

  return (
    <Card icon={<Warehouse className="h-5 w-5" />} title="Société de logistique (3PL)"
      subtitle="Externalise le stockage et la préparation des commandes. Le 3PL gère ton entrepôt et choisit le transporteur.">
      <div className="space-y-5">
        <div>
          <Label>Prestataires 3PL disponibles</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Clique sur « Intégrer » pour choisir ton prestataire logistique, puis configure-le ci-dessous.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LOGISTICS_PROVIDERS.map((p) => (
              <ProviderCard
                key={p.id}
                name={p.label}
                description={p.description}
                icon={<Warehouse className="h-5 w-5" />}
                logoUrl={'logoUrl' in p ? p.logoUrl : undefined}
                selected={provider === p.id}
                onSelect={() => handleSelectProvider(p.id)}
              />
            ))}
          </div>
        </div>

        <ToggleRow checked={enabled} onChange={setEnabled}
          label={isMoga ? 'Activer l\'intégration MogaDelivery' : 'Activer le 3PL'}
          sublabel={isMoga
            ? 'Quand activé, chaque commande COD est envoyée automatiquement à MogaDelivery.'
            : 'Les commandes seront forwardées au prestataire qui prépare et expédie.'} />

        <ToggleRow checked={autoForward} onChange={setAutoForward}
          label="Auto-forward des commandes"
          sublabel={isMoga
            ? 'Envoie automatiquement chaque nouvelle commande à MogaDelivery (sinon dispatch manuel depuis la page Commandes).'
            : 'Envoie automatiquement chaque commande payée au 3PL.'} />

        {isMoga ? (
          /* ─── MogaDelivery-specific config ──────────────────────────── */
          <>
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 space-y-4">
              <div className="flex items-start gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-700">
                  <Info className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold">À partager avec MogaDelivery</h4>
                  <p className="text-xs text-muted-foreground">
                    Donne le Store ID ci-dessous + le secret HMAC du champ plus bas. MogaDelivery utilise déjà une URL globale pour nous envoyer les statuts.
                  </p>
                </div>
              </div>

              {/* Store ID */}
              <div>
                <Label className="text-xs">Store ID (à donner à MogaDelivery)</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md border border-border/60 bg-card px-3 py-2 font-mono text-xs">
                    {store._id}
                  </code>
                  <Button type="button" variant="outline" size="sm" onClick={() => copy(store._id, 'storeId')} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" />
                    {copied === 'storeId' ? 'Copié' : 'Copier'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Webhook secret — required */}
            <div>
              <Label className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Clé webhook secret (HMAC-SHA256) *
              </Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="Ex: 9f8c7b6a5d4e3f2a1b0c..."
                  className="h-11 flex-1 font-mono"
                />
                <Button type="button" variant="outline" onClick={generateSecret} className="h-11 gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" />
                  Générer
                </Button>
                {webhookSecret && (
                  <Button type="button" variant="outline" onClick={() => copy(webhookSecret, 'secret')} className="h-11 gap-1.5">
                    <Copy className="h-3.5 w-3.5" />
                    {copied === 'secret' ? 'Copié' : 'Copier'}
                  </Button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Donne <strong>la même clé</strong> à MogaDelivery (ils la collent côté admin chez eux).
                Sert à signer/vérifier les webhooks dans les deux sens. Si vide, on retombe sur <code className="rounded bg-muted px-1">FLEXIOPAGE_WEBHOOK_SECRET</code> du serveur.
              </p>
            </div>

            {/* Optional fields */}
            <details className="rounded-xl border border-border/60 bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                Options avancées (facultatives)
              </summary>
              <div className="space-y-3 border-t border-border/60 p-4">
                <div>
                  <Label className="text-xs">URL endpoint MogaDelivery (override défaut)</Label>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.admin-mogadelivery.com/api/webhooks/flexiopage"
                    className="mt-1.5 h-10 font-mono text-xs"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Laisse vide → utilise <code className="rounded bg-muted px-1">api.admin-mogadelivery.com/api/webhooks/flexiopage</code> (endpoint prod).
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Clé API MogaDelivery (si fournie)</Label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="mt-1.5 h-10 font-mono"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Optionnel — réservé à une future API REST. La signature HMAC suffit pour les webhooks.
                  </p>
                </div>
              </div>
            </details>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800">
              <strong>Important pour le matching produits :</strong> chaque produit doit avoir le <strong>même SKU</strong> côté
              FlexioPage <em>et</em> côté MogaDelivery. Le SKU se configure dans
              {' '}<code className="rounded bg-muted px-1">Produit → Référence produit (SKU & code-barres)</code>.
            </div>
          </>
        ) : (
          /* ─── Generic 3PL config (ShipBob, Cubyn, etc.) ─────────────── */
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Clé API</Label>
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="mt-1.5 h-11 font-mono" />
            </div>
            <div>
              <Label>ID entrepôt / centre</Label>
              <Input value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} placeholder="warehouse_xyz" className="mt-1.5 h-11 font-mono text-xs" />
            </div>
            <div className="sm:col-span-2">
              <Label>Base URL (optionnel)</Label>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.shipbob.com" className="mt-1.5 h-11 font-mono text-xs" />
            </div>
          </div>
        )}

        {/* Sticky save bar — shows clearly when there are unsaved changes.
            Without this, sellers select MogaDelivery, see the card flip to
            "Intégré", then navigate away thinking it's saved. */}
        <div
          className={cn(
            'sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 backdrop-blur',
            dirty
              ? 'border-amber-500/40 bg-amber-500/10 ring-2 ring-amber-500/20'
              : 'border-border/60 bg-card/80'
          )}
        >
          <div className="flex items-center gap-2 text-sm">
            {dirty ? (
              <>
                <AlertCircle className="h-4 w-4 text-amber-700" />
                <span className="font-medium text-amber-800">
                  Changements non enregistrés — clique sur « Enregistrer » pour activer.
                </span>
              </>
            ) : enabled && provider !== 'manual' ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="font-medium text-emerald-700">
                  {isMoga ? 'MogaDelivery actif' : `${provider} actif`}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Aucune intégration active.</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isConnected && (
              <Button
                variant="outline"
                onClick={handleDisconnect}
                disabled={saving}
                className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Plug className="h-4 w-4" />
                Déconnecter
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={saving || !dirty}
              className={cn('gap-2', dirty && 'gradient-brand text-white shadow-lg')}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared atoms
// ─────────────────────────────────────────────────────────────────────
interface PanelProps {
  store: StoreDoc;
  onSaved: () => Promise<void>;
  saving: boolean;
  setSaving: (b: boolean) => void;
}

function Card({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border/60 bg-card p-6 sm:p-8">
      <header className="mb-6 flex items-start gap-4">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white shadow-md">
          {icon}
        </span>
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

/** Tuile logo tolérante : si `logoUrl` est défini, on tente de charger l'image,
 *  et on retombe sur l'icône gradient en cas de 404 (logo absent du repo
 *  public/integrations). Évite l'image cassée affichée dans le navigateur. */
function ProviderLogo({
  logoUrl,
  name,
  fallback,
}: {
  logoUrl?: string;
  name: string;
  fallback: React.ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  if (logoUrl && !broken) {
    return (
      <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-border/60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={name}
          className="h-9 w-9 object-contain"
          onError={() => setBroken(true)}
        />
      </span>
    );
  }
  return (
    <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white shadow-md">
      {fallback}
    </span>
  );
}

/** A pickable provider card — "Disponible" badge + "Intégrer" button.
 * If `logoUrl` is provided, it replaces the default gradient/icon tile. The
 * image is rendered with `object-contain` on a white tile so partner logos
 * keep their own colors and proportions. */
function ProviderCard({
  name,
  description,
  icon,
  logoUrl,
  selected,
  onSelect,
}: {
  name: string;
  description: string;
  icon: React.ReactNode;
  logoUrl?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-card p-4 transition-all duration-300',
        selected
          ? 'border-primary ring-2 ring-primary/15'
          : 'border-border/60 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <ProviderLogo logoUrl={logoUrl} name={name} fallback={icon} />
        {selected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <CheckCircle2 className="h-3 w-3" /> Sélectionné
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Disponible
          </span>
        )}
      </div>
      <h4 className="mt-3 text-sm font-semibold tracking-tight">{name}</h4>
      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{description}</p>
      <Button
        size="sm"
        variant={selected ? 'outline' : 'default'}
        onClick={selected ? undefined : onSelect}
        disabled={selected}
        aria-disabled={selected}
        className={cn(
          'mt-3 w-full gap-1.5',
          selected
            ? 'cursor-default border-emerald-500/40 text-emerald-700 opacity-100 disabled:opacity-100'
            : 'gradient-brand text-white',
        )}
      >
        {selected ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5" /> Intégré
          </>
        ) : (
          <>
            <Plug className="h-3.5 w-3.5" /> Intégrer
          </>
        )}
      </Button>
    </div>
  );
}

function ToggleRow({ checked, onChange, label, sublabel }: { checked: boolean; onChange: (b: boolean) => void; label: string; sublabel?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 hover:bg-muted/30">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {sublabel && <div className="mt-0.5 text-xs text-muted-foreground">{sublabel}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        )}
      >
        <span className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        )} />
      </button>
    </label>
  );
}
