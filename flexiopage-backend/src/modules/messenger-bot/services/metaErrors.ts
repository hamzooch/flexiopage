/**
 * Erreur Graph API typée — distingue les erreurs d'authentification (token
 * expiré/invalide) des autres échecs, pour que le worker puisse désactiver le
 * bot et notifier le vendeur plutôt que de réessayer en silence.
 */
import type { AxiosError } from 'axios';

export class MetaApiError extends Error {
  readonly isAuthError: boolean;
  readonly metaCode?: number;
  readonly status?: number;
  constructor(message: string, opts: { isAuthError: boolean; metaCode?: number; status?: number }) {
    super(message);
    this.name = 'MetaApiError';
    this.isAuthError = opts.isAuthError;
    this.metaCode = opts.metaCode;
    this.status = opts.status;
  }
}

/**
 * Transforme une erreur axios Graph API en MetaApiError. Auth détectée si
 * HTTP 401, code Meta 190 (token expiré/invalide) ou type OAuthException.
 */
export function metaErrorFromAxios(err: unknown, fallbackMsg: string): MetaApiError {
  const ax = err as AxiosError<{ error?: { message?: string; code?: number; type?: string } }>;
  const status = ax.response?.status;
  const metaErr = ax.response?.data?.error;
  const code = metaErr?.code;
  const isAuthError = status === 401 || code === 190 || metaErr?.type === 'OAuthException';
  return new MetaApiError(metaErr?.message || ax.message || fallbackMsg, { isAuthError, metaCode: code, status });
}
