/**
 * Mirrors the backend `getOverviewRich` payload returned by
 * GET /api/admin/overview/rich?range=<7d|30d|90d|12m>.
 */
import type { RangeKey, StoreAnalyticsRich } from './analytics';

export interface AdminOverviewRich {
  range: RangeKey;
  window: { from: string; to: string };
  totals: {
    users: number;
    stores: number;
    products: number;
    orders: { total: number; paid: number; delivered: number; failed: number };
    complaints: { open: number; urgent: number };
  };
  walletsByCurrency: Array<{ _id: string; totalBalance: number; totalAi: number; count: number }>;
  commissionByCurrency: Array<{ _id: string; total: number; count: number }>;
  timeseries: {
    revenue: Array<{ date: string; revenue: number; orders: number; paid: number }>;
    signups: Array<{ date: string; signups: number }>;
    commission: Array<{ date: string; commission: number }>;
  };
  paymentMix: Array<{ _id: string; orders: number; revenue: number }>;
  geo: Array<{ _id: string; orders: number; revenue: number }>;
  topStores: Array<{
    _id: string;
    orders: number;
    gmv: number;
    currency?: string;
    name?: string;
    slug?: string;
    logo?: string;
  }>;
  recentOrders: Array<{
    _id: string;
    orderNumber: string;
    total: number;
    currency: string;
    paymentStatus: string;
    fulfillmentStatus: string;
    customerName?: string;
    email: string;
    storeId?: { _id: string; name?: string; slug?: string } | string;
    createdAt: string;
  }>;
  recentUsers: Array<{
    _id: string;
    email: string;
    name?: string;
    createdAt: string;
    emailVerified?: boolean;
    country?: string;
  }>;
  alerts: {
    failedPayments: Array<{
      _id: string;
      orderNumber: string;
      total: number;
      currency: string;
      paymentStatus: string;
      customerName?: string;
      email: string;
      storeId?: { _id: string; name?: string; slug?: string } | string;
      createdAt: string;
    }>;
  };
}

export interface AdminStoreDrilldown {
  store: {
    _id: string;
    name: string;
    slug: string;
    logo?: string;
    isPublished: boolean;
    storeType: 'physical' | 'digital';
    createdAt: string;
    owner?: { _id: string; email: string; name?: string } | string;
    settings?: { currency?: string; country?: string };
  };
  analytics: StoreAnalyticsRich;
}
