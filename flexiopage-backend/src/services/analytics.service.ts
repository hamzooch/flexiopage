/**
 * Store analytics — computes the full set of metrics shown on /dashboard/analytics.
 *
 * Everything is derived from the Order collection (no separate events table yet).
 * Two shapes are exported:
 *   - StoreAnalytics       — legacy 4-KPI shape kept for backward compatibility
 *   - StoreAnalyticsRich   — full payload (KPIs + timeseries + top products + breakdowns)
 *
 * Callers that want the rich payload pass `?range=7d|30d|90d|12m` to the controller.
 */
import mongoose from 'mongoose';
import { Order } from '../models/Order.model';
import { Product } from '../models/Product.model';
import { Store } from '../models/Store.model';
import { StoreEvent } from '../models/StoreEvent.model';

export interface StoreAnalytics {
  totalOrders: number;
  /** Sum of `total` across paid orders only — the actual money received. */
  totalRevenue: number;
  /**
   * Sum of `total` across ALL orders regardless of payment status — the
   * "valeur des commandes passées" most sellers expect to see on their
   * dashboard, especially in COD-heavy markets where `paymentStatus` only
   * flips to `paid` once the delivery is confirmed.
   */
  totalOrderValue: number;
  conversionRate?: number;
  storeViews?: number;
  ordersThisMonth: number;
  revenueThisMonth: number;
  /** Same definition as `totalOrderValue`, scoped to the current calendar month. */
  orderValueThisMonth: number;
  /** Store's display currency (e.g. "XOF"), so callers can format values. */
  currency?: string;
  /** All-time anonymous storefront page views. */
  pageViews?: number;
  /** Page views in the current calendar month. */
  pageViewsThisMonth?: number;
  /** All-time anonymous product detail page views. */
  productViews?: number;
  /** Product views in the current calendar month. */
  productViewsThisMonth?: number;
}

export type RangeKey = 'today' | '7d' | '30d' | '90d' | '12m' | 'custom';

export interface CustomRange {
  /** Inclusive start date — interpreted as local midnight. */
  from: Date;
  /** Inclusive end date — interpreted as local end-of-day. */
  to: Date;
}

interface RangeWindow {
  from: Date;
  to: Date;
  /** previous window of equal length, for delta comparison */
  prevFrom: Date;
  prevTo: Date;
  /** bucket size used when building the revenue timeseries */
  bucket: 'day' | 'month';
  /** number of buckets in [from, to] */
  buckets: number;
}

function resolveRange(range: RangeKey, now: Date = new Date(), custom?: CustomRange): RangeWindow {
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  if (range === '12m') {
    const from = new Date(to);
    from.setMonth(from.getMonth() - 11);
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setMonth(prevFrom.getMonth() - 11);
    prevFrom.setDate(1);
    prevFrom.setHours(0, 0, 0, 0);
    return { from, to, prevFrom, prevTo, bucket: 'month', buckets: 12 };
  }
  if (range === 'custom' && custom) {
    // Custom window picked by the seller. We snap to local-midnight / EOD so
    // the seller's intent ("from the 5th to the 12th") includes both endpoints
    // fully. The previous-window delta is computed as an equal-length window
    // ending right before `from` — same convention as the preset ranges.
    const cFrom = new Date(custom.from);
    cFrom.setHours(0, 0, 0, 0);
    const cTo = new Date(custom.to);
    cTo.setHours(23, 59, 59, 999);
    const days = Math.max(1, Math.round((cTo.getTime() - cFrom.getTime()) / (24 * 60 * 60 * 1000)));
    const prevTo = new Date(cFrom.getTime() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - (days - 1));
    prevFrom.setHours(0, 0, 0, 0);
    // Switch to monthly buckets for long windows so the sparkline stays
    // readable; daily buckets work fine up to ~2 months.
    const bucket: 'day' | 'month' = days > 62 ? 'month' : 'day';
    const buckets = bucket === 'day'
      ? days
      : (cTo.getFullYear() - cFrom.getFullYear()) * 12 + (cTo.getMonth() - cFrom.getMonth()) + 1;
    return { from: cFrom, to: cTo, prevFrom, prevTo, bucket, buckets };
  }
  // `today` is a 1-day window starting at local midnight; the previous
  // window is yesterday so the delta KPI is meaningful day-over-day.
  const days = range === 'today' ? 1 : range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  prevFrom.setHours(0, 0, 0, 0);
  return { from, to, prevFrom, prevTo, bucket: 'day', buckets: days };
}

export interface StoreAnalyticsRich {
  range: RangeKey;
  currency: string;
  window: { from: string; to: string };
  /** Headline KPIs over [from, to], each with a delta vs the previous window. */
  kpis: {
    /**
     * Sum of `total` across ALL orders in the window, regardless of paymentStatus.
     * The "ventes" figure most sellers want to see — especially in COD-heavy
     * markets where `revenue` (paid-only) stays behind reality.
     */
    sales: { value: number; previous: number; deltaPct: number | null };
    revenue: { value: number; previous: number; deltaPct: number | null };
    orders: { value: number; previous: number; deltaPct: number | null };
    paidOrders: { value: number; previous: number; deltaPct: number | null };
    averageOrderValue: { value: number; previous: number; deltaPct: number | null };
    refundRate: { value: number; previous: number; deltaPct: number | null };
    fulfillmentRate: { value: number; previous: number; deltaPct: number | null };
    uniqueCustomers: { value: number; previous: number; deltaPct: number | null };
    pendingOrders: { value: number };
    /** Any storefront page hit (landing + info pages + product pages). */
    pageViews: { value: number; previous: number; deltaPct: number | null };
    /** Subset of pageViews — only the public product detail page. */
    productViews: { value: number; previous: number; deltaPct: number | null };
  };
  /** All-time aggregates (no window filter). */
  totals: {
    totalRevenue: number;
    /** Sum of `total` across ALL orders ever placed (regardless of payment status). */
    totalSales: number;
    totalOrders: number;
    totalCustomers: number;
  };
  /** Revenue + orders bucketed by day (or month for 12m). */
  timeseries: Array<{ date: string; revenue: number; orders: number; paid: number }>;
  /** Top products by paid revenue in window. */
  topProducts: Array<{
    productId: string;
    name: string;
    image?: string;
    unitsSold: number;
    revenue: number;
  }>;
  /** Paid-orders breakdown by payment provider (Wave/OM/MTN/Moov/Card). */
  paymentBreakdown: Array<{ provider: string; orders: number; revenue: number }>;
  /** Fulfillment funnel for the window. */
  funnel: {
    created: number;
    paid: number;
    fulfilled: number;
    refunded: number;
  };
  /** Recent activity for the side panel. */
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customer: string;
    email: string;
    total: number;
    currency: string;
    paymentStatus: string;
    fulfillmentStatus: string;
    createdAt: string;
  }>;
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
}

function emptyBucket(from: Date, to: Date, bucket: 'day' | 'month'): Map<string, { revenue: number; orders: number; paid: number }> {
  const out = new Map<string, { revenue: number; orders: number; paid: number }>();
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = bucket === 'day'
      ? cursor.toISOString().slice(0, 10)
      : `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    out.set(key, { revenue: 0, orders: 0, paid: 0 });
    if (bucket === 'day') cursor.setDate(cursor.getDate() + 1);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

/** Aggregate order stats for a store. Legacy 4-KPI shape kept for old callers. */
export async function getStoreAnalytics(storeId: string): Promise<StoreAnalytics> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const storeObjectId = new mongoose.Types.ObjectId(storeId);

  const [total, thisMonth, store, viewsTotal, viewsMonth] = await Promise.all([
    Order.aggregate([
      { $match: { storeId: storeObjectId } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] } },
          orderValue: { $sum: '$total' },
        },
      },
    ]),
    Order.aggregate([
      { $match: { storeId: storeObjectId, createdAt: { $gte: startOfMonth } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] } },
          orderValue: { $sum: '$total' },
        },
      },
    ]),
    Store.findById(storeObjectId, { 'settings.currency': 1 }).lean(),
    StoreEvent.aggregate<{ _id: 'page_view' | 'product_view'; count: number }>([
      { $match: { storeId: storeObjectId, type: { $in: ['page_view', 'product_view'] } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
    StoreEvent.aggregate<{ _id: 'page_view' | 'product_view'; count: number }>([
      { $match: { storeId: storeObjectId, type: { $in: ['page_view', 'product_view'] }, createdAt: { $gte: startOfMonth } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
  ]);

  const countBy = (rows: Array<{ _id: 'page_view' | 'product_view'; count: number }>, type: 'page_view' | 'product_view') =>
    rows.find((r) => r._id === type)?.count ?? 0;

  return {
    totalOrders: total[0]?.count ?? 0,
    totalRevenue: total[0]?.revenue ?? 0,
    totalOrderValue: total[0]?.orderValue ?? 0,
    ordersThisMonth: thisMonth[0]?.count ?? 0,
    revenueThisMonth: thisMonth[0]?.revenue ?? 0,
    orderValueThisMonth: thisMonth[0]?.orderValue ?? 0,
    conversionRate: undefined,
    storeViews: undefined,
    currency: (store as { settings?: { currency?: string } } | null)?.settings?.currency,
    pageViews: countBy(viewsTotal, 'page_view'),
    pageViewsThisMonth: countBy(viewsMonth, 'page_view'),
    productViews: countBy(viewsTotal, 'product_view'),
    productViewsThisMonth: countBy(viewsMonth, 'product_view'),
  };
}

/** Full analytics payload powering the new dashboard. */
export async function getStoreAnalyticsRich(
  storeId: string,
  range: RangeKey = '30d',
  custom?: CustomRange
): Promise<StoreAnalyticsRich> {
  const storeObjectId = new mongoose.Types.ObjectId(storeId);
  const w = resolveRange(range, new Date(), range === 'custom' ? custom : undefined);

  const baseMatch = { storeId: storeObjectId };
  const inWindow = { ...baseMatch, createdAt: { $gte: w.from, $lte: w.to } };
  const inPrev = { ...baseMatch, createdAt: { $gte: w.prevFrom, $lte: w.prevTo } };

  // Currency is anchored to the store's settings — the seller owns this choice
  // even when there are no orders yet, and order-level currency may drift if
  // the seller updates the store currency later.
  const storeDoc = await Store.findById(storeObjectId).select('settings.currency').lean();
  const storeCurrency: string = storeDoc?.settings?.currency || 'USD';

  const [
    totals,
    windowAgg,
    prevAgg,
    pendingNow,
    seriesRaw,
    topProductsRaw,
    paymentBreakdownRaw,
    recentRaw,
    windowViews,
    prevViews,
  ] = await Promise.all([
    // All-time totals (any status).
    Order.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] } },
          sales: { $sum: '$total' },
          customers: { $addToSet: '$email' },
          currency: { $first: '$currency' },
        },
      },
      { $project: { orders: 1, revenue: 1, sales: 1, customers: { $size: '$customers' }, currency: 1 } },
    ]),
    // Window aggregate — split by paymentStatus to derive every KPI in one pass.
    Order.aggregate([
      { $match: inWindow },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
          refunded: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, 1, 0] } },
          fulfilled: { $sum: { $cond: [{ $eq: ['$fulfillmentStatus', 'fulfilled'] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] } },
          sales: { $sum: '$total' },
          uniqueCustomers: { $addToSet: '$email' },
        },
      },
      { $project: { orders: 1, paid: 1, refunded: 1, fulfilled: 1, revenue: 1, sales: 1, uniqueCustomers: { $size: '$uniqueCustomers' } } },
    ]),
    // Previous-window aggregate for delta comparison.
    Order.aggregate([
      { $match: inPrev },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
          refunded: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, 1, 0] } },
          fulfilled: { $sum: { $cond: [{ $eq: ['$fulfillmentStatus', 'fulfilled'] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] } },
          sales: { $sum: '$total' },
          uniqueCustomers: { $addToSet: '$email' },
        },
      },
      { $project: { orders: 1, paid: 1, refunded: 1, fulfilled: 1, revenue: 1, sales: 1, uniqueCustomers: { $size: '$uniqueCustomers' } } },
    ]),
    // Pending-payment count is a snapshot, not a window aggregate.
    Order.countDocuments({ ...baseMatch, paymentStatus: 'pending' }),
    // Timeseries — bucketed by day or month depending on range.
    Order.aggregate([
      { $match: inWindow },
      {
        $group: {
          _id: w.bucket === 'day'
            ? { $dateToString: { date: '$createdAt', format: '%Y-%m-%d' } }
            : { $dateToString: { date: '$createdAt', format: '%Y-%m' } },
          orders: { $sum: 1 },
          paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] } },
        },
      },
    ]),
    // Top products — only paid orders count.
    Order.aggregate([
      { $match: { ...inWindow, paymentStatus: 'paid' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          name: { $first: '$items.name' },
          unitsSold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]),
    // Payment-provider mix (paid orders only).
    Order.aggregate([
      { $match: { ...inWindow, paymentStatus: 'paid' } },
      {
        $group: {
          _id: { $ifNull: ['$paymentProvider', '$paymentMethod'] },
          orders: { $sum: 1 },
          revenue: { $sum: '$total' },
        },
      },
      { $sort: { revenue: -1 } },
    ]),
    // Recent 8 orders (any status) for the side panel.
    Order.find(baseMatch)
      .sort({ createdAt: -1 })
      .limit(8)
      .select('orderNumber email customerName total currency paymentStatus fulfillmentStatus createdAt')
      .lean(),
    // Storefront page-view + product-view counts for the current window.
    StoreEvent.aggregate<{ _id: 'page_view' | 'product_view'; count: number }>([
      { $match: { storeId: storeObjectId, type: { $in: ['page_view', 'product_view'] }, createdAt: { $gte: w.from, $lte: w.to } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
    // …and for the previous window, so the KPI cards can show a delta.
    StoreEvent.aggregate<{ _id: 'page_view' | 'product_view'; count: number }>([
      { $match: { storeId: storeObjectId, type: { $in: ['page_view', 'product_view'] }, createdAt: { $gte: w.prevFrom, $lte: w.prevTo } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
  ]);

  const t = totals[0] || { orders: 0, revenue: 0, sales: 0, customers: 0, currency: storeCurrency };
  const a = windowAgg[0] || { orders: 0, paid: 0, refunded: 0, fulfilled: 0, revenue: 0, sales: 0, uniqueCustomers: 0 };
  const p = prevAgg[0] || { orders: 0, paid: 0, refunded: 0, fulfilled: 0, revenue: 0, sales: 0, uniqueCustomers: 0 };
  // Always trust the store settings — order currency may be stale if the
  // seller changed their store currency after past orders were placed.
  const currency: string = storeCurrency;

  // Build the dense timeseries — fill empty buckets with zeroes.
  const seriesMap = emptyBucket(w.from, w.to, w.bucket);
  for (const row of seriesRaw as Array<{ _id: string; orders: number; paid: number; revenue: number }>) {
    if (seriesMap.has(row._id)) seriesMap.set(row._id, { revenue: row.revenue, orders: row.orders, paid: row.paid });
  }
  const timeseries = Array.from(seriesMap.entries()).map(([date, v]) => ({ date, ...v }));

  // Resolve product images for top products.
  const topIds = (topProductsRaw as Array<{ _id: mongoose.Types.ObjectId; name: string; unitsSold: number; revenue: number }>).map((r) => r._id);
  const productImages = topIds.length
    ? await Product.find({ _id: { $in: topIds } }).select('images').lean()
    : [];
  const imgById = new Map(productImages.map((p) => [p._id.toString(), p.images?.[0]]));
  const topProducts = (topProductsRaw as Array<{ _id: mongoose.Types.ObjectId; name: string; unitsSold: number; revenue: number }>).map((r) => ({
    productId: r._id.toString(),
    name: r.name,
    image: imgById.get(r._id.toString()),
    unitsSold: r.unitsSold,
    revenue: r.revenue,
  }));

  const sumByType = (rows: Array<{ _id: 'page_view' | 'product_view'; count: number }>) => {
    let pv = 0, pr = 0;
    for (const r of rows) {
      if (r._id === 'page_view') pv = r.count;
      else if (r._id === 'product_view') pr = r.count;
    }
    return { pageViews: pv, productViews: pr };
  };
  const curViews = sumByType(windowViews);
  const prvViews = sumByType(prevViews);

  const refundRate = a.paid === 0 ? 0 : (a.refunded / Math.max(a.paid + a.refunded, 1)) * 100;
  const prevRefundRate = p.paid === 0 ? 0 : (p.refunded / Math.max(p.paid + p.refunded, 1)) * 100;
  const fulfillmentRate = a.paid === 0 ? 0 : (a.fulfilled / a.paid) * 100;
  const prevFulfillmentRate = p.paid === 0 ? 0 : (p.fulfilled / p.paid) * 100;
  const aov = a.paid === 0 ? 0 : a.revenue / a.paid;
  const prevAov = p.paid === 0 ? 0 : p.revenue / p.paid;

  return {
    range,
    currency,
    window: { from: w.from.toISOString(), to: w.to.toISOString() },
    kpis: {
      // Sum of `total` across ALL orders in the window, regardless of paymentStatus.
      // Most useful for COD-heavy markets where revenue (paid-only) lags.
      sales: { value: a.sales, previous: p.sales, deltaPct: pctDelta(a.sales, p.sales) },
      revenue: { value: a.revenue, previous: p.revenue, deltaPct: pctDelta(a.revenue, p.revenue) },
      orders: { value: a.orders, previous: p.orders, deltaPct: pctDelta(a.orders, p.orders) },
      paidOrders: { value: a.paid, previous: p.paid, deltaPct: pctDelta(a.paid, p.paid) },
      averageOrderValue: { value: aov, previous: prevAov, deltaPct: pctDelta(aov, prevAov) },
      refundRate: { value: refundRate, previous: prevRefundRate, deltaPct: pctDelta(refundRate, prevRefundRate) },
      fulfillmentRate: { value: fulfillmentRate, previous: prevFulfillmentRate, deltaPct: pctDelta(fulfillmentRate, prevFulfillmentRate) },
      uniqueCustomers: { value: a.uniqueCustomers, previous: p.uniqueCustomers, deltaPct: pctDelta(a.uniqueCustomers, p.uniqueCustomers) },
      pendingOrders: { value: pendingNow },
      pageViews: { value: curViews.pageViews, previous: prvViews.pageViews, deltaPct: pctDelta(curViews.pageViews, prvViews.pageViews) },
      productViews: { value: curViews.productViews, previous: prvViews.productViews, deltaPct: pctDelta(curViews.productViews, prvViews.productViews) },
    },
    totals: { totalRevenue: t.revenue, totalSales: t.sales, totalOrders: t.orders, totalCustomers: t.customers },
    timeseries,
    topProducts,
    paymentBreakdown: (paymentBreakdownRaw as Array<{ _id: string; orders: number; revenue: number }>).map((r) => ({
      provider: r._id || 'unknown',
      orders: r.orders,
      revenue: r.revenue,
    })),
    funnel: { created: a.orders, paid: a.paid, fulfilled: a.fulfilled, refunded: a.refunded },
    recentOrders: (recentRaw as Array<{
      _id: mongoose.Types.ObjectId; orderNumber: string; email: string; customerName?: string;
      total: number; currency: string; paymentStatus: string; fulfillmentStatus: string; createdAt: Date;
    }>).map((o) => ({
      id: o._id.toString(),
      orderNumber: o.orderNumber,
      customer: o.customerName || o.email,
      email: o.email,
      total: o.total,
      currency: o.currency,
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}
