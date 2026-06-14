'use client';

/**
 * Compact, faithful mock of the public product page. Lives in the right
 * pane of the product editor so the seller sees every change in real
 * time without saving.
 *
 * Mirrors the real /<store>/product/<slug> layout: gallery on top,
 * title / rating strip / price / promo CTA / trust badges. Optional
 * timer block when a per-product timer is set.
 */

import { useEffect, useState } from 'react';
import { renderMarkdown } from '@/lib/markdown';
import {
  Eye, ShoppingBag, Clock, Star,
  Truck, ShieldCheck, RefreshCcw, Lock, Headphones, Gift, Leaf, Banknote,
  Smartphone, Monitor,
} from 'lucide-react';
import { cn, mediaUrl } from '@/lib/utils';

const BADGE_ICONS = {
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
} as const;

type BadgeIcon = keyof typeof BADGE_ICONS;

interface Badge {
  icon: BadgeIcon;
  label: string;
  sublabel?: string;
}

interface Props {
  name: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  images: string[];
  /** Resolved page settings (per-product overrides + store fallbacks). */
  showGallery: boolean;
  showDescription: boolean;
  showTrustBadges: boolean;
  showRatingStrip?: boolean;
  badges?: Badge[];
  timerEndsAt?: string;
  timerHeadline?: string;
  /** Per-timer color — wins over `accentColor` for the timer block only. */
  timerAccentColor?: string;
  accentColor?: string;
  codSubmitLabel: string;
  /** Stock count (for the "X en stock" line). */
  stock?: number;
  trackInventory?: boolean;
}

export function ProductLivePreview(props: Props) {
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const isMobile = device === 'mobile';

  const accent = props.accentColor || '#7c3aed';
  const timerAccent = props.timerAccentColor || accent;
  const fmt = (n: number) => `${n.toFixed(2)} ${props.currency}`;
  const hasDiscount = props.compareAtPrice && props.compareAtPrice > props.price;
  const discountPct = hasDiscount
    ? Math.round(((props.compareAtPrice! - props.price) / props.compareAtPrice!) * 100)
    : 0;

  // Live timer countdown — recomputed every second.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!props.timerEndsAt) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [props.timerEndsAt]);

  const timerDelta = props.timerEndsAt
    ? Math.max(0, new Date(props.timerEndsAt).getTime() - Date.now())
    : 0;
  const showTimer = !!props.timerEndsAt && timerDelta > 0;
  const tparts = (() => {
    const s = Math.floor(timerDelta / 1000);
    return [
      Math.floor(s / 86400),
      Math.floor((s % 86400) / 3600),
      Math.floor((s % 3600) / 60),
      s % 60,
    ];
  })();

  const mainImage = props.images[0];
  const galleryImages = props.images.slice(1, 5);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      {/* ── Header bar ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-gradient-to-r from-muted/30 to-muted/10 px-3 py-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Eye className="h-3 w-3" />
          Aperçu temps réel
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5">
          {([
            { id: 'mobile', icon: Smartphone, label: 'Mobile' },
            { id: 'desktop', icon: Monitor, label: 'Desktop' },
          ] as const).map((d) => {
            const Icon = d.icon;
            const active = device === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDevice(d.id)}
                aria-label={d.label}
                aria-pressed={active}
                className={cn(
                  'grid h-6 w-6 place-items-center rounded transition-all',
                  active ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-h-[78vh] overflow-y-auto bg-muted/20 p-3">
        <div
          className="mx-auto overflow-hidden rounded-xl bg-card shadow-sm transition-all"
          style={{ maxWidth: isMobile ? 300 : 9999 }}
        >
          {/* Fake browser chrome */}
          <div className="flex items-center gap-1 border-b border-border/40 bg-muted/30 px-2 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
            <span className="ml-2 truncate text-[9px] text-muted-foreground">/produit/{slugify(props.name || 'mon-produit')}</span>
          </div>

          {/* Body — single column on mobile, 2-col on desktop preview */}
          <div className={cn('p-3', !isMobile && 'grid grid-cols-2 gap-3')}>
            {/* ── Gallery ───────────────────────────────────── */}
            <div className="space-y-1.5">
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                {mainImage ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={mediaUrl(mainImage) || mainImage} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-[10px] text-muted-foreground">
                    Pas d&apos;image
                  </div>
                )}
                {hasDiscount && (
                  <span
                    className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                    style={{ backgroundColor: accent }}
                  >
                    −{discountPct}%
                  </span>
                )}
              </div>
              {props.showGallery && galleryImages.length > 0 && (
                <div className="grid grid-cols-4 gap-1">
                  {galleryImages.map((img, i) => (
                    <div key={i} className="aspect-square overflow-hidden rounded border border-border/40 bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl(img) || img} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Info column ───────────────────────────────── */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold leading-tight">{props.name || 'Nom du produit'}</h3>
              {props.showRatingStrip && (
                <div className="flex items-center gap-0.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="h-2.5 w-2.5" style={{ color: accent, fill: accent }} />
                  ))}
                  <span className="ml-1 text-[8px] text-muted-foreground">(127)</span>
                </div>
              )}
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-extrabold leading-none" style={{ color: accent }}>
                  {fmt(props.price)}
                </span>
                {hasDiscount && (
                  <span className="text-[10px] line-through text-muted-foreground">
                    {fmt(props.compareAtPrice!)}
                  </span>
                )}
              </div>

              {props.trackInventory && typeof props.stock === 'number' && (
                <div className="text-[9px]" style={{ color: props.stock > 0 ? '#047857' : '#dc2626' }}>
                  {props.stock > 0 ? `✓ ${props.stock} en stock` : 'Rupture de stock'}
                </div>
              )}

              {/* Stub COD form rows */}
              <div className="space-y-1 pt-1">
                <div className="h-1.5 w-full rounded bg-muted" />
                <div className="h-1.5 w-2/3 rounded bg-muted" />
              </div>

              <button
                type="button"
                className="mt-1 inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md text-[10px] font-bold text-white"
                style={{ backgroundColor: accent }}
              >
                <ShoppingBag className="h-3 w-3" />
                {props.codSubmitLabel} · {fmt(props.price)}
              </button>
            </div>
          </div>

          {/* ── Below-fold sections — full width even in desktop preview ── */}
          <div className="space-y-3 border-t border-border/40 bg-muted/10 p-3">
            {showTimer && (
              <div
                className="flex items-center justify-between rounded border px-2 py-1.5"
                style={{ borderColor: `${timerAccent}40`, backgroundColor: `${timerAccent}0d` }}
              >
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: timerAccent }}>
                  <Clock className="h-3 w-3" />
                  {props.timerHeadline || 'Offre limitée'}
                </span>
                <span className="flex gap-0.5 tabular-nums">
                  {tparts.map((v, i) => (
                    <span
                      key={i}
                      className="rounded px-1 py-0.5 text-[9px] font-extrabold text-white"
                      style={{ backgroundColor: timerAccent }}
                    >
                      {String(v).padStart(2, '0')}
                    </span>
                  ))}
                </span>
              </div>
            )}

            {props.showTrustBadges && props.badges && props.badges.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5">
                {props.badges.slice(0, 3).map((b, i) => {
                  const Icon = BADGE_ICONS[b.icon] || Truck;
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-1 rounded border border-border/60 bg-card px-1.5 py-1"
                    >
                      <span
                        className="grid h-4 w-4 shrink-0 place-items-center rounded"
                        style={{ backgroundColor: `${accent}1a`, color: accent }}
                      >
                        <Icon className="h-2.5 w-2.5" />
                      </span>
                      <span className="min-w-0 truncate text-[9px] font-semibold">{b.label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {props.showDescription && (
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Description
                </div>
                {props.description ? (
                  // Render markdown comme sur le storefront — l'aperçu droit
                  // étant désormais scrollable côté <aside>, on affiche toute
                  // la description (texte + images inline). Cap max-h sur les
                  // images pour qu'une photo géante ne mange pas tout l'aperçu.
                  <div
                    className="prose-storefront text-[10px] leading-snug text-foreground [&_img]:my-1.5 [&_img]:max-h-40 [&_img]:rounded [&_p]:my-1 [&_h1]:text-xs [&_h2]:text-[11px] [&_h3]:text-[11px]"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(props.description) }}
                  />
                ) : (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded bg-muted/80" />
                    <div className="h-1.5 w-11/12 rounded bg-muted/80" />
                    <div className="h-1.5 w-3/4 rounded bg-muted/80" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <p className="mt-2 text-center text-[9px] text-muted-foreground">
          Reflète ce que verront tes clients sur la fiche produit
        </p>
      </div>
    </div>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'produit';
}
