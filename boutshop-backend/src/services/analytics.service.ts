import mongoose from 'mongoose';
import { Order } from '../models/Order.model';

export interface StoreAnalytics {
  totalOrders: number;
  totalRevenue: number;
  conversionRate?: number;
  storeViews?: number;
  ordersThisMonth: number;
  revenueThisMonth: number;
}

/** Aggregate order stats for a store. Store views would come from a separate tracking table in production. */
export async function getStoreAnalytics(storeId: string): Promise<StoreAnalytics> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const storeObjectId = new mongoose.Types.ObjectId(storeId);

  const [total, thisMonth] = await Promise.all([
    Order.aggregate([
      { $match: { storeId: storeObjectId } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] } },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          storeId: storeObjectId,
          createdAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$total', 0] } },
        },
      },
    ]),
  ]);

  const totalOrders = total[0]?.count ?? 0;
  const totalRevenue = total[0]?.revenue ?? 0;
  const ordersThisMonth = thisMonth[0]?.count ?? 0;
  const revenueThisMonth = thisMonth[0]?.revenue ?? 0;

  return {
    totalOrders,
    totalRevenue,
    ordersThisMonth,
    revenueThisMonth,
    conversionRate: undefined,
    storeViews: undefined,
  };
}
