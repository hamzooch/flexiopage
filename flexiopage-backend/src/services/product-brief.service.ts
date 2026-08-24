/**
 * Analyse produit avant génération AI — étape 0 du pipeline Studio.
 *
 * Au lieu d'envoyer une soupe de champs bruts au LLM copywriter, on lui
 * fait d'abord LIRE le produit (nom + description + type + tags + prix)
 * comme un stratège marketing le ferait, et on récupère un « brief »
 * structuré : essence en 1 phrase, 3 bénéfices clés hiérarchisés,
 * persona cible, ancre émotionnelle, mood visuel recommandé, choses à
 * ne PAS dire.
 *
 * Ce brief devient le contexte central des prompts poster + landing.
 * Résultat : le copy sort mieux ciblé au produit précis (pas générique),
 * l'image adopte l'esthétique adéquate (skincare = warm-minimal, tech =
 * clean-modern, fashion = editorial, etc.), et l'IA arrête d'inventer
 * des angles hors-sujet pour la catégorie.
 *
 * Coût : 1 appel LLM court (~150 tokens output) via any-llm queue.
 * Ajoute ~5-10s au pipeline global — largement rentable vu la qualité
 * gagnée. Failsafe : si l'analyse échoue, on renvoie un brief minimal
 * dérivé des champs bruts pour ne pas casser la génération payée.
 */
import { runLLM } from './fal-landing.service';
import { logger } from '../lib/logger';

export type VisualMood =
  | 'premium-dark'      // luxe, tech premium, parfum, montres — noir + accent chaud
  | 'natural-warm'      // artisanat, alimentaire artisanal, bois, cuir — sable + terracotta
  | 'clean-tech'        // gadgets, électronique, tools — gris + accent électrique
  | 'editorial-fashion' // mode, accessoires, streetwear — magazine, contrastes forts
  | 'appetizing-food'   // food, boissons, gourmet — couleurs saturées, gros plan
  | 'gentle-beauty'     // skincare, cosmétique, wellness — pastel, lumière douce
  | 'kids-playful'      // enfants, jouets, éducatif — couleurs vives, ludique
  | 'sport-dynamic';    // sport, fitness, plein air — mouvement, énergie

export interface ProductBrief {
  /** Ce que le produit est vraiment, en 1 phrase précise. */
  essence: string;
  /** Top 3 bénéfices concrets, hiérarchisés (le premier est le plus fort). */
  keyBenefits: [string, string, string];
  /** Persona d'achat probable — âge, situation de vie, motivation d'achat. */
  targetPersona: string;
  /** Ancre émotionnelle centrale — le vrai « pourquoi » de l'achat. */
  emotionalCore: string;
  /** Mood visuel recommandé pour le rendu image. */
  visualMood: VisualMood;
  /** Choses à NE PAS dire (clichés hors-catégorie, promesses fausses…). */
  antiPatterns: string[];
}

export interface AnalyzeProductInput {
  name: string;
  description?: string;
  type?: 'physical' | 'digital';
  tags?: string[];
  price?: number;
  currency?: string;
  language?: string;
  country?: string;
}

const VISUAL_MOODS: VisualMood[] = [
  'premium-dark', 'natural-warm', 'clean-tech',
  'editorial-fashion', 'appetizing-food', 'gentle-beauty',
  'kids-playful', 'sport-dynamic',
];

/** Brief minimal si le LLM échoue — évite de casser la génération payée. */
function fallbackBrief(input: AnalyzeProductInput): ProductBrief {
  const tag = input.tags?.[0] || '';
  const mood: VisualMood =
    /beauty|skin|cosm/i.test(tag) ? 'gentle-beauty' :
    /tech|electro|gadget/i.test(tag) ? 'clean-tech' :
    /fashion|mode|clothing/i.test(tag) ? 'editorial-fashion' :
    /food|drink|gourmet/i.test(tag) ? 'appetizing-food' :
    /kid|toy|enfant/i.test(tag) ? 'kids-playful' :
    /sport|fitness|outdoor/i.test(tag) ? 'sport-dynamic' :
    /wood|leather|artisan/i.test(tag) ? 'natural-warm' :
    'premium-dark';
  return {
    essence: input.name,
    keyBenefits: [
      'Qualité perçue immédiate',
      'Usage quotidien facilité',
      'Rapport prix/valeur avantageux',
    ],
    targetPersona: 'Acheteur intéressé par ce type de produit dans la région ciblée',
    emotionalCore: 'Plaisir d\'acquérir un objet utile et bien fait',
    visualMood: mood,
    antiPatterns: ['clichés génériques', 'promesses vagues'],
  };
}

/**
 * Extrait un brief structuré. Bounded : 1 appel LLM court, JSON-only,
 * throw jamais — retombe sur fallbackBrief en cas d'échec.
 */
export async function analyzeProduct(input: AnalyzeProductInput): Promise<ProductBrief> {
  const lang = input.language || 'fr';
  const country = input.country || '';
  const typeLine = input.type === 'digital'
    ? 'Type: produit NUMÉRIQUE (téléchargement, licence, formation)'
    : input.type === 'physical'
      ? 'Type: produit PHYSIQUE (livré en carton)'
      : '';
  const priceLine = input.price != null
    ? `Prix: ${input.price} ${input.currency || ''}`
    : '';
  const tagsLine = input.tags && input.tags.length
    ? `Tags catalogue: ${input.tags.join(', ')}`
    : '';
  const descLine = input.description
    ? `Description vendeur: ${input.description.slice(0, 1200)}`
    : 'Pas de description fournie.';

  const prompt = `Tu es un stratège marketing DTC senior (15 ans MENA + Afrique de l'Ouest). Tu vas LIRE un produit et sortir un brief court, précis, exploitable.

Marché cible: ${country || 'international'} · Langue de vente: ${lang}

# Produit à analyser
Nom: ${input.name}
${typeLine}
${tagsLine}
${priceLine}
${descLine}

# Ta mission
Retourne UNIQUEMENT ce JSON (pas de markdown, pas de commentaire) :
{
  "essence": "1 phrase de 8-15 mots qui dit ce QUE le produit est vraiment (pas ce qu'il PRÉTEND être). Décris-le comme à un ami en 1 phrase claire.",
  "keyBenefits": [
    "bénéfice #1 le plus fort — 4-8 mots, angle CONCRET (pas 'qualité premium', dis 'batterie qui tient 3 jours')",
    "bénéfice #2 différent — 4-8 mots, autre angle (usage / gain de temps / statut / plaisir sensoriel)",
    "bénéfice #3 encore différent — 4-8 mots"
  ],
  "targetPersona": "1 phrase 15-25 mots : âge approximatif + situation de vie + ce qui motive l'achat. Ex: 'Femme 25-35 en ville, salaire moyen, veut prendre soin d'elle sans complications ni budget salon'",
  "emotionalCore": "1 phrase 8-15 mots : le VRAI pourquoi émotionnel de l'achat (pas la feature, l'émotion). Ex: 'Se sentir maître de sa maison même quand on n'est pas là'",
  "visualMood": "un choix parmi: ${VISUAL_MOODS.join(' | ')}. Choisis celui qui matche VRAIMENT le produit (skincare→gentle-beauty, tech→clean-tech, fashion→editorial-fashion, food→appetizing-food, sécurité/outil→premium-dark, artisanat→natural-warm, sport/outdoor→sport-dynamic, enfants→kids-playful).",
  "antiPatterns": [
    "chose #1 à NE PAS dire pour ce produit précis (ex pour un skincare: 'ne pas parler de puissance', ou pour un digital: 'ne pas parler de livraison rapide')",
    "chose #2 à éviter",
    "chose #3 à éviter"
  ]
}

Règles :
- JSON valide strict, tout en français dans les strings, sauf visualMood qui est un enum anglais.
- Précis > vague. Concret > abstrait.
- Si description absente ou pauvre, DÉDUIS depuis le nom + tags.`;

  try {
    const raw = await runLLM(prompt);
    const cleaned = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('LLM did not return JSON');
    const parsed = JSON.parse(match[0]) as Partial<ProductBrief>;
    // Normalise et applique fallback champ par champ pour tolérer un LLM
    // qui saute un champ ou renvoie un mood inconnu.
    const fb = fallbackBrief(input);
    const mood = VISUAL_MOODS.includes(parsed.visualMood as VisualMood)
      ? (parsed.visualMood as VisualMood)
      : fb.visualMood;
    const benefits = Array.isArray(parsed.keyBenefits) && parsed.keyBenefits.length >= 3
      ? [parsed.keyBenefits[0], parsed.keyBenefits[1], parsed.keyBenefits[2]] as [string, string, string]
      : fb.keyBenefits;
    return {
      essence: parsed.essence || fb.essence,
      keyBenefits: benefits,
      targetPersona: parsed.targetPersona || fb.targetPersona,
      emotionalCore: parsed.emotionalCore || fb.emotionalCore,
      visualMood: mood,
      antiPatterns: Array.isArray(parsed.antiPatterns) && parsed.antiPatterns.length
        ? parsed.antiPatterns.slice(0, 5)
        : fb.antiPatterns,
    };
  } catch (err) {
    logger.warn({ err: (err as Error).message, product: input.name }, '[product-brief] LLM analysis failed — using fallback');
    return fallbackBrief(input);
  }
}
