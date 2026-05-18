'use client';

/**
 * Timer preset picker — one-click templates the seller can apply to a
 * product or store-wide product page. Each preset computes its own
 * `endsAt` relative to "now" (e.g. +24h, end of weekend, end of month).
 *
 * The "personnalisé" tile is just a reset that clears the current preset
 * id and lets the seller tweak the date/headline/color freely.
 */

import {
  Zap, Flame, Calendar, Sparkles, ShoppingBag, Sun, Snowflake, Heart,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TimerValue {
  endsAt?: string;
  headline?: string;
  accentColor?: string;
}

interface PresetDef {
  id: string;
  label: string;
  hint: string;
  /** lucide icon component for the tile. */
  icon: typeof Zap;
  /** Tailwind color class for the icon chip background. */
  iconBg: string;
  /** Computes the values to apply when the preset is picked. */
  compute: () => Required<TimerValue>;
}

/** Helper: add hours to "now" and return an ISO string. */
function inHours(h: number): string {
  return new Date(Date.now() + h * 3600 * 1000).toISOString();
}

/** Helper: midnight at the end of the upcoming Sunday (Europe-ish). */
function endOfNextWeekend(): string {
  const d = new Date();
  // Sunday = 0 in JS. We want the next Sunday at 23:59:59 local time.
  const day = d.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + daysUntilSunday);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** Helper: midnight at the end of today. */
function endOfToday(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** Helper: midnight at the end of the current month. */
function endOfMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0); // last day of current month
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export const TIMER_PRESETS: PresetDef[] = [
  {
    id: 'flash-24',
    label: 'Flash 24 h',
    hint: 'Urgence courte — convertit fort sur les pubs',
    icon: Zap,
    iconBg: 'from-rose-500 to-red-600',
    compute: () => ({ endsAt: inHours(24), headline: 'Offre flash — finit dans', accentColor: '#ef4444' }),
  },
  {
    id: 'promo-48',
    label: 'Promo 48 h',
    hint: 'Deux jours pour décider',
    icon: Flame,
    iconBg: 'from-amber-500 to-orange-600',
    compute: () => ({ endsAt: inHours(48), headline: 'Promo limitée — finit dans', accentColor: '#f59e0b' }),
  },
  {
    id: 'today',
    label: 'Aujourd\'hui seulement',
    hint: 'Termine à minuit',
    icon: Sun,
    iconBg: 'from-yellow-500 to-amber-600',
    compute: () => ({ endsAt: endOfToday(), headline: 'Offre du jour — encore', accentColor: '#eab308' }),
  },
  {
    id: 'weekend',
    label: 'Offre weekend',
    hint: 'Jusqu\'à dimanche soir',
    icon: Calendar,
    iconBg: 'from-violet-500 to-fuchsia-600',
    compute: () => ({ endsAt: endOfNextWeekend(), headline: 'Offre weekend — finit dimanche', accentColor: '#8b5cf6' }),
  },
  {
    id: 'stock-72',
    label: 'Stock limité',
    hint: 'Sur 72 h — pousse la rareté',
    icon: ShoppingBag,
    iconBg: 'from-red-600 to-rose-700',
    compute: () => ({ endsAt: inHours(72), headline: 'Stock limité — réserve vite', accentColor: '#b91c1c' }),
  },
  {
    id: 'soldes-7',
    label: 'Soldes 7 jours',
    hint: 'Une semaine complète',
    icon: Sparkles,
    iconBg: 'from-pink-500 to-rose-500',
    compute: () => ({ endsAt: inHours(24 * 7), headline: 'Soldes — jusqu\'à la fin', accentColor: '#ec4899' }),
  },
  {
    id: 'black-friday',
    label: 'Black Friday',
    hint: '24 h en noir — opération éclair',
    icon: Snowflake,
    iconBg: 'from-slate-700 to-black',
    compute: () => ({ endsAt: inHours(24), headline: 'Black Friday — dernière chance', accentColor: '#0a0a0a' }),
  },
  {
    id: 'end-month',
    label: 'Fin de mois',
    hint: 'Jusqu\'au dernier jour du mois',
    icon: Heart,
    iconBg: 'from-emerald-500 to-teal-600',
    compute: () => ({ endsAt: endOfMonth(), headline: 'Promo du mois — finit dans', accentColor: '#10b981' }),
  },
];

interface Props {
  /** Current value — used to highlight the matching preset when its
   *  signature still matches what's stored (best-effort: headline + color). */
  value?: TimerValue;
  onApply: (next: TimerValue) => void;
  /** Render a "Personnalisé" tile that lets the seller clear preset
   *  selection and edit dates/headline/color freely. Defaults to true. */
  allowCustom?: boolean;
}

export function TimerPresetPicker({ value, onApply, allowCustom = true }: Props) {
  // Best-effort match: a preset is considered "applied" when both the
  // headline AND the accent color match what's currently stored. This is
  // intentionally loose — exact date matching would always fail since the
  // preset is computed relative to "now".
  const activeId = TIMER_PRESETS.find((p) => {
    if (!value) return false;
    const sig = p.compute();
    return value.headline === sig.headline && value.accentColor === sig.accentColor;
  })?.id;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Modèles
        </p>
        {activeId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Check className="h-2.5 w-2.5" />
            Modèle actif
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {TIMER_PRESETS.map((p) => {
          const Icon = p.icon;
          const active = activeId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onApply(p.compute())}
              title={p.hint}
              className={cn(
                'group relative flex flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left transition-all',
                active
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/15'
                  : 'border-border/60 hover:border-primary/40 hover:bg-muted/30'
              )}
            >
              <span
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm',
                  p.iconBg
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold leading-tight">{p.label}</div>
                <div className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                  {p.hint}
                </div>
              </div>
              {active && (
                <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-primary" />
              )}
            </button>
          );
        })}
        {allowCustom && (
          <button
            type="button"
            onClick={() => onApply({ endsAt: undefined, headline: undefined, accentColor: undefined })}
            className={cn(
              'flex flex-col items-start gap-1.5 rounded-xl border border-dashed border-border/70 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/30',
              !activeId && !!value?.endsAt && 'border-primary/30 bg-muted/30'
            )}
            title="Saisis tes propres dates et textes"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg border-2 border-dashed border-border text-muted-foreground">
              ⚙
            </span>
            <div>
              <div className="text-xs font-bold leading-tight">Personnalisé</div>
              <div className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                Sans modèle — édite tout à la main
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
