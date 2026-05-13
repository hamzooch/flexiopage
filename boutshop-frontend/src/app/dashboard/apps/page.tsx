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
import { storesApi } from '@/lib/api';
import { useStoreStore } from '@/stores/store-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
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
} from 'lucide-react';

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  integrations?: {
    googleSheets?: { enabled?: boolean; webhookUrl?: string; lastSyncAt?: string; lastError?: string };
  };
}

type AppId = 'google-sheets' | 'mailchimp' | 'slack' | 'zapier' | 'discord';

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
  const { currentStoreId, setCurrentStore } = useStoreStore();
  const [stores, setStores] = useState<StoreDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [openApp, setOpenApp] = useState<AppId | null>(null);

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
        {openApp !== 'google-sheets' && (
          <ComingSoonApp app={APPS.find((a) => a.id === openApp)!} />
        )}
      </div>
    );
  }

  const connected = (id: AppId): boolean => {
    if (id === 'google-sheets') {
      return !!(activeStore.integrations?.googleSheets?.enabled && activeStore.integrations.googleSheets.webhookUrl);
    }
    return false;
  };

  return (
    <div className="space-y-8">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full gradient-brand opacity-10 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <AppWindow className="h-3 w-3" />
              Marketplace · {activeStore.name}
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Applications
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Connecte tes outils du quotidien à ta boutique : Google Sheets, email, notifications, automatisations.
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

      {/* App grid */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {APPS.map((app) => (
          <AppCard
            key={app.id}
            app={app}
            connected={connected(app.id)}
            onOpen={() => setOpenApp(app.id)}
          />
        ))}
      </section>
    </div>
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
        <Button
          size="sm"
          variant={connected ? 'outline' : 'default'}
          className={cn('w-full', !connected && 'gradient-brand text-white')}
          onClick={onOpen}
        >
          {connected ? 'Configurer' : app.available ? 'Connecter' : 'En savoir plus'}
        </Button>
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
