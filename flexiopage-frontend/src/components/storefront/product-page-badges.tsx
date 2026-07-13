/**
 * Trust badges grid rendered on the product page. Seller-configured via
 * /dashboard/stores/[id]/sections (Page produit → Badges).
 *
 * Server Component — no interactivity needed.
 */

import {
  Truck, ShieldCheck, RefreshCcw, Lock, Headphones, Gift, Clock, Star, Leaf, Banknote,
} from 'lucide-react';
import type { ThemeTokens } from '@/data/store-themes';
import type { BadgeIcon, TrustBadge } from '@/lib/product-page-order';

const ICONS: Record<BadgeIcon, typeof Truck> = {
  truck: Truck,
  shield: ShieldCheck,
  refresh: RefreshCcw,
  lock: Lock,
  headset: Headphones,
  gift: Gift,
  clock: Clock,
  star: Star,
  leaf: Leaf,
  banknote: Banknote,
};

export function ProductPageBadges({
  badges,
  theme,
}: {
  badges: TrustBadge[];
  theme: ThemeTokens;
}) {
  if (!badges?.length) return null;
  return (
    <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))` }}>
      {badges.map((b, i) => {
        const Icon = ICONS[b.icon] || Truck;
        return (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border p-3 sm:p-4"
            style={{
              borderColor: theme.border,
              backgroundColor: theme.surface,
              borderRadius: theme.borderRadius === 'none' ? '0' : undefined,
            }}
          >
            {b.imageUrl ? (
              // Custom image badge — no tinted background, let the image
              // breathe (logo, sticker, etc.).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.imageUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-lg object-contain"
              />
            ) : (
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
                style={{ backgroundColor: `${theme.primary}1a`, color: theme.primary }}
              >
                <Icon className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight" style={{ color: theme.foreground }}>
                {b.label}
              </div>
              {b.sublabel && (
                <div className="mt-0.5 text-[11px]" style={{ color: theme.muted }}>
                  {b.sublabel}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
