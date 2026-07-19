'use client';

/**
 * App "Notifications Client WhatsApp" — envoi automatique d'un WhatsApp
 * au client à chaque étape clé de sa commande (création, confirmation,
 * dispatch). Opt-in par trigger, réutilise la session WasenderAPI du
 * chatbot vendeur (pas de reconnexion QR).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi, whatsappBotApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Bell, Loader2, Save, Check, MessageSquare, ShoppingCart, PhoneCall, Truck, AlertTriangle,
} from 'lucide-react';

type TriggerId = 'orderCreated' | 'confirmed' | 'dispatched';

interface TriggerCfg {
  enabled?: boolean;
  template?: string;
}

interface Config {
  enabled?: boolean;
  orderCreated?: TriggerCfg;
  confirmed?: TriggerCfg;
  dispatched?: TriggerCfg;
}

// Templates par défaut alignés sur le backend (`DEFAULT_TEMPLATES`).
const DEFAULT_TEMPLATES: Record<TriggerId, string> = {
  orderCreated:
    "Bonjour {{customerName}} 👋\nMerci pour ta commande sur {{storeName}} !\nNuméro de commande : {{orderNumber}}\nTotal : {{total}} {{currency}}\n\nOn te confirme sous 24h par téléphone 📞",
  confirmed:
    "Bonjour {{customerName}} ✅\nTa commande {{orderNumber}} est confirmée !\nLivraison en 24-72h. On te tient au courant dès qu'elle part 📦",
  dispatched:
    "Bonjour {{customerName}} 🚚\nTon colis {{orderNumber}} part chez le coursier !\nIl te contactera au téléphone pour livrer.\nPrépare {{total}} {{currency}} (paiement à la livraison).",
};

const TRIGGERS: Array<{ id: TriggerId; label: string; hint: string; icon: typeof Bell; color: string }> = [
  { id: 'orderCreated', label: 'Commande créée', hint: 'Envoyé dès que le client valide sa commande.', icon: ShoppingCart, color: 'from-sky-500 to-blue-600' },
  { id: 'confirmed',    label: 'Commande confirmée', hint: "Envoyé quand l'agent confirme au téléphone.", icon: PhoneCall, color: 'from-emerald-500 to-teal-600' },
  { id: 'dispatched',   label: 'Colis dispatché', hint: 'Envoyé quand le coursier a récupéré la commande.', icon: Truck, color: 'from-fuchsia-500 to-pink-600' },
];

export default function WhatsappNotificationsPage() {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get('storeId');
  const { storeId } = useScopedStoreId(storeIdParam);

  const [config, setConfig] = useState<Config>({});
  const [wasenderConnected, setWasenderConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const [storeRes, botRes] = await Promise.all([
        storesApi.get(storeId),
        // On regarde si le WhatsApp bot est connecté — obligatoire car la
        // notif réutilise sa session WasenderAPI. On dégrade gracieusement
        // si l'endpoint échoue (message d'avertissement seulement).
        whatsappBotApi.getConfig(storeId).catch(() => null),
      ]);
      const store = (storeRes.data as { store: { settings?: { clientNotifications?: Config } } }).store;
      setConfig(store.settings?.clientNotifications || {});
      const botCfg = botRes ? (botRes.data as { config?: { whatsapp_provider?: string; status?: string; wasender_session_token_encrypted?: string } | null }).config : null;
      setWasenderConnected(!!(botCfg && botCfg.whatsapp_provider === 'wasender' && botCfg.wasender_session_token_encrypted));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!storeId) return;
    setSaving(true);
    setError(null);
    try {
      // On PATCH l'objet complet settings.clientNotifications — le backend
      // merge intelligemment via updateStore.
      const store = (await storesApi.get(storeId)).data as { store: { settings?: Record<string, unknown> } };
      const nextSettings = {
        ...(store.store.settings || {}),
        clientNotifications: config,
      };
      await storesApi.update(storeId, { settings: nextSettings });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2200);
    } catch (err) {
      const ax = err as { response?: { data?: { error?: string; message?: string } } };
      setError(ax.response?.data?.error || ax.response?.data?.message || 'Enregistrement échoué');
    } finally {
      setSaving(false);
    }
  }

  function patchTrigger(id: TriggerId, next: Partial<TriggerCfg>) {
    setConfig((c) => ({ ...c, [id]: { ...(c[id] || {}), ...next } }));
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/apps">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Applications
            </Button>
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Bell className="h-6 w-6 text-emerald-600" />
              Notifications Client WhatsApp
            </h1>
            <p className="text-sm text-muted-foreground">
              Envoie un WhatsApp automatique au client à chaque étape de sa commande.
            </p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gap-1.5 gradient-brand text-white"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFlash ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? 'Enregistrement…' : savedFlash ? 'Enregistré' : 'Enregistrer'}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Prérequis Wasender */}
      {wasenderConnected === false && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900">Bot WhatsApp non connecté</div>
              <p className="mt-1 text-sm text-amber-800">
                Cette app utilise la session WasenderAPI de ton chatbot WhatsApp vendeur.
                Connecte d'abord ton WhatsApp Bot pour activer les notifications client.
              </p>
              <Link href={`/dashboard/apps/whatsapp-bot?storeId=${storeId}`} className="mt-2 inline-block">
                <Button size="sm" variant="outline" className="mt-2 gap-1.5 border-amber-500/40 text-amber-800 hover:bg-amber-500/10">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Configurer le WhatsApp Bot
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Master switch */}
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <label className="flex flex-1 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={!!config.enabled}
              onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
              className="h-5 w-5 rounded border-input"
            />
            <div>
              <div className="text-sm font-semibold">Activer les notifications</div>
              <p className="text-[11px] text-muted-foreground">
                Master switch — désactive tout d'un coup sans perdre la config des triggers individuels.
              </p>
            </div>
          </label>
          {config.enabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Actif
            </span>
          )}
        </CardContent>
      </Card>

      {/* Placeholders help */}
      <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-[11px]">
        <div className="mb-1 font-semibold">Variables dispo dans les templates</div>
        <div className="flex flex-wrap gap-1.5">
          {['{{customerName}}', '{{orderNumber}}', '{{storeName}}', '{{total}}', '{{currency}}', '{{trackingUrl}}'].map((v) => (
            <code key={v} className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-primary">{v}</code>
          ))}
        </div>
      </div>

      {/* 3 triggers */}
      {TRIGGERS.map((t) => {
        const cfg = config[t.id] || {};
        const Icon = t.icon;
        return (
          <Card key={t.id} className={cn(!config.enabled && 'opacity-60')}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm', t.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm sm:text-base">{t.label}</CardTitle>
                    <CardDescription className="text-[11px]">{t.hint}</CardDescription>
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!cfg.enabled}
                    onChange={(e) => patchTrigger(t.id, { enabled: e.target.checked })}
                    disabled={!config.enabled}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="text-xs font-medium">
                    {cfg.enabled ? 'Activé' : 'Désactivé'}
                  </span>
                </label>
              </div>
            </CardHeader>
            {cfg.enabled && (
              <CardContent className="space-y-2 pt-0">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Template du message
                </Label>
                <textarea
                  value={cfg.template || DEFAULT_TEMPLATES[t.id]}
                  onChange={(e) => patchTrigger(t.id, { template: e.target.value })}
                  rows={5}
                  className="w-full rounded-lg border border-input bg-background p-2.5 text-sm leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10"
                />
                <div className="flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => patchTrigger(t.id, { template: DEFAULT_TEMPLATES[t.id] })}
                    className="text-[11px] text-muted-foreground"
                  >
                    Restaurer le template par défaut
                  </Button>
                  <div className="text-[10px] text-muted-foreground">
                    {(cfg.template || DEFAULT_TEMPLATES[t.id]).length} caractères
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
