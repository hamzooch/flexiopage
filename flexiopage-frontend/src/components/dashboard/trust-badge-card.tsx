'use client';

/**
 * Carte d'édition d'un seul badge de confiance. Composant réutilisé côté
 * dashboard entre l'éditeur boutique (Page produit → Badges globaux) et
 * l'éditeur produit (override par produit).
 *
 * Deux modes exclusifs :
 *   - Icône Lucide (parmi une liste de 10 icônes conversion-safe)
 *   - Image custom uploadée par le vendeur (logo partenaire, sceau, …)
 * Bascule via tabs — l'un efface l'autre pour éviter les états hybrides.
 */

import { useEffect, useState } from 'react';
import {
  Truck, ShieldCheck, RefreshCcw, Lock, Headphones, Gift, Clock,
  Star, Leaf, Banknote, Trash2, ChevronUp, ChevronDown, Award,
  Image as ImgIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MediaPicker } from '@/components/dashboard/MediaPicker';
import type { BadgeIcon, TrustBadge } from '@/lib/product-page-order';

export const BADGE_ICONS: Record<BadgeIcon, typeof Truck> = {
  truck: Truck,
  shield: ShieldCheck,
  refresh: RefreshCcw,
  lock: Lock,
  headset: Headphones,
  gift: Gift,
  clock: Clock,
  star: Star,
  leaf: Leaf,
  banknote: Banknote,
};

export const ICON_LIST: BadgeIcon[] = [
  'truck', 'shield', 'refresh', 'lock', 'headset',
  'gift', 'clock', 'star', 'leaf', 'banknote',
];

interface Props {
  badge: TrustBadge;
  index: number;
  total: number;
  storeId?: string;
  onChange: (patch: Partial<TrustBadge>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

export function TrustBadgeCard({
  badge, index, total, storeId, onChange, onRemove, onMove,
}: Props) {
  const Icon = BADGE_ICONS[badge.icon] || Truck;
  const [mode, setMode] = useState<'icon' | 'image'>(badge.imageUrl ? 'image' : 'icon');

  // Reste synchronisé avec la source de vérité (imageUrl) — utile quand le
  // vendeur retire l'image via le MediaPicker : on repasse en mode icône.
  useEffect(() => {
    setMode(badge.imageUrl ? 'image' : 'icon');
  }, [badge.imageUrl]);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
      {/* Header row : preview + label inputs + actions */}
      <div className="flex items-start gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          {badge.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={badge.imageUrl} alt="" className="h-full w-full object-contain p-1.5" />
          ) : (
            <Icon className="h-7 w-7" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={badge.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Livraison rapide"
            className="h-9 text-sm font-medium"
          />
          <Input
            value={badge.sublabel || ''}
            onChange={(e) => onChange({ sublabel: e.target.value })}
            placeholder="Sous-libellé (optionnel) — ex : 2 à 5 jours"
            className="h-8 text-[12px]"
          />
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Monter"
            title="Monter"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Descendre"
            title="Descendre"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
          aria-label="Supprimer ce badge"
          title="Supprimer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Mode picker — Icône OU Image custom */}
      <div className="mt-4 inline-flex gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => {
            setMode('icon');
            if (badge.imageUrl) onChange({ imageUrl: undefined });
          }}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold transition-colors',
            mode === 'icon'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Award className="h-3.5 w-3.5" />
          Icône
        </button>
        <button
          type="button"
          onClick={() => setMode('image')}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold transition-colors',
            mode === 'image'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <ImgIcon className="h-3.5 w-3.5" />
          Image custom
        </button>
      </div>

      {/* Content per mode */}
      {mode === 'icon' ? (
        <div className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
          {ICON_LIST.map((ic) => {
            const IC = BADGE_ICONS[ic];
            const active = ic === badge.icon && !badge.imageUrl;
            return (
              <button
                key={ic}
                type="button"
                onClick={() => onChange({ icon: ic, imageUrl: undefined })}
                className={cn(
                  'grid aspect-square place-items-center rounded-lg border transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border/60 bg-muted/30 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground'
                )}
                aria-label={ic}
                title={ic}
              >
                <IC className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      ) : storeId ? (
        <div className="mt-3">
          <MediaPicker
            storeId={storeId}
            value={badge.imageUrl}
            onChange={(url) => onChange({ imageUrl: url })}
            shape="square"
            helper="PNG transparent recommandé — 200×200 px minimum."
          />
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-border/60 bg-muted/20 p-3 text-center text-[11px] text-muted-foreground">
          Enregistre la boutique une première fois pour pouvoir uploader une image.
        </div>
      )}
    </div>
  );
}

/**
 * Bandeau aperçu — reproduit fidèlement la strip badges telle qu'elle
 * s'affiche sur la page produit publique. Utilisé sous la liste d'édition
 * pour donner un feedback immédiat au vendeur.
 */
export function TrustBadgesPreviewStrip({ badges }: { badges: TrustBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-br from-muted/40 to-muted/10 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Aperçu sur la page produit
        </span>
        <span className="text-[10px] text-muted-foreground">
          {badges.length} badge{badges.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className={cn(
        'grid gap-3',
        badges.length === 1 ? 'grid-cols-1' :
        badges.length === 2 ? 'grid-cols-2' :
        'grid-cols-3'
      )}>
        {badges.map((b, i) => {
          const Icon = BADGE_ICONS[b.icon] || Truck;
          return (
            <div key={i} className="flex flex-col items-center gap-1.5 text-center">
              <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-primary/10 text-primary">
                {b.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={b.imageUrl} alt="" className="h-full w-full object-contain" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-semibold text-foreground">
                  {b.label || <span className="italic text-muted-foreground">Sans libellé</span>}
                </div>
                {b.sublabel && (
                  <div className="truncate text-[10px] text-muted-foreground">{b.sublabel}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
