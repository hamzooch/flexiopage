import { headers } from 'next/headers';
import { GeoBlockedScreen } from '@/components/storefront/geo-blocked';

interface GeoBlockPayload {
  name?: string;
  logo?: string;
  visitorCountry?: string;
  allowedCountries?: string[];
}

/**
 * Internal rewrite target. The storefront middleware sends blocked visitors
 * here so none of the shop pages (and their product data) render.
 */
export default async function GeoBlockedPage() {
  const raw = (await headers()).get('x-flexio-geo-block');
  let payload: GeoBlockPayload = {};
  if (raw) {
    try {
      payload = JSON.parse(decodeURIComponent(raw)) as GeoBlockPayload;
    } catch {
      payload = {};
    }
  }
  return (
    <GeoBlockedScreen
      name={payload.name}
      logo={payload.logo}
      visitorCountry={payload.visitorCountry}
      allowedCountries={payload.allowedCountries}
    />
  );
}
