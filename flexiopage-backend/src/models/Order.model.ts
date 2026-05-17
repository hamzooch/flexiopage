import mongoose, { Document, Schema } from 'mongoose';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'manual';
export type FulfillmentStatus = 'unfulfilled' | 'partial' | 'fulfilled' | 'cancelled';

/** Aggregator (one-to-many wrapper) or direct provider. */
export type PaymentProvider =
  | 'cinetpay'        // aggregator: Wave, OM, MTN, Moov, Visa
  | 'paydunya'        // aggregator: Wave, OM, MTN, Moov, Visa (Sénégal/CI/BF/ML/BJ/TG)
  | 'flutterwave'     // pan-african
  | 'wave'            // direct (Wave Senegal API)
  | 'orange_money'    // direct
  | 'mtn_momo'        // direct
  | 'moov_money'      // direct
  | 'stripe'          // international cards
  | 'cod'             // cash on delivery (manual)
  | 'manual';         // bank transfer / other manual

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  variantId?: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  sku?: string;
  digitalFileUrl?: string;
  /** Auto-generated license key (when product has a licenseKeyTemplate). */
  licenseKey?: string;
}

export interface IOrder extends Document {
  storeId: mongoose.Types.ObjectId;
  orderNumber: string;
  customerId?: mongoose.Types.ObjectId;
  email: string;
  customerName?: string;
  customerPhone?: string;
  shippingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  items: IOrderItem[];
  subtotal: number;
  shippingCost: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  paymentStatus: PaymentStatus;
  paymentMethod: 'stripe' | 'manual' | 'other' | 'mobile_money' | 'card' | 'cod';
  /** Specific provider (when paymentMethod = 'mobile_money' / 'card' / etc.). */
  paymentProvider?: PaymentProvider;
  /** Reference / transaction id at the provider side. */
  paymentReference?: string;
  /** When mobile money: the user's phone number (international format). */
  paymentPhone?: string;
  /** Last webhook payload (for debugging). */
  paymentWebhookData?: Record<string, unknown>;
  stripePaymentIntentId?: string;
  fulfillmentStatus: FulfillmentStatus;
  trackingNumber?: string;
  trackingUrl?: string;
  couponCode?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  /** Random opaque token used by the customer download portal at /d/:token. */
  downloadToken?: string;
  /** When access expires (when product has accessType=limited). */
  downloadExpiresAt?: Date;

  /**
   * Outbound delivery integration (e.g. mogadelivery). Set when the order is
   * dispatched to a third-party delivery platform.
   */
  delivery?: {
    /** Which provider the order was sent to. */
    provider?: 'mogadelivery' | 'yalidine' | 'noest' | 'aramex' | 'manual' | 'other';
    /** Provider's id for the dispatch (e.g. MD-12345). */
    externalId?: string;
    /** Status reported by the provider (pending|assigned|in_transit|delivered|returned|cancelled|failed). */
    externalStatus?: string;
    /** URL the customer can open to track. */
    trackingUrl?: string;
    /** Last raw response from the provider (debug). */
    providerResponse?: Record<string, unknown>;
    /** Last raw webhook payload received from the provider. */
    lastWebhook?: Record<string, unknown>;
    /** When we first dispatched. */
    dispatchedAt?: Date;
    /** When the provider last sent us an update. */
    lastSyncedAt?: Date;
    /** When dispatch failed, the error message (so the seller can retry). */
    error?: string;
  };

  // ── Manual status override (seller-facing) ─────────────────────────
  /** True once stock has been restored to inventory after a cancel.
   * Prevents double-restocking if the order is uncancelled and re-cancelled. */
  inventoryRestored?: boolean;
  /** Free-text reason captured when the seller manually cancels/changes status. */
  cancelReason?: string;
  /** Append-only audit trail of manual status changes (seller actions). */
  statusHistory?: Array<{
    at: Date;
    by?: mongoose.Types.ObjectId;
    paymentStatus?: PaymentStatus;
    fulfillmentStatus?: FulfillmentStatus;
    note?: string;
  }>;

  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: String },
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    total: { type: Number, required: true },
    sku: { type: String },
    digitalFileUrl: { type: String },
    licenseKey: { type: String },
  },
  { _id: true }
);

const OrderSchema = new Schema<IOrder>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    orderNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    email: { type: String, required: true },
    customerName: { type: String },
    customerPhone: { type: String },
    shippingAddress: {
      line1: { type: String },
      line2: { type: String },
      city: { type: String },
      state: { type: String },
      postalCode: { type: String },
      country: { type: String },
    },
    items: [OrderItemSchema],
    subtotal: { type: Number, required: true },
    shippingCost: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded', 'manual'], default: 'pending' },
    paymentMethod: { type: String, enum: ['stripe', 'manual', 'other', 'mobile_money', 'card', 'cod'], default: 'manual' },
    paymentProvider: {
      type: String,
      enum: ['cinetpay', 'paydunya', 'flutterwave', 'wave', 'orange_money', 'mtn_momo', 'moov_money', 'stripe', 'cod', 'manual'],
    },
    paymentReference: { type: String, index: true },
    paymentPhone: { type: String },
    paymentWebhookData: { type: Schema.Types.Mixed },
    stripePaymentIntentId: { type: String },
    fulfillmentStatus: { type: String, enum: ['unfulfilled', 'partial', 'fulfilled', 'cancelled'], default: 'unfulfilled' },
    trackingNumber: { type: String },
    trackingUrl: { type: String },
    couponCode: { type: String },
    notes: { type: String },
    metadata: { type: Schema.Types.Mixed },
    downloadToken: { type: String },
    downloadExpiresAt: { type: Date },
    delivery: {
      provider: { type: String, enum: ['mogadelivery', 'yalidine', 'noest', 'aramex', 'manual', 'other'] },
      externalId: { type: String, index: true },
      externalStatus: { type: String },
      trackingUrl: { type: String },
      providerResponse: { type: Schema.Types.Mixed },
      lastWebhook: { type: Schema.Types.Mixed },
      dispatchedAt: { type: Date },
      lastSyncedAt: { type: Date },
      error: { type: String },
    },
    inventoryRestored: { type: Boolean, default: false },
    cancelReason: { type: String, trim: true },
    statusHistory: [
      {
        _id: false,
        at: { type: Date, default: Date.now },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        paymentStatus: { type: String },
        fulfillmentStatus: { type: String },
        note: { type: String, trim: true },
      },
    ],
  },
  { timestamps: true }
);

OrderSchema.index({ storeId: 1 });
OrderSchema.index({ storeId: 1, orderNumber: 1 }, { unique: true });
OrderSchema.index({ downloadToken: 1 }, { sparse: true, unique: true });
OrderSchema.index({ storeId: 1, createdAt: -1 });
export const Order = mongoose.model<IOrder>('Order', OrderSchema);
