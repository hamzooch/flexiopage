/**
 * Scripted chatbot trees for FlexiooPage.
 *
 * Two flavours:
 *   - flexiopageScript    → marketing landing (prospects asking about the SaaS)
 *   - buildStoreScript()  → customer-facing store pages (shoppers about to buy)
 *
 * Each tree is a flat map keyed by node id. A node carries the bot's
 * message + optional quick-reply buttons. A quick reply either jumps to
 * another node (`goto`) or opens an external URL (`href`).
 */

export type ChatScriptNode = {
  message: string;
  quickReplies?: Array<{
    label: string;
    goto?: string;
    href?: string;
    /** Mark a reply as the "primary" action — styled with the brand gradient. */
    primary?: boolean;
  }>;
};

export type ChatScript = {
  /** Starting node id — usually 'welcome'. */
  start: string;
  /** Display name shown next to the avatar. */
  botName: string;
  /** Optional sub-line under the name. */
  botRole?: string;
  /** Map of node id → node. */
  nodes: Record<string, ChatScriptNode>;
};

// ── FlexiooPage marketing landing ──────────────────────────────────────
export const flexiopageScript: ChatScript = {
  start: 'welcome',
  botName: 'Flexio',
  botRole: 'Assistant FlexiooPage',
  nodes: {
    welcome: {
      message:
        "Salut 👋 Je suis Flexio, l'assistant FlexiooPage. Comment je peux t'aider ?",
      quickReplies: [
        { label: 'Comment ça marche ?', goto: 'how' },
        { label: 'Combien ça coûte ?', goto: 'pricing' },
        { label: 'Créer ma boutique', href: '/register', primary: true },
        { label: 'Autre question', goto: 'other' },
      ],
    },
    how: {
      message:
        "Tu crées ton compte, l'IA génère ta landing page (texte + visuels), tu actives le paiement à la livraison. À chaque commande, MogaDelivery prend le relais : livraison + collecte de l'argent. Tu reçois ton paiement net après commission.",
      quickReplies: [
        { label: 'Combien coûte la commission ?', goto: 'pricing' },
        { label: 'Comment je commence ?', goto: 'start' },
        { label: 'Retour au menu', goto: 'welcome' },
      ],
    },
    pricing: {
      message:
        "Pas d'abonnement, pas de carte bancaire à la création. Tu paies une commission **uniquement sur les commandes livrées et payées**. Pas de ventes = 0 frais.",
      quickReplies: [
        { label: 'Et la livraison ?', goto: 'delivery' },
        { label: 'Je veux commencer', href: '/register', primary: true },
        { label: 'Retour au menu', goto: 'welcome' },
      ],
    },
    delivery: {
      message:
        "MogaDelivery est intégré gratuitement : le coursier passe chez toi récupérer la commande, livre au client, encaisse l'argent, te le reverse. Suivi temps réel dans ton dashboard.",
      quickReplies: [
        { label: 'Quels pays ?', goto: 'countries' },
        { label: 'Combien ça coûte ?', goto: 'pricing' },
        { label: 'Retour au menu', goto: 'welcome' },
      ],
    },
    countries: {
      message:
        "16 pays préconfigurés : Maroc, Tunisie, Algérie, Sénégal, Côte d'Ivoire, et 11 autres. Interface en Français, Arabe et Darija avec support RTL natif.",
      quickReplies: [
        { label: 'Créer ma boutique', href: '/register', primary: true },
        { label: 'Retour au menu', goto: 'welcome' },
      ],
    },
    start: {
      message:
        "Très simple : inscription en 60 secondes (juste email + mot de passe), pas besoin de carte bancaire. Une fois dedans, tu décris ton produit et l'IA fait le reste.",
      quickReplies: [
        { label: "Je m'inscris", href: '/register', primary: true },
        { label: "J'ai déjà un compte", href: '/login' },
        { label: 'Retour au menu', goto: 'welcome' },
      ],
    },
    other: {
      message:
        "Pas de souci 🙂 Écris-nous directement sur WhatsApp, on répond rapidement aux questions personnalisées.",
      quickReplies: [
        { label: 'Ouvrir WhatsApp', href: 'https://wa.me/212600000000', primary: true },
        { label: 'Retour au menu', goto: 'welcome' },
      ],
    },
  },
};

// ── Customer-store chatbot (per shop) ─────────────────────────────────
export function buildStoreScript(opts: {
  storeName: string;
  whatsapp?: string;
  phone?: string;
}): ChatScript {
  const { storeName, whatsapp, phone } = opts;
  const contactReplies = [
    whatsapp && {
      label: 'WhatsApp',
      href: `https://wa.me/${whatsapp.replace(/[^\d]/g, '')}`,
      primary: true as const,
    },
    phone && { label: 'Appeler', href: `tel:${phone}` },
    { label: 'Retour au menu', goto: 'welcome' },
  ].filter(Boolean) as ChatScriptNode['quickReplies'];

  return {
    start: 'welcome',
    botName: storeName,
    botRole: 'Assistant boutique',
    nodes: {
      welcome: {
        message: `Bienvenue chez ${storeName} 👋 Comment je peux t'aider ?`,
        quickReplies: [
          { label: 'Comment commander ?', goto: 'how_order' },
          { label: 'Frais et délais de livraison', goto: 'delivery' },
          { label: 'Mode de paiement', goto: 'payment' },
          { label: 'Parler à un humain', goto: 'contact' },
        ],
      },
      how_order: {
        message:
          "Choisis ton produit, clique sur **Commander**, remplis ton nom + téléphone + adresse. On te rappelle sous 24 h pour confirmer, puis le coursier te livre.",
        quickReplies: [
          { label: 'Frais de livraison', goto: 'delivery' },
          { label: 'Comment payer ?', goto: 'payment' },
          { label: 'Retour au menu', goto: 'welcome' },
        ],
      },
      delivery: {
        message:
          "Livraison à domicile via MogaDelivery, généralement sous 24-72 h selon ta ville. Les frais exacts sont calculés au moment de la commande.",
        quickReplies: [
          { label: 'Comment commander ?', goto: 'how_order' },
          { label: 'Parler à un humain', goto: 'contact' },
          { label: 'Retour au menu', goto: 'welcome' },
        ],
      },
      payment: {
        message:
          "**Paiement à la livraison (cash)** — tu paies en espèces au coursier au moment de recevoir ta commande. Pas besoin de carte bancaire.",
        quickReplies: [
          { label: 'Comment commander ?', goto: 'how_order' },
          { label: 'Délais de livraison', goto: 'delivery' },
          { label: 'Retour au menu', goto: 'welcome' },
        ],
      },
      contact: {
        message: contactReplies && contactReplies.length > 1
          ? 'Je te mets en contact avec un vrai humain 👤'
          : "Pas de contact direct disponible pour le moment — réessaie via le bouton Commander, on te rappellera.",
        quickReplies: contactReplies,
      },
    },
  };
}
