/**
 * Builders dynamiques réutilisés par le system prompt : ton de la personnalité,
 * langue, blocs catalogue / frais de livraison, villes valides par pays.
 */
import type { BotConfig, IBotConfig, BotLanguage, BotCountry, AiPersonality } from '../models/BotConfig.model';

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
  ar: "arabe standard",
  fr: 'français',
  darija_ma: 'darija marocaine (3arbiya maghribiya, écriture latine ou arabe)',
  darija_dz: 'darija algérienne',
  darija_tn: 'derja tunisienne',
};

const COUNTRY_LABEL: Record<BotCountry, string> = { MA: 'Maroc', DZ: 'Algérie', TN: 'Tunisie' };
const COUNTRY_CURRENCY: Record<BotCountry, string> = { MA: 'DH', DZ: 'DA', TN: 'DT' };

/** Quelques grandes villes par pays — aide le bot à valider une ville plausible. */
const COUNTRY_CITIES: Record<BotCountry, string[]> = {
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
export function countryLabel(country: BotCountry): string {
  return COUNTRY_LABEL[country] || 'Maroc';
}
export function currencyFor(country: BotCountry): string {
  return COUNTRY_CURRENCY[country] || 'DH';
}
export function citiesFor(country: BotCountry): string[] {
  return COUNTRY_CITIES[country] || COUNTRY_CITIES.MA;
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
      return `${i + 1}. ${p.name} : ${p.price} ${currency} [${stock}]${desc}`;
    })
    .join('\n');
}

/** Bloc frais de livraison par ville + frais par défaut. */
export function buildShippingBlock(config: Pick<IBotConfig, 'shipping_fees' | 'default_shipping_fee'>, currency: string): string {
  const lines = (config.shipping_fees || []).map((s) => `- ${s.city} : ${s.fee} ${currency}`);
  const def = `- Autres villes : ${config.default_shipping_fee ?? 30} ${currency}`;
  return [...lines, def].join('\n');
}

export type { BotConfig };
