'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Globe2,
  Mail,
  RefreshCcw,
  RotateCcw,
  ShoppingCart,
  Store,
  TrendingUp,
  User,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminApi, extractApiError, type AdminDeliveryDiag } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, storeAbsoluteUrl } from '@/lib/utils';
import { Percent, Save, Loader2, Truck, XCircle, AlertTriangle } from 'lucide-react';
import { KpiCard } from '@/components/charts/KpiCard';
import { RangeSwitcher } from '@/components/charts/RangeSwitcher';
import { RevenueAreaChart } from '@/components/charts/RevenueAreaChart';
import { PaymentDonutChart } from '@/components/charts/PaymentDonutChart';
import { FunnelChart } from '@/components/charts/FunnelChart';
import { TopProductsList } from '@/components/charts/TopProductsList';
import { RecentOrdersPanel } from '@/components/charts/RecentOrdersPanel';
import type { AdminStoreDrilldown } from '@/types/admin-analytics';
import type { RangeKey } from '@/types/analytics';

export default function AdminStoreDrilldownPage() {
  const params = useParams<{ storeId: string }>();
  const storeId = params?.storeId;
  const [range, setRange] = useState<RangeKey>('30d');
  const [data, setData] = useState<AdminStoreDrilldown | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    adminApi
      .storeDrilldown(storeId, range)
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [storeId, range]);

  async function refresh() {
    if (!storeId) return;
    setRefreshing(true);
    try {
      const res = await adminApi.storeDrilldown(storeId, range);
      setData(res.data);
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-[120px] animate-pulse rounded-3xl border border-border/60 bg-card" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[110px] animate-pulse rounded-2xl border border-border/60 bg-card" />
          ))}
        </div>
        <div className="h-[380px] animate-pulse rounded-xl border border-border/60 bg-card" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-muted-foreground">Boutique introuvable ou erreur de chargement.</p>
          <Link
            href="/admin/stores"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-card px-4 py-2 text-sm font-semibold transition hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
        </CardContent>
      </Card>
    );
  }

  const { store, analytics } = data;
  const currency = analytics.currency;
  const monthly = range === '12m';
  const owner = typeof store.owner === 'object' ? store.owner : null;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Back link */}
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Retour à la vue plateforme
      </Link>

      {/* Store header */}
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 sm:rounded-3xl sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gradient-to-br from-rose-500/15 via-amber-500/10 to-transparent blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start">
          <div className="flex items-start gap-3 sm:gap-4">
            {store.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-1 ring-border/60 sm:h-16 sm:w-16" />
            ) : (
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-rose-500/15 to-amber-500/10 text-rose-700 sm:h-16 sm:w-16">
                <Store className="h-6 w-6 sm:h-7 sm:w-7" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="break-words text-xl font-bold tracking-tight sm:text-2xl">{store.name}</h1>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  store.isPublished ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'
                }`}>
                  {store.isPublished ? 'Publiée' : 'Brouillon'}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {store.storeType === 'digital' ? 'Digital' : 'Physique'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:text-xs">
                {owner && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <User className="h-3 w-3 shrink-0" />
                    <Link href={`/admin/users/${owner._id}`} className="truncate font-medium hover:text-foreground hover:underline">
                      {owner.name || owner.email}
                    </Link>
                  </span>
                )}
                {owner?.email && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{owner.email}</span>
                  </span>
                )}
                {store.settings?.country && (
                  <span className="inline-flex items-center gap-1">
                    <Globe2 className="h-3 w-3" /> {store.settings.country}
                  </span>
                )}
                <span className="hidden sm:inline">·</span>
                <span>{currency}</span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">Créée le {new Date(store.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  href={storeAbsoluteUrl(store.slug)}
                  target="_blank"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 text-[11px] font-semibold transition hover:bg-muted sm:px-3 sm:text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Voir la boutique
                </Link>
                {owner && (
                  <Link
                    href={`/admin/users/${owner._id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-card px-2.5 text-[11px] font-semibold transition hover:bg-muted sm:px-3 sm:text-xs"
                  >
                    <User className="h-3.5 w-3.5" /> Propriétaire
                  </Link>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 lg:ml-auto">
            <RangeSwitcher value={range} onChange={setRange} />
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-card px-2.5 text-xs font-semibold shadow-sm transition-colors hover:bg-muted disabled:opacity-50 sm:px-3"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
          </div>
        </div>
      </section>

      {/* Commission override (superadmin/owner only) */}
      <CommissionCard
        storeId={store._id}
        storeName={store.name}
        currency={currency}
        initial={store.commission}
        onSaved={(c) => setData((d) => (d ? { ...d, store: { ...d.store, commission: c } } : d))}
      />

      {/* Diagnostic MogaDelivery */}
      <DeliveryDiagCard storeId={store._id} />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <KpiCard
          label="Revenu"
          value={formatCurrency(analytics.kpis.revenue.value, currency)}
          delta={analytics.kpis.revenue.deltaPct}
          icon={DollarSign}
          accent="pink"
          hint="vs période précédente"
        />
        <KpiCard
          label="Commandes payées"
          value={String(analytics.kpis.paidOrders.value)}
          delta={analytics.kpis.paidOrders.deltaPct}
          icon={ShoppingCart}
          accent="violet"
        />
        <KpiCard
          label="Panier moyen"
          value={formatCurrency(analytics.kpis.averageOrderValue.value, currency)}
          delta={analytics.kpis.averageOrderValue.deltaPct}
          icon={TrendingUp}
          accent="emerald"
        />
        <KpiCard
          label="Clients uniques"
          value={String(analytics.kpis.uniqueCustomers.value)}
          delta={analytics.kpis.uniqueCustomers.deltaPct}
          icon={Users}
          accent="sky"
        />
        <KpiCard
          label="Commandes totales"
          value={String(analytics.kpis.orders.value)}
          delta={analytics.kpis.orders.deltaPct}
          icon={BarChart3}
          accent="slate"
        />
        <KpiCard
          label="Taux de livraison"
          value={`${analytics.kpis.fulfillmentRate.value.toFixed(1)}%`}
          delta={analytics.kpis.fulfillmentRate.deltaPct}
          icon={CheckCircle2}
          accent="emerald"
        />
        <KpiCard
          label="Taux de remboursement"
          value={`${analytics.kpis.refundRate.value.toFixed(1)}%`}
          delta={analytics.kpis.refundRate.deltaPct}
          invertDelta
          icon={RotateCcw}
          accent="amber"
        />
        <KpiCard
          label="Paiements en attente"
          value={String(analytics.kpis.pendingOrders.value)}
          icon={Clock}
          accent="amber"
        />
      </div>

      {/* Revenue chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base"><Activity className="h-4 w-4 shrink-0" /> Revenu &amp; commandes</CardTitle>
          <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
            {monthly ? 'Mensuel' : 'Quotidien'} ·{' '}
            {new Date(analytics.window.from).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} →{' '}
            {new Date(analytics.window.to).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          <RevenueAreaChart data={analytics.timeseries} currency={currency} monthly={monthly} />
        </CardContent>
      </Card>

      {/* Top products + funnel */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Top produits</CardTitle>
          </CardHeader>
          <CardContent>
            <TopProductsList products={analytics.topProducts} currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Tunnel de conversion</CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelChart funnel={analytics.funnel} />
          </CardContent>
        </Card>
      </div>

      {/* Payment + Recent */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Méthodes de paiement</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentDonutChart data={analytics.paymentBreakdown} currency={currency} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Commandes récentes</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentOrdersPanel orders={analytics.recentOrders} />
          </CardContent>
        </Card>
      </div>

      {/* Totals footer */}
      <Card className="bg-gradient-to-br from-rose-500/5 via-amber-500/5 to-transparent">
        <CardContent className="grid grid-cols-1 gap-4 py-5 sm:grid-cols-3 sm:py-6">
          <FooterStat label="Revenu total (depuis création)" value={formatCurrency(analytics.totals.totalRevenue, currency)} />
          <FooterStat label="Commandes totales" value={String(analytics.totals.totalOrders)} />
          <FooterStat label="Clients totaux" value={String(analytics.totals.totalCustomers)} />
        </CardContent>
      </Card>
    </div>
  );
}

function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">{label}</div>
      <div className="mt-1 break-words text-lg font-bold sm:text-xl">{value}</div>
    </div>
  );
}

/**
 * Carte d'édition de la commission spécifique à cette store. Seuls superadmin
 * et owner peuvent y écrire (l'API renverra 403 sinon). On affiche l'état
 * actuel + un bandeau "défaut" quand aucun override n'est posé.
 */
function CommissionCard({
  storeId,
  storeName,
  currency,
  initial,
  onSaved,
}: {
  storeId: string;
  storeName: string;
  currency: string;
  initial?: { rate?: number; cap?: number };
  onSaved: (c?: { rate?: number; cap?: number }) => void;
}) {
  const me = useAuthStore((s) => s.user);
  const canEdit = me?.role === 'superadmin' || me?.role === 'owner';
  const [ratePct, setRatePct] = useState(initial?.rate != null ? (initial.rate * 100).toString() : '');
  const [cap, setCap] = useState(initial?.cap != null ? initial.cap.toString() : '');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const hasOverride = initial?.rate != null || initial?.cap != null;

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const data: { rate?: number | null; cap?: number | null } = {};
      const rateNum = ratePct.trim() === '' ? null : Number(ratePct) / 100;
      const capNum = cap.trim() === '' ? null : Number(cap);
      if (rateNum !== null && (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 1)) {
        setFeedback({ kind: 'error', text: 'Taux invalide (0–100 %).' });
        setSaving(false);
        return;
      }
      if (capNum !== null && (!Number.isFinite(capNum) || capNum < 0)) {
        setFeedback({ kind: 'error', text: 'Plafond invalide.' });
        setSaving(false);
        return;
      }
      data.rate = rateNum;
      data.cap = capNum;
      const res = await adminApi.setStoreCommission(storeId, data);
      const c = res.data.store.commission;
      onSaved(c);
      setFeedback({ kind: 'success', text: 'Commission mise à jour.' });
    } catch (err) {
      setFeedback({ kind: 'error', text: extractApiError(err, 'Échec de la sauvegarde.') });
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!confirm('Effacer l\'override et revenir à la politique globale ?')) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await adminApi.setStoreCommission(storeId, { rate: null, cap: null });
      const c = res.data.store.commission;
      onSaved(c);
      setRatePct(''); setCap('');
      setFeedback({ kind: 'success', text: 'Override supprimé.' });
    } catch (err) {
      setFeedback({ kind: 'error', text: extractApiError(err, 'Échec de la suppression.') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <Percent className="h-4 w-4 text-rose-600" />
          Commission {storeName}
        </CardTitle>
        <p className="text-[11px] text-muted-foreground sm:text-xs">
          {hasOverride
            ? `Override actif · taux ${(initial!.rate ?? 0) * 100}%, plafond ${initial!.cap ?? '∞'} ${currency}`
            : 'Aucun override — utilise la politique globale (COMMISSION_RATE / COMMISSION_CAP).'}
        </p>
      </CardHeader>
      <CardContent>
        {!canEdit ? (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Lecture seule — seul un superadmin/owner peut modifier la commission.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-[1fr,1fr,auto] sm:items-end">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Taux (%)</label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={ratePct}
                  onChange={(e) => setRatePct(e.target.value)}
                  placeholder="ex. 2.5 (vide = défaut)"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Plafond ({currency})</label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  placeholder="ex. 2000 (vide = défaut)"
                />
              </div>
              <div className="flex gap-2 sm:justify-end">
                <Button onClick={save} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Enregistrer
                </Button>
                {hasOverride && (
                  <Button variant="outline" onClick={reset} disabled={saving}>
                    Effacer
                  </Button>
                )}
              </div>
            </div>
            {feedback && (
              <p
                className={`mt-2 rounded-md px-3 py-1.5 text-xs ${
                  feedback.kind === 'success' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'
                }`}
              >
                {feedback.text}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Carte diagnostic MogaDelivery — affiche markets[] et integrations.delivery
 * pour cette boutique avec secrets masqués. Permet de comprendre d'un coup
 * d'œil pourquoi le dispatch renvoie 401 (secret manquant, storeIdMD vide,
 * env utilisée en fallback, etc.).
 */
function DeliveryDiagCard({ storeId }: { storeId: string }) {
  const [data, setData] = useState<AdminDeliveryDiag | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.getStoreDeliveryConfig(storeId);
      setData(res.data);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  // Diagnostic synthétique : "OK", "warning" ou "ko" + message.
  const verdict = (() => {
    if (!data) return null;
    const marketsMD = data.markets.filter((m) => m.delivery?.provider === 'mogadelivery' && m.delivery?.enabled !== false);
    const marketReady = marketsMD.filter((m) => m.delivery?.storeIdMD && m.delivery?.webhookSecret);
    const legacy = data.integrations.delivery;
    if (marketReady.length > 0) {
      return { kind: 'ok' as const, text: `${marketReady.length} marché(s) MD prêt(s). Dispatch via marché.` };
    }
    if (marketsMD.length > 0 && marketReady.length === 0) {
      return {
        kind: 'ko' as const,
        text: `${marketsMD.length} marché(s) MD activé(s) mais storeIdMD ou webhookSecret manquant. Le dispatch va planter.`,
      };
    }
    if (legacy?.enabled && legacy.webhookSecret) {
      return { kind: 'ok' as const, text: 'Config legacy mono-pays valide.' };
    }
    if (legacy?.enabled && !legacy.webhookSecret) {
      return { kind: 'ko' as const, text: 'Integration delivery activée mais webhookSecret vide → 401 garanti.' };
    }
    return { kind: 'warn' as const, text: 'Aucune config MD trouvée (ni markets, ni integrations.delivery).' };
  })();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Truck className="h-4 w-4 text-rose-600" />
              Diagnostic MogaDelivery
            </CardTitle>
            <p className="text-[11px] text-muted-foreground sm:text-xs">
              Vérifie la config delivery (secrets masqués) — utile en cas de 401 au dispatch.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {open ? 'Rafraîchir' : 'Vérifier'}
          </Button>
        </div>
      </CardHeader>
      {open && data && (
        <CardContent className="space-y-3">
          {verdict && (
            <div
              className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
                verdict.kind === 'ok'
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : verdict.kind === 'ko'
                    ? 'bg-rose-500/10 text-rose-700'
                    : 'bg-amber-500/10 text-amber-700'
              }`}
            >
              {verdict.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                : verdict.kind === 'ko' ? <XCircle className="h-3.5 w-3.5 shrink-0" />
                  : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
              <span>{verdict.text}</span>
            </div>
          )}

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Markets ({data.markets.length})</div>
            {data.markets.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">Aucun marché configuré — la boutique est en mode legacy mono-pays.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {data.markets.map((m) => (
                  <li key={m.country} className="rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="font-semibold">{m.country} · {m.currency}</span>
                      {m.isDefault && <span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-700">défaut</span>}
                      {m.enabled === false && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">désactivé</span>}
                    </div>
                    {m.delivery ? (
                      <div className="mt-1 grid gap-x-3 gap-y-0.5 text-[11px] font-mono text-muted-foreground sm:grid-cols-[auto_1fr]">
                        <span>provider</span><span>{m.delivery.provider || '—'}</span>
                        <span>storeIdMD</span><span className={!m.delivery.storeIdMD ? 'text-rose-700' : ''}>{m.delivery.storeIdMD || '⚠ vide'}</span>
                        <span>webhookSecret</span><span className={!m.delivery.webhookSecret ? 'text-rose-700' : ''}>{m.delivery.webhookSecret || '⚠ vide'}</span>
                        {m.delivery.boutiqueIdMD && (<><span>boutiqueIdMD</span><span>{m.delivery.boutiqueIdMD}</span></>)}
                        {m.delivery.baseUrl && (<><span>baseUrl</span><span>{m.delivery.baseUrl}</span></>)}
                      </div>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">pas de delivery configuré sur ce marché</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Integration legacy</div>
            {data.integrations.delivery ? (
              <div className="mt-1 grid gap-x-3 gap-y-0.5 rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground sm:grid-cols-[auto_1fr]">
                <span>provider</span><span>{data.integrations.delivery.provider || '—'}</span>
                <span>enabled</span><span>{String(data.integrations.delivery.enabled)}</span>
                <span>autoDispatch</span><span>{String(data.integrations.delivery.autoDispatch)}</span>
                <span>webhookSecret</span>
                <span className={!data.integrations.delivery.webhookSecret ? 'text-rose-700' : ''}>
                  {data.integrations.delivery.webhookSecret || '⚠ vide'}
                </span>
                {data.integrations.delivery.baseUrl && (<><span>baseUrl</span><span>{data.integrations.delivery.baseUrl}</span></>)}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Aucune integration delivery posée au niveau de la store.</p>
            )}
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Env serveur</div>
            <div className="mt-1 grid gap-x-3 gap-y-0.5 rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground sm:grid-cols-[auto_1fr]">
              <span>FLEXIOPAGE_WEBHOOK_SECRET</span><span>{data.env.FLEXIOPAGE_WEBHOOK_SECRET || '—'}</span>
              <span>MOGADELIVERY_WEBHOOK_URL</span><span>{data.env.MOGADELIVERY_WEBHOOK_URL || '— (défaut hardcodé)'}</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              L&apos;env n&apos;est plus utilisée comme fallback de signature — le secret doit être posé par boutique (markets[] ou integrations.delivery).
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
