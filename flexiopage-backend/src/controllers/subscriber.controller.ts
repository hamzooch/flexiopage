/**
 * Authenticated subscriber controller — seller dashboard endpoints.
 * The public subscribe endpoint lives in public.routes.ts.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as subscriberService from '../services/subscriber.service';

export async function listSubscribers(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const subscribers = await subscriberService.listSubscribers(store._id.toString(), {
    search,
    includeUnsubscribed: req.query.includeUnsubscribed === 'true',
  });
  const counts = await subscriberService.countSubscribers(store._id.toString());
  res.json({ subscribers, counts });
}

export async function deleteSubscriber(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const ok = await subscriberService.deleteSubscriber(req.params.subscriberId, store._id.toString());
  if (!ok) {
    res.status(404).json({ error: 'Subscriber not found' });
    return;
  }
  res.status(204).end();
}

export async function exportSubscribersCsv(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const subscribers = await subscriberService.listSubscribers(store._id.toString(), {
    limit: 10000,
    includeUnsubscribed: req.query.includeUnsubscribed === 'true',
  });
  const csv = subscriberService.subscribersToCsv(subscribers);
  const filename = `${store.slug || 'subscribers'}-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
