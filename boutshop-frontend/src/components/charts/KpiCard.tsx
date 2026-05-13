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

const ACCENT: Record<NonNullable<KpiCardProps['accent']>, string> = {
  pink: 'from-pink-500/15 to-pink-500/0 text-pink-600',
  violet: 'from-violet-500/15 to-violet-500/0 text-violet-600',
  emerald: 'from-emerald-500/15 to-emerald-500/0 text-emerald-600',
  amber: 'from-amber-500/15 to-amber-500/0 text-amber-600',
  sky: 'from-sky-500/15 to-sky-500/0 text-sky-600',
  slate: 'from-slate-500/15 to-slate-500/0 text-slate-600',
};

export function KpiCard({ label, value, delta, invertDelta, hint, icon: Icon, accent = 'slate' }: KpiCardProps) {
  const hasDelta = delta !== undefined && delta !== null && Number.isFinite(delta);
  const isUp = hasDelta && (delta as number) > 0;
  const isDown = hasDelta && (delta as number) < 0;
  const positive = invertDelta ? isDown : isUp;
  const negative = invertDelta ? isUp : isDown;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm transition-all hover:shadow-md sm:p-5">
      <div className={cn('pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br opacity-70 blur-2xl', ACCENT[accent])} />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">{label}</div>
        {Icon && (
          <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br sm:h-8 sm:w-8', ACCENT[accent])}>
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </span>
        )}
      </div>
      <div className="relative mt-2 break-words text-lg font-bold leading-tight tracking-tight sm:mt-3 sm:text-2xl">{value}</div>
      <div className="relative mt-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
        {hasDelta ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:text-[11px]',
              positive && 'bg-emerald-500/10 text-emerald-700',
              negative && 'bg-rose-500/10 text-rose-700',
              !positive && !negative && 'bg-muted text-muted-foreground'
            )}
          >
            {isUp ? <ArrowUpRight className="h-3 w-3" /> : isDown ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {Math.abs(delta as number).toFixed(1)}%
          </span>
        ) : (
          <span className="text-[10px] font-medium text-muted-foreground sm:text-[11px]">—</span>
        )}
        {hint && <span className="hidden text-[11px] text-muted-foreground sm:inline">{hint}</span>}
      </div>
    </div>
  );
}
