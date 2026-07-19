'use client';

/**
 * Funnel COD 6 étapes — spécifique dropshipping COD Afrique de l'Ouest /
 * MENA. Chaque étape montre :
 *   - le nombre absolu
 *   - le taux de conversion vs l'étape précédente
 *   - le drop-off en rouge à droite quand il y a de la casse
 *
 * Le vendeur voit d'un coup où il perd de l'argent (typiquement au
 * "confirmé" et au "livré"). Le mode 3-étapes historique (Créées/Payées/
 * Livrées) reste disponible via `mode='simple'` pour la card dashboard.
 */
interface FunnelData {
  created: number;
  contacted?: number;
  confirmed?: number;
  dispatched?: number;
  delivered?: number;
  paid: number;
  fulfilled: number;
  refunded: number;
}

interface Props {
  funnel: FunnelData;
  /** 'full' = 6 étapes COD complètes ; 'simple' = 3 étapes historique. */
  mode?: 'full' | 'simple';
}

type StepKey = 'created' | 'contacted' | 'confirmed' | 'dispatched' | 'delivered' | 'paid' | 'fulfilled';

const FULL_STEPS: Array<{ key: StepKey; label: string; hint: string; color: string }> = [
  { key: 'created',    label: 'Créées',      hint: 'Commande passée par le client', color: 'from-slate-500 to-slate-600' },
  { key: 'contacted',  label: 'Contactées',  hint: 'Agent a touché la commande',    color: 'from-sky-500 to-sky-600' },
  { key: 'confirmed',  label: 'Confirmées',  hint: 'Client a validé au téléphone',  color: 'from-indigo-500 to-indigo-600' },
  { key: 'dispatched', label: 'Dispatchées', hint: 'Envoyées au transporteur',      color: 'from-violet-500 to-violet-600' },
  { key: 'delivered',  label: 'Livrées',     hint: 'Coursier confirme livraison',   color: 'from-fuchsia-500 to-fuchsia-600' },
  { key: 'paid',       label: 'Payées',      hint: 'COD encaissé à la livraison',   color: 'from-emerald-500 to-emerald-600' },
];

const SIMPLE_STEPS: Array<{ key: StepKey; label: string; hint: string; color: string }> = [
  { key: 'created',   label: 'Commandes créées', hint: '',                            color: 'from-sky-500 to-sky-600' },
  { key: 'paid',      label: 'Payées',           hint: '',                            color: 'from-violet-500 to-violet-600' },
  { key: 'fulfilled', label: 'Livrées',          hint: '',                            color: 'from-emerald-500 to-emerald-600' },
];

export function FunnelChart({ funnel, mode = 'simple' }: Props) {
  const steps = mode === 'full' ? FULL_STEPS : SIMPLE_STEPS;
  const max = Math.max(funnel.created, 1);
  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const v = (funnel[step.key] as number | undefined) ?? 0;
        const w = Math.max((v / max) * 100, 4);
        const prev = i === 0 ? v : ((funnel[steps[i - 1].key] as number | undefined) ?? 0);
        const conv = prev > 0 ? (v / prev) * 100 : 0;
        const drop = i === 0 ? 0 : Math.max(prev - v, 0);
        return (
          <div key={step.key} className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-x-2 text-[11px] sm:text-xs">
              <span className="min-w-0 truncate font-medium">
                {step.label}
                {step.hint && <span className="ml-1 hidden text-[10px] font-normal text-muted-foreground sm:inline">— {step.hint}</span>}
              </span>
              <span className="shrink-0 text-muted-foreground">
                <span className="font-bold text-foreground">{v}</span>
                {i > 0 && (
                  <>
                    <span className="ml-1.5 sm:ml-2">({conv.toFixed(0)}%)</span>
                    {drop > 0 && <span className="ml-1.5 text-rose-600">−{drop}</span>}
                  </>
                )}
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
          <span className="font-medium text-rose-700">Remboursées / annulées</span>
          <span className="font-bold text-rose-700">{funnel.refunded}</span>
        </div>
      )}
      {mode === 'full' && funnel.created > 0 && (
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[10px] text-muted-foreground">
          Taux de conversion global (Créées → Livrées) :{' '}
          <span className="font-bold text-foreground">
            {((funnel.delivered || 0) / funnel.created * 100).toFixed(1)}%
          </span>
          {' — c\'est LA métrique COD à optimiser (typique : 40-65%).'}
        </div>
      )}
    </div>
  );
}
