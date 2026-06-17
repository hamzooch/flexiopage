'use client';

/**
 * Public wishlist page — reads localStorage and lists every item the
 * visitor has hearted. Pure client component because the source is
 * client-only; the surrounding layout (navbar/footer/whatsapp) is
 * already server-rendered by the parent layout.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Heart, ShoppingBag, Trash2 } from 'lucide-react';
import { formatCurrency, mediaUrl } from '@/lib/utils';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  clearWishlist,
  getWishlist,
  removeFromWishlist,
  type WishlistItem,
} from '@/lib/wishlist';

export default function WishlistPage() {
  const params = useParams();
  const storeSlug = params.storeSlug as string;
  const confirm = useConfirm();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(() => {
    setItems(getWishlist(storeSlug));
  }, [storeSlug]);

  useEffect(() => {
    setMounted(true);
    refresh();
    // Re-render whenever the wishlist changes elsewhere (e.g. heart icons
    // on a card in another tab dispatching the same custom event).
    window.addEventListener('flexio:wishlist', refresh);
    return () => window.removeEventListener('flexio:wishlist', refresh);
  }, [refresh]);

  function remove(productId: string) {
    removeFromWishlist(storeSlug, productId);
    refresh();
  }

  async function clearAll() {
    const ok = await confirm({
      title: 'Vider la liste de favoris ?',
      description: 'Tous tes coups de cœur seront retirés. Tu pourras toujours en ajouter de nouveaux.',
      confirmLabel: 'Vider',
      tone: 'destructive',
    });
    if (!ok) return;
    clearWishlist(storeSlug);
    refresh();
  }

  if (!mounted) {
    // Avoid SSR hydration flicker — the list comes from localStorage.
    return <div className="mx-auto max-w-5xl px-4 py-16 text-center text-sm text-muted-foreground">…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-rose-700">
            <Heart className="h-3 w-3 fill-current" />
            Mes favoris
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-4xl">
            {items.length === 0
              ? 'Aucun favori pour le moment'
              : `${items.length} produit${items.length > 1 ? 's' : ''} en favori`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Les favoris sont conservés sur ton navigateur — ils disparaissent si tu effaces les cookies.
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:border-rose-500/40 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Tout retirer
          </button>
        )}
      </header>

      {items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
          <Heart className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-base font-semibold">Aucun favori</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Clique sur le cœur d&apos;un produit pour le garder ici. Tu pourras le retrouver d&apos;un coup d&apos;œil.
          </p>
          <Link
            href={`/${storeSlug}`}
            className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-md"
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            Voir les produits
          </Link>
        </div>
      ) : (
        <ul
          className="mt-8 grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
        >
          {items.map((p) => (
            <li
              key={p.id}
              className="relative overflow-hidden rounded-xl border border-border/60 bg-card transition-transform hover:-translate-y-0.5"
            >
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-rose-500 shadow-sm transition-colors hover:bg-rose-500 hover:text-white"
                aria-label="Retirer"
                title="Retirer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <Link href={`/${storeSlug}/product/${p.slug}`} className="block">
                <div className="aspect-square overflow-hidden bg-muted">
                  {p.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={mediaUrl(p.image) || p.image}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-muted-foreground">
                      Pas d&apos;image
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</h3>
                  <div className="text-sm font-extrabold text-primary">
                    {formatCurrency(p.price, p.currency)}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
