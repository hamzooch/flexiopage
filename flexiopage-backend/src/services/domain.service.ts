/**
 * Custom domain verification using DNS resolution.
 *
 * The seller adds their domain (e.g. shop.example.com) and points its CNAME
 * (or A record for apex) to FlexioPage's hosting domain. We verify by resolving
 * the DNS records and comparing.
 *
 * Env:
 *   STOREFRONT_HOST   — the canonical host FlexioPage expects (e.g.
 *                       "stores.flexiopage.com"). The seller's CNAME must point
 *                       here. Defaults to a sensible local-dev value.
 *   STOREFRONT_IPS    — optional comma-separated apex IPs (for A records).
 */
import dns from 'node:dns/promises';
import { Store } from '../models/Store.model';

const TARGET_HOST = (process.env.STOREFRONT_HOST || 'stores.flexiopage.com').toLowerCase();
const TARGET_IPS = (process.env.STOREFRONT_IPS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Nameservers that Flexiopage owns (for advanced users)
const FLEXIOPAGE_NAMESERVERS = [
  'ns1.flexiopage.com',
  'ns2.flexiopage.com',
  'ns3.flexiopage.com',
  'ns4.flexiopage.com',
];

export interface DomainCheck {
  domain: string;
  expectedTarget: string;
  expectedIps: string[];
  cname?: string[];
  aRecords?: string[];
  nameservers?: string[];
  verified: boolean;
  reason?: string;
}

export function normalizeDomain(d: string): string {
  return d
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

export function isValidDomain(d: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d);
}

export async function checkDomain(domain: string): Promise<DomainCheck> {
  const clean = normalizeDomain(domain);
  const out: DomainCheck = {
    domain: clean,
    expectedTarget: TARGET_HOST,
    expectedIps: TARGET_IPS,
    verified: false,
  };

  if (!isValidDomain(clean)) {
    out.reason = 'invalid_domain';
    return out;
  }

  // CNAME (subdomains like shop.example.com)
  try {
    const cname = await dns.resolveCname(clean);
    out.cname = cname.map((c) => c.toLowerCase().replace(/\.$/, ''));
  } catch {
    // not a CNAME — fall through
  }

  // A records (always check, even if CNAME exists — helps detect conflicts)
  try {
    const a = await dns.resolve4(clean);
    out.aRecords = a;
  } catch {
    // no A record
  }

  // Verify CNAME first (highest priority)
  const cnameIsCorrect = out.cname && out.cname.some((c) => c === TARGET_HOST || c.endsWith('.' + TARGET_HOST));
  if (cnameIsCorrect) {
    out.verified = true;
    return out;
  }

  // Check for DNS conflicts: CNAME + A record where CNAME is WRONG (not pointing to target)
  // If CNAME is correct, the A record we see is from following the CNAME - that's normal, not a conflict
  if (out.cname && out.cname.length > 0 && out.aRecords && out.aRecords.length > 0) {
    // Only report conflict if CNAME exists but is WRONG
    if (!cnameIsCorrect) {
      out.reason = 'dns_conflict_cname_and_a';
      return out;
    }
  }

  // Verify A record
  if (out.aRecords && out.aRecords.some((ip) => TARGET_IPS.includes(ip))) {
    out.verified = true;
    return out;
  }

  // Nameservers (for advanced users with full DNS delegation)
  try {
    const ns = await dns.resolveNs(clean);
    out.nameservers = ns.map((n) => n.toLowerCase().replace(/\.$/, ''));
    // Check if ANY of Flexiopage's nameservers are configured
    if (out.nameservers.some((n) => FLEXIOPAGE_NAMESERVERS.map((fn) => fn.toLowerCase()).includes(n.toLowerCase()))) {
      out.verified = true;
      return out;
    }
  } catch {
    // no NS records
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
  const wasVerified = !!store.customDomainVerified;
  store.customDomainVerified = check.verified;
  store.customDomainTarget = TARGET_HOST;
  if (check.verified) store.customDomainVerifiedAt = new Date();
  await store.save();
  // Si l'état vérifié vient de changer, on invalide le cache CORS pour
  // que la storefront sur le nouveau domaine puisse taper l'API dès la
  // prochaine requête (au lieu d'attendre les 60s du TTL).
  if (wasVerified !== check.verified) {
    try {
      const { invalidateCustomDomainCorsCache } = await import('../index');
      invalidateCustomDomainCorsCache();
    } catch { /* boot order may keep this absent in tests; safe to skip */ }
  }
  return { ...check, saved: true };
}

export function getDomainTarget(): { host: string; ips: string[]; nameservers: string[] } {
  return { host: TARGET_HOST, ips: TARGET_IPS, nameservers: FLEXIOPAGE_NAMESERVERS };
}

export function getNameservers(): string[] {
  return FLEXIOPAGE_NAMESERVERS;
}
