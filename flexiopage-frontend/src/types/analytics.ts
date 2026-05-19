/**
 * Shape mirrors the backend `StoreAnalyticsRich` payload returned by
 * GET /api/stores/:storeId/analytics/rich?range=<today|7d|30d|90d|12m|custom>.
 * When range='custom', the caller must also send `from` + `to` (YYYY-MM-DD).
 */
export type RangeKey = 'today' | '7d' | '30d' | '90d' | '12m' | 'custom';

export interface KpiValue {
  value: number;
  previous: number;
  deltaPct: number | null;
}

export interface StoreAnalyticsRich {
  range: RangeKey;
  currency: string;
  window: { from: string; to: string };
  kpis: {
    /** Sum of ALL orders' total in the window (any payment status). */
    sales: KpiValue;
    revenue: KpiValue;
    orders: KpiValue;
    paidOrders: KpiValue;
    averageOrderValue: KpiValue;
    refundRate: KpiValue;
    fulfillmentRate: KpiValue;
    uniqueCustomers: KpiValue;
    pendingOrders: { value: number };
    /** Any storefront page hit (landing + info + product pages). */
    pageViews: KpiValue;
    /** Subset of pageViews — only the product detail page. */
    productViews: KpiValue;
  };
  totals: {
    totalRevenue: number;
    /** Sum of ALL orders' total ever placed (any payment status). */
    totalSales: number;
    totalOrders: number;
    totalCustomers: number;
  };
  timeseries: Array<{ date: string; revenue: number; orders: number; paid: number }>;
  topProducts: Array<{
    productId: string;
    name: string;
    image?: string;
    unitsSold: number;
    revenue: number;
  }>;
  paymentBreakdown: Array<{ provider: string; orders: number; revenue: number }>;
  funnel: {
    created: number;
    paid: number;
    fulfilled: number;
    refunded: number;
  };
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
