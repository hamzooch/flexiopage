'use client';

import { useEffect, useState } from 'react';
import { storesApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useStoreStore } from '@/stores/store-store';
import { formatCurrency, cn } from '@/lib/utils';
import {
  Store,
  Package,
  ShoppingCart,
  TrendingUp,
  ArrowUpRight,
  Sparkles,
  Plus,
  FileText,
  Rocket,
  ChevronRight,
  Cloud,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface StoreType {
  _id: string;
  name: string;
  slug: string;
  isPublished?: boolean;
  storeType?: 'physical' | 'digital';
}

type Stat = {
  label: string;
  value: string;
  change?: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  iconTint: string;
};

export default function DashboardOverviewPage() {
  const user = useAuthStore((s) => s.user);
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const setCurrentStore = useStoreStore((s) => s.setCurrentStore);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storesApi
      .list()
      .then((res) => {
        const list = (res.data as { stores: StoreType[] }).stores || [];
        setStores(list);
        // If the global active store was deleted (or never set) but the seller
        // has at least one store, default to the first one so downstream
        // pages have something to query against.
        if (!currentStoreId && list[0]) setCurrentStore(list[0]._id);
      })
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeStore = stores.find((s) => s._id === currentStoreId) || stores[0];
  const firstStore = stores[0];
  const storeCount = stores.length;

  const stats: Stat[] = [
    {
      label: 'Stores',
      value: loading ? '—' : String(storeCount),
      change: storeCount ? `${storeCount} active` : 'Get started',
      icon: Store,
      tint: 'from-indigo-500/10 to-violet-500/10',
      iconTint: 'bg-indigo-500/15 text-indigo-600',
    },
    {
      label: 'Products',
      value: '—',
      change: 'Select a store',
      icon: Package,
      tint: 'from-fuchsia-500/10 to-pink-500/10',
      iconTint: 'bg-fuchsia-500/15 text-fuchsia-600',
    },
    {
      label: 'Orders',
      value: '—',
      change: 'No data yet',
      icon: ShoppingCart,
      tint: 'from-amber-500/10 to-orange-500/10',
      iconTint: 'bg-amber-500/15 text-amber-600',
    },
    {
      label: 'Revenue',
      value: formatCurrency(0),
      change: 'Last 30 days',
      icon: TrendingUp,
      tint: 'from-emerald-500/10 to-teal-500/10',
      iconTint: 'bg-emerald-500/15 text-emerald-600',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Hero greeting */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 sm:p-8 animate-fade-in-up">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full gradient-brand opacity-10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-3xl" aria-hidden />

        <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              All systems operational
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Welcome back,{' '}
              <span className="gradient-brand-text">{user?.name?.split(' ')[0] || 'there'}</span>
            </h1>
            {activeStore ? (
              <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
                Boutique active :{' '}
                <Link href="/dashboard/profile#stores" className="font-semibold text-foreground underline-offset-4 hover:underline">
                  {activeStore.name}
                </Link>
                {' '}·{' '}
                <Link href="/select-store" className="text-primary hover:underline">
                  Changer
                </Link>
              </p>
            ) : (
              <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
                Build, sell, and grow — all in one place.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard/profile?create=1">
              <Button className="h-11 gap-2 rounded-xl gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-95 hover:shadow-xl hover:shadow-primary/30 transition-all">
                <Plus className="h-4 w-4" />
                New store
              </Button>
            </Link>
            <Link href="/dashboard/pages">
              <Button variant="outline" className="h-11 gap-2 rounded-xl">
                <Sparkles className="h-4 w-4 text-fuchsia-500" />
                AI page
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stat cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            style={{ animationDelay: `${i * 70}ms` }}
            className={cn(
              'group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 animate-fade-in-up',
              'transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5'
            )}
          >
            <div
              className={cn(
                'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100',
                s.tint
              )}
              aria-hidden
            />
            <div className="relative flex items-start justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </div>
                <div className="mt-2 text-3xl font-bold tracking-tight">{s.value}</div>
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowUpRight className="h-3 w-3" />
                  {s.change}
                </div>
              </div>
              <div
                className={cn(
                  'grid h-11 w-11 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3',
                  s.iconTint
                )}
              >
                <s.icon className="h-[18px] w-[18px]" />
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Quick actions + Stores */}
      <section className="grid gap-6 lg:grid-cols-3">
        <div
          className="lg:col-span-2 overflow-hidden rounded-2xl border border-border/60 bg-card animate-fade-in-up"
          style={{ animationDelay: '300ms' }}
        >
          <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold">Your stores</h2>
              <p className="text-xs text-muted-foreground">Manage and switch between storefronts</p>
            </div>
            <Link href="/dashboard/profile#stores">
              <Button variant="ghost" size="sm" className="gap-1 rounded-lg text-xs">
                View all
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
          <div className="divide-y divide-border/60">
            {loading ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-6 py-4">
                  <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted/70" />
                  </div>
                </div>
              ))
            ) : stores.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-muted">
                  <Store className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No stores yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create your first store to start selling.
                </p>
                <Link href="/dashboard/profile?create=1" className="mt-4 inline-block">
                  <Button size="sm" className="gradient-brand text-white">
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Create store
                  </Button>
                </Link>
              </div>
            ) : (
              stores.slice(0, 5).map((s) => {
                const isDigital = s.storeType === 'digital';
                const TypeIcon = isDigital ? Cloud : Package;
                return (
                  <Link
                    key={s._id}
                    href="/dashboard/profile#stores"
                    className="group flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-muted/40"
                  >
                    <div
                      className={cn(
                        'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-sm font-semibold text-white shadow-md',
                        isDigital
                          ? 'from-fuchsia-500 to-pink-600 shadow-fuchsia-500/30'
                          : 'from-indigo-500 to-violet-600 shadow-indigo-500/30'
                      )}
                    >
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{s.name}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate">/{s.slug}</span>
                        {s.storeType && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className={cn(isDigital ? 'text-fuchsia-600' : 'text-indigo-600')}>
                              {isDigital ? 'Digital' : 'Physical'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        s.isPublished
                          ? 'bg-emerald-500/10 text-emerald-700'
                          : 'bg-amber-500/10 text-amber-700'
                      )}
                    >
                      {s.isPublished ? 'Live' : 'Draft'}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Get started card */}
        <div
          className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 animate-fade-in-up"
          style={{ animationDelay: '400ms' }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full gradient-brand opacity-10 blur-2xl" aria-hidden />
          <div className="relative space-y-4">
            <div className="grid h-11 w-11 place-items-center rounded-xl gradient-brand text-white shadow-lg shadow-primary/25 animate-float">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Get started</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Three steps to launch your storefront.
              </p>
            </div>

            <ol className="space-y-2">
              {[
                { label: 'Create a store', href: '/dashboard/profile?create=1', icon: Store, done: !!firstStore },
                { label: 'Add products', href: '/dashboard/products', icon: Package, done: false },
                { label: 'Build a landing page', href: '/dashboard/pages', icon: FileText, done: false },
              ].map((step, i) => (
                <li key={step.label}>
                  <Link
                    href={step.href}
                    className="group flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
                  >
                    <div
                      className={cn(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-semibold',
                        step.done
                          ? 'bg-emerald-500/15 text-emerald-700'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {step.done ? '✓' : i + 1}
                    </div>
                    <span className="flex-1 text-sm">{step.label}</span>
                    <step.icon className="h-4 w-4 text-muted-foreground transition-transform group-hover:scale-110" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
