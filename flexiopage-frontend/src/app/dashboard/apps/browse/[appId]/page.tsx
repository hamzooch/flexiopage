'use client';

/**
 * Fiche d'une application — accessible via /dashboard/apps/browse/[appId].
 *
 * Rôle : afficher un pitch complet AVANT d'installer, à la manière d'un
 * App Store. Le vendeur clique sur une carte → arrive ici → lit description,
 * features, prérequis → clique « Installer » → arrive sur l'écran de config
 * réel de l'app (route donnée par APP_DETAILS[id].configPath).
 *
 * État connecté : quand l'app est DÉJÀ installée sur la boutique active, le
 * CTA passe de « Installer » à « Gérer l'application » et un badge vert
 * l'indique. Pas de désinstallation dans ce MVP — le vendeur désactive
 * depuis l'écran de config de chaque app.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { storesApi, messengerBotApi, whatsappBotApi } from '@/lib/api';
import { useStoreStore } from '@/stores/store-store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { APPS, APP_DETAILS, type AppId } from '@/lib/apps-catalog';
import {
  ArrowLeft,
  Check,
  Loader2,
  Plug,
  Sparkles,
  Info,
  Clock,
  ListChecks,
} from 'lucide-react';

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
  integrations?: {
    googleSheets?: { enabled?: boolean; webhookUrl?: string };
  };
  settings?: {
    salesPopup?: { enabled?: boolean };
    clientNotifications?: { enabled?: boolean };
    botstore?: { enabled?: boolean };
  };
}

/** Si l'id d'URL n'existe pas dans le catalogue, on rend un fallback discret plutôt que 404. */
function isKnownAppId(id: string): id is AppId {
  return APPS.some((a) => a.id === id);
}

export default function AppBrowsePage() {
  const params = useParams<{ appId: string }>();
  const router = useRouter();
  const rawAppId = params.appId;
  const app = isKnownAppId(rawAppId) ? APPS.find((a) => a.id === rawAppId)! : null;
  const detail = app ? APP_DETAILS[app.id] : null;

  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const setCurrentStore = useStoreStore((s) => s.setCurrentStore);

  const [stores, setStores] = useState<StoreDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [botStatus, setBotStatus] = useState<{ messengerBot: boolean; whatsappBot: boolean }>({
    messengerBot: false,
    whatsappBot: false,
  });

  const activeStore = useMemo(
    () => stores.find((s) => s._id === currentStoreId) || stores[0] || null,
    [stores, currentStoreId],
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

  useEffect(() => {
    void refreshStores();
  }, [refreshStores]);

  // Statut bot Messenger / WhatsApp — best-effort, non bloquant (les 2 bots
  // vivent hors modèle Store, il faut donc un appel séparé pour savoir s'ils
  // sont connectés). Symétrique au comportement de /dashboard/apps.
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

  const connected = useMemo((): boolean => {
    if (!app || !activeStore) return false;
    switch (app.id) {
      case 'google-sheets':
        return !!(activeStore.integrations?.googleSheets?.enabled && activeStore.integrations.googleSheets.webhookUrl);
      case 'messenger-bot':
        return botStatus.messengerBot;
      case 'whatsapp-bot':
        return botStatus.whatsappBot;
      case 'sales-popup':
        return !!activeStore.settings?.salesPopup?.enabled;
      case 'whatsapp-notifications':
        return !!activeStore.settings?.clientNotifications?.enabled;
      case 'botstore':
        return !!activeStore.settings?.botstore?.enabled;
      default:
        return false;
    }
  }, [app, activeStore, botStatus]);

  // ── Rendus dégradés (app inconnue / boutique manquante) ─────────────
  if (!app || !detail) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/apps">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Applications
          </Button>
        </Link>
        <div className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Cette application n'existe pas ou plus. Retour à la liste.
          </p>
        </div>
      </div>
    );
  }

  const Icon = app.icon;
  const canInstall = app.available && !!detail.configPath;
  const installLabel = detail.installLabel || (connected ? "Gérer l'application" : "Installer l'application");

  const handleInstall = () => {
    if (!activeStore || !detail.configPath) return;
    router.push(detail.configPath(activeStore._id));
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link + store switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard/apps">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Toutes les applications
          </Button>
        </Link>
        {stores.length > 1 && activeStore && (
          <select
            className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            value={activeStore._id}
            onChange={(e) => setCurrentStore(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Hero — visuel + méta + CTA */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 sm:p-8">
        <div
          className={cn(
            'pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br opacity-20 blur-3xl',
            app.accent,
          )}
          aria-hidden
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
          <div
            className={cn(
              'grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg sm:h-20 sm:w-20',
              app.accent,
            )}
          >
            <Icon className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{app.name}</h1>
              {connected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                  <Check className="h-3 w-3" strokeWidth={3} />
                  Installée
                </span>
              )}
              {!app.available && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                  <Clock className="h-3 w-3" />
                  Bientôt disponible
                </span>
              )}
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {app.category}
            </p>
            <p className="text-sm text-muted-foreground sm:text-base">{app.description}</p>
            {/* CTA principal — Installer / Gérer / Bientôt */}
            <div className="pt-2">
              {canInstall ? (
                <Button
                  onClick={handleInstall}
                  disabled={!activeStore}
                  size="lg"
                  className={cn(
                    'gap-2',
                    connected ? 'border-emerald-500/30 bg-emerald-500 text-white hover:bg-emerald-600' : 'gradient-brand text-white',
                  )}
                >
                  {connected ? <Check className="h-4 w-4" strokeWidth={3} /> : <Plug className="h-4 w-4" />}
                  {installLabel}
                </Button>
              ) : (
                <Button size="lg" variant="outline" disabled className="gap-2">
                  <Clock className="h-4 w-4" />
                  Bientôt disponible
                </Button>
              )}
              {!activeStore && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Sélectionne une boutique pour installer cette application.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Corps — description longue + features + how-it-works + prérequis */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                À propos
              </h2>
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed">{detail.longDescription}</p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Fonctionnalités
              </h2>
            </div>
            <ul className="space-y-2">
              {detail.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    className={cn(
                      'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white',
                      app.accent,
                    )}
                  >
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  <span className="leading-snug">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {detail.howItWorks && detail.howItWorks.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Comment ça marche
              </h2>
              <ol className="space-y-3">
                {detail.howItWorks.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span
                      className={cn(
                        'grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white',
                        app.accent,
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="leading-snug">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Détails
            </h3>
            <dl className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Catégorie</dt>
                <dd className="font-medium">{app.category}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Disponibilité</dt>
                <dd className="font-medium">{app.available ? 'Disponible' : 'Bientôt'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Statut</dt>
                <dd className="font-medium">
                  {connected ? (
                    <span className="text-emerald-600">Installée</span>
                  ) : (
                    <span className="text-muted-foreground">Non installée</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {detail.prerequisites && detail.prerequisites.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
              <div className="mb-2 flex items-center gap-2">
                <Info className="h-4 w-4 text-amber-600" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-900">
                  Prérequis
                </h3>
              </div>
              <ul className="space-y-1.5 text-xs text-amber-900">
                {detail.prerequisites.map((p, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-600" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canInstall && (
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-5 text-center">
              <p className="mb-3 text-xs text-muted-foreground">
                {connected
                  ? "Cette application est déjà installée. Ouvre-la pour ajuster ses réglages."
                  : "Installation gratuite et réversible à tout moment."}
              </p>
              <Button
                onClick={handleInstall}
                disabled={!activeStore}
                className={cn(
                  'w-full gap-1.5',
                  connected ? 'border-emerald-500/30 bg-emerald-500 text-white hover:bg-emerald-600' : 'gradient-brand text-white',
                )}
              >
                {connected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Plug className="h-3.5 w-3.5" />}
                {installLabel}
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
