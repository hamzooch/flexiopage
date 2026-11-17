import { NextResponse, type NextRequest } from 'next/server';

/** Internal API base — server-side only so middleware can reach the backend
 * even when NEXT_PUBLIC_API_URL points to a public host. Falls back to the
 * public var, then to local dev. */
const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5051';

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
  'verify-email',
  'forgot-password',
  'reset-password',
  'dashboard',
  'admin',
  'preview',
  'thanks',
  'store',     // keep legacy /store/* URLs working so old links / GSC index entries still resolve
  'select-store', // post-login store picker — without this it gets rewritten to /store/select-store
  'select-space', // post-login space picker (seller ↔ admin) — same raison d'être
  'tg',        // arrivée du bouton Telegram — sans ça /tg devient /store/tg
  'd',         // private download tokens
  // Legal / policy pages at the app apex — without these, the path-based
  // storefront fallback rewrites flexiopage.com/terms-of-service →
  // /store/terms-of-service → 404 (no such store). Meta requires these URLs
  // to resolve for app review, so they MUST pass through.
  'terms-of-service',
  'privacy-policy',
  'data-deletion',
  'support',         // page publique de contact + formulaire support@flexiopage.com
  'geo-blocked', // écran « boutique fermée dans ce pays » — pas une boutique
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
  'brands',
  'uploads',
  'demo-products', // photos d'exemple des thèmes (public/demo-products)
  'integrations',
  'avatars',   // bibliothèque UGC (public/avatars/manifest.json)
]);

/** Subdomains that are NOT a store — never rewrite their requests. */
const RESERVED_SUBDOMAINS = new Set(['www', 'api', 'admin', 'app', 'staging', 'preview']);

/**
 * Top-level paths that live at the root of the app and are reachable from
 * a store subdomain or custom domain — buyer journey pages, not seller
 * tools. /thanks/cod/<id> is the canonical example: the COD form pushes
 * to /thanks/cod/<id> after a successful order, and the buyer is still
 * on hayla-tn.flexiopage.com, so we must NOT rewrite that to
 * /store/hayla-tn/thanks/... (which doesn't exist). /d/<token> is the
 * same idea for digital-download tokens emailed to buyers.
 */
const GLOBAL_BUYER_PATHS = new Set(['thanks', 'd']);

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
function edgeCountry(request: NextRequest): string | null {
  const raw = (
    request.headers.get('x-vercel-ip-country')
    || request.headers.get('cf-ipcountry')
    || ''
  ).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(raw) || raw === 'XX' || raw === 'T1') return null;
  return raw;
}

/**
 * Seller country lock. The allow-list comes from the API; the visitor
 * country is the edge header (Vercel / Cloudflare), which the browser
 * cannot forge. Unknown country stays open so local dev keeps working.
 * The shop owner preview cookie is checked by the API and skips the lock.
 */
async function blockedStoreResponse(request: NextRequest, slug: string): Promise<NextResponse | null> {
  if (!slug || !/^[a-z0-9-]{2,80}$/i.test(slug)) return null;
  const country = edgeCountry(request);
  if (!country) return null;
  const token = request.cookies.get('preview_auth')?.value;
  try {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(
      `${INTERNAL_API_URL}/api/public/store-access/${encodeURIComponent(slug)}`,
      { cache: 'no-store', headers },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      enabled?: boolean;
      countries?: string[];
      bypass?: boolean;
      name?: string;
      logo?: string;
    };
    if (!data.enabled || data.bypass) return null;
    const allowed = (data.countries || []).map((code) => code.toUpperCase());
    if (allowed.includes(country)) return null;

    const url = request.nextUrl.clone();
    url.pathname = '/geo-blocked';
    url.search = '';
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-flexio-geo-block', encodeURIComponent(JSON.stringify({
      name: data.name || '',
      logo: data.logo || '',
      visitorCountry: country,
      allowedCountries: allowed,
    })));
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } catch {
    return null;
  }
}

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

/**
 * Cookie de split A/B. 32-bit random posé à la 1re visite storefront. La page
 * produit en fait `cookie % totalWeight` pour piocher un variant pondéré, ce
 * qui garantit la stabilité (même visiteur → même variant) sans que le
 * middleware ait besoin de connaître les variants d'un produit donné.
 * httpOnly=false parce que la page server-component le lit via `cookies()` et
 * le forward aussi au backend dans le fetch SSR (mêmes règles qu'un cookie de
 * tracking classique). 180 jours = cohérent avec la rétention StoreEvent.
 */
const SPLIT_COOKIE = 'flexio_split';
const SPLIT_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;

function attachSplitCookie(response: NextResponse, request: NextRequest): NextResponse {
  if (request.cookies.has(SPLIT_COOKIE)) return response;
  // Entier 0..999999 — assez de granularité pour pondérer jusqu'à ~100 variants
  // sans collision visible. Math.random suffit : on ne s'en sert pas comme id
  // cryptographique, juste comme graine de tirage.
  const seed = Math.floor(Math.random() * 1_000_000).toString();
  response.cookies.set(SPLIT_COOKIE, seed, {
    maxAge: SPLIT_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
  });
  return response;
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

  // First segment of the path — used by the global-buyer-path check
  // shared across the subdomain + custom-domain branches below.
  const firstSegOfPath = pathname.split('/')[1] || '';

  // ── 1. Subdomain-based storefront (canonical) ─────────────────────
  const subSlug = subdomainStoreSlug(rawHost);
  if (subSlug) {
    if (isFrameworkPath) return NextResponse.next();
    // Pass through global buyer-journey routes (/thanks/..., /d/...)
    // so they resolve to the app-level page instead of being rewritten
    // into a non-existent /store/<slug>/thanks/... path.
    if (GLOBAL_BUYER_PATHS.has(firstSegOfPath)) return NextResponse.next();
    const blocked = await blockedStoreResponse(request, subSlug);
    if (blocked) return blocked;
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
    return attachSplitCookie(NextResponse.rewrite(url), request);
  }

  // ── 2. Custom-domain storefront ───────────────────────────────────
  // Any Host that isn't the app, localhost, an IP, or a *.<root> subdomain
  // is a candidate. We ask the backend to look it up (verified domains only).
  if (host && !isAppOrLocalHost(host)) {
    if (isFrameworkPath) return NextResponse.next();
    if (GLOBAL_BUYER_PATHS.has(firstSegOfPath)) return NextResponse.next();
    const slug = await customDomainStoreSlug(host);
    if (slug) {
      const blocked = await blockedStoreResponse(request, slug);
      if (blocked) return blocked;
      // Same dedup as the subdomain case — a custom domain like
      // mystore.com that hosts the same storefront could still receive
      // a /<slug>/... link from an emitter helper. Strip the duplicate.
      let cleanPath = pathname;
      if (cleanPath === `/${slug}` || cleanPath.startsWith(`/${slug}/`)) {
        cleanPath = cleanPath.slice(slug.length + 1) || '/';
      }
      const url = request.nextUrl.clone();
      url.pathname = `/store/${slug}${cleanPath === '/' ? '' : cleanPath}`;
      return attachSplitCookie(NextResponse.rewrite(url), request);
    }
    // Unknown custom host → fall through to the app (will likely 404),
    // which is the right signal that DNS lands here but no store claims it.
  }

  // ── 3. Path-based storefront (legacy fallback) ────────────────────
  if (pathname === '/' || pathname === '') return NextResponse.next();

  const firstSeg = pathname.split('/')[1] || '';

  // Legacy /store/<slug>/... is already the internal path, so the reserved
  // list lets it through. The country lock still has to run on it.
  if (firstSeg === 'store') {
    const storeSlug = pathname.split('/')[2] || '';
    if (storeSlug) {
      const blocked = await blockedStoreResponse(request, storeSlug);
      if (blocked) return blocked;
    }
    return attachSplitCookie(NextResponse.next(), request);
  }

  if (RESERVED_TOP_LEVEL.has(firstSeg)) return NextResponse.next();
  if (firstSeg.startsWith('_')) return NextResponse.next();
  if (firstSeg.includes('.')) return NextResponse.next();

  const blocked = await blockedStoreResponse(request, firstSeg);
  if (blocked) return blocked;

  const url = request.nextUrl.clone();
  url.pathname = `/store${pathname}`;
  return attachSplitCookie(NextResponse.rewrite(url), request);
}

export const config = {
  // Run on every request except the obvious skip-list — the function
  // itself also guards, but the matcher avoids invoking middleware on
  // hot paths (image optimizer, RSC, etc.).
  matcher: ['/((?!_next/static|_next/image|_next/data|favicon\\.ico).*)'],
};
