'use client';

/**
 * Store hub — landing page for one store. Replaces the previous 1700-line
 * monolithic settings form with a grid of action cards that link to focused
 * sub-pages (/info, /appearance, /sections, /checkout, /delivery). Keeps
 * only the quick "publish toggle" inline because it's the most-used action.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Cloud,
  Eye,
  ExternalLink,
  ImageIcon,
  Layers,
  Package,
  Palette,
  Settings as SettingsIcon,
  Truck,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { storesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { StoreType } from '@/components/dashboard/store-editor';

interface HubCard {
  href: string;
  icon: typeof SettingsIcon;
  title: string;
  description: string;
  /** Color theme of the card chip. */
  tone: 'indigo' | 'violet' | 'amber' | 'emerald' | 'rose' | 'sky';
  /** Hide on digital stores. */
  physicalOnly?: boolean;
}

const HUB_CARDS: HubCard[] = [
  {
    href: 'info',
    icon: SettingsIcon,
    title: 'Informations',
    description: 'Nom, description, langue, devise, pays, domaine personnalisé.',
    tone: 'indigo',
  },
  {
    href: 'appearance',
    icon: Palette,
    title: 'Apparence',
    description: 'Thème, logo, favicon — la signature visuelle de la boutique.',
    tone: 'violet',
  },
  {
    href: 'sections',
    icon: Layers,
    title: 'Sections vitrine',
    description: 'Navbar, hero, slider, témoignages, footer — la composition de la page d\'accueil.',
    tone: 'amber',
  },
  {
    href: 'checkout',
    icon: Wallet,
    title: 'Formulaire COD',
    description: 'Champs et textes du formulaire « paiement à la livraison ».',
    tone: 'emerald',
    physicalOnly: true,
  },
  {
    href: 'delivery',
    icon: Truck,
    title: 'Livraison',
    description: 'Intégration MogaDelivery, adresse d\'expédition, auto-dispatch.',
    tone: 'rose',
    physicalOnly: true,
  },
];

const TONE_CLASSES: Record<HubCard['tone'], { chip: string; iconBg: string; glow: string }> = {
  indigo:  { chip: 'bg-indigo-500/10 text-indigo-700',   iconBg: 'from-indigo-500 to-violet-600',    glow: 'shadow-indigo-500/30' },
  violet:  { chip: 'bg-violet-500/10 text-violet-700',   iconBg: 'from-violet-500 to-fuchsia-600',   glow: 'shadow-violet-500/30' },
  amber:   { chip: 'bg-amber-500/10 text-amber-700',     iconBg: 'from-amber-500 to-orange-600',     glow: 'shadow-amber-500/30' },
  emerald: { chip: 'bg-emerald-500/10 text-emerald-700', iconBg: 'from-emerald-500 to-teal-600',     glow: 'shadow-emerald-500/30' },
  rose:    { chip: 'bg-rose-500/10 text-rose-700',       iconBg: 'from-rose-500 to-pink-600',        glow: 'shadow-rose-500/30' },
  sky:     { chip: 'bg-sky-500/10 text-sky-700',         iconBg: 'from-sky-500 to-blue-600',         glow: 'shadow-sky-500/30' },
};

export default function StoreHubPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const [store, setStore] = useState<StoreType | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingPublish, setTogglingPublish] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    storesApi
      .get(storeId)
      .then((res) => setStore((res.data as { store: StoreType }).store))
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, [storeId]);

  async function togglePublish() {
    if (!store) return;
    setTogglingPublish(true);
    try {
      await storesApi.update(storeId, { isPublished: !store.isPublished });
      setStore({ ...store, isPublished: !store.isPublished });
    } finally {
      setTogglingPublish(false);
    }
  }

  if (loading || !store) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  const isDigital = store.storeType === 'digital';
  const visibleCards = HUB_CARDS.filter((c) => !(c.physicalOnly && isDigital));
  const StoreIcon = isDigital ? Cloud : Package;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/stores')} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Boutiques
          </Button>
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                'grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md',
                isDigital ? 'from-fuchsia-500 to-pink-600 shadow-fuchsia-500/30' : 'from-indigo-500 to-violet-600 shadow-indigo-500/30'
              )}
            >
              <StoreIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{store.name}</h1>
              <p className="text-sm text-muted-foreground">/{store.slug}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/store/${store.slug}`} target="_blank" rel="noopener">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              Voir la boutique
            </Button>
          </Link>
          <Link href={`/dashboard/products?storeId=${store._id}`}>
            <Button size="sm" className="gap-1.5 gradient-brand text-white">
              <Package className="h-3.5 w-3.5" />
              Produits
            </Button>
          </Link>
        </div>
      </div>

      {/* Publish state */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4',
          store.isPublished
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-amber-500/30 bg-amber-500/5'
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-full',
              store.isPublished ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'
            )}
          >
            <Eye className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">{store.isPublished ? 'Boutique en ligne' : 'Boutique en brouillon'}</p>
            <p className="text-xs text-muted-foreground">
              {store.isPublished
                ? 'Visible par tes clients à l\'adresse ci-dessus.'
                : 'Coche pour mettre la boutique en ligne et la rendre visible publiquement.'}
            </p>
          </div>
        </div>
        <Button
          variant={store.isPublished ? 'outline' : 'default'}
          size="sm"
          onClick={togglePublish}
          disabled={togglingPublish}
          className={cn(
            'gap-1.5',
            !store.isPublished && 'gradient-brand text-white'
          )}
        >
          {togglingPublish ? '...' : store.isPublished ? 'Mettre hors ligne' : 'Publier la boutique'}
        </Button>
      </div>

      {/* Sub-page cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCards.map((c) => {
          const Icon = c.icon;
          const tone = TONE_CLASSES[c.tone];
          return (
            <Link
              key={c.href}
              href={`/dashboard/stores/${storeId}/${c.href}`}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl"
            >
              <div
                className={cn('pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-25', tone.iconBg)}
                aria-hidden
              />
              <div className="relative flex items-start gap-3">
                <div className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md', tone.iconBg, tone.glow)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold tracking-tight">{c.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{c.description}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Ouvrir <ArrowLeft className="h-3 w-3 rotate-180" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick stats footer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <span className="inline-flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Aperçu visuel
            </span>
          </CardTitle>
          <CardDescription className="text-xs">
            Le logo, le thème et les sections de la vitrine ci-dessous tels que les voient tes clients.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/30">
            <iframe
              src={`/store/${store.slug}`}
              title="Aperçu de la boutique"
              className="h-[420px] w-full"
              loading="lazy"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
