'use client';

import { useMemo } from 'react';
import {
  AlertTriangle,
  Calculator,
  Megaphone,
  Package,
  PiggyBank,
  Receipt,
  Tag,
  TrendingDown,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, formatCurrency } from '@/lib/utils';

export interface ProfitInputs {
  /** Sale price shown to the buyer. */
  price: number;
  /** Unit cost (COGS) — what one unit costs the seller. */
  cost: number;
  /** Per-order shipping cost paid by the seller. */
  shippingCost: number;
  /** Per-order packaging cost (box, tape, label…). */
  packagingCost: number;
  /** Average marketing spend per sale (CPA). */
  marketingCost: number;
  /** Payment processor percentage fee (e.g. 2.9 for 2.9%). */
  paymentFeePct: number;
  /** Payment processor fixed fee per transaction. */
  paymentFeeFixed: number;
}

export const EMPTY_PROFIT_INPUTS: ProfitInputs = {
  price: 0,
  cost: 0,
  shippingCost: 0,
  packagingCost: 0,
  marketingCost: 0,
  paymentFeePct: 0,
  paymentFeeFixed: 0,
};

export interface ProfitBreakdown {
  variableCost: number;
  paymentFee: number;
  totalCost: number;
  profit: number;
  /** Net profit as a % of sale price — the gross margin most sellers think in. */
  marginPct: number;
  /** Net profit as a % of total cost — useful for pricing decisions. */
  markupPct: number;
  /** Return on ad spend (price / marketing). null when no marketing spend. */
  roas: number | null;
}

export function computeProfit(i: ProfitInputs): ProfitBreakdown {
  const paymentFee = (i.paymentFeePct * i.price) / 100 + i.paymentFeeFixed;
  const variableCost = i.cost + i.shippingCost + i.packagingCost + i.marketingCost;
  const totalCost = variableCost + paymentFee;
  const profit = i.price - totalCost;
  const marginPct = i.price > 0 ? (profit / i.price) * 100 : 0;
  const markupPct = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const roas = i.marketingCost > 0 ? i.price / i.marketingCost : null;
  return { variableCost, paymentFee, totalCost, profit, marginPct, markupPct, roas };
}

type Verdict = {
  label: string;
  tone: 'emerald' | 'amber' | 'red' | 'slate';
  Icon: React.ComponentType<{ className?: string }>;
  detail: string;
};

function getVerdict(b: ProfitBreakdown, price: number): Verdict {
  if (price <= 0) {
    return { label: 'Saisis un prix', tone: 'slate', Icon: Calculator, detail: 'Le prix de vente est requis pour calculer la rentabilité.' };
  }
  if (b.profit < 0) {
    return { label: 'Tu perds de l\'argent', tone: 'red', Icon: TrendingDown, detail: 'Chaque vente te coûte plus qu\'elle ne te rapporte.' };
  }
  if (b.marginPct < 10) {
    return { label: 'Marge très faible', tone: 'amber', Icon: AlertTriangle, detail: 'Sous 10 %, le moindre imprévu (retour, frais bancaire) te fait passer en perte.' };
  }
  if (b.marginPct < 25) {
    return { label: 'Rentable', tone: 'emerald', Icon: TrendingUp, detail: 'Marge correcte. Optimise le coût d\'achat ou les frais pub pour gagner plus.' };
  }
  return { label: 'Très rentable', tone: 'emerald', Icon: TrendingUp, detail: 'Excellente marge — produit à pousser en priorité.' };
}

const TONE_BG: Record<Verdict['tone'], string> = {
  emerald: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
  amber: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  red: 'bg-red-500/10 text-red-700 border-red-500/30',
  slate: 'bg-muted text-muted-foreground border-border',
};

interface Props {
  value: ProfitInputs;
  onChange: (next: ProfitInputs) => void;
  currency?: string;
  /** When false, the card chrome is rendered without the outer <Card>. */
  embedded?: boolean;
}

export function ProfitCalculator({ value, onChange, currency = 'USD', embedded = false }: Props) {
  const breakdown = useMemo(() => computeProfit(value), [value]);
  const verdict = useMemo(() => getVerdict(breakdown, value.price), [breakdown, value.price]);

  function setField<K extends keyof ProfitInputs>(key: K, raw: string) {
    // Empty string => 0. Negative values are clamped to 0 (you can't have a
    // negative cost — if a seller wants to model "earned discount" they should
    // lower the cost field directly, not type a negative number here).
    const n = Math.max(0, parseFloat(raw.replace(',', '.')) || 0);
    onChange({ ...value, [key]: n });
  }

  const body = (
    <div className="space-y-5">
      {/* Inputs grid — 2 cols on mobile, 3 on tablet. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field
          icon={Tag}
          label="Prix de vente"
          value={value.price}
          onChange={(v) => setField('price', v)}
          currency={currency}
        />
        <Field
          icon={Package}
          label="Coût d'achat"
          hint="par unité"
          value={value.cost}
          onChange={(v) => setField('cost', v)}
          currency={currency}
        />
        <Field
          icon={Truck}
          label="Livraison"
          hint="payée par toi"
          value={value.shippingCost}
          onChange={(v) => setField('shippingCost', v)}
          currency={currency}
        />
        <Field
          icon={Package}
          label="Emballage"
          value={value.packagingCost}
          onChange={(v) => setField('packagingCost', v)}
          currency={currency}
        />
        <Field
          icon={Megaphone}
          label="Pub par vente"
          hint="CPA moyen"
          value={value.marketingCost}
          onChange={(v) => setField('marketingCost', v)}
          currency={currency}
        />
        <Field
          icon={Receipt}
          label="Frais paiement"
          hint="% du prix"
          value={value.paymentFeePct}
          onChange={(v) => setField('paymentFeePct', v)}
          suffix="%"
        />
      </div>

      {/* Breakdown line — what each currency is going to. */}
      <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2 text-sm">
        <Row label="Coûts variables (achat + livraison + emballage + pub)" value={formatCurrency(breakdown.variableCost, currency)} />
        <Row label="Frais de paiement" value={formatCurrency(breakdown.paymentFee, currency)} />
        <div className="border-t border-border/60 pt-2">
          <Row bold label="Coût total par vente" value={formatCurrency(breakdown.totalCost, currency)} />
        </div>
        <div className={cn('rounded-lg px-3 py-2 -mx-1', breakdown.profit >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10')}>
          <Row
            bold
            label="Profit net par vente"
            value={
              <span className={cn('font-bold tabular-nums', breakdown.profit >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                {breakdown.profit >= 0 ? '+' : ''}{formatCurrency(breakdown.profit, currency)}
              </span>
            }
          />
        </div>
      </div>

      {/* Three quick metrics. */}
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Marge" value={`${breakdown.marginPct.toFixed(1)}%`} hint="profit / prix" />
        <Metric label="Markup" value={`${breakdown.markupPct.toFixed(1)}%`} hint="profit / coût" />
        <Metric
          label="ROAS"
          value={breakdown.roas !== null ? `×${breakdown.roas.toFixed(2)}` : '—'}
          hint={breakdown.roas !== null ? 'rev. / pub' : 'pas de pub'}
        />
      </div>

      {/* Verdict banner. */}
      <div className={cn('flex items-start gap-3 rounded-2xl border p-4', TONE_BG[verdict.tone])}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-background/60">
          <verdict.Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{verdict.label}</div>
          <p className="mt-0.5 text-xs opacity-90">{verdict.detail}</p>
        </div>
      </div>

      {/* Projection footnote — multiplies the unit profit by 100. */}
      {breakdown.profit !== 0 && value.price > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          <PiggyBank className="h-3.5 w-3.5" />
          Sur 100 ventes : <span className={cn('font-semibold tabular-nums', breakdown.profit >= 0 ? 'text-emerald-700' : 'text-red-700')}>
            {breakdown.profit >= 0 ? '+' : ''}{formatCurrency(breakdown.profit * 100, currency)}
          </span>
        </div>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-primary" />
          Calculatrice de profit
        </CardTitle>
        <CardDescription className="text-xs">
          Saisis tes coûts par vente — on calcule ta marge en temps réel pour savoir si ce produit est rentable.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

function Field({
  icon: Icon,
  label,
  hint,
  value,
  onChange,
  currency,
  suffix,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  value: number;
  onChange: (raw: string) => void;
  currency?: string;
  suffix?: string;
}) {
  return (
    <div>
      <Label className="flex items-center gap-1.5 text-xs">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </Label>
      <div className="relative mt-1.5">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 pr-12 tabular-nums"
          placeholder="0"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium uppercase text-muted-foreground">
          {suffix || currency}
        </span>
      </div>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', bold && 'font-semibold')}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}
