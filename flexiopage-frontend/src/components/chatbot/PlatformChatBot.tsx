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
import { usePathname } from 'next/navigation';
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

/** True when the path itself marks a storefront route. */
function pathIsStorefront(pathname: string): boolean {
  return STOREFRONT_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`)
  );
}

/**
 * True when the browser is on a storefront subdomain (`<slug>.lvh.me`,
 * `<slug>.flexiopage.com`). Necessary because storefront short URLs that
 * land at `/` look identical to the platform landing.
 */
function hostIsStorefrontSubdomain(host: string): boolean {
  const storefrontHost = (process.env.NEXT_PUBLIC_STOREFRONT_DOMAIN || '')
    .replace(/:\d+$/, '')
    .toLowerCase();
  if (!storefrontHost) return false;
  const h = host.toLowerCase().replace(/:\d+$/, '');
  return h !== storefrontHost && h.endsWith(`.${storefrontHost}`);
}

export function PlatformChatBot() {
  const pathname = usePathname() || '';
  // Hostname is only known on the client — defer the subdomain check
  // to after mount to avoid an SSR hydration mismatch.
  const [host, setHost] = useState<string>('');
  useEffect(() => {
    if (typeof window !== 'undefined') setHost(window.location.host);
  }, []);

  if (pathIsStorefront(pathname)) return null;
  if (host && hostIsStorefrontSubdomain(host)) return null;

  return <ChatBot script={flexiopageScript} storageKey="flexiopage-platform-chat" />;
}
