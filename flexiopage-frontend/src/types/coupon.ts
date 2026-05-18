/**
 * Frontend type for promotional coupons. Mirrors backend Coupon.model
 * but trimmed to what the dashboard and storefront actually consume.
 */
export type CouponType = 'percent' | 'fixed';
export type CouponScope = 'all' | 'products' | 'collections';

export interface Coupon {
  _id: string;
  storeId: string;
  code: string;
  description?: string;
  type: CouponType;
  value: number;
  minPurchase?: number;
  maxUses?: number;
  usedCount: number;
  startsAt?: string;
  expiresAt?: string;
  isActive: boolean;
  appliesTo: CouponScope;
  productIds?: string[];
  collectionIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** Response from the public /coupons/validate endpoint. */
export type CouponValidationResponse =
  | {
      ok: true;
      code: string;
      type: CouponType;
      value: number;
      discountAmount: number;
      description?: string;
    }
  | {
      ok: false;
      reason: string;
      message: string;
    };
