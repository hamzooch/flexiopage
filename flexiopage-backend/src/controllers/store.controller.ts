import { Response } from 'express';
import validator from 'validator';
import { AuthRequest } from '../middleware/auth.middleware';
import * as storeService from '../services/store.service';
import { getStoreAnalytics, getStoreAnalyticsRich, type RangeKey } from '../services/analytics.service';
import { verifyAndSaveDomain, getDomainTarget, checkDomain } from '../services/domain.service';
import { testSheetsWebhook } from '../services/sheets.service';
import { effectiveOwnerId, isTeamMember } from '../lib/owner';

export async function createStore(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  // Team members work inside an existing seller account — they can't spin up
  // new stores. Store creation stays a seller-only action.
  if (isTeamMember(req.user)) {
    res.status(403).json({ error: 'Les membres d’équipe ne peuvent pas créer de boutique.' });
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
  const stores = await storeService.getStoresByOwner(effectiveOwnerId(req.user));
  res.json({ stores });
}

export async function getStore(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store;
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  res.json({ store });
}

export async function updateStore(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const { name, description, logo, favicon, customDomain, theme, settings, integrations, isPublished } = req.body;
  const updates: Record<string, unknown> = {};
  if (typeof name === 'string') updates.name = name.trim();
  if (description !== undefined) updates.description = description;
  // sanitizeMiddleware escapes "/" -> "&#x2F;"; reverse it for URL fields
  if (typeof logo === 'string') updates.logo = validator.unescape(logo);
  if (typeof favicon === 'string') updates.favicon = validator.unescape(favicon);
  if (typeof customDomain === 'string') updates.customDomain = customDomain || undefined;
  if (theme && typeof theme === 'object') updates.theme = theme;
  if (settings && typeof settings === 'object') updates.settings = settings;
  if (integrations && typeof integrations === 'object') updates.integrations = integrations;
  if (typeof isPublished === 'boolean') updates.isPublished = isPublished;
  const updated = await storeService.updateStore(store._id.toString(), updates as Parameters<typeof storeService.updateStore>[1]);
  res.json({ store: updated });
}

export async function getStoreAnalyticsController(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const analytics = await getStoreAnalytics(store._id.toString());
  res.json(analytics);
}

/** GET /api/stores/:storeId/analytics/rich?range=7d|30d|90d|12m — full dashboard payload. */
export async function getStoreAnalyticsRichController(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const allowed: RangeKey[] = ['7d', '30d', '90d', '12m'];
  const raw = String(req.query.range || '30d');
  const range = (allowed as string[]).includes(raw) ? (raw as RangeKey) : '30d';
  const analytics = await getStoreAnalyticsRich(store._id.toString(), range);
  res.json(analytics);
}

/** GET /api/stores/:storeId/domain-target — DNS values the seller must configure. */
export async function getDomainTargetController(_req: AuthRequest, res: Response): Promise<void> {
  res.json(getDomainTarget());
}

/** POST /api/stores/:storeId/verify-domain — re-check DNS for the saved customDomain. */
export async function verifyDomainController(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const result = await verifyAndSaveDomain(store._id!.toString());
  res.json(result);
}

/** POST /api/stores/:storeId/check-domain — preview a domain check without saving. */
export async function previewDomainController(req: AuthRequest, res: Response): Promise<void> {
  const { domain } = req.body as { domain?: string };
  if (!domain?.trim()) {
    res.status(400).json({ error: 'domain required' });
    return;
  }
  const result = await checkDomain(domain);
  res.json(result);
}

/** POST /api/stores/:storeId/integrations/sheets/test — ping the Apps Script webhook. */
export async function testSheetsController(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const { webhookUrl } = req.body as { webhookUrl?: string };
  const url = webhookUrl?.trim() || store.integrations?.googleSheets?.webhookUrl?.trim() || '';
  if (!url) {
    res.status(400).json({ error: 'webhookUrl required' });
    return;
  }
  const result = await testSheetsWebhook(url, store.name);
  res.json(result);
}
