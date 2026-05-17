import { NextResponse, type NextRequest } from 'next/server';

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Subdomain-based storefront (canonical) ─────────────────────
  const subSlug = subdomainStoreSlug(request.headers.get('host'));
  if (subSlug) {
    // Never rewrite framework/static paths even on a store subdomain.
    if (
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      pathname === '/favicon.ico' ||
      pathname.includes('.')
    ) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = `/store/${subSlug}${pathname === '/' ? '' : pathname}`;
    return NextResponse.rewrite(url);
  }

  // ── 2. Path-based storefront (legacy fallback) ────────────────────
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
