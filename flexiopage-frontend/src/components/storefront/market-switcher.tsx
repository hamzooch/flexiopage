'use client';

/**
 * Sélecteur pays côté storefront. Persiste le choix dans le cookie
 * `fp_market_country` (lu côté backend par `resolveMarketForRequest`) puis
 * recharge la page pour que les server components re-fetchent avec le bon
 * market (prix locaux, devise, frais de livraison).
 *
 * Affiché uniquement quand la boutique a ≥ 2 marchés activés — sinon il n'y
 * a aucun choix à offrir au buyer.
 */
import { useEffect, useState } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const MARKET_COOKIE = 'fp_market_country';

export interface PublicMarket {
  country: string;
  currency: string;
  isDefault?: boolean;
  enabled?: boolean;
  shippingFee?: number;
}

interface Props {
  markets: PublicMarket[];
  /** Pays actuellement résolu côté backend pour pré-cocher l'option active. */
  currentCountry?: string;
  className?: string;
}

const FLAG: Record<string, string> = {
  CI: '🇨🇮', SN: '🇸🇳', BF: '🇧🇫', ML: '🇲🇱', TG: '🇹🇬', BJ: '🇧🇯', NE: '🇳🇪',
  CM: '🇨🇲', GA: '🇬🇦', CG: '🇨🇬', CD: '🇨🇩',
  MA: '🇲🇦', TN: '🇹🇳', DZ: '🇩🇿', LY: '🇱🇾', MR: '🇲🇷', EG: '🇪🇬',
  NG: '🇳🇬', GH: '🇬🇭', KE: '🇰🇪', ZA: '🇿🇦', ET: '🇪🇹',
  SA: '🇸🇦', AE: '🇦🇪', QA: '🇶🇦', KW: '🇰🇼', BH: '🇧🇭', OM: '🇴🇲', JO: '🇯🇴',
  LB: '🇱🇧', IQ: '🇮🇶', YE: '🇾🇪', SD: '🇸🇩',
  FR: '🇫🇷', BE: '🇧🇪', DE: '🇩🇪', ES: '🇪🇸', IT: '🇮🇹', PT: '🇵🇹', NL: '🇳🇱',
  CH: '🇨🇭', GB: '🇬🇧', TR: '🇹🇷',
  US: '🇺🇸', CA: '🇨🇦', MX: '🇲🇽', BR: '🇧🇷',
  IN: '🇮🇳', CN: '🇨🇳', JP: '🇯🇵', ID: '🇮🇩', MY: '🇲🇾',
};

function setCookie(value: string): void {
  // 1 an de persistance — équivalent au switcher de langue.
  document.cookie = `${MARKET_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export function MarketSwitcher({ markets, currentCountry, className }: Props) {
  const enabled = markets.filter((m) => m.enabled !== false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<string>(
    () =>
      (currentCountry || '').toUpperCase() ||
      enabled.find((m) => m.isDefault)?.country ||
      enabled[0]?.country ||
      '',
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (enabled.length < 2) return null;

  function pick(country: string) {
    setOpen(false);
    if (country === active) return;
    setActive(country);
    setCookie(country);
    // Reload pour que les server components re-fetchent avec le nouveau
    // cookie côté backend (prix/devise/frais de livraison du market choisi).
    if (typeof window !== 'undefined') window.location.reload();
  }

  const activeMarket = enabled.find((m) => m.country.toUpperCase() === active.toUpperCase()) || enabled[0];
  const flag = FLAG[activeMarket.country.toUpperCase()] || '🌍';

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors hover:bg-black/5"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Changer de pays"
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{flag} {activeMarket.country.toUpperCase()}</span>
        <span className="sm:hidden">{flag}</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && mounted && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <ul
            role="listbox"
            className="absolute right-0 top-full z-40 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-border bg-card shadow-lg"
          >
            {enabled.map((m) => {
              const code = m.country.toUpperCase();
              const isOn = code === active.toUpperCase();
              return (
                <li key={code}>
                  <button
                    type="button"
                    onClick={() => pick(code)}
                    role="option"
                    aria-selected={isOn}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium transition-colors',
                      isOn ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                    )}
                  >
                    <span className="text-sm">{FLAG[code] || '🌍'}</span>
                    <span className="flex-1">{code}</span>
                    <span className="text-[10px] text-muted-foreground">{m.currency}</span>
                    {isOn && <Check className="h-3 w-3" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
