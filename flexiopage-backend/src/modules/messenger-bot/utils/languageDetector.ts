/**
 * Détection légère de la langue d'un message client, pour router le ton du bot.
 *
 * Heuristique (pas de dépendance) :
 *   - Présence de script arabe → 'ar' (darija s'écrit aussi en arabe).
 *   - Mots-clés darija en translittération latine (3la, bghit, wach, kayn…) → 'darija'.
 *   - Sinon → 'fr'.
 *
 * Le résultat affine seulement le prompt ; Claude reste capable de répondre
 * dans la langue réelle détectée dans la conversation.
 */
export type DetectedLanguage = 'ar' | 'fr' | 'darija';

const ARABIC_RANGE = /[؀-ۿ]/;

// Translittérations darija fréquentes (chiffres-lettres inclus : 3, 7, 9).
const DARIJA_HINTS = [
  'bghit', 'bghyt', 'wach', 'wash', 'kayn', 'kayen', 'chhal', 'ch7al', 'b9a', 'bzaf', 'bzzaf',
  'salam', 'labas', 'safi', 'wakha', 'mzyan', 'mezyan', 'khoya', 'khouya', 'khti', 'dyal',
  'fin', 'fyn', 'imta', 'fmta', '3afak', '3la', 'nakhod', 'nakhd', 'ndir', 'chno', 'chnou',
];

export function detectLanguage(text: string): DetectedLanguage {
  const t = (text || '').toLowerCase();
  if (ARABIC_RANGE.test(t)) return 'ar';
  const words = t.split(/[^a-z0-9]+/).filter(Boolean);
  const hits = words.filter((w) => DARIJA_HINTS.includes(w)).length;
  if (hits >= 1) return 'darija';
  return 'fr';
}
