import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as storeService from '../services/store.service';
import { getStoreAnalytics } from '../services/analytics.service';

export async function createStore(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const { name, slug, description, theme, storeType, currency, language, country } = req.body as {
    name?: string;
    slug?: string;
    description?: string;
    theme?: unknown;
    storeType?: string;
    currency?: string;
    language?: string;
    country?: string;
  };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Store name is required' });
    return;
  }
  if (storeType !== 'physical' && storeType !== 'digital') {
    res.status(400).json({ error: 'storeType must be "physical" or "digital"' });
    return;
  }
  try {
    const store = await storeService.createStore({
      ownerId: req.user._id,
      name: name.trim(),
      slug: slug?.trim(),
      storeType,
      description: description?.trim(),
      theme: theme && typeof theme === 'object' ? (theme as Record<string, unknown>) : undefined,
      currency: typeof currency === 'string' ? currency : undefined,
      language: typeof language === 'string' ? language : undefined,
      country: typeof country === 'string' ? country : undefined,
    });
    res.status(201).json({ store });
  } catch (err) {
    const e = err as Error & { statusCode?: number };
    res.status(e.statusCode || 500).json({ error: e.message || 'Failed to create store' });
  }
}

export async function listStores(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const stores = await storeService.getStoresByOwner(req.user._id.toString());
  res.json({ stores });
}

export async function getStore(req: AuthRequest, res: Response): Promise<void> {
  const store = (req as AuthRequest & { store: Awaited<ReturnType<typeof storeService.getStoreById>> }).store;
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  res.json({ store });
}

export async function updateStore(req: AuthRequest, res: Response): Promise<void> {
  const store = (req as AuthRequest & { store: { _id: unknown } }).store;
  const { name, description, logo, favicon, customDomain, theme, settings, integrations, isPublished } = req.body;
  const updates: Record<string, unknown> = {};
  if (typeof name === 'string') updates.name = name.trim();
  if (description !== undefined) updates.description = description;
  if (typeof logo === 'string') updates.logo = logo;
  if (typeof favicon === 'string') updates.favicon = favicon;
  if (typeof customDomain === 'string') updates.customDomain = customDomain || undefined;
  if (theme && typeof theme === 'object') updates.theme = theme;
  if (settings && typeof settings === 'object') updates.settings = settings;
  if (integrations && typeof integrations === 'object') updates.integrations = integrations;
  if (typeof isPublished === 'boolean') updates.isPublished = isPublished;
  const updated = await storeService.updateStore(store._id.toString(), updates as Parameters<typeof storeService.updateStore>[1]);
  res.json({ store: updated });
}

export async function getStoreAnalyticsController(req: AuthRequest, res: Response): Promise<void> {
  const store = (req as AuthRequest & { store: { _id: unknown } }).store;
  const analytics = await getStoreAnalytics(store._id.toString());
  res.json(analytics);
}
