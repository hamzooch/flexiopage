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

const router = Router();

router.get('/cert-ask', async (req: Request, res: Response) => {
  const raw = (req.query.domain as string | undefined)?.trim().toLowerCase();
  if (!raw) return res.status(400).json({ error: 'missing domain' });

  // Reject anything that isn't a hostname (no scheme, no path, no port).
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(raw)) {
    return res.status(400).json({ error: 'invalid domain' });
  }

  // Always allow our own platform hosts so Caddy can boot with on-demand TLS
  // enabled globally without tripping the gate for flexiopage.com itself.
  const platformApex = (process.env.PLATFORM_APEX || 'flexiopage.com').toLowerCase();
  if (raw === platformApex || raw.endsWith(`.${platformApex}`)) {
    return res.status(200).json({ ok: true, kind: 'platform' });
  }

  const store = await Store.findOne({
    customDomain: raw,
    customDomainVerified: true,
  })
    .select('_id')
    .lean();

  if (!store) return res.status(404).json({ error: 'domain not authorized' });
  return res.status(200).json({ ok: true, kind: 'custom' });
});

export default router;
