/**
 * Product social proof — small strip rendered under the product title.
 *
 * Currently surfaces:
 *  - "Boutique vérifiée" pill when the store owns a verified custom domain
 *    (customDomainVerified === true). A verified custom domain is the
 *    strongest platform-visible signal that the seller is not a squatter.
 *
 * Left intentionally small so it can grow (real delivered-order count,
 * repeat-buyer count, "last order X min ago") without a redesign.
 */

import { BadgeCheck } from 'lucide-react';
import type { ThemeTokens } from '@/data/store-themes';

interface Props {
  storeVerified?: boolean;
  storeName: string;
  theme: ThemeTokens;
}

export function ProductSocialProof({ storeVerified, storeName, theme }: Props) {
  if (!storeVerified) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
        style={{
          backgroundColor: `${theme.primary}15`,
          color: theme.primary,
        }}
        title={`${storeName} a vérifié son domaine — c'est bien la boutique officielle.`}
      >
        <BadgeCheck className="h-3.5 w-3.5" />
        Boutique vérifiée
      </span>
    </div>
  );
}
