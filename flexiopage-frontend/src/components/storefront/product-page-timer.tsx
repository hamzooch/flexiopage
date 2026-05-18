'use client';

/**
 * Countdown timer rendered on the product page when the seller enables
 * "Timer / urgence" in /dashboard/stores/[id]/sections (Page produit).
 *
 * Pure client component — re-renders every second via setInterval. When
 * the deadline passes, the block self-removes (returns null) so a stale
 * promo doesn't haunt the page forever.
 */

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface Props {
  /** ISO date string — the absolute deadline. */
  endsAt: string;
  headline?: string;
  accentColor: string;
}

function partsFromDelta(ms: number) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const days  = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins  = Math.floor((totalSec % 3600) / 60);
  const secs  = totalSec % 60;
  return { days, hours, mins, secs };
}

export function ProductPageTimer({ endsAt, headline, accentColor }: Props) {
  const target = new Date(endsAt).getTime();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (Number.isNaN(target)) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  if (Number.isNaN(target)) return null;
  const delta = target - now;
  if (delta <= 0) return null; // expired — hide the block silently

  const { days, hours, mins, secs } = partsFromDelta(delta);
  const blocks = [
    { v: days,  label: 'Jours' },
    { v: hours, label: 'Heures' },
    { v: mins,  label: 'Min' },
    { v: secs,  label: 'Sec' },
  ];

  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl border p-4 sm:flex-row sm:justify-between sm:p-5"
      style={{ borderColor: `${accentColor}40`, backgroundColor: `${accentColor}0d` }}
    >
      <div className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: accentColor }}>
        <Clock className="h-4 w-4" />
        {headline || 'Offre limitée — finit dans :'}
      </div>
      <div className="flex items-center gap-1.5">
        {blocks.map((b, i) => (
          <div key={b.label} className="flex items-center gap-1.5">
            <div
              className="flex flex-col items-center rounded-md px-2.5 py-1.5 tabular-nums"
              style={{ backgroundColor: accentColor, color: '#fff', minWidth: 44 }}
            >
              <span className="text-base font-extrabold leading-none">{String(b.v).padStart(2, '0')}</span>
              <span className="mt-0.5 text-[9px] font-medium uppercase opacity-80">{b.label}</span>
            </div>
            {i < blocks.length - 1 && (
              <span className="text-base font-bold" style={{ color: accentColor }} aria-hidden>
                :
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
