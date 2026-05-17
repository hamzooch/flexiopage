/**
 * Axios API client for FlexioPage backend.
 * Uses credentials for cookies (JWT). Base URL from env.
 */
import axios, { type AxiosInstance } from 'axios';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
});

// Attach the auth token to every request. The Zustand auth store (persisted
// under `flexiopage-auth`) is the single source of truth — it rehydrates
// synchronously from localStorage on load, so the token is available before
// any request fires, even right after a page refresh.
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = useAuthStore.getState().token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Only clear the session when the server says the auth check itself
    // failed (/auth/me). A 401 from any other endpoint (notifications
    // poll, analytics, a permission-scoped route) MUST NOT wipe the
    // token — that bug silently logged users out from a background
    // call, and on the next refresh AuthGuard saw {token:null} in
    // localStorage and bounced them to /login.
    if (
      err.response?.status === 401 &&
      typeof window !== 'undefined' &&
      typeof err.config?.url === 'string' &&
      /\/auth\/me\b/.test(err.config.url)
    ) {
      useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
    }
    return Promise.reject(err);
  }
);

/**
 * Extract a user-readable error message from anything an axios call might
 * reject with: backend `{ error: "..." }` body, network error, or plain
 * Error. Falls back to the provided default so every caller gets a usable
 * string instead of "[object Object]".
 */
export function extractApiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const ax = err as {
      response?: { data?: { error?: string; message?: string } };
      message?: string;
      code?: string;
    };
    const apiMsg = ax.response?.data?.error || ax.response?.data?.message;
    if (apiMsg) return apiMsg;
    // Network-level error (server down, CORS, timeout) — axios sets a code.
    if (ax.code === 'ERR_NETWORK') return 'Connexion impossible au serveur. Vérifie ta connexion.';
    if (ax.code === 'ECONNABORTED') return 'Le serveur a mis trop de temps à répondre. Réessaie.';
    if (ax.message) return ax.message;
  }
  return fallback;
}

// Auth
export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    api.post<{ user: unknown; token: string }>('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post<{ user: unknown; token: string }>('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<{ user: unknown }>('/auth/me'),
};

// Users
export const usersApi = {
  getProfile: () => api.get<{ user: unknown; subscription: unknown }>('/users/profile'),
  updateProfile: (data: { name?: string; avatar?: string; country?: string; currency?: string }) =>
    api.patch<{ user: unknown; walletCurrencyUpdated?: boolean; walletCurrencyPinned?: boolean }>('/users/profile', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post<{ ok: boolean }>('/users/change-password', data),
  getStores: () => api.get<{ stores: unknown[] }>('/users/stores'),
};

// Team — seller invites staff (managers, confirmation agents)
export type TeamRole = 'manager' | 'confirmation_agent';

export interface TeamMember {
  _id: string;
  name: string;
  email: string;
  teamRole: TeamRole;
  suspended?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

export const teamApi = {
  list: () => api.get<{ members: TeamMember[] }>('/team'),
  create: (data: { name: string; email: string; password: string; teamRole: TeamRole }) =>
    api.post<{ member: TeamMember }>('/team', data),
  update: (
    id: string,
    data: { name?: string; teamRole?: TeamRole; suspended?: boolean; password?: string }
  ) => api.patch<{ member: TeamMember }>(`/team/${id}`, data),
  remove: (id: string) => api.delete<{ ok: boolean }>(`/team/${id}`),
};

// Wallet — main balance (commission per sale) + AI balance (generation cost)
export type WalletBucket = 'main' | 'ai';
export interface WalletTransaction {
  id: string;
  kind: 'top_up' | 'top_up_ai' | 'commission' | 'ai_generation' | 'refund' | 'adjustment';
  bucket: WalletBucket;
  amount: number;
  balanceAfter: number;
  orderNumber?: string;
  paymentReference?: string;
  note?: string;
  createdAt: string;
}
export interface WalletState {
  balance: number;
  aiBalance: number;
  currency: string;
  commissionRate: number;
  commissionCap: number;
  aiCosts: { landing: number; product_page: number; text_only: number };
  transactions: WalletTransaction[];
  updatedAt: string;
}
export const walletApi = {
  get: () => api.get<{ wallet: WalletState }>('/wallet'),
  topUp: (data: { amount: number; target?: WalletBucket; paymentReference?: string; note?: string }) =>
    api.post<{
      ok: boolean;
      bucket: WalletBucket;
      balance: number;
      aiBalance: number;
      transaction: WalletTransaction;
      alreadyApplied: boolean;
    }>('/wallet/top-up', data),
};

// ─────────────────────────────────────────────────────────────────────
// Poster generation — single tall ad-style image (TryAd-like)
// ─────────────────────────────────────────────────────────────────────
export type PosterTheme = 'gold-dark' | 'cinema' | 'warm-tan';
export type PosterFormat = 'story' | 'square' | 'landscape';
export interface PosterFeature {
  icon: 'check' | 'shield' | 'truck' | 'clock' | 'star' | 'sparkles' | 'zap' | 'gift' | 'crown' | 'lock' | 'refresh';
  title: string;
  body: string;
}
export interface PosterTestimonial {
  quote: string;
  author: string;
  role?: string;
  rating?: number;
  avatarUrl?: string;
}
export interface PosterContent {
  theme: PosterTheme;
  format: PosterFormat;
  direction: 'ltr' | 'rtl';
  language: string;
  hero: {
    badge?: string;
    eyebrow?: string;
    title: string;
    subtitle: string;
    productImageUrl?: string;
    lifestyleImageUrl?: string;
  };
  pricing: {
    priceAfter: number;
    priceBefore?: number;
    currency: string;
    discountBadge?: string;
  };
  trustBadges: string[];
  features: PosterFeature[];
  testimonials: PosterTestimonial[];
  /** One short chiffré social-proof line shown between features and testimonials. */
  socialProof?: string;
  cta: {
    label: string;
    /** Big urgency hook above the CTA button. */
    hook?: string;
    reassurance?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────
// Landing-page-as-image — full 9:16 designed mockup (TryAd-style)
// ─────────────────────────────────────────────────────────────────────
export interface LandingImageCopy {
  headline: string;
  subheadline?: string;
  reassurance: string[];
  benefits: Array<{ title: string; body: string }>;
  socialProof: string;
  testimonials: Array<{ quote: string; author: string }>;
  cta: string;
  ctaReassurance: string;
}
export interface LandingImageResult {
  imageUrl: string;
  width: number;
  height: number;
  copy: LandingImageCopy;
}

// ─────────────────────────────────────────────────────────────────────
// Store analytics — light 4-KPI shape consumed by the dashboard cards
// ─────────────────────────────────────────────────────────────────────
export interface StoreAnalyticsSummary {
  totalOrders: number;
  /** Sum of all paid orders only. */
  totalRevenue: number;
  /** Sum of ALL orders regardless of payment status — what sellers usually want to see. */
  totalOrderValue: number;
  ordersThisMonth: number;
  revenueThisMonth: number;
  orderValueThisMonth: number;
  conversionRate?: number;
  storeViews?: number;
  currency?: string;
  /** All-time anonymous storefront page views. */
  pageViews?: number;
  pageViewsThisMonth?: number;
  /** All-time anonymous product detail page views. */
  productViews?: number;
  productViewsThisMonth?: number;
}

// ─────────────────────────────────────────────────────────────────────
// Storefront funnel tracking — "Suivi" dashboard
// ─────────────────────────────────────────────────────────────────────
export type TrackingRange = '7d' | '30d' | '90d';
export interface TrackingStats {
  range: TrackingRange;
  totals: {
    /** Any storefront page hit. */
    pageViews: number;
    productViews: number;
    addToCart: number;
    purchases: number;
    abandonedCarts: number;
    viewToCartRate: number;
    cartToPurchaseRate: number;
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

// ─────────────────────────────────────────────────────────────────────
// Product bundle — quantity-tier offer ("buy 2 for X")
// ─────────────────────────────────────────────────────────────────────
export interface ProductBundleTier {
  quantity: number;
  totalPrice: number;
  label?: string;
}
export interface ProductBundle {
  enabled: boolean;
  title?: string;
  tiers: ProductBundleTier[];
}

// ─────────────────────────────────────────────────────────────────────
// Admin API — platform-wide dashboard, requires role='admin'
// ─────────────────────────────────────────────────────────────────────
export interface AdminOverview {
  users: number;
  stores: number;
  products: number;
  orders: { total: number; paid: number; delivered: number };
  gmv30d: Record<string, number>;
  walletsByCurrency: Array<{ _id: string; totalBalance: number; totalAi: number; count: number }>;
  commissionByCurrency: Array<{ _id: string; total: number; count: number }>;
  complaints: { open: number; urgent: number };
  ordersByDay30d: Array<{ date: string; orders: number; revenue: number }>;
  recentOrders: Array<{
    _id: string;
    orderNumber: string;
    total: number;
    currency: string;
    paymentStatus: string;
    fulfillmentStatus: string;
    customerName?: string;
    email?: string;
    storeId?: { _id: string; name: string; slug: string };
    createdAt: string;
  }>;
  recentUsers: Array<{
    _id: string;
    email: string;
    name: string;
    emailVerified?: boolean;
    createdAt: string;
  }>;
  topStores30d: Array<{
    _id: string;
    orders: number;
    gmv: number;
    currency: string;
    name?: string;
    slug?: string;
  }>;
}
export interface AdminUser {
  _id: string;
  email: string;
  name: string;
  role: 'owner' | 'superadmin' | 'admin' | 'supervisor' | 'user';
  emailVerified?: boolean;
  suspended?: boolean;
  suspendedReason?: string;
  suspendedAt?: string;
  lastLoginAt?: string;
  lastLoginIp?: string;
  passwordResetAt?: string;
  createdAt?: string;
  storeCount?: number;
}
export interface AdminUserDetail {
  user: AdminUser;
  stats: { stores: number; products: number; orders: number; paidOrders: number; deliveredOrders: number };
  stores: Array<{ _id: string; name: string; slug: string; storeType?: string; isPublished?: boolean; settings?: { currency?: string; country?: string }; createdAt?: string }>;
  wallet: { balance: number; aiBalance: number; currency: string; txCount: number } | null;
}
export interface AdminStore {
  _id: string;
  name: string;
  slug: string;
  storeType?: 'physical' | 'digital';
  isPublished?: boolean;
  ownerId?: { _id: string; email: string; name: string };
  settings?: { currency?: string; country?: string };
  createdAt?: string;
}
export interface AdminOrder {
  _id: string;
  orderNumber: string;
  total: number;
  currency: string;
  paymentStatus: string;
  paymentMethod: string;
  fulfillmentStatus: string;
  customerName?: string;
  email?: string;
  storeId?: { _id: string; name: string; slug: string };
  createdAt?: string;
}
export interface AdminWallet {
  _id: string;
  userId?: { _id: string; email: string; name: string };
  balance: number;
  aiBalance: number;
  currency: string;
  updatedAt?: string;
}

export type AdminActivityType =
  | 'user.signup'
  | 'order.created'
  | 'order.paid'
  | 'store.published'
  | 'delivery.dispatched'
  | 'delivery.dispatch_failed';

export interface AdminActivityEvent {
  _id: string;
  type: AdminActivityType;
  message: string;
  userId?: { _id: string; email: string; name: string } | null;
  storeId?: { _id: string; name: string; slug: string } | null;
  orderId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────
// Complaints (réclamations)
// ─────────────────────────────────────────────────────────────────────
export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type ComplaintCategory = 'order' | 'payment' | 'wallet' | 'account' | 'delivery' | 'other';
export type ComplaintPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ComplaintMessage {
  authorId: string;
  authorName: string;
  authorRole: 'user' | 'admin' | 'superadmin';
  body: string;
  createdAt: string;
}

export interface MyComplaint {
  _id: string;
  subject: string;
  category: ComplaintCategory;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  messages: ComplaintMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminComplaint extends MyComplaint {
  userId?: { _id: string; email: string; name: string };
  assignedTo?: { _id: string; email: string; name: string };
  orderId?: string;
  storeId?: string;
}

export const complaintsApi = {
  create: (data: { subject: string; category?: ComplaintCategory; message: string; orderId?: string; storeId?: string }) =>
    api.post<{ complaint: MyComplaint }>('/complaints', data),
  list: () => api.get<{ complaints: MyComplaint[] }>('/complaints'),
  get: (id: string) => api.get<{ complaint: MyComplaint }>(`/complaints/${id}`),
  reply: (id: string, message: string) =>
    api.post<{ complaint: MyComplaint }>(`/complaints/${id}/messages`, { message }),
};

export type StaffRole = 'owner' | 'superadmin' | 'admin' | 'supervisor' | 'user';

export const adminApi = {
  overview: () => api.get<{ overview: AdminOverview }>('/admin/overview'),
  overviewRich: (range: 'today' | '7d' | '30d' | '90d' | '12m' = '30d') =>
    api.get<import('@/types/admin-analytics').AdminOverviewRich>('/admin/overview/rich', { params: { range } }),
  storeDrilldown: (storeId: string, range: 'today' | '7d' | '30d' | '90d' | '12m' = '30d') =>
    api.get<import('@/types/admin-analytics').AdminStoreDrilldown>(`/admin/stores/${storeId}/analytics`, { params: { range } }),
  users: (search?: string) =>
    api.get<{ users: AdminUser[]; total: number }>('/admin/users', { params: { search } }),
  userDetail: (userId: string) =>
    api.get<AdminUserDetail>(`/admin/users/${userId}`),
  createUser: (data: { email: string; name: string; password: string; role: StaffRole }) =>
    api.post<{ user: AdminUser }>('/admin/users', data),
  patchUser: (
    userId: string,
    data: Partial<{ name: string; role: StaffRole; emailVerified: boolean; suspended: boolean; suspendedReason: string }>
  ) => api.patch<{ user: AdminUser }>(`/admin/users/${userId}`, data),
  setUserRole: (userId: string, role: StaffRole) =>
    api.patch<{ user: AdminUser }>(`/admin/users/${userId}/role`, { role }),
  /** Superadmin only — direct positive top-up of main or AI balance. */
  creditWallet: (
    userId: string,
    data: { amount: number; target?: WalletBucket; paymentReference?: string; note?: string }
  ) =>
    api.post<{ ok: boolean; bucket: WalletBucket; balance: number; aiBalance: number; alreadyApplied: boolean }>(
      `/admin/wallets/${userId}/credit`,
      data
    ),
  // Complaints (admin)
  listComplaints: (params?: { status?: string; category?: string; search?: string }) =>
    api.get<{ complaints: AdminComplaint[]; counts: Record<string, number> }>('/admin/complaints', { params }),
  getComplaint: (id: string) =>
    api.get<{ complaint: AdminComplaint }>(`/admin/complaints/${id}`),
  patchComplaint: (
    id: string,
    data: Partial<{ status: ComplaintStatus; priority: ComplaintPriority; assignedTo: string | null }>
  ) => api.patch<{ complaint: AdminComplaint }>(`/admin/complaints/${id}`, data),
  replyComplaint: (id: string, message: string) =>
    api.post<{ complaint: AdminComplaint }>(`/admin/complaints/${id}/messages`, { message }),
  resetUserPassword: (userId: string, newPassword?: string) =>
    api.post<{ ok: boolean; email: string; temporaryPassword: string; note: string }>(
      `/admin/users/${userId}/reset-password`,
      { newPassword }
    ),
  deleteUser: (userId: string) =>
    api.delete<{ ok: boolean; email: string }>(`/admin/users/${userId}`),
  stores: () => api.get<{ stores: AdminStore[]; total: number }>('/admin/stores'),
  orders: () => api.get<{ orders: AdminOrder[]; total: number }>('/admin/orders'),
  wallets: () => api.get<{ wallets: AdminWallet[] }>('/admin/wallets'),
  activity: (params?: { limit?: number; cursor?: string; type?: string }) =>
    api.get<{ items: AdminActivityEvent[]; nextCursor: string | null }>('/admin/activity', { params }),
  adjustWallet: (
    userId: string,
    data: { amount: number; bucket?: WalletBucket; reason: string }
  ) =>
    api.post<{ ok: boolean; balance: number; aiBalance: number }>(
      `/admin/wallets/${userId}/adjust`,
      data
    ),

  // ── AI pricing (read by any admin tier, write by superadmin+) ──
  getAiPricing: () =>
    api.get<{
      aiPricing: {
        prices: { landing: number; poster: number; product_page: number; text_only: number };
        rates: Record<string, number>;
      };
      defaults: {
        prices: { landing: number; poster: number; product_page: number; text_only: number };
        rates: Record<string, number>;
      };
      updatedAt: string;
    }>('/admin/settings/ai-pricing'),
  updateAiPricing: (data: {
    prices?: Partial<{ landing: number; poster: number; product_page: number; text_only: number }>;
    rates?: Record<string, number>;
  }) =>
    api.put<{
      aiPricing: {
        prices: { landing: number; poster: number; product_page: number; text_only: number };
        rates: Record<string, number>;
      };
      updatedAt: string;
    }>('/admin/settings/ai-pricing', data),
};

// Stores (and nested resources)
export const storesApi = {
  list: () => api.get<{ stores: unknown[] }>('/stores'),
  create: (data: {
    name: string;
    slug?: string;
    description?: string;
    storeType: 'physical' | 'digital';
    theme?: Record<string, unknown>;
    /** Default locale — used to pre-fill landing-page generation. */
    currency?: string;
    language?: string;
    country?: string;
  }) => api.post<{ store: unknown }>('/stores', data),
  get: (storeId: string) => api.get<{ store: unknown }>(`/stores/${storeId}`),
  update: (storeId: string, data: Record<string, unknown>) =>
    api.patch<{ store: unknown }>(`/stores/${storeId}`, data),
  getAnalytics: (storeId: string) =>
    api.get<StoreAnalyticsSummary>(`/stores/${storeId}/analytics`),
  getAnalyticsRich: (storeId: string, range: 'today' | '7d' | '30d' | '90d' | '12m' = '30d') =>
    api.get<import('@/types/analytics').StoreAnalyticsRich>(`/stores/${storeId}/analytics/rich`, { params: { range } }),
  // Custom domain
  getDomainTarget: (storeId: string) =>
    api.get<{ host: string; ips: string[] }>(`/stores/${storeId}/domain-target`),
  verifyDomain: (storeId: string) =>
    api.post<{ domain: string; expectedTarget: string; expectedIps: string[]; cname?: string[]; aRecords?: string[]; verified: boolean; reason?: string; saved?: boolean }>(`/stores/${storeId}/verify-domain`),
  checkDomain: (storeId: string, domain: string) =>
    api.post<{ domain: string; expectedTarget: string; verified: boolean; cname?: string[]; aRecords?: string[]; reason?: string }>(`/stores/${storeId}/check-domain`, { domain }),
  // Google Sheets webhook
  testSheets: (storeId: string, webhookUrl?: string) =>
    api.post<{ ok: boolean; status?: number; error?: string }>(`/stores/${storeId}/integrations/sheets/test`, { webhookUrl }),
  // Products
  listProducts: (storeId: string, params?: { published?: string }) =>
    api.get<{ products: unknown[] }>(`/stores/${storeId}/products`, { params }),
  createProduct: (storeId: string, data: Record<string, unknown>) =>
    api.post<{ product: unknown }>(`/stores/${storeId}/products`, data),
  getProduct: (storeId: string, productId: string) =>
    api.get<{ product: unknown }>(`/stores/${storeId}/products/${productId}`),
  updateProduct: (storeId: string, productId: string, data: Record<string, unknown>) =>
    api.patch<{ product: unknown }>(`/stores/${storeId}/products/${productId}`, data),
  deleteProduct: (storeId: string, productId: string) =>
    api.delete(`/stores/${storeId}/products/${productId}`),
  // Pages
  listPages: (storeId: string) => api.get<{ pages: unknown[] }>(`/stores/${storeId}/pages`),
  getPageTemplates: (storeId: string) =>
    api.get<{ templates: Array<{ id: string; name: string; description: string; category: string; sectionCount: number }> }>(
      `/stores/${storeId}/pages/templates/list`
    ),
  generateAiPage: (storeId: string, data: { storeName: string; productType?: string; productNames?: string; description?: string; tone?: string }) =>
    api.post<{ sections: unknown[]; seoTitle?: string; seoDescription?: string }>(
      `/stores/${storeId}/pages/generate-ai`,
      data
    ),
  generateFromProduct: (
    storeId: string,
    data: {
      productId: string;
      tone?: 'professional' | 'friendly' | 'minimal';
      language?: string;
      country?: string;
      category?: string;
      priceBefore?: number;
      priceAfter?: number;
      currency?: string;
      pageKind?: 'landing' | 'product';
    }
  ) =>
    api.post<{
      sections: unknown[];
      seoTitle?: string;
      seoDescription?: string;
      language?: string;
      direction?: 'ltr' | 'rtl';
      currency?: string;
      country?: string;
    }>(`/stores/${storeId}/pages/generate-from-product`, data),
  generateFromImage: (
    storeId: string,
    data: {
      imageUrl: string;
      productId?: string;
      tone?: 'professional' | 'friendly' | 'minimal';
      language?: string;
      country?: string;
      category?: string;
      priceBefore?: number;
      priceAfter?: number;
      currency?: string;
      pageKind?: 'landing' | 'product';
    }
  ) =>
    api.post<{
      sections: unknown[];
      seoTitle?: string;
      seoDescription?: string;
      imageCaption?: string;
      language?: string;
      direction?: 'ltr' | 'rtl';
      currency?: string;
      country?: string;
    }>(`/stores/${storeId}/pages/generate-from-image`, data),
  // Async variants — return { jobId } and the frontend polls jobsApi.get
  generateFromProductAsync: (
    storeId: string,
    data: {
      productId: string;
      tone?: 'professional' | 'friendly' | 'minimal';
      language?: string;
      country?: string;
      category?: string;
      priceBefore?: number;
      priceAfter?: number;
      currency?: string;
      pageKind?: 'landing' | 'product';
    }
  ) => api.post<{ jobId: string }>(`/stores/${storeId}/pages/generate-from-product/async`, data),
  generateFromImageAsync: (
    storeId: string,
    data: {
      imageUrl: string;
      productId?: string;
      tone?: 'professional' | 'friendly' | 'minimal';
      language?: string;
      country?: string;
      category?: string;
      priceBefore?: number;
      priceAfter?: number;
      currency?: string;
      pageKind?: 'landing' | 'product';
    }
  ) => api.post<{ jobId: string }>(`/stores/${storeId}/pages/generate-from-image/async`, data),
  generatePoster: (
    storeId: string,
    data: {
      productId: string;
      theme?: PosterTheme;
      format?: PosterFormat;
      language?: string;
      country?: string;
      currency?: string;
    }
  ) => api.post<{ poster: PosterContent; charge: { amount: number; balanceAfter: number; currency: string } }>(
    `/stores/${storeId}/pages/generate-poster`,
    data
  ),
  generateLandingImage: (
    storeId: string,
    data: { productId: string; language?: string; country?: string; currency?: string }
  ) => api.post<{ result: LandingImageResult; charge: { amount: number; balanceAfter: number; currency: string } }>(
    `/stores/${storeId}/pages/generate-landing-image`,
    data
  ),
  getTracking: (storeId: string, range: TrackingRange = '30d') =>
    api.get<TrackingStats>(`/stores/${storeId}/tracking`, { params: { range } }),
  getSectionsFromTemplate: (storeId: string, templateId: string) =>
    api.post<{ sections: unknown[] }>(`/stores/${storeId}/pages/from-template`, { templateId }),
  createPage: (storeId: string, data: Record<string, unknown>) =>
    api.post<{ page: unknown }>(`/stores/${storeId}/pages`, data),
  getPage: (storeId: string, pageId: string) =>
    api.get<{ page: unknown }>(`/stores/${storeId}/pages/${pageId}`),
  updatePage: (storeId: string, pageId: string, data: Record<string, unknown>) =>
    api.patch<{ page: unknown }>(`/stores/${storeId}/pages/${pageId}`, data),
  deletePage: (storeId: string, pageId: string) =>
    api.delete(`/stores/${storeId}/pages/${pageId}`),
  // Orders
  listOrders: (storeId: string, params?: { limit?: number; skip?: number }) =>
    api.get<{ orders: unknown[] }>(`/stores/${storeId}/orders`, { params }),
  createOrder: (storeId: string, data: Record<string, unknown>) =>
    api.post<{ order: unknown }>(`/stores/${storeId}/orders`, data),
  getOrder: (storeId: string, orderId: string) =>
    api.get<{ order: unknown }>(`/stores/${storeId}/orders/${orderId}`),
  updateOrderPayment: (storeId: string, orderId: string, data: { paymentStatus: string; stripePaymentIntentId?: string }) =>
    api.patch<{ order: unknown }>(`/stores/${storeId}/orders/${orderId}/payment`, data),
  updateOrderFulfillment: (storeId: string, orderId: string, data: { fulfillmentStatus: string; trackingNumber?: string; trackingUrl?: string }) =>
    api.patch<{ order: unknown }>(`/stores/${storeId}/orders/${orderId}/fulfillment`, data),
  /** Seller-facing manual override — guards against orders already moving at the courier. */
  manualOrderStatus: (storeId: string, orderId: string, data: {
    paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded' | 'manual';
    fulfillmentStatus?: 'unfulfilled' | 'partial' | 'fulfilled' | 'cancelled';
    reason?: string;
    force?: boolean;
  }) =>
    api.patch<{ order: unknown; restockedItems: number }>(`/stores/${storeId}/orders/${orderId}/manual-status`, data),
  // Customers
  listCustomers: (storeId: string) =>
    api.get<{ customers: unknown[] }>(`/stores/${storeId}/customers`),
  // Media
  listMedia: (storeId: string) => api.get<{ media: unknown[] }>(`/stores/${storeId}/media`),
  uploadMedia: (storeId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    // Do NOT set Content-Type manually here — axios needs to detect FormData
    // and inject the multipart boundary (`multipart/form-data; boundary=...`).
    // Setting it ourselves strips the boundary and multer rejects the body.
    return api.post<{ media: unknown }>(`/stores/${storeId}/media`, form);
  },
};

// Public storefront API (no auth)
export const publicApi = {
  getStoreBySlug: (slug: string) => api.get<{ store: unknown }>(`/public/store-by-slug/${slug}`),
  getStoreProducts: (storeSlug: string) =>
    api.get<{ products: unknown[] }>(`/public/stores/${storeSlug}/products`),
  getStoreProduct: (storeSlug: string, productSlug: string) =>
    api.get<{ product: unknown }>(`/public/stores/${storeSlug}/products/${productSlug}`),
  getStorePage: (storeSlug: string, pageSlug: string) =>
    api.get<{ store: unknown; page: unknown }>(`/public/stores/${storeSlug}/pages/${pageSlug}`),
};

// ─────────────────────────────────────────────────────────────────────
// Jobs — async generation polling
// ─────────────────────────────────────────────────────────────────────
export interface GenerationJob {
  _id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  progress: number;
  currentStep: 'analyze' | 'copy' | 'images' | 'assemble';
  steps: Record<'analyze' | 'copy' | 'images' | 'assemble', 'pending' | 'running' | 'done' | 'failed'>;
  result?: {
    sections?: unknown[];
    seoTitle?: string;
    seoDescription?: string;
    language?: string;
    direction?: 'ltr' | 'rtl';
    currency?: string;
    country?: string;
    dialect?: string;
    imagesGenerated?: number;
    imageCaption?: string;
  };
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}

export const jobsApi = {
  get: (jobId: string) => api.get<{ job: GenerationJob }>(`/jobs/${jobId}`),
};

// ─── Notifications ─────────────────────────────────────────────────────
export type NotificationType =
  | 'order.created'
  | 'order.status_changed'
  | 'team.member_added'
  | 'team.member_removed';

export interface NotificationDoc {
  _id: string;
  userId: string;
  storeId?: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  readAt?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const notificationsApi = {
  list: (opts?: { unreadOnly?: boolean; limit?: number }) =>
    api.get<{ notifications: NotificationDoc[] }>('/notifications', {
      params: {
        unreadOnly: opts?.unreadOnly ? 1 : undefined,
        limit: opts?.limit,
      },
    }),
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => api.post<{ notification: NotificationDoc }>(`/notifications/${id}/read`),
  markAllRead: () => api.post<{ updated: number }>('/notifications/read-all'),
};

// ─── COD Profit Calculator ─────────────────────────────────────────────
import type { CalculatorInputs, CalculatorOutputs } from '@/lib/cod-calculator';

export interface CalculatorSnapshot {
  _id: string;
  userId: string;
  name: string;
  inputs: CalculatorInputs;
  outputs: CalculatorOutputs;
  /** Optional ISO country code for the preset that seeded the inputs. */
  country?: string;
  createdAt: string;
}

export const calculatorApi = {
  list: () => api.get<{ snapshots: CalculatorSnapshot[] }>('/calculator/history'),
  save: (data: { name: string; inputs: CalculatorInputs; country?: string }) =>
    api.post<{ snapshot: CalculatorSnapshot }>('/calculator/save', data),
  remove: (id: string) => api.delete<{ ok: true }>(`/calculator/${id}`),
};
