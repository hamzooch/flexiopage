/**
 * Botstore — chatbot IA public exposé sur la storefront de chaque boutique.
 *
 * Le vendeur active le bot depuis /dashboard/apps/botstore ; côté client, une
 * bulle de chat sur la storefront envoie chaque message ici, on assemble un
 * contexte (nom du store, description, livraison, currency, top produits) et
 * on interroge Claude Haiku 4.5. La réponse est retournée telle quelle au
 * widget, avec un flag `offerWhatsappFallback` que le widget utilise pour
 * afficher un CTA « Discuter sur WhatsApp » dans la conversation.
 *
 * Pas de persistance dans ce MVP — la fenêtre du navigateur porte l'historique.
 * L'historique dashboard (per-conversation review) est prévu dans un PR suivant.
 */
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../lib/logger';
import type { IStore } from '../models/Store.model';
import type { IProduct } from '../models/Product.model';

/** Message conversationnel côté widget → backend. */
export interface BotstoreMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BotstoreChatArgs {
  store: IStore;
  products: IProduct[];
  history: BotstoreMessage[];
  message: string;
}

export interface BotstoreChatResult {
  reply: string;
  offerWhatsappFallback: boolean;
  model: string;
}

// Claude Haiku 4.5 par défaut — même choix que le messenger-bot, latence et
// coût très bas, qualité suffisante pour du Q&A produit. Overridable via env
// pour tester une mise à niveau.
const MODEL = process.env.BOTSTORE_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 512;
const MAX_HISTORY = 12;          // ~6 tours utilisateur ; borne le coût par requête.
const MAX_PRODUCTS_IN_CONTEXT = 20;  // suffisant pour la plupart des boutiques MVP.

// Marqueur de repli : quand le modèle est incapable de répondre, il écrit
// exactement cette sentinelle. Le widget frontend l'utilise pour afficher
// automatiquement le CTA WhatsApp — indépendant du réglage `alwaysOffer`.
const UNKNOWN_SENTINEL = '[[UNKNOWN]]';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY manquant — le botstore ne peut pas répondre.');
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Construit le system prompt injecté à Claude. Résumé compact — on privilégie
 * les infos actionnables (prix, dispo) au blabla marketing pour rester dans
 * le budget tokens et pour que le bot cite les vrais chiffres.
 */
function buildSystemPrompt(store: IStore, products: IProduct[]): string {
  const s = store.settings || ({} as IStore['settings']);
  const bot = s.botstore || {};
  const persona = bot.persona?.trim() || 'Amical, concis, tutoie le client.';
  const instructions = bot.instructions?.trim();
  const currency = s.currency || 'XOF';
  const country = s.country || (store.markets?.[0]?.country ?? '');
  const shippingFee = s.codForm?.shippingFee;
  const marketList = (store.markets || [])
    .filter((m) => m.enabled !== false)
    .map((m) => `${m.country} (${m.currency})`)
    .join(', ');

  const productLines = products
    .slice(0, MAX_PRODUCTS_IN_CONTEXT)
    .map((p) => {
      const price = typeof p.price === 'number' ? `${p.price} ${currency}` : '—';
      const stock = p.trackInventory
        ? (typeof p.stock === 'number' && p.stock > 0 ? `stock ${p.stock}` : 'rupture')
        : 'dispo';
      const desc = (p.description || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      return `- ${p.name} — ${price} · ${stock}${desc ? ` · ${desc}` : ''}`;
    })
    .join('\n');

  return [
    `Tu es l'assistant chatbot de la boutique en ligne "${store.name}".`,
    `Ta mission : répondre aux questions des visiteurs à propos de cette boutique et de ses produits, uniquement.`,
    ``,
    `## Ton`,
    persona,
    ``,
    `## Boutique`,
    store.description ? `Description : ${store.description}` : null,
    country ? `Pays : ${country}` : null,
    `Devise : ${currency}`,
    marketList ? `Pays livrés : ${marketList}` : null,
    typeof shippingFee === 'number' && shippingFee > 0
      ? `Frais de livraison : ${shippingFee} ${currency}`
      : null,
    ``,
    `## Produits (${products.length} au total, ${Math.min(products.length, MAX_PRODUCTS_IN_CONTEXT)} affichés) :`,
    productLines || '(aucun produit publié pour le moment)',
    ``,
    instructions ? `## Consignes du vendeur\n${instructions}\n` : null,
    ``,
    `## Règles`,
    `- Réponds SEULEMENT à partir des infos ci-dessus. Ne devine ni prix, ni stock, ni délais.`,
    `- Si la question sort du périmètre de la boutique (météo, actualité, autre marque, code, etc.), redirige poliment vers les produits.`,
    `- Si tu ne connais pas la réponse à une question légitime sur la boutique (ex : SAV spécifique, retour, adresse physique), réponds EXACTEMENT par ${UNKNOWN_SENTINEL} suivi d'une courte phrase invitant à contacter le vendeur. Le frontend affichera alors un bouton WhatsApp.`,
    `- Réponses courtes (2-4 phrases max), pas de listes à puces sauf si vraiment nécessaire.`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Interroge Claude avec le contexte du store + l'historique conversationnel
 * fourni par le widget. L'historique est tronqué aux N derniers messages pour
 * borner le coût — Claude gère le fait qu'un ancien tour manque.
 */
export async function botstoreChat(args: BotstoreChatArgs): Promise<BotstoreChatResult> {
  const { store, products, history, message } = args;
  const systemPrompt = buildSystemPrompt(store, products);

  const cappedHistory = history.slice(-MAX_HISTORY);
  const messages: Anthropic.MessageParam[] = [
    ...cappedHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message },
  ];

  try {
    const resp = await getClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // System prompt marqué cacheable — la définition boutique + produits ne
      // change pas d'un message à l'autre, ce qui divise le coût input par ~10.
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages,
    });

    const rawReply = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    const isUnknown = rawReply.startsWith(UNKNOWN_SENTINEL);
    const reply = isUnknown ? rawReply.replace(UNKNOWN_SENTINEL, '').trim() : rawReply;

    return {
      reply: reply || 'Désolé, je n\'ai pas pu générer de réponse. Essaie de reformuler ?',
      offerWhatsappFallback: isUnknown,
      model: resp.model,
    };
  } catch (err) {
    logger.error(
      { err: (err as Error).message, storeSlug: store.slug },
      '[botstore] Claude call failed',
    );
    // Message générique + fallback WhatsApp toujours proposé pour ne pas
    // laisser le client sans issue en cas de panne LLM.
    return {
      reply: 'Le chatbot est momentanément indisponible. Contactez-nous directement pour toute question.',
      offerWhatsappFallback: true,
      model: MODEL,
    };
  }
}
