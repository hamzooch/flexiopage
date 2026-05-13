'use client';

import { Package } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Props {
  products: Array<{
    productId: string;
    name: string;
    image?: string;
    unitsSold: number;
    revenue: number;
  }>;
  currency: string;
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');
function absUrl(u?: string): string {
  if (!u) return '';
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  if (u.startsWith('/')) return `${API_BASE}${u}`;
  return u;
}

export function TopProductsList({ products, currency }: Props) {
  if (products.length === 0) {
    return (
      <div className="grid h-full min-h-[200px] place-items-center text-sm text-muted-foreground">
        Aucune vente sur la période.
      </div>
    );
  }
  const maxRev = Math.max(...products.map((p) => p.revenue), 1);

  return (
    <ul className="space-y-2.5">
      {products.map((p, i) => {
        const w = (p.revenue / maxRev) * 100;
        return (
          <li
            key={p.productId}
            className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/60 p-3 transition-all hover:border-primary/40 hover:shadow-sm"
          >
            <div
              className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-pink-500/10 via-pink-500/5 to-transparent"
              style={{ width: `${w}%` }}
            />
            <div className="relative flex items-center gap-2 sm:gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                {i + 1}
              </span>
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={absUrl(p.image)}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-border/60 sm:h-9 sm:w-9"
                />
              ) : (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground sm:h-9 sm:w-9">
                  <Package className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium sm:text-sm">{p.name}</div>
                <div className="text-[10px] text-muted-foreground sm:text-[11px]">
                  {p.unitsSold} unité{p.unitsSold > 1 ? 's' : ''}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs font-bold tabular-nums sm:text-sm">{formatCurrency(p.revenue, currency)}</div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
