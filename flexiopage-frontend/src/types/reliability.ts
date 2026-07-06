/** Fiabilité client (score de retours COD) — cf. backend customerReliability.service. */

export type ReliabilityBadge = 'reliable' | 'watch' | 'risky';

export interface ReliabilityCounts {
  total: number;
  delivered: number;
  returned: number;
  declined: number;
  noAnswer: number;
  decisive: number;
  /** returned / decisive, 0-1. */
  returnRate: number;
}

export interface ReliabilityOrderSummary {
  _id: string;
  orderNumber: string;
  createdAt: string;
  total: number;
  currency: string;
  confirmationStatus?: string;
  fulfillmentStatus?: string;
  deliveryStatus?: string;
  isReturn: boolean;
}

export interface CustomerReliability {
  phoneKey: string | null;
  badge: ReliabilityBadge;
  score: number;
  reasons: string[];
  /** Détail des commandes de la boutique courante. */
  store: ReliabilityCounts & { orders: ReliabilityOrderSummary[] };
  /** Compteurs agrégés plateforme (nombres seuls, sans détail cross-vendeur). */
  platform: ReliabilityCounts;
}
