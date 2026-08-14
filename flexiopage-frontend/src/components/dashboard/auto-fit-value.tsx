'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Affiche la valeur d'une stat sur UNE seule ligne, entière, quel que soit
 * l'écran : si le chiffre (ex. 1 000 000 XOF) dépasse la largeur de la carte,
 * il est réduit visuellement (transform scale) juste ce qu'il faut pour tenir
 * — jamais de retour à la ligne ni de troncature « 1 000 0… ».
 */
export function AutoFitValue({ className, children }: { className?: string; children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const fit = () => {
      const avail = outer.clientWidth;
      // scrollWidth ignore le transform → mesure stable, pas de boucle.
      const needed = inner.scrollWidth;
      setScale(needed > avail && needed > 0 ? Math.max(avail / needed, 0.45) : 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div ref={outerRef} className={cn('min-w-0 overflow-hidden', className)}>
      <span
        ref={innerRef}
        className="inline-block whitespace-nowrap"
        style={scale < 1 ? { transform: `scale(${scale})`, transformOrigin: 'left center' } : undefined}
      >
        {children}
      </span>
    </div>
  );
}
