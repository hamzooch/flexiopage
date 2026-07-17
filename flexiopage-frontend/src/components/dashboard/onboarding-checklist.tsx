'use client';

/**
 * Onboarding checklist shown at the top of the store hub. Five steps that
 * the seller can complete in any order — each auto-detected from the store
 * data (no manual "done" button). Inspired by Shopify's setup guide.
 *
 * Steps:
 *   1. Choose a theme        — store.theme.templateId is set
 *   2. Add your first product — at least 1 product exists
 *   3. Connect delivery       — physical: MogaDelivery key + pickup; digital: skipped
 *   4. Configure a pixel      — at least one marketing ID set (or skipped explicitly)
 *   5. Publish the store      — store.isPublished is true
 *
 * Auto-collapses to a thin summary bar once every step is done. The
 * seller can also dismiss it (per-store, persisted in localStorage) once
 * the full list completes.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  PartyPopper,
  Palette,
  Package,
  Truck,
  TrendingUp,
  Eye,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { StoreType } from '@/components/dashboard/store-editor';

interface Props {
  store: StoreType;
}

type StepStatus = 'done' | 'todo' | 'skipped';

interface Step {
  id: string;
  title: string;
  hint: string;
  href: string;
  icon: typeof Palette;
  status: StepStatus;
  /** Visual chip color when the step is done. */
  doneAccent: string;
}

const DISMISS_KEY = (storeId: string) => `flexio.onboarding.dismissed:${storeId}`;

export function OnboardingChecklist({ store }: Props) {
  const [productCount, setProductCount] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Read dismissed state once on mount — opt-in localStorage flag, scoped
  // per store so a different store starts fresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flag = window.localStorage.getItem(DISMISS_KEY(store._id));
    if (flag === '1') setDismissed(true);
  }, [store._id]);

  // Fetch product count (lightweight) — we only need to know if there's at
  // least one product, so a single request is fine.
  useEffect(() => {
    let cancelled = false;
    storesApi
      .listProducts(store._id)
      .then((res) => {
        if (cancelled) return;
        const list = (res.data as { products?: unknown[] }).products || [];
        setProductCount(list.length);
      })
      .catch(() => {
        if (!cancelled) setProductCount(0);
      });
    return () => { cancelled = true; };
  }, [store._id]);

  const isDigital = store.storeType === 'digital';

  const steps = useMemo<Step[]>(() => {
    const themeDone = !!(store.theme && (store.theme as { templateId?: string }).templateId);
    const productsDone = (productCount ?? 0) > 0;
    const delivery = store.integrations?.delivery;
    const deliveryDone = !!(delivery?.enabled && delivery.apiKey && delivery.pickupAddress?.city);
    const marketing = store.integrations?.marketing;
    const pixelDone = !!(
      marketing?.facebookPixelId
      || marketing?.tiktokPixelId
      || marketing?.snapchatPixelId
      || marketing?.googleAnalyticsId
    );
    const publishedDone = !!store.isPublished;

    const arr: Step[] = [
      {
        id: 'theme',
        title: 'Choisir un thème',
        hint: themeDone ? 'Thème sélectionné.' : 'Sélectionne un design qui colle à ta marque.',
        href: `/dashboard/stores/${store._id}?block=theme`,
        icon: Palette,
        status: themeDone ? 'done' : 'todo',
        doneAccent: 'from-violet-500 to-fuchsia-600',
      },
      {
        id: 'product',
        title: 'Ajouter ton premier produit',
        hint: productsDone
          ? `${productCount} produit${productCount! > 1 ? 's' : ''} dans le catalogue.`
          : 'Sans produit, ta vitrine est vide.',
        href: `/dashboard/products?storeId=${store._id}`,
        icon: Package,
        status: productsDone ? 'done' : 'todo',
        doneAccent: 'from-emerald-500 to-teal-600',
      },
      ...(isDigital
        ? []
        : [{
          id: 'delivery',
          title: 'Lier un service de livraison',
          hint: deliveryDone
            ? 'Service de livraison connecté — dispatch automatique actif.'
            : 'Choisis une société de livraison ou un service logistique pour envoyer tes commandes.',
          href: `/dashboard/integrations?tab=shipping&storeId=${store._id}`,
          icon: Truck,
          status: deliveryDone ? ('done' as const) : ('todo' as const),
          doneAccent: 'from-rose-500 to-pink-600',
        }]),
      {
        id: 'pixel',
        title: 'Configurer un pixel marketing',
        hint: pixelDone
          ? 'Pixels actifs sur la vitrine.'
          : 'Pour mesurer tes pubs Meta, TikTok ou Google.',
        href: `/dashboard/stores/${store._id}?block=marketing`,
        icon: TrendingUp,
        status: pixelDone ? 'done' : 'todo',
        doneAccent: 'from-fuchsia-500 to-pink-600',
      },
      {
        id: 'publish',
        title: 'Publier la boutique',
        hint: publishedDone
          ? 'Boutique en ligne, visible par tes clients.'
          : 'Dernière étape pour passer en mode "ouvert".',
        href: `/dashboard/stores/${store._id}`,
        icon: Eye,
        status: publishedDone ? 'done' : 'todo',
        doneAccent: 'from-indigo-500 to-violet-600',
      },
    ];
    return arr;
  }, [store, productCount, isDigital]);

  const total = steps.length;
  const done = steps.filter((s) => s.status === 'done').length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const allDone = done === total;

  // Don't render at all when the seller dismissed an all-done checklist.
  if (dismissed) return null;

  // Loading state — show a thin skeleton so the layout doesn't jump once
  // product count resolves.
  if (productCount === null) {
    return (
      <div className="h-20 animate-pulse rounded-2xl border border-border/60 bg-muted/30" />
    );
  }

  function dismiss() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY(store._id), '1');
    }
    setDismissed(true);
  }

  // ── All-done banner — short, celebratory, dismissible ────────────
  if (allDone && collapsed) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-card to-emerald-500/5 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500 text-white shadow-sm">
            <PartyPopper className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-emerald-800">Boutique 100 % configurée</p>
            <p className="text-xs text-emerald-700/80">Tu peux maintenant te concentrer sur le marketing et les ventes.</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={dismiss} className="gap-1.5 text-emerald-700 hover:bg-emerald-500/10">
          <X className="h-3.5 w-3.5" />
          Masquer
        </Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
      {/* Header — progress + collapse/dismiss */}
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={cn(
              'grid h-10 w-10 shrink-0 place-items-center rounded-xl shadow-sm',
              allDone
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
                : 'bg-gradient-to-br from-primary to-fuchsia-600 text-white'
            )}
          >
            {allDone ? <PartyPopper className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight">
              {allDone ? 'Tout est prêt !' : 'Lance ta boutique en 5 étapes'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {allDone
                ? 'Bravo — chaque étape est cochée.'
                : `${done}/${total} étape${total > 1 ? 's' : ''} complétée${done > 1 ? 's' : ''} — encore ${total - done} pour ouvrir.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-bold',
              allDone
                ? 'bg-emerald-500/15 text-emerald-700'
                : 'bg-primary/10 text-primary'
            )}
          >
            {pct}%
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Développer' : 'Réduire'}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          {allDone && (
            <button
              type="button"
              onClick={dismiss}
              aria-label="Masquer"
              className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-muted/60">
        <div
          className={cn(
            'h-full transition-all duration-500',
            allDone
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
              : 'bg-gradient-to-r from-primary to-fuchsia-600'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {!collapsed && (
        <ul className="divide-y divide-border/60">
          {steps.map((s) => {
            const Icon = s.icon;
            const isDone = s.status === 'done';
            return (
              <li key={s.id}>
                <Link
                  href={s.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 transition-colors',
                    isDone ? 'hover:bg-emerald-500/5' : 'hover:bg-primary/5'
                  )}
                >
                  <span
                    className={cn(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                      isDone
                        ? `bg-gradient-to-br ${s.doneAccent} text-white shadow-sm`
                        : 'border-2 border-dashed border-border/80 text-muted-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          isDone ? 'text-emerald-700 line-through decoration-emerald-300/60' : 'text-foreground'
                        )}
                      >
                        {s.title}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
                  </div>
                  {isDone ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
