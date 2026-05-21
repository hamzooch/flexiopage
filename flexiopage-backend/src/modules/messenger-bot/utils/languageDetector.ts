/**
 * Détection légère du dialecte/langue du CLIENT, pour aligner le bot sur SON
 * dialecte (et non le mélanger). Aucune dépendance externe.
 *
 * Stratégie :
 *   1. Score de marqueurs DISTINCTIFS par dialecte maghrébin (translittération
 *      latine, la plus fréquente sur WhatsApp/Messenger). On évite les mots
 *      partagés (salam, khouya, chokran…) qui ne discriminent rien.
 *   2. Si un dialecte gagne nettement → on le renvoie (darija_ma/dz/tn).
 *   3. Sinon, présence de script arabe → 'ar'.
 *   4. Sinon, on tente fr vs en sur des mots-outils ; sinon null (= indécis,
 *      l'appelant garde la langue configurée du bot).
 *
 * Le résultat n'affine que le prompt ; Claude reste libre de coller au style
 * exact du client.
 */
import type { BotLanguage } from '../models/BotConfig.model';

const ARABIC_RANGE = /[؀-ۿ]/;

/**
 * Marqueurs distinctifs par dialecte (latin). Volontairement sans mots communs
 * aux trois darijas. Certains sont pondérés implicitement par leur rareté.
 */
const DIALECT_MARKERS: Record<'darija_ma' | 'darija_dz' | 'darija_tn', string[]> = {
  // Marocain : bghit/daba/dyal/wakha/bzaf/mzyan/chno/3afak…
  darija_ma: [
    'bghit', 'bghyt', 'bghina', 'nbghi', 'daba', 'dyal', 'dyali', 'dyalek', 'wakha',
    'mzyan', 'mezyan', 'chno', 'chnou', 'chnu', 'achno', '3afak', '3lach', 'khasni',
    'khassni', 'smiti', 'smitek', 'wa7ed', 'wahed', 'finek', 'fyn', 'lhih', 'meskin',
    'safi', 'ghadi', 'kayn', 'kayen', 'naqdar', 'n9dar',
  ],
  // Algérien : wesh/kifech/rak/habit/drahem/sahit/win/mlih…
  darija_dz: [
    'wesh', 'wech', 'weshrak', 'wechrak', 'kifech', 'kifesh', 'kima', 'rak', 'raki',
    'rani', 'rana', 'habit', 'nhabb', 'nhab', 'drahem', 'sahit', 'sahha', 'saha',
    'win', 'mlih', 'mliha', 'dork', 'druk', 'darwek', '3lah', 'normal', 'bezzef',
    'chwiya', 'chouya', 'wahran', 'bessah', 'sahbi',
  ],
  // Tunisien : barcha/famma/chnowa/qaddech/tawa/behi/3aslema/n7eb/mte3…
  darija_tn: [
    'barcha', 'barsha', 'famma', 'fama', 'famech', 'chnowa', 'chnia', 'chnowwa',
    'qaddech', '9addech', 'tawa', 'taw', 'behi', 'bahi', 'baheya', '3aslema', 'aslema',
    'n7eb', 'nheb', 'nhebb', 'mte3', 'mta3', 'mte3i', 'ya3tik', '5ater', 'khater',
    'yezzi', 'najjam', 'najem', 'lehne', 'hakka',
  ],
};

// Petits mots-outils pour départager fr vs en quand il n'y a pas de darija.
const FR_WORDS = ['bonjour', 'salut', 'merci', 'oui', 'non', 'combien', 'prix', 'commande', 'livraison', 'je', 'vous', 'cest', "c'est", 'pour', 'avec', 'ville'];
const EN_WORDS = ['hello', 'hi', 'thanks', 'thank', 'yes', 'no', 'how', 'much', 'price', 'order', 'delivery', 'want', 'please', 'city', 'the'];

function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9؀-ۿ]+/)
    .filter(Boolean);
}

function countHits(words: string[], markers: string[]): number {
  const set = new Set(markers);
  let n = 0;
  for (const w of words) if (set.has(w)) n++;
  return n;
}

/**
 * Détecte le dialecte/langue du texte client.
 * @returns une `BotLanguage` quand un signal clair existe, sinon `null` (indécis).
 */
export function detectDialect(text: string): BotLanguage | null {
  const words = tokenize(text);
  if (!words.length) return null;

  const scores = {
    darija_ma: countHits(words, DIALECT_MARKERS.darija_ma),
    darija_dz: countHits(words, DIALECT_MARKERS.darija_dz),
    darija_tn: countHits(words, DIALECT_MARKERS.darija_tn),
  };
  const best = (Object.entries(scores) as [BotLanguage, number][]).sort((a, b) => b[1] - a[1]);
  const [topLang, topScore] = best[0];
  const secondScore = best[1][1];
  // Gagnant net : au moins un marqueur ET strictement devant les autres dialectes.
  if (topScore >= 1 && topScore > secondScore) return topLang;
  // Égalité entre darijas (mélange réel du client) : on ne tranche pas ici.
  if (topScore >= 1 && topScore === secondScore) return null;

  // Pas de darija identifiable : script arabe → arabe standard.
  if (ARABIC_RANGE.test(text)) return 'ar';

  // Sinon, fr vs en sur mots-outils.
  const fr = countHits(words, FR_WORDS);
  const en = countHits(words, EN_WORDS);
  if (fr > en && fr >= 1) return 'fr';
  if (en > fr && en >= 1) return 'en';

  return null;
}
