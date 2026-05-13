'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts from 0 → `target` over `durationMs` once `start` flips true.
 * Uses requestAnimationFrame with an ease-out cubic so big numbers feel
 * snappy and small numbers don't hang at 0.
 *
 * Useful for hero stats sections — pair with framer-motion's `useInView` so
 * the count only starts when the element scrolls into view.
 */
export function useCountUp(target: number, start: boolean, durationMs = 1500): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!start || startedRef.current || target === 0) {
      if (!start) setValue(0);
      return;
    }
    startedRef.current = true;
    const t0 = performance.now();

    const tick = (now: number) => {
      const elapsed = now - t0;
      const ratio = Math.min(elapsed / durationMs, 1);
      // ease-out cubic — fast start, gentle finish
      const eased = 1 - Math.pow(1 - ratio, 3);
      setValue(Math.round(target * eased));
      if (ratio < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [start, target, durationMs]);

  return value;
}
