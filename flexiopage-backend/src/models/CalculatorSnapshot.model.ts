/**
 * Saved scenario from the COD profit calculator.
 *
 * One document per "what-if" run the seller wants to keep around — they name
 * it (e.g. "Hijab campaign Morocco"), tune the inputs, and we persist both
 * the inputs and the computed outputs so the history list can show key KPIs
 * without re-running the engine.
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface ICalculatorInputs {
  sellingPrice: number;
  productCost: number;
  unitsPerOrder: number;
  adBudget: number;
  cpl: number;
  cpm?: number;
  ctr?: number;
  landingConversionRate?: number;
  confirmationRate: number;
  deliveryRate: number;
  shippingCost: number;
  returnCost: number;
  callCenterCostPerLead: number;
  codFeePercent: number;
}

export interface ICalculatorOutputs {
  leads: number;
  confirmedOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  revenue: number;
  productCostTotal: number;
  shippingCostTotal: number;
  returnCostTotal: number;
  callCenterTotal: number;
  codFeeTotal: number;
  adSpend: number;
  totalCosts: number;
  netProfit: number;
  roas: number;
  profitPerDelivered: number;
  marginPercent: number;
  cpa: number;
  breakEvenDeliveries: number;
  effectiveCpl: number;
}

export interface ICalculatorSnapshot extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  country?: string;
  inputs: ICalculatorInputs;
  outputs: ICalculatorOutputs;
  createdAt: Date;
}

const NumberOrZero = { type: Number, default: 0 };

const CalculatorSnapshotSchema = new Schema<ICalculatorSnapshot>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    country: { type: String, trim: true, uppercase: true, maxlength: 4 },
    inputs: {
      sellingPrice: NumberOrZero,
      productCost: NumberOrZero,
      unitsPerOrder: { type: Number, default: 1 },
      adBudget: NumberOrZero,
      cpl: NumberOrZero,
      cpm: { type: Number },
      ctr: { type: Number },
      landingConversionRate: { type: Number },
      confirmationRate: { type: Number, default: 60 },
      deliveryRate: { type: Number, default: 65 },
      shippingCost: NumberOrZero,
      returnCost: NumberOrZero,
      callCenterCostPerLead: NumberOrZero,
      codFeePercent: { type: Number, default: 5 },
    },
    outputs: {
      leads: NumberOrZero,
      confirmedOrders: NumberOrZero,
      deliveredOrders: NumberOrZero,
      returnedOrders: NumberOrZero,
      revenue: NumberOrZero,
      productCostTotal: NumberOrZero,
      shippingCostTotal: NumberOrZero,
      returnCostTotal: NumberOrZero,
      callCenterTotal: NumberOrZero,
      codFeeTotal: NumberOrZero,
      adSpend: NumberOrZero,
      totalCosts: NumberOrZero,
      netProfit: NumberOrZero,
      roas: NumberOrZero,
      profitPerDelivered: NumberOrZero,
      marginPercent: NumberOrZero,
      cpa: NumberOrZero,
      breakEvenDeliveries: NumberOrZero,
      effectiveCpl: NumberOrZero,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

CalculatorSnapshotSchema.index({ userId: 1, createdAt: -1 });

export const CalculatorSnapshot = mongoose.model<ICalculatorSnapshot>(
  'CalculatorSnapshot',
  CalculatorSnapshotSchema,
);
