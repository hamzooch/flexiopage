'use client';

/**
 * Secondary "Ajouter au panier" CTA shown alongside the inline COD form.
 * Quick-buy via the COD form stays the primary action; this button gives
 * buyers who want to grab several items before checking out an explicit
 * pathway.
 *
 * Visual flash on click (label flips to "✓ Ajouté !") so the action feels
 * acknowledged without leaving the product page.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addToCart, getCartCount } from '@/lib/cart';
import type { ThemeTokens } from '@/data/store-themes';

interface Props {
  storeSlug: string;
  product: {
    id: string;
    slug: string;
    name: string;
    image?: string;
    price: number;
    currency: string;
  };
  /** Selected variant name when the product has variants. */
  variantName?: string;
  theme: ThemeTokens;
  radius: string;
}

export function AddToCartButton({ storeSlug, product, variantName, theme, radius }: Props) {
  const [justAdded, setJustAdded] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    setCartCount(getCartCount(storeSlug));
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ storeSlug: string }>).detail;
      if (detail && detail.storeSlug !== storeSlug) return;
      setCartCount(getCartCount(storeSlug));
    }
    window.addEventListener('flexio:cart', onChange as EventListener);
    return () => window.removeEventListener('flexio:cart', onChange as EventListener);
  }, [storeSlug]);

  function add() {
    addToCart(storeSlug, {
      id: product.id,
      slug: product.slug,
      name: product.name,
      image: product.image,
      price: product.price,
      currency: product.currency,
      variantName,
    }, 1);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1800);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={add}
        className={cn(
          'inline-flex h-12 flex-1 items-center justify-center gap-2 border-2 px-5 text-sm font-bold transition-all active:scale-[0.99]',
          justAdded ? 'border-emerald-500 bg-emerald-500/10' : 'hover:scale-[1.01]'
        )}
        style={{
          borderRadius: radius,
          borderColor: justAdded ? '#10b981' : theme.primary,
          color: justAdded ? '#047857' : theme.primary,
          backgroundColor: justAdded ? undefined : 'transparent',
        }}
      >
        {justAdded ? (
          <>
            <Check className="h-4 w-4" />
            Ajouté au panier !
          </>
        ) : (
          <>
            <ShoppingBag className="h-4 w-4" />
            Ajouter au panier
          </>
        )}
      </button>
      {cartCount > 0 && (
        <Link
          href={`/${storeSlug}/cart`}
          className="inline-flex h-12 items-center gap-1.5 border-2 px-3 text-xs font-semibold transition-colors hover:bg-muted/40"
          style={{
            borderRadius: radius,
            borderColor: theme.border,
            color: theme.foreground,
          }}
          aria-label={`Voir le panier (${cartCount} article${cartCount > 1 ? 's' : ''})`}
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          {cartCount}
        </Link>
      )}
    </div>
  );
}
