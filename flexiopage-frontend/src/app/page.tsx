// Server wrapper for the marketing landing.
//
// `force-dynamic` disables the Full Route Cache for `/`. Without it, Next
// prerenders `/` at build time and serves the cached HTML for every host —
// which means `dylando.com/` and other verified custom domains get the
// FlexioPage marketing page instead of their storefront (the middleware
// rewrite is bypassed for the prerendered `/` cache entry). Making `/`
// dynamic guarantees middleware runs on every request and routes each host
// to the correct destination.
export const dynamic = 'force-dynamic';

import MarketingHome from './marketing-home.client';

export default function Page() {
  return <MarketingHome />;
}
