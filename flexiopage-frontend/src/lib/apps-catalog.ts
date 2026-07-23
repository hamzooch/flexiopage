/**
 * Registry unique des applications proposées dans /dashboard/apps.
 *
 * Deux parties :
 *   1. APPS — carte visible dans la grille (id, nom, tagline, icône, catégorie,
 *      disponibilité). C'est ce qui alimente le sélecteur.
 *   2. APP_DETAILS — page « fiche d'application » ouverte quand le vendeur
 *      clique sur une carte. Décrit longuement, liste des features, et pointe
 *      vers l'écran de configuration (ou l'activation inline) via `configPath`.
 *
 * Ce fichier n'importe RIEN de lourd (pas d'icône ici — les icônes viennent
 * lucide-react au point d'usage) pour rester purement des données.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  MessageSquare,
  Bell,
  FileSpreadsheet,
  Mail,
  Zap,
  ShoppingBag,
} from 'lucide-react';

export type AppId =
  | 'google-sheets'
  | 'mailchimp'
  | 'slack'
  | 'zapier'
  | 'discord'
  | 'messenger-bot'
  | 'whatsapp-bot'
  | 'telegram-bot'
  | 'sales-popup'
  | 'whatsapp-notifications'
  | 'botstore';

export type AppCategory = 'Productivity' | 'Marketing' | 'Notifications' | 'Automation';

export interface AppDef {
  id: AppId;
  name: string;
  /** Tagline courte utilisée sur la carte + méta-description de la fiche. */
  description: string;
  category: AppCategory;
  icon: LucideIcon;
  /** Classe Tailwind `from-… to-…` — utilisée pour tous les gradients de l'app. */
  accent: string;
  /** false = "Bientôt disponible" — carte non cliquable et fiche marquée en attente. */
  available: boolean;
}

export const APPS: AppDef[] = [
  {
    id: 'messenger-bot',
    name: 'Messenger Bot',
    description: 'Chatbot IA qui répond en darija/français et crée les commandes COD depuis ta page Facebook.',
    category: 'Automation',
    icon: Bot,
    accent: 'from-blue-500 to-indigo-600',
    available: true,
  },
  {
    id: 'whatsapp-bot',
    name: 'WhatsApp Bot',
    description: 'Même assistant IA, sur WhatsApp : répond aux clients et crée les commandes COD automatiquement.',
    category: 'Automation',
    icon: MessageSquare,
    accent: 'from-green-500 to-emerald-600',
    available: true,
  },
  {
    id: 'telegram-bot',
    name: 'Telegram Bot',
    description: 'Notifications de commandes, messages et alertes directement sur Telegram. Gratuit!',
    category: 'Notifications',
    icon: MessageSquare,
    accent: 'from-sky-500 to-blue-600',
    available: true,
  },
  {
    id: 'sales-popup',
    name: 'Sales Popup',
    description: 'Preuve sociale : petite notif qui affiche les achats récents à chaque visiteur de ta boutique.',
    category: 'Marketing',
    icon: ShoppingBag,
    accent: 'from-pink-500 to-rose-600',
    available: true,
  },
  {
    id: 'whatsapp-notifications',
    name: 'Notifications Client WhatsApp',
    description: 'Envoie auto un WhatsApp au client à la création, confirmation et dispatch de sa commande. Utilise la session du chatbot.',
    category: 'Notifications',
    icon: Bell,
    accent: 'from-emerald-500 to-teal-600',
    available: true,
  },
  {
    id: 'botstore',
    name: 'Botstore',
    description: 'Chatbot IA en direct sur ta boutique : répond aux visiteurs à partir de tes produits, avec fallback WhatsApp intégré.',
    category: 'Automation',
    icon: Bot,
    accent: 'from-indigo-500 to-fuchsia-600',
    available: true,
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    description: 'Pousse chaque commande vers une feuille de calcul Google.',
    category: 'Productivity',
    icon: FileSpreadsheet,
    accent: 'from-emerald-500 to-green-600',
    available: true,
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    description: "Synchronise tes clients vers ta liste d'emails.",
    category: 'Marketing',
    icon: Mail,
    accent: 'from-amber-500 to-orange-600',
    available: false,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Reçois une notif Slack à chaque nouvelle commande.',
    category: 'Notifications',
    icon: MessageSquare,
    accent: 'from-violet-500 to-purple-600',
    available: false,
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Notifications dans ton serveur Discord.',
    category: 'Notifications',
    icon: Bell,
    accent: 'from-indigo-500 to-blue-600',
    available: false,
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Connecte ta boutique à 5 000+ apps via webhook.',
    category: 'Automation',
    icon: Zap,
    accent: 'from-orange-500 to-red-600',
    available: false,
  },
];

export interface AppDetail {
  /** Baseline pitch (2-4 phrases) affiché sous le hero. */
  longDescription: string;
  /** Bullet points « ce que l'app fait » — 3-6 items max, 1 ligne chacun. */
  features: string[];
  /** Comment ça marche en 3 étapes — optionnel, pour rassurer le vendeur. */
  howItWorks?: string[];
  /**
   * Chemin de configuration ouvert par le bouton Installer.
   *   - Route absolue → `router.push(configPath(storeId))`
   *   - `undefined` → l'app n'a pas d'écran dédié (coming-soon).
   *   - Renvoie ?open=<id> vers /dashboard/apps quand l'app se configure inline.
   */
  configPath?: (storeId: string) => string;
  /** Label du bouton d'installation (défaut « Installer l'application »). */
  installLabel?: string;
  /** Requis avant de pouvoir installer — affiché en encart d'info. */
  prerequisites?: string[];
}

export const APP_DETAILS: Record<AppId, AppDetail> = {
  'messenger-bot': {
    longDescription:
      "Un chatbot IA qui s'installe sur ta page Facebook et répond aux messages entrants en darija, français ou anglais. Il comprend les demandes clients, propose les bons produits et crée les commandes COD à ta place — 24h/24.",
    features: [
      'Répond automatiquement aux messages Messenger en darija/français/arabe',
      'Détecte les intentions (commande, question, réclamation) et adapte sa réponse',
      'Crée des commandes COD complètes sans intervention manuelle',
      'Rattrapé par toi à tout moment via le dashboard (mode superviseur)',
      'Prompt caching activé — coût par message très bas',
    ],
    howItWorks: [
      "Connecte ta page Facebook via Meta Developer (une seule fois)",
      "Configure la personnalité, le catalogue et les zones de livraison",
      "Le bot prend le relais à chaque nouveau message et enregistre les commandes",
    ],
    configPath: (storeId) => `/dashboard/apps/messenger-bot?storeId=${storeId}`,
  },
  'whatsapp-bot': {
    longDescription:
      "Le même assistant IA, mais sur WhatsApp. Le client t'écrit sur ton numéro WhatsApp classique et le bot répond, propose les produits et enregistre la commande. Aucune API Meta payante — on utilise WasenderAPI + un scan QR unique.",
    features: [
      "Répond 24/7 sur ton numéro WhatsApp Business existant",
      "Crée les commandes COD à partir de la conversation",
      "Multi-langue (darija, français, arabe, anglais)",
      "Session persistante — tu ne re-scannes le QR qu'en cas de déconnexion Meta",
      "Base de la fonctionnalité « Notifications Client WhatsApp »",
    ],
    howItWorks: [
      "Scanne un QR code depuis ton téléphone (WhatsApp → Appareils connectés)",
      "Personnalise le ton et les consignes du bot",
      "Le bot répond à chaque message et crée les commandes automatiquement",
    ],
    configPath: (storeId) => `/dashboard/apps/whatsapp-bot?storeId=${storeId}`,
  },
  'telegram-bot': {
    longDescription:
      "Un bot Telegram gratuit qui te ping en temps réel à chaque nouvelle commande, message ou alerte. Idéal si tu passes ta journée sur Telegram et que tu veux tout suivre depuis un seul endroit.",
    features: [
      'Notification instantanée sur chaque commande créée',
      "Alertes SAV et messages clients centralisés",
      'Compatible groupe Telegram (partage avec ton équipe)',
      'Gratuit et illimité — pas de quota SMS/WhatsApp à surveiller',
    ],
    howItWorks: [
      'Crée un bot Telegram via @BotFather (2 minutes)',
      'Colle le token dans FlexioPage',
      'Reçois toutes tes notifications au fil de la journée',
    ],
    configPath: () => `/dashboard/apps/telegram-bot`,
  },
  'sales-popup': {
    longDescription:
      "Une petite notification sociale qui apparaît en bas de ta boutique : « Ahmed de Casablanca vient d'acheter X ». Prouve à chaque visiteur qu'il n'est pas seul et augmente la conversion sans effort.",
    features: [
      "Affiche automatiquement les vraies commandes récentes (anonymisées)",
      "Fallback exemples pour les boutiques qui démarrent",
      "Position, couleur et fréquence 100 % personnalisables",
      "Aucun impact sur les performances — script léger",
    ],
    howItWorks: [
      'Active la fonctionnalité et choisis la position',
      "Ajoute quelques exemples si tu débutes",
      "La popup apparaît sur toutes les pages boutique",
    ],
    configPath: () => `/dashboard/apps?open=sales-popup`,
    installLabel: 'Configurer les popups',
  },
  'whatsapp-notifications': {
    longDescription:
      "Un WhatsApp automatique à ton client à chaque étape clé : commande créée, confirmation par téléphone, colis dispatché. Réutilise la session WhatsApp Bot — pas de reconnexion, pas de coût supplémentaire.",
    features: [
      "3 triggers indépendants : création, confirmation, dispatch",
      "Templates entièrement personnalisables avec placeholders ({{customerName}}, {{orderNumber}}…)",
      "Idempotence par (commande, trigger) — jamais de doublon",
      "Réutilise la session du WhatsApp Bot — zéro configuration Meta",
    ],
    howItWorks: [
      'Assure-toi que le WhatsApp Bot est connecté',
      "Choisis quels triggers activer et personnalise le texte",
      "Chaque changement de statut envoie automatiquement le message",
    ],
    configPath: (storeId) => `/dashboard/apps/whatsapp-notifications?storeId=${storeId}`,
    prerequisites: ['WhatsApp Bot connecté (utilise la même session)'],
  },
  'google-sheets': {
    longDescription:
      "Chaque commande atterrit automatiquement dans une feuille Google Sheets, sans OAuth. Tu déploies un petit Apps Script (fourni en un clic), tu colles l'URL, et tes commandes remplissent la feuille en temps réel.",
    features: [
      'Aucun compte Google Cloud requis — Apps Script gratuit',
      "Ligne complète par commande : client, adresse, items, total",
      'Compatible Google Sheets classique — filtre, tri, formules à volonté',
      "Test intégré : vérifie la connexion avant activation",
    ],
    howItWorks: [
      "Copie le snippet Apps Script fourni dans FlexioPage",
      "Colle-le dans Extensions → Apps Script de ta feuille",
      "Récupère l'URL de déploiement et colle-la ici",
    ],
    configPath: () => `/dashboard/apps?open=google-sheets`,
    installLabel: 'Configurer Google Sheets',
  },
  botstore: {
    longDescription:
      "Un chatbot IA installé directement sur la storefront de ta boutique. Le visiteur clique sur la bulle en bas de page, pose sa question (« ce produit est-il en stock ? », « livrez-vous à Rabat ? ») et le bot répond en s'appuyant sur ton catalogue et tes réglages. Fallback WhatsApp intégré quand le bot ne sait pas.",
    features: [
      "Répond à partir de tes produits publiés (nom, prix, stock, description)",
      'Personnalité et consignes 100 % personnalisables',
      "Fallback WhatsApp : le visiteur peut passer à un humain en 1 clic",
      "Modèle Claude Haiku 4.5 avec prompt caching — coût par réponse minimal",
      'Alternative au bouton WhatsApp — un seul point de contact visible',
    ],
    howItWorks: [
      'Active le Botstore et personnalise le ton',
      "Ajoute quelques consignes spécifiques (livraison, retours, promo…)",
      "La bulle apparaît sur toutes les pages boutique. Le bot connaît déjà tes produits.",
    ],
    configPath: (storeId) => `/dashboard/apps/botstore?storeId=${storeId}`,
    prerequisites: [
      "Numéro WhatsApp configuré (optionnel — pour activer le fallback humain)",
    ],
  },
  mailchimp: {
    longDescription:
      "Bientôt : synchronise automatiquement tes clients vers ta liste d'audience Mailchimp pour les relancer par email (nouveautés, remises, paniers abandonnés).",
    features: [
      "Import automatique des nouveaux clients dans une liste dédiée",
      "Tags par catégorie de produit acheté",
      "Événements « commande passée » propagés dans Mailchimp",
    ],
  },
  slack: {
    longDescription:
      "Bientôt : reçois une notification Slack dans le canal de ton choix à chaque nouvelle commande, réclamation ou événement clé.",
    features: [
      'Alertes commande dans un canal dédié',
      "Résumé quotidien des ventes",
      "Compatible workflow Slack (approbations, escalations)",
    ],
  },
  discord: {
    longDescription:
      "Bientôt : les mêmes notifications que Slack, mais dans ton serveur Discord (idéal pour les communautés créateurs / dropshippers).",
    features: [
      'Webhooks Discord natifs',
      "Alertes commandes et messages centralisées",
      "Rôles Discord notifiables (@Boutique, @SAV…)",
    ],
  },
  zapier: {
    longDescription:
      "Bientôt : un webhook Zapier permet de connecter FlexioPage à 5 000+ apps (Airtable, HubSpot, Notion, Google Docs…) sans écrire une ligne de code.",
    features: [
      'Trigger « Nouvelle commande » disponible dans Zapier',
      "Actions vers 5 000+ apps",
      "Filtres et transformations Zapier natifs",
    ],
  },
};

/** Accès direct par id, fail-safe pour les composants (les cartes rendues sans détail ne cassent pas). */
export function getApp(id: AppId): AppDef | undefined {
  return APPS.find((a) => a.id === id);
}

export function getAppDetail(id: AppId): AppDetail | undefined {
  return APP_DETAILS[id];
}
