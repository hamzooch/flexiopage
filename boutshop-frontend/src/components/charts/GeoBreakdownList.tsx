'use client';

import { Globe2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Props {
  data: Array<{ _id: string; orders: number; revenue: number }>;
  currency: string;
}

// ISO-3166 alpha-2 → flag emoji + French label. Limited to the platform's
// likely customer countries; unknown codes fall back to a globe icon.
const COUNTRY_META: Record<string, { flag: string; label: string }> = {
  SN: { flag: '🇸🇳', label: 'Sénégal' },
  CI: { flag: '🇨🇮', label: "Côte d'Ivoire" },
  ML: { flag: '🇲🇱', label: 'Mali' },
  BF: { flag: '🇧🇫', label: 'Burkina Faso' },
  TG: { flag: '🇹🇬', label: 'Togo' },
  BJ: { flag: '🇧🇯', label: 'Bénin' },
  NE: { flag: '🇳🇪', label: 'Niger' },
  CM: { flag: '🇨🇲', label: 'Cameroun' },
  GA: { flag: '🇬🇦', label: 'Gabon' },
  CG: { flag: '🇨🇬', label: 'Congo' },
  CD: { flag: '🇨🇩', label: 'RD Congo' },
  TD: { flag: '🇹🇩', label: 'Tchad' },
  MA: { flag: '🇲🇦', label: 'Maroc' },
  DZ: { flag: '🇩🇿', label: 'Algérie' },
  TN: { flag: '🇹🇳', label: 'Tunisie' },
  EG: { flag: '🇪🇬', label: 'Égypte' },
  FR: { flag: '🇫🇷', label: 'France' },
  BE: { flag: '🇧🇪', label: 'Belgique' },
  US: { flag: '🇺🇸', label: 'États-Unis' },
  GB: { flag: '🇬🇧', label: 'Royaume-Uni' },
  CA: { flag: '🇨🇦', label: 'Canada' },
};

export function GeoBreakdownList({ data, currency }: Props) {
  if (data.length === 0) {
    return (
      <div className="grid h-full min-h-[200px] place-items-center text-sm text-muted-foreground">
        Aucune commande payée sur la période.
      </div>
    );
  }
  const totalRev = data.reduce((s, d) => s + d.revenue, 0);

  return (
    <ul className="space-y-2">
      {data.map((row) => {
        const meta = COUNTRY_META[row._id?.toUpperCase()];
        const pct = totalRev > 0 ? (row.revenue / totalRev) * 100 : 0;
        return (
          <li key={row._id} className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/60 p-3 transition-colors hover:border-primary/40">
            <div
              className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent"
              style={{ width: `${pct}%` }}
            />
            <div className="relative flex items-center gap-2 sm:gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-base sm:h-9 sm:w-9">
                {meta?.flag || <Globe2 className="h-4 w-4 text-muted-foreground" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold sm:text-sm">
                  {meta?.label || (row._id === 'XX' ? 'Pays inconnu' : row._id)}
                </div>
                <div className="text-[10px] text-muted-foreground sm:text-[11px]">
                  {row.orders} commande{row.orders > 1 ? 's' : ''}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs font-bold tabular-nums sm:text-sm">{formatCurrency(row.revenue, currency)}</div>
                <div className="text-[10px] text-muted-foreground">{pct.toFixed(0)}%</div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
