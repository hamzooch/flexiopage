'use client';

/**
 * Solde — two-balance wallet:
 *   • Solde principal — debited 3% per delivered order (commission)
 *   • Solde IA       — debited per AI landing/product page generation
 *
 * Backend: GET /api/wallet · POST /api/wallet/top-up { target: 'main'|'ai' }
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Wallet,
  Sparkles,
  ArrowDownToLine,
  ArrowUpRight,
  ReceiptText,
  RefreshCw,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { walletApi, type WalletState, type WalletTransaction, type WalletBucket } from '@/lib/api';
import { useWalletStore } from '@/stores/wallet-store';
import { cn } from '@/lib/utils';

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Affichage solde IA : on n'utilise plus la monnaie, juste un compteur. */
function fmtTokens(amount: number): string {
  const n = Math.round(amount);
  return `${n.toLocaleString()} token${Math.abs(n) === 1 ? '' : 's'}`;
}

/** Format d'un montant transactionnel selon le bucket (currency pour main,
 *  tokens pour ai). Évite que l'UI mélange USD et tokens dans le ledger. */
function fmtForBucket(amount: number, bucket: WalletBucket, currency: string): string {
  return bucket === 'ai' ? fmtTokens(amount) : fmt(amount, currency);
}

function txMeta(t: WalletTransaction): { label: string; tone: 'positive' | 'negative' | 'neutral'; Icon: typeof ArrowDownToLine } {
  switch (t.kind) {
    case 'top_up':         return { label: 'Recharge solde',       tone: 'positive', Icon: ArrowDownToLine };
    case 'top_up_ai':      return { label: 'Recharge solde IA',    tone: 'positive', Icon: ArrowDownToLine };
    case 'commission':     return { label: 'Commission',           tone: 'negative', Icon: ArrowUpRight };
    case 'ai_generation':  return { label: 'Génération AI',        tone: 'negative', Icon: Sparkles };
    case 'refund':         return { label: 'Remboursement',        tone: 'positive', Icon: ArrowDownToLine };
    case 'adjustment':     return { label: 'Ajustement',           tone: 'neutral',  Icon: ReceiptText };
    case 'sale_credit':    return { label: 'Vente en ligne',       tone: 'positive', Icon: ArrowDownToLine };
    case 'payout_debit':   return { label: 'Versement au vendeur', tone: 'negative', Icon: ArrowUpRight };
  }
}

export default function WalletPage() {
  const searchParams = useSearchParams();
  const initialBucket: WalletBucket = searchParams.get('bucket') === 'ai' ? 'ai' : 'main';
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<WalletBucket>(initialBucket);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupRef, setTopupRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState<'all' | WalletBucket>('all');

  const setStoreWallet = useWalletStore((s) => s.setWallet);

  async function load() {
    setLoading(true);
    try {
      const res = await walletApi.get();
      setWallet(res.data.wallet);
      setStoreWallet(res.data.wallet);
    } catch {
      setError('Impossible de charger le solde');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function handleTopup(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');
    const value = Number(topupAmount);
    if (!value || value <= 0) {
      setError('Indique un montant valide.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await walletApi.topUp({
        amount: value,
        target,
        paymentReference: topupRef.trim() || undefined,
        note: target === 'ai' ? 'Recharge solde IA' : 'Recharge solde',
      });
      if (res.data.alreadyApplied) {
        setError('Cette référence de paiement a déjà été utilisée.');
      } else if (target === 'ai') {
        const credited = res.data.credited ?? Math.round(value * (wallet?.usdToTokens ?? 1.5));
        setSuccess(`+${fmtTokens(credited)} crédités (paiement ${fmt(value, 'USD')}). Nouveau solde IA : ${fmtTokens(res.data.aiBalance)}.`);
        setTopupAmount(''); setTopupRef('');
        await load();
      } else {
        setSuccess(`+${fmt(value, wallet?.currency || 'USD')} crédités sur le solde principal. Nouveau solde : ${fmt(res.data.balance, wallet?.currency || 'USD')}`);
        setTopupAmount(''); setTopupRef('');
        await load();
      }
    } catch {
      setError('Erreur lors de la recharge.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!wallet) {
    return <p className="text-sm text-destructive">{error || 'Wallet indisponible'}</p>;
  }

  const ratePct = (wallet.commissionRate * 100).toFixed(0);
  const lowMain = wallet.balance < 1500;
  const lowAi = wallet.aiBalance < (wallet.aiCosts?.landing || 500);
  const visibleTx = filter === 'all' ? wallet.transactions : wallet.transactions.filter((t) => t.bucket === filter);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Solde</h1>
        <p className="text-muted-foreground">
          Deux soldes séparés : le <strong>principal</strong> sert à payer la commission de {ratePct}% par commande livrée,
          le <strong>solde IA</strong> sert à générer les landing pages et pages produits avec l&apos;IA.
        </p>
      </div>

      {/* Two balance cards */}
      <div className="grid gap-5 lg:grid-cols-2">
        <BalanceCard
          tone="emerald"
          icon={<Wallet className="h-4 w-4" />}
          label="Solde principal"
          subline={`Commission ${ratePct}% par commande livrée · plafond ${fmt(wallet.commissionCap, wallet.currency)}`}
          amount={wallet.balance}
          currency={wallet.currency}
          unit="currency"
          low={lowMain}
          onTopUp={() => setTarget('main')}
          isActive={target === 'main'}
        />
        <BalanceCard
          tone="fuchsia"
          icon={<Sparkles className="h-4 w-4" />}
          label="Solde IA"
          subline={`Landing/page produit ${fmtTokens(wallet.aiCosts.landing)} · texte seul ${fmtTokens(wallet.aiCosts.text_only)}`}
          amount={wallet.aiBalance}
          currency={wallet.currency}
          unit="tokens"
          low={lowAi}
          onTopUp={() => setTarget('ai')}
          isActive={target === 'ai'}
        />
      </div>

      {/* Top-up form */}
      <Card>
        <CardHeader>
          <CardTitle>Recharger</CardTitle>
          <CardDescription>
            Wave, Orange Money, MTN MoMo ou virement. Le solde est crédité dès confirmation du paiement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 inline-flex rounded-xl bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setTarget('main')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                target === 'main' ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Wallet className="h-3.5 w-3.5" /> Solde principal
            </button>
            <button
              type="button"
              onClick={() => setTarget('ai')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                target === 'ai' ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Sparkles className="h-3.5 w-3.5" /> Solde IA
            </button>
          </div>
          <form onSubmit={handleTopup} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <Label htmlFor="amount">
                {target === 'ai' ? 'Montant à payer (USD)' : `Montant à recharger (${wallet.currency})`}
              </Label>
              <Input
                id="amount"
                type="number"
                inputMode="numeric"
                placeholder={target === 'ai' ? 'Ex: 10' : 'Ex: 10000'}
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                className="mt-1"
                min={1}
              />
              {target === 'ai' ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {Number(topupAmount) > 0
                    ? `→ ${fmtTokens(Number(topupAmount) * (wallet.usdToTokens ?? 1.5))} crédités (1 USD = ${wallet.usdToTokens ?? 1.5} tokens)`
                    : `1 USD = ${wallet.usdToTokens ?? 1.5} tokens crédités sur ton solde IA.`}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">Montant en {wallet.currency} que tu vas créditer.</p>
              )}
            </div>
            <div>
              <Label htmlFor="ref">Référence du paiement (optionnel)</Label>
              <Input
                id="ref"
                placeholder="Ex: WAVE-123456 / OM-987654"
                value={topupRef}
                onChange={(e) => setTopupRef(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">L&apos;ID de transaction Wave / Orange Money / virement. Évite les doubles crédits.</p>
            </div>
            <div className="self-end">
              <Button type="submit" disabled={submitting} className="h-10 w-full sm:w-auto">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Créditer ${target === 'ai' ? 'IA' : 'principal'}`}
              </Button>
            </div>
          </form>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Mouvements récents</CardTitle>
              <CardDescription>50 dernières transactions, plus récentes en premier.</CardDescription>
            </div>
            <div className="inline-flex rounded-lg bg-muted/40 p-1 text-xs">
              {(['all', 'main', 'ai'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-medium transition-colors',
                    filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                  )}
                >
                  {f === 'all' ? 'Tout' : f === 'main' ? 'Principal' : 'IA'}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Actualiser
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {visibleTx.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              Aucun mouvement pour ce filtre.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {visibleTx.map((t) => {
                const meta = txMeta(t);
                const sign = t.amount > 0 ? '+' : '';
                const toneClass =
                  meta.tone === 'positive' ? 'text-emerald-600' :
                  meta.tone === 'negative' ? 'text-rose-600' : 'text-foreground';
                return (
                  <li key={t.id} className="flex items-center gap-3 py-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                      meta.tone === 'positive' ? 'bg-emerald-500/10' :
                      meta.tone === 'negative' ? (t.bucket === 'ai' ? 'bg-fuchsia-500/10' : 'bg-rose-500/10') :
                      'bg-muted'
                    }`}>
                      <meta.Icon className={`h-4 w-4 ${meta.tone === 'negative' && t.bucket === 'ai' ? 'text-fuchsia-600' : toneClass}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{meta.label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          t.bucket === 'ai' ? 'bg-fuchsia-500/15 text-fuchsia-700' : 'bg-emerald-500/15 text-emerald-700'
                        }`}>
                          {t.bucket === 'ai' ? 'IA' : 'principal'}
                        </span>
                        {t.orderNumber && (
                          <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            {t.orderNumber}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {t.note || (t.paymentReference ? `Réf · ${t.paymentReference}` : '—')}
                        {' · '}
                        {new Date(t.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${toneClass}`}>
                        {sign}{fmtForBucket(t.amount, t.bucket, wallet.currency)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Solde : {fmtForBucket(t.balanceAfter, t.bucket, wallet.currency)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BalanceCard({
  tone,
  icon,
  label,
  subline,
  amount,
  currency,
  unit,
  low,
  onTopUp,
  isActive,
}: {
  tone: 'emerald' | 'fuchsia';
  icon: React.ReactNode;
  label: string;
  subline: string;
  amount: number;
  currency: string;
  /** 'currency' → format Intl avec la monnaie. 'tokens' → compteur. */
  unit: 'currency' | 'tokens';
  low: boolean;
  onTopUp: () => void;
  isActive: boolean;
}) {
  const gradient = tone === 'emerald'
    ? 'from-emerald-500/15 via-teal-500/10 to-transparent'
    : 'from-fuchsia-500/15 via-indigo-500/10 to-transparent';
  const accent = tone === 'emerald' ? 'text-emerald-700' : 'text-fuchsia-700';
  const accentBg = tone === 'emerald' ? 'bg-emerald-500/10' : 'bg-fuchsia-500/10';
  return (
    <div className={cn(
      'relative overflow-hidden rounded-3xl border p-7 transition-all',
      isActive ? 'border-foreground/30 shadow-lg' : 'border-border/60'
    )}>
      <div className={`pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br ${gradient} blur-3xl`} aria-hidden />
      <div className="relative flex items-center justify-between">
        <div className={`inline-flex items-center gap-1.5 rounded-full ${accentBg} px-2.5 py-1 text-[11px] font-bold ${accent}`}>
          {icon}
          {label}
        </div>
        <button
          type="button"
          onClick={onTopUp}
          className="rounded-full border border-border/60 bg-card px-3 py-1 text-xs font-medium hover:bg-muted"
        >
          Recharger
        </button>
      </div>
      <div className="relative mt-5 text-4xl font-black tracking-tight sm:text-5xl">
        {unit === 'tokens' ? fmtTokens(amount) : fmt(amount, currency)}
      </div>
      <p className="relative mt-2 text-xs text-muted-foreground">{subline}</p>
      {low && (
        <div className="relative mt-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Solde bas — pense à recharger.
        </div>
      )}
    </div>
  );
}
