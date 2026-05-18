'use client';

/**
 * Apps & Integrations hub — single-screen status dashboard for every
 * module the seller can wire into the store. Shopify-style: each tile
 * shows ✅ connected / ⚠️ to configure, with a direct link to the config
 * page so the seller never has to hunt for it.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Layers,
  MessageCircle,
  TrendingUp,
  Truck,
  Mail,
  BadgePercent,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { StoreType } from '@/components/dashboard/store-editor';
import type { Coupon } from '@/types/coupon';
import type { Collection } from '@/types/collection';

interface AppTile {
  id: string;
  href: string;
  icon: typeof Layers;
  title: string;
  description: string;
  /** "Connected" badge condition computed against the loaded store data. */
  connected: boolean;
  /** Optional metric shown when connected (e.g. "3 actifs"). */
  metric?: string;
  /** Tone for the icon chip. */
  tone: 'fuchsia' | 'rose' | 'emerald' | 'amber' | 'sky' | 'violet';
}

const TONE: Record<AppTile['tone'], { iconBg: string; chipBg: string; chipFg: string }> = {
  fuchsia: { iconBg: 'from-fuchsia-500 to-pink-600',   chipBg: 'bg-fuchsia-500/10', chipFg: 'text-fuchsia-700' },
  rose:    { iconBg: 'from-rose-500 to-pink-600',      chipBg: 'bg-rose-500/10',    chipFg: 'text-rose-700' },
  emerald: { iconBg: 'from-emerald-500 to-teal-600',   chipBg: 'bg-emerald-500/10', chipFg: 'text-emerald-700' },
  amber:   { iconBg: 'from-amber-500 to-orange-600',   chipBg: 'bg-amber-500/10',   chipFg: 'text-amber-700' },
  sky:     { iconBg: 'from-sky-500 to-blue-600',       chipBg: 'bg-sky-500/10',     chipFg: 'text-sky-700' },
  violet:  { iconBg: 'from-violet-500 to-fuchsia-600', chipBg: 'bg-violet-500/10',  chipFg: 'text-violet-700' },
};

export default function AppsPage() {
  const params = useParams();
  const storeId = params.storeId as string;
  const [store, setStore] = useState<StoreType | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [subscriberCount, setSubscriberCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storeRes, couponsRes, colRes, subsRes] = await Promise.all([
        storesApi.get(storeId),
        storesApi.listCoupons(storeId).catch(() => ({ data: { coupons: [] } })),
        storesApi.listCollections(storeId).catch(() => ({ data: { collections: [] } })),
        storesApi.listSubscribers(storeId).catch(() => ({ data: { counts: { total: 0 } } })),
      ]);
      setStore((storeRes.data as { store: StoreType }).store);
      setCoupons(((couponsRes.data as { coupons?: Coupon[] }).coupons) || []);
      setCollections(((colRes.data as { collections?: Collection[] }).collections) || []);
      const counts = (subsRes.data as { counts?: { total: number } }).counts;
      setSubscriberCount(counts?.total || 0);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !store) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  const delivery = store.integrations?.delivery;
  const marketing = store.integrations?.marketing;
  const newsletter = (store.settings as { newsletter?: { enabled?: boolean } } | undefined)?.newsletter;
  const whatsapp = store.settings?.whatsapp;
  const activeCouponsCount = coupons.filter((c) => c.isActive).length;

  // Each tile encodes its own "connected" predicate so this hub remains
  // a thin aggregator — no business logic inside the rendering.
  const tiles: AppTile[] = [
    {
      id: 'delivery',
      href: 'delivery',
      icon: Truck,
      title: 'Livraison MogaDelivery',
      description: 'Dispatch auto des commandes COD vers le coursier.',
      connected: !!(delivery?.enabled && delivery.apiKey && delivery.pickupAddress?.city),
      metric: delivery?.autoDispatch !== false ? 'Auto-dispatch on' : 'Manuel',
      tone: 'rose',
    },
    {
      id: 'marketing',
      href: 'marketing',
      icon: TrendingUp,
      title: 'Pixels marketing',
      description: 'Meta, TikTok, Snap, GA4 — événements automatiques.',
      connected: !!(marketing?.facebookPixelId || marketing?.tiktokPixelId || marketing?.snapchatPixelId || marketing?.googleAnalyticsId),
      metric: (() => {
        const n = [marketing?.facebookPixelId, marketing?.tiktokPixelId, marketing?.snapchatPixelId, marketing?.googleAnalyticsId].filter(Boolean).length;
        return n > 0 ? `${n} pixel${n > 1 ? 's' : ''}` : undefined;
      })(),
      tone: 'fuchsia',
    },
    {
      id: 'whatsapp',
      href: 'sections',
      icon: MessageCircle,
      title: 'WhatsApp flottant',
      description: 'Bouton chat WhatsApp sur toutes les pages.',
      connected: !!(whatsapp?.enabled && whatsapp?.phoneNumber?.trim()),
      tone: 'emerald',
    },
    {
      id: 'newsletter',
      href: 'newsletter',
      icon: Mail,
      title: 'Newsletter & pop-up',
      description: 'Capture des emails au premier visit avec un code promo.',
      connected: !!newsletter?.enabled,
      metric: subscriberCount > 0 ? `${subscriberCount} abonnés` : undefined,
      tone: 'emerald',
    },
    {
      id: 'coupons',
      href: 'coupons',
      icon: BadgePercent,
      title: 'Codes promo',
      description: 'Codes saisis dans le COD form — % ou montant fixe.',
      connected: activeCouponsCount > 0,
      metric: activeCouponsCount > 0 ? `${activeCouponsCount} actif${activeCouponsCount > 1 ? 's' : ''}` : undefined,
      tone: 'amber',
    },
    {
      id: 'collections',
      href: 'collections',
      icon: Layers,
      title: 'Collections',
      description: 'Regroupe tes produits par thème (page dédiée par collection).',
      connected: collections.length > 0,
      metric: collections.length > 0 ? `${collections.length} collection${collections.length > 1 ? 's' : ''}` : undefined,
      tone: 'sky',
    },
  ];

  const connectedCount = tiles.filter((t) => t.connected).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/stores/${storeId}`}>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Apps & Intégrations</h1>
            <p className="text-sm text-muted-foreground">
              Tout ce qui se branche sur ta boutique en un coup d&apos;œil. Clique sur une tuile pour configurer.
            </p>
          </div>
        </div>
        <div
          className={cn(
            'rounded-full px-3 py-1.5 text-sm font-bold',
            connectedCount === tiles.length
              ? 'bg-emerald-500/10 text-emerald-700'
              : 'bg-primary/10 text-primary'
          )}
        >
          {connectedCount} / {tiles.length} connectées
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const tone = TONE[t.tone];
          const Icon = t.icon;
          return (
            <Link
              key={t.id}
              href={`/dashboard/stores/${storeId}/${t.href}`}
              className={cn(
                'group relative block overflow-hidden rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md',
                t.connected
                  ? 'border-emerald-500/30 hover:border-emerald-500/60'
                  : 'border-border/60 hover:border-primary/40'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm',
                    tone.iconBg
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-bold tracking-tight">{t.title}</h3>
                    {t.connected ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{t.description}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    {t.connected ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Connectée
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        À configurer
                      </span>
                    )}
                    {t.metric && (
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', tone.chipBg, tone.chipFg)}>
                        {t.metric}
                      </span>
                    )}
                  </div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/30 p-4 text-center text-xs text-muted-foreground">
        <Sparkles className="mx-auto mb-1.5 h-4 w-4 text-primary" />
        Plus d&apos;intégrations à venir — chatbots, email transactionnel, Google Sheets export…
      </div>
    </div>
  );
}
