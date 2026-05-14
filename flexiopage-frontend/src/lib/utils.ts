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
 * Build a public storefront URL — clean, path-based.
 *
 *   storeUrl('macaftans')                          → '/macaftans'
 *   storeUrl('macaftans', 'p/landing-1')           → '/macaftans/p/landing-1'
 *   storeUrl('macaftans', 'product/foo')           → '/macaftans/product/foo'
 *
 * The middleware at /src/middleware.ts rewrites these clean URLs to
 * the internal /store/<slug>/... route, so callers should always use
 * this helper instead of hardcoding "/store/" anywhere.
 */
export function storeUrl(storeSlug: string, subPath?: string): string {
  const slug = storeSlug.replace(/^\/+|\/+$/g, '');
  if (!subPath) return `/${slug}`;
  const clean = subPath.replace(/^\/+/, '');
  return `/${slug}/${clean}`;
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
