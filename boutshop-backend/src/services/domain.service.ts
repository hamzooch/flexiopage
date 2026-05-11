/**
 * Custom domain verification using DNS resolution.
 *
 * The seller adds their domain (e.g. shop.example.com) and points its CNAME
 * (or A record for apex) to BoutShop's hosting domain. We verify by resolving
 * the DNS records and comparing.
 *
 * Env:
 *   STOREFRONT_HOST   — the canonical host BoutShop expects (e.g.
 *                       "stores.boutshop.io"). The seller's CNAME must point
 *                       here. Defaults to a sensible local-dev value.
 *   STOREFRONT_IPS    — optional comma-separated apex IPs (for A records).
 */
import dns from 'node:dns/promises';
import { Store } from '../models/Store.model';

const TARGET_HOST = (process.env.STOREFRONT_HOST || 'stores.boutshop.io').toLowerCase();
const TARGET_IPS = (process.env.STOREFRONT_IPS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export interface DomainCheck {
  domain: string;
  expectedTarget: string;
  expectedIps: string[];
  cname?: string[];
  aRecords?: string[];
  verified: boolean;
  reason?: string;
}

function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

export async function checkDomain(domain: string): Promise<DomainCheck> {
  const clean = normalizeDomain(domain);
  const out: DomainCheck = {
    domain: clean,
    expectedTarget: TARGET_HOST,
    expectedIps: TARGET_IPS,
    verified: false,
  };

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) {
    out.reason = 'invalid_domain';
    return out;
  }

  // CNAME (subdomains like shop.example.com)
  try {
    const cname = await dns.resolveCname(clean);
    out.cname = cname.map((c) => c.toLowerCase().replace(/\.$/, ''));
    if (out.cname.some((c) => c === TARGET_HOST || c.endsWith('.' + TARGET_HOST))) {
      out.verified = true;
      return out;
    }
  } catch {
    // not a CNAME — fall through to A
  }

  // A (apex like example.com)
  if (TARGET_IPS.length > 0) {
    try {
      const a = await dns.resolve4(clean);
      out.aRecords = a;
      if (a.some((ip) => TARGET_IPS.includes(ip))) {
        out.verified = true;
        return out;
      }
    } catch {
      // no A either
    }
  }

  out.reason = 'dns_not_matching';
  return out;
}

export async function verifyAndSaveDomain(storeId: string): Promise<DomainCheck & { saved: boolean }> {
  const store = await Store.findById(storeId).select('customDomain customDomainVerified customDomainTarget');
  if (!store?.customDomain) {
    return {
      domain: '',
      expectedTarget: TARGET_HOST,
      expectedIps: TARGET_IPS,
      verified: false,
      reason: 'no_domain_set',
      saved: false,
    };
  }
  const check = await checkDomain(store.customDomain);
  store.customDomainVerified = check.verified;
  store.customDomainTarget = TARGET_HOST;
  if (check.verified) store.customDomainVerifiedAt = new Date();
  await store.save();
  return { ...check, saved: true };
}

export function getDomainTarget(): { host: string; ips: string[] } {
  return { host: TARGET_HOST, ips: TARGET_IPS };
}
