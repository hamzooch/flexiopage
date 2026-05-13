'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '@/lib/utils';
import { useIsMobile } from '@/lib/use-is-mobile';

interface DataPoint {
  date: string;
  revenue: number;
  orders: number;
  paid: number;
}

interface Props {
  data: DataPoint[];
  currency: string;
  /** When true, x-axis labels are months (12m view). */
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

export function RevenueAreaChart({ data, currency, monthly = false }: Props) {
  const isMobile = useIsMobile();
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 220 : 320}>
      <AreaChart data={data} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ec4899" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ord-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
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
          yAxisId="rev"
          tick={{ fontSize: isMobile ? 10 : 11, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => {
            const n = Number(v);
            if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
            if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
            return String(n);
          }}
          width={isMobile ? 36 : 48}
        />
        <YAxis yAxisId="ord" orientation="right" hide />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 12,
            fontSize: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,.08)',
          }}
          labelFormatter={(value) => formatTickDate(String(value), monthly)}
          formatter={(value, name) => {
            if (name === 'revenue') return [formatCurrency(Number(value), currency), 'Revenu'];
            if (name === 'paid') return [Number(value), 'Commandes payées'];
            if (name === 'orders') return [Number(value), 'Commandes'];
            return [String(value), String(name)];
          }}
        />
        <Area
          yAxisId="rev"
          type="monotone"
          dataKey="revenue"
          stroke="#ec4899"
          strokeWidth={2}
          fill="url(#rev-grad)"
        />
        <Area
          yAxisId="ord"
          type="monotone"
          dataKey="paid"
          stroke="#7c3aed"
          strokeWidth={2}
          fill="url(#ord-grad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
