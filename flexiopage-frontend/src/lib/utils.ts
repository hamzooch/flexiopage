import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date(date));
}

/**
 * Build a relative path inside the same storefront. Use this for links
 * rendered ON a storefront page — once the visitor is on
 * `macaftans.flexiopage.com`, a relative href like `/product/foo` stays
 * on the same subdomain naturally.
 *
 *   storeUrl('macaftans')                          → '/macaftans'
 *   storeUrl('macaftans', 'product/foo')           → '/macaftans/product/foo'
 *
 * Path-based URLs still resolve via the middleware fallback, so old
 * `/macaftans/...` links keep working.
 */
export function storeUrl(storeSlug: string, subPath?: string): string {
  const slug = storeSlug.replace(/^\/+|\/+$/g, '');
  if (!subPath) return `/${slug}`;
  const clean = subPath.replace(/^\/+/, '');
  return `/${slug}/${clean}`;
}

/**
 * Build a full absolute URL on the storefront subdomain. Use this when
 * the link is shown OUTSIDE the storefront (dashboard "View store"
 * button, share buttons, emails, admin lists) — those origins don't
 * carry the subdomain context, so a relative path would land on the
 * wrong host.
 *
 *   storeAbsoluteUrl('macaftans')                  → 'https://macaftans.flexiopage.com'
 *   storeAbsoluteUrl('macaftans', 'product/foo')   → 'https://macaftans.flexiopage.com/product/foo'
 *
 * In local dev, set `NEXT_PUBLIC_STOREFRONT_DOMAIN` to something like
 * `lvh.me:3002` (lvh.me resolves *.lvh.me → 127.0.0.1) and the helper
 * will emit `http://<slug>.lvh.me:3002/...` — protocol is auto-picked
 * from `window.location` on the client so HTTPS isn't forced when the
 * page itself is served over HTTP. If the env is unset entirely we fall
 * back to the path-based form so the dashboard "View store" button
 * still works without any setup.
 */
export function storeAbsoluteUrl(storeSlug: string, subPath?: string): string {
  const slug = storeSlug.replace(/^\/+|\/+$/g, '');
  const clean = subPath?.replace(/^\/+/, '') || '';
  const domain = (process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN || '').toLowerCase().trim();
  if (!domain) {
    // No subdomain configured → path-based on current origin.
    return clean ? `/${slug}/${clean}` : `/${slug}`;
  }
  // Default https; on the client, mirror whatever scheme the current
  // page uses so a Next dev server on http://localhost emits http URLs.
  let protocol = 'https';
  if (typeof window !== 'undefined' && window.location?.protocol) {
    protocol = window.location.protocol.replace(/:$/, '');
  }
  return clean
    ? `${protocol}://${slug}.${domain}/${clean}`
    : `${protocol}://${slug}.${domain}`;
}

/**
 * Resolve a stored media path to a browser-loadable URL.
 *
 * Uploads are saved with a relative `/uploads/...` path that points at the
 * API server, not the Next.js origin. Rendering them raw breaks the image,
 * so prefix relative paths with the API base. Absolute URLs and data URIs
 * are returned untouched.
 */
export function mediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');
  return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
}
