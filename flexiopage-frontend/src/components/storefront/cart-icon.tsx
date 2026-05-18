'use client';

/**
 * Storefront cart icon shown in the navbar. Click → `/[storeSlug]/cart`.
 * Listens to the flexio:cart custom event so the badge count refreshes
 * the moment a buyer adds an item from any product card / page.
 *
 * Server-rendered placeholder (no badge) on first paint to avoid the
 * Next.js hydration mismatch — localStorage isn't accessible server-side.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCartCount } from '@/lib/cart';

interface Props {
  storeSlug: string;
  /** Foreground color — usually the same as the navbar text color. */
  color?: string;
  /** "bold" variant uses uppercase + heavier weight to match isBold themes. */
  variant?: 'standard' | 'bold';
}

export function CartIcon({ storeSlug, color, variant = 'standard' }: Props) {
  const [count, setCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCount(getCartCount(storeSlug));
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ storeSlug: string }>).detail;
      if (detail && detail.storeSlug !== storeSlug) return;
      setCount(getCartCount(storeSlug));
    }
    window.addEventListener('flexio:cart', onChange as EventListener);
    return () => window.removeEventListener('flexio:cart', onChange as EventListener);
  }, [storeSlug]);

  const showBadge = mounted && count > 0;

  return (
    <Link
      href={`/${storeSlug}/cart`}
      aria-label={`Panier${showBadge ? ` (${count})` : ''}`}
      className={cn(
        'relative inline-flex h-9 items-center gap-1.5 rounded-md px-2 transition-colors hover:bg-black/5',
        variant === 'bold' && 'text-xs uppercase tracking-wider font-bold'
      )}
      style={color ? { color } : undefined}
    >
      <ShoppingBag className={variant === 'bold' ? 'h-4 w-4' : 'h-[18px] w-[18px]'} />
      {/* Label is hidden on small screens — the icon alone is enough.
          On md+ we show "Panier" to keep parity with the old text link. */}
      <span className="hidden text-sm font-medium md:inline">Panier</span>
      {showBadge && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
