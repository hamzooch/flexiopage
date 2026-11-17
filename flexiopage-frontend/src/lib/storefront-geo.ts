import { headers } from 'next/headers';

/** Edge country + visitor IP, forwarded to the API by server components. */
export async function storefrontGeoHeaders(): Promise<Record<string, string>> {
  const incoming = await headers();
  const country = (incoming.get('x-vercel-ip-country') || incoming.get('cf-ipcountry') || '').trim();
  const ip = incoming.get('x-real-ip') || incoming.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const out: Record<string, string> = {};
  if (country) out['x-vercel-ip-country'] = country;
  if (ip) out['x-flexio-visitor-ip'] = ip;
  return out;
}
