'use client';

/**
 * Two compact balance pills shown in the dashboard top-bar:
 *   • main solde — what 3% commission is debited from
 *   • solde IA  — what AI generations are debited from
 *
 * Click either one to navigate to /dashboard/wallet (top-up or audit).
 */

import Link from 'next/link';
import { useEffect } from 'react';
import { Sparkles, Wallet as WalletIcon } from 'lucide-react';
import { useWalletStore } from '@/stores/wallet-store';

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Solde IA = compteur de tokens (depuis juin 2026). */
function fmtTokens(amount: number): string {
  const n = Math.round(amount);
  return `${n.toLocaleString()} token${Math.abs(n) === 1 ? '' : 's'}`;
}

export function WalletBadges() {
  const wallet = useWalletStore((s) => s.wallet);
  const refresh = useWalletStore((s) => s.refresh);

  useEffect(() => {
    refresh();
    // Refresh every 30s — cheap call, keeps the navbar in sync after orders.
    const id = window.setInterval(refresh, 30000);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (!wallet) {
    return (
      <div className="hidden items-center gap-1.5 sm:flex">
        <span className="h-9 w-24 animate-pulse rounded-xl bg-sidebar-muted/50" />
        <span className="h-9 w-24 animate-pulse rounded-xl bg-sidebar-muted/50" />
      </div>
    );
  }

  const lowMain = wallet.balance < 1500;
  // Solde IA bas si on n'a plus de quoi payer une landing (compteur de tokens).
  // Fallback 3 = défaut DEFAULT_AI_PRICING.prices.landing au backend.
  const lowAi = wallet.aiBalance < (wallet.aiCosts?.landing || 3);

  return (
    <div className="hidden items-center gap-1.5 lg:flex">
      <Link
        href="/dashboard/wallet"
        className={`group inline-flex h-10 items-center gap-2 rounded-xl border px-3 transition-colors ${
          lowMain ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15' : 'border-sidebar-border bg-sidebar-muted/50 hover:bg-sidebar-muted'
        }`}
        title="Solde principal — débité 3% par commande livrée"
      >
        <span className={`grid h-6 w-6 place-items-center rounded-md ${lowMain ? 'bg-amber-500/25 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
          <WalletIcon className="h-3.5 w-3.5" />
        </span>
        <span className="flex flex-col leading-none">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-sidebar-foreground">Solde</span>
          <span className="mt-0.5 text-sm font-bold text-sidebar-strong">{fmt(wallet.balance, wallet.currency)}</span>
        </span>
      </Link>

      <Link
        href="/dashboard/wallet?bucket=ai"
        className={`group inline-flex h-10 items-center gap-2 rounded-xl border px-3 transition-colors ${
          lowAi ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15' : 'border-sidebar-border bg-sidebar-muted/50 hover:bg-sidebar-muted'
        }`}
        title="Solde IA — débité à chaque génération de landing / page produit"
      >
        <span className={`grid h-6 w-6 place-items-center rounded-md ${lowAi ? 'bg-amber-500/25 text-amber-300' : 'bg-fuchsia-500/20 text-fuchsia-300'}`}>
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <span className="flex flex-col leading-none">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-sidebar-foreground">Solde IA</span>
          <span className="mt-0.5 text-sm font-bold text-sidebar-strong">{fmtTokens(wallet.aiBalance)}</span>
        </span>
      </Link>
    </div>
  );
}
