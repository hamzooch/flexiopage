/**
 * Authenticated coupon controller — seller dashboard CRUD.
 * Public validate endpoint lives in public.routes.ts.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as couponService from '../services/coupon.service';
import type { CouponType, CouponScope } from '../models/Coupon.model';

interface CouponBody {
  code?: string;
  description?: string;
  type?: CouponType;
  value?: number;
  minPurchase?: number;
  maxUses?: number;
  startsAt?: string;
  expiresAt?: string;
  isActive?: boolean;
  appliesTo?: CouponScope;
  productIds?: string[];
  collectionIds?: string[];
}

export async function listCoupons(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const coupons = await couponService.listCoupons(store._id.toString());
  res.json({ coupons });
}

export async function createCoupon(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = req.body as CouponBody;
  if (!body.code?.trim()) {
    res.status(400).json({ error: 'Code is required' });
    return;
  }
  if (!body.type || (body.type !== 'percent' && body.type !== 'fixed')) {
    res.status(400).json({ error: 'Valid type (percent|fixed) is required' });
    return;
  }
  if (typeof body.value !== 'number' || body.value < 0) {
    res.status(400).json({ error: 'Valid value is required' });
    return;
  }
  if (body.type === 'percent' && body.value > 100) {
    res.status(400).json({ error: 'Percent value cannot exceed 100' });
    return;
  }
  try {
    const coupon = await couponService.createCoupon({
      storeId: store._id.toString(),
      code: body.code,
      description: body.description,
      type: body.type,
      value: body.value,
      minPurchase: body.minPurchase,
      maxUses: body.maxUses,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      isActive: body.isActive,
      appliesTo: body.appliesTo,
      productIds: body.productIds,
      collectionIds: body.collectionIds,
    });
    res.status(201).json({ coupon });
  } catch (err: unknown) {
    // Duplicate code on the same store — unique index throws.
    if ((err as { code?: number }).code === 11000) {
      res.status(409).json({ error: 'Ce code existe déjà.' });
      return;
    }
    throw err;
  }
}

export async function getCoupon(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const coupon = await couponService.getCoupon(req.params.couponId, store._id.toString());
  if (!coupon) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }
  res.json({ coupon });
}

export async function updateCoupon(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = req.body as CouponBody;
  const updated = await couponService.updateCoupon(
    req.params.couponId,
    store._id.toString(),
    {
      description: body.description,
      type: body.type,
      value: body.value,
      minPurchase: body.minPurchase,
      maxUses: body.maxUses,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      isActive: body.isActive,
      appliesTo: body.appliesTo,
      productIds: body.productIds,
      collectionIds: body.collectionIds,
    }
  );
  if (!updated) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }
  res.json({ coupon: updated });
}

export async function deleteCoupon(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const ok = await couponService.deleteCoupon(req.params.couponId, store._id.toString());
  if (!ok) {
    res.status(404).json({ error: 'Coupon not found' });
    return;
  }
  res.status(204).end();
}
