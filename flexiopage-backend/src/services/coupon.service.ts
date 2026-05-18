/**
 * Service layer for promotional coupons. Handles CRUD, validation (used
 * by both the dashboard and the public COD checkout) and atomic consumption.
 */
import mongoose from 'mongoose';
import { Coupon, ICoupon, CouponType, CouponScope } from '../models/Coupon.model';
import { Collection } from '../models/Collection.model';

export interface CreateCouponInput {
  storeId: string;
  code: string;
  description?: string;
  type: CouponType;
  value: number;
  minPurchase?: number;
  maxUses?: number;
  startsAt?: Date;
  expiresAt?: Date;
  isActive?: boolean;
  appliesTo?: CouponScope;
  productIds?: string[];
  collectionIds?: string[];
}

export type UpdateCouponInput = Partial<Omit<CreateCouponInput, 'storeId' | 'code'>>;

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export async function createCoupon(input: CreateCouponInput): Promise<ICoupon> {
  return Coupon.create({
    storeId: input.storeId,
    code: normalizeCode(input.code),
    description: input.description?.trim(),
    type: input.type,
    value: input.value,
    minPurchase: input.minPurchase,
    maxUses: input.maxUses,
    startsAt: input.startsAt,
    expiresAt: input.expiresAt,
    isActive: input.isActive ?? true,
    appliesTo: input.appliesTo || 'all',
    productIds: (input.productIds || []).map((id) => new mongoose.Types.ObjectId(id)),
    collectionIds: (input.collectionIds || []).map((id) => new mongoose.Types.ObjectId(id)),
  });
}

export async function listCoupons(storeId: string): Promise<ICoupon[]> {
  return Coupon.find({ storeId }).sort({ createdAt: -1 }).lean<ICoupon[]>();
}

export async function getCoupon(couponId: string, storeId: string): Promise<ICoupon | null> {
  return Coupon.findOne({ _id: couponId, storeId }).lean<ICoupon | null>();
}

export async function updateCoupon(
  couponId: string,
  storeId: string,
  updates: UpdateCouponInput
): Promise<ICoupon | null> {
  const $set: Record<string, unknown> = { ...updates };
  if (Array.isArray(updates.productIds)) {
    $set.productIds = updates.productIds.map((id) => new mongoose.Types.ObjectId(id));
  }
  if (Array.isArray(updates.collectionIds)) {
    $set.collectionIds = updates.collectionIds.map((id) => new mongoose.Types.ObjectId(id));
  }
  return Coupon.findOneAndUpdate({ _id: couponId, storeId }, { $set }, { new: true });
}

export async function deleteCoupon(couponId: string, storeId: string): Promise<boolean> {
  const r = await Coupon.deleteOne({ _id: couponId, storeId });
  return r.deletedCount > 0;
}

// ─────────────────────────────────────────────────────────────────────
// Validation + consumption
// ─────────────────────────────────────────────────────────────────────

export type CouponValidationFailure =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'max_uses_reached'
  | 'min_purchase'
  | 'scope_mismatch';

export interface CouponValidationOk {
  ok: true;
  coupon: ICoupon;
  /** Discount amount in store currency (already capped at subtotal). */
  discountAmount: number;
  type: CouponType;
}

export interface CouponValidationErr {
  ok: false;
  reason: CouponValidationFailure;
  message: string;
}

export type CouponValidationResult = CouponValidationOk | CouponValidationErr;

interface ValidationContext {
  storeId: string;
  code: string;
  /** Subtotal in store currency the coupon would apply to. */
  subtotal: number;
  /** Product ids in the cart (for scope checks). */
  productIds?: string[];
}

/**
 * Run every validation gate without touching usedCount. Use this both from
 * the public validate endpoint (live preview while the buyer types) and
 * from the checkout endpoint (final guard before consumption).
 */
export async function validateCoupon(ctx: ValidationContext): Promise<CouponValidationResult> {
  const code = normalizeCode(ctx.code);
  if (!code) return { ok: false, reason: 'not_found', message: 'Code invalide.' };
  const coupon = await Coupon.findOne({ storeId: ctx.storeId, code });
  if (!coupon) return { ok: false, reason: 'not_found', message: "Ce code n'existe pas." };

  if (!coupon.isActive) {
    return { ok: false, reason: 'inactive', message: 'Ce code est désactivé.' };
  }

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    return { ok: false, reason: 'not_started', message: 'Ce code n\'est pas encore actif.' };
  }
  if (coupon.expiresAt && coupon.expiresAt < now) {
    return { ok: false, reason: 'expired', message: 'Ce code a expiré.' };
  }
  if (typeof coupon.maxUses === 'number' && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, reason: 'max_uses_reached', message: 'Ce code a atteint sa limite d\'utilisation.' };
  }
  if (typeof coupon.minPurchase === 'number' && ctx.subtotal < coupon.minPurchase) {
    return {
      ok: false,
      reason: 'min_purchase',
      message: `Montant minimum requis: ${coupon.minPurchase}.`,
    };
  }

  // Scope check — for 'products' the cart must contain at least one matching id.
  // For 'collections' we resolve which products are in the listed collections.
  if (coupon.appliesTo === 'products') {
    const allowedSet = new Set((coupon.productIds || []).map(String));
    const cartSet = new Set((ctx.productIds || []).map(String));
    const matchesAny = Array.from(cartSet).some((id) => allowedSet.has(id));
    if (!matchesAny) {
      return { ok: false, reason: 'scope_mismatch', message: 'Ce code ne s\'applique pas aux produits du panier.' };
    }
  } else if (coupon.appliesTo === 'collections') {
    if (!coupon.collectionIds || coupon.collectionIds.length === 0) {
      return { ok: false, reason: 'scope_mismatch', message: 'Aucune collection associée à ce code.' };
    }
    const cols = await Collection.find({
      _id: { $in: coupon.collectionIds },
      storeId: ctx.storeId,
    }).select('productIds').lean<Array<{ productIds: mongoose.Types.ObjectId[] }>>();
    const allowed = new Set<string>();
    for (const c of cols) for (const id of c.productIds || []) allowed.add(String(id));
    const cartSet = new Set((ctx.productIds || []).map(String));
    const matchesAny = Array.from(cartSet).some((id) => allowed.has(id));
    if (!matchesAny) {
      return { ok: false, reason: 'scope_mismatch', message: 'Ce code ne s\'applique pas aux produits du panier.' };
    }
  }

  // Compute discount — percent capped at subtotal so we never refund the customer.
  let discountAmount =
    coupon.type === 'percent'
      ? Math.round(ctx.subtotal * (coupon.value / 100) * 100) / 100
      : Math.min(coupon.value, ctx.subtotal);
  if (discountAmount < 0) discountAmount = 0;
  return { ok: true, coupon, discountAmount, type: coupon.type };
}

/**
 * Atomically increment usedCount. Returns false when the coupon was
 * exhausted between validation and consumption (rare but possible
 * under concurrent checkouts).
 */
export async function consumeCoupon(couponId: string): Promise<boolean> {
  // Conditional update: only bump when there's still capacity. Mongo's
  // $expr keeps this atomic so two parallel buyers can't overshoot maxUses.
  const r = await Coupon.updateOne(
    {
      _id: couponId,
      $or: [
        { maxUses: { $exists: false } },
        { $expr: { $lt: ['$usedCount', '$maxUses'] } },
      ],
    },
    { $inc: { usedCount: 1 } }
  );
  return r.modifiedCount > 0;
}
