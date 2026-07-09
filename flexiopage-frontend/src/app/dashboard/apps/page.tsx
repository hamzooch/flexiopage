'use client';

/**
 * Applications page — third-party apps connected to the merchant account.
 *
 * Today: Google Sheets (functional). Tomorrow: Mailchimp, Slack, Zapier, etc.
 * Layout: featured grid of installable apps + the active app config panel.
 *
 * Apps differ from Integrations (which configure store-level things like
 * the custom domain, marketing pixels, shipping) — apps are workflow tools
 * the seller plugs in on top of their store.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { storesApi, messengerBotApi, whatsappBotApi } from '@/lib/api';
import { useStoreStore } from '@/stores/store-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/page-header';
import {
  AppWindow,
  FileSpreadsheet,
  Mail,
  Bell,
  Zap,
  MessageSquare,
  Loader2,
  Save,
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
  ArrowLeft,
  Plug,
  Bot,
  ShoppingBag,
  Plus,
  Trash2,
} from 'lucide-react';

interface SalesPopupSettings {
  enabled?: boolean;
  mode?: 'real' | 'fake' | 'hybrid';
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  initialDelaySeconds?: number;
  intervalSeconds?: number;
  accentColor?: string;
  fakeEvents?: Array<{ name: string; city?: string; product: string; minutesAgo?: number }>;
}

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  integrations?: {
    googleSheets?: { enabled?: boolean; webhookUrl?: string; lastSyncAt?: string; lastError?: string };
  };
  settings?: {
    salesPopup?: SalesPopupSettings;
  };
}

type AppId = 'google-sheets' | 'mailchimp' | 'slack' | 'zapier' | 'discord' | 'messenger-bot' | 'whatsapp-bot' | 'sales-popup';

interface AppDef {
  id: AppId;
  name: string;
  description: string;
  category: 'Productivity' | 'Marketing' | 'Notifications' | 'Automation';
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  available: boolean;
}

const APPS: AppDef[] = [
  {
    id: 'messenger-bot',
    name: 'Messenger Bot',
    description: 'Chatbot IA qui répond en darija/français et crée les commandes COD depuis ta page Facebook.',
    category: 'Automation',
    icon: Bot,
    accent: 'from-blue-500 to-indigo-600',
    available: true,
  },
  {
    id: 'whatsapp-bot',
    name: 'WhatsApp Bot',
    description: 'Même assistant IA, sur WhatsApp : répond aux clients et crée les commandes COD automatiquement.',
    category: 'Automation',
    icon: MessageSquare,
    accent: 'from-green-500 to-emerald-600',
    available: true,
  },
  {
    id: 'sales-popup',
    name: 'Sales Popup',
    description: 'Preuve sociale : petite notif qui affiche les achats récents à chaque visiteur de ta boutique.',
    category: 'Marketing',
    icon: ShoppingBag,
    accent: 'from-pink-500 to-rose-600',
    available: true,
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    description: 'Pousse chaque commande vers une feuille de calcul Google.',
    category: 'Productivity',
    icon: FileSpreadsheet,
    accent: 'from-emerald-500 to-green-600',
    available: true,
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    description: 'Synchronise tes clients vers ta liste d\'emails.',
    category: 'Marketing',
    icon: Mail,
    accent: 'from-amber-500 to-orange-600',
    available: false,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Reçois une notif Slack à chaque nouvelle commande.',
    category: 'Notifications',
    icon: MessageSquare,
    accent: 'from-violet-500 to-purple-600',
    available: false,
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Notifications dans ton serveur Discord.',
    category: 'Notifications',
    icon: Bell,
    accent: 'from-indigo-500 to-blue-600',
    available: false,
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Connecte ta boutique à 5 000+ apps via webhook.',
    category: 'Automation',
    icon: Zap,
    accent: 'from-orange-500 to-red-600',
    available: false,
  },
];

export default function AppsPage() {
  const router = useRouter();
  const { currentStoreId, setCurrentStore } = useStoreStore();
  const [stores, setStores] = useState<StoreDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [openApp, setOpenApp] = useState<AppId | null>(null);
  /**
   * Statut de connexion des apps qui vivent en dehors du modèle Store (les
   * bots dépendent de leur propre BotConfig). On fetch en arrière-plan une
   * fois la boutique active connue → la fonction `connected(id)` ci-dessous
   * matche les bons indicateurs sans cas particulier dans le rendu.
   */
  const [botStatus, setBotStatus] = useState<{ messengerBot: boolean; whatsappBot: boolean }>({
    messengerBot: false,
    whatsappBot: false,
  });

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

  // Statut bot Messenger / WhatsApp par boutique active. Best-effort —
  // si l'appel échoue on garde l'état précédent (pas bloquant pour la page).
  useEffect(() => {
    if (!activeStore?._id) return;
    const sid = activeStore._id;
    void (async () => {
      const [mb, wb] = await Promise.all([
        messengerBotApi.getConfig(sid).catch(() => null),
        whatsappBotApi.getConfig(sid).catch(() => null),
      ]);
      setBotStatus({
        messengerBot: !!mb?.data.connected,
        whatsappBot: !!wb?.data.connected,
      });
    })();
  }, [activeStore?._id]);

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
          Crée d'abord une boutique pour connecter des applications.
        </p>
      </div>
    );
  }

  if (openApp) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setOpenApp(null)} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Toutes les applications
        </Button>
        {openApp === 'google-sheets' && (
          <GoogleSheetsApp store={activeStore} onSaved={refreshStores} />
        )}
        {openApp === 'sales-popup' && (
          <SalesPopupApp store={activeStore} onSaved={refreshStores} />
        )}
        {openApp !== 'google-sheets' && openApp !== 'sales-popup' && (
          <ComingSoonApp app={APPS.find((a) => a.id === openApp)!} />
        )}
      </div>
    );
  }

  const connected = (id: AppId): boolean => {
    switch (id) {
      case 'google-sheets':
        return !!(activeStore.integrations?.googleSheets?.enabled && activeStore.integrations.googleSheets.webhookUrl);
      case 'messenger-bot':
        return botStatus.messengerBot;
      case 'whatsapp-bot':
        return botStatus.whatsappBot;
      case 'sales-popup':
        return !!activeStore.settings?.salesPopup?.enabled;
      default:
        return false;
    }
  };

  const installedApps = APPS.filter((a) => connected(a.id));

  const openAppHandler = (id: AppId) => {
    if (id === 'messenger-bot') router.push(`/dashboard/apps/messenger-bot?storeId=${activeStore._id}`);
    else if (id === 'whatsapp-bot') router.push(`/dashboard/apps/whatsapp-bot?storeId=${activeStore._id}`);
    else setOpenApp(id);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        icon={AppWindow}
        title={`Applications · ${activeStore.name}`}
        description="Connecte tes outils : Google Sheets, email, notifications, automatisations."
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

      {/* Mes apps installées — accès rapide en haut de page. Seulement
          visible si au moins une app est connectée pour cette boutique. */}
      {installedApps.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold">Mes applications installées</h2>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              {installedApps.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {installedApps.map((app) => (
              <InstalledAppShortcut key={app.id} app={app} onOpen={() => openAppHandler(app.id)} />
            ))}
          </div>
        </section>
      )}

      {/* App grid */}
      <section>
        {installedApps.length > 0 && (
          <h2 className="mb-3 text-sm font-semibold">Toutes les applications</h2>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {APPS.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              connected={connected(app.id)}
              onOpen={() => openAppHandler(app.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Installed app shortcut — carte compacte pour la section "Mes apps installées"
// ─────────────────────────────────────────────────────────────────────
function InstalledAppShortcut({ app, onOpen }: { app: AppDef; onOpen: () => void }) {
  const Icon = app.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-transform group-hover:scale-110',
        app.accent,
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{app.name}</span>
          <Check className="h-3 w-3 shrink-0 text-emerald-600" strokeWidth={3} />
        </div>
        <div className="text-[10px] text-muted-foreground">Gérer →</div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// App card
// ─────────────────────────────────────────────────────────────────────
function AppCard({ app, connected, onOpen }: { app: AppDef; connected: boolean; onOpen: () => void }) {
  const Icon = app.icon;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl">
      <div
        className={cn(
          'pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-15 blur-2xl transition-opacity duration-300 group-hover:opacity-30',
          app.accent
        )}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div
          className={cn(
            'grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-md transition-transform duration-300 group-hover:scale-110',
            app.accent
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <Check className="h-3 w-3" strokeWidth={3} />
            Connectée
          </span>
        ) : app.available ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            Disponible
          </span>
        ) : (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            Bientôt
          </span>
        )}
      </div>

      <div className="relative mt-4">
        <h3 className="text-base font-semibold tracking-tight">{app.name}</h3>
        <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {app.category}
        </p>
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{app.description}</p>
      </div>

      <div className="relative mt-5">
        {connected ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1.5"
            onClick={onOpen}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            Gérer l&apos;intégration
          </Button>
        ) : app.available ? (
          <Button
            size="sm"
            className="w-full gap-1.5 gradient-brand text-white"
            onClick={onOpen}
          >
            <Plug className="h-3.5 w-3.5" />
            Intégrer
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1.5"
            disabled
          >
            <Plug className="h-3.5 w-3.5" />
            Bientôt disponible
          </Button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// GOOGLE SHEETS APP
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

function GoogleSheetsApp({ store, onSaved }: { store: StoreDoc; onSaved: () => Promise<void> }) {
  const gs = store.integrations?.googleSheets || {};
  const [enabled, setEnabled] = useState(!!gs.enabled);
  const [url, setUrl] = useState(gs.webhookUrl || '');
  const [saving, setSaving] = useState(false);
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
    <div className="space-y-6">
      <header className="rounded-3xl border border-border/60 bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Google Sheets</h1>
            <p className="text-sm text-muted-foreground">
              Chaque commande est ajoutée comme une ligne dans ta feuille Google Sheets — sans OAuth.
            </p>
          </div>
        </div>
      </header>

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

      <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-5">
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 hover:bg-muted/30">
          <div>
            <div className="text-sm font-medium">Activer le push vers Google Sheets</div>
            <div className="text-xs text-muted-foreground">Désactivable à tout moment.</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors',
              enabled ? 'bg-primary' : 'bg-muted-foreground/30'
            )}
          >
            <span className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform',
              enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
            )} />
          </button>
        </label>

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
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SALES POPUP APP
// ─────────────────────────────────────────────────────────────────────
function SalesPopupApp({ store, onSaved }: { store: StoreDoc; onSaved: () => Promise<void> }) {
  const sp = store.settings?.salesPopup || {};
  const [enabled, setEnabled] = useState(!!sp.enabled);
  const [mode, setMode] = useState<SalesPopupSettings['mode']>(sp.mode || 'hybrid');
  const [position, setPosition] = useState<SalesPopupSettings['position']>(sp.position || 'bottom-left');
  const [initialDelay, setInitialDelay] = useState<number>(sp.initialDelaySeconds ?? 10);
  const [interval, setIntervalVal] = useState<number>(sp.intervalSeconds ?? 25);
  const [accentColor, setAccentColor] = useState<string>(sp.accentColor || '#e11d48');
  const [fakeEvents, setFakeEvents] = useState(sp.fakeEvents || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateEvent = (idx: number, patch: Partial<{ name: string; city: string; product: string; minutesAgo: number }>) => {
    setFakeEvents((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };

  const addEvent = () => {
    setFakeEvents((prev) => [...prev, { name: '', city: '', product: '', minutesAgo: undefined }]);
  };

  const removeEvent = (idx: number) => {
    setFakeEvents((prev) => prev.filter((_, i) => i !== idx));
  };

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      // Trim empty rows so we don't persist blank templates.
      const cleaned = fakeEvents
        .map((e) => ({
          name: (e.name || '').trim(),
          city: (e.city || '').trim() || undefined,
          product: (e.product || '').trim(),
          minutesAgo: e.minutesAgo && e.minutesAgo > 0 ? Math.floor(e.minutesAgo) : undefined,
        }))
        .filter((e) => e.name && e.product);

      await storesApi.update(store._id, {
        settings: {
          ...(store.settings || {}),
          salesPopup: {
            enabled,
            mode,
            position,
            initialDelaySeconds: Math.max(0, initialDelay),
            intervalSeconds: Math.max(5, interval),
            accentColor: accentColor.trim() || undefined,
            fakeEvents: cleaned,
          },
        },
      });
      await onSaved();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-border/60 bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-md">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">Sales Popup</h1>
            <p className="text-sm text-muted-foreground">
              Affiche une petite notif « <b>Ahmed de Casablanca vient d&apos;acheter …</b> » à chaque visiteur.
              Les vraies commandes sont anonymisées côté serveur ; tu peux aussi saisir des exemples pour les premiers jours.
            </p>
          </div>
        </div>
      </header>

      <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-5">
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 hover:bg-muted/30">
          <div>
            <div className="text-sm font-medium">Activer les popups d&apos;achats</div>
            <div className="text-xs text-muted-foreground">Désactivable à tout moment.</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors',
              enabled ? 'bg-primary' : 'bg-muted-foreground/30'
            )}
          >
            <span className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform',
              enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
            )} />
          </button>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Source des notifications</Label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as SalesPopupSettings['mode'])}
              className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="hybrid">Auto (vraies commandes, sinon exemples)</option>
              <option value="real">Vraies commandes uniquement</option>
              <option value="fake">Exemples uniquement</option>
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Les vraies commandes sont anonymisées : prénom + ville seulement.
            </p>
          </div>
          <div>
            <Label>Position à l&apos;écran</Label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as SalesPopupSettings['position'])}
              className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="bottom-left">Bas gauche</option>
              <option value="bottom-right">Bas droite</option>
              <option value="top-left">Haut gauche</option>
              <option value="top-right">Haut droite</option>
            </select>
          </div>
          <div>
            <Label htmlFor="sp-initial">Délai avant la 1ère popup (secondes)</Label>
            <Input
              id="sp-initial"
              type="number"
              min={0}
              value={initialDelay}
              onChange={(e) => setInitialDelay(parseInt(e.target.value, 10) || 0)}
              className="mt-1.5 h-11"
            />
          </div>
          <div>
            <Label htmlFor="sp-interval">Intervalle entre 2 popups (secondes)</Label>
            <Input
              id="sp-interval"
              type="number"
              min={5}
              value={interval}
              onChange={(e) => setIntervalVal(parseInt(e.target.value, 10) || 5)}
              className="mt-1.5 h-11"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="sp-color">Couleur d&apos;accent</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="sp-color"
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-11 w-14 cursor-pointer rounded-md border border-input bg-background p-1"
              />
              <Input
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#e11d48"
                className="h-11 flex-1 font-mono text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Fake events editor — only useful when mode is 'fake' or 'hybrid' */}
      {mode !== 'real' && (
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">Exemples de commandes</h4>
              <p className="text-xs text-muted-foreground">
                Utilisés {mode === 'fake' ? 'exclusivement' : 'en complément quand la boutique a peu de commandes'}.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={addEvent} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
          {fakeEvents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
              Aucun exemple pour l&apos;instant. Clique « Ajouter » pour créer ton premier.
            </p>
          ) : (
            <div className="space-y-3">
              {fakeEvents.map((ev, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-border/60 bg-background p-3 sm:grid-cols-[1fr_1fr_1.2fr_100px_auto]">
                  <Input
                    placeholder="Prénom (Ahmed)"
                    value={ev.name}
                    onChange={(e) => updateEvent(i, { name: e.target.value })}
                    className="h-10 text-xs"
                  />
                  <Input
                    placeholder="Ville (Casablanca)"
                    value={ev.city || ''}
                    onChange={(e) => updateEvent(i, { city: e.target.value })}
                    className="h-10 text-xs"
                  />
                  <Input
                    placeholder="Produit acheté"
                    value={ev.product}
                    onChange={(e) => updateEvent(i, { product: e.target.value })}
                    className="h-10 text-xs"
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="min"
                    value={ev.minutesAgo ?? ''}
                    onChange={(e) => updateEvent(i, { minutesAgo: parseInt(e.target.value, 10) || 0 })}
                    className="h-10 text-xs"
                    title="Minutes écoulées depuis l'achat (optionnel)"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEvent(i)}
                    className="h-10 w-10 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </Button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            Réglages sauvegardés
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Coming soon placeholder
// ─────────────────────────────────────────────────────────────────────
function ComingSoonApp({ app }: { app: AppDef }) {
  const Icon = app.icon;
  return (
    <div className="rounded-3xl border border-border/60 bg-card p-8 text-center">
      <div className={cn('mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br text-white shadow-xl', app.accent)}>
        <Icon className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-2xl font-bold tracking-tight">{app.name}</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto">{app.description}</p>
      <div className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700">
        Bientôt disponible
      </div>
    </div>
  );
}
