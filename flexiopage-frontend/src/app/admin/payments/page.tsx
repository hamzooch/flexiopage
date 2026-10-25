'use client';

/**
 * Owner payment desk.
 *
 * The journal lists every customer payment (not just gateway logs).
 * The seller directory rolls those payments up per account and opens
 * that seller's history. Gateway config and webhooks stay in a
 * technical tab so they don't sit on top of the operational view.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminApi } from '@/lib/api';
import { CinetPayDesk } from './cinetpay/page';
import { cn } from '@/lib/utils';
import {
  Loader2,
  CreditCard,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Webhook,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  Search,
  Users,
  Clock,
  RotateCcw,
  Store,
  ChevronLeft,
  ChevronRight,
  Banknote,
  Sparkles,
  Wallet,
} from 'lucide-react';

type Ledger = Awaited<ReturnType<typeof adminApi.getPaymentLedger>>['data'];
type PaymentRow = Ledger['payments'][number];
type PaymentConfig = Awaited<ReturnType<typeof adminApi.getPaymentConfig>>['data'];
type WebhookLog = Awaited<ReturnType<typeof adminApi.listPaymentWebhooks>>['data'][number];

type Tab = 'cinetpay' | 'overview' | 'journal' | 'sellers' | 'tech';
type Period = '7' | '30' | '90' | 'all';

const PERIODS: { id: Period; label: string }[] = [
  { id: '7', label: '7 jours' },
  { id: '30', label: '30 jours' },
  { id: '90', label: '90 jours' },
  { id: 'all', label: 'Tout' },
];

const STATUSES: { id: string; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'paid', label: 'Payés' },
  { id: 'pending', label: 'En attente' },
  { id: 'failed', label: 'Échecs' },
  { id: 'refunded', label: 'Remboursés' },
  { id: 'manual', label: 'Manuels' },
];

const PROVIDERS: { id: string; label: string }[] = [
  { id: 'all', label: 'Tous les moyens' },
  { id: 'cinetpay', label: 'CinetPay' },
  { id: 'moneróo', label: 'Moneroo' },
  { id: 'flutterwave', label: 'Flutterwave' },
  { id: 'wave', label: 'Wave' },
  { id: 'orange_money', label: 'Orange Money' },
  { id: 'mtn_momo', label: 'MTN MoMo' },
  { id: 'moov_money', label: 'Moov' },
  { id: 'cod', label: 'À la livraison' },
  { id: 'manual', label: 'Manuel' },
  { id: 'stripe', label: 'Stripe' },
];

const PROVIDER_LABEL: Record<string, string> = Object.fromEntries(
  PROVIDERS.filter((p) => p.id !== 'all').map((p) => [p.id, p.label]),
);

function fmt(amount: number, currency = 'XOF'): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

function fmtVolumes(volumes: Array<{ currency: string; amount: number }>): string {
  if (!volumes.length) return '—';
  return volumes.map((v) => fmt(v.amount, v.currency)).join(' · ');
}

function fmtDigitalCommission(
  slices: Array<{ currency: string; digital: number }> | undefined,
): string {
  if (!slices) return '—';
  const rows = slices
    .filter((s) => s.digital > 0)
    .map((s) => ({ currency: s.currency, amount: s.digital }));
  if (!rows.length) return '0';
  return fmtVolumes(rows);
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: 'short', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function providerLabel(row: PaymentRow): string {
  const key = row.paymentProvider || row.paymentMethod || '';
  return PROVIDER_LABEL[key] || key || '—';
}

export default function AdminPaymentsPage() {
  const [tab, setTab] = useState<Tab>('cinetpay');
  const [days, setDays] = useState<Period>('30');
  const [status, setStatus] = useState('all');
  const [provider, setProvider] = useState('all');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [sellerQuery, setSellerQuery] = useState('');
  const [skip, setSkip] = useState(0);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);

  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookLog[]>([]);
  const [techLoading, setTechLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput.trim());
      setSkip(0);
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getPaymentLedger({
        days: days === 'all' ? 'all' : Number(days),
        status,
        provider,
        q: q || undefined,
        sellerId: sellerId || undefined,
        limit: 25,
        skip,
      });
      setLedger(res.data);
    } catch (err) {
      setError((err as Error).message || 'Impossible de charger les paiements');
    } finally {
      setLoading(false);
    }
  }, [days, status, provider, q, sellerId, skip]);

  useEffect(() => {
    if (tab === 'cinetpay') return;
    void load();
  }, [load, tab]);

  const loadTech = useCallback(async () => {
    setTechLoading(true);
    try {
      const [cfg, wh] = await Promise.all([
        adminApi.getPaymentConfig(),
        adminApi.listPaymentWebhooks({ limit: 40 }),
      ]);
      setConfig(cfg.data);
      setWebhooks(wh.data);
    } finally {
      setTechLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'tech' && !config) void loadTech();
  }, [tab, config, loadTech]);

  const selectedSeller = useMemo(
    () => ledger?.sellers.find((s) => s.id === sellerId) || null,
    [ledger, sellerId],
  );

  const visibleSellers = useMemo(() => {
    const rows = ledger?.sellers || [];
    const needle = sellerQuery.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((s) =>
      s.name.toLowerCase().includes(needle)
      || s.email.toLowerCase().includes(needle)
      || s.stores.some((st) => st.name.toLowerCase().includes(needle) || st.slug.toLowerCase().includes(needle)),
    );
  }, [ledger, sellerQuery]);

  const summary = selectedSeller
    ? {
        paid: selectedSeller.paid,
        pending: selectedSeller.pending,
        failed: selectedSeller.failed,
        refunded: selectedSeller.refunded,
        total: selectedSeller.total,
        volumes: selectedSeller.volumes,
        sellerCount: 1,
        commission: selectedSeller.commission,
        digitalRate: ledger?.summary.digitalRate ?? 0.15,
        physicalRate: ledger?.summary.physicalRate ?? 0.05,
      }
    : ledger?.summary;

  function openSeller(id: string) {
    setSellerId(id);
    setStatus('all');
    setSkip(0);
    setTab('journal');
    setNotice(null);
  }

  async function handleVerify(reference: string) {
    setVerifying(reference);
    setNotice(null);
    try {
      const res = await adminApi.verifyPaymentTransaction(reference);
      setNotice(`Vérifié : ${res.data.status} · ${res.data.reference || reference}`);
      await load();
    } catch (err) {
      setNotice(`Vérification impossible : ${(err as Error).message}`);
    } finally {
      setVerifying(null);
    }
  }

  const pageStart = ledger && ledger.total ? ledger.skip + 1 : 0;
  const pageEnd = ledger ? Math.min(ledger.skip + ledger.payments.length, ledger.total) : 0;
  const rateLabel = summary ? `${Math.round(summary.digitalRate * 100)}%` : '15%';
  const subtitle = tab === 'cinetpay'
    ? 'Solde CinetPay, revenu du mois, commission et versements aux vendeurs.'
    : tab === 'overview'
    ? 'Volume encaissé, commission FlexioPage, et activité des vendeurs.'
    : tab === 'journal'
      ? 'Chaque paiement client, avec la commission retenue sur les ventes en ligne.'
      : tab === 'sellers'
        ? 'Volume et commission par compte vendeur.'
        : 'Clé API et webhooks Moneroo. Le suivi métier est dans Vue d’ensemble.';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Paiements</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/payouts"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent"
          >
            <Banknote className="h-3.5 w-3.5" />
            Versements
          </Link>
          {tab !== 'cinetpay' && (
            <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              Actualiser
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border/60 bg-card p-1" role="tablist" aria-label="Paiements">
        <TabButton active={tab === 'cinetpay'} onClick={() => setTab('cinetpay')} icon={Wallet}>
          CinetPay
        </TabButton>
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={TrendingUp}>
          Vue d&apos;ensemble
        </TabButton>
        <TabButton active={tab === 'journal'} onClick={() => setTab('journal')} icon={CreditCard}>
          Journal {ledger ? `(${ledger.total})` : ''}
        </TabButton>
        <TabButton active={tab === 'sellers'} onClick={() => setTab('sellers')} icon={Users}>
          Vendeurs {ledger ? `(${ledger.sellers.length})` : ''}
        </TabButton>
        <TabButton active={tab === 'tech'} onClick={() => setTab('tech')} icon={Webhook}>
          Technique
        </TabButton>
      </div>

      {tab === 'cinetpay' && <CinetPayDesk embedded />}

      {tab !== 'tech' && tab !== 'cinetpay' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1" role="tablist" aria-label="Période">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={days === p.id}
                onClick={() => { setDays(p.id); setSkip(0); }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  days === p.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {tab === 'overview' && (
            <p className="text-xs text-muted-foreground">
              Commission digitale {rateLabel} sur les paiements en ligne
            </p>
          )}
        </div>
      )}

      {selectedSeller && tab !== 'overview' && tab !== 'tech' && tab !== 'cinetpay' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-indigo-500/15 text-sm font-semibold text-indigo-700">
            {(selectedSeller.name || selectedSeller.email || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{selectedSeller.name || 'Vendeur'}</div>
            <div className="truncate text-xs text-muted-foreground">
              {selectedSeller.email || 'Sans email'}
              {selectedSeller.stores.length ? ` · ${selectedSeller.stores.map((s) => s.name).join(', ')}` : ''}
              {` · généré ${fmtVolumes(selectedSeller.generated)} · retirable ${fmt(selectedSeller.withdrawable.amount, selectedSeller.withdrawable.currency)}`}
            </div>
          </div>
          {selectedSeller.id !== 'unknown' && (
            <Link href={`/admin/users/${selectedSeller.id}`} className="text-xs font-medium text-indigo-700 hover:underline">
              Fiche compte
            </Link>
          )}
          <Button variant="outline" size="sm" onClick={() => { setSellerId(null); setSkip(0); }}>
            Tous les paiements
          </Button>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">{notice}</p>
      )}

      {tab === 'overview' && (
        <OverviewPanel
          loading={loading && !ledger}
          summary={summary}
          payments={ledger?.payments.slice(0, 8) ?? []}
          onOpenJournal={() => setTab('journal')}
          onOpenSeller={openSeller}
        />
      )}

      {tab === 'journal' && (
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Commande, client, référence, vendeur, boutique"
                  className="h-9 pl-8 text-sm"
                  aria-label="Rechercher un paiement"
                />
              </div>
              <label className="sr-only" htmlFor="payment-provider">Moyen de paiement</label>
              <select
                id="payment-provider"
                value={provider}
                onChange={(e) => { setProvider(e.target.value); setSkip(0); }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm sm:w-52"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-1">
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setStatus(s.id); setSkip(0); }}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-medium',
                    status === s.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading && !ledger ? (
              <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : !ledger || ledger.payments.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Aucun paiement sur cette période.
              </p>
            ) : (
              <div className={cn('overflow-x-auto', loading && 'opacity-60')}>
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="border-y border-border/60 bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Vendeur</th>
                      <th className="px-3 py-2 text-left">Commande</th>
                      <th className="px-3 py-2 text-right">Montant</th>
                      <th className="px-3 py-2 text-right">Commission</th>
                      <th className="px-3 py-2 text-left">Statut</th>
                      <th className="px-3 py-2 text-left">Moyen</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {ledger.payments.map((tx) => (
                      <tr key={tx.id} className="align-top">
                        <td className="px-3 py-2.5">
                          {tx.seller?.id ? (
                            <button type="button" onClick={() => openSeller(tx.seller!.id)} className="text-left hover:underline">
                              <div className="font-medium">{tx.seller.name || 'Vendeur'}</div>
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Store className="h-3 w-3 shrink-0" />
                                {tx.store?.name || tx.seller.email}
                              </div>
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{tx.orderNumber}</div>
                          <div className="text-[11px] text-muted-foreground">{tx.customerName || tx.email || '—'}</div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums whitespace-nowrap">
                          {fmt(tx.total, tx.currency)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {tx.commission ? (
                            <div>
                              <div className="font-medium text-emerald-700">{fmt(tx.commission.amount, tx.currency)}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {Math.round(tx.commission.rate * 100)}% {tx.commission.orderType === 'digital' ? 'digital' : 'physique'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5"><StatusBadge status={tx.paymentStatus} /></td>
                        <td className="px-3 py-2.5 text-xs">{providerLabel(tx)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(tx.createdAt)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {tx.paymentReference ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-[11px]"
                              onClick={() => void handleVerify(tx.paymentReference!)}
                              disabled={verifying === tx.paymentReference}
                            >
                              {verifying === tx.paymentReference ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                              Vérifier
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {ledger && ledger.total > 0 && (
              <div className="flex items-center justify-between gap-3 border-t border-border/60 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {pageStart}–{pageEnd} sur {ledger.total}
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="Page précédente" disabled={ledger.skip <= 0 || loading} onClick={() => setSkip((n) => Math.max(0, n - ledger.limit))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" aria-label="Page suivante" disabled={ledger.skip + ledger.payments.length >= ledger.total || loading} onClick={() => setSkip((n) => n + ledger.limit)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'sellers' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Solde de chaque vendeur</CardTitle>
            <CardDescription className="text-xs">
              Généré = total encaissé sur les commandes payées. Retirable = ce que le vendeur peut retirer maintenant, après la commission FlexioPage et les versements déjà faits.
            </CardDescription>
            <div className="relative pt-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 mt-0.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={sellerQuery}
                onChange={(e) => setSellerQuery(e.target.value)}
                placeholder="Nom, email ou boutique"
                className="h-9 pl-8 text-sm"
                aria-label="Rechercher un vendeur"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading && !ledger ? (
              <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : visibleSellers.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">Aucun vendeur sur cette période.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="border-y border-border/60 bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Vendeur</th>
                      <th className="px-3 py-2 text-left">Boutiques</th>
                      <th className="px-3 py-2 text-right">Payés</th>
                      <th className="px-3 py-2 text-right">Attente</th>
                      <th className="px-3 py-2 text-right">Échecs</th>
                      <th className="px-3 py-2 text-right">Généré</th>
                      <th className="px-3 py-2 text-right">Retirable</th>
                      <th className="px-3 py-2 text-right">Commission</th>
                      <th className="px-3 py-2 text-left">Dernier</th>
                      <th className="px-3 py-2 text-right"> </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {visibleSellers.map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-2.5">
                          {s.id !== 'unknown' ? (
                            <Link href={`/admin/users/${s.id}`} className="hover:underline">
                              <div className="font-medium">{s.name}</div>
                              <div className="text-[11px] text-muted-foreground">{s.email || '—'}</div>
                            </Link>
                          ) : (
                            <>
                              <div className="font-medium">{s.name}</div>
                              <div className="text-[11px] text-muted-foreground">{s.email || '—'}</div>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs">{s.stores.map((st) => st.name).join(', ') || '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{s.paid}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{s.pending}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{s.failed}</td>
                        <td className="px-3 py-2.5 text-right text-xs font-medium tabular-nums whitespace-nowrap">{fmtVolumes(s.generated)}</td>
                        <td className="px-3 py-2.5 text-right text-xs font-semibold tabular-nums whitespace-nowrap text-emerald-700">
                          {fmt(s.withdrawable.amount, s.withdrawable.currency)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs font-medium tabular-nums whitespace-nowrap text-emerald-700">
                          {fmtDigitalCommission(s.commission)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(s.lastPaymentAt)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => openSeller(s.id)}>
                            Historique
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'tech' && (
        <TechPanel
          config={config}
          webhooks={webhooks}
          loading={techLoading}
          copied={copied}
          onRefresh={() => void loadTech()}
          onCopy={() => {
            if (!config?.webhookUrl) return;
            navigator.clipboard.writeText(config.webhookUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, children }: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors sm:flex-none sm:px-4 sm:text-sm',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function OverviewPanel({
  loading, summary, payments, onOpenJournal, onOpenSeller,
}: {
  loading: boolean;
  summary: Ledger['summary'] | {
    paid: number;
    pending: number;
    failed: number;
    refunded: number;
    total: number;
    volumes: Ledger['summary']['volumes'];
    sellerCount: number;
    commission: Ledger['summary']['commission'];
    digitalRate: number;
    physicalRate: number;
  } | undefined;
  payments: PaymentRow[];
  onOpenJournal: () => void;
  onOpenSeller: (id: string) => void;
}) {
  if (loading) {
    return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  const rateLabel = summary ? `${Math.round(summary.digitalRate * 100)}%` : '15%';
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/10 via-transparent to-indigo-500/10">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white">
              <Wallet className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Volume encaissé</div>
              <div className="text-3xl font-bold tracking-tight">{summary ? fmtVolumes(summary.volumes) : '—'}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Commandes payées sur la période, toutes boutiques.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 border-t border-fuchsia-500/10 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <Sparkles className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Commission FlexioPage</div>
              <div className="text-3xl font-bold tracking-tight text-emerald-700">{fmtDigitalCommission(summary?.commission)}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {rateLabel} retenu sur chaque commande digitale payée en ligne.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Payés" value={summary ? String(summary.paid) : '—'} icon={CheckCircle2} tint="emerald" />
        <Kpi label="En attente" value={summary ? String(summary.pending) : '—'} icon={Clock} tint="amber" />
        <Kpi label="Échecs" value={summary ? String(summary.failed) : '—'} icon={XCircle} tint="rose" />
        <Kpi label="Vendeurs actifs" value={summary ? String(summary.sellerCount) : '—'} icon={Users} tint="violet" />
      </div>

      {(summary?.commission.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commission par devise</CardTitle>
            <CardDescription className="text-xs">
              Part FlexioPage sur les ventes digitales ({rateLabel}) et physiques ({summary ? Math.round(summary.physicalRate * 100) : 5}%).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary!.commission.map((c) => (
              <div key={c.currency} className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">{c.currency}</div>
                <div className="mt-1 text-2xl font-bold text-emerald-900">{fmt(c.digital, c.currency)}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {c.digitalCount} vente{c.digitalCount > 1 ? 's' : ''} digitale{c.digitalCount > 1 ? 's' : ''}
                  {c.physical > 0 ? ` · physique ${fmt(c.physical, c.currency)}` : ''}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Derniers paiements</CardTitle>
            <CardDescription className="text-xs">Les plus récents de la période. Le détail est dans le journal.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenJournal}>Tout le journal</Button>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Aucun paiement sur cette période.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-y border-border/60 bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Vendeur</th>
                    <th className="px-3 py-2 text-left">Commande</th>
                    <th className="px-3 py-2 text-right">Montant</th>
                    <th className="px-3 py-2 text-right">Commission</th>
                    <th className="px-3 py-2 text-left">Statut</th>
                    <th className="px-3 py-2 text-left">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {payments.map((tx) => (
                    <tr key={tx.id}>
                      <td className="px-3 py-2.5">
                        {tx.seller?.id ? (
                          <button type="button" onClick={() => onOpenSeller(tx.seller!.id)} className="text-left hover:underline">
                            <div className="font-medium">{tx.seller.name || 'Vendeur'}</div>
                            <div className="text-[11px] text-muted-foreground">{tx.store?.name || tx.seller.email}</div>
                          </button>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{tx.orderNumber}</div>
                        <div className="text-[11px] text-muted-foreground">{tx.customerName || tx.email || '—'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums whitespace-nowrap">{fmt(tx.total, tx.currency)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {tx.commission ? (
                          <span className="font-medium text-emerald-700">{fmt(tx.commission.amount, tx.currency)}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2.5"><StatusBadge status={tx.paymentStatus} /></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{fmtDate(tx.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TechPanel({
  config, webhooks, loading, copied, onRefresh, onCopy,
}: {
  config: PaymentConfig | null;
  webhooks: WebhookLog[];
  loading: boolean;
  copied: boolean;
  onRefresh: () => void;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Passerelle Moneroo</CardTitle>
            <CardDescription className="text-xs">Clé API et URL de webhook. Le journal métier est dans l&apos;onglet Journal.</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Actualiser
          </Button>
        </CardHeader>
        <CardContent>
          {loading && !config ? (
            <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : config ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                {config.apiKeyConfigured ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-rose-600" />}
                <div className="flex-1">
                  <div className="text-sm font-medium">Clé API {config.apiKeyConfigured ? 'configurée' : 'manquante'}</div>
                  <div className="text-xs text-muted-foreground">{config.testMode ? 'Mode sandbox / test' : 'Mode production'}</div>
                </div>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                  config.apiKeyConfigured ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700',
                )}>
                  {config.apiKeyConfigured ? 'OK' : 'À configurer'}
                </span>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">URL webhook</div>
                <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2">
                  <code className="flex-1 truncate text-xs">{config.webhookUrl}</code>
                  <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={onCopy}>
                    {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copié' : 'Copier'}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhooks récents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && webhooks.length === 0 ? (
            <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : webhooks.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Aucun webhook reçu.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {webhooks.map((wh) => (
                <li key={wh.id} className="flex items-start gap-2 p-3">
                  <Webhook className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{wh.event}</span>
                      <StatusBadge status={wh.status} />
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{fmtDate(wh.createdAt)}</div>
                    {wh.error && <div className="mt-1 text-[11px] text-rose-700">{wh.error}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
    paid:     { cls: 'bg-emerald-500/10 text-emerald-700', label: 'Payé', Icon: CheckCircle2 },
    success:  { cls: 'bg-emerald-500/10 text-emerald-700', label: 'Succès', Icon: CheckCircle2 },
    pending:  { cls: 'bg-amber-500/10 text-amber-700', label: 'En attente', Icon: Clock },
    failed:   { cls: 'bg-rose-500/10 text-rose-700', label: 'Échec', Icon: XCircle },
    refunded: { cls: 'bg-slate-500/10 text-slate-700', label: 'Remboursé', Icon: RotateCcw },
    manual:   { cls: 'bg-violet-500/10 text-violet-700', label: 'Manuel', Icon: Banknote },
  };
  const conf = map[status] || { cls: 'bg-slate-500/10 text-slate-700', label: status, Icon: CreditCard };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', conf.cls)}>
      <conf.Icon className="h-2.5 w-2.5" />
      {conf.label}
    </span>
  );
}

function Kpi({
  label, value, icon: Icon, tint, hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: 'emerald' | 'amber' | 'rose' | 'violet';
  hint?: string;
}) {
  const tintCls = {
    emerald: 'bg-emerald-500/10 text-emerald-700',
    amber: 'bg-amber-500/10 text-amber-700',
    rose: 'bg-rose-500/10 text-rose-700',
    violet: 'bg-violet-500/10 text-violet-700',
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md', tintCls[tint])}>
          <Icon className="h-3 w-3" />
        </span>
      </div>
      <div className="break-words text-lg font-bold leading-tight tracking-tight tabular-nums sm:text-xl">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
