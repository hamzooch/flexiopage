import mongoose from 'mongoose';
import { StoreEvent, type StoreEventType } from '../models/StoreEvent.model';
import { Product } from '../models/Product.model';

export type TrackingRange = '7d' | '30d' | '90d';

const RANGE_DAYS: Record<TrackingRange, number> = { '7d': 7, '30d': 30, '90d': 90 };

function rangeStart(range: TrackingRange): Date {
  const d = new Date();
  d.setDate(d.getDate() - RANGE_DAYS[range]);
  return d;
}

export interface RecordEventInput {
  storeId: string;
  productId?: string;
  type: StoreEventType;
  sessionId: string;
  value?: number;
  currency?: string;
}

/**
 * Live visitor count for the seller's overview — Shopify-style. We count
 * distinct anonymous sessionIds that fired ANY storefront event in the last
 * `windowMin` minutes (default 5). Five minutes matches Shopify's window and
 * is short enough to feel "live" without dropping a visitor between page
 * navigations.
 */
export async function getLiveVisitors(
  storeId: string,
  windowMin = 5,
): Promise<{ count: number; windowMin: number }> {
  const oid = new mongoose.Types.ObjectId(storeId);
  const since = new Date(Date.now() - windowMin * 60 * 1000);
  const sessions = await StoreEvent.distinct('sessionId', {
    storeId: oid,
    createdAt: { $gte: since },
  });
  return { count: (sessions as string[]).length, windowMin };
}

/** Fire-and-forget event ingest — never throws into the request path. */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  if (!input.storeId || !input.sessionId || !input.type) return;
  try {
    await StoreEvent.create({
      storeId: input.storeId,
      productId: input.productId || undefined,
      type: input.type,
      sessionId: String(input.sessionId).slice(0, 64),
      value: typeof input.value === 'number' ? input.value : undefined,
      currency: input.currency,
    });
  } catch {
    // Tracking must never break the storefront.
  }
}

export interface TrackingStats {
  range: TrackingRange;
  totals: {
    /** Any storefront page hit (landing, info page, product). */
    pageViews: number;
    productViews: number;
    addToCart: number;
    purchases: number;
    abandonedCarts: number;
    /** % of product views that started an order. */
    viewToCartRate: number;
    /** % of started orders that completed. */
    cartToPurchaseRate: number;
    /** % of product views that became an order. */
    conversionRate: number;
  };
  products: Array<{
    productId: string;
    name: string;
    views: number;
    addToCart: number;
    purchases: number;
  }>;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/** Aggregate the storefront funnel for the seller's "Suivi" dashboard. */
export async function getTrackingStats(
  storeId: string,
  range: TrackingRange,
): Promise<TrackingStats> {
  const oid = new mongoose.Types.ObjectId(storeId);
  const start = rangeStart(range);

  // Totals by event type.
  const byType = await StoreEvent.aggregate<{ _id: StoreEventType; count: number }>([
    { $match: { storeId: oid, createdAt: { $gte: start } } },
    { $group: { _id: '$type', count: { $sum: 1 } } },
  ]);
  const counts: Record<StoreEventType, number> = {
    page_view: 0,
    product_view: 0,
    add_to_cart: 0,
    purchase: 0,
  };
  for (const r of byType) counts[r._id] = r.count;

  // Abandoned carts: sessions that started an order but never completed one.
  // Two boundary choices matter here:
  //   1. We require carts to be at least 24h old before counting them as
  //      abandoned — otherwise every fresh visitor (still in their session)
  //      inflates the number. 24h is the industry-standard "grace period"
  //      before a cart is considered dead.
  //   2. We accept purchases up to NOW (no upper bound), so a cart from
  //      day 1 of a 90-day window that converts today is correctly excluded.
  const graceCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [cartSessions, purchaseSessions] = await Promise.all([
    StoreEvent.distinct('sessionId', { storeId: oid, type: 'add_to_cart', createdAt: { $gte: start, $lte: graceCutoff } }),
    StoreEvent.distinct('sessionId', { storeId: oid, type: 'purchase', createdAt: { $gte: start } }),
  ]);
  const purchasedSet = new Set(purchaseSessions as string[]);
  const abandonedCarts = (cartSessions as string[]).filter((s) => !purchasedSet.has(s)).length;

  // Per-product funnel.
  const byProduct = await StoreEvent.aggregate<{
    _id: mongoose.Types.ObjectId;
    views: number;
    addToCart: number;
    purchases: number;
  }>([
    { $match: { storeId: oid, createdAt: { $gte: start }, productId: { $ne: null } } },
    {
      $group: {
        _id: '$productId',
        views: { $sum: { $cond: [{ $eq: ['$type', 'product_view'] }, 1, 0] } },
        addToCart: { $sum: { $cond: [{ $eq: ['$type', 'add_to_cart'] }, 1, 0] } },
        purchases: { $sum: { $cond: [{ $eq: ['$type', 'purchase'] }, 1, 0] } },
      },
    },
    { $sort: { views: -1, addToCart: -1 } },
    { $limit: 50 },
  ]);

  const productIds = byProduct.map((p) => p._id);
  const productDocs = productIds.length
    ? await Product.find({ _id: { $in: productIds } }).select('name').lean()
    : [];
  const nameById = new Map(productDocs.map((p) => [p._id.toString(), p.name]));

  const products = byProduct.map((p) => ({
    productId: p._id.toString(),
    name: nameById.get(p._id.toString()) || 'Produit supprimé',
    views: p.views,
    addToCart: p.addToCart,
    purchases: p.purchases,
  }));

  return {
    range,
    totals: {
      pageViews: counts.page_view,
      productViews: counts.product_view,
      addToCart: counts.add_to_cart,
      purchases: counts.purchase,
      abandonedCarts,
      viewToCartRate: pct(counts.add_to_cart, counts.product_view),
      cartToPurchaseRate: pct(counts.purchase, counts.add_to_cart),
      conversionRate: pct(counts.purchase, counts.product_view),
    },
    products,
  };
}
