'use client';

import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: string;
  delta?: number | null;
  /** Inverts the color of the delta: true means "down is good" (e.g. refund rate). */
  invertDelta?: boolean;
  hint?: string;
  icon?: LucideIcon;
  accent?: 'pink' | 'violet' | 'emerald' | 'amber' | 'sky' | 'slate';
}

/**
 * Compact ecommerce KPI tile — clean white card, value-first hierarchy,
 * tiny coloured chip for the icon and a single thin delta pill. No
 * decorative blur halos; the tile reads at a glance even when 8+ of
 * them sit in a dense grid.
 */
const ACCENT_BG: Record<NonNullable<KpiCardProps['accent']>, string> = {
  pink:    'bg-pink-500/10 text-pink-600',
  violet:  'bg-violet-500/10 text-violet-600',
  emerald: 'bg-emerald-500/10 text-emerald-600',
  amber:   'bg-amber-500/10 text-amber-600',
  sky:     'bg-sky-500/10 text-sky-600',
  slate:   'bg-slate-500/10 text-slate-600',
};

export function KpiCard({ label, value, delta, invertDelta, hint, icon: Icon, accent = 'slate' }: KpiCardProps) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  const isUp = hasDelta && (delta as number) > 0;
  const isDown = hasDelta && (delta as number) < 0;
  const positive = invertDelta ? isDown : isUp;
  const negative = invertDelta ? isUp : isDown;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg', ACCENT_BG[accent])}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      <div className="break-words text-2xl font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </div>

      <div className="flex items-center gap-1.5">
        {hasDelta ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium leading-none',
              positive && 'bg-emerald-500/10 text-emerald-700',
              negative && 'bg-rose-500/10 text-rose-700',
              !positive && !negative && 'bg-muted text-muted-foreground'
            )}
          >
            {isUp ? <ArrowUpRight className="h-3 w-3" /> : isDown ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {Math.abs(delta as number).toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
