/**
 * Types partagés avec le backend FlexioPage. Volontairement minimalistes :
 * on ne déclare que les champs réellement consommés par l'app mobile.
 * Source de vérité : flexiopage-backend/src/models/*.model.ts
 */

export interface User {
  _id: string;
  email: string;
  name: string;
  avatar?: string;
  role?: string;
  emailVerified?: boolean;
}

export interface Store {
  _id: string;
  name: string;
  slug: string;
  logo?: string;
  currency?: string;
  country?: string;
}

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'manual';
export type FulfillmentStatus = 'unfulfilled' | 'partial' | 'fulfilled' | 'cancelled';
export type ConfirmationStatus =
  | 'pending'
  | 'confirmed'
  | 'no_answer'
  | 'callback'
  | 'declined';

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  sku?: string;
}

export interface Order {
  _id: string;
  orderNumber: string;
  email: string;
  customerName?: string;
  customerPhone?: string;
  shippingAddress?: {
    line1?: string;
    city?: string;
    country?: string;
  };
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  total: number;
  currency: string;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  confirmationStatus?: ConfirmationStatus;
  createdAt: string;
}

export type ProductType = 'physical' | 'digital';

export interface Product {
  _id: string;
  name: string;
  slug: string;
  type: ProductType;
  price: number;
  compareAtPrice?: number;
  sku?: string;
  stock: number;
  trackInventory: boolean;
  images: string[];
  isPublished: boolean;
  description?: string;
}

/** GET /stores/:id/analytics — cartes KPI du tableau de bord. */
export interface AnalyticsSummary {
  totalOrders: number;
  totalRevenue: number;
  totalOrderValue: number;
  ordersThisMonth: number;
  revenueThisMonth: number;
  orderValueThisMonth: number;
  conversionRate?: number;
  storeViews?: number;
  currency?: string;
  pageViews?: number;
  pageViewsThisMonth?: number;
  productViews?: number;
}

export interface Wallet {
  balance: number;
  aiBalance: number;
  currency: string;
}
