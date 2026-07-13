/**
 * Frontend mirror of the backend payment routing matrix.
 *
 * Source of truth: flexiopage-backend/src/services/payment/country-routing.ts
 * The server re-validates every (country, storeType, gateway, method) combo on
 * /api/payment/initiate, so this mirror only drives what the buyer SEES — drift
 * can never let an unauthorized method through.
 *
 * Matrix (2026-07-13):
 *   digital  → online only (Moneróo)
 *   physical → COD only (no online — vendors pas prêts à gérer online sur physique)
 */
export type PaymentMethodId = 'mobile_money' | 'card' | 'cod';
export type Gateway = 'cinetpay' | 'flutterwave' | 'moneróo' | 'cod';
export type StoreType = 'digital' | 'physical';

export interface PaymentMethodOption {
  id: PaymentMethodId;
  gateway: Gateway;
  label: string;
  /** Provider channel hint sent to the gateway. */
  channel?: 'card' | 'all';
}

const MONERÓO_COUNTRIES = new Set([
  'SN', 'CI', 'BJ', 'TG', 'BF', 'ML', 'CM', 'NE', 'GN', 'GW', 'CD', 'CG', 'GA', 'TD',
  'NG', 'GH', 'KE', 'ZA', 'UG', 'TZ', 'RW', 'ZM', 'MW',
]);

type Zone = 'moneróo' | 'other';

function zoneOf(country: string | undefined | null): Zone {
  const cc = (country || '').toUpperCase();
  if (MONERÓO_COUNTRIES.has(cc)) return 'moneróo';
  return 'other';
}

const COD_OPTION: PaymentMethodOption = { id: 'cod', gateway: 'cod', label: 'Paiement à la livraison' };

function onlineMethodsForZone(zone: Zone): PaymentMethodOption[] {
  if (zone === 'moneróo') {
    return [{ id: 'mobile_money', gateway: 'moneróo', label: 'Mobile Money', channel: 'all' }];
  }
  // "Other" — international card fallback for digital stores outside Moneróo coverage.
  return [{ id: 'card', gateway: 'flutterwave', label: 'Carte bancaire', channel: 'card' }];
}

export function getAvailableMethods(country: string, storeType: StoreType): PaymentMethodOption[] {
  if (storeType === 'digital') return onlineMethodsForZone(zoneOf(country));
  return [COD_OPTION];
}
