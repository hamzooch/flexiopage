/**
 * Internal endpoints — called by infrastructure components, not browsers.
 *
 * Currently exposes a single endpoint used by Caddy's on_demand TLS gate:
 * before issuing a Let's Encrypt certificate for a host, Caddy hits
 * GET /internal/cert-ask?domain=foo.com and only proceeds when the
 * response is 2xx. That stops a random visitor from forcing Caddy to
 * request certs for unrelated hostnames (which would burn the LE rate
 * limit and fail).
 *
 * The endpoint is mounted at the root (not /api) so the Caddyfile URL
 * stays short. It must be reachable from the reverse proxy container
 * but is harmless if exposed publicly — the answer is always either
 * "yes this domain is a verified storefront" or 404.
 */
import { Router, Request, Response } from 'express';
import { Store } from '../models/Store.model';
import { record as recordSecurityEvent } from '../services/security-monitor.service';

const router = Router();

/** Best-effort client IP. Caddy proxies the real caller in X-Forwarded-For. */
function callerIp(req: Request): string {
  const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  return xff || req.ip || 'unknown';
}

// Infra subdomains that always resolve — never checked against the Store DB.
// Anything else must be a first-level subdomain matching a real store slug.
const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'admin', 'app', 'dashboard', 'mail', 'blog', 'assets', 'cdn',
  'static', 'help', 'support', 'docs',
]);

router.get('/cert-ask', async (req: Request, res: Response) => {
  const raw = (req.query.domain as string | undefined)?.trim().toLowerCase();
  if (!raw) return res.status(400).json({ error: 'missing domain' });

  // Reject anything that isn't a hostname (no scheme, no path, no port).
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(raw)) {
    recordSecurityEvent({ type: 'cert_flood', sourceIp: callerIp(req), target: raw, sample: { reason: 'invalid_format' } });
    return res.status(400).json({ error: 'invalid domain' });
  }

  const platformApex = (process.env.PLATFORM_APEX || 'flexiopage.com').toLowerCase();

  // Apex itself → always OK.
  if (raw === platformApex) {
    return res.status(200).json({ ok: true, kind: 'platform' });
  }

  // Only accept subdomains of the platform apex — and only ONE level deep.
  // Previously we accepted any endsWith('.flexiopage.com'), which let attackers
  // enumerate arbitrary FQDNs like `phish.brand.attacker.flexiopage.com` and
  // force Caddy to try issuing a Let's Encrypt cert for each one — that flood
  // saturates the backend and burns the LE rate limit.
  if (raw.endsWith(`.${platformApex}`)) {
    const sub = raw.slice(0, -(platformApex.length + 1));
    // Reject anything with an extra dot → forces first-level only.
    if (sub.includes('.')) {
      recordSecurityEvent({ type: 'cert_flood', sourceIp: callerIp(req), target: raw, sample: { reason: 'multi_level_subdomain' } });
      return res.status(404).json({ error: 'multi-level subdomain not authorized' });
    }
    // Reserved infra subdomains (www, api, admin…).
    if (RESERVED_SUBDOMAINS.has(sub)) {
      return res.status(200).json({ ok: true, kind: 'reserved' });
    }
    // Must correspond to a real, published store — otherwise attacker can
    // enumerate arbitrary slugs to force cert issuance.
    const store = await Store.findOne({ slug: sub })
      .select('_id')
      .lean();
    if (!store) {
      recordSecurityEvent({ type: 'cert_flood', sourceIp: callerIp(req), target: raw, sample: { reason: 'unknown_store_slug', slug: sub } });
      return res.status(404).json({ error: 'unknown store subdomain' });
    }
    return res.status(200).json({ ok: true, kind: 'store' });
  }

  // Not under the platform apex → must be a verified custom domain.
  const store = await Store.findOne({
    customDomain: raw,
    customDomainVerified: true,
  })
    .select('_id')
    .lean();

  if (!store) {
    recordSecurityEvent({ type: 'cert_flood', sourceIp: callerIp(req), target: raw, sample: { reason: 'unauthorized_custom_domain' } });
    return res.status(404).json({ error: 'domain not authorized' });
  }
  return res.status(200).json({ ok: true, kind: 'custom' });
});

export default router;
