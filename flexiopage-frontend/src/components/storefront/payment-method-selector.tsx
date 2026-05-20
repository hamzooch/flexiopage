'use client';

/**
 * Payment-method picker shown inside the checkout form. Driven by the buyer's
 * country + the store type via `getAvailableMethods`. The parent owns the
 * selected id; this is a controlled component.
 */
import { CreditCard, Smartphone, Truck } from 'lucide-react';
import type { ThemeTokens } from '@/data/store-themes';
import type { PaymentMethodOption } from '@/lib/payment-methods';

const ICON = {
  card: CreditCard,
  mobile_money: Smartphone,
  cod: Truck,
} as const;

interface Props {
  methods: PaymentMethodOption[];
  /** Composite key `${gateway}:${id}` of the selected method. */
  value: string;
  onChange: (key: string, method: PaymentMethodOption) => void;
  theme: ThemeTokens;
  radius: string;
}

export function methodKey(m: PaymentMethodOption): string {
  return `${m.gateway}:${m.id}`;
}

export function PaymentMethodSelector({ methods, value, onChange, theme, radius }: Props) {
  // A single option doesn't need a picker — the parent still uses it on submit.
  if (methods.length <= 1) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold" style={{ color: theme.foreground }}>
        Mode de paiement
      </div>
      <div className="grid gap-2">
        {methods.map((m) => {
          const key = methodKey(m);
          const active = key === value;
          const Icon = ICON[m.id];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key, m)}
              aria-pressed={active}
              className="flex items-center gap-3 border px-3 py-2.5 text-left transition-all"
              style={{
                borderColor: active ? theme.primary : theme.border,
                borderWidth: active ? 2 : 1,
                borderRadius: radius,
                backgroundColor: active ? `${theme.primary}14` : theme.surface,
                color: theme.foreground,
              }}
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                style={{ backgroundColor: active ? theme.primary : theme.surfaceMuted, color: active ? theme.primaryFg : theme.muted }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{m.label}</span>
                <span className="block text-[11px]" style={{ color: theme.muted }}>
                  {m.id === 'cod'
                    ? 'Payez en espèces à la réception'
                    : m.gateway === 'cinetpay'
                      ? 'Wave, Orange Money, MTN, Moov'
                      : m.id === 'card'
                        ? 'Visa / Mastercard sécurisé'
                        : 'Paiement mobile sécurisé'}
                </span>
              </span>
              <span
                className="grid h-4 w-4 shrink-0 place-items-center rounded-full border"
                style={{ borderColor: active ? theme.primary : theme.border }}
              >
                {active && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.primary }} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
