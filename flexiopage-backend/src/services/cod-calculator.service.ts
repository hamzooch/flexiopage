/**
 * Server-side mirror of the frontend COD calculator engine. We recompute the
 * outputs from the seller's inputs on every save instead of trusting the
 * client-supplied numbers — keeps the history honest if someone tampers
 * with the request payload.
 */
import type { ICalculatorInputs, ICalculatorOutputs } from '../models/CalculatorSnapshot.model';

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

export function calculate(input: ICalculatorInputs): ICalculatorOutputs {
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

/** Coerce & clamp inputs from the request body so a hostile client can't push
 * negative percentages or absurd magnitudes into the saved document. */
export function sanitizeInputs(raw: Partial<ICalculatorInputs>): ICalculatorInputs {
  const num = (v: unknown, fallback = 0): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(n) ? Math.max(0, n) : fallback;
  };
  const pct = (v: unknown, fallback: number): number => Math.min(num(v, fallback), 100);
  const optNum = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  return {
    sellingPrice: num(raw.sellingPrice),
    productCost: num(raw.productCost),
    unitsPerOrder: Math.max(1, num(raw.unitsPerOrder, 1)),
    adBudget: num(raw.adBudget),
    cpl: num(raw.cpl),
    cpm: optNum(raw.cpm),
    ctr: raw.ctr === undefined ? undefined : pct(raw.ctr, 0),
    landingConversionRate: raw.landingConversionRate === undefined ? undefined : pct(raw.landingConversionRate, 0),
    confirmationRate: pct(raw.confirmationRate, 60),
    deliveryRate: pct(raw.deliveryRate, 65),
    shippingCost: num(raw.shippingCost),
    returnCost: num(raw.returnCost),
    callCenterCostPerLead: num(raw.callCenterCostPerLead),
    codFeePercent: pct(raw.codFeePercent, 5),
  };
}
