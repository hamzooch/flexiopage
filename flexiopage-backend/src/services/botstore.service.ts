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
import {
  placeBotstoreOrder,
  productPath,
  storeCommerce,
  toCatalogLine,
  variantChoices,
  type BotstoreOrderCard,
  type PlaceOrderInput,
  type VariantChoice,
} from './botstore-order';

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
  /** Présent quand le tour a enregistré (ou retrouvé) une commande. */
  order?: BotstoreOrderCard;
  /** Variantes cliquables quand le produit en a et que le client n'a pas choisi. */
  choices?: VariantChoice[];
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
  const commerce = storeCommerce(store);
  const currency = commerce.currency;
  const country = commerce.country || s.country || (store.markets?.[0]?.country ?? '');
  const marketList = (store.markets || [])
    .filter((m) => m.enabled !== false)
    .map((m) => `${m.country} (${m.currency})`)
    .join(', ');

  const catalog = products.slice(0, MAX_PRODUCTS_IN_CONTEXT).map(toCatalogLine);
  const productLines = catalog
    .map((p) => {
      const price = typeof p.price === 'number' ? `${p.price} ${currency}` : '—';
      const stock = p.trackInventory
        ? (typeof p.stock === 'number' && p.stock > 0 ? `stock ${p.stock}` : 'rupture')
        : 'dispo';
      const source = products.find((item) => String(item._id) === p.id);
      const desc = (source?.description || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      const variants = p.variants.length
        ? `\n  variantes : ${p.variants.map((variant) => `${variant.name} (${variant.price} ${currency}, stock ${variant.stock})`).join(', ')}`
        : '';
      const kind = p.type === 'digital' ? ' · paiement en ligne' : '';
      return `- ${p.name} — ${price} · ${stock}${kind} · ${productPath(store.slug, p.slug)}${desc ? ` · ${desc}` : ''}${variants}`;
    })
    .join('\n');

  const orderMode = commerce.physical
    ? `Cette boutique livre à domicile (paiement à la livraison). Frais de livraison : ${commerce.shippingFee} ${commerce.currency}. Tu PEUX enregistrer la commande avec l'outil place_order.`
    : `Cette boutique est digitale : tu ne crées PAS de commande. Tu envoies le client vers la fiche produit pour payer en ligne.`;

  return [
    `Tu es l'assistant chatbot de la boutique en ligne "${store.name}".`,
    `Tu réponds uniquement pour CETTE boutique. Tu aides le visiteur à choisir un produit et à passer commande.`,
    orderMode,
    ``,
    `## Ton`,
    persona,
    ``,
    `## Boutique`,
    store.description ? `Description : ${store.description}` : null,
    country ? `Pays : ${country}` : null,
    `Devise : ${currency}`,
    marketList ? `Pays livrés : ${marketList}` : null,
    ``,
    `## Produits (${products.length} au total, ${Math.min(products.length, MAX_PRODUCTS_IN_CONTEXT)} affichés) :`,
    productLines || '(aucun produit publié pour le moment)',
    ``,
    instructions ? `## Consignes du vendeur\n${instructions}\n` : null,
    ``,
    `## Prise de commande`,
    `- Propose les produits du catalogue (nom, prix, stock). N'invente rien.`,
    `- Pour commander : demande le produit et la quantité. S'il a des variantes, demande-en UNE avec les noms exacts du catalogue (le client peut répondre juste « M » ou « Noir ») avant le nom, le téléphone, la ville et l'adresse.`,
    `- Avant place_order, récapitule les articles, les frais de livraison et le total, puis attends un oui explicite (« oui », « je confirme », « valide »).`,
    `- Un seul appel place_order par commande, avec tous les articles.`,
    `- Après un succès, confirme le numéro de commande et dis que le paiement se fait à la livraison.`,
    `- Produit digital : donne le lien de la fiche, ne crée pas de commande.`,
    ``,
    `## Règles`,
    `- Réponds SEULEMENT à partir des infos ci-dessus. Ne devine ni prix, ni stock, ni délais.`,
    `- Si la question sort du périmètre de la boutique (météo, actualité, autre marque, code, etc.), redirige poliment vers les produits.`,
    `- Si tu ne connais pas la réponse à une question légitime sur la boutique (ex : SAV spécifique, retour, adresse physique), réponds EXACTEMENT par ${UNKNOWN_SENTINEL} suivi d'une courte phrase invitant à contacter le vendeur. Le frontend affichera alors un bouton WhatsApp.`,
    `- Réponses courtes (2-4 phrases max), pas de listes à puces sauf si vraiment nécessaire.`,
    `- Réponds dans la langue du visiteur (français, darija ou anglais).`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Interroge Claude avec le contexte du store + l'historique conversationnel
 * fourni par le widget. L'historique est tronqué aux N derniers messages pour
 * borner le coût — Claude gère le fait qu'un ancien tour manque.
 */
const PLACE_ORDER_TOOL: Anthropic.Tool = {
  name: 'place_order',
  description:
    "Enregistre UNE commande paiement à la livraison pour CETTE boutique, uniquement après un oui explicite du client. Les prix et le stock sont recalculés côté serveur : ne les invente pas. Mets tous les articles dans le même appel.",
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Articles confirmés.',
        items: {
          type: 'object',
          properties: {
            product_name: { type: 'string', description: 'Nom exact du produit dans le catalogue.' },
            variant_name: { type: 'string', description: 'Nom exact de la variante choisie (ex. M, Noir). Obligatoire si le produit a des variantes.' },
            quantity: { type: 'number', description: 'Quantité, entre 1 et 99.' },
          },
          required: ['product_name', 'quantity'],
        },
      },
      customer_name: { type: 'string' },
      customer_phone: { type: 'string' },
      customer_city: { type: 'string' },
      customer_address: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['items', 'customer_name', 'customer_phone', 'customer_city', 'customer_address'],
  },
};

function readPlaceOrderInput(raw: unknown): PlaceOrderInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const items = Array.isArray(body.items)
    ? body.items
        .map((item) => {
          const row = item as Record<string, unknown>;
          return {
            product_name: typeof row?.product_name === 'string' ? row.product_name : '',
            variant_name: typeof row?.variant_name === 'string' ? row.variant_name : undefined,
            quantity: Number(row?.quantity) || 1,
          };
        })
        .filter((item) => item.product_name.trim())
    : [];
  if (!items.length) return null;
  return {
    items,
    customer_name: typeof body.customer_name === 'string' ? body.customer_name : '',
    customer_phone: typeof body.customer_phone === 'string' ? body.customer_phone : '',
    customer_city: typeof body.customer_city === 'string' ? body.customer_city : '',
    customer_address: typeof body.customer_address === 'string' ? body.customer_address : '',
    notes: typeof body.notes === 'string' ? body.notes : undefined,
  };
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

export async function botstoreChat(args: BotstoreChatArgs): Promise<BotstoreChatResult> {
  const { store, products, history, message } = args;
  const systemPrompt = buildSystemPrompt(store, products);
  const catalog = products.map(toCatalogLine);

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-MAX_HISTORY).map((turn) => ({ role: turn.role, content: turn.content })),
    { role: 'user' as const, content: message },
  ];

  let order: BotstoreOrderCard | undefined;
  let model = MODEL;
  const pack = (reply: string, offerWhatsappFallback: boolean): BotstoreChatResult => {
    const choices = order ? undefined : variantChoices({ products: catalog, userText: message, reply });
    return {
      reply,
      offerWhatsappFallback,
      model,
      order,
      choices: choices && choices.length > 0 ? choices : undefined,
    };
  };

  try {
    for (let round = 0; round < 3; round += 1) {
      const resp = await getClient().messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        tools: [PLACE_ORDER_TOOL],
        messages,
      });
      model = resp.model;
      const toolUses = resp.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
      if (!toolUses.length) {
        const rawReply = textOf(resp.content);
        const isUnknown = rawReply.startsWith(UNKNOWN_SENTINEL);
        const reply = isUnknown ? rawReply.replace(UNKNOWN_SENTINEL, '').trim() : rawReply;
        return pack(
          reply || (order
            ? `Commande ${order.orderNumber} enregistrée. Paiement à la livraison.`
            : 'Désolé, je n\'ai pas pu générer de réponse. Essaie de reformuler ?'),
          isUnknown,
        );
      }

      messages.push({ role: 'assistant', content: resp.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tool of toolUses) {
        if (tool.name !== 'place_order') {
          results.push({ type: 'tool_result', tool_use_id: tool.id, content: JSON.stringify({ ok: false, error: 'Outil inconnu.' }) });
          continue;
        }
        if (order) {
          results.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: JSON.stringify({ ok: true, reused: true, orderNumber: order.orderNumber }),
          });
          continue;
        }
        const input = readPlaceOrderInput(tool.input);
        const placed = input
          ? await placeBotstoreOrder({ store, products: catalog, input })
          : { ok: false as const, error: 'Informations de commande incomplètes.' };
        if (placed.ok) order = placed.order;
        results.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: JSON.stringify(placed.ok
            ? {
                ok: true,
                orderNumber: placed.order.orderNumber,
                total: placed.order.total,
                currency: placed.order.currency,
                shippingCost: placed.order.shippingCost,
                items: placed.order.items,
                reused: placed.reused,
              }
            : { ok: false, error: placed.error }),
        });
      }
      messages.push({ role: 'user', content: results });
    }

    return pack(
      order
        ? `Commande ${order.orderNumber} enregistrée. Total ${order.total} ${order.currency}, paiement à la livraison.`
        : 'Je n\'ai pas réussi à finaliser. Tu peux reformuler ta commande ?',
      !order,
    );
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
