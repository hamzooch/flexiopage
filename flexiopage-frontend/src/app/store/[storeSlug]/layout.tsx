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
import { mediaUrl, storeAbsoluteUrl } from '@/lib/utils';
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
  description?: string;
  favicon?: string;
  logo?: string;
  slug?: string;
  settings?: {
    whatsapp?: WhatsappConfig;
    newsletter?: NewsletterConfig;
    language?: string;
    seoTitle?: string;
    seoDescription?: string;
    storefront?: { heroImage?: string };
  };
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

  // ── Per-store Open Graph + Twitter cards ────────────────────────
  // When someone shares the storefront URL on WhatsApp / Facebook / X /
  // LinkedIn, the preview MUST show the seller's brand, not FlexioPage's.
  // The root layout sets FlexioPage defaults; overriding here cascades
  // to every page under /store/<slug>/* (home, product, collection, info).
  // Each child page can still refine with its own openGraph block (e.g.
  // the product page later swaps in the product image).
  const name = store?.name?.trim();
  const description = (
    store?.settings?.seoDescription
    || store?.description
    || (name ? `Découvre les produits de ${name}.` : undefined)
  );
  // Prefer the hero image (1920×1080) for a proper rectangular card. Fall
  // back to the logo when no hero is set — most social platforms still
  // render it cleanly (Facebook/WhatsApp center-crop, OK for a square logo).
  const ogImage = mediaUrl(
    store?.settings?.storefront?.heroImage || store?.logo || store?.favicon
  );
  const canonicalUrl = storeAbsoluteUrl(storeSlug);

  const title = store?.settings?.seoTitle?.trim() || name;

  // No store? Don't leak FlexioPage branding either — return the icons only.
  if (!store || !name) {
    return { icons: { icon, shortcut: icon, apple: icon } };
  }

  return {
    title,
    description,
    icons: { icon, shortcut: icon, apple: icon },
    openGraph: {
      type: 'website',
      siteName: name,
      title: title || name,
      description,
      url: canonicalUrl,
      ...(ogImage
        ? {
            images: [
              {
                url: ogImage,
                // Hero is wide; logo is usually square. We pass dimensions only
                // when we know them — undefined lets the crawler infer.
                alt: name,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: title || name,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    // Helps social bots find the canonical URL when accessed via /store/<slug>
    // path-based fallback rather than the subdomain.
    alternates: canonicalUrl?.startsWith('http') ? { canonical: canonicalUrl } : undefined,
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
