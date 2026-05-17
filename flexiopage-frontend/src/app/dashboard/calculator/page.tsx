'use client';

/**
 * COD Profit Calculator — full scenario sandbox.
 *
 * Sellers tune the ads / call-center / shipping inputs, see funnel + breakdown
 * live, and save named scenarios ("Hijab campaign Morocco") to MongoDB so they
 * can compare ad creatives later. The math lives in `cod-calculator.ts` so the
 * backend can re-run an identical calculation on save.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Calculator,
  ChevronDown,
  Globe2,
  HelpCircle,
  History,
  Loader2,
  Megaphone,
  Package,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Wand2,
  X,
} from 'lucide-react';
import {
  Cell,
  Funnel,
  FunnelChart as RechartsFunnel,
  LabelList,
  Legend as RechartsLegend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/dashboard/page-header';
import { calculatorApi, type CalculatorSnapshot } from '@/lib/api';
import {
  calculate,
  COUNTRY_PRESETS,
  EMPTY_INPUTS,
  roasVerdict,
  type CalculatorInputs,
} from '@/lib/cod-calculator';
import { cn, formatCurrency } from '@/lib/utils';

export default function CodCalculatorPage() {
  const [inputs, setInputs] = useState<CalculatorInputs>(EMPTY_INPUTS);
  const [currency, setCurrency] = useState('USD');
  const [advanced, setAdvanced] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<CalculatorSnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeCountry, setActiveCountry] = useState<string | null>(null);
  // Tiny ephemeral banner — the project doesn't ship a useToast hook.
  const [feedback, setFeedback] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const flash = useCallback((text: string, kind: 'info' | 'error' = 'info') => {
    setFeedback({ kind, text });
    setTimeout(() => setFeedback(null), 2500);
  }, []);

  // Live calculation — debounced. The math itself is cheap, but the debounce
  // keeps the recharts re-renders from feeling janky when the user types
  // fast in a numeric field.
  const [outputs, setOutputs] = useState(() => calculate(EMPTY_INPUTS));
  useEffect(() => {
    const handle = setTimeout(() => setOutputs(calculate(inputs)), 200);
    return () => clearTimeout(handle);
  }, [inputs]);

  const setField = useCallback(<K extends keyof CalculatorInputs>(key: K, raw: string) => {
    setInputs((prev) => {
      const n = raw === '' ? 0 : Math.max(0, parseFloat(raw.replace(',', '.')) || 0);
      // Percentage fields are clamped at 100 — a deliveryRate of 250% would
      // silently break every downstream number.
      const isPct =
        key === 'confirmationRate' ||
        key === 'deliveryRate' ||
        key === 'codFeePercent' ||
        key === 'ctr' ||
        key === 'landingConversionRate';
      const value = isPct ? Math.min(n, 100) : n;
      return { ...prev, [key]: value };
    });
  }, []);

  const applyPreset = useCallback((code: string) => {
    const preset = COUNTRY_PRESETS.find((p) => p.code === code);
    if (!preset) return;
    setActiveCountry(code);
    setCurrency(preset.currency);
    setInputs((prev) => ({ ...prev, ...preset.defaults }));
  }, []);

  const resetAll = useCallback(() => {
    setInputs(EMPTY_INPUTS);
    setActiveCountry(null);
    flash('Calculatrice réinitialisée');
  }, [flash]);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await calculatorApi.list();
      setHistory(res.data.snapshots);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (historyOpen && history.length === 0) void refreshHistory();
  }, [historyOpen, history.length, refreshHistory]);

  async function handleSave() {
    if (inputs.adBudget <= 0 || inputs.sellingPrice <= 0) {
      flash('Saisis au moins le prix de vente et le budget pub', 'error');
      return;
    }
    const name = window.prompt(
      'Nom du scénario',
      activeCountry
        ? `Scénario ${COUNTRY_PRESETS.find((p) => p.code === activeCountry)?.name} — ${new Date().toLocaleDateString('fr-FR')}`
        : `Scénario ${new Date().toLocaleDateString('fr-FR')}`,
    );
    if (!name) return;
    setSaving(true);
    try {
      const res = await calculatorApi.save({ name, inputs, country: activeCountry || undefined });
      setHistory((prev) => [res.data.snapshot, ...prev]);
      flash('Scénario sauvegardé');
    } catch {
      flash('Impossible de sauvegarder', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleLoad(snap: CalculatorSnapshot) {
    setInputs(snap.inputs);
    if (snap.country) setActiveCountry(snap.country);
    setHistoryOpen(false);
    flash(`Chargé : ${snap.name}`);
  }

  async function handleDelete(id: string) {
    try {
      await calculatorApi.remove(id);
      setHistory((prev) => prev.filter((s) => s._id !== id));
      flash('Scénario supprimé');
    } catch {
      flash('Suppression impossible', 'error');
    }
  }

  // Empty state — no inputs at all => render a welcoming pitch instead of
  // a bunch of zeroes that look like a broken page.
  const isEmpty = inputs.sellingPrice === 0 && inputs.adBudget === 0;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Calculator}
        title="Calculatrice de profit COD"
        description="Estime ton profit net AVANT de lancer ta campagne pub : leads → confirmés → livrés → cash."
        actions={
          <>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              aria-label="Historique des scénarios"
              title="Historique"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-card px-2.5 text-xs font-semibold transition-colors hover:bg-muted sm:px-3"
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Historique</span>
            </button>
            <button
              type="button"
              onClick={resetAll}
              aria-label="Réinitialiser"
              title="Réinitialiser"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-card px-2.5 text-xs font-semibold transition-colors hover:bg-muted sm:px-3"
            >
              <X className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || isEmpty}
              aria-label="Sauvegarder le scénario"
              title="Sauvegarder"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl gradient-brand px-2.5 text-xs font-semibold text-white shadow-md shadow-primary/25 transition-opacity hover:opacity-95 disabled:opacity-50 sm:px-3"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Sauvegarder</span>
            </button>
          </>
        }
      />

      {feedback && (
        <div className={cn(
          'rounded-xl border px-3 py-2 text-xs font-medium',
          feedback.kind === 'error'
            ? 'border-red-500/30 bg-red-500/10 text-red-700'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
        )}>
          {feedback.text}
        </div>
      )}

      <CountryPresets active={activeCountry} onPick={applyPreset} currency={currency} onCurrencyChange={setCurrency} />

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        {/* Left — inputs. Produit & Pub vivent côte à côte sur md+ pour gagner
            de la hauteur ; Opérations COD reste full-width en dessous (6 champs,
            besoin d'espace). */}
        <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <InputSection icon={Package} title="Produit & vente" tone="violet" defaultOpen>
            <Field
              label="Prix de vente unitaire"
              tooltip="Prix payé par le client à la livraison."
              currency={currency}
              value={inputs.sellingPrice}
              onChange={(v) => setField('sellingPrice', v)}
            />
            <Field
              label="Coût d'achat (COGS)"
              tooltip="Ce que tu paies par unité au fournisseur."
              currency={currency}
              value={inputs.productCost}
              onChange={(v) => setField('productCost', v)}
            />
            <Field
              label="Unités par commande"
              tooltip="Si tu vends en lot de 2, mets 2. Sinon laisse 1."
              value={inputs.unitsPerOrder}
              onChange={(v) => setField('unitsPerOrder', v)}
              suffix="unités"
            />
          </InputSection>

          <InputSection icon={Megaphone} title="Publicité (Meta / TikTok)" tone="pink" defaultOpen>
            <Field
              label="Budget pub total"
              tooltip="Combien tu vas dépenser sur Meta/TikTok pour cette campagne."
              currency={currency}
              value={inputs.adBudget}
              onChange={(v) => setField('adBudget', v)}
            />
            {!advanced && (
              <Field
                label="CPL (Cost Per Lead)"
                tooltip="Combien te coûte une personne qui remplit le formulaire de commande. Mets ton estimation ou regarde un dashboard d'ancienne campagne."
                currency={currency}
                value={inputs.cpl}
                onChange={(v) => setField('cpl', v)}
              />
            )}

            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {advanced ? 'Mode simple (CPL direct)' : 'Mode avancé (CPM × CTR × conv.)'}
            </button>

            {advanced && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border/60 bg-muted/30 p-3 sm:grid-cols-3">
                <Field
                  label="CPM"
                  tooltip="Coût pour 1000 impressions."
                  currency={currency}
                  value={inputs.cpm || 0}
                  onChange={(v) => setField('cpm', v)}
                  compact
                />
                <Field
                  label="CTR"
                  tooltip="Click-through rate — % d'impressions qui cliquent."
                  value={inputs.ctr || 0}
                  onChange={(v) => setField('ctr', v)}
                  suffix="%"
                  compact
                />
                <Field
                  label="Conv. landing"
                  tooltip="% de visiteurs landing qui deviennent leads."
                  value={inputs.landingConversionRate || 0}
                  onChange={(v) => setField('landingConversionRate', v)}
                  suffix="%"
                  compact
                />
                <p className="col-span-full text-[11px] text-muted-foreground">
                  CPL calculé : <span className="font-semibold tabular-nums text-foreground">{formatCurrency(outputs.effectiveCpl, currency)}</span>
                </p>
              </div>
            )}
          </InputSection>
        </div>

          <InputSection icon={Truck} title="Opérations COD" tone="emerald" defaultOpen>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Taux de confirmation"
                tooltip="% de leads qui confirment au téléphone (call center)."
                value={inputs.confirmationRate}
                onChange={(v) => setField('confirmationRate', v)}
                suffix="%"
              />
              <Field
                label="Taux de livraison"
                tooltip="% de commandes confirmées qui sont effectivement livrées."
                value={inputs.deliveryRate}
                onChange={(v) => setField('deliveryRate', v)}
                suffix="%"
              />
              <Field
                label="Coût shipping / livré"
                tooltip="Frais facturés par la société de livraison par colis livré."
                currency={currency}
                value={inputs.shippingCost}
                onChange={(v) => setField('shippingCost', v)}
              />
              <Field
                label="Coût retour / non livré"
                tooltip="Frais facturés par colis non livré (retour à l'expéditeur)."
                currency={currency}
                value={inputs.returnCost}
                onChange={(v) => setField('returnCost', v)}
              />
              <Field
                label="Coût call center / lead"
                tooltip="Optionnel — frais par appel de confirmation."
                currency={currency}
                value={inputs.callCenterCostPerLead}
                onChange={(v) => setField('callCenterCostPerLead', v)}
              />
              <Field
                label="Commission COD"
                tooltip="Commission prise par la société de livraison sur le cash collecté."
                value={inputs.codFeePercent}
                onChange={(v) => setField('codFeePercent', v)}
                suffix="%"
              />
            </div>
          </InputSection>
        </div>

        {/* Right — sticky results */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {isEmpty ? (
            <EmptyState />
          ) : (
            <>
              <KpiGrid outputs={outputs} currency={currency} />
              <FunnelCard outputs={outputs} />
              <CostBreakdownCard outputs={outputs} currency={currency} />
              <MetricsTable inputs={inputs} outputs={outputs} currency={currency} />
            </>
          )}
        </div>
      </div>

      {/* History drawer */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-foreground/40 backdrop-blur-sm" onClick={() => setHistoryOpen(false)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-background p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Scénarios sauvegardés</h2>
                <p className="text-xs text-muted-foreground">Clique sur un scénario pour le recharger.</p>
              </div>
              <button type="button" onClick={() => setHistoryOpen(false)} className="rounded-lg p-1.5 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            {historyLoading ? (
              <div className="grid h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : history.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-8 text-center text-sm text-muted-foreground">
                Aucun scénario. Lance ton premier calcul puis clique « Sauvegarder ».
              </p>
            ) : (
              <ul className="space-y-2">
                {history.map((s) => (
                  <li key={s._id} className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-primary/30">
                    <button type="button" onClick={() => handleLoad(s)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-semibold">{s.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>Profit : <span className={cn('font-semibold tabular-nums', s.outputs.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700')}>{formatCurrency(s.outputs.netProfit, currency)}</span></span>
                        <span>ROAS ×{s.outputs.roas.toFixed(2)}</span>
                        <span>{new Date(s.createdAt).toLocaleDateString('fr-FR')}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s._id)}
                      className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Country presets bar
// ─────────────────────────────────────────────────────────────────────
function CountryPresets({
  active,
  onPick,
  currency,
  onCurrencyChange,
}: {
  active: string | null;
  onPick: (code: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-2.5 sm:flex-row sm:items-center sm:gap-2">
      <div className="flex items-center gap-2 overflow-x-auto sm:flex-wrap sm:overflow-visible">
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Globe2 className="h-3.5 w-3.5" /> Pays :
        </span>
        {COUNTRY_PRESETS.map((p) => (
          <button
            key={p.code}
            type="button"
            onClick={() => onPick(p.code)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
              active === p.code
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/60 bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            )}
          >
            <span>{p.flag}</span>
            {p.name}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 sm:ml-auto">
        <Label htmlFor="currency-code" className="text-xs text-muted-foreground">Devise</Label>
        <Input
          id="currency-code"
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value.toUpperCase().slice(0, 6))}
          className="h-7 w-16 text-center text-xs uppercase tabular-nums"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Input section (collapsible)
// ─────────────────────────────────────────────────────────────────────
const TONE_BG: Record<'pink' | 'violet' | 'emerald', string> = {
  pink: 'bg-pink-500/10 text-pink-600',
  violet: 'bg-violet-500/10 text-violet-600',
  emerald: 'bg-emerald-500/10 text-emerald-600',
};

function InputSection({
  icon: Icon,
  title,
  tone,
  defaultOpen = false,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone: 'pink' | 'violet' | 'emerald';
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-t-xl px-5 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <span className="flex items-center gap-2.5">
          <span className={cn('grid h-8 w-8 place-items-center rounded-lg', TONE_BG[tone])}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="font-semibold">{title}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && <CardContent className="space-y-3 pt-0">{children}</CardContent>}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Field with inline tooltip
// ─────────────────────────────────────────────────────────────────────
function Field({
  label,
  tooltip,
  value,
  onChange,
  currency,
  suffix,
  compact,
}: {
  label: string;
  tooltip: string;
  value: number;
  onChange: (raw: string) => void;
  currency?: string;
  suffix?: string;
  compact?: boolean;
}) {
  // Hover tooltips never trigger on touch — make the help icon tappable
  // (toggle a small popover) and keep the hover behaviour on desktop as a bonus.
  const [tipOpen, setTipOpen] = useState(false);
  useEffect(() => {
    if (!tipOpen) return;
    const close = () => setTipOpen(false);
    const t = setTimeout(close, 4000);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [tipOpen]);

  return (
    <div className={cn(!compact && 'space-y-1')}>
      <div className="flex items-center gap-1.5">
        <Label className="text-xs">{label}</Label>
        <span className="group relative">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setTipOpen((v) => !v); }}
            aria-label={`Aide : ${label}`}
            className="grid h-5 w-5 -m-1 place-items-center rounded-full text-muted-foreground/70 hover:text-muted-foreground"
          >
            <HelpCircle className="h-3 w-3" />
          </button>
          <span
            className={cn(
              'pointer-events-none absolute left-0 top-6 z-20 max-w-[min(14rem,80vw)] whitespace-normal rounded-md bg-foreground px-2 py-1 text-[10px] text-background shadow-lg leading-snug',
              tipOpen ? 'block' : 'hidden group-hover:block',
            )}
          >
            {tooltip}
          </span>
        </span>
      </div>
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className={cn('pr-14 tabular-nums', compact ? 'h-9 text-sm' : 'h-10')}
          placeholder="0"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium uppercase text-muted-foreground">
          {suffix || currency}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Right panel — KPI grid, funnel, breakdown, table
// ─────────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted">
          <Calculator className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="mt-3 text-sm font-semibold">Saisis tes chiffres</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Renseigne au moins le prix de vente et le budget pub pour voir les estimations.
        </p>
      </CardContent>
    </Card>
  );
}

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  return (
    <motion.span
      key={Math.round(value * 100) / 100}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="tabular-nums"
    >
      {format(value)}
    </motion.span>
  );
}

function KpiGrid({ outputs, currency }: { outputs: ReturnType<typeof calculate>; currency: string }) {
  const verdict = roasVerdict(outputs.roas, outputs.adSpend);
  const profitable = outputs.netProfit >= 0;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Card className={cn('p-3', profitable ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5')}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Profit net</div>
        <div className={cn('mt-1 text-lg font-bold tabular-nums sm:text-2xl', profitable ? 'text-emerald-700' : 'text-red-700')}>
          <AnimatedNumber value={outputs.netProfit} format={(n) => `${n >= 0 ? '+' : ''}${formatCurrency(n, currency)}`} />
        </div>
        <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          {profitable ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {profitable ? 'rentable' : 'en perte'}
        </div>
      </Card>
      <Card className="p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">ROAS</div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="text-lg font-bold tabular-nums sm:text-2xl">
            <AnimatedNumber value={outputs.roas} format={(n) => `×${n.toFixed(2)}`} />
          </div>
          <RoasBadge verdict={verdict} />
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">revenu / pub</div>
      </Card>
      <Card className="p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Marge</div>
        <div className="mt-1 text-lg font-bold tabular-nums sm:text-2xl">
          <AnimatedNumber value={outputs.marginPercent} format={(n) => `${n.toFixed(1)}%`} />
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">profit / revenu</div>
      </Card>
      <Card className="p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Profit / livraison</div>
        <div className="mt-1 text-lg font-bold tabular-nums sm:text-2xl">
          <AnimatedNumber value={outputs.profitPerDelivered} format={(n) => formatCurrency(n, currency)} />
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">par colis livré</div>
      </Card>
    </div>
  );
}

function RoasBadge({ verdict }: { verdict: ReturnType<typeof roasVerdict> }) {
  const cls = {
    bad: 'bg-red-500/10 text-red-700 border-red-500/30',
    ok: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
    good: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
    idle: 'bg-muted text-muted-foreground border-border',
  }[verdict];
  const label = { bad: 'Bad', ok: 'OK', good: 'Good', idle: '—' }[verdict];
  return <span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase', cls)}>{label}</span>;
}

const FUNNEL_COLORS = ['#a855f7', '#ec4899', '#f97316', '#10b981'];

function FunnelCard({ outputs }: { outputs: ReturnType<typeof calculate> }) {
  const data = [
    { name: 'Leads', value: Math.round(outputs.leads), fill: FUNNEL_COLORS[0] },
    { name: 'Confirmés', value: Math.round(outputs.confirmedOrders), fill: FUNNEL_COLORS[1] },
    { name: 'Livrés', value: Math.round(outputs.deliveredOrders), fill: FUNNEL_COLORS[2] },
  ].filter((d) => d.value > 0);
  return (
    <Card>
      <CardContent className="py-3">
        <div className="mb-1 text-xs font-semibold">Tunnel de conversion</div>
        <p className="mb-2 text-[10px] text-muted-foreground">Leads → confirmés au call center → livrés</p>
        {data.length === 0 ? (
          <p className="grid h-32 place-items-center text-xs text-muted-foreground">— pas assez de données —</p>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsFunnel>
                <RechartsTooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid hsl(var(--border))' }}
                  formatter={(value: number) => [`${value}`, 'commandes']}
                />
                <Funnel dataKey="value" data={data} isAnimationActive>
                  {/* Label inside the bar — readable on both themes (white on
                      saturated bar colors). The "name" label sits inside too
                      so it doesn't overflow the chart on narrow phones. */}
                  <LabelList position="center" fill="#fff" stroke="none" dataKey="name" className="text-[10px] font-semibold" />
                  <LabelList position="right" fill="currentColor" stroke="none" dataKey="value" className="text-xs font-bold" offset={6} />
                </Funnel>
              </RechartsFunnel>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PIE_COLORS = ['#3b82f6', '#a855f7', '#10b981', '#f97316', '#ec4899', '#eab308'];

function CostBreakdownCard({ outputs, currency }: { outputs: ReturnType<typeof calculate>; currency: string }) {
  const slices = [
    { name: 'Ads', value: outputs.adSpend },
    { name: 'Produit', value: outputs.productCostTotal },
    { name: 'Shipping', value: outputs.shippingCostTotal },
    { name: 'Retours', value: outputs.returnCostTotal },
    { name: 'Call center', value: outputs.callCenterTotal },
    { name: 'Comm. COD', value: outputs.codFeeTotal },
  ].filter((s) => s.value > 0.01);
  return (
    <Card>
      <CardContent className="py-3">
        <div className="mb-1 text-xs font-semibold">Répartition des coûts</div>
        <p className="mb-2 text-[10px] text-muted-foreground">Total : {formatCurrency(outputs.totalCosts, currency)}</p>
        {slices.length === 0 ? (
          <p className="grid h-32 place-items-center text-xs text-muted-foreground">— pas de coûts —</p>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <RechartsTooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid hsl(var(--border))' }}
                  formatter={(value: number, name: string) => [formatCurrency(value, currency), name]}
                />
                <RechartsLegend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 10 }}
                  /* Stack legend below on mobile (more horizontal room for the
                     donut), put it on the right from sm+ (more vertical room). */
                  align="center"
                  verticalAlign="bottom"
                  layout="horizontal"
                />
                <Pie data={slices} dataKey="value" cx="50%" cy="42%" innerRadius={28} outerRadius={54} paddingAngle={2}>
                  {slices.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricsTable({
  inputs,
  outputs,
  currency,
}: {
  inputs: CalculatorInputs;
  outputs: ReturnType<typeof calculate>;
  currency: string;
}) {
  const rows: Array<{ label: string; value: string; tone?: 'good' | 'bad' | 'muted'; warn?: string }> = [
    { label: 'Leads générés', value: Math.round(outputs.leads).toString() },
    { label: 'Commandes confirmées', value: Math.round(outputs.confirmedOrders).toString() },
    { label: 'Commandes livrées', value: Math.round(outputs.deliveredOrders).toString(), tone: 'good' },
    { label: 'Colis retournés', value: Math.round(outputs.returnedOrders).toString(), tone: 'bad' },
    { label: 'Revenu brut', value: formatCurrency(outputs.revenue, currency), tone: 'good' },
    { label: 'Coût ads', value: formatCurrency(outputs.adSpend, currency), tone: 'muted' },
    { label: 'Coût produit', value: formatCurrency(outputs.productCostTotal, currency), tone: 'muted' },
    { label: 'Coût shipping', value: formatCurrency(outputs.shippingCostTotal, currency), tone: 'muted' },
    { label: 'Coût retours', value: formatCurrency(outputs.returnCostTotal, currency), tone: 'muted' },
    { label: 'Coût call center', value: formatCurrency(outputs.callCenterTotal, currency), tone: 'muted' },
    { label: 'Commission COD', value: formatCurrency(outputs.codFeeTotal, currency), tone: 'muted' },
    { label: 'CPA (par livraison)', value: formatCurrency(outputs.cpa, currency) },
    {
      label: 'Break-even livraisons',
      value: outputs.breakEvenDeliveries > 0 ? Math.ceil(outputs.breakEvenDeliveries).toString() : '—',
      warn: outputs.breakEvenDeliveries > outputs.deliveredOrders ? `Il manque ${Math.ceil(outputs.breakEvenDeliveries - outputs.deliveredOrders)} livraisons` : undefined,
    },
  ];
  return (
    <Card>
      <CardContent className="py-3">
        <div className="mb-2 text-xs font-semibold">Détail complet</div>
        <div className="divide-y divide-border/60 text-xs">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2 py-1.5">
              <span className="text-muted-foreground">{r.label}</span>
              <span className={cn(
                'tabular-nums font-medium',
                r.tone === 'good' && 'text-emerald-700',
                r.tone === 'bad' && 'text-red-700',
                r.tone === 'muted' && 'text-muted-foreground',
              )}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
        {rows[rows.length - 1].warn && (
          <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            {rows[rows.length - 1].warn}
          </div>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">
          CPL effectif : {formatCurrency(outputs.effectiveCpl, currency)} · Inputs : prix {formatCurrency(inputs.sellingPrice, currency)}, COGS {formatCurrency(inputs.productCost, currency)}
        </p>
      </CardContent>
    </Card>
  );
}
