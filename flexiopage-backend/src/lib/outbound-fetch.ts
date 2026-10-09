import dns from 'node:dns';

// Cette machine résout fal.ai d'abord en IPv6 NAT64 (64:ff9b / 64:ff9c).
// Node s'y connecte, le délai expire, et toute la landing meurt sur
// "fetch failed". curl, lui, prend l'IPv4. On aligne Node.
dns.setDefaultResultOrder('ipv4first');

const TRANSIENT = /fetch failed|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE/;

export function isTransientNetworkError(err: unknown): boolean {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (!e || e.name === 'AbortError') return false;
  const blob = `${e.message || ''} ${e.cause?.code || ''} ${e.cause?.message || ''}`;
  return TRANSIENT.test(blob);
}

/** fetch avec 2 nouvelles tentatives sur coupure réseau. Les 4xx/5xx restent au caller. */
export async function fetchWithRetry(
  input: string,
  init?: RequestInit,
  retries = 2,
): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      last = err;
      if (!isTransientNetworkError(err) || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw last;
}
