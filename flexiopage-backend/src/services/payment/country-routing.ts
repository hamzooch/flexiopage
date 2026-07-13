/**
 * Country → available payment methods, scoped by store type.
 *
 * Business matrix (validated 2026-07-13):
 *               | Online | COD
 *   ------------|--------|-----
 *   digital     |   ✅   |  ❌   (no courier → must pay to receive the download)
 *   physical    |   ❌   |  ✅   (COD only — vendors pas prêts à gérer online sur physique)
 *
 * Regional gateway zones (digital only):
 *   - CinetPay (francophone CFA): Mobile Money (Wave, OM, MTN, Moov)
 *   - Flutterwave (anglophone + others): Card + Mobile Money
 *   - Moneróo: Mobile Money across CFA + Flutterwave zones
 *   - "Other" zone: falls back to international card via Flutterwave so a
 *     digital store is payable everywhere.
 *
 * This module is the single source of truth — the frontend selector mirrors
 * the same zones so what the buyer sees matches what the server will accept.
 */
import type { Channel } from './types';

export type PaymentMethodId = 'mobile_money' | 'card' | 'cod';
export type Gateway = 'cinetpay' | 'flutterwave' | 'moneróo' | 'cod';
export type StoreType = 'digital' | 'physical';

export interface PaymentMethodOption {
  id: PaymentMethodId;
  gateway: Gateway;
  /** UI label (French). */
  label: string;
  /** Channel hint passed to the gateway when initiating. */
  channel?: Channel;
}

/**
 * Moneróo coverage (Wave, MTN, Moov, OM across African countries).
 * Prioritized over CinetPay/Flutterwave — it's our primary online gateway.
 */
const MONERÓO_COUNTRIES = new Set([
  'SN', 'CI', 'BJ', 'TG', 'BF', 'ML', 'CM', 'NE', 'GN', 'GW', 'CD', 'CG', 'GA', 'TD', // CFA
  'NG', 'GH', 'KE', 'ZA', 'UG', 'TZ', 'RW', 'ZM', 'MW', // Anglophone
]);

type Zone = 'moneróo' | 'other';

export function zoneOf(country: string | undefined | null): Zone {
  const cc = (country || '').toUpperCase();
  if (MONERÓO_COUNTRIES.has(cc)) return 'moneróo';
  return 'other';
}

const COD_OPTION: PaymentMethodOption = { id: 'cod', gateway: 'cod', label: 'Paiement à la livraison' };

/** Online methods for a given zone (no COD here). */
function onlineMethodsForZone(zone: Zone): PaymentMethodOption[] {
  if (zone === 'moneróo') {
    return [{ id: 'mobile_money', gateway: 'moneróo', label: 'Mobile Money', channel: 'all' }];
  }
  // "Other": international card via Flutterwave as the only online fallback.
  return [{ id: 'card', gateway: 'flutterwave', label: 'Carte bancaire', channel: 'card' }];
}

/**
 * Methods a buyer may use, given their country and the store type.
 * Guarantees: digital → online only (never empty); physical → COD only.
 */
export function getAvailableMethods(country: string, storeType: StoreType): PaymentMethodOption[] {
  if (storeType === 'digital') {
    // Digital: online only. onlineMethodsForZone always returns ≥1 (card fallback).
    return onlineMethodsForZone(zoneOf(country));
  }
  // Physical: COD only — online payment restricted to digital stores.
  return [COD_OPTION];
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
