/**
 * Fire-and-forget revalidation trigger for the Next.js storefront cache.
 *
 * The storefront pages declare ISR with cache tags (`store:<slug>`,
 * `product:<slug>:<productSlug>`, etc.) and a 60s revalidate window.
 * Without this hook, a seller's edit would only become visible to
 * visitors after that window expires. Calling this after each write
 * collapses the window to ~0 while keeping the cache for everything else.
 *
 * Behavior: never throws, never awaits — controllers must not be slowed
 * down by a revalidation call. If the env isn't configured we silently
 * skip (e.g. local backend talking to a dev that doesn't care).
 */
import axios from 'axios';
import { logger } from './logger';

const URL = process.env.FRONTEND_REVALIDATE_URL;
const SECRET = process.env.REVALIDATE_SECRET;

export function notifyRevalidate(tags: string | string[]): void {
  if (!URL || !SECRET) return; // Not wired up — no-op.
  const list = Array.isArray(tags) ? tags : [tags];
  if (list.length === 0) return;

  // We deliberately don't await — the caller's HTTP response should not
  // wait on a downstream cache ping. Errors are logged at debug level so
  // a missing/restarting frontend doesn't spam the logs.
  axios
    .post(URL, { tags: list, secret: SECRET }, { timeout: 2000 })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.debug({ err: msg, tags: list }, '[revalidate] frontend ping failed');
    });
}
