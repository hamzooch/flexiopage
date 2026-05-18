'use client';

/**
 * Mobile sticky "Commander" bar — fixed to the bottom of the viewport on
 * mobile when the COD form is offscreen. Tap → smooth-scroll to the form
 * + focus its first field so the keyboard pops up on phones.
 *
 * Why this pattern (vs always-on): an always-visible bar burns the
 * urgency. Showing it only after the buyer has scrolled past the form
 * means "you're getting away — here's another chance" which converts
 * better. Same trick Shopify Dawn + every YouCan theme uses.
 *
 * Hidden on tablet/desktop (lg breakpoint) because the COD form there
 * is already sticky in a 2-column layout — a bottom bar would be noise.
 */

import { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { formatCurrency, mediaUrl } from '@/lib/utils';

interface Props {
  productName: string;
  productImage?: string;
  /** Current price — receives the bundle-discounted unit price when applicable. */
  price: number;
  currency: string;
  /** id of the form element we should reveal when tapped. Defaults to "cod-order-form". */
  targetId?: string;
  /** Hex for the CTA button bg — falls back to theme primary CSS var. */
  accentColor?: string;
  /** Hex for the CTA button text. */
  accentForeground?: string;
  /** "Commander" / "اطلب الآن" — overridable so it matches the seller's COD form. */
  ctaLabel?: string;
}

export function MobileStickyCta({
  productName,
  productImage,
  price,
  currency,
  targetId = 'cod-order-form',
  accentColor,
  accentForeground,
  ctaLabel = 'Commander',
}: Props) {
  // The bar only shows once the form has scrolled out of view, so we
  // observe its visibility with an IntersectionObserver. While the form
  // is on-screen we keep the bar hidden — no noise.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) {
      // Form not on this page — bar stays hidden so we don't ship dead UI.
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        // When the form leaves the viewport we surface the bar; when it
        // comes back we hide it again (less visual noise + no risk of
        // double-CTA hijack with the in-form submit button).
        setVisible(!entry.isIntersecting);
      },
      // Tiny negative margin avoids flicker around the boundary.
      { threshold: 0.05, rootMargin: '0px 0px -10% 0px' }
    );
    obs.observe(target);
    return () => obs.disconnect();
  }, [targetId]);

  function scrollToForm() {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Focus the first text input after the scroll settles so the mobile
    // keyboard pops up — saves the buyer one tap.
    window.setTimeout(() => {
      const first = target.querySelector<HTMLInputElement>('input:not([type="hidden"])');
      first?.focus({ preventScroll: true });
    }, 450);
  }

  return (
    <div
      aria-hidden={!visible}
      className={
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 transition-all duration-300 lg:hidden ' +
        (visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0')
      }
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        className={
          'pointer-events-auto flex items-center gap-3 border-t bg-background/95 px-3 py-2.5 shadow-[0_-6px_18px_rgba(0,0,0,0.08)] backdrop-blur ' +
          (visible ? '' : 'pointer-events-none')
        }
      >
        {productImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={mediaUrl(productImage) || productImage}
            alt=""
            className="h-11 w-11 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-muted">
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold leading-tight">{productName}</div>
          <div className="text-[11px] font-bold text-primary leading-tight">
            {formatCurrency(price, currency)}
          </div>
        </div>
        <button
          type="button"
          onClick={scrollToForm}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold shadow-sm transition-transform active:scale-95"
          style={{
            backgroundColor: accentColor || 'var(--color-primary, #7c3aed)',
            color: accentForeground || 'var(--color-primary-fg, #ffffff)',
          }}
        >
          <ShoppingBag className="h-4 w-4" />
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
