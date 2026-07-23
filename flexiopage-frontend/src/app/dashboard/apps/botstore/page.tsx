'use client';

/**
 * App "Botstore" — chatbot IA en direct sur la storefront de la boutique.
 * Le vendeur active le bot, personnalise le ton et les consignes, et peut
 * activer un fallback WhatsApp qui s'affiche dans la conversation quand le
 * bot ne sait pas répondre.
 *
 * Différence avec le WhatsApp Bot : le WhatsApp Bot répond DANS WhatsApp
 * (via WasenderAPI, page vendeur). Le Botstore répond DANS la storefront
 * (widget de chat public, sans compte WhatsApp requis).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { cn } from '@/lib/utils';
import { ArrowLeft, Bot, Loader2, Save, Check, MessageSquare, Sparkles } from 'lucide-react';

interface WhatsappFallbackCfg {
  enabled?: boolean;
  alwaysOffer?: boolean;
  ctaLabel?: string;
}

interface BotstoreConfig {
  enabled?: boolean;
  persona?: string;
  instructions?: string;
  position?: 'bottom-right' | 'bottom-left';
  accentColor?: string;
  greeting?: string;
  launcherLabel?: string;
  whatsappFallback?: WhatsappFallbackCfg;
}

interface StoreLite {
  _id: string;
  name: string;
  settings?: {
    botstore?: BotstoreConfig;
    whatsapp?: { enabled?: boolean; phoneNumber?: string };
  };
}

const DEFAULT_GREETING = "Salut 👋 Comment puis-je t'aider ?";
const DEFAULT_LAUNCHER = 'Discuter avec nous';
const DEFAULT_CTA_LABEL = 'Discuter sur WhatsApp';
const DEFAULT_ACCENT = '#4f46e5';

export default function BotstorePage() {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get('storeId');
  const { storeId } = useScopedStoreId(storeIdParam);

  const [store, setStore] = useState<StoreLite | null>(null);
  const [config, setConfig] = useState<BotstoreConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await storesApi.get(storeId);
      const s = (res.data as { store: StoreLite }).store;
      setStore(s);
      setConfig(s.settings?.botstore || {});
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!storeId || !store) return;
    setSaving(true);
    setError(null);
    try {
      // Merge par-dessus les settings existants — on ne veut pas écraser les
      // autres blocs (whatsapp, salesPopup, etc.) via un PATCH partiel.
      const nextSettings = {
        ...(store.settings || {}),
        botstore: config,
      };
      await storesApi.update(storeId, { settings: nextSettings });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2200);
      // Recharge pour capter la version normalisée par le backend (defaults, etc.).
      await load();
    } catch (err) {
      const ax = err as { response?: { data?: { error?: string; message?: string } } };
      setError(ax.response?.data?.error || ax.response?.data?.message || 'Enregistrement échoué');
    } finally {
      setSaving(false);
    }
  }

  const patch = (next: Partial<BotstoreConfig>) => setConfig((c) => ({ ...c, ...next }));
  const patchFallback = (next: Partial<WhatsappFallbackCfg>) =>
    setConfig((c) => ({ ...c, whatsappFallback: { ...(c.whatsappFallback || {}), ...next } }));

  const whatsappNumber = store?.settings?.whatsapp?.phoneNumber?.trim();
  const fallback = config.whatsappFallback || {};

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
              <Bot className="h-6 w-6 text-indigo-600" />
              Botstore
            </h1>
            <p className="text-sm text-muted-foreground">
              Chatbot IA qui répond aux visiteurs de ta boutique en s'appuyant sur tes produits.
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5 gradient-brand text-white">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : savedFlash ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saving ? 'Enregistrement…' : savedFlash ? 'Enregistré' : 'Enregistrer'}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Master switch */}
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <label className="flex flex-1 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={!!config.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
              className="h-5 w-5 rounded border-input"
            />
            <div>
              <div className="text-sm font-semibold">Activer le Botstore</div>
              <p className="text-[11px] text-muted-foreground">
                Affiche une bulle de chat sur toutes les pages de ta boutique. Le bot répond aux
                questions à partir de ton catalogue et de tes réglages.
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

      {/* Persona & instructions */}
      <Card className={cn(!config.enabled && 'opacity-60')}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            Personnalité du bot
          </CardTitle>
          <CardDescription>
            Le ton influence la voix du bot. Les consignes sont ajoutées au contexte à chaque réponse.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ton / personnalité
            </Label>
            <Input
              value={config.persona || ''}
              onChange={(e) => patch({ persona: e.target.value })}
              placeholder="Amical, tutoie le client, réponds en français simple."
              disabled={!config.enabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Consignes libres
            </Label>
            <textarea
              value={config.instructions || ''}
              onChange={(e) => patch({ instructions: e.target.value })}
              rows={5}
              disabled={!config.enabled}
              placeholder="Ex : livraison en 24-48h partout au pays, retour gratuit sous 14 jours, promo -20% en cours sur les baskets…"
              className="mt-1 w-full rounded-lg border border-input bg-background p-2.5 text-sm leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10 disabled:opacity-60"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Ces consignes sont ajoutées au contexte du bot à chaque question. Elles priment sur les
              réponses génériques.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Apparence */}
      <Card className={cn(!config.enabled && 'opacity-60')}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Apparence de la bulle</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Position
            </Label>
            <select
              value={config.position || 'bottom-right'}
              onChange={(e) => patch({ position: e.target.value as BotstoreConfig['position'] })}
              disabled={!config.enabled}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="bottom-right">Bas droite</option>
              <option value="bottom-left">Bas gauche</option>
            </select>
          </div>
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Couleur d'accent
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={config.accentColor || DEFAULT_ACCENT}
                onChange={(e) => patch({ accentColor: e.target.value })}
                disabled={!config.enabled}
                className="h-10 w-14 cursor-pointer rounded-md border border-input bg-background p-1"
              />
              <Input
                value={config.accentColor || ''}
                onChange={(e) => patch({ accentColor: e.target.value })}
                placeholder={DEFAULT_ACCENT}
                disabled={!config.enabled}
                className="h-10 flex-1 font-mono text-xs"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Message d'accueil (1er message du bot)
            </Label>
            <Input
              value={config.greeting || ''}
              onChange={(e) => patch({ greeting: e.target.value })}
              placeholder={DEFAULT_GREETING}
              disabled={!config.enabled}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Libellé de la bulle
            </Label>
            <Input
              value={config.launcherLabel || ''}
              onChange={(e) => patch({ launcherLabel: e.target.value })}
              placeholder={DEFAULT_LAUNCHER}
              disabled={!config.enabled}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Fallback WhatsApp */}
      <Card className={cn(!config.enabled && 'opacity-60')}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-emerald-600" />
            Fallback WhatsApp
          </CardTitle>
          <CardDescription>
            Quand le bot ne sait pas répondre, propose au client de continuer sur WhatsApp.
            {whatsappNumber
              ? ' Numéro utilisé : '
              : ' Configure d\'abord un numéro WhatsApp dans les réglages de la boutique.'}
            {whatsappNumber && <code className="ml-1 font-mono text-xs">{whatsappNumber}</code>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={fallback.enabled !== false}
              onChange={(e) => patchFallback({ enabled: e.target.checked })}
              disabled={!config.enabled || !whatsappNumber}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">Activer le CTA WhatsApp dans le chat</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={!!fallback.alwaysOffer}
              onChange={(e) => patchFallback({ alwaysOffer: e.target.checked })}
              disabled={!config.enabled || !whatsappNumber || fallback.enabled === false}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm">Toujours proposer WhatsApp (pas juste quand le bot bloque)</span>
          </label>
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Texte du bouton
            </Label>
            <Input
              value={fallback.ctaLabel || ''}
              onChange={(e) => patchFallback({ ctaLabel: e.target.value })}
              placeholder={DEFAULT_CTA_LABEL}
              disabled={!config.enabled || !whatsappNumber || fallback.enabled === false}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground">
        <div className="mb-1 font-semibold text-foreground">💡 Ce que le bot connaît automatiquement</div>
        <ul className="space-y-0.5 pl-4 list-disc">
          <li>Le nom, la description et le pays de ta boutique</li>
          <li>Tes produits publiés (nom, prix, stock, description courte)</li>
          <li>Les frais de livraison et devise configurés dans les réglages</li>
        </ul>
      </div>
    </div>
  );
}
