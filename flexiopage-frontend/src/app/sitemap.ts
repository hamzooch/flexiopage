import type { MetadataRoute } from 'next';

/**
 * Auto-generated sitemap. Lists:
 *   - The marketing surface (home + auth + key anchors)
 *   - Every published customer-facing store and its landing pages,
 *     fetched live from the backend public API so seller shops surface
 *     on Google as soon as they're published.
 *
 * Returned as XML at /sitemap.xml; revalidated on demand by Next.js
 * routing (no static cache — `dynamic = 'force-dynamic'` would be
 * heavier, so we let the framework cache for ~1h via headers).
 */

export const revalidate = 3600; // 1 hour

const SITE =
  (process.env.NEXT_PUBLIC_API_URL || '')
    .replace(/\/api\/?$/, '')
    .replace('api.', '')
    .replace(/\/+$/, '') || 'https://flexiopage.com';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

type PublicStore = {
  slug: string;
  updatedAt?: string;
  pages?: Array<{ slug: string; updatedAt?: string; isPublished?: boolean }>;
};

async function fetchPublicStores(): Promise<PublicStore[]> {
  try {
    const r = await fetch(`${API}/api/public/stores`, { next: { revalidate: 3600 } });
    if (!r.ok) return [];
    const data = (await r.json()) as { stores?: PublicStore[] };
    return data.stores ?? [];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static marketing routes
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE}/`,              lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${SITE}/login`,         lastModified: now, changeFrequency: 'yearly',  priority: 0.4 },
    { url: `${SITE}/register`,      lastModified: now, changeFrequency: 'yearly',  priority: 0.8 },
    { url: `${SITE}/#features`,     lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/#how`,          lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/#commission`,   lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE}/#faq`,          lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];

  // Dynamic customer-facing routes — every published shop + its pages
  const stores = await fetchPublicStores();
  const dynamicRoutes: MetadataRoute.Sitemap = [];
  for (const s of stores) {
    if (!s.slug) continue;
    dynamicRoutes.push({
      url: `${SITE}/${s.slug}`,
      lastModified: s.updatedAt ? new Date(s.updatedAt) : now,
      changeFrequency: 'weekly',
      priority: 0.7,
    });
    for (const p of s.pages ?? []) {
      if (!p.slug || p.isPublished === false) continue;
      dynamicRoutes.push({
        url: `${SITE}/${s.slug}/p/${p.slug}`,
        lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }
  }

  return [...staticRoutes, ...dynamicRoutes];
}
