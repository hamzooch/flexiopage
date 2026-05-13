import type { MetadataRoute } from 'next';

/**
 * Public robots.txt — tells crawlers what they can index.
 *
 * We block /dashboard/* and /admin/* (private SaaS surface, no value
 * for SEO) plus /api/* (JSON only). Everything else — the marketing
 * landing, /login, /register, and every customer-facing /store/* — is
 * open so Google can surface seller shops via long-tail queries.
 *
 * Resolves to /robots.txt automatically thanks to the Next.js file
 * convention; the sitemap pointer at the end is what makes Search
 * Console discover the URL grid.
 */

const SITE = (process.env.NEXT_PUBLIC_API_URL || '')
  .replace(/\/api\/?$/, '')
  .replace('api.', '')
  .replace(/\/+$/, '') || 'https://flexiopage.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/admin/', '/api/', '/preview/', '/thanks/'],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
