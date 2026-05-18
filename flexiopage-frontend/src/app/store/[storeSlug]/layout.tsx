/**
 * Shared layout for every storefront page (`/store/<slug>/...`). Today its
 * sole job is to fetch the store's WhatsApp config once and render the
 * floating button across the homepage, product pages, info pages and
 * checkout flows so the seller doesn't have to wire it page-by-page.
 *
 * Kept as a Server Component so the wa.me link is rendered without a
 * client-side roundtrip — the button itself is a 'use client' component
 * for the animation/SVG markup.
 */
import { WhatsappButton, type WhatsappConfig } from '@/components/storefront/whatsapp-button';

interface Props {
  children: React.ReactNode;
  params: Promise<{ storeSlug: string }>;
}

async function fetchWhatsapp(storeSlug: string): Promise<WhatsappConfig | undefined> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  try {
    const res = await fetch(`${apiBase}/api/public/store-by-slug/${storeSlug}`, {
      // Same fetch policy as the storefront pages — no cache so a config
      // change in the dashboard shows up immediately on the public site.
      cache: 'no-store',
    });
    if (!res.ok) return undefined;
    const { store } = (await res.json()) as { store?: { settings?: { whatsapp?: WhatsappConfig } } };
    return store?.settings?.whatsapp;
  } catch {
    return undefined;
  }
}

export default async function StoreLayout({ children, params }: Props) {
  const { storeSlug } = await params;
  const wa = await fetchWhatsapp(storeSlug);
  return (
    <>
      {children}
      <WhatsappButton config={wa} />
    </>
  );
}
