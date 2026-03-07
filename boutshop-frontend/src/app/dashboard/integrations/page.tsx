'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Search,
  Plug,
  AppWindow,
  Truck,
  Warehouse,
  Check,
  ArrowRight,
  CreditCard,
  Mail,
  BarChart3,
  Facebook,
  Instagram,
  ShoppingBag,
  PackageCheck,
  Boxes,
  Globe2,
} from 'lucide-react';

type TabId = 'apps' | 'shipping' | 'logistics';

type Integration = {
  id: string;
  name: string;
  description: string;
  category?: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Optional logo image src (overrides the icon). Place file under /public. */
  logo?: string;
  /** Tailwind bg class used as background when a logo is shown (no gradient). */
  logoBg?: string;
  accent: string;
  glow: string;
  connected?: boolean;
};

const APPS: Integration[] = [
  { id: 'stripe', name: 'Stripe', description: 'Accept credit cards, Apple Pay and SEPA.', category: 'Payments', icon: CreditCard, accent: 'from-indigo-500 to-violet-600', glow: 'shadow-indigo-500/25', connected: true },
  { id: 'paypal', name: 'PayPal', description: 'Let customers pay with their PayPal balance.', category: 'Payments', icon: CreditCard, accent: 'from-blue-500 to-sky-600', glow: 'shadow-blue-500/25' },
  { id: 'mailchimp', name: 'Mailchimp', description: 'Sync customers and send email campaigns.', category: 'Marketing', icon: Mail, accent: 'from-amber-500 to-orange-600', glow: 'shadow-amber-500/25' },
  { id: 'klaviyo', name: 'Klaviyo', description: 'Automated email and SMS for ecommerce.', category: 'Marketing', icon: Mail, accent: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/25' },
  { id: 'ga4', name: 'Google Analytics', description: 'Track traffic, conversions and revenue.', category: 'Analytics', icon: BarChart3, accent: 'from-yellow-500 to-amber-600', glow: 'shadow-yellow-500/25' },
  { id: 'meta-pixel', name: 'Meta Pixel', description: 'Track Facebook & Instagram ad conversions.', category: 'Analytics', icon: Facebook, accent: 'from-blue-600 to-indigo-600', glow: 'shadow-blue-500/25' },
  { id: 'instagram', name: 'Instagram Shop', description: 'Tag and sell products from your feed.', category: 'Sales channels', icon: Instagram, accent: 'from-fuchsia-500 to-pink-600', glow: 'shadow-fuchsia-500/25' },
  { id: 'tiktok', name: 'TikTok Shop', description: 'Reach Gen Z with native commerce.', category: 'Sales channels', icon: ShoppingBag, accent: 'from-rose-500 to-pink-600', glow: 'shadow-rose-500/25' },
];

const SHIPPING: Integration[] = [
  { id: 'dhl', name: 'DHL Express', description: 'International express shipping in 220+ countries.', category: 'International', icon: Truck, accent: 'from-yellow-500 to-amber-600', glow: 'shadow-yellow-500/25', connected: true },
  { id: 'fedex', name: 'FedEx', description: 'Reliable express and ground services.', category: 'International', icon: Truck, accent: 'from-purple-500 to-violet-600', glow: 'shadow-purple-500/25' },
  { id: 'ups', name: 'UPS', description: 'Worldwide delivery with tracking.', category: 'International', icon: Truck, accent: 'from-amber-700 to-yellow-700', glow: 'shadow-amber-500/25' },
  { id: 'aramex', name: 'Aramex', description: 'Strong coverage in MENA and Asia.', category: 'Regional', icon: Truck, accent: 'from-red-500 to-rose-600', glow: 'shadow-red-500/25' },
  { id: 'colissimo', name: 'Colissimo', description: 'La Poste parcel service for France & EU.', category: 'Regional', icon: Truck, accent: 'from-amber-500 to-yellow-600', glow: 'shadow-amber-500/25' },
  { id: 'chronopost', name: 'Chronopost', description: 'Express delivery in France and Europe.', category: 'Regional', icon: Truck, accent: 'from-slate-700 to-zinc-800', glow: 'shadow-slate-500/25' },
  { id: 'mondial', name: 'Mondial Relay', description: 'Pickup-point parcel delivery network.', category: 'Pickup', icon: Truck, accent: 'from-rose-500 to-red-600', glow: 'shadow-rose-500/25' },
  { id: 'tnt', name: 'TNT', description: 'European express freight specialist.', category: 'International', icon: Truck, accent: 'from-orange-500 to-amber-600', glow: 'shadow-orange-500/25' },
];

const LOGISTICS: Integration[] = [
  { id: 'moga-delivery', name: 'Moga Delivery', description: 'Last-mile scooter delivery network — fast and local.', category: 'Last-mile', icon: Warehouse, logo: '/integrations/moga-delivery.png', logoBg: 'bg-white', accent: 'from-emerald-500 to-orange-500', glow: 'shadow-emerald-500/25' },
  { id: 'shipbob', name: 'ShipBob', description: 'Global 3PL with US, EU, AU, CA fulfillment.', category: 'Fulfillment', icon: Warehouse, accent: 'from-emerald-500 to-teal-600', glow: 'shadow-emerald-500/25', connected: true },
  { id: 'cubyn', name: 'Cubyn', description: 'European 3PL focused on speed and SLA.', category: 'Fulfillment', icon: Warehouse, accent: 'from-cyan-500 to-blue-600', glow: 'shadow-cyan-500/25' },
  { id: 'amazon-mcf', name: 'Amazon MCF', description: 'Use Amazon FBA inventory for non-Amazon orders.', category: 'Fulfillment', icon: Boxes, accent: 'from-amber-500 to-orange-600', glow: 'shadow-amber-500/25' },
  { id: 'shopify-fulfillment', name: 'Shopify Fulfillment', description: 'Two-day delivery network in North America.', category: 'Fulfillment', icon: PackageCheck, accent: 'from-emerald-500 to-green-600', glow: 'shadow-emerald-500/25' },
  { id: 'boxtal', name: 'Boxtal', description: 'Multi-carrier shipping aggregator.', category: 'Multi-carrier', icon: Globe2, accent: 'from-indigo-500 to-blue-600', glow: 'shadow-indigo-500/25' },
  { id: 'sendcloud', name: 'Sendcloud', description: 'Shipping platform for European ecommerce.', category: 'Multi-carrier', icon: Globe2, accent: 'from-blue-500 to-indigo-600', glow: 'shadow-blue-500/25' },
  { id: 'easyship', name: 'Easyship', description: 'Compare 250+ couriers worldwide.', category: 'Multi-carrier', icon: Globe2, accent: 'from-sky-500 to-cyan-600', glow: 'shadow-sky-500/25' },
];

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; count: number }[] = [
  { id: 'apps', label: 'Applications', icon: AppWindow, count: APPS.length },
  { id: 'shipping', label: 'Shipping', icon: Truck, count: SHIPPING.length },
  { id: 'logistics', label: 'Logistics', icon: Warehouse, count: LOGISTICS.length },
];

export default function IntegrationsPage() {
  const [tab, setTab] = useState<TabId>('apps');
  const [query, setQuery] = useState('');

  const data = tab === 'apps' ? APPS : tab === 'shipping' ? SHIPPING : LOGISTICS;
  const filtered = query.trim()
    ? data.filter(
        (i) =>
          i.name.toLowerCase().includes(query.toLowerCase()) ||
          i.description.toLowerCase().includes(query.toLowerCase()) ||
          (i.category || '').toLowerCase().includes(query.toLowerCase())
      )
    : data;

  const connectedCount = data.filter((i) => i.connected).length;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card p-6 sm:p-8 animate-fade-in-up">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full gradient-brand opacity-10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-3xl" aria-hidden />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <Plug className="h-3 w-3" />
              Marketplace
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Power up with <span className="gradient-brand-text">integrations</span>
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground sm:text-base">
              Connect payments, marketing tools, shipping carriers and logistics partners to your stores.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <StatPill label="Apps" value={APPS.length} />
            <StatPill label="Carriers" value={SHIPPING.length} />
            <StatPill label="3PL" value={LOGISTICS.length} />
          </div>
        </div>
      </section>

      {/* Tabs + search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" className="relative inline-flex rounded-2xl border border-border/60 bg-card p-1 shadow-sm">
          {TABS.map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-200 sm:px-4',
                  isActive ? 'text-white' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {isActive && (
                  <span className="absolute inset-0 -z-10 rounded-xl gradient-brand shadow-md shadow-primary/30 animate-scale-in" />
                )}
                <t.icon className="h-4 w-4" />
                <span>{t.label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search integrations..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 rounded-xl pl-10"
            />
          </div>
          <span className="hidden whitespace-nowrap rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 sm:inline-flex">
            {connectedCount} connected
          </span>
        </div>
      </div>

      {/* Grid */}
      <section
        key={tab}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-fade-in"
      >
        {filtered.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-border/70 bg-card p-12 text-center text-sm text-muted-foreground">
            No integrations match "{query}".
          </div>
        ) : (
          filtered.map((integ, i) => (
            <IntegrationCard key={integ.id} integration={integ} delay={i * 50} />
          ))
        )}
      </section>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2.5 text-center backdrop-blur">
      <div className="text-xl font-bold tracking-tight">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function IntegrationCard({ integration, delay }: { integration: Integration; delay: number }) {
  const Icon = integration.icon;
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl animate-fade-in-up"
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-15 blur-2xl transition-opacity duration-300 group-hover:opacity-30',
          integration.accent
        )}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        {integration.logo ? (
          <div
            className={cn(
              'grid h-12 w-12 place-items-center overflow-hidden rounded-2xl shadow-md ring-1 ring-border/50 transition-transform duration-300 group-hover:scale-110',
              integration.logoBg || 'bg-white'
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={integration.logo} alt={`${integration.name} logo`} className="h-full w-full object-contain" />
          </div>
        ) : (
          <div
            className={cn(
              'grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3',
              integration.accent,
              integration.glow
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        )}
        {integration.connected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <Check className="h-3 w-3" strokeWidth={3} />
            Connected
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            Available
          </span>
        )}
      </div>

      <div className="relative mt-4">
        <h3 className="text-base font-semibold tracking-tight">{integration.name}</h3>
        {integration.category && (
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {integration.category}
          </p>
        )}
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{integration.description}</p>
      </div>

      <div className="relative mt-5">
        {integration.connected ? (
          <Button variant="outline" size="sm" className="w-full justify-between rounded-xl">
            Manage
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Button>
        ) : (
          <Button size="sm" className="w-full justify-between rounded-xl gradient-brand text-white">
            Connect
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
