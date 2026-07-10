/**
 * Client API Axios pour le backend FlexioPage.
 *
 * Calque mobile de flexiopage-frontend/src/lib/api.ts : mêmes endpoints,
 * même format de réponse `{ user, token }` / `{ stores }` / `{ orders }`.
 * Différence : le token vient de SecureStore (cf. token.ts), pas de
 * localStorage, et il est injecté en header `Authorization: Bearer`.
 */
import axios, { type AxiosInstance } from 'axios';
import { API_URL } from './config';
import { getToken } from './token';
import type {
  Order,
  Store,
  User,
  PaymentStatus,
  FulfillmentStatus,
  ConfirmationStatus,
  Product,
  AnalyticsSummary,
  Wallet,
} from '../types';

export const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 20000,
});

// Injecte le JWT (lecture synchrone depuis le cache mémoire de token.ts).
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * Extrait un message d'erreur lisible de n'importe quel rejet axios :
 * corps backend `{ error }`, erreur réseau, ou Error simple.
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
    if (ax.code === 'ERR_NETWORK')
      return 'Connexion impossible au serveur. Vérifie ta connexion (et l’IP du backend).';
    if (ax.code === 'ECONNABORTED')
      return 'Le serveur a mis trop de temps à répondre. Réessaie.';
    if (ax.message) return ax.message;
  }
  return fallback;
}

// --- Auth ---
export const authApi = {
  login: (data: { email: string; password: string }) =>
    api.post<{ user: User; token: string }>('/auth/login', data),
  me: () => api.get<{ user: User }>('/auth/me'),
};

// --- Users ---
export const usersApi = {
  getStores: () => api.get<{ stores: Store[] }>('/users/stores'),
};

// --- Stores: orders ---
export type OrderStatusFilter = 'all' | 'pending' | 'paid' | 'delivered' | 'cancelled';

export const ordersApi = {
  list: (
    storeId: string,
    params?: { limit?: number; skip?: number; search?: string; status?: OrderStatusFilter },
  ) =>
    api.get<{ orders: Order[]; total: number; limit: number; skip: number }>(
      `/stores/${storeId}/orders`,
      { params },
    ),
  get: (storeId: string, orderId: string) =>
    api.get<{ order: Order }>(`/stores/${storeId}/orders/${orderId}`),
  /** Override manuel vendeur (paiement + fulfillment). */
  setManualStatus: (
    storeId: string,
    orderId: string,
    data: { paymentStatus?: PaymentStatus; fulfillmentStatus?: FulfillmentStatus; reason?: string },
  ) =>
    api.patch<{ order: Order; restockedItems: number }>(
      `/stores/${storeId}/orders/${orderId}/manual-status`,
      data,
    ),
  /** Statut de confirmation d'appel COD. */
  setConfirmation: (
    storeId: string,
    orderId: string,
    data: { confirmationStatus: ConfirmationStatus; note?: string },
  ) =>
    api.patch<{ order: Order; restockedItems: number }>(
      `/stores/${storeId}/orders/${orderId}/confirmation`,
      data,
    ),
};

// --- Analytics (cartes KPI du tableau de bord) ---
export const analyticsApi = {
  get: (storeId: string) => api.get<AnalyticsSummary>(`/stores/${storeId}/analytics`),
};

// --- Produits ---
export const productsApi = {
  list: (storeId: string, params?: { limit?: number; skip?: number; search?: string; published?: string }) =>
    api.get<{ products: Product[]; total: number; limit: number; skip: number }>(
      `/stores/${storeId}/products`,
      { params },
    ),
  get: (storeId: string, productId: string) =>
    api.get<{ product: Product }>(`/stores/${storeId}/products/${productId}`),
  create: (storeId: string, data: Record<string, unknown>) =>
    api.post<{ product: Product }>(`/stores/${storeId}/products`, data),
  update: (storeId: string, productId: string, data: Partial<Product>) =>
    api.patch<{ product: Product }>(`/stores/${storeId}/products/${productId}`, data),
  remove: (storeId: string, productId: string) =>
    api.delete(`/stores/${storeId}/products/${productId}`),
};

// --- Wallet ---
export const walletApi = {
  get: () => api.get<{ wallet: Wallet }>('/wallet'),
};
