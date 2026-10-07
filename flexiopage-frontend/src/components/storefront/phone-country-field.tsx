'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PhoneCountry {
  code: string;
  name: string;
  phonePrefix: string;
}

/** Pays déjà couverts par le paiement Mobile Money / carte. */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: 'SN', name: 'Sénégal', phonePrefix: '+221' },
  { code: 'CI', name: 'Côte d’Ivoire', phonePrefix: '+225' },
  { code: 'ML', name: 'Mali', phonePrefix: '+223' },
  { code: 'BF', name: 'Burkina Faso', phonePrefix: '+226' },
  { code: 'BJ', name: 'Bénin', phonePrefix: '+229' },
  { code: 'TG', name: 'Togo', phonePrefix: '+228' },
  { code: 'GN', name: 'Guinée', phonePrefix: '+224' },
  { code: 'NE', name: 'Niger', phonePrefix: '+227' },
  { code: 'GM', name: 'Gambie', phonePrefix: '+220' },
  { code: 'GH', name: 'Ghana', phonePrefix: '+233' },
  { code: 'NG', name: 'Nigeria', phonePrefix: '+234' },
  { code: 'CM', name: 'Cameroun', phonePrefix: '+237' },
  { code: 'MA', name: 'Maroc', phonePrefix: '+212' },
  { code: 'TN', name: 'Tunisie', phonePrefix: '+216' },
  { code: 'DZ', name: 'Algérie', phonePrefix: '+213' },
  { code: 'LY', name: 'Libye', phonePrefix: '+218' },
  { code: 'IT', name: 'Italie', phonePrefix: '+39' },
  { code: 'ES', name: 'Espagne', phonePrefix: '+34' },
  { code: 'FR', name: 'France', phonePrefix: '+33' },
  { code: 'BE', name: 'Belgique', phonePrefix: '+32' },
  { code: 'PT', name: 'Portugal', phonePrefix: '+351' },
  { code: 'DE', name: 'Allemagne', phonePrefix: '+49' },
  { code: 'NL', name: 'Pays-Bas', phonePrefix: '+31' },
  { code: 'CH', name: 'Suisse', phonePrefix: '+41' },
];

const LOCAL_PLACEHOLDER: Record<string, string> = {
  SN: '77 000 00 00',
  CI: '07 00 00 00 00',
  ML: '70 00 00 00',
  BF: '70 00 00 00',
  BJ: '97 00 00 00',
  TG: '90 00 00 00',
  GN: '620 00 00 00',
  NE: '90 00 00 00',
  GM: '300 00 00',
  GH: '24 000 0000',
  NG: '803 000 0000',
  CM: '6 00 00 00 00',
  MA: '6 12 34 56 78',
  TN: '20 123 456',
  DZ: '5 12 34 56 78',
  FR: '6 12 34 56 78',
  BE: '470 12 34 56',
  DE: '151 23456789',
};

export function phoneCountryByCode(code: string | undefined | null): PhoneCountry | undefined {
  const normalized = (code || '').trim().toUpperCase();
  if (!normalized) return undefined;
  return PHONE_COUNTRIES.find((c) => c.code === normalized);
}

/** Pays proposé : géoloc de l’acheteur, sinon pays de la boutique, sinon Sénégal. */
export function defaultPhoneCountry(geoCountry?: string | null, storeCountry?: string | null): string {
  return (
    phoneCountryByCode(geoCountry)?.code ||
    phoneCountryByCode(storeCountry)?.code ||
    'SN'
  );
}

/** Indicatif + numéro local. Un collage déjà international n’est pas doublé. */
export function joinPhone(prefix: string, localPhone: string): string {
  const cleaned = localPhone.trim();
  if (!cleaned) return '';
  const compact = cleaned.replace(/\s/g, '');
  const prefixCompact = prefix.replace(/\s/g, '');
  if (cleaned.startsWith('+') || (prefixCompact && compact.startsWith(prefixCompact))) return cleaned;
  return `${prefix} ${cleaned}`.trim();
}

function flagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 2)
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

export function PhoneCountryField({
  id,
  value,
  onChange,
  country,
  onCountryChange,
  error,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  country: string;
  onCountryChange: (code: string) => void;
  error?: string;
  describedBy?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = phoneCountryByCode(country) || PHONE_COUNTRIES[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PHONE_COUNTRIES;
    return PHONE_COUNTRIES.filter((c) =>
      `${c.name} ${c.code} ${c.phonePrefix}`.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <div
        className={cn(
          'flex h-12 w-full min-w-0 overflow-hidden rounded-xl border bg-background focus-within:ring-4',
          error
            ? 'border-rose-400 focus-within:border-rose-400 focus-within:ring-rose-100 dark:focus-within:ring-rose-950'
            : 'border-input focus-within:border-primary/40 focus-within:ring-primary/10',
        )}
      >
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            setOpen((current) => !current);
            setQuery('');
          }}
          className="flex shrink-0 items-center gap-1.5 border-r border-input px-3 text-sm font-medium"
        >
          <span className="text-base leading-none" aria-hidden>
            {flagEmoji(selected.code)}
          </span>
          <span>{selected.phonePrefix}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value.replace(/[^\d\s-]/g, ''))}
          placeholder={LOCAL_PLACEHOLDER[selected.code] || '00 00 00 00'}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm focus:outline-none"
        />
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="border-b border-border p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un pays"
              className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Indicatif pays" className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">Aucun pays</li>
            )}
            {filtered.map((c) => {
              const active = c.code === selected.code;
              return (
                <li key={c.code} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      onCountryChange(c.code);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted',
                      active && 'bg-primary/5 font-medium',
                    )}
                  >
                    <span className="text-base leading-none" aria-hidden>
                      {flagEmoji(c.code)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="shrink-0 text-muted-foreground">{c.phonePrefix}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
