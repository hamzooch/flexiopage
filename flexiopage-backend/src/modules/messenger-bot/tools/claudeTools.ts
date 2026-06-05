/**
 * Définitions des tools exposés à Claude pour la conversation Messenger.
 *
 * Le dernier tool porte `cache_control: ephemeral` : combiné au system prompt
 * mis en cache, ça permet à Anthropic de mettre en cache tout le préfixe stable
 * (persona + catalogue + définitions de tools) → coût input fortement réduit
 * sur un échange de plusieurs messages.
 */
import type Anthropic from '@anthropic-ai/sdk';

export const claudeTools: Anthropic.Tool[] = [
  {
    name: 'create_order',
    description:
      "Créer une commande COD (paiement à la livraison) dans Flexiopage une fois TOUTES les informations collectées et confirmées par le client. N'appelle ce tool que si le client a explicitement confirmé.\n\n🛒 PLUSIEURS PRODUITS : si le client commande PLUS d'un produit (ex: 'je veux 2 caméras + 1 support' ou 'ajoute aussi un câble'), utilise le paramètre `items` qui prend un TABLEAU. Pour UN seul produit, tu peux soit utiliser `items` avec un seul élément, soit les anciens champs `product_name` + `quantity` (rétro-compat). NE JAMAIS appeler create_order plusieurs fois pour un même client — TOUS les produits doivent être dans le MÊME appel.",
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: "Tableau de produits commandés. Préférer ce champ dès qu'il y a >= 2 produits. Chaque élément = { product_name, quantity, product_id? }.",
          items: {
            type: 'object',
            properties: {
              product_name: { type: 'string', description: 'Nom exact du produit (depuis le catalogue).' },
              product_id: { type: 'string', description: 'Identifiant du produit si connu.' },
              quantity: { type: 'number', description: 'Quantité commandée pour ce produit (>= 1).' },
            },
            required: ['product_name', 'quantity'],
          },
        },
        product_name: { type: 'string', description: '(Legacy — pour un seul produit) Nom exact du produit choisi.' },
        product_id: { type: 'string', description: '(Legacy) Identifiant du produit si connu.' },
        quantity: { type: 'number', description: '(Legacy) Quantité commandée (>= 1).' },
        customer_name: { type: 'string', description: 'Nom complet du client.' },
        customer_phone: { type: 'string', description: 'Téléphone du client (format local).' },
        customer_city: { type: 'string', description: 'Ville de livraison.' },
        customer_address: { type: 'string', description: 'Adresse complète de livraison.' },
        notes: { type: 'string', description: 'Remarques éventuelles (taille, couleur, instructions).' },
      },
      required: ['customer_name', 'customer_phone', 'customer_city', 'customer_address'],
    },
  },
  {
    name: 'check_product_availability',
    description: "Vérifier si un produit est disponible / en stock avant de proposer la commande.",
    input_schema: {
      type: 'object',
      properties: {
        product_name: { type: 'string', description: 'Nom du produit à vérifier.' },
        product_id: { type: 'string', description: 'Identifiant du produit si connu.' },
      },
      required: ['product_name'],
    },
  },
  {
    name: 'get_shipping_fee',
    description: "Obtenir les frais de livraison pour une ville donnée du pays du vendeur.",
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'Ville de livraison du client.' },
      },
      required: ['city'],
    },
  },
  {
    name: 'escalate_to_human',
    description:
      "⚠️ Outil de DERNIER RECOURS. À utiliser EXCLUSIVEMENT pour : (a) une réclamation d'un client mécontent (produit cassé, retard de livraison qu'il signale, demande de remboursement), (b) un litige sur un montant déjà facturé, (c) un comportement hors-sujet répété malgré 2 relances vers les produits. NE JAMAIS utiliser cet outil pour : confirmer une commande (utilise create_order à la place), répondre à 'salut/bonjour', donner les frais de livraison, présenter le catalogue, ou toute interaction commerciale standard. En cas de doute, ne PAS l'utiliser.",
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: "Raison concise de l'escalade." },
      },
      required: ['reason'],
    },
    // Cache le préfixe stable (system + tools) pour réduire le coût input.
    cache_control: { type: 'ephemeral' },
  },
];
