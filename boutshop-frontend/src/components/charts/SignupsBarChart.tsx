'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useIsMobile } from '@/lib/use-is-mobile';

interface Props {
  data: Array<{ date: string; signups: number }>;
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

export function SignupsBarChart({ data, monthly = false }: Props) {
  const isMobile = useIsMobile();
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 180 : 240}>
      <BarChart data={data} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="signups-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#0284c7" stopOpacity={0.6} />
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
          allowDecimals={false}
          width={isMobile ? 28 : 32}
        />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 12,
            fontSize: 12,
          }}
          labelFormatter={(value) => formatTickDate(String(value), monthly)}
          formatter={(value) => [Number(value), 'Nouveaux comptes']}
        />
        <Bar dataKey="signups" fill="url(#signups-grad)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
