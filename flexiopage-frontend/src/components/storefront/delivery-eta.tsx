'use client';

/**
 * Delivery ETA — displays the estimated arrival day + cutoff message once
 * the buyer has typed a city. Uses a static country→days table (base + max)
 * calibrated to MogaDelivery averages; the real ETA is confirmed after the
 * order is booked with the carrier.
 *
 * The value in showing it BEFORE the order is booked is conversion — a
 * concrete "livrée mardi" answer removes one of the biggest COD hesitations
 * ("est-ce que ça arrivera à temps ?").
 */

import { useMemo } from 'react';
import { Truck } from 'lucide-react';
import type { ThemeTokens } from '@/data/store-themes';

interface Props {
  city: string;
  countryCode: string;
  /** Show even before city is entered — falls back to country-level ETA. */
  showWithoutCity?: boolean;
  theme: ThemeTokens;
  radius: string;
}

// Base + max delivery days per country, calibrated to MogaDelivery averages.
// Big cities usually hit the lower bound; remote areas the upper. Kept
// intentionally coarse — a real per-city table would need a backend lookup
// and drift out of sync with carrier reality.
const ETA_TABLE: Record<string, { min: number; max: number }> = {
  SN: { min: 1, max: 3 },   // Sénégal
  CI: { min: 1, max: 3 },   // Côte d'Ivoire
  ML: { min: 2, max: 4 },   // Mali
  BF: { min: 2, max: 4 },   // Burkina Faso
  BJ: { min: 2, max: 4 },   // Bénin
  TG: { min: 2, max: 4 },   // Togo
  GN: { min: 2, max: 5 },   // Guinée
  NE: { min: 3, max: 5 },   // Niger
  GM: { min: 2, max: 4 },   // Gambie
  GH: { min: 2, max: 4 },   // Ghana
  NG: { min: 2, max: 5 },   // Nigeria
  CM: { min: 2, max: 5 },   // Cameroun
  MA: { min: 1, max: 3 },   // Maroc
  TN: { min: 1, max: 3 },   // Tunisie
  DZ: { min: 2, max: 4 },   // Algérie
  LY: { min: 3, max: 6 },   // Libye
  // Europe — longer, since MogaDelivery doesn't cover here yet.
  FR: { min: 3, max: 7 },
  IT: { min: 3, max: 7 },
  ES: { min: 3, max: 7 },
  BE: { min: 3, max: 7 },
  PT: { min: 3, max: 7 },
  DE: { min: 3, max: 7 },
  NL: { min: 3, max: 7 },
  CH: { min: 3, max: 7 },
};

const CUTOFF_HOUR = 15; // Orders before 15:00 local ship same-day

const WEEKDAY_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTH_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Add N working days (skip Sundays; simplification — many countries in the
 * region deliver Saturday). */
function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0) added++; // skip Sunday
  }
  return d;
}

function formatFrDay(d: Date): string {
  return `${WEEKDAY_FR[d.getDay()]} ${d.getDate()} ${MONTH_FR[d.getMonth()]}`;
}

export function DeliveryEta({ city, countryCode, showWithoutCity = false, theme, radius }: Props) {
  const range = ETA_TABLE[countryCode.toUpperCase()];
  const eta = useMemo(() => {
    if (!range) return null;
    const now = new Date();
    const afterCutoff = now.getHours() >= CUTOFF_HOUR;
    // Same-day shipping isn't guaranteed if past cutoff — push the start.
    const baseStart = afterCutoff ? addWorkingDays(now, 1) : now;
    const arrivalMin = addWorkingDays(baseStart, range.min);
    const arrivalMax = addWorkingDays(baseStart, range.max);
    return { arrivalMin, arrivalMax, afterCutoff };
  }, [range]);

  if (!range || !eta) return null;
  if (!city.trim() && !showWithoutCity) return null;

  const target = city.trim() || 'ta ville';
  const sameWindow = eta.arrivalMin.toDateString() === eta.arrivalMax.toDateString();
  const dayLabel = sameWindow
    ? formatFrDay(eta.arrivalMin)
    : `entre ${formatFrDay(eta.arrivalMin)} et ${formatFrDay(eta.arrivalMax)}`;

  return (
    <div
      className="flex items-start gap-2.5 border-l-2 p-3"
      style={{
        borderLeftColor: theme.primary,
        backgroundColor: theme.surfaceMuted,
        borderRadius: `0 ${radius} ${radius} 0`,
      }}
      role="status"
      aria-live="polite"
    >
      <Truck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: theme.primary }} />
      <div className="text-xs leading-relaxed" style={{ color: theme.foreground }}>
        <div>
          Livraison à <span className="font-semibold">{target}</span> —{' '}
          <span className="font-semibold" style={{ color: theme.primary }}>{dayLabel}</span>
        </div>
        <div className="mt-0.5" style={{ color: theme.muted }}>
          {eta.afterCutoff
            ? `Commande après ${CUTOFF_HOUR}h — expédition demain matin.`
            : `Commande avant ${CUTOFF_HOUR}h — expédition aujourd'hui.`}
        </div>
      </div>
    </div>
  );
}
