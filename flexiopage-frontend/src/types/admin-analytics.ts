/**
 * Mirrors the backend `getOverviewRich` payload returned by
 * GET /api/admin/overview/rich?range=<today|yesterday|7d|30d|90d|12m|all>.
 */
import type { RangeKey, StoreAnalyticsRich } from './analytics';

export interface AdminOverviewRich {
  range: RangeKey;
  window: { from: string; to: string; bucket?: 'day' | 'month' };
  totals: {
    /** Stock actuel, indépendant du filtre. */
    users: number;
    stores: number;
    products: number;
    /** Créés pendant la fenêtre. */
    usersNew: number;
    storesNew: number;
    productsNew: number;
    /** Commandes de la fenêtre. `total` exclut les abandonnées. */
    orders: { total: number; paid: number; delivered: number; failed: number; abandoned: number };
    /** Même forme, fenêtre précédente. Absent pour « Tous les temps ». */
    previous: {
      usersNew: number;
      storesNew: number;
      productsNew: number;
      orders: { total: number; paid: number; delivered: number; failed: number; abandoned: number };
    } | null;
    /** Réclamations encore ouvertes, pas filtrées par date. */
    complaints: { open: number; urgent: number };
  };
  walletsByCurrency: Array<{ _id: string; totalBalance: number; totalAi: number; count: number }>;
  commissionByCurrency: Array<{ _id: string; total: number; count: number }>;
  timeseries: {
    revenue: Array<{ date: string; currency: string; revenue: number; orders: number; paid: number }>;
    signups: Array<{ date: string; signups: number }>;
    commission: Array<{ date: string; currency: string; commission: number }>;
  };
  paymentMix: Array<{ provider: string; currency: string; orders: number; revenue: number }>;
  geo: Array<{ _id: string; currency: string; orders: number; revenue: number }>;
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
    /** Wallets dont le solde commission est négatif. Stock, pas un flux. */
    negativeWallets: number;
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
    /** Override de la commission appliqué à cette boutique (sinon politique globale). */
    commission?: { rate?: number; cap?: number };
  };
  analytics: StoreAnalyticsRich;
}
