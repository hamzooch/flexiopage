'use client';

/**
 * Buy-now CTA for physical products. Smoothly scrolls to the inline COD
 * form (#cod-order-form) and focuses the first input so the buyer can start
 * typing immediately.
 *
 * Rendered inline on the product page above the form. Server component
 * passes its theme-driven className/style.
 */

import type { CSSProperties, ReactNode } from 'react';

interface Props {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function CodCtaButton({ className, style, children }: Props) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const form = document.getElementById('cod-order-form');
    if (!form) return;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Wait for the scroll to roughly finish before focusing — focusing too
    // early causes the browser to jump-scroll and override our smooth one.
    window.setTimeout(() => {
      const firstInput = form.querySelector<HTMLInputElement>('input:not([type="hidden"]), select, textarea');
      firstInput?.focus({ preventScroll: true });
    }, 450);
  }

  return (
    <button type="button" onClick={handleClick} className={className} style={style}>
      {children}
    </button>
  );
}
