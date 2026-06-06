/**
 * Backend-triggered cache invalidation for the storefront ISR pages.
 *
 * Storefront pages (`/store/[slug]/...`) declare cache tags like
 * `store:<slug>`, `product:<slug>:<prodSlug>`, etc. When a seller saves
 * a product/store/page/collection, the backend POSTs here with the
 * affected tags and a shared secret so we drop the cached HTML
 * immediately instead of waiting for the 60s ISR window.
 *
 * Auth: shared secret (REVALIDATE_SECRET). Not user-facing — the only
 * caller is our own backend.
 */
import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

// Always run on the server, never cached. This is a write/admin endpoint.
export const dynamic = 'force-dynamic';

interface Body {
  tags?: unknown;
  secret?: unknown;
}

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Revalidation not configured' }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.secret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tags = Array.isArray(body.tags)
    ? body.tags.filter((t): t is string => typeof t === 'string' && t.length > 0)
    : [];
  if (tags.length === 0) {
    return NextResponse.json({ error: 'No tags' }, { status: 400 });
  }

  for (const tag of tags) revalidateTag(tag);

  return NextResponse.json({ revalidated: tags });
}
