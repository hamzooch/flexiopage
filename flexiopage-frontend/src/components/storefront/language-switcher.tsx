'use client';

/**
 * Dropdown language switcher mounted in the storefront navbar. Writes
 * the chosen locale to localStorage and reloads the page so server
 * components re-render with the new dir/locale.
 *
 * Hydration: the trigger only shows the seller-configured default until
 * mounted, then swaps to the visitor's saved preference. Avoids flicker
 * because the dropdown is closed by default.
 */

import { useEffect, useState } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SUPPORTED_LOCALES,
  getPreferredLocale,
  setPreferredLocale,
  type StorefrontLocale,
} from '@/lib/storefront-i18n';

interface Props {
  storeSlug: string;
  defaultLocale?: string;
  className?: string;
}

export function LanguageSwitcher({ storeSlug, defaultLocale, className }: Props) {
  const [current, setCurrent] = useState<StorefrontLocale>(
    (defaultLocale as StorefrontLocale) || 'fr'
  );
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = getPreferredLocale(storeSlug, defaultLocale);
    if (stored) setCurrent(stored);
  }, [storeSlug, defaultLocale]);

  const active = SUPPORTED_LOCALES.find((l) => l.code === current) || SUPPORTED_LOCALES[0];

  function pick(loc: StorefrontLocale) {
    setOpen(false);
    if (loc === current) return;
    setPreferredLocale(storeSlug, loc);
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors hover:bg-black/5"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{active.flag} {active.code.toUpperCase()}</span>
        <span className="sm:hidden">{active.flag}</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && mounted && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <ul
            role="listbox"
            className="absolute right-0 top-full z-40 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-border bg-card shadow-lg"
          >
            {SUPPORTED_LOCALES.map((loc) => {
              const isOn = loc.code === current;
              return (
                <li key={loc.code}>
                  <button
                    type="button"
                    onClick={() => pick(loc.code)}
                    role="option"
                    aria-selected={isOn}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium transition-colors',
                      isOn ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                    )}
                  >
                    <span className="text-sm">{loc.flag}</span>
                    <span className="flex-1">{loc.label}</span>
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
