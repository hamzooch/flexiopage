/**
 * Builders dynamiques réutilisés par le system prompt : ton de la personnalité,
 * langue/dialecte, blocs catalogue / frais de livraison, villes valides par pays.
 *
 * Pays & devises proviennent désormais de la liste maître `src/data/countries.ts`
 * (le bot WhatsApp/Messenger est utilisé par des vendeurs dans TOUS les marchés),
 * et ne sont plus limités au Maghreb.
 */
import type { BotConfig, IBotConfig, BotLanguage, BotCountry, AiPersonality } from '../models/BotConfig.model';
import { COUNTRIES, currencyForCountry } from '../../../data/countries';

/** Produit normalisé pour l'injection dans le prompt (catalogue auto + custom). */
export interface CatalogProduct {
  id?: string;
  name: string;
  price: number;
  description?: string;
  stock?: number;
  landing_url?: string;
}

const LANGUAGE_LABEL: Record<BotLanguage, string> = {
  ar: 'arabe standard (fos7a, adaptée au dialecte du client)',
  fr: 'français',
  en: 'anglais',
  darija_ma: 'darija marocaine (3arbiya maghribiya, écriture latine ou arabe)',
  darija_dz: 'darija algérienne (dziriya)',
  darija_tn: 'derja tunisienne',
};

/**
 * Verrou de dialecte + exemples few-shot SPÉCIFIQUES à la langue configurée.
 *
 * Objectif : empêcher l'IA de mélanger darija marocaine / algérienne / tunisienne
 * dans un même message (bug signalé). Chaque dialecte liste les mots à éviter
 * (typiques des dialectes voisins) et donne des exemples uniquement dans le bon
 * dialecte. `{cur}` est remplacé par la devise réelle dans systemPrompt.
 */
interface DialectGuide {
  /** Description courte injectée dans la section LANGUE. */
  name: string;
  /** Règle anti-mélange (mots à proscrire des dialectes voisins). */
  lockRule: string;
  /** Mini dialogue few-shot, dans le bon dialecte uniquement. */
  examples: string;
}

const DIALECT_GUIDES: Record<BotLanguage, DialectGuide> = {
  darija_ma: {
    name: 'darija marocaine UNIQUEMENT',
    lockRule:
      "Parle SEULEMENT la darija marocaine. N'utilise JAMAIS de mots algériens (wesh, kifech, kteft, normalement, sahit) ni tunisiens (barcha, famma, chnowa, baheya, 7aja, tawa, ya3tik). Mots marocains : wach, bghit, chno, chhal, bezzaf, daba, mzyan, wakha, 3afak, dyal, fin.",
    examples: `Client : "Salam, lprix dyal had lmontre?"
Toi : "Wa 3alaykoum salam khouya 😊 lmontre Smart Watch Pro b 299 {cur}, w livraison f Casa-Rabat. Tbghi tjib lik wa7da?"
Client : "bghit nakhod wa7da"
Toi : "Mzyan ✨ 3tini ghir smitek, num dyal tel, w lmadina bach n7sb lik livraison 🙏"
Client : "Wakha"
Toi : (APPELLE create_order — aucun texte) puis APRÈS le tool : "Commande mssaftla ✅ ghadi n3aytlek f 24h bach nconfirmou. Choukran 🙏✨"`,
  },
  darija_dz: {
    name: 'darija algérienne (dziriya) UNIQUEMENT',
    lockRule:
      "Parle SEULEMENT la darija algérienne. N'utilise JAMAIS de mots marocains (bghit, wach, daba, dyal, mzyan, wakha) ni tunisiens (barcha, famma, chnowa, baheya, tawa). Mots algériens : wesh, habit, kifech, chhal, bezzef, normal, drahem, sahit, win, mlih, wah.",
    examples: `Client : "Slm, chhal ta3 had lmontre?"
Toi : "Wa 3alikoum salam khouya 😊 lmontre Smart Watch Pro b 299 {cur}, w livraison l Alger-Wahran. Habit njiblek wahda?"
Client : "wah habit wahda"
Toi : "Mlih ✨ 3tini smitek, nimero ta3 tel, w lwilaya bach nahseb lik livraison 🙏"
Client : "Wah saraha"
Toi : (APPELLE create_order — aucun texte) puis APRÈS le tool : "Commande tsseftlek ✅ rah n3aytlek fi 24s bach nconfirmiw. Sahit 🙏✨"`,
  },
  darija_tn: {
    name: 'derja tunisienne UNIQUEMENT',
    lockRule:
      "Parle SEULEMENT la derja tunisienne. N'utilise JAMAIS de mots marocains (bghit, wach, daba, dyal, wakha) ni algériens (wesh, kifech, habit, drahem). Mots tunisiens : n7eb, chnowa, qaddech, barcha, famma, tawa, baheya, ya3tik essa7a, mte3, win, behi.",
    examples: `Client : "3aslema, qaddech mte3 hadhi lmontre?"
Toi : "3aslema khouya 😊 lmontre Smart Watch Pro b 299 {cur}, w livraison l Tounes-Sfax. T7eb njiblek wa7da?"
Client : "ey n7eb wa7da"
Toi : "Baheya ✨ a3tini esmek, nimero mte3 tel, w lwilaya bech na7seb lik livraison 🙏"
Client : "ey behi"
Toi : (APPELLE create_order — aucun texte) puis APRÈS le tool : "Commande t3addet ✅ bech na3aytlek fi 24s bech nconfirmiw. Ya3tik essa7a 🙏✨"`,
  },
  ar: {
    name: 'arabe standard (fos7a), en t’adaptant au dialecte exact du client',
    lockRule:
      "Réponds en arabe clair et neutre (fos7a légère). Si le client écrit dans un dialecte précis (marocain, algérien, tunisien, égyptien, khaliji…), réponds dans CE dialecte-là uniquement — ne le mélange jamais avec un autre.",
    examples: `العميل : "السلام عليكم، بشحال هاد الساعة؟"
أنت : "وعليكم السلام 😊 ساعة Smart Watch Pro بـ 299 {cur}، والتوصيل متاح. تحب نسجل ليك الطلب؟"
العميل : "أه نحب وحدة"
أنت : "بالتوفيق ✨ عطيني اسمك، رقم الهاتف، والمدينة باش نحسب التوصيل 🙏"`,
  },
  fr: {
    name: 'français',
    lockRule: 'Réponds dans un français clair et chaleureux, sans mélanger de dialecte arabe sauf si le client le fait.',
    examples: `Client : "Bonjour, c'est combien la montre ?"
Toi : "Bonjour 😊 La Smart Watch Pro est à 299 {cur}, livraison disponible. Vous souhaitez la commander ?"
Client : "Oui, j'en veux une"
Toi : "Parfait ✨ Donnez-moi votre nom, votre téléphone et votre ville pour calculer la livraison 🙏"`,
  },
  en: {
    name: 'English',
    lockRule: 'Reply in clear, friendly English. Do not mix in other languages unless the customer does.',
    examples: `Customer: "Hi, how much is the watch?"
You: "Hi 😊 The Smart Watch Pro is 299 {cur}, delivery available. Would you like to order one?"
Customer: "Yes, I'd like one"
You: "Great ✨ Please share your name, phone number and city so I can calculate delivery 🙏"`,
  },
};

/**
 * Étiquettes FR des principaux marchés (le prompt est rédigé en français).
 * Pour les marchés non listés, on retombe sur le label anglais de la liste maître.
 */
const COUNTRY_FR_LABEL: Record<string, string> = {
  MA: 'Maroc', DZ: 'Algérie', TN: 'Tunisie', EG: 'Égypte', LY: 'Libye', MR: 'Mauritanie',
  SA: 'Arabie Saoudite', AE: 'Émirats arabes unis', QA: 'Qatar', KW: 'Koweït', BH: 'Bahreïn',
  OM: 'Oman', JO: 'Jordanie', LB: 'Liban', IQ: 'Irak', YE: 'Yémen', SD: 'Soudan',
  SN: 'Sénégal', CI: "Côte d'Ivoire", BF: 'Burkina Faso', ML: 'Mali', NE: 'Niger',
  CM: 'Cameroun', FR: 'France', BE: 'Belgique', ES: 'Espagne', US: 'États-Unis',
};

/** Symboles de devise locaux usuels (plus naturels que l'ISO en darija). */
const CURRENCY_SYMBOL: Record<string, string> = { MA: 'DH', DZ: 'DA', TN: 'DT' };

/** Quelques grandes villes par pays — aide le bot à valider une ville plausible. */
const COUNTRY_CITIES: Record<string, string[]> = {
  MA: ['Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Meknès', 'Oujda', 'Kénitra', 'Tétouan', 'Salé', 'Mohammedia'],
  DZ: ['Alger', 'Oran', 'Constantine', 'Annaba', 'Blida', 'Batna', 'Sétif', 'Tlemcen', 'Béjaïa', 'Tizi Ouzou'],
  TN: ['Tunis', 'Sfax', 'Sousse', 'Kairouan', 'Bizerte', 'Gabès', 'Ariana', 'Gafsa', 'Monastir', 'Nabeul'],
};

const PERSONALITY_TONE: Record<AiPersonality, string> = {
  friendly: "Chaleureux, proche, tutoie le client, utilise des emojis avec parcimonie (😊🙏✨).",
  professional: 'Courtois et sobre, vouvoie, peu ou pas d’emojis, réponses claires et structurées.',
  energetic: "Dynamique et enthousiaste, ponctue de relances positives et d’emojis (🔥✨🚀), mais reste concis.",
};

export function languageLabel(lang: BotLanguage): string {
  return LANGUAGE_LABEL[lang] || LANGUAGE_LABEL.darija_ma;
}

/** Guide de dialecte (verrou anti-mélange + exemples) pour la langue configurée. */
export function dialectGuide(lang: BotLanguage): DialectGuide {
  return DIALECT_GUIDES[lang] || DIALECT_GUIDES.darija_ma;
}

export function countryLabel(country: BotCountry): string {
  const code = (country || '').toUpperCase();
  return COUNTRY_FR_LABEL[code] || COUNTRIES.find((c) => c.code === code)?.label || code || 'Maroc';
}

export function currencyFor(country: BotCountry): string {
  const code = (country || '').toUpperCase();
  return CURRENCY_SYMBOL[code] || currencyForCountry(code) || 'DH';
}

export function citiesFor(country: BotCountry): string[] {
  return COUNTRY_CITIES[(country || '').toUpperCase()] || [];
}

export function personalityTone(personality: AiPersonality): string {
  return PERSONALITY_TONE[personality] || PERSONALITY_TONE.friendly;
}

/** Bloc catalogue formaté pour le prompt. Le bot ne doit utiliser QUE ces produits. */
export function buildCatalogBlock(catalog: CatalogProduct[], currency: string): string {
  if (!catalog.length) {
    return 'AUCUN produit dans le catalogue. Ne propose aucun produit ni prix — invite poliment le client à patienter.';
  }
  return catalog
    .map((p, i) => {
      const stock = typeof p.stock === 'number' ? (p.stock > 0 ? `en stock (${p.stock})` : 'RUPTURE') : 'stock inconnu';
      const desc = p.description ? ` — ${p.description.slice(0, 120)}` : '';
      // Lien de la fiche produit : à ENVOYER au client qui demande des détails
      // (caractéristiques, photos, description complète).
      const link = p.landing_url ? ` — 🔗 fiche produit : ${p.landing_url}` : '';
      return `${i + 1}. ${p.name} : ${p.price} ${currency} [${stock}]${desc}${link}`;
    })
    .join('\n');
}

/** Bloc frais de livraison par ville + frais par défaut. Quand le frais
 *  vaut 0, on l'écrit explicitement "GRATUITE" pour que Claude utilise le
 *  bon vocabulaire ("livraison gratuite/offerte") au lieu d'écrire "0 XOF". */
export function buildShippingBlock(config: Pick<IBotConfig, 'shipping_fees' | 'default_shipping_fee'>, currency: string): string {
  const fmt = (fee: number) => (fee === 0 ? 'GRATUITE (0)' : `${fee} ${currency}`);
  const lines = (config.shipping_fees || []).map((s) => `- ${s.city} : ${fmt(s.fee)}`);
  const def = `- Autres villes : ${fmt(config.default_shipping_fee ?? 30)}`;
  return [...lines, def].join('\n');
}

export type { BotConfig };
