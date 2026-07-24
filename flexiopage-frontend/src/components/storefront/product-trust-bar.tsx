/**
 * Trust bar — a compact row of guarantees rendered just above the CTA.
 *
 * Different from the reorderable badges section (which is a full-width strip
 * further down the page): this one sits inline in the right-column sticky
 * details, right before the buyer looks at the button, so the reassurance
 * lands at the moment of hesitation.
 *
 * Server component — pure display, no interaction.
 */

import { CheckCircle2, RotateCcw, MessageCircle, Truck } from 'lucide-react';
import type { ThemeTokens } from '@/data/store-themes';

interface TrustItem {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
}

interface Props {
  theme: ThemeTokens;
  radius: string;
  /** Seller-configurable overrides — falls back to sensible defaults for
   *  West Africa / Maghreb COD. */
  returnDays?: number;
  whatsappNumber?: string;
  /** Hide items the seller doesn't offer (e.g. no returns, no whatsapp). */
  showCod?: boolean;
  showReturns?: boolean;
  showWhatsapp?: boolean;
  showDelivery?: boolean;
}

export function ProductTrustBar({
  theme,
  radius,
  returnDays = 14,
  whatsappNumber,
  showCod = true,
  showReturns = true,
  showWhatsapp = true,
  showDelivery = true,
}: Props) {
  const items: TrustItem[] = [];
  if (showCod) items.push({ icon: CheckCircle2, label: 'Paiement à la livraison' });
  if (showReturns) items.push({ icon: RotateCcw, label: `Retour ${returnDays} jours` });
  if (showDelivery) items.push({ icon: Truck, label: 'Livraison MogaDelivery' });
  if (showWhatsapp && whatsappNumber) items.push({ icon: MessageCircle, label: 'Support WhatsApp' });

  if (items.length === 0) return null;

  return (
    <ul
      className="grid gap-2 sm:grid-cols-2"
      style={{
        // The trust bar uses a subtle divided grid so it doesn't compete
        // with the CTA color-wise but still reads as a distinct block.
      }}
    >
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <li
            key={i}
            className="flex items-center gap-2 px-3 py-2"
            style={{
              backgroundColor: theme.surfaceMuted,
              border: `1px solid ${theme.border}`,
              borderRadius: radius,
            }}
          >
            <Icon className="h-4 w-4 shrink-0" style={{ color: theme.primary }} />
            <span className="text-xs font-medium leading-snug" style={{ color: theme.foreground }}>
              {it.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
