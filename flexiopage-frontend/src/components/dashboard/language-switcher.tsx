'use client';

import { useEffect, useState } from 'react';
import { Check, Languages } from 'lucide-react';
import { LANGUAGES, useLangStore, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Small dropdown that switches the dashboard chrome language.
 * Persists the choice via `useLangStore` (localStorage) and applies
 * `dir="rtl"` + `lang="…"` on the <html> tag globally.
 */
export function LanguageSwitcher() {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  const [open, setOpen] = useState(false);

  const active = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  // Close on outside click — a simple capture-phase listener avoids the
  // onBlur/focus dance and works on mobile taps too.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-lang-switcher]')) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function choose(code: Lang) {
    setLang(code);
    setOpen(false);
  }

  return (
    <div className="relative" data-lang-switcher>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border/70 bg-card/60 px-2.5 text-sm transition-all hover:border-primary/40 hover:bg-card"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={active.label}
      >
        <Languages className="h-4 w-4 text-muted-foreground" />
        <span className="text-base leading-none">{active.flag}</span>
        <span className="hidden text-xs font-semibold uppercase tracking-wider sm:inline">{active.code}</span>
      </button>

      <div
        role="listbox"
        className={cn(
          'absolute right-0 top-12 z-30 w-44 origin-top-right rounded-2xl border border-border/70 bg-card p-1.5 shadow-xl shadow-foreground/5 transition-all',
          open ? 'pointer-events-auto translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
        )}
      >
        {LANGUAGES.map((l) => {
          const isActive = l.code === lang;
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => choose(l.code)}
              role="option"
              aria-selected={isActive}
              className={cn(
                'flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-primary/10 text-foreground' : 'text-foreground/80 hover:bg-muted'
              )}
            >
              <span className="inline-flex items-center gap-2.5">
                <span className="text-base leading-none">{l.flag}</span>
                <span className="font-medium">{l.nativeName}</span>
              </span>
              {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
