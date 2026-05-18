import { NextResponse, type NextRequest } from 'next/server';

/** Internal API base — server-side only so middleware can reach the backend
 * even when NEXT_PUBLIC_API_URL points to a public host. Falls back to the
 * public var, then to local dev. */
const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5050';

/**
 * Two URL shapes resolve to the same internal /store/[storeSlug] route:
 *
 *   1. Subdomain (canonical): macaftans.flexiopage.com/<path>
 *   2. Path (legacy):         flexiopage.com/macaftans/<path>
 *
 * The legacy path form stays alive for old links + Google index entries.
 * Internally both rewrite to /store/<slug>/<rest> so the file structure
 * at /app/store/[storeSlug]/... stays untouched.
 *
 * For path rewrite (case 2), reserved top-level segments (auth, dashboard,
 * admin, API, static assets…) pass through — when in doubt we DO NOT
 * rewrite. False positives (rewriting /login to /store/login) break auth.
 */

const RESERVED_TOP_LEVEL = new Set([
  // App surface
  'login',
  'register',
  'dashboard',
  'admin',
  'preview',
  'thanks',
  'store',     // keep legacy /store/* URLs working so old links / GSC index entries still resolve
  'select-store', // post-login store picker — without this it gets rewritten to /store/select-store
  'd',         // private download tokens
  // Next.js + framework
  '_next',
  'api',
  // Static files / SEO assets at the root
  'favicon.ico',
  'sitemap.xml',
  'robots.txt',
  'opengraph-image',
  'manifest.webmanifest',
  // public/* folders that resolve directly
  'brand',
  'uploads',
  'integrations',
]);

/** Subdomains that are NOT a store — never rewrite their requests. */
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'admin', 'app', 'staging', 'preview']);

// Strip port — in dev the env may include one (lvh.me:3002), but Host
// matching is done after we've stripped the port from the incoming host.
const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN || 'flexiopage.com')
  .toLowerCase()
  .split(':')[0];

/**
 * Pull the store slug out of the Host header when it looks like
 * `<slug>.<rootDomain>`. Returns null for apex, www, reserved
 * subdomains, raw IPs, or localhost (no subdomain routing in dev).
 */
function subdomainStoreSlug(host: string | null): string | null {
  if (!host) return null;
  const h = host.toLowerCase().split(':')[0]; // strip port
  if (!h.endsWith('.' + ROOT_DOMAIN)) return null;
  const sub = h.slice(0, h.length - ROOT_DOMAIN.length - 1);
  if (!sub || sub.includes('.')) return null; // require a single label (no nested subdomains)
  if (RESERVED_SUBDOMAINS.has(sub)) return null;
  return sub;
}

/** True for hosts that should NEVER trigger a custom-domain lookup: the app
 * itself, raw IPs, localhost variants. Anything else that doesn't end in the
 * root domain is a candidate for custom-domain resolution. */
function isAppOrLocalHost(host: string): boolean {
  if (host === ROOT_DOMAIN) return true;             // apex of the app
  if (host === 'localhost') return true;
  if (host === '127.0.0.1' || host === '0.0.0.0') return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true; // raw IPv4
  if (host.endsWith('.' + ROOT_DOMAIN)) return true;  // any *.<root>
  return false;
}

/** Resolve a custom domain to its store slug via the public backend route.
 * Cached for 60s via Next's fetch cache so we don't hit the API on every
 * request. Returns null on miss or error (fail-open: render app shell). */
async function customDomainStoreSlug(host: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${INTERNAL_API_URL}/api/public/store-by-domain?domain=${encodeURIComponent(host)}`,
      { next: { revalidate: 60 }, headers: { accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { store?: { slug?: string } };
    return data?.store?.slug || null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rawHost = request.headers.get('host');
  const host = (rawHost || '').toLowerCase().split(':')[0];

  // Framework/static/API paths bypass everything.
  const isFrameworkPath =
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.');

  // ── 1. Subdomain-based storefront (canonical) ─────────────────────
  const subSlug = subdomainStoreSlug(rawHost);
  if (subSlug) {
    if (isFrameworkPath) return NextResponse.next();
    // Storefront link helpers (storeUrl, StoreNavbar, StoreFooter, etc.)
    // emit relative paths like `/<slug>/product/foo` which work fine on
    // the legacy path-based access (flexiopage.com/<slug>/...). On the
    // canonical subdomain (<slug>.flexiopage.com/<slug>/...) the same
    // links produce a duplicate slug → /store/<slug>/<slug>/... → 404.
    // Strip the leading duplicate so both URL shapes resolve to the
    // same internal route without having to refactor every <Link>.
    let cleanPath = pathname;
    if (cleanPath === `/${subSlug}` || cleanPath.startsWith(`/${subSlug}/`)) {
      cleanPath = cleanPath.slice(subSlug.length + 1) || '/';
    }
    const url = request.nextUrl.clone();
    url.pathname = `/store/${subSlug}${cleanPath === '/' ? '' : cleanPath}`;
    return NextResponse.rewrite(url);
  }

  // ── 2. Custom-domain storefront ───────────────────────────────────
  // Any Host that isn't the app, localhost, an IP, or a *.<root> subdomain
  // is a candidate. We ask the backend to look it up (verified domains only).
  if (host && !isAppOrLocalHost(host)) {
    if (isFrameworkPath) return NextResponse.next();
    const slug = await customDomainStoreSlug(host);
    if (slug) {
      // Same dedup as the subdomain case — a custom domain like
      // mystore.com that hosts the same storefront could still receive
      // a /<slug>/... link from an emitter helper. Strip the duplicate.
      let cleanPath = pathname;
      if (cleanPath === `/${slug}` || cleanPath.startsWith(`/${slug}/`)) {
        cleanPath = cleanPath.slice(slug.length + 1) || '/';
      }
      const url = request.nextUrl.clone();
      url.pathname = `/store/${slug}${cleanPath === '/' ? '' : cleanPath}`;
      return NextResponse.rewrite(url);
    }
    // Unknown custom host → fall through to the app (will likely 404),
    // which is the right signal that DNS lands here but no store claims it.
  }

  // ── 3. Path-based storefront (legacy fallback) ────────────────────
  if (pathname === '/' || pathname === '') return NextResponse.next();

  const firstSeg = pathname.split('/')[1] || '';

  if (RESERVED_TOP_LEVEL.has(firstSeg)) return NextResponse.next();
  if (firstSeg.startsWith('_')) return NextResponse.next();
  if (firstSeg.includes('.')) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/store${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Run on every request except the obvious skip-list — the function
  // itself also guards, but the matcher avoids invoking middleware on
  // hot paths (image optimizer, RSC, etc.).
  matcher: ['/((?!_next/static|_next/image|_next/data|favicon\\.ico).*)'],
};
