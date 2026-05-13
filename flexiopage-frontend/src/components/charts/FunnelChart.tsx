'use client';

interface Props {
  funnel: { created: number; paid: number; fulfilled: number; refunded: number };
}

const STEPS: Array<{ key: 'created' | 'paid' | 'fulfilled'; label: string; color: string }> = [
  { key: 'created', label: 'Commandes créées', color: 'from-sky-500 to-sky-600' },
  { key: 'paid', label: 'Payées', color: 'from-violet-500 to-violet-600' },
  { key: 'fulfilled', label: 'Livrées', color: 'from-emerald-500 to-emerald-600' },
];

export function FunnelChart({ funnel }: Props) {
  const max = Math.max(funnel.created, 1);
  return (
    <div className="space-y-3">
      {STEPS.map((step, i) => {
        const v = funnel[step.key];
        const w = Math.max((v / max) * 100, 4);
        const prev = i === 0 ? v : funnel[STEPS[i - 1].key];
        const conv = prev > 0 ? (v / prev) * 100 : 0;
        return (
          <div key={step.key} className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-x-2 text-[11px] sm:text-xs">
              <span className="min-w-0 truncate font-medium">{step.label}</span>
              <span className="shrink-0 text-muted-foreground">
                <span className="font-bold text-foreground">{v}</span>
                {i > 0 && <span className="ml-1.5 sm:ml-2">({conv.toFixed(0)}%)</span>}
              </span>
            </div>
            <div className="relative h-8 overflow-hidden rounded-lg bg-muted/40 sm:h-9">
              <div
                className={`h-full rounded-lg bg-gradient-to-r ${step.color} shadow-sm transition-all duration-500`}
                style={{ width: `${w}%` }}
              />
            </div>
          </div>
        );
      })}
      {funnel.refunded > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs">
          <span className="font-medium text-rose-700">Remboursées</span>
          <span className="font-bold text-rose-700">{funnel.refunded}</span>
        </div>
      )}
    </div>
  );
}
