/**
 * Axios API client for FlexioPage backend.
 * Uses credentials for cookies (JWT). Base URL from env.
 */
import axios, { type AxiosInstance } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
});

// Attach token from localStorage if present (for SSR we might pass token differently)
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
      const { useAuthStore } = require('@/stores/auth-store');
      useAuthStore.setState({ user: null, token: null, isAuthenticated: false });
    }
    return Promise.reject(err);
  }
);

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
  cta: { label: string; reassurance?: string };
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
  overviewRich: (range: '7d' | '30d' | '90d' | '12m' = '30d') =>
    api.get<import('@/types/admin-analytics').AdminOverviewRich>('/admin/overview/rich', { params: { range } }),
  storeDrilldown: (storeId: string, range: '7d' | '30d' | '90d' | '12m' = '30d') =>
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
  getAnalytics: (storeId: string) => api.get<Record<string, number>>(`/stores/${storeId}/analytics`),
  getAnalyticsRich: (storeId: string, range: '7d' | '30d' | '90d' | '12m' = '30d') =>
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
