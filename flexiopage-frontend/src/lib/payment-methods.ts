/**
 * Frontend mirror of the backend payment routing matrix.
 *
 * Source of truth: flexiopage-backend/src/services/payment/country-routing.ts
 * The server re-validates every (country, storeType, gateway, method) combo on
 * /api/payment/initiate, so this mirror only drives what the buyer SEES — drift
 * can never let an unauthorized method through.
 *
 * Matrix:
 *   digital  → online only (never COD)
 *   physical → online + COD (or COD only in "other" zones)
 */
export type PaymentMethodId = 'mobile_money' | 'card' | 'cod';
export type Gateway = 'cinetpay' | 'flutterwave' | 'cod';
export type StoreType = 'digital' | 'physical';

export interface PaymentMethodOption {
  id: PaymentMethodId;
  gateway: Gateway;
  label: string;
  /** Provider channel hint sent to the gateway. */
  channel?: 'card' | 'all';
}

const CINETPAY_COUNTRIES = new Set([
  'SN', 'CI', 'BJ', 'TG', 'BF', 'ML', 'CM', 'NE', 'GN', 'GW', 'CD', 'CG', 'GA', 'TD',
]);
const FLUTTERWAVE_COUNTRIES = new Set([
  'NG', 'GH', 'KE', 'ZA', 'UG', 'TZ', 'RW', 'ZM', 'MW',
]);

type Zone = 'cinetpay' | 'flutterwave' | 'other';

function zoneOf(country: string | undefined | null): Zone {
  const cc = (country || '').toUpperCase();
  if (CINETPAY_COUNTRIES.has(cc)) return 'cinetpay';
  if (FLUTTERWAVE_COUNTRIES.has(cc)) return 'flutterwave';
  return 'other';
}

const COD_OPTION: PaymentMethodOption = { id: 'cod', gateway: 'cod', label: 'Paiement à la livraison' };

function onlineMethodsForZone(zone: Zone): PaymentMethodOption[] {
  if (zone === 'cinetpay') {
    return [{ id: 'mobile_money', gateway: 'cinetpay', label: 'Mobile Money', channel: 'all' }];
  }
  if (zone === 'flutterwave') {
    return [
      { id: 'card', gateway: 'flutterwave', label: 'Carte bancaire', channel: 'card' },
      { id: 'mobile_money', gateway: 'flutterwave', label: 'Mobile Money', channel: 'all' },
    ];
  }
  return [{ id: 'card', gateway: 'flutterwave', label: 'Carte bancaire', channel: 'card' }];
}

export function getAvailableMethods(country: string, storeType: StoreType): PaymentMethodOption[] {
  const zone = zoneOf(country);
  if (storeType === 'digital') return onlineMethodsForZone(zone);
  if (zone === 'other') return [COD_OPTION];
  return [...onlineMethodsForZone(zone), COD_OPTION];
}
