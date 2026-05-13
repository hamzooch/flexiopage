'use client';

import type { RangeKey } from '@/types/analytics';
import { cn } from '@/lib/utils';

const RANGES: Array<{ id: RangeKey; label: string; short: string }> = [
  { id: '7d', label: '7 jours', short: '7j' },
  { id: '30d', label: '30 jours', short: '30j' },
  { id: '90d', label: '90 jours', short: '90j' },
  { id: '12m', label: '12 mois', short: '12m' },
];

interface Props {
  value: RangeKey;
  onChange: (next: RangeKey) => void;
}

export function RangeSwitcher({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-border/60 bg-card p-1 shadow-sm sm:gap-1">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onChange(r.id)}
          className={cn(
            'rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-all sm:px-3 sm:text-xs',
            value === r.id
              ? 'bg-gradient-to-br from-pink-500 to-violet-600 text-white shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {/* Short labels on mobile (7j/30j) to fit at 320px without horizontal scroll. */}
          <span className="sm:hidden">{r.short}</span>
          <span className="hidden sm:inline">{r.label}</span>
        </button>
      ))}
    </div>
  );
}
