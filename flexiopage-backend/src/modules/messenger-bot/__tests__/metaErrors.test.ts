import { describe, it, expect } from 'vitest';
import { MetaApiError, metaErrorFromAxios } from '../services/metaErrors';

/** Fabrique une erreur ressemblant à une AxiosError Graph. */
function axiosLike(opts: { status?: number; code?: number; type?: string; message?: string }) {
  return {
    message: opts.message ?? 'Request failed',
    response: opts.status
      ? { status: opts.status, data: { error: { message: 'meta msg', code: opts.code, type: opts.type } } }
      : undefined,
  };
}

describe('metaErrorFromAxios', () => {
  it('marque le code 190 comme erreur d’auth', () => {
    const e = metaErrorFromAxios(axiosLike({ status: 400, code: 190 }), 'fallback');
    expect(e).toBeInstanceOf(MetaApiError);
    expect(e.isAuthError).toBe(true);
    expect(e.metaCode).toBe(190);
  });

  it('marque HTTP 401 comme erreur d’auth', () => {
    expect(metaErrorFromAxios(axiosLike({ status: 401, code: 0 }), 'fallback').isAuthError).toBe(true);
  });

  it('marque OAuthException comme erreur d’auth', () => {
    expect(metaErrorFromAxios(axiosLike({ status: 400, type: 'OAuthException' }), 'fallback').isAuthError).toBe(true);
  });

  it('ne marque PAS une erreur applicative (code 100 / 400) comme auth', () => {
    const e = metaErrorFromAxios(axiosLike({ status: 400, code: 100 }), 'fallback');
    expect(e.isAuthError).toBe(false);
    expect(e.status).toBe(400);
  });

  it('utilise le message de repli quand aucune info Meta', () => {
    const e = metaErrorFromAxios({}, 'repli !');
    expect(e.isAuthError).toBe(false);
    expect(e.message).toBe('repli !');
  });
});
