import { Response } from 'express';
import validator from 'validator';
import { AuthRequest } from '../middleware/auth.middleware';
import * as storeService from '../services/store.service';
import { getStoreAnalytics, getStoreAnalyticsRich, type RangeKey } from '../services/analytics.service';
import { getTrackingStats, getLiveVisitors, type TrackingRange } from '../services/tracking.service';
import { verifyAndSaveDomain, getDomainTarget, checkDomain, normalizeDomain, isValidDomain } from '../services/domain.service';
import { testSheetsWebhook } from '../services/sheets.service';
import { effectiveOwnerId, isTeamMember } from '../lib/owner';
import { logActivity } from '../services/activity-log.service';
import { notifyRevalidate } from '../lib/revalidate';

// sanitizeMiddleware escapes string values recursively (e.g. "/" → "&#x2F;",
// "&" → "&amp;"). That's fine for free-text fields but breaks config blobs
// like `settings`/`theme`/`integrations`, which carry URLs and human-readable
// titles. We deep-unescape them here before persisting so heroImage URLs,
// announcement bar text, hero titles, etc. survive a round-trip intact.
function deepUnescape(value: unknown): unknown {
  if (typeof value === 'string') return validator.unescape(value);
  if (Array.isArray(value)) return value.map(deepUnescape);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deepUnescape(v);
    return out;
  }
  return value;
}

/**
 * Per-account store creation cap. Keeps the platform from being abused as
 * a free multi-account playground. Staff roles (admin/superadmin/owner)
 * are exempt because they may need to spin up test stores. To override
 * for a specific seller, bump their User.role or set
 * `STORE_LIMIT_PER_USER` higher via env.
 */
const STORE_LIMIT_PER_USER = Number(process.env.STORE_LIMIT_PER_USER) || 3;
const STAFF_ROLES = new Set(['admin', 'superadmin', 'owner', 'supervisor']);

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
  // Per-account limit: a seller can own at most STORE_LIMIT_PER_USER stores.
  // Skipped for staff (admin/superadmin) so they can manage support/test stores.
  if (!STAFF_ROLES.has(req.user.role || 'user')) {
    const existing = await storeService.getStoresByOwner(req.user._id.toString());
    if (existing.length >= STORE_LIMIT_PER_USER) {
      res.status(403).json({
        error: `Limite atteinte : tu ne peux créer que ${STORE_LIMIT_PER_USER} boutiques par compte. Contacte le support si tu as besoin de plus.`,
        code: 'store_limit_reached',
        limit: STORE_LIMIT_PER_USER,
        current: existing.length,
      });
      return;
    }
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
      theme: theme && typeof theme === 'object' ? (deepUnescape(theme) as Record<string, unknown>) : undefined,
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
  // customDomain handling:
  //   - undefined           → don't touch
  //   - null / empty string → clear domain + reset verification
  //   - non-empty string    → normalize, validate, reset verification only if it changed
  if (customDomain === null || customDomain === '') {
    updates.customDomain = null;
    updates.customDomainVerified = false;
    updates.customDomainVerifiedAt = null;
    updates.customDomainTarget = null;
  } else if (typeof customDomain === 'string') {
    const next = normalizeDomain(customDomain);
    if (!isValidDomain(next)) {
      res.status(400).json({ error: 'invalid_domain', message: 'Domaine invalide. Format attendu : shop.tonsite.com' });
      return;
    }
    if (next !== (store.customDomain || '')) {
      updates.customDomain = next;
      updates.customDomainVerified = false;
      updates.customDomainVerifiedAt = null;
    }
  }
  if (theme && typeof theme === 'object') updates.theme = deepUnescape(theme);
  if (settings && typeof settings === 'object') updates.settings = deepUnescape(settings);
  if (integrations && typeof integrations === 'object') updates.integrations = deepUnescape(integrations);
  if (typeof isPublished === 'boolean') updates.isPublished = isPublished;
  const wasPublished = !!store.isPublished;
  const updated = await storeService.updateStore(store._id.toString(), updates as Parameters<typeof storeService.updateStore>[1]);
  if (!wasPublished && isPublished === true) {
    void logActivity({
      type: 'store.published',
      message: `Boutique publiée : ${store.name} (/${store.slug})`,
      storeId: store._id,
      userId: store.ownerId,
      metadata: { slug: store.slug },
    });
  }
  notifyRevalidate(`store:${store.slug}`);
  res.json({ store: updated });
}

export async function getStoreAnalyticsController(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const analytics = await getStoreAnalytics(store._id.toString());
  res.json(analytics);
}

/** GET /api/stores/:storeId/analytics/rich?range=7d|30d|90d|12m|custom[&from=YYYY-MM-DD&to=YYYY-MM-DD] — full dashboard payload. */
export async function getStoreAnalyticsRichController(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const allowed: RangeKey[] = ['today', '7d', '30d', '90d', '12m', 'custom'];
  const raw = String(req.query.range || '30d');
  const range = (allowed as string[]).includes(raw) ? (raw as RangeKey) : '30d';
  let custom: { from: Date; to: Date } | undefined;
  if (range === 'custom') {
    const fromRaw = String(req.query.from || '');
    const toRaw = String(req.query.to || '');
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (!fromRaw || !toRaw || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      res.status(400).json({ error: 'custom range requires valid from + to (YYYY-MM-DD)' });
      return;
    }
    if (from.getTime() > to.getTime()) {
      res.status(400).json({ error: '`from` must be on or before `to`' });
      return;
    }
    // Cap the window at 366 days so a seller can't accidentally request a
    // multi-year scan that hammers Mongo. 366 covers any 12-month picker.
    const days = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    if (days > 366) {
      res.status(400).json({ error: 'custom range too wide (max 366 days)' });
      return;
    }
    custom = { from, to };
  }
  const analytics = await getStoreAnalyticsRich(store._id.toString(), range, custom);
  res.json(analytics);
}

/** GET /api/stores/:storeId/tracking?range=7d|30d|90d — storefront funnel stats. */
export async function getStoreTrackingController(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const allowed: TrackingRange[] = ['7d', '30d', '90d'];
  const raw = String(req.query.range || '30d');
  const range = (allowed as string[]).includes(raw) ? (raw as TrackingRange) : '30d';
  const stats = await getTrackingStats(store._id.toString(), range);
  res.json(stats);
}

/** GET /api/stores/:storeId/visitors/live — distinct anonymous sessions active in the last few minutes. */
export async function getLiveVisitorsController(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const raw = Number(req.query.window);
  const windowMin = Number.isFinite(raw) && raw >= 1 && raw <= 60 ? Math.round(raw) : 5;
  const stats = await getLiveVisitors(store._id.toString(), windowMin);
  res.json(stats);
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
