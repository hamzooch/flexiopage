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
import { cookies } from 'next/headers';
import { mediaUrl, storeAbsoluteUrl } from '@/lib/utils';
import { WhatsappButton, type WhatsappConfig } from '@/components/storefront/whatsapp-button';
import { BotstoreWidget, type BotstoreConfig } from '@/components/storefront/botstore-widget';
import { NewsletterPopup, type NewsletterConfig } from '@/components/storefront/newsletter-popup';
import { SalesPopup, type SalesPopupConfig } from '@/components/storefront/sales-popup';
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
    botstore?: BotstoreConfig;
    newsletter?: NewsletterConfig;
    salesPopup?: SalesPopupConfig;
    language?: string;
    seoTitle?: string;
    seoDescription?: string;
    storefront?: { heroImage?: string };
  };
}

async function fetchStore(storeSlug: string): Promise<StoreLite | null> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  // Preview mode : le dashboard, en ouvrant l'iframe d'aperçu, dépose un
  // cookie `preview_auth=<jwt>` sur le même origin. On l'expédie en
  // Authorization Bearer + ?preview=1 au backend qui fusionne alors
  // previewDraft par-dessus le live. Sans cookie → fetch normal (ISR
  // 60 s). Avec cookie → no-store pour ne PAS empoisonner le cache
  // partagé avec la version draft.
  const previewToken = (await cookies()).get('preview_auth')?.value;
  const url = previewToken
    ? `${apiBase}/api/public/store-by-slug/${storeSlug}?preview=1`
    : `${apiBase}/api/public/store-by-slug/${storeSlug}`;
  try {
    const res = await fetch(url, {
      ...(previewToken
        ? { cache: 'no-store', headers: { Authorization: `Bearer ${previewToken}` } }
        : { next: { revalidate: 60, tags: [`store:${storeSlug}`] } }),
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
  // `manifest: null` suppresses the FlexioPage PWA manifest inherited from
  // the root layout so the browser never prompts « Installer FlexioPage »
  // on a customer-facing shop (subdomain ou domaine custom).
  if (!store || !name) {
    return {
      icons: { icon, shortcut: icon, apple: icon },
      manifest: null,
      applicationName: null,
    };
  }

  return {
    // `absolute` court-circuite le template `%s · FlexioPage` défini en
    // app/layout.tsx — sinon l'onglet navigateur affichait par exemple
    // "dylando · FlexioPage" alors qu'on veut juste "dylando".
    title: { absolute: title || name },
    description,
    icons: { icon, shortcut: icon, apple: icon },
    // Idem branche du haut : coupe l'invite d'install PWA de FlexioPage
    // sur toutes les pages boutique. Seule flexiopage.com apex (root
    // layout) conserve son manifest et propose l'installation.
    manifest: null,
    applicationName: null,
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
  // Botstore vs bouton WhatsApp : mutuellement exclusifs à l'affichage pour
  // éviter deux bulles flottantes qui se chevauchent. Quand le Botstore est
  // actif, il porte lui-même le CTA WhatsApp (fallback dans la conversation).
  const botstoreActive = !!store?.settings?.botstore?.enabled;
  return (
    <>
      <LocaleBootstrap storeSlug={storeSlug} defaultLocale={store?.settings?.language} />
      {children}
      {botstoreActive ? (
        <BotstoreWidget
          storeSlug={storeSlug}
          config={store?.settings?.botstore}
          whatsapp={store?.settings?.whatsapp}
        />
      ) : (
        <WhatsappButton config={store?.settings?.whatsapp} />
      )}
      <NewsletterPopup
        storeSlug={storeSlug}
        storeName={store?.name}
        config={store?.settings?.newsletter}
      />
      <SalesPopup
        storeSlug={storeSlug}
        config={store?.settings?.salesPopup}
      />
    </>
  );
}
