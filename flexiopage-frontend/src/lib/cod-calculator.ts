/**
 * COD profit calculator — pure engine.
 *
 * Mirrors the formula block agreed in the spec. Inputs come from the UI;
 * outputs feed both the live KPI panel and the persisted Scenario record.
 * No React, no I/O — kept as a pure function so the backend can re-run the
 * same math when validating a saved scenario.
 */

export interface CalculatorInputs {
  // Section A — product & sale
  sellingPrice: number;
  productCost: number;
  unitsPerOrder: number;

  // Section B — ads
  adBudget: number;
  /** Direct CPL if known. Otherwise derived from cpm/ctr/landingConversionRate. */
  cpl: number;
  /** Optional advanced mode — when filled, overrides `cpl`. */
  cpm?: number;
  /** Click-through rate as a percentage (0-100). */
  ctr?: number;
  /** Landing-page lead conversion rate as a percentage (0-100). */
  landingConversionRate?: number;

  // Section C — COD operations
  confirmationRate: number;     // %
  deliveryRate: number;         // %
  shippingCost: number;         // $ per delivered order
  returnCost: number;           // $ per returned order
  callCenterCostPerLead: number; // $ per lead
  codFeePercent: number;        // % of revenue
}

export interface CalculatorOutputs {
  // Funnel
  leads: number;
  confirmedOrders: number;
  deliveredOrders: number;
  returnedOrders: number;

  // Revenue & cost breakdown
  revenue: number;
  productCostTotal: number;
  shippingCostTotal: number;
  returnCostTotal: number;
  callCenterTotal: number;
  codFeeTotal: number;
  adSpend: number;
  totalCosts: number;

  // KPIs
  netProfit: number;
  roas: number;
  profitPerDelivered: number;
  marginPercent: number;
  /** Per-delivered-order cost — useful to compare vs sellingPrice. */
  cpa: number;
  /** How many deliveries needed to break even at the same ad spend. */
  breakEvenDeliveries: number;
  /** The effective CPL used (either provided or derived from cpm/ctr/lcvr). */
  effectiveCpl: number;
}

export const EMPTY_INPUTS: CalculatorInputs = {
  sellingPrice: 0,
  productCost: 0,
  unitsPerOrder: 1,
  adBudget: 0,
  cpl: 0,
  cpm: undefined,
  ctr: undefined,
  landingConversionRate: undefined,
  confirmationRate: 60,
  deliveryRate: 65,
  shippingCost: 0,
  returnCost: 0,
  callCenterCostPerLead: 0,
  codFeePercent: 5,
};

/**
 * Derive CPL from advanced ad-funnel inputs when the seller didn't provide
 * a direct cost-per-lead. Formula:
 *
 *   clicks  = (adBudget / cpm) * 1000 * (ctr / 100)
 *   leads   = clicks * (landingConversionRate / 100)
 *   cpl     = adBudget / leads
 *
 * Returns `null` if any required field is missing or yields a non-positive
 * result — caller then falls back to the direct `cpl` input.
 */
export function deriveCplFromFunnel(
  adBudget: number,
  cpm?: number,
  ctr?: number,
  landingConversionRate?: number,
): number | null {
  if (!adBudget || !cpm || !ctr || !landingConversionRate) return null;
  if (cpm <= 0 || ctr <= 0 || landingConversionRate <= 0) return null;
  const impressions = (adBudget / cpm) * 1000;
  const clicks = impressions * (ctr / 100);
  const leads = clicks * (landingConversionRate / 100);
  if (leads <= 0) return null;
  return adBudget / leads;
}

/** Run the full calculation. Always returns a finite-number output object — guards
 * against div-by-zero by returning 0 for ratios when the denominator is 0. */
export function calculate(input: CalculatorInputs): CalculatorOutputs {
  const derivedCpl = deriveCplFromFunnel(
    input.adBudget,
    input.cpm,
    input.ctr,
    input.landingConversionRate,
  );
  const effectiveCpl = derivedCpl ?? input.cpl;

  const leads = effectiveCpl > 0 ? input.adBudget / effectiveCpl : 0;
  const confirmedOrders = leads * (input.confirmationRate / 100);
  const deliveredOrders = confirmedOrders * (input.deliveryRate / 100);
  const returnedOrders = Math.max(confirmedOrders - deliveredOrders, 0);

  const revenue = deliveredOrders * input.sellingPrice * input.unitsPerOrder;
  const productCostTotal = deliveredOrders * input.productCost * input.unitsPerOrder;
  const shippingCostTotal = deliveredOrders * input.shippingCost;
  const returnCostTotal = returnedOrders * input.returnCost;
  const callCenterTotal = leads * input.callCenterCostPerLead;
  const codFeeTotal = revenue * (input.codFeePercent / 100);
  const adSpend = input.adBudget;

  const totalCosts =
    adSpend + productCostTotal + shippingCostTotal + returnCostTotal + callCenterTotal + codFeeTotal;

  const netProfit = revenue - totalCosts;
  const roas = adSpend > 0 ? revenue / adSpend : 0;
  const profitPerDelivered = deliveredOrders > 0 ? netProfit / deliveredOrders : 0;
  const marginPercent = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const cpa = deliveredOrders > 0 ? totalCosts / deliveredOrders : 0;
  const unitPrice = input.sellingPrice * input.unitsPerOrder;
  const breakEvenDeliveries = unitPrice > 0 ? totalCosts / unitPrice : 0;

  return {
    leads,
    confirmedOrders,
    deliveredOrders,
    returnedOrders,
    revenue,
    productCostTotal,
    shippingCostTotal,
    returnCostTotal,
    callCenterTotal,
    codFeeTotal,
    adSpend,
    totalCosts,
    netProfit,
    roas,
    profitPerDelivered,
    marginPercent,
    cpa,
    breakEvenDeliveries,
    effectiveCpl,
  };
}

/** Bucketed ROAS verdict driving the badge color in the UI. */
export type RoasVerdict = 'bad' | 'ok' | 'good' | 'idle';

export function roasVerdict(roas: number, adSpend: number): RoasVerdict {
  if (adSpend <= 0) return 'idle';
  if (roas < 1.5) return 'bad';
  if (roas < 2.5) return 'ok';
  return 'good';
}

// ─────────────────────────────────────────────────────────────────────
// Country presets — averages we pre-fill so a new user gets a sane start.
// Numbers are market estimates, not prescriptions; sellers should tune.
// ─────────────────────────────────────────────────────────────────────
export interface CountryPreset {
  code: string;
  name: string;
  flag: string;
  currency: string;
  defaults: Partial<CalculatorInputs>;
}

export const COUNTRY_PRESETS: CountryPreset[] = [
  {
    code: 'MA',
    name: 'Morocco',
    flag: '🇲🇦',
    currency: 'MAD',
    defaults: { shippingCost: 25, deliveryRate: 65, codFeePercent: 5, returnCost: 15, confirmationRate: 60 },
  },
  {
    code: 'CI',
    name: 'Ivory Coast',
    flag: '🇨🇮',
    currency: 'XOF',
    defaults: { shippingCost: 2000, deliveryRate: 60, codFeePercent: 6, returnCost: 1000, confirmationRate: 55 },
  },
  {
    code: 'SN',
    name: 'Senegal',
    flag: '🇸🇳',
    currency: 'XOF',
    defaults: { shippingCost: 2500, deliveryRate: 60, codFeePercent: 6, returnCost: 1200, confirmationRate: 55 },
  },
  {
    code: 'EG',
    name: 'Egypt',
    flag: '🇪🇬',
    currency: 'EGP',
    defaults: { shippingCost: 70, deliveryRate: 70, codFeePercent: 5, returnCost: 35, confirmationRate: 65 },
  },
  {
    code: 'TN',
    name: 'Tunisia',
    flag: '🇹🇳',
    currency: 'TND',
    defaults: { shippingCost: 8, deliveryRate: 70, codFeePercent: 4, returnCost: 4, confirmationRate: 65 },
  },
];
