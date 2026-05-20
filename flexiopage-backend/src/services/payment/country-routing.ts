/**
 * Country → available payment methods, scoped by store type.
 *
 * Business matrix (validated):
 *               | Online | COD
 *   ------------|--------|-----
 *   digital     |   ✅   |  ❌   (no courier → must pay to receive the download)
 *   physical    |   ✅   |  ✅
 *
 * Regional gateway zones:
 *   - CinetPay (francophone CFA): Mobile Money (Wave, OM, MTN, Moov)
 *   - Flutterwave (anglophone + others): Card + Mobile Money
 *   - "Other" zone: no regional online gateway. Physical → COD only; digital
 *     falls back to international card via Flutterwave so an online option
 *     always exists (a digital store must be payable everywhere).
 *
 * This module is the single source of truth — the frontend selector mirrors
 * the same zones so what the buyer sees matches what the server will accept.
 */
import type { Channel } from './types';

export type PaymentMethodId = 'mobile_money' | 'card' | 'cod';
export type Gateway = 'cinetpay' | 'flutterwave' | 'cod';
export type StoreType = 'digital' | 'physical';

export interface PaymentMethodOption {
  id: PaymentMethodId;
  gateway: Gateway;
  /** UI label (French). */
  label: string;
  /** Channel hint passed to the gateway when initiating. */
  channel?: Channel;
}

/** Francophone CFA zone covered by CinetPay. */
const CINETPAY_COUNTRIES = new Set([
  'SN', 'CI', 'BJ', 'TG', 'BF', 'ML', 'CM', 'NE', 'GN', 'GW', 'CD', 'CG', 'GA', 'TD',
]);

/** Anglophone + East/Southern Africa zone covered by Flutterwave. */
const FLUTTERWAVE_COUNTRIES = new Set([
  'NG', 'GH', 'KE', 'ZA', 'UG', 'TZ', 'RW', 'ZM', 'MW',
]);

type Zone = 'cinetpay' | 'flutterwave' | 'other';

export function zoneOf(country: string | undefined | null): Zone {
  const cc = (country || '').toUpperCase();
  if (CINETPAY_COUNTRIES.has(cc)) return 'cinetpay';
  if (FLUTTERWAVE_COUNTRIES.has(cc)) return 'flutterwave';
  return 'other';
}

const COD_OPTION: PaymentMethodOption = { id: 'cod', gateway: 'cod', label: 'Paiement à la livraison' };

/** Online methods for a given zone (no COD here). */
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
  // "Other": international card via Flutterwave as the only online fallback.
  return [{ id: 'card', gateway: 'flutterwave', label: 'Carte bancaire', channel: 'card' }];
}

/**
 * Methods a buyer may use, given their country and the store type.
 * Guarantees: digital → online only (never empty); physical "other" zone →
 * COD only (matches the brief).
 */
export function getAvailableMethods(country: string, storeType: StoreType): PaymentMethodOption[] {
  const zone = zoneOf(country);

  if (storeType === 'digital') {
    // Online only — onlineMethodsForZone always returns ≥1 (card fallback).
    return onlineMethodsForZone(zone);
  }

  // Physical:
  if (zone === 'other') {
    // Brief: "Autres → COD uniquement".
    return [COD_OPTION];
  }
  return [...onlineMethodsForZone(zone), COD_OPTION];
}

/**
 * Server-side guard: is this (gateway, method) actually allowed for this
 * country + store type? Used by /api/payment/initiate to reject spoofed
 * client choices before touching a gateway.
 */
export function isMethodAllowed(
  country: string,
  storeType: StoreType,
  gateway: Gateway,
  methodId: PaymentMethodId,
): boolean {
  return getAvailableMethods(country, storeType).some(
    (m) => m.gateway === gateway && m.id === methodId,
  );
}
