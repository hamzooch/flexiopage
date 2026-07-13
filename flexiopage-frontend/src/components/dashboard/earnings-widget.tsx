'use client';

/**
 * Compact online-earnings widget for the dashboard overview.
 *
 * Only rendered when the seller has a payout balance OR at least one
 * sale_credit entry in their ledger. Vendors who only run physical/COD
 * stores never see this, keeping the overview uncluttered.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Banknote, ArrowRight } from 'lucide-react';
import { walletApi, type WalletState } from '@/lib/api';
import { cn } from '@/lib/utils';

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function EarningsWidget() {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    walletApi.get()
      .then((res) => setWallet(res.data.wallet))
      .catch(() => { /* silencieux — un vendeur sans wallet n'a rien à afficher */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !wallet) return null;

  const hasEarnings = wallet.payoutBalance > 0
    || (wallet.transactions || []).some((t) => t.kind === 'sale_credit');
  if (!hasEarnings) return null;

  const canPayout = wallet.payoutBalance >= wallet.payoutMinimum;

  return (
    <Link href="/dashboard/earnings" className="block">
      <Card className="transition-colors hover:border-primary/40">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
            <Banknote className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Revenus en ligne (solde vendeur)
            </div>
            <div className="mt-0.5 text-xl font-bold tabular-nums text-emerald-600 sm:text-2xl">
              {fmt(wallet.payoutBalance, wallet.currency)}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {canPayout ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700">
                  ✓ Retrait possible
                </span>
              ) : (
                <span>
                  Minimum: {fmt(wallet.payoutMinimum, wallet.currency)}
                </span>
              )}
              <span>·</span>
              <span>Commission plateforme: {(wallet.platformCommissionRate * 100).toFixed(0)}%</span>
            </div>
          </div>
          <ArrowRight className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5',
          )} />
        </CardContent>
      </Card>
    </Link>
  );
}
