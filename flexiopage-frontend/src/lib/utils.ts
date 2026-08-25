import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Map ISO language code (fr, ar, en…) to a BCP47 locale string so
 * Intl.NumberFormat emits the right grouping/decimal/symbol position
 * (29,99 € vs €29.99, ١٫٢٣٤ ر.س vs SR 1,234). Caller can pass either
 * a bare lang ('fr') or a full locale ('fr-FR') — both work.
 */
function langToLocale(lang?: string): string {
  if (!lang) return 'en-US';
  if (lang.includes('-')) return lang;
  switch (lang.toLowerCase()) {
    case 'fr': return 'fr-FR';
    case 'ar': return 'ar';
    case 'es': return 'es-ES';
    case 'de': return 'de-DE';
    case 'it': return 'it-IT';
    case 'pt': return 'pt-PT';
    case 'en': return 'en-US';
    default: return lang;
  }
}

export function formatCurrency(amount: number, currency = 'USD', locale?: string): string {
  try {
    return new Intl.NumberFormat(langToLocale(locale), { style: 'currency', currency }).format(amount);
  } catch {
    // Devise inconnue ou locale corrompue → fallback simple sans crash.
    return `${amount} ${currency}`;
  }
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date(date));
}

/**
 * Motion the seller picks for the "-XX%" discount pill shown on cards,
 * product galleries, bumps and cross-sells. `pulse` preserves the historic
 * default; `none` gives a calmer, more premium look.
 */
export type DiscountBadgeAnimation = 'none' | 'pulse' | 'shimmer' | 'bounce' | 'flash';

/**
 * Map the seller's animation choice to the matching CSS class (defined in
 * globals.css). Returns an empty string for `none` so the badge stays static
 * without extra layout/animation cost.
 */
export function discountBadgeAnimClass(anim?: DiscountBadgeAnimation | null): string {
  switch (anim) {
    case 'none':    return '';
    case 'shimmer': return 'flexio-badge-shimmer';
    case 'bounce':  return 'flexio-badge-bounce';
    case 'flash':   return 'flexio-badge-flash';
    case 'pulse':
    default:        return 'flexio-badge-pulse';
  }
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
 * Public-facing URL of a store. Prefers the verified custom domain when
 * the seller has connected one; otherwise falls back to the canonical
 * subdomain via storeAbsoluteUrl. Use this for every "Voir la boutique"
 * style link in the dashboard/admin so vendors see their own brand URL.
 */
export function publicStoreUrl(
  store: { slug: string; customDomain?: string | null; customDomainVerified?: boolean },
  subPath?: string,
): string {
  if (store.customDomain && store.customDomainVerified) {
    const clean = subPath?.replace(/^\/+/, '') || '';
    const host = store.customDomain.toLowerCase();
    return clean ? `https://${host}/${clean}` : `https://${host}`;
  }
  return storeAbsoluteUrl(store.slug, subPath);
}

/**
 * Resolve a stored media path to a browser-loadable URL.
 *
 * Uploads are saved with a relative `/uploads/...` path that points at the
 * API server, not the Next.js origin. Rendering them raw breaks the image,
 * so prefix relative paths with the API base. Absolute URLs and data URIs
 * are returned untouched.
 */
export function mediaUrl(url?: string | null, opts?: MediaOptOpts): string | undefined {
  if (!url) return undefined;
  // Certaines URLs stockées en base ont perdu le colon du scheme
  // (`https//res.cloudinary.com/…` au lieu de `https://…`). Sans ce
  // rattrapage, la regex ci-dessous ne matche pas et l'URL est traitée
  // comme un chemin relatif → le navigateur tente de charger
  // `api.flexiopage.comhttps//…` et se prend un ERR_NAME_NOT_RESOLVED.
  const repaired = /^https?\/\//i.test(url) ? url.replace(/^(https?)\/\//i, '$1://') : url;
  if (/^(https?:)?\/\//.test(repaired) || repaired.startsWith('data:') || repaired.startsWith('blob:')) {
    return applyCloudinaryOpts(repaired, opts);
  }
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');
  return `${apiBase}${repaired.startsWith('/') ? '' : '/'}${repaired}`;
}

/** Options pour les transformations Cloudinary appliquées via URL. */
export interface MediaOptOpts {
  /** Largeur cible en px. Cloudinary applique `c_limit` → jamais d'upscale. */
  width?: number;
  /** Qualité 1-100 ; défaut Cloudinary q_auto (adaptatif visuel). */
  quality?: number | 'auto';
}

/**
 * Injecte les transformations Cloudinary dans une URL `res.cloudinary.com`.
 * Non-Cloudinary : retourne l'URL telle quelle.
 *
 * Par défaut on ajoute `f_auto,q_auto` — Cloudinary sert alors du WebP/AVIF
 * quand le navigateur le supporte et ajuste la qualité perceptuelle. Gain
 * typique 40-60% de poids sans changer une ligne côté composant.
 *
 * Si `opts.width` est fourni, on ajoute `w_<n>,c_limit` (ne dépasse jamais
 * la largeur d'origine — évite le mode blur+upscale).
 */
function applyCloudinaryOpts(url: string, opts?: MediaOptOpts): string {
  if (!/res\.cloudinary\.com\/.+\/upload\//.test(url)) return url;
  // Si des transformations sont déjà présentes (une URL déjà optimisée), on
  // ne double pas — laisse passer.
  const alreadyTransformed = /\/upload\/[a-z]_[^/]+\//i.test(url);
  if (alreadyTransformed) return url;
  const parts: string[] = ['f_auto', `q_${opts?.quality ?? 'auto'}`];
  if (opts?.width) parts.push(`w_${Math.round(opts.width)}`, 'c_limit');
  return url.replace('/upload/', `/upload/${parts.join(',')}/`);
}

/**
 * True si on tourne DANS l'app mobile FlexioPage (WebView native), détectée
 * via le marqueur `FlexioPageApp` posé sur le user-agent par WebShell.
 */
export function isMobileApp(): boolean {
  return typeof navigator !== 'undefined' && /FlexioPageApp/i.test(navigator.userAgent);
}

/**
 * Destination après déconnexion : la landing marketing sur le WEB, mais
 * directement `/login` dans l'app mobile — le vendeur ne doit jamais voir le
 * site marketing ni la landing dans l'app.
 */
export function logoutRedirectPath(): string {
  return isMobileApp() ? '/login' : '/';
}
