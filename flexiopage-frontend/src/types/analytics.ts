/**
 * Shape mirrors the backend `StoreAnalyticsRich` payload returned by
 * GET /api/stores/:storeId/analytics/rich?range=<today|yesterday|7d|30d|90d|12m|all|custom>.
 * When range='custom', the caller must also send `from` + `to` (YYYY-MM-DD).
 * range='all' = tous les temps (de la 1re commande à aujourd'hui).
 */
export type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | '90d' | '12m' | 'all' | 'custom';

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
    /** Taux de conversion = commandes créées / visites × 100. */
    conversionRate: KpiValue;
    /** Taux de confirmation COD = confirmées / créées × 100. */
    codConfirmationRate: KpiValue;
    /** Taux de livraison COD = livrées / confirmées × 100. */
    codDeliveryRate: KpiValue;
  };
  totals: {
    totalRevenue: number;
    /** Sum of ALL orders' total ever placed (any payment status). */
    totalSales: number;
    totalOrders: number;
    totalCustomers: number;
  };
  /** Progression sur l'objectif mensuel du seller. Absent si non configuré. */
  monthlyGoal?: {
    target: number;
    current: number;
    progressPct: number;
    daysLeft: number;
  };
  timeseries: Array<{ date: string; revenue: number; sales: number; orders: number; paid: number }>;
  topProducts: Array<{
    productId: string;
    name: string;
    image?: string;
    unitsSold: number;
    revenue: number;
  }>;
  paymentBreakdown: Array<{ provider: string; orders: number; revenue: number }>;
  /** Visiteurs distincts par appareil sur la fenêtre (unknown = non détecté). */
  devices: { mobile: number; desktop: number; unknown: number };
  /** Sessions distinctes par source (facebook, tiktok, google, direct, …). */
  trafficSources: Array<{ source: string; visitors: number }>;
  /** Commandes + ventes par heure du jour (0..23) sur la fenêtre. */
  hourlySales: Array<{ hour: number; orders: number; sales: number }>;
  /** Funnel COD enrichi 6 étapes — les compteurs sont bruts, le drop-off
   *  se calcule côté client (%). Voir `<CodFunnelWidget>` sur analytics. */
  funnel: {
    created: number;
    contacted: number;
    confirmed: number;
    dispatched: number;
    delivered: number;
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
  /** Top motifs de refus/annulation sur la fenêtre — top 5 codes structurés. */
  cancelReasons: Array<{ code: string; count: number }>;
  /** Chiffre par pays (marketCountry snapshot). */
  byCountry: Array<{ country: string; orders: number; revenue: number; delivered: number }>;
}

/** Codes de motifs de refus alignés sur le backend `CancelReasonCode`. */
export const CANCEL_REASON_LABELS: Record<string, string> = {
  unreachable:    'Client injoignable',
  too_expensive:  'Prix jugé trop cher',
  not_interested: 'Plus intéressé',
  wrong_address:  'Adresse incorrecte',
  out_of_stock:   'Rupture de stock',
  duplicate:      'Commande en double',
  undeliverable:  'Zone non desservie',
  other:          'Autre',
};
