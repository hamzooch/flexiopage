'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { useIsMobile } from '@/lib/use-is-mobile';

interface Props {
  data: Array<{ date: string; commission: number }>;
  currency: string;
  monthly?: boolean;
}

function formatTickDate(value: string, monthly: boolean): string {
  if (!value) return '';
  if (monthly) {
    const [, m] = value.split('-');
    const idx = Number(m) - 1;
    return ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'][idx] || value;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function CommissionAreaChart({ data, currency, monthly = false }: Props) {
  const isMobile = useIsMobile();
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
      <AreaChart data={data} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="commission-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: isMobile ? 10 : 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatTickDate(String(v), monthly)}
          minTickGap={isMobile ? 40 : 20}
        />
        <YAxis
          tick={{ fontSize: isMobile ? 10 : 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => {
            const n = Number(v);
            if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
            if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
            return String(n);
          }}
          width={isMobile ? 32 : 42}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 12,
            fontSize: 12,
          }}
          labelFormatter={(value) => formatTickDate(String(value), monthly)}
          formatter={(value) => [formatCurrency(Number(value), currency), 'Commission']}
        />
        <Area type="monotone" dataKey="commission" stroke="#10b981" strokeWidth={2} fill="url(#commission-grad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
