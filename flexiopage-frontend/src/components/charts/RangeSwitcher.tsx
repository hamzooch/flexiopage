'use client';

import type { RangeKey } from '@/types/analytics';
import { cn } from '@/lib/utils';

const RANGES: Array<{ id: RangeKey; label: string; short: string }> = [
  { id: 'today', label: "Aujourd'hui", short: 'Auj.' },
  { id: 'yesterday', label: 'Hier', short: 'Hier' },
  { id: '7d', label: '7 jours', short: '7j' },
  { id: '30d', label: '30 jours', short: '30j' },
  { id: '90d', label: '90 jours', short: '90j' },
  { id: '12m', label: '12 mois', short: '12m' },
  { id: 'all', label: 'Tous les temps', short: 'Tout' },
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
            'min-h-9 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3',
            value === r.id
              ? 'bg-foreground text-background'
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
