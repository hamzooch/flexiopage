'use client';

/**
 * Tiny client-only effect: reads the visitor's saved locale on mount
 * and applies dir/lang to <html> so the page flips RTL without waiting
 * for the next SSR pass. Returns null — pure side-effect component.
 */

import { useEffect } from 'react';
import { bootstrapLocaleDir } from '@/lib/storefront-i18n';

export function LocaleBootstrap({ storeSlug, defaultLocale }: { storeSlug: string; defaultLocale?: string }) {
  useEffect(() => {
    bootstrapLocaleDir(storeSlug, defaultLocale);
  }, [storeSlug, defaultLocale]);
  return null;
}
