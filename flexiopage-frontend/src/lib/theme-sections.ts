/**
 * Sync thème ↔ sections de l'éditeur de boutique.
 *
 * Chaque thème de FlexioPage (volt, atelier, bloom…) a un layout distinct
 * (hero centered, editorial, fullbleed, minimal, split). Toutes les sections
 * de l'éditeur n'ont pas le même intérêt selon ce layout : un thème minimal
 * digital (Studio) n'a pas vocation à montrer un slider d'images flashy ;
 * un thème éditorial mode (Atelier) ne pousse pas de slider non plus
 * (le hero asymétrique fait déjà le job).
 *
 * Ce helper retourne, pour un thème donné, l'ensemble des sections
 * "recommandées" (à afficher par défaut dans l'éditeur) et "optionnelles"
 * (cachées par défaut mais réactivables via 'Afficher toutes les sections').
 *
 * Logique simple basée sur theme.layout.hero :
 *   - 'minimal'   → sections strictement nécessaires (Studio digital)
 *   - 'editorial' → hero + testimonials (storytelling, pas de slider)
 *   - autres      → tout le package marketing (hero + slider + testimonials)
 *
 * Les sections "structurelles" (Announcement, Navbar, Produits, Footer,
 * WhatsApp) sont TOUJOURS recommandées — elles fonctionnent quel que soit
 * le thème et restent la base d'une vitrine commerciale.
 */

import type { ThemeTokens } from '@/data/store-themes';

export type SectionId =
  | 'announcement'
  | 'navbar'
  | 'hero'
  | 'slider'
  | 'products'
  | 'testimonials'
  | 'footer'
  | 'whatsapp';

/** Sections affichées par défaut sur tous les thèmes. */
const ALWAYS_RECOMMENDED: SectionId[] = ['announcement', 'navbar', 'products', 'footer', 'whatsapp'];

export interface ThemeSectionRecommendation {
  /** Sections affichées par défaut dans l'éditeur. */
  recommended: Set<SectionId>;
  /** Sections cachées par défaut mais accessibles via 'Afficher tout'. */
  optional: Set<SectionId>;
  /** Libellé court du parti pris du thème, utilisé dans le bandeau info. */
  rationale: string;
}

/** Sections potentielles supplémentaires selon le layout du hero. */
export function getRecommendedSectionsForTheme(theme: Partial<ThemeTokens> | undefined | null): ThemeSectionRecommendation {
  const heroLayout = theme?.layout?.hero;
  const all = new Set<SectionId>(['announcement', 'navbar', 'hero', 'slider', 'products', 'testimonials', 'footer', 'whatsapp']);
  const recommended = new Set<SectionId>(ALWAYS_RECOMMENDED);

  // Par défaut (pas de thème ou layout inconnu), on recommande tout.
  if (!heroLayout) {
    return {
      recommended: all,
      optional: new Set<SectionId>(),
      rationale: 'Toutes les sections disponibles.',
    };
  }

  if (heroLayout === 'minimal') {
    // Thème minimal : on cache hero, slider, testimonials par défaut.
    // L'utilisateur peut toujours les réactiver via 'Afficher tout'.
    const optional = new Set<SectionId>(['hero', 'slider', 'testimonials']);
    return {
      recommended,
      optional,
      rationale: "Thème minimal — focus sur le catalogue. Hero, slider et témoignages cachés par défaut (réactivables).",
    };
  }

  if (heroLayout === 'editorial') {
    // Thème éditorial : hero asymétrique + testimonials, pas de slider
    // (le slider casse la mise en page magazine).
    recommended.add('hero');
    recommended.add('testimonials');
    return {
      recommended,
      optional: new Set<SectionId>(['slider']),
      rationale: "Thème éditorial — hero magazine + témoignages. Le slider est masqué (incompatible avec la mise en page).",
    };
  }

  // 'centered', 'split', 'fullbleed' → package marketing complet.
  recommended.add('hero');
  recommended.add('slider');
  recommended.add('testimonials');
  return {
    recommended,
    optional: new Set(),
    rationale: 'Thème marketing — toutes les sections recommandées.',
  };
}

/**
 * État par défaut à appliquer sur le storefront quand le vendeur switch
 * de thème, pour que les sections recommandées soient activées et celles
 * masquées soient désactivées automatiquement. Best-effort : on ne touche
 * pas aux contenus du vendeur (titres, images, témoignages…), juste aux
 * toggles d'activation.
 */
export function applyThemeRecommendationsToStorefront<T extends {
  showHero?: boolean;
  showProductsGrid?: boolean;
  showFeatures?: boolean;
  showFooter?: boolean;
  slider?: { enabled?: boolean } & Record<string, unknown>;
}>(storefront: T, theme: Partial<ThemeTokens> | undefined | null): T {
  const { recommended } = getRecommendedSectionsForTheme(theme);
  return {
    ...storefront,
    showHero: recommended.has('hero'),
    showProductsGrid: recommended.has('products'),
    showFooter: recommended.has('footer'),
    showFeatures: storefront.showFeatures !== false, // pas piloté par le thème
    slider: storefront.slider
      ? { ...storefront.slider, enabled: recommended.has('slider') }
      : storefront.slider,
  };
}
