'use client';

/**
 * Two compact balance pills shown in the dashboard top-bar:
 *   • main solde — what 3% commission is debited from
 *   • solde IA  — what AI generations are debited from
 *
 * Click either one to navigate to /dashboard/wallet (top-up or audit).
 *
 * Mobile : seul le badge IA reste visible (ultra-compact — juste le nombre)
 * car c'est celui qui bouge en live pendant qu'un vendeur utilise le
 * Studio IA — critique pour la confiance ("je sais ce qu'il me reste").
 * Le badge principal reste desktop-only (moins de mouvements, moins vital
 * dans l'UI navbar mobile déjà chargée).
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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

  // Détection de débit IA — quand aiBalance chute entre 2 refresh, on
  // déclenche une petite animation (scale + flash orange) sur le pill IA
  // pour signaler visuellement au vendeur qu'un token vient d'être consommé.
  const prevAiBalance = useRef<number | null>(null);
  const [debitFlash, setDebitFlash] = useState(false);

  useEffect(() => {
    if (wallet == null) return;
    const prev = prevAiBalance.current;
    if (prev != null && wallet.aiBalance < prev) {
      setDebitFlash(true);
      const t = window.setTimeout(() => setDebitFlash(false), 900);
      return () => window.clearTimeout(t);
    }
    prevAiBalance.current = wallet.aiBalance;
  }, [wallet]);

  useEffect(() => {
    refresh();
    // Refresh every 30s — cheap call, keeps the navbar in sync after orders.
    // Aussi utilisé pour détecter les débits IA du Studio (voir effect ci-dessus).
    const id = window.setInterval(refresh, 30000);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (!wallet) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-9 w-20 animate-pulse rounded-xl bg-sidebar-muted/50" />
        <span className="hidden h-9 w-24 animate-pulse rounded-xl bg-sidebar-muted/50 lg:block" />
      </div>
    );
  }

  const lowMain = wallet.balance < 1500;
  // Solde IA bas si on n'a plus de quoi payer une landing (compteur de tokens).
  // Fallback 3 = défaut DEFAULT_AI_PRICING.prices.landing au backend.
  const lowAi = wallet.aiBalance < (wallet.aiCosts?.landing || 3);
  const criticalAi = wallet.aiBalance < 2;

  return (
    <div className="flex items-center gap-1.5">
      {/* Solde principal — desktop only */}
      <Link
        href="/dashboard/wallet"
        className={`group hidden h-10 items-center gap-2 rounded-xl border px-3 transition-colors lg:inline-flex ${
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

      {/* Solde IA — TOUJOURS visible (même mobile). Variante compacte < lg :
          juste l'icône + le nombre. Anime quand un débit est détecté. */}
      <Link
        href="/dashboard/wallet?bucket=ai"
        aria-label={`Solde IA : ${fmtTokens(wallet.aiBalance)}`}
        className={`group inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 transition-all duration-300 lg:h-10 lg:gap-2 lg:px-3 ${
          criticalAi
            ? 'border-red-500/50 bg-red-500/10 hover:bg-red-500/15'
            : lowAi
              ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15'
              : 'border-sidebar-border bg-sidebar-muted/50 hover:bg-sidebar-muted'
        } ${debitFlash ? 'scale-105 ring-2 ring-fuchsia-500/50' : ''}`}
        title="Solde IA — débité à chaque génération de landing / page produit / vidéo"
      >
        <span className={`grid h-5 w-5 place-items-center rounded-md lg:h-6 lg:w-6 ${
          criticalAi ? 'bg-red-500/25 text-red-300' : lowAi ? 'bg-amber-500/25 text-amber-300' : 'bg-fuchsia-500/20 text-fuchsia-300'
        }`}>
          <Sparkles className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
        </span>
        {/* Version compacte mobile — juste le nombre + "tk" */}
        <span className="text-xs font-bold text-sidebar-strong lg:hidden">
          {Math.round(wallet.aiBalance).toLocaleString()}
          <span className="ml-0.5 text-[9px] font-medium text-sidebar-foreground">tk</span>
        </span>
        {/* Version desktop — label + valeur formatée */}
        <span className="hidden flex-col leading-none lg:flex">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-sidebar-foreground">Solde IA</span>
          <span className="mt-0.5 text-sm font-bold text-sidebar-strong">{fmtTokens(wallet.aiBalance)}</span>
        </span>
      </Link>
    </div>
  );
}
