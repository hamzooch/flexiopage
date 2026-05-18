'use client';

/**
 * Heart toggle for product cards + product page. LocalStorage-backed via
 * `lib/wishlist`. Listens to the global flexio:wishlist event so every
 * heart on the page syncs when one is toggled.
 */

import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isInWishlist, toggleWishlist, type WishlistItem } from '@/lib/wishlist';

interface Props {
  storeSlug: string;
  item: Omit<WishlistItem, 'addedAt'>;
  /** Size variant: `sm` for cards, `md` for the product page hero. */
  size?: 'sm' | 'md';
  className?: string;
}

export function WishlistButton({ storeSlug, item, size = 'sm', className }: Props) {
  const [active, setActive] = useState(false);
  // Hydration guard — server doesn't know localStorage state.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setActive(isInWishlist(storeSlug, item.id));
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ storeSlug: string }>).detail;
      if (detail && detail.storeSlug !== storeSlug) return;
      setActive(isInWishlist(storeSlug, item.id));
    }
    window.addEventListener('flexio:wishlist', onChange as EventListener);
    return () => window.removeEventListener('flexio:wishlist', onChange as EventListener);
  }, [storeSlug, item.id]);

  function onClick(e: React.MouseEvent) {
    // Don't bubble the click to a wrapping <Link> on product cards.
    e.preventDefault();
    e.stopPropagation();
    const next = toggleWishlist(storeSlug, item);
    setActive(next);
  }

  const small = size === 'sm';
  const dim = small ? 'h-8 w-8' : 'h-11 w-11';
  const iconDim = small ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      title={active ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      className={cn(
        'grid shrink-0 place-items-center rounded-full transition-all',
        dim,
        active
          ? 'bg-rose-500 text-white shadow-md shadow-rose-500/40'
          : 'bg-white/90 text-slate-700 shadow-sm hover:bg-white hover:text-rose-500',
        className
      )}
      style={{ backdropFilter: 'blur(4px)' }}
    >
      <Heart
        className={cn(iconDim, mounted && active ? 'fill-current' : '')}
        strokeWidth={mounted && active ? 2 : 2}
      />
    </button>
  );
}
