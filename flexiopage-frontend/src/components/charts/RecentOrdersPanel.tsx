'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Order {
  id: string;
  orderNumber: string;
  customer: string;
  email: string;
  total: number;
  currency: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
}

interface Props {
  orders: Order[];
}

const PAY_STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: 'Payé', cls: 'bg-emerald-500/10 text-emerald-700' },
  pending: { label: 'En attente', cls: 'bg-amber-500/10 text-amber-700' },
  failed: { label: 'Échoué', cls: 'bg-rose-500/10 text-rose-700' },
  refunded: { label: 'Remboursé', cls: 'bg-slate-500/10 text-slate-700' },
  manual: { label: 'Manuel', cls: 'bg-sky-500/10 text-sky-700' },
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'à l\'instant';
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `il y a ${hrs} h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function RecentOrdersPanel({ orders }: Props) {
  if (orders.length === 0) {
    return (
      <div className="grid h-full min-h-[200px] place-items-center text-sm text-muted-foreground">
        Aucune commande récente.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border/50">
      {orders.map((o) => {
        const pay = PAY_STATUS[o.paymentStatus] || { label: o.paymentStatus, cls: 'bg-muted text-muted-foreground' };
        return (
          <li key={o.id}>
            <Link
              href={`/dashboard/orders/${o.id}`}
              className="group flex items-center gap-2 px-1 py-3 transition-colors hover:bg-muted/40 sm:gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 sm:gap-2">
                  <span className="font-mono text-[11px] font-semibold sm:text-xs">#{o.orderNumber}</span>
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', pay.cls)}>
                    {pay.label}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground sm:text-xs">
                  {o.customer} · {timeAgo(o.createdAt)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs font-bold tabular-nums sm:text-sm">{formatCurrency(o.total, o.currency)}</div>
              </div>
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
