import { NextResponse, type NextRequest } from 'next/server';

/**
 * URL-rewrite middleware that makes every customer-facing store page
 * appear at the root path — `flexiopage.com/<store-slug>` instead of
 * `flexiopage.com/store/<store-slug>`. The internal file structure
 * stays at /app/store/[storeSlug]/... so we keep type-safety and the
 * existing components untouched; only the public URL changes.
 *
 * Strategy:
 *   1. Anything starting with a reserved top-level segment (auth,
 *      dashboard, admin, API, static assets, _next…) passes through.
 *   2. Anything else — the first segment is treated as a store slug,
 *      and we rewrite to /store/<segment>/<rest>.
 *
 * Reserved set is explicit and conservative: when in doubt, we DO NOT
 * rewrite. The cost of a false negative ("user typed /foo, we said
 * store not found") is a 404; the cost of a false positive (rewriting
 * /login to /store/login) is breaking auth.
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Empty path or already a special root → leave alone.
  if (pathname === '/' || pathname === '') return NextResponse.next();

  const firstSeg = pathname.split('/')[1] || '';

  // Reserved app paths, static assets, hidden dotfiles → no rewrite.
  if (RESERVED_TOP_LEVEL.has(firstSeg)) return NextResponse.next();
  if (firstSeg.startsWith('_')) return NextResponse.next();
  // Anything that looks like a file (e.g. /something.svg) → leave alone.
  if (firstSeg.includes('.')) return NextResponse.next();

  // Rewrite /<slug>/<rest> → /store/<slug>/<rest> while keeping the
  // browser address bar on the clean URL.
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
