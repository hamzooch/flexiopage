'use client';

/**
 * Mounts the FlexioPage marketing chatbot on every "platform" page —
 * landing, login, register, dashboard, admin — and stays out of every
 * customer-facing storefront page (the storefront uses a WhatsApp
 * floating button instead of a bot).
 *
 * Lives in the root layout so route changes (dashboard ↔ admin ↔ login)
 * keep the same conversation thanks to the shared localStorage key.
 */
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChatBot } from './ChatBot';
import { flexiopageScript } from './scripts';

/**
 * Path prefixes that ALWAYS belong to a storefront — works both for the
 * canonical /store/<slug>/... URLs and for the rewritten short paths
 * (/p/<slug>, /product/<slug>, /thanks/..., /d/<token>) emitted via
 * subdomain or short-URL access through middleware.
 */
const STOREFRONT_PATH_PREFIXES = [
  '/store',     // canonical
  '/thanks',    // COD thank-you
  '/preview',   // theme/page preview
  '/d/',        // digital-download portal
  '/p/',        // short-URL info / landing pages
  '/product/',  // short-URL product page
];

/**
 * Dashboard sub-pages that host a live preview of the seller's storefront.
 * The bot must stay hidden there so it doesn't visually compete with the
 * preview panel — only the seller's own WhatsApp button (if activated) is
 * meant to appear in that frame.
 */
const LIVE_PREVIEW_PATH_PATTERNS: RegExp[] = [
  /^\/dashboard\/stores\/[^/]+\/(sections|info|appearance|checkout)(\/|$)/,
  /^\/dashboard\/products\/(?!new(\/|$))[^/]+(\/|$)/,
];

/** True when the path itself marks a storefront route. */
function pathIsStorefront(pathname: string): boolean {
  return STOREFRONT_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`)
  );
}

/** True when the path hosts a live storefront preview in the dashboard. */
function pathHasLivePreview(pathname: string): boolean {
  return LIVE_PREVIEW_PATH_PATTERNS.some((re) => re.test(pathname));
}

/**
 * True only when the browser is on the FlexioPage platform itself —
 * apex (flexiopage.com), www, or localhost/IP in dev. Returns false
 * for storefront subdomains (`<slug>.flexiopage.com`) AND for any
 * seller's verified custom domain that points at us. Both are
 * customer-facing surfaces where the platform marketing bot must
 * never appear.
 */
function hostIsPlatform(host: string): boolean {
  if (!host) return false;
  const h = host.toLowerCase().replace(/:\d+$/, '');
  // Dev — every local box matches one of these.
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true;
  const platformHost = (process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN || '')
    .replace(/:\d+$/, '')
    .toLowerCase();
  if (!platformHost) return false;
  // Apex + www are the platform; anything else is a storefront or a
  // seller's custom domain.
  return h === platformHost || h === `www.${platformHost}`;
}

export function PlatformChatBot() {
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  // Defer the host check to after mount: SSR doesn't know the host,
  // and rendering the bot before we've confirmed we're on the platform
  // would briefly flash it on custom-domain storefronts.
  const [mounted, setMounted] = useState(false);
  const [onPlatform, setOnPlatform] = useState(false);
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      setOnPlatform(hostIsPlatform(window.location.host));
    }
  }, []);

  // L'iframe d'aperçu du dashboard charge le storefront avec `?preview=1`.
  // Sans cette garde, le bot flotterait DANS l'iframe et masquerait le rendu
  // que le vendeur veut voir (l'URL rewritten /<slug> n'est pas détectée par
  // pathIsStorefront, qui ne connaît que les paths canoniques /store/...).
  if (searchParams?.get('preview') === '1') return null;
  if (pathIsStorefront(pathname)) return null;
  // Hide the bot on dashboard pages that render a live storefront preview —
  // only the seller's WhatsApp button (if enabled) should appear there.
  if (pathHasLivePreview(pathname)) return null;
  if (!mounted) return null;
  if (!onPlatform) return null;

  return <ChatBot script={flexiopageScript} storageKey="flexiopage-platform-chat" />;
}
