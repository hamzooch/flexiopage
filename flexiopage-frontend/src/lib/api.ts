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

// Attach the auth token to every request.
//
// CONTRE-INTUITIF : Zustand persist v4 rehydrate de manière ASYNCHRONE (un
// microtask chain interne), pas synchrone. Au tout premier render après un
// refresh — y compris avec `next dev` — `useAuthStore.getState().token`
// peut donc renvoyer `null` pendant quelques ms, alors que la donnée est
// déjà présente dans localStorage. Les `useEffect` qui fire `storesApi.list()`
// au mount d'une page dashboard tombent dans ce trou : requête sans
// Authorization → 401 silencieux → catch handler met `setStores([])` → le
// vendeur voit son dashboard vide alors qu'il est bien connecté.
//
// Fix : si la store Zustand est encore vide, on lit directement le blob
// persisté dans localStorage (lecture sync, pas de race). Une fois la
// rehydration finie, la branche `getState().token` reprend la main.
function readAuthToken(): string | null {
  const live = useAuthStore.getState().token;
  if (live) return live;
  try {
    const raw = window.localStorage.getItem('flexiopage-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
    return parsed?.state?.token || null;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = readAuthToken();
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
  /** Google OAuth — `credential` is the ID token returned by GoogleLogin. */
  google: (data: { credential: string }) =>
    api.post<{ user: unknown; token: string }>('/auth/google', data),
  logout: () => api.post('/auth/logout'),
  me: () =>
    api.get<{ user: unknown; platform: { emailVerificationEnabled: boolean } }>('/auth/me'),
  /** Confirme l'email depuis le lien reçu par mail. Idempotent côté backend. */
  verifyEmail: (data: { token: string }) =>
    api.post<{ ok: true; alreadyVerified: boolean }>('/auth/verify-email', data),
  /** Renvoie un nouveau mail de vérification au seller connecté (throttle 1/min). */
  resendVerification: () =>
    api.post<{ ok: true }>('/auth/resend-verification'),
};

// Public support — formulaire de contact ouvert (pas d'auth requise).
// Le backend route POST /api/public/support envoie un mail à
// support@flexiopage.com avec replyTo = l'email saisi.
export type SupportCategory = 'general' | 'sales' | 'technical' | 'billing' | 'partnership' | 'bug-report';
export const supportApi = {
  submit: (data: { name: string; email: string; subject: string; message: string; category?: SupportCategory; website?: string }) =>
    api.post<{ ok: true }>('/public/support', data),
};

// Users
export const usersApi = {
  getProfile: () => api.get<{ user: unknown; subscription: unknown }>('/users/profile'),
  updateProfile: (data: { name?: string; avatar?: string; country?: string; currency?: string }) =>
    api.patch<{ user: unknown; walletCurrencyUpdated?: boolean; walletCurrencyPinned?: boolean }>('/users/profile', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post<{ ok: boolean }>('/users/change-password', data),
  changeEmail: (data: { newEmail: string; currentPassword: string }) =>
    api.post<{ user: { _id: string; email: string; name: string; emailVerified?: boolean } }>('/users/change-email', data),
  getStores: () => api.get<{ stores: unknown[] }>('/users/stores'),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    // Do NOT set Content-Type — axios needs to inject the multipart boundary.
    return api.post<{ user: { avatar?: string }; avatar: string }>('/users/avatar', form);
  },
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
  /**
   * Solde IA en **tokens** (depuis 2026-06-18). Le wallet n'est plus
   * exprimé en monnaie côté IA — c'est un compteur entier.
   */
  aiBalance: number;
  currency: string;
  commissionRate: number;
  commissionCap: number;
  /** Coût par génération, en tokens. */
  aiCosts: { landing: number; product_page: number; text_only: number; poster?: number };
  /** Alias explicite — même contenu que aiCosts. */
  aiTokenCosts?: { landing: number; product_page: number; text_only: number; poster?: number };
  /** Tokens crédités pour 1 USD versé (paramètre admin, défaut 1.5). */
  usdToTokens?: number;
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
      /** Pour AI : tokens réellement crédités (amount USD × usdToTokens). */
      credited?: number;
      /** Ratio appliqué (1 pour main, usdToTokens pour ai). */
      rate?: number;
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
export interface ProductBundleStyle {
  layout?: 'list' | 'grid' | 'compact';
  accentColor?: string;
  badgeColor?: string;
  showSavings?: boolean;
  highlightQuantity?: number;
}
export interface ProductBundle {
  enabled: boolean;
  title?: string;
  tiers: ProductBundleTier[];
  style?: ProductBundleStyle;
}

/** Upsell / cross-sell — reference to another product in the same store. */
export interface RelatedOffer {
  productId: string;
  label?: string;
  discountPct?: number;
  order?: number;
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
  // Range type widened to match the shared RangeKey (which now also includes
  // 'custom'). The admin UI never offers the custom option, so at runtime
  // only the preset values flow through here — this is a typing-only change.
  overviewRich: (range: import('@/types/analytics').RangeKey = '30d') =>
    api.get<import('@/types/admin-analytics').AdminOverviewRich>('/admin/overview/rich', { params: { range } }),
  storeDrilldown: (storeId: string, range: import('@/types/analytics').RangeKey = '30d') =>
    api.get<import('@/types/admin-analytics').AdminStoreDrilldown>(`/admin/stores/${storeId}/analytics`, { params: { range } }),
  users: (params?: { search?: string; limit?: number; skip?: number }) =>
    api.get<{ users: AdminUser[]; total: number; limit: number; skip: number }>('/admin/users', { params }),
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
  stores: (params?: { limit?: number; skip?: number }) =>
    api.get<{ stores: AdminStore[]; total: number; limit: number; skip: number }>('/admin/stores', { params }),
  orders: (params?: { limit?: number; skip?: number }) =>
    api.get<{ orders: AdminOrder[]; total: number; limit: number; skip: number }>('/admin/orders', { params }),
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
  // `prices` est désormais exprimé en **tokens** par génération (depuis
  // 2026-06-18). `usdToTokens` = combien de tokens crédités par 1 USD
  // versé. `rates` est legacy (script de migration historique seulement).
  getAiPricing: () =>
    api.get<{
      aiPricing: {
        prices: { landing: number; poster: number; product_page: number; text_only: number };
        usdToTokens: number;
        rates: Record<string, number>;
      };
      defaults: {
        prices: { landing: number; poster: number; product_page: number; text_only: number };
        usdToTokens: number;
        rates: Record<string, number>;
      };
      updatedAt: string;
    }>('/admin/settings/ai-pricing'),
  updateAiPricing: (data: {
    prices?: Partial<{ landing: number; poster: number; product_page: number; text_only: number }>;
    usdToTokens?: number;
    rates?: Record<string, number>;
  }) =>
    api.put<{
      aiPricing: {
        prices: { landing: number; poster: number; product_page: number; text_only: number };
        usdToTokens: number;
        rates: Record<string, number>;
      };
      updatedAt: string;
    }>('/admin/settings/ai-pricing', data),

  // ── Auth toggles (admin reads, superadmin writes) ──
  getAuthSettings: () =>
    api.get<{
      auth: { emailVerificationEnabled: boolean };
      defaults: { emailVerificationEnabled: boolean };
      updatedAt: string;
    }>('/admin/settings/auth'),
  updateAuthSettings: (data: { emailVerificationEnabled?: boolean }) =>
    api.patch<{
      auth: { emailVerificationEnabled: boolean };
      updatedAt: string;
    }>('/admin/settings/auth', data),

  /** Renvoie le mail de vérification au nom d'un user cible (support manuel). */
  adminResendVerification: (userId: string) =>
    api.post<{ ok: true }>(`/admin/users/${userId}/resend-verification`),

  // ── Audit logs ──
  audit: (params?: { limit?: number; cursor?: string; action?: string; actorId?: string; targetId?: string }) =>
    api.get<{ items: AdminAuditLog[]; nextCursor: string | null }>('/admin/audit', { params }),

  // ── Staff (pour l'assignation des tickets) ──
  staff: () =>
    api.get<{ staff: Array<{ _id: string; email: string; name: string; role: StaffRole }> }>('/admin/staff'),

  // ── Bulk users ──
  bulkUsers: (data: { userIds: string[]; action: 'suspend' | 'unsuspend' | 'verify_email'; reason?: string }) =>
    api.post<{ ok: boolean; updated: number; skipped: Array<{ email: string; reason: string }> }>('/admin/users/bulk', data),

  // ── Commission override ──
  setStoreCommission: (storeId: string, data: { rate?: number | null; cap?: number | null }) =>
    api.patch<{ store: { _id: string; name: string; slug: string; commission?: { rate?: number; cap?: number } } }>(
      `/admin/stores/${storeId}/commission`,
      data,
    ),

  // ── Limites de messages du chatbot (par boutique / canal) ──
  getStoreBotLimits: (storeId: string) =>
    api.get<{ bots: Array<{ channel: string; messages_limit: number | null; messages_limit_max: number | null }> }>(
      `/admin/stores/${storeId}/bot-limits`,
    ),
  setStoreBotLimits: (storeId: string, data: { messages_limit_max: number; messages_limit?: number; channel?: 'messenger' | 'whatsapp' }) =>
    api.patch<{ ok: boolean; bots: Array<{ channel: string; messages_limit: number | null; messages_limit_max: number | null }> }>(
      `/admin/stores/${storeId}/bot-limits`,
      data,
    ),

  // ── Reports ──
  reports: (params?: { months?: number }) =>
    api.get<{ months: AdminReportRow[] }>('/admin/reports', { params }),

  // ── Health ──
  health: () => api.get<AdminHealth>('/admin/health'),

  // ── Delivery config diag ──
  getStoreDeliveryConfig: (storeId: string) =>
    api.get<AdminDeliveryDiag>(`/admin/stores/${storeId}/delivery-config`),
  /** Met à jour la config delivery d'une store (secret, baseUrl, enabled). */
  patchStoreDeliveryConfig: (
    storeId: string,
    data: { webhookSecret?: string | null; baseUrl?: string | null; enabled?: boolean },
  ) =>
    api.patch<{
      ok: boolean;
      store: {
        _id: string;
        name: string;
        slug: string;
        delivery: null | {
          provider?: string;
          enabled?: boolean;
          baseUrl?: string;
          webhookSecret?: string;
        };
      };
    }>(`/admin/stores/${storeId}/delivery-config`, data),

  // ── Delivery dashboard (cross-store) ──
  /** Toutes les boutiques avec config delivery + verdict + stats dispatch 7j. */
  getDeliveryOverview: () =>
    api.get<{ stores: AdminDeliveryOverviewRow[]; generatedAt: string }>('/admin/delivery/overview'),
  /** Journal des échanges webhook (sortants + entrants), paginé par cursor. */
  getWebhookLogs: (params?: {
    storeId?: string;
    direction?: 'inbound' | 'outbound';
    status?: 'success' | 'error';
    limit?: number;
    cursor?: string;
  }) => api.get<{ items: AdminWebhookLog[]; nextCursor: string | null }>('/admin/delivery/logs', { params }),
  /** Empreintes SHA-256 des secrets d'une boutique (comparaison avec MD). */
  getStoreDeliveryFingerprint: (storeId: string) =>
    api.get<AdminDeliveryFingerprint>(`/admin/stores/${storeId}/delivery/fingerprint`),
  /** Relance un dispatch échoué pour une commande. */
  redispatchOrder: (storeId: string, orderId: string) =>
    api.post<{ ok: boolean; alreadyDispatched?: boolean; error?: string }>(
      `/admin/stores/${storeId}/orders/${orderId}/redispatch`,
      {},
    ),

  // ── Limites de boutiques (comptes autorisés à dépasser le défaut) ──
  getStoreLimits: () =>
    api.get<{ defaultLimit: number; users: AdminStoreLimitUser[] }>('/admin/store-limits'),
  /** Pose (ou réinitialise via null) la limite de boutiques d'un compte. */
  setUserStoreLimit: (userId: string, storeLimit: number | null) =>
    api.patch<{ ok: boolean; user: AdminStoreLimitUser }>(
      `/admin/users/${userId}/store-limit`,
      { storeLimit },
    ),

  // ── Exports (CSV download) ──
  /** Téléchargement CSV avec auth — déclenche la sauvegarde du fichier dans le navigateur. */
  downloadExport: async (type: 'users' | 'orders' | 'wallets' | 'complaints' | 'stores'): Promise<void> => {
    const res = await api.get<Blob>(`/admin/exports/${type}`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

// ── Admin extras types ──
export interface AdminAuditLog {
  _id: string;
  action: string;
  actorEmail: string;
  actorRole: string;
  actorId: string;
  targetId?: string;
  targetType?: 'user' | 'store' | 'wallet' | 'complaint' | 'settings';
  summary: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

export interface AdminReportRow {
  month: string;
  signups: number;
  newStores: number;
  orders: number;
  gmvByCurrency: Record<string, number>;
  commissionByCurrency: Record<string, number>;
}

export interface AdminDeliveryDiag {
  store: { _id: string; name: string; slug: string; country?: string };
  markets: Array<{
    country: string;
    currency: string;
    isDefault?: boolean;
    enabled?: boolean;
    delivery: null | {
      provider?: string;
      enabled?: boolean;
      storeIdMD?: string;
      boutiqueIdMD?: string;
      baseUrl?: string;
      webhookSecret?: string;
    };
  }>;
  integrations: {
    delivery: null | {
      provider?: string;
      enabled?: boolean;
      autoDispatch?: boolean;
      baseUrl?: string;
      webhookSecret?: string;
    };
  };
  env: {
    FLEXIOPAGE_WEBHOOK_SECRET?: string;
    BOUTSHOP_WEBHOOK_SECRET?: string;
    MOGADELIVERY_WEBHOOK_URL?: string;
  };
}

export interface AdminDeliveryOverviewRow {
  storeId: string;
  name: string;
  slug: string;
  country?: string;
  kind: 'ok' | 'warn' | 'ko' | 'off';
  reason: string;
  source: 'market' | 'legacy' | 'none';
  connected: boolean;
  marketsCount: number;
  legacyEnabled: boolean;
  legacyHasSecret: boolean;
  dispatch7d: null | {
    total: number;
    errors: number;
    lastAt: string;
    lastStatus: 'success' | 'error';
    lastHttp?: number;
    lastError?: string;
  };
}

export interface AdminWebhookLog {
  _id: string;
  storeId?: string;
  storeName?: string;
  orderNumber?: string;
  direction: 'inbound' | 'outbound';
  event?: string;
  status: 'success' | 'error';
  httpStatus?: number;
  storeIdSent?: string;
  secretSource?: string;
  signatureValid?: boolean;
  error?: string;
  requestBody?: string;
  responseBody?: string;
  createdAt: string;
}

export interface AdminDeliveryFingerprint {
  store: { _id: string; name: string };
  algo: string;
  sources: Array<{
    source: string;
    country?: string;
    isHex64: boolean;
    len: number;
    preview: string;
    fingerprint: string;
  }>;
}

export interface AdminStoreLimitUser {
  _id: string;
  email: string;
  name: string;
  role: 'owner' | 'superadmin' | 'admin' | 'supervisor' | 'user';
  storeLimit: number | null;
  currentStores: number;
}

export interface AdminHealth {
  timestamp: string;
  db: { ok: boolean; latencyMs: number; readyState: number };
  integrations: Record<string, boolean>;
  runtime: {
    uptimeSeconds: number;
    nodeVersion: string;
    platform: string;
    memoryMB: { rss: number; heapUsed: number; heapTotal: number };
    loadAvg: number[];
    cpus: number;
  };
  alerts: { failedPayments24h: number; urgentComplaints: number; openTickets: number };
  counters: { users: number; stores: number; orders: number; newOrders24h: number; products: number };
}

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
  getAnalyticsRich: (
    storeId: string,
    range: import('@/types/analytics').RangeKey = '30d',
    customRange?: { from: string; to: string },
  ) =>
    api.get<import('@/types/analytics').StoreAnalyticsRich>(`/stores/${storeId}/analytics/rich`, {
      params: range === 'custom' && customRange
        ? { range, from: customRange.from, to: customRange.to }
        : { range },
    }),
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
  /**
   * Onboarde la boutique chez MogaDelivery (crée la Boutique côté MD,
   * génère un secret, le pousse à MD, le sauvegarde en DB).
   * Renvoie `mode: 'auto'` quand MOGADELIVERY_API_KEY est posée en env,
   * `mode: 'manual'` sinon (avec le secret à transmettre par mail).
   */
  connectMogaDelivery: (
    storeId: string,
    data?: {
      country?: string;
      marketCountry?: string;
      /** JWT seller MD — auth scoped au seller, recommandé par MD (2026-06-23). */
      sellerToken?: string;
      /** Si la Boutique existe déjà côté MD, on skip /boutiques. */
      existingBoutiqueId?: string;
    },
  ) =>
    api.post<{
      mode: 'auto' | 'manual';
      // mode=auto — modèle secret plateforme : pas de secret par boutique renvoyé.
      boutiqueIdMD?: string;
      storeIdMD?: string;
      country?: string;
      // mode=manual
      message?: string;
      hint?: { storeId: string; storeName: string; country: string };
    }>(`/stores/${storeId}/delivery/connect-mogadelivery`, data || {}),
  /**
   * Déconnexion douce / reconnexion MogaDelivery — bascule le master switch
   * sans toucher au secret ni au boutiqueId (reconnexion instantanée, zéro 401).
   */
  setDeliveryConnection: (storeId: string, enabled: boolean) =>
    api.post<{ ok: boolean; connected: boolean }>(`/stores/${storeId}/delivery/connection`, { enabled }),
  // Products
  listProducts: (storeId: string, params?: { published?: string; limit?: number; skip?: number; search?: string }) =>
    api.get<{ products: unknown[]; total: number; limit: number; skip: number }>(`/stores/${storeId}/products`, { params }),
  createProduct: (storeId: string, data: Record<string, unknown>) =>
    api.post<{ product: unknown }>(`/stores/${storeId}/products`, data),
  /** Extrait les infos d'un lien AliExpress/Alibaba/Amazon (sans créer). */
  importProductPreview: (storeId: string, url: string) =>
    api.post<{
      preview: {
        source: 'aliexpress' | 'alibaba' | 'amazon';
        sourceUrl: string;
        title: string;
        description?: string;
        price?: number;
        currency?: string;
        images: string[];
      };
    }>(`/stores/${storeId}/products/import-preview`, { url }),
  /** Crée le produit à partir de l'aperçu édité (images externes rapatriées). */
  importCreateProduct: (storeId: string, data: Record<string, unknown>) =>
    api.post<{ product: unknown }>(`/stores/${storeId}/products/import`, data),
  /** Generate a punchy product description via AI (charged from text_only wallet). */
  generateProductDescription: (storeId: string, data: {
    name: string;
    category?: string;
    keywords?: string;
    language?: string;
    country?: string;
    tone?: 'engaging' | 'professional' | 'luxury' | 'youthful' | 'minimal';
    price?: number;
    currency?: string;
  }) =>
    api.post<{
      description: string;
      charge: { amount: number; balanceAfter: number; currency: string };
    }>(`/stores/${storeId}/products/generate-description`, data),
  getProduct: (storeId: string, productId: string) =>
    api.get<{ product: unknown }>(`/stores/${storeId}/products/${productId}`),
  updateProduct: (storeId: string, productId: string, data: Record<string, unknown>) =>
    api.patch<{ product: unknown }>(`/stores/${storeId}/products/${productId}`, data),
  deleteProduct: (storeId: string, productId: string) =>
    api.delete(`/stores/${storeId}/products/${productId}`),
  // Pages
  /**
   * List a store's pages. `kind=landing` hides the auto-seeded info pages
   * (Conditions, FAQ, Contact…) which are edited via the footer instead.
   */
  listPages: (storeId: string, params?: { kind?: 'landing' | 'info' }) =>
    api.get<{ pages: unknown[] }>(`/stores/${storeId}/pages`, { params }),
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
  /** Shopify-style live visitor count — distinct anonymous sessions in the last N minutes (default 5). */
  getLiveVisitors: (storeId: string, windowMin?: number) =>
    api.get<{ count: number; windowMin: number }>(`/stores/${storeId}/visitors/live`, {
      params: windowMin ? { window: windowMin } : undefined,
    }),
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
  listOrders: (
    storeId: string,
    params?: {
      limit?: number; skip?: number;
      search?: string;
      status?: 'all' | 'pending' | 'paid' | 'delivered' | 'cancelled';
      confirmation?: string;
      from?: string;
      to?: string;
    },
  ) =>
    api.get<{ orders: unknown[]; total: number; limit: number; skip: number }>(`/stores/${storeId}/orders`, { params }),
  createOrder: (storeId: string, data: Record<string, unknown>) =>
    api.post<{ order: unknown }>(`/stores/${storeId}/orders`, data),
  getOrder: (storeId: string, orderId: string) =>
    api.get<{ order: unknown }>(`/stores/${storeId}/orders/${orderId}`),
  updateOrderPayment: (storeId: string, orderId: string, data: { paymentStatus: string; stripePaymentIntentId?: string }) =>
    api.patch<{ order: unknown }>(`/stores/${storeId}/orders/${orderId}/payment`, data),
  updateOrderFulfillment: (storeId: string, orderId: string, data: { fulfillmentStatus: string; trackingNumber?: string; trackingUrl?: string }) =>
    api.patch<{ order: unknown }>(`/stores/${storeId}/orders/${orderId}/fulfillment`, data),
  /**
   * Dispatch manuel (ou retry) d'une commande vers le transporteur configuré.
   * Utile quand l'auto-dispatch a échoué (SKU manquant, MogaDelivery 4xx, etc.)
   * ou quand le vendeur veut forcer un envoi. `retry: true` efface l'externalId
   * pour que dispatchOrder côté backend ne tombe pas dans l'idempotence.
   */
  dispatchOrder: (storeId: string, orderId: string, opts?: { retry?: boolean }) =>
    api.post<{ ok: boolean; alreadyDispatched?: boolean; order: unknown }>(
      `/stores/${storeId}/orders/${orderId}/dispatch`,
      opts || {},
    ),
  /** Seller-facing manual override — guards against orders already moving at the courier. */
  manualOrderStatus: (storeId: string, orderId: string, data: {
    paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded' | 'manual';
    fulfillmentStatus?: 'unfulfilled' | 'partial' | 'fulfilled' | 'cancelled';
    reason?: string;
    force?: boolean;
  }) =>
    api.patch<{ order: unknown; restockedItems: number }>(`/stores/${storeId}/orders/${orderId}/manual-status`, data),
  /** COD call-confirmation status (confirmed / no_answer / callback / declined). */
  setOrderConfirmation: (storeId: string, orderId: string, data: {
    confirmationStatus: 'pending' | 'confirmed' | 'no_answer' | 'callback' | 'declined';
    note?: string;
    /** ISO datetime — only honoured when confirmationStatus === 'callback'. */
    callbackAt?: string;
  }) =>
    api.patch<{ order: unknown; restockedItems: number }>(`/stores/${storeId}/orders/${orderId}/confirmation`, data),
  // Customers
  listCustomers: (storeId: string, params?: { limit?: number; skip?: number; search?: string }) =>
    api.get<{ customers: unknown[]; total: number; limit: number; skip: number }>(`/stores/${storeId}/customers`, { params }),
  // Suppliers
  listSuppliers: (storeId: string, params?: { limit?: number; skip?: number; search?: string; includeArchived?: boolean }) =>
    api.get<{ suppliers: import('@/types/supplier').Supplier[]; total: number; limit: number; skip: number }>(`/stores/${storeId}/suppliers`, { params }),
  getSupplier: (storeId: string, supplierId: string) =>
    api.get<{ supplier: import('@/types/supplier').Supplier }>(`/stores/${storeId}/suppliers/${supplierId}`),
  createSupplier: (storeId: string, data: Partial<import('@/types/supplier').Supplier>) =>
    api.post<{ supplier: import('@/types/supplier').Supplier }>(`/stores/${storeId}/suppliers`, data),
  updateSupplier: (storeId: string, supplierId: string, data: Partial<import('@/types/supplier').Supplier>) =>
    api.patch<{ supplier: import('@/types/supplier').Supplier }>(`/stores/${storeId}/suppliers/${supplierId}`, data),
  archiveSupplier: (storeId: string, supplierId: string) =>
    api.post<{ supplier: import('@/types/supplier').Supplier }>(`/stores/${storeId}/suppliers/${supplierId}/archive`, {}),
  restoreSupplier: (storeId: string, supplierId: string) =>
    api.post<{ supplier: import('@/types/supplier').Supplier }>(`/stores/${storeId}/suppliers/${supplierId}/restore`, {}),
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
  // Collections
  listCollections: (storeId: string) =>
    api.get<{ collections: import('@/types/collection').Collection[] }>(`/stores/${storeId}/collections`),
  createCollection: (storeId: string, data: Partial<import('@/types/collection').Collection>) =>
    api.post<{ collection: import('@/types/collection').Collection }>(`/stores/${storeId}/collections`, data),
  getCollection: (storeId: string, collectionId: string) =>
    api.get<{ collection: import('@/types/collection').Collection; products: import('@/types/collection').ProductLite[] }>(
      `/stores/${storeId}/collections/${collectionId}`
    ),
  updateCollection: (storeId: string, collectionId: string, data: Partial<import('@/types/collection').Collection>) =>
    api.patch<{ collection: import('@/types/collection').Collection }>(
      `/stores/${storeId}/collections/${collectionId}`,
      data
    ),
  deleteCollection: (storeId: string, collectionId: string) =>
    api.delete(`/stores/${storeId}/collections/${collectionId}`),
  // Appartenance produit → collections (manuelles uniquement)
  getProductCollections: (storeId: string, productId: string) =>
    api.get<{ collectionIds: string[] }>(`/stores/${storeId}/products/${productId}/collections`),
  setProductCollections: (storeId: string, productId: string, collectionIds: string[]) =>
    api.post<{ collections: import('@/types/collection').Collection[] }>(
      `/stores/${storeId}/products/${productId}/collections`,
      { collectionIds }
    ),
  // Reviews
  listReviews: (storeId: string, params?: { productId?: string }) =>
    api.get<{ reviews: Array<{ _id: string; productId: string; name: string; rating: number; content: string; title?: string; verified: boolean; isPublished: boolean; createdAt: string }> }>(`/stores/${storeId}/reviews`, { params }),
  updateReview: (storeId: string, reviewId: string, data: { isPublished: boolean }) =>
    api.patch(`/stores/${storeId}/reviews/${reviewId}`, data),
  deleteReview: (storeId: string, reviewId: string) =>
    api.delete(`/stores/${storeId}/reviews/${reviewId}`),

  // Abandoned carts
  listAbandonedCarts: (storeId: string, params?: { includeRecovered?: boolean }) =>
    api.get<{
      carts: Array<{
        _id: string;
        productSlug?: string;
        productName?: string;
        productPrice?: number;
        name?: string;
        phone?: string;
        email?: string;
        city?: string;
        country?: string;
        recovered: boolean;
        createdAt: string;
        updatedAt: string;
      }>;
    }>(`/stores/${storeId}/abandoned-carts`, { params }),
  deleteAbandonedCart: (storeId: string, cartId: string) =>
    api.delete(`/stores/${storeId}/abandoned-carts/${cartId}`),

  // Subscribers (newsletter)
  listSubscribers: (storeId: string, params?: { search?: string; includeUnsubscribed?: boolean }) =>
    api.get<{
      subscribers: import('@/types/newsletter').Subscriber[];
      counts: import('@/types/newsletter').SubscriberCounts;
    }>(`/stores/${storeId}/subscribers`, { params }),
  deleteSubscriber: (storeId: string, subscriberId: string) =>
    api.delete(`/stores/${storeId}/subscribers/${subscriberId}`),
  /** Returns the full CSV URL — call it with `window.location.href = …` to download. */
  subscribersCsvUrl: (storeId: string) =>
    `${API_URL}/api/stores/${storeId}/subscribers/export.csv`,

  // Coupons
  listCoupons: (storeId: string) =>
    api.get<{ coupons: import('@/types/coupon').Coupon[] }>(`/stores/${storeId}/coupons`),
  createCoupon: (storeId: string, data: Partial<import('@/types/coupon').Coupon>) =>
    api.post<{ coupon: import('@/types/coupon').Coupon }>(`/stores/${storeId}/coupons`, data),
  getCoupon: (storeId: string, couponId: string) =>
    api.get<{ coupon: import('@/types/coupon').Coupon }>(`/stores/${storeId}/coupons/${couponId}`),
  updateCoupon: (storeId: string, couponId: string, data: Partial<import('@/types/coupon').Coupon>) =>
    api.patch<{ coupon: import('@/types/coupon').Coupon }>(`/stores/${storeId}/coupons/${couponId}`, data),
  deleteCoupon: (storeId: string, couponId: string) =>
    api.delete(`/stores/${storeId}/coupons/${couponId}`),
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
  validateCoupon: (storeSlug: string, body: { code: string; subtotal: number; productIds?: string[] }) =>
    api.post<import('@/types/coupon').CouponValidationResponse>(
      `/public/stores/${storeSlug}/coupons/validate`,
      body
    ),
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

// ─── Messenger Bot ─────────────────────────────────────────────────────
export interface MessengerBotConfig {
  _id: string;
  vendor_id: string;
  channel?: 'messenger' | 'whatsapp';
  /** WhatsApp uniquement : 'meta' (Cloud API) ou 'wasender' (WhatsApp Web/QR). */
  whatsapp_provider?: 'meta' | 'wasender';
  facebook_page_id: string;
  page_name?: string;
  page_picture_url?: string;
  /** WhatsApp : numéro affiché de la ligne reliée (info). */
  whatsapp_display_number?: string;
  /** Wasender uniquement : id de la session côté WasenderAPI. */
  wasender_session_id?: string;
  status: 'active' | 'paused' | 'disconnected';
  language: 'ar' | 'fr' | 'en' | 'darija_ma' | 'darija_dz' | 'darija_tn';
  /** Code pays ISO-2 (tous marchés, cf. src/data/countries.ts). */
  country: string;
  welcome_message?: string;
  away_message?: string;
  order_confirmation_message?: string;
  shipping_fees: Array<{ city: string; fee: number }>;
  default_shipping_fee: number;
  catalog_source: 'auto' | 'manual' | 'hybrid';
  ai_personality: 'friendly' | 'professional' | 'energetic';
  auto_create_order: boolean;
  ask_confirmation_before_order: boolean;
  notify_on_new_order: boolean;
  notification_email?: string;
  notification_whatsapp?: string;
  plan: 'free' | 'starter' | 'pro' | 'business';
  conversations_limit: number;
  conversations_used_this_month: number;
  total_orders_created: number;
  total_tokens_consumed: number;
}
export interface FbPageOption { id: string; name: string; access_token: string; picture_url?: string }
export interface MessengerConversation {
  _id: string; customer_psid: string; customer_name?: string; customer_phone?: string;
  customer_city?: string; status: string; intent: string; order_id?: string;
  message_count: number; last_message_at?: string; created_at: string;
}
export interface MessengerMessage {
  _id: string; sender: 'customer' | 'bot' | 'human'; content: string; timestamp: string;
  tokens_input?: number; tokens_output?: number; cost_usd?: number;
}

const mb = (storeId: string, path = '') => `/messenger-bot${path}?storeId=${encodeURIComponent(storeId)}`;

export const messengerBotApi = {
  getConfig: (storeId: string) =>
    api.get<{ connected: boolean; config: MessengerBotConfig | null }>(mb(storeId, '/config')),
  updateConfig: (storeId: string, data: Partial<MessengerBotConfig>) =>
    api.put<{ config: MessengerBotConfig }>(mb(storeId, '/config'), data),
  testBot: (storeId: string, message: string) =>
    api.post<{ reply: string; toolsUsed: string[]; tokens: { input: number; output: number }; costUsd: number; model: string }>(
      mb(storeId, '/config/test'), { message }),
  // OAuth
  getAuthUrl: (storeId: string) => api.get<{ url: string; redirectUri: string }>(mb(storeId, '/facebook/auth-url')),
  oauthCallback: (storeId: string, code: string) =>
    api.post<{ pages: FbPageOption[] }>(mb(storeId, '/facebook/callback'), { code }),
  connectPage: (storeId: string, page: { pageId: string; pageAccessToken: string; pageName?: string; pagePictureUrl?: string }) =>
    api.post<{ connected: boolean; pageId: string; pageName?: string }>(mb(storeId, '/facebook/connect'), { storeId, ...page }),
  disconnect: (storeId: string) => api.post<{ disconnected: boolean }>(mb(storeId, '/facebook/disconnect'), { storeId }),
  // Conversations
  listConversations: (storeId: string, params?: { status?: string; limit?: number; skip?: number }) =>
    api.get<{ conversations: MessengerConversation[]; total: number }>(mb(storeId, '/conversations'), { params }),
  getConversation: (storeId: string, id: string) =>
    api.get<{ conversation: MessengerConversation; messages: MessengerMessage[] }>(mb(storeId, `/conversations/${id}`)),
  takeover: (storeId: string, id: string) =>
    api.post<{ conversation: MessengerConversation }>(mb(storeId, `/conversations/${id}/takeover`), { storeId }),
  release: (storeId: string, id: string) =>
    api.post<{ conversation: MessengerConversation }>(mb(storeId, `/conversations/${id}/release`), { storeId }),
  sendManual: (storeId: string, id: string, message: string) =>
    api.post<{ message: MessengerMessage }>(mb(storeId, `/conversations/${id}/send`), { storeId, message }),
  // Stats
  statsOverview: (storeId: string) =>
    api.get<{
      totalConversations: number; byStatus: Record<string, number>; ordersCreated: number;
      conversionRate: number; plan: string | null; conversationsLimit: number | null;
      conversationsUsedThisMonth: number | null; totalOrdersCreated: number; totalTokensConsumed: number;
    }>(mb(storeId, '/stats/overview')),
};

// ─── WhatsApp Bot (réutilise les mêmes endpoints avec channel=whatsapp) ──
const wb = (storeId: string, path = '') =>
  `/messenger-bot${path}?storeId=${encodeURIComponent(storeId)}&channel=whatsapp`;

export const whatsappBotApi = {
  getConfig: (storeId: string) =>
    api.get<{ connected: boolean; config: MessengerBotConfig | null }>(wb(storeId, '/config')),
  updateConfig: (storeId: string, data: Partial<MessengerBotConfig>) =>
    api.put<{ config: MessengerBotConfig }>(wb(storeId, '/config'), data),
  testBot: (storeId: string, message: string) =>
    api.post<{ reply: string; toolsUsed: string[]; tokens: { input: number; output: number }; costUsd: number; model: string }>(
      wb(storeId, '/config/test'), { message }),
  connect: (storeId: string, data: { phoneNumberId: string; accessToken: string; wabaId?: string; displayNumber?: string }) =>
    api.post<{ connected: boolean; phoneNumberId: string; displayNumber?: string }>(
      `/messenger-bot/whatsapp/connect?storeId=${encodeURIComponent(storeId)}`, { storeId, ...data }),
  disconnect: (storeId: string) =>
    api.post<{ disconnected: boolean }>(`/messenger-bot/whatsapp/disconnect?storeId=${encodeURIComponent(storeId)}`, { storeId }),
  // WasenderAPI (provider alternatif — WhatsApp Web via QR).
  wasenderConnect: (storeId: string, data: { personalAccessToken: string; phoneNumber: string; sessionName?: string; accountProtection?: boolean }) =>
    api.post<{ connected: boolean; sessionId: string; status: 'need_scan' | 'connected' | 'disconnected' | 'unknown'; provider: 'wasender' }>(
      `/messenger-bot/wasender/connect?storeId=${encodeURIComponent(storeId)}`, { storeId, ...data }),
  wasenderQr: (storeId: string) =>
    api.get<{ qr: string | null; status: 'need_scan' | 'connected' | 'disconnected' | 'unknown' }>(
      `/messenger-bot/wasender/qr?storeId=${encodeURIComponent(storeId)}`),
  wasenderStatus: (storeId: string) =>
    api.get<{ status: 'need_scan' | 'connected' | 'disconnected' | 'unknown'; phoneNumber?: string }>(
      `/messenger-bot/wasender/status?storeId=${encodeURIComponent(storeId)}`),
  wasenderDisconnect: (storeId: string) =>
    api.post<{ disconnected: boolean }>(
      `/messenger-bot/wasender/disconnect?storeId=${encodeURIComponent(storeId)}`, { storeId }),
  wasenderRecentWebhooks: (storeId: string) =>
    api.get<{
      items: Array<{
        at: string;
        event: string;
        sessionId?: string;
        signatureMatched: boolean;
        processed: 'enqueued' | 'ignored' | 'unsupported' | 'error' | 'session_status';
        reason?: string;
        payload: unknown;
      }>;
      total: number;
      sessionId?: string;
    }>(`/messenger-bot/wasender/recent-webhooks?storeId=${encodeURIComponent(storeId)}`),
  wasenderRecentWorkerRuns: (storeId: string) =>
    api.get<{
      items: Array<{
        at: string;
        conversationId: string;
        vendorId: string;
        customerText: string;
        status: 'success' | 'error' | 'empty_reply';
        step: 'load_context' | 'claude_call' | 'tool_execution' | 'persist' | 'send' | 'complete';
        errorMessage?: string;
        modelUsed?: string;
        toolsUsed?: string[];
        replyPreview?: string;
        tokensInput?: number;
        tokensOutput?: number;
        costUsd?: number;
      }>;
      total: number;
    }>(`/messenger-bot/wasender/recent-worker-runs?storeId=${encodeURIComponent(storeId)}`),
  listConversations: (storeId: string, params?: { status?: string; limit?: number; skip?: number }) =>
    api.get<{ conversations: MessengerConversation[]; total: number }>(wb(storeId, '/conversations'), { params }),
  getConversation: (storeId: string, id: string) =>
    api.get<{ conversation: MessengerConversation; messages: MessengerMessage[] }>(wb(storeId, `/conversations/${id}`)),
  takeover: (storeId: string, id: string) =>
    api.post<{ conversation: MessengerConversation }>(wb(storeId, `/conversations/${id}/takeover`), { storeId }),
  release: (storeId: string, id: string) =>
    api.post<{ conversation: MessengerConversation }>(wb(storeId, `/conversations/${id}/release`), { storeId }),
  sendManual: (storeId: string, id: string, message: string) =>
    api.post<{ message: MessengerMessage }>(wb(storeId, `/conversations/${id}/send`), { storeId, message }),
  statsOverview: (storeId: string) =>
    api.get<{
      totalConversations: number; byStatus: Record<string, number>; ordersCreated: number;
      conversionRate: number; conversationsUsedThisMonth: number | null; conversationsLimit: number | null;
    }>(wb(storeId, '/stats/overview')),
};

// Push mobile (Expo) — enregistrement du token de l'appareil + son de notif.
export const pushApi = {
  register: (token: string, sound?: string) =>
    api.post<{ ok: boolean }>('/push/register', { token, sound }),
  unregister: (token: string) =>
    api.post<{ ok: boolean }>('/push/unregister', { token }),
  getSounds: () =>
    api.get<{ sounds: Array<{ key: string; label: string }>; default: string; selected: string }>('/push/sounds'),
  setSound: (sound: string) =>
    api.patch<{ ok: boolean; sound: string }>('/push/sound', { sound }),
  test: () =>
    api.post<{ ok: boolean; diagnostic: 'ok' | 'no_device' | 'expo_error' | 'unknown'; tokens: number; sent: number; removed: number; errors: string[] }>('/push/test'),
};
