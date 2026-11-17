import type { Request, Response } from 'express';
import { resolveGeo } from '../services/tracking.service';

/**
 * Storefront country lock.
 *
 * The seller picks the countries that may open the shop. Everyone else sees
 * a blocked page and cannot check out. The country comes from the edge
 * (Cloudflare / Vercel) when that header was set by the proxy, otherwise
 * from a local geoip lookup of the visitor IP. We never store the IP.
 *
 * A header the browser can forge is ignored on a public connection. It is
 * trusted only when the API is called from our own server (private IP),
 * which is how the storefront middleware forwards the edge country.
 */

export interface GeoAccessStore {
  settings?: {
    country?: string;
    geoAccess?: { enabled?: boolean; countries?: string[] };
  };
  markets?: Array<{ country?: string; enabled?: boolean } | null>;
}

export interface GeoAccessDecision {
  blocked: boolean;
  visitorCountry: string | null;
  allowedCountries: string[];
}

export interface GeoLookupRequest {
  ip?: string;
  headers?: Request['headers'] | Record<string, string | string[] | undefined>;
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export function normalizeCountry(code: string | undefined | null): string {
  return (code || '').trim().toUpperCase();
}

export function isIsoCountry(code: string): boolean {
  return /^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1';
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, '').trim().toLowerCase();
  if (!clean) return true;
  if (clean === '::1' || clean === '0.0.0.0' || clean === 'localhost') return true;
  if (clean.startsWith('127.') || clean.startsWith('10.') || clean.startsWith('192.168.')) return true;
  if (clean.startsWith('169.254.') || clean.startsWith('fe80:') || clean.startsWith('fc') || clean.startsWith('fd')) {
    return true;
  }
  const match = /^172\.(\d+)\./.exec(clean);
  if (match) {
    const octet = Number(match[1]);
    if (octet >= 16 && octet <= 31) return true;
  }
  return false;
}

function unique(codes: string[]): string[] {
  return [...new Set(codes)];
}

/** Countries the seller chose, or the shop's target country and markets. */
export function targetCountries(store: GeoAccessStore): string[] {
  const explicit = (store.settings?.geoAccess?.countries || [])
    .map((code) => normalizeCountry(code))
    .filter(isIsoCountry);
  if (explicit.length > 0) return unique(explicit);

  const primary = normalizeCountry(store.settings?.country);
  const fromMarkets = (store.markets || [])
    .filter((market) => market && market.enabled !== false)
    .map((market) => normalizeCountry(market?.country))
    .filter(isIsoCountry);
  return unique([...(isIsoCountry(primary) ? [primary] : []), ...fromMarkets]);
}

export function visitorCountryFromRequest(req: GeoLookupRequest): string | null {
  const headers = req.headers || {};
  const ip = (req.ip || '').replace(/^::ffff:/, '').trim();
  const internal = isPrivateOrLocalIp(ip);

  const viaCloudflare = Boolean(
    headerValue(headers['cf-ray'] as string | string[] | undefined)
    || headerValue(headers['cf-connecting-ip'] as string | string[] | undefined),
  );
  if (!internal && viaCloudflare) {
    const cf = normalizeCountry(headerValue(headers['cf-ipcountry'] as string | string[] | undefined));
    if (isIsoCountry(cf)) return cf;
  }

  if (!internal) {
    return resolveGeo(ip)?.country || null;
  }

  const forwardedCountry = normalizeCountry(
    headerValue(headers['x-vercel-ip-country'] as string | string[] | undefined)
    || headerValue(headers['cf-ipcountry'] as string | string[] | undefined),
  );
  if (isIsoCountry(forwardedCountry)) return forwardedCountry;

  const forwardedIp = headerValue(headers['x-flexio-visitor-ip'] as string | string[] | undefined)
    .split(',')[0]
    .trim()
    .replace(/^::ffff:/, '');
  if (forwardedIp && !isPrivateOrLocalIp(forwardedIp)) {
    return resolveGeo(forwardedIp)?.country || null;
  }
  return null;
}

export function evaluateStoreGeoAccess(req: GeoLookupRequest, store: GeoAccessStore): GeoAccessDecision {
  const allowedCountries = targetCountries(store);
  const visitorCountry = visitorCountryFromRequest(req);
  const enabled = store.settings?.geoAccess?.enabled === true && allowedCountries.length > 0;
  if (!enabled || !visitorCountry) {
    return { blocked: false, visitorCountry, allowedCountries };
  }
  return {
    blocked: !allowedCountries.includes(visitorCountry),
    visitorCountry,
    allowedCountries,
  };
}

/** Sends 403 and returns true when this visitor must not use the shop. */
export function rejectIfGeoBlocked(req: Request, res: Response, store: GeoAccessStore): boolean {
  const decision = evaluateStoreGeoAccess(req, store);
  if (!decision.blocked) return false;
  res.status(403).json({
    geoBlocked: true,
    error: 'Cette boutique n’est pas disponible dans ton pays.',
    visitorCountry: decision.visitorCountry,
    allowedCountries: decision.allowedCountries,
  });
  return true;
}
