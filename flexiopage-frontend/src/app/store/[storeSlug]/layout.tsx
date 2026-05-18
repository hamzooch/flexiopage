/**
 * Shared layout for every storefront page (`/store/<slug>/...`).
 *
 * Two responsibilities:
 *   1. Set the per-store favicon — the seller's own icon when configured,
 *      otherwise a blank 1x1 PNG so the FlexioPage favicon (from the root
 *      layout) does NOT bleed into a customer-facing shop. Dashboard,
 *      login, marketing, etc. keep the FlexioPage favicon untouched
 *      because they live outside this route group.
 *   2. Render the floating WhatsApp button on every storefront page so
 *      we don't have to wire it page-by-page.
 *
 * Kept as a Server Component: the favicon link is part of the static
 * <head> and the wa.me link is rendered without a client roundtrip.
 */
import type { Metadata } from 'next';
import { mediaUrl } from '@/lib/utils';
import { WhatsappButton, type WhatsappConfig } from '@/components/storefront/whatsapp-button';
import { NewsletterPopup, type NewsletterConfig } from '@/components/storefront/newsletter-popup';
import { LocaleBootstrap } from '@/components/storefront/locale-bootstrap';

interface Props {
  children: React.ReactNode;
  params: Promise<{ storeSlug: string }>;
}

/**
 * 1×1 transparent PNG used to suppress the inherited FlexioPage favicon
 * on stores where the seller hasn't uploaded one. We deliberately do
 * NOT fall back to /favicon.ico — that would brand the customer's shop
 * with the platform logo, which is exactly what the seller doesn't want.
 */
const BLANK_FAVICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

interface StoreLite {
  name?: string;
  favicon?: string;
  logo?: string;
  settings?: { whatsapp?: WhatsappConfig; newsletter?: NewsletterConfig; language?: string };
}

async function fetchStore(storeSlug: string): Promise<StoreLite | null> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  try {
    const res = await fetch(`${apiBase}/api/public/store-by-slug/${storeSlug}`, {
      // No cache so a favicon/whatsapp change in the dashboard reflects
      // immediately on the public site.
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const { store } = (await res.json()) as { store?: StoreLite };
    return store || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { storeSlug } = await params;
  const store = await fetchStore(storeSlug);
  // Seller's favicon (or logo as a fallback). When neither is set we ship
  // a blank icon so the root layout's FlexioPage favicon doesn't leak in.
  const sellerIcon = mediaUrl(store?.favicon || store?.logo);
  const icon = sellerIcon || BLANK_FAVICON;
  return {
    icons: {
      icon,
      shortcut: icon,
      apple: icon,
    },
  };
}

export default async function StoreLayout({ children, params }: Props) {
  const { storeSlug } = await params;
  const store = await fetchStore(storeSlug);
  return (
    <>
      <LocaleBootstrap storeSlug={storeSlug} defaultLocale={store?.settings?.language} />
      {children}
      <WhatsappButton config={store?.settings?.whatsapp} />
      <NewsletterPopup
        storeSlug={storeSlug}
        storeName={store?.name}
        config={store?.settings?.newsletter}
      />
    </>
  );
}
