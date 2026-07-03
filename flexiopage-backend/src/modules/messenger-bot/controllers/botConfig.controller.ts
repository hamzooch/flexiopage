/**
 * Configuration du bot (vendeur authentifié). Scopé par ?storeId= (propriété
 * vérifiée). Le token de page chiffré n'est jamais renvoyé au client.
 */
import type { Response } from 'express';
import type { AuthRequest } from '../../../middleware/auth.middleware';
import { logger } from '../../../lib/logger';
import { BotConfig, type IBotConfig } from '../models/BotConfig.model';
import { Store } from '../../../models/Store.model';
import { getOwnedStoreId, getChannel } from '../utils/vendorAuth';
import { updateConfigSchema, testBotSchema } from '../schemas/config.schema';
import { catalogService } from '../services/catalog.service';
import { claudeService } from '../services/claude.service';
import { buildSystemPrompt } from '../prompts/systemPrompt';
import { detectDialect } from '../utils/languageDetector';
import { claudeTools } from '../tools/claudeTools';

/** Retire le token chiffré avant exposition au front. */
function publicConfig(c: IBotConfig) {
  const obj = c.toObject ? c.toObject() : c;
  delete (obj as Record<string, unknown>).page_access_token_encrypted;
  return obj;
}

export async function getConfig(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) {
    res.status(403).json({ error: 'storeId requis et doit t’appartenir.' });
    return;
  }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: getChannel(req) });
  res.json({ connected: !!config, config: config ? publicConfig(config) : null });
}

export async function updateConfig(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) {
    res.status(403).json({ error: 'storeId requis et doit t’appartenir.' });
    return;
  }
  const parsed = updateConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation échouée', details: parsed.error.flatten() });
    return;
  }
  const channel = getChannel(req);
  const updates: Record<string, unknown> = { ...parsed.data };
  // L'owner règle sa limite de messages MAIS elle est bornée au plafond
  // `messages_limit_max` fixé par l'admin.
  if (typeof updates.messages_limit === 'number') {
    const current = await BotConfig.findOne({ vendor_id: storeId, channel }).select('messages_limit_max').lean();
    const cap = current?.messages_limit_max ?? 1000;
    updates.messages_limit = Math.min(updates.messages_limit as number, cap);
  }
  const config = await BotConfig.findOneAndUpdate(
    { vendor_id: storeId, channel },
    { $set: updates },
    { new: true },
  );
  if (!config) {
    res.status(404).json({ error: 'Aucune page connectée pour cette boutique.' });
    return;
  }
  res.json({ config: publicConfig(config) });
}

/** POST /config/test — fait répondre Claude à un message de démo (sans Messenger). */
export async function testBot(req: AuthRequest, res: Response): Promise<void> {
  const storeId = await getOwnedStoreId(req);
  if (!storeId) {
    res.status(403).json({ error: 'storeId requis et doit t’appartenir.' });
    return;
  }
  const parsed = testBotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'message requis' });
    return;
  }
  const config = await BotConfig.findOne({ vendor_id: storeId, channel: getChannel(req) });
  if (!config) {
    res.status(404).json({ error: 'Aucune page connectée.' });
    return;
  }
  try {
    const vendor = await Store.findById(storeId).select('name').lean();
    const catalog = await catalogService.getCatalog(config);
    const detectedLanguage = detectDialect(parsed.data.message) ?? undefined;
    const systemPrompt = buildSystemPrompt({ botConfig: config, vendor: vendor || {}, catalog, detectedLanguage });
    const result = await claudeService.generateResponse({
      conversationHistory: [{ role: 'user', content: parsed.data.message }],
      systemPrompt,
      tools: claudeTools,
      language: detectedLanguage ?? config.language,
    });
    res.json({
      reply: result.content,
      toolsUsed: result.toolUses.map((t) => t.name),
      tokens: { input: result.tokensInput, output: result.tokensOutput },
      costUsd: result.costUsd,
      model: result.model,
    });
  } catch (err) {
    logger.error({ err: (err as Error).message }, '[messenger-bot] testBot échec');
    res.status(502).json({ error: 'Échec de l’appel au modèle. Vérifie ANTHROPIC_API_KEY.' });
  }
}
