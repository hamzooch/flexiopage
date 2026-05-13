'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency } from '@/lib/utils';

const COLORS = ['#ec4899', '#7c3aed', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#64748b'];

const PROVIDER_LABEL: Record<string, string> = {
  cinetpay: 'CinetPay',
  paydunya: 'PayDunya',
  flutterwave: 'Flutterwave',
  wave: 'Wave',
  orange_money: 'Orange Money',
  mtn_momo: 'MTN MoMo',
  moov_money: 'Moov Money',
  stripe: 'Stripe (Carte)',
  cod: 'Paiement livraison',
  manual: 'Manuel',
  mobile_money: 'Mobile Money',
  card: 'Carte',
  other: 'Autre',
  unknown: 'Inconnu',
};

interface Props {
  data: Array<{ provider: string; orders: number; revenue: number }>;
  currency: string;
}

export function PaymentDonutChart({ data, currency }: Props) {
  const total = data.reduce((s, d) => s + d.revenue, 0);
  if (total === 0) {
    return (
      <div className="grid h-full min-h-[260px] place-items-center text-sm text-muted-foreground">
        Aucune vente sur la période.
      </div>
    );
  }
  const chartData = data.map((d) => ({
    ...d,
    label: PROVIDER_LABEL[d.provider] || d.provider,
  }));

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto h-[180px] w-[180px] shrink-0 sm:mx-0 sm:h-[200px] sm:w-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="revenue"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(value, _name, item) => {
                const v = Number(value);
                const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
                return [`${formatCurrency(v, currency)} (${pct}%)`, item.payload?.label || ''];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</div>
          <div className="px-2 text-xs font-bold sm:text-sm">{formatCurrency(total, currency)}</div>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {chartData.map((d, i) => {
          const pct = total > 0 ? (d.revenue / total) * 100 : 0;
          return (
            <li key={d.provider} className="flex items-center gap-2 text-[11px] sm:gap-3 sm:text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="min-w-0 flex-1 truncate font-medium">{d.label}</span>
              <span className="hidden shrink-0 font-mono text-muted-foreground sm:inline">{pct.toFixed(0)}%</span>
              <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(d.revenue, currency)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
