'use client';

/**
 * Admin overview widget — pending seller payouts.
 * Only rendered when there's at least one pending request, so it acts like
 * an actionable alert rather than dashboard noise.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Banknote, ArrowRight } from 'lucide-react';
import { adminApi } from '@/lib/api';

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

interface Stats {
  pendingCount: number;
  paid30dCount: number;
  pendingByCurrency: Array<{ currency: string; amount: number }>;
  paid30dByCurrency: Array<{ currency: string; amount: number }>;
}

export function PendingPayoutsWidget() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getPayoutStats()
      .then((res) => setStats(res.data))
      .catch(() => { /* silencieux — non-bloquant */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats || stats.pendingCount === 0) return null;

  return (
    <Link href="/admin/payouts" className="block">
      <Card className="border-amber-500/40 bg-gradient-to-r from-amber-500/5 to-amber-500/10 transition-colors hover:border-amber-500/60">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <Banknote className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">
              Payouts à traiter
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-amber-900">
                {stats.pendingCount}
              </span>
              <span className="text-xs text-amber-800">
                demande(s) en attente
              </span>
            </div>
            {stats.pendingByCurrency.length > 0 && (
              <div className="mt-1 text-[11px] text-amber-800">
                Total à verser: {stats.pendingByCurrency.map((c) => fmt(c.amount, c.currency)).join(' · ')}
              </div>
            )}
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-amber-700" />
        </CardContent>
      </Card>
    </Link>
  );
}
