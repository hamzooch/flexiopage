'use client';

/**
 * Real, functional integrations page.
 *
 *   1. Domaine personnalisé — pointer un CNAME / A et vérifier le DNS
 *   2. Pixels marketing — Facebook Pixel, Google Analytics, TikTok Pixel
 *   3. Google Sheets — push automatique de chaque commande
 *   4. Livraison — provider, clé API, adresse de pickup, auto-dispatch
 *
 * Toutes les actions visent la boutique active (currentStoreId) ou la
 * première boutique du compte si rien n'est sélectionné.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { storesApi } from '@/lib/api';
import { useStoreStore } from '@/stores/store-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
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
  FileSpreadsheet,
  Truck,
  RefreshCw,
  ExternalLink,
  Plug,
} from 'lucide-react';

type TabId = 'domain' | 'pixels' | 'sheets' | 'shipping';

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
    delivery?: {
      provider?: 'mogadelivery' | 'yalidine' | 'noest' | 'aramex' | 'manual' | 'other';
      enabled?: boolean;
      apiKey?: string;
      baseUrl?: string;
      autoDispatch?: boolean;
      pickupAddress?: {
        contactName?: string;
        contactPhone?: string;
        line1?: string;
        city?: string;
        state?: string;
        postalCode?: string;
        country?: string;
      };
    };
    googleSheets?: { enabled?: boolean; webhookUrl?: string; lastSyncAt?: string; lastError?: string };
    marketing?: {
      facebookPixelId?: string;
      facebookConversionsApiToken?: string;
      facebookTestEventCode?: string;
      googleAnalyticsId?: string;
      tiktokPixelId?: string;
      googleAdsConversionId?: string;
      googleAdsConversionLabel?: string;
      customHeadCode?: string;
    };
  };
}

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'domain', label: 'Domaine', icon: Globe },
  { id: 'pixels', label: 'Pixels marketing', icon: BarChart3 },
  { id: 'sheets', label: 'Google Sheets', icon: FileSpreadsheet },
  { id: 'shipping', label: 'Livraison', icon: Truck },
];

export default function IntegrationsPage() {
  const { currentStoreId, setCurrentStore } = useStoreStore();
  const [stores, setStores] = useState<StoreDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('domain');
  const [savingTab, setSavingTab] = useState<TabId | null>(null);

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
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full gradient-brand opacity-10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <Plug className="h-3 w-3" />
              Intégrations · {activeStore.name}
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Connecte ta boutique au monde
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Domaine personnalisé, pixels Facebook et Google, export Google Sheets, sociétés de livraison.
            </p>
          </div>
          {stores.length > 1 && (
            <select
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
              value={activeStore._id}
              onChange={(e) => setCurrentStore(e.target.value)}
            >
              {stores.map((s) => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
      </header>

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
                'relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all whitespace-nowrap sm:px-4',
                isActive ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {isActive && <span className="absolute inset-0 -z-10 rounded-xl gradient-brand shadow-md shadow-primary/30" />}
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
      {tab === 'sheets' && (
        <SheetsPanel
          store={activeStore}
          onSaved={refreshStores}
          saving={savingTab === 'sheets'}
          setSaving={(b) => setSavingTab(b ? 'sheets' : null)}
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

  useEffect(() => {
    storesApi.getDomainTarget(store._id).then((r) => setTarget(r.data)).catch(() => {});
  }, [store._id]);

  async function handleSaveDomain() {
    setSaving(true);
    try {
      await storesApi.update(store._id, { customDomain: domain.trim() || null });
      await onSaved();
    } finally { setSaving(false); }
  }

  async function handleVerify() {
    setChecking(true);
    try {
      const res = await storesApi.verifyDomain(store._id);
      setCheck(res.data);
      await onSaved();
    } finally { setChecking(false); }
  }

  const verified = !!store.customDomainVerified;
  const previewUrl = store.customDomain && verified
    ? `https://${store.customDomain}`
    : `http://localhost:3001/store/${store.slug}`;

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
            <p className="mt-2 text-xs text-muted-foreground">
              Chez ton registrar (OVH, GoDaddy, Namecheap…), ajoute :
            </p>
            <div className="mt-3 space-y-2">
              <DnsRow type="CNAME" host={domain} value={target.host || 'stores.boutshop.io'} />
              {target.ips.length > 0 && (
                <DnsRow type="A (apex)" host={domain} value={target.ips.join(', ')} />
              )}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleVerify} disabled={checking} className="gap-1.5">
                {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Vérifier le DNS
              </Button>
              {check && !check.verified && (
                <span className="text-xs text-destructive">
                  {check.reason === 'dns_not_matching'
                    ? `DNS détecté: ${[...(check.cname || []), ...(check.aRecords || [])].join(', ') || '—'}`
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
        <PixelRow
          icon={<Facebook className="h-5 w-5 text-blue-600" />}
          label="Facebook / Meta Pixel ID"
          help="Found in Meta Events Manager. Ex: 1234567890123456"
        >
          <Input value={fb} onChange={(e) => setFb(e.target.value)} placeholder="1234567890123456" className="font-mono" />
        </PixelRow>

        <PixelRow
          icon={<Facebook className="h-5 w-5 text-blue-700" />}
          label="Meta Conversions API token (optionnel)"
          help="Pour le tracking server-side (anti-iOS 14.5). Onglet Conversion API → Generate Access Token."
        >
          <Input value={fbToken} onChange={(e) => setFbToken(e.target.value)} placeholder="EAAG..." className="font-mono" type="password" />
        </PixelRow>

        <PixelRow
          icon={<BarChart3 className="h-5 w-5 text-amber-600" />}
          label="Google Analytics 4 — Measurement ID"
          help="Dans Admin GA4 → Data Streams. Ex: G-XXXXXXXXXX"
        >
          <Input value={ga} onChange={(e) => setGa(e.target.value)} placeholder="G-XXXXXXXXXX" className="font-mono" />
        </PixelRow>

        <PixelRow
          icon={<PlayCircle className="h-5 w-5 text-rose-600" />}
          label="TikTok Pixel ID"
          help="TikTok Ads Manager → Assets → Events. Ex: CXXXXXXXXXXXXXXXX"
        >
          <Input value={tt} onChange={(e) => setTt(e.target.value)} placeholder="CXXXXXXXXXXXXXXXX" className="font-mono" />
        </PixelRow>

        <PixelRow
          icon={<Sparkles className="h-5 w-5 text-emerald-600" />}
          label="Google Ads (optionnel)"
          help="AW-XXXXXXXXXX + label pour le conversion tracking."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={adsId} onChange={(e) => setAdsId(e.target.value)} placeholder="AW-XXXXXXXXXX" className="font-mono" />
            <Input value={adsLbl} onChange={(e) => setAdsLbl(e.target.value)} placeholder="conversion-label" className="font-mono" />
          </div>
        </PixelRow>

        <PixelRow
          icon={<Sparkles className="h-5 w-5 text-fuchsia-600" />}
          label="Code <head> personnalisé"
          help="Pour Hotjar, Clarity, Snap Pixel, etc. Inséré tel quel dans la <head> de tes pages publiques."
        >
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
// GOOGLE SHEETS
// ─────────────────────────────────────────────────────────────────────
const APPS_SCRIPT_SNIPPET = `function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Orders')
                || SpreadsheetApp.getActiveSpreadsheet().insertSheet('Orders');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Date', 'Order #', 'Status', 'Customer', 'Phone', 'Email',
                     'Address', 'City', 'Country', 'Items', 'Total', 'Currency']);
  }
  const o = data.order || {};
  const a = o.shippingAddress || {};
  const items = (o.items || []).map(it => it.quantity + 'x ' + it.name).join(' | ');
  sheet.appendRow([new Date(), o.orderNumber, o.paymentStatus,
                   o.customer && o.customer.name, o.customer && o.customer.phone,
                   o.customer && o.customer.email,
                   [a.line1, a.line2].filter(Boolean).join(', '), a.city, a.country,
                   items, o.total, o.currency]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
         .setMimeType(ContentService.MimeType.JSON);
}`;

function SheetsPanel({ store, onSaved, saving, setSaving }: PanelProps) {
  const gs = store.integrations?.googleSheets || {};
  const [enabled, setEnabled] = useState(!!gs.enabled);
  const [url, setUrl] = useState(gs.webhookUrl || '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    try {
      await storesApi.update(store._id, {
        integrations: {
          ...store.integrations,
          googleSheets: { enabled, webhookUrl: url.trim() || undefined },
        },
      });
      await onSaved();
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await storesApi.testSheets(store._id, url.trim());
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ ok: false, error: (err as Error).message });
    } finally { setTesting(false); }
  }

  return (
    <Card icon={<FileSpreadsheet className="h-5 w-5" />} title="Google Sheets"
      subtitle="Chaque commande est envoyée dans une feuille Google Sheets — pas d'OAuth, juste un webhook Apps Script.">
      <div className="space-y-5">
        <div className="rounded-2xl border border-border/60 bg-card p-5">
          <h4 className="mb-3 text-sm font-semibold">Étapes de configuration</h4>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>1. Ouvre Google Sheets, menu <b>Extensions → Apps Script</b>.</li>
            <li>2. Colle le code ci-dessous, sauvegarde.</li>
            <li>3. Clique <b>Deploy → New deployment</b>, type <b>Web app</b>, accès <b>Anyone</b>.</li>
            <li>4. Copie l'URL <code className="rounded bg-muted px-1 text-xs">/macros/s/.../exec</code> et colle-la ici.</li>
          </ol>
          <div className="relative mt-3">
            <pre className="max-h-64 overflow-auto rounded-lg bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-100 font-mono">
              {APPS_SCRIPT_SNIPPET}
            </pre>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(APPS_SCRIPT_SNIPPET)}
              className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-700"
            >
              <Copy className="h-3 w-3" /> Copier
            </button>
          </div>
        </div>

        <ToggleRow checked={enabled} onChange={setEnabled}
          label="Activer le push vers Google Sheets"
          sublabel="Désactivable à tout moment. Aucune commande envoyée si désactivé." />

        <div>
          <Label htmlFor="sheets-url">URL Apps Script</Label>
          <Input
            id="sheets-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/AKfycb.../exec"
            className="mt-1.5 h-11 font-mono text-xs"
          />
        </div>

        {gs.lastSyncAt && (
          <p className="text-xs text-muted-foreground">
            Dernier envoi réussi : <span className="font-medium text-foreground">{new Date(gs.lastSyncAt).toLocaleString()}</span>
          </p>
        )}
        {gs.lastError && (
          <p className="text-xs text-destructive">
            Dernière erreur : <span className="font-mono">{gs.lastError}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </Button>
          <Button variant="outline" onClick={handleTest} disabled={testing || !url.trim()} className="gap-2">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Tester la connexion
          </Button>
          {testResult && (
            <span className={cn(
              'text-xs font-medium',
              testResult.ok ? 'text-emerald-600' : 'text-destructive'
            )}>
              {testResult.ok ? '✓ Webhook accessible' : '✗ ' + (testResult.error || 'Erreur')}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SHIPPING
// ─────────────────────────────────────────────────────────────────────
const DELIVERY_PROVIDERS = [
  { id: 'mogadelivery', label: 'Moga Delivery (Afrique)' },
  { id: 'yalidine', label: 'Yalidine (Algérie)' },
  { id: 'noest', label: 'Noest Express (Algérie)' },
  { id: 'aramex', label: 'Aramex (MENA)' },
  { id: 'manual', label: 'Manuel (sans API)' },
  { id: 'other', label: 'Autre' },
] as const;

function ShippingPanel({ store, onSaved, saving, setSaving }: PanelProps) {
  const d = store.integrations?.delivery || {};
  const [provider, setProvider] = useState<string>(d.provider || 'manual');
  const [enabled, setEnabled] = useState(!!d.enabled);
  const [apiKey, setApiKey] = useState(d.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(d.baseUrl || '');
  const [autoDispatch, setAutoDispatch] = useState(d.autoDispatch ?? true);
  const [pickup, setPickup] = useState(d.pickupAddress || {});

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

  return (
    <Card icon={<Truck className="h-5 w-5" />} title="Livraison & expédition"
      subtitle="Connecte ton transporteur. Chaque commande est dispatchée automatiquement quand auto-dispatch est activé.">
      <div className="space-y-5">
        <div>
          <Label>Transporteur</Label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
          >
            {DELIVERY_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
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

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </Button>
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
