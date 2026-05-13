'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true when the viewport is narrower than `breakpoint` pixels.
 * Defaults to Tailwind's `sm` (640px). SSR-safe — defaults to `false` on
 * server so the desktop render is the initial paint, avoiding hydration
 * flicker on the most common case.
 */
export function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [breakpoint]);
  return isMobile;
}
