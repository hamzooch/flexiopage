'use client';

/**
 * Éditeurs des sections "conversion" de la page produit publique.
 * Centralisés dans un seul fichier pour ne pas éclater l'éditeur produit
 * principal, et réutilisables par d'autres surfaces (wizard produit, etc.).
 *
 * Sections gérées :
 *   - Features (USPs) : icône + titre + sous-titre
 *   - FAQ : question / réponse
 *   - Specs : tableau clé / valeur
 *   - Shipping & retours : délai, frais, fenêtre de retour
 */

import {
  Plus, Trash2, GripVertical,
  Sparkles, Shield, Leaf, Zap, Heart, Award, Gift, Truck, Clock, Check, Star, Recycle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// ─── Types (mirrors backend IProductPageSettings) ───────────────────
export type FeatureIcon =
  | 'sparkles' | 'shield' | 'leaf' | 'zap' | 'heart' | 'award'
  | 'gift' | 'truck' | 'clock' | 'check' | 'star' | 'recycle';

export interface ProductFeature {
  icon: FeatureIcon;
  title: string;
  subtitle?: string;
}

export interface ProductFaqItem {
  question: string;
  answer: string;
}

export interface ProductSpecItem {
  key: string;
  value: string;
}

export interface ProductShippingInfo {
  deliveryTime?: string;
  deliveryNote?: string;
  returnDays?: number;
  returnNote?: string;
}

// ─── Icon registry ─────────────────────────────────────────────────
const FEATURE_ICON_MAP: Record<FeatureIcon, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles, shield: Shield, leaf: Leaf, zap: Zap, heart: Heart,
  award: Award, gift: Gift, truck: Truck, clock: Clock, check: Check,
  star: Star, recycle: Recycle,
};
const FEATURE_ICON_LIST: FeatureIcon[] = [
  'sparkles', 'shield', 'leaf', 'zap', 'heart', 'award',
  'gift', 'truck', 'clock', 'check', 'star', 'recycle',
];

export function featureIconComponent(id: FeatureIcon | string): React.ComponentType<{ className?: string }> {
  return FEATURE_ICON_MAP[id as FeatureIcon] || Sparkles;
}

// ═══════════════════════════════════════════════════════════════════
// FEATURES (USPs)
// ═══════════════════════════════════════════════════════════════════
export function FeaturesEditor({
  value,
  onChange,
}: {
  value?: ProductFeature[];
  onChange: (next: ProductFeature[] | undefined) => void;
}) {
  const list = value || [];
  const update = (i: number, patch: Partial<ProductFeature>) => {
    const next = list.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => {
    const next = list.filter((_, idx) => idx !== i);
    onChange(next.length ? next : undefined);
  };
  const add = () => {
    onChange([...list, { icon: 'sparkles', title: '', subtitle: '' }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-xs font-semibold">Points forts (USPs)</Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            3 à 6 bullets avec icône. Ce que le client scanne avant de lire la description.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={add} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyHint text="Aucun point fort — clique « Ajouter » pour mettre en avant 3-6 bénéfices clés." />
      ) : (
        <ul className="space-y-2">
          {list.map((f, i) => {
            const Icon = featureIconComponent(f.icon);
            return (
              <li
                key={i}
                className="grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-xl border border-border/60 bg-muted/20 p-2.5"
              >
                <details className="relative">
                  <summary
                    className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg bg-primary/10 text-primary marker:hidden"
                    title="Changer l'icône"
                  >
                    <Icon className="h-4 w-4" />
                  </summary>
                  <div className="absolute left-0 top-11 z-20 grid w-52 grid-cols-6 gap-1 rounded-xl border border-border bg-card p-2 shadow-lg">
                    {FEATURE_ICON_LIST.map((id) => {
                      const IC = FEATURE_ICON_MAP[id];
                      const active = id === f.icon;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => update(i, { icon: id })}
                          className={cn(
                            'grid h-8 w-8 place-items-center rounded-md transition-colors',
                            active ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                          title={id}
                        >
                          <IC className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                </details>
                <div className="space-y-1.5">
                  <Input
                    value={f.title}
                    onChange={(e) => update(i, { title: e.target.value })}
                    placeholder="Ex: Livraison express 48h"
                    className="h-9 text-sm font-medium"
                  />
                  <Input
                    value={f.subtitle || ''}
                    onChange={(e) => update(i, { subtitle: e.target.value })}
                    placeholder="Sous-titre (optionnel) — détaille en quelques mots"
                    className="h-8 text-[11px]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="grid h-9 w-9 place-items-center self-center rounded-md text-destructive hover:bg-destructive/10"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FAQ
// ═══════════════════════════════════════════════════════════════════
export function FaqEditor({
  value,
  onChange,
}: {
  value?: ProductFaqItem[];
  onChange: (next: ProductFaqItem[] | undefined) => void;
}) {
  const list = value || [];
  const update = (i: number, patch: Partial<ProductFaqItem>) => {
    const next = list.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => {
    const next = list.filter((_, idx) => idx !== i);
    onChange(next.length ? next : undefined);
  };
  const add = () => {
    onChange([...list, { question: '', answer: '' }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-xs font-semibold">FAQ produit</Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Lève les objections AVANT le formulaire de commande. Massivement efficace en COD.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={add} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyHint text="Pas de FAQ — pense aux 3-5 doutes les plus fréquents (taille, matière, retour, fonctionnement)." />
      ) : (
        <ul className="space-y-2">
          {list.map((q, i) => (
            <li
              key={i}
              className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3"
            >
              <div className="flex items-center gap-2">
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input
                  value={q.question}
                  onChange={(e) => update(i, { question: e.target.value })}
                  placeholder="Question fréquente ?"
                  className="h-9 flex-1 text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="grid h-9 w-9 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                value={q.answer}
                onChange={(e) => update(i, { answer: e.target.value })}
                placeholder="Réponse claire et rassurante (2-4 lignes)"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SPECS (key/value)
// ═══════════════════════════════════════════════════════════════════
export function SpecsEditor({
  value,
  onChange,
}: {
  value?: ProductSpecItem[];
  onChange: (next: ProductSpecItem[] | undefined) => void;
}) {
  const list = value || [];
  const update = (i: number, patch: Partial<ProductSpecItem>) => {
    const next = list.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => {
    const next = list.filter((_, idx) => idx !== i);
    onChange(next.length ? next : undefined);
  };
  const add = () => {
    onChange([...list, { key: '', value: '' }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-xs font-semibold">Spécifications</Label>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Table clé / valeur. Matière, poids, dimensions, contenu de la boîte, garantie…
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={add} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </Button>
      </div>

      {list.length === 0 ? (
        <EmptyHint text="Aucune spécification — important pour cosmétique, déco, mode, tech." />
      ) : (
        <ul className="space-y-1.5">
          {list.map((s, i) => (
            <li key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Input
                value={s.key}
                onChange={(e) => update(i, { key: e.target.value })}
                placeholder="Matière"
                className="h-9 text-sm font-medium"
              />
              <Input
                value={s.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="100 % coton bio"
                className="h-9 text-sm"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="grid h-9 w-9 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                aria-label="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SHIPPING & RETURNS
// ═══════════════════════════════════════════════════════════════════
export function ShippingInfoEditor({
  value,
  onChange,
}: {
  value?: ProductShippingInfo;
  onChange: (next: ProductShippingInfo | undefined) => void;
}) {
  const v = value || {};
  const update = (patch: Partial<ProductShippingInfo>) => {
    const next = { ...v, ...patch };
    // Si tout est vide on remonte undefined pour ne pas polluer le payload.
    const allEmpty = !next.deliveryTime && !next.deliveryNote && !next.returnDays && !next.returnNote;
    onChange(allEmpty ? undefined : next);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-semibold">Livraison & retours</Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Réponds aux 3 questions COD : délai, frais, retour. Bloc affiché sous les badges.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ship-time" className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Délai de livraison
          </Label>
          <Input
            id="ship-time"
            value={v.deliveryTime || ''}
            onChange={(e) => update({ deliveryTime: e.target.value || undefined })}
            placeholder="Ex: 2 à 5 jours ouvrés"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ship-note" className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Note livraison
          </Label>
          <Input
            id="ship-note"
            value={v.deliveryNote || ''}
            onChange={(e) => update({ deliveryNote: e.target.value || undefined })}
            placeholder="Ex: Gratuit dès 200 TND"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ret-days" className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Fenêtre de retour (jours)
          </Label>
          <Input
            id="ret-days"
            type="number"
            min={0}
            max={365}
            value={v.returnDays ?? ''}
            onChange={(e) => update({ returnDays: e.target.value ? Math.max(0, parseInt(e.target.value, 10)) : undefined })}
            placeholder="14"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ret-note" className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Note retour
          </Label>
          <Input
            id="ret-note"
            value={v.returnNote || ''}
            onChange={(e) => update({ returnNote: e.target.value || undefined })}
            placeholder="Ex: Sans question, sans frais"
            className="h-9 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Helpers UI
// ═══════════════════════════════════════════════════════════════════
function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border/60 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
      {text}
    </p>
  );
}
