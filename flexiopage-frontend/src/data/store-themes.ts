/**
 * Seven niche-specific store themes — each a complete design system
 * (colors, fonts, radius, layout structure) so the storefront feels
 * coherent end-to-end. Unlike before, every theme now also carries a
 * `layout` block that drives a genuinely different page structure
 * (hero shape, product card style, grid density, navbar style) so the
 * themes don't just differ in color — they differ in *form*.
 *
 * Physical:  Volt · Atelier · Bloom
 * Digital:   Pulse · Sage · Studio · Lumen
 *
 * Each one is loosely modelled on a well-known Shopify theme family
 * (Ride, Publisher, Sense, Studio, Crave, Colorblock, Dawn).
 *
 * Backwards-compat: the old shape exposed `primaryColor` etc.; we keep
 * those keys aliased on the new theme object so existing callers don't break.
 */
import type { CSSProperties } from 'react';

export type ThemeNiche =
  | 'electronics'
  | 'fashion'
  | 'beauty'
  | 'general'
  // Digital niches
  | 'saas'        // software, SaaS, tools
  | 'coaching'    // courses, coaching, memberships
  | 'creators'    // creators, templates, portfolios
  | 'ebooks';     // ebooks, PDFs, digital downloads
export type ThemeStyle = 'editorial' | 'tech' | 'soft' | 'minimal' | 'glass';
export type StoreKind = 'physical' | 'digital';
export type ThemeRadius = 'none' | 'small' | 'medium' | 'large' | 'xl';
export type ThemeSpacing = 'tight' | 'normal' | 'relaxed';

// ── Structural layout variants — what makes each theme feel different ──
export type HeroLayout =
  | 'centered'    // type stack centered, badge + CTA
  | 'split'       // text left, visual panel right
  | 'editorial'   // big asymmetric serif headline, left-aligned
  | 'fullbleed'   // edge-to-edge color block, oversized type
  | 'minimal';    // stark, type-only, lots of whitespace
export type ProductCardStyle =
  | 'classic'     // image, then padded text block below
  | 'editorial'   // flat image, serif name, no border
  | 'overlay'     // text overlaid on the image, dark gradient
  | 'minimal';    // tight, borderless, text hugs the image
export type NavStyle =
  | 'standard'    // logo left, links right
  | 'centered'    // logo centered, links split below/around
  | 'bold';       // chunky uppercase, thick divider
export type GridColumns = 2 | 3 | 4;

export interface ThemeLayout {
  hero: HeroLayout;
  productCard: ProductCardStyle;
  gridColumns: GridColumns;
  nav: NavStyle;
}

export interface ThemeTokens {
  templateId: string;
  // ── Core colors (hex) ──
  primary: string;        // CTAs, brand
  primaryFg: string;      // text on primary
  accent: string;         // secondary accent / hover
  background: string;     // page bg
  surface: string;        // card bg
  surfaceMuted: string;   // section bg / subtle areas
  foreground: string;     // body text
  muted: string;          // secondary text
  border: string;         // borders
  // ── Decorative gradient (for hero blobs / CTA bars) ──
  gradientFrom: string;
  gradientTo: string;
  // ── Typography (CSS font stacks — safe fallbacks built in) ──
  fontHeading: string;
  fontBody: string;
  fontDisplaySize: 'compact' | 'large' | 'xlarge';
  // ── Layout ──
  borderRadius: ThemeRadius;
  spacing: ThemeSpacing;
  style: ThemeStyle;
  /** Structural layout variants — drives distinct page shapes per theme. */
  layout: ThemeLayout;
  // ── Visual extras applied by the storefront ──
  pattern: 'mesh' | 'grid' | 'noise' | 'none';
  shadow: 'sharp' | 'soft' | 'glow';
  // Hint for dark UI: when true, default text is light
  dark: boolean;
  // ── Legacy keys kept for backwards compatibility ──
  primaryColor: string;     // = primary
  secondaryColor: string;   // = muted
  backgroundColor: string;  // = background
  textColor: string;        // = foreground
}

export interface StoreThemeTemplate {
  id: string;
  name: string;
  tagline: string;          // 1-line subtitle for the picker card
  description: string;      // longer help text
  niche: ThemeNiche;
  /** Used by the wizard preview to label the niche. */
  nicheLabel: string;
  /**
   * Which store kinds this theme is offered for. Physical-product themes
   * (Volt/Atelier/Bloom) target retail; digital themes (Pulse/Sage/Studio/Lumen)
   * target courses, ebooks, SaaS, templates, etc.
   */
  forStoreTypes: StoreKind[];
  theme: ThemeTokens;
}

function makeTheme(
  t: Omit<ThemeTokens, 'primaryColor' | 'secondaryColor' | 'backgroundColor' | 'textColor'>
): ThemeTokens {
  return {
    ...t,
    primaryColor: t.primary,
    secondaryColor: t.muted,
    backgroundColor: t.background,
    textColor: t.foreground,
  };
}

// ═════════════════════════════════════════════════════════════════════
// COLOR UTILITIES — used by deriveTheme so the simplified 3-color editor
// can regenerate a full, contrast-safe token set from just primary +
// accent + background.
// ═════════════════════════════════════════════════════════════════════

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => clampByte(v).toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Linear blend between two hex colors. t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** WCAG relative luminance (0 = black, 1 = white). */
function relLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isLightColor(hex: string): boolean {
  return relLuminance(hex) > 0.42;
}

/** Pick black or white text for readable contrast on a given fill. */
export function contrastText(hex: string): string {
  return isLightColor(hex) ? '#0b0b0b' : '#ffffff';
}

/**
 * Regenerate a complete, contrast-safe theme from a base theme plus up to
 * three overridden colors. The base supplies fonts, radius, layout and
 * style; the three colors drive everything else (surfaces, text, borders,
 * gradient) so the simplified editor only ever needs 3 inputs.
 */
export function deriveTheme(
  base: ThemeTokens,
  overrides: { primary?: string; accent?: string; background?: string }
): ThemeTokens {
  const primary = (overrides.primary || base.primary).toLowerCase();
  const accent = (overrides.accent || base.accent).toLowerCase();
  const background = (overrides.background || base.background).toLowerCase();
  const dark = !isLightColor(background);

  const foreground = dark
    ? mixHex('#ffffff', background, 0.12)
    : mixHex('#0a0a0a', background, 0.06);
  const surface = dark ? mixHex(background, '#ffffff', 0.07) : '#ffffff';
  const surfaceMuted = dark
    ? mixHex(background, '#ffffff', 0.045)
    : mixHex(background, foreground, 0.05);
  const muted = mixHex(foreground, background, 0.42);
  const border = mixHex(foreground, background, dark ? 0.8 : 0.86);

  return makeTheme({
    ...base,
    primary,
    accent,
    background,
    primaryFg: contrastText(primary),
    foreground,
    surface,
    surfaceMuted,
    muted,
    border,
    gradientFrom: primary,
    gradientTo: accent,
    dark,
  });
}

// ─────────────────────────────────────────────────────────────────────
// 1. VOLT — Electronics  ·  Modern tech / arcade
// Carbon black with a refined volt-lime, fresher orange accent. The
// pattern is a soft grid that fades — less wireframe, more sci-fi.
// ─────────────────────────────────────────────────────────────────────
const volt: StoreThemeTemplate = {
  id: 'volt',
  name: 'Volt',
  tagline: 'Tech · gaming · audio',
  description:
    'Noir carbone, volt-lime électrique, accent orange flame. Typo géométrique géante, grilles techniques, cartes immersives en plein cadre. Pour smartphones, casques, gaming, audio premium.',
  niche: 'electronics',
  nicheLabel: 'Électronique',
  forStoreTypes: ['physical'],
  theme: makeTheme({
    templateId: 'volt',
    primary: '#d4ff3a',          // refined volt — slightly less harsh
    primaryFg: '#0a0a0a',
    accent: '#ff5a1f',           // flame orange
    background: '#080808',       // carbon black
    surface: '#141414',
    surfaceMuted: '#0f0f0f',
    foreground: '#f5f5f5',
    muted: '#909090',
    border: '#262626',
    gradientFrom: '#d4ff3a',
    gradientTo: '#ff5a1f',
    fontHeading: '"Space Grotesk", "Inter", system-ui, sans-serif',
    fontBody: '"Inter", system-ui, -apple-system, sans-serif',
    fontDisplaySize: 'xlarge',
    borderRadius: 'none',
    spacing: 'normal',
    style: 'tech',
    layout: { hero: 'fullbleed', productCard: 'overlay', gridColumns: 3, nav: 'bold' },
    pattern: 'grid',
    shadow: 'glow',
    dark: true,
  }),
};

// ─────────────────────────────────────────────────────────────────────
// 2. ATELIER — Fashion  ·  Shopify "Publisher"-inspired
// Warm paper, ink black, oversized Playfair serif, flat corners, an
// asymmetric editorial hero and borderless serif product cards in a
// roomy 2-column grid. Quiet luxury.
// ─────────────────────────────────────────────────────────────────────
const atelier: StoreThemeTemplate = {
  id: 'atelier',
  name: 'Atelier',
  tagline: 'Éditorial, élégant, intemporel',
  description:
    'Papier chaud, encre noire, sérif Playfair surdimensionné, lignes droites. Hero magazine, cartes sans bordure, grille 2 colonnes. Pour mode, maroquinerie.',
  niche: 'fashion',
  nicheLabel: 'Mode & vêtements',
  forStoreTypes: ['physical'],
  theme: makeTheme({
    templateId: 'atelier',
    primary: '#181513',          // deep ink
    primaryFg: '#f7f3eb',
    accent: '#a98455',           // refined brass (warmer than antique)
    background: '#f4f0e7',       // warm cream paper
    surface: '#ffffff',
    surfaceMuted: '#ebe5d6',
    foreground: '#181513',
    muted: '#7a7269',
    border: '#dcd4c4',
    gradientFrom: '#a98455',
    gradientTo: '#181513',
    fontHeading: '"Playfair Display", "Cormorant Garamond", Georgia, serif',
    fontBody: '"Inter", "Helvetica Neue", system-ui, sans-serif',
    fontDisplaySize: 'xlarge',
    borderRadius: 'none',
    spacing: 'relaxed',
    style: 'editorial',
    layout: { hero: 'editorial', productCard: 'editorial', gridColumns: 2, nav: 'centered' },
    pattern: 'none',
    shadow: 'sharp',
    dark: false,
  }),
};

// ─────────────────────────────────────────────────────────────────────
// 3. BLOOM — Beauty & wellness  ·  Shopify "Sense"-inspired
// Blush cream, berry rose, very rounded geometry, soft mesh glows,
// centered hero, plump classic cards. Glossier-meets-Maghreb.
// ─────────────────────────────────────────────────────────────────────
const bloom: StoreThemeTemplate = {
  id: 'bloom',
  name: 'Bloom',
  tagline: 'Doux, pétale, premium',
  description:
    'Crème rosée, rose baie, formes très arrondies, halos doux. Hero centré, cartes rebondies. Pour cosmétiques, parfums, soin, bijoux.',
  niche: 'beauty',
  nicheLabel: 'Beauté & bien-être',
  forStoreTypes: ['physical'],
  theme: makeTheme({
    templateId: 'bloom',
    primary: '#b8195e',          // refined berry — slightly deeper, more couture
    primaryFg: '#ffffff',
    accent: '#f4a3c4',           // petal pink, more muted
    background: '#fcf3f5',       // soft blush cream
    surface: '#ffffff',
    surfaceMuted: '#fae1ea',
    foreground: '#3a2030',
    muted: '#9c7e8a',
    border: '#f4cfdb',
    gradientFrom: '#f4a3c4',
    gradientTo: '#b8195e',
    fontHeading: '"DM Serif Display", "Outfit", "Inter", sans-serif',
    fontBody: '"Inter", system-ui, sans-serif',
    fontDisplaySize: 'large',
    borderRadius: 'xl',
    spacing: 'relaxed',
    style: 'soft',
    layout: { hero: 'centered', productCard: 'classic', gridColumns: 3, nav: 'centered' },
    pattern: 'mesh',
    shadow: 'soft',
    dark: false,
  }),
};

// ═════════════════════════════════════════════════════════════════════
// DIGITAL THEMES — courses, ebooks, SaaS, templates, downloads
// ═════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────
// 4. PULSE — SaaS / software  ·  Shopify "Studio"-inspired (dark)
// Deep indigo-black, violet→cyan, geometric sans, medium radius, a
// split hero (copy left, visual panel right) and minimal product cards.
// ─────────────────────────────────────────────────────────────────────
const pulse: StoreThemeTemplate = {
  id: 'pulse',
  name: 'Pulse',
  tagline: 'SaaS · outils · tech',
  description:
    'Indigo nuit, dégradé violet-cyan, géométrique, hero scindé copy/visuel, cartes minimalistes. Pour logiciels, SaaS, plugins, abonnements.',
  niche: 'saas',
  nicheLabel: 'SaaS & outils',
  forStoreTypes: ['digital'],
  theme: makeTheme({
    templateId: 'pulse',
    primary: '#8b5cf6',          // contemporary violet (Vercel-ish)
    primaryFg: '#ffffff',
    accent: '#22d3ee',            // electric cyan
    background: '#0a0a1a',        // near-black indigo (cleaner than night blue)
    surface: '#14142a',
    surfaceMuted: '#0e0e22',
    foreground: '#ebeaf5',
    muted: '#8a87a8',
    border: '#252244',
    gradientFrom: '#8b5cf6',
    gradientTo: '#22d3ee',
    fontHeading: '"Space Grotesk", "Inter", system-ui, sans-serif',
    fontBody: '"Inter", system-ui, sans-serif',
    fontDisplaySize: 'xlarge',
    borderRadius: 'medium',
    spacing: 'normal',
    style: 'tech',
    layout: { hero: 'split', productCard: 'minimal', gridColumns: 3, nav: 'standard' },
    pattern: 'mesh',
    shadow: 'glow',
    dark: true,
  }),
};

// ─────────────────────────────────────────────────────────────────────
// 5. SAGE — coaching / courses  ·  Shopify "Crave"-inspired
// Warm oat background, terracotta + sage green, DM Serif headlines,
// large soft radius, split hero, generous classic cards in a 2-col grid.
// ─────────────────────────────────────────────────────────────────────
const sage: StoreThemeTemplate = {
  id: 'sage',
  name: 'Sage',
  tagline: 'Coaching · cours · communauté',
  description:
    'Avoine chaud, terracotta & vert sauge, sérif DM, formes douces. Hero scindé, grandes cartes en grille 2 colonnes. Pour formations, coaching, communautés.',
  niche: 'coaching',
  nicheLabel: 'Coaching & cours',
  forStoreTypes: ['digital'],
  theme: makeTheme({
    templateId: 'sage',
    primary: '#b5532f',            // refined terracotta
    primaryFg: '#fdf7f0',
    accent: '#637a5c',             // muted sage
    background: '#f5f0e4',         // softer oat
    surface: '#ffffff',
    surfaceMuted: '#ece5d4',
    foreground: '#2c2820',
    muted: '#7a7363',
    border: '#dbd3bf',
    gradientFrom: '#b5532f',
    gradientTo: '#637a5c',
    fontHeading: '"DM Serif Display", "Cormorant Garamond", Georgia, serif',
    fontBody: '"Inter", system-ui, sans-serif',
    fontDisplaySize: 'xlarge',
    borderRadius: 'large',
    spacing: 'relaxed',
    style: 'soft',
    layout: { hero: 'split', productCard: 'classic', gridColumns: 2, nav: 'standard' },
    pattern: 'none',
    shadow: 'soft',
    dark: false,
  }),
};

// ─────────────────────────────────────────────────────────────────────
// 6. STUDIO — creators / templates  ·  Shopify "Colorblock"-inspired
// Stark white, ink black + one electric accent, heavy Inter, zero radius,
// a minimal type-driven hero and a dense, borderless 4-column grid.
// ─────────────────────────────────────────────────────────────────────
const studio: StoreThemeTemplate = {
  id: 'studio',
  name: 'Studio',
  tagline: 'Créateurs · templates · portfolio',
  description:
    'Blanc cru, encre noire, un seul accent électrique, Inter gras, zéro arrondi. Hero typographique, grille dense 4 colonnes sans bordure. Pour templates, presets, packs.',
  niche: 'creators',
  nicheLabel: 'Créateurs',
  forStoreTypes: ['digital'],
  theme: makeTheme({
    templateId: 'studio',
    primary: '#0a0a0a',           // pure ink
    primaryFg: '#ffffff',
    accent: '#3d5afe',            // electric cobalt
    background: '#ffffff',
    surface: '#ffffff',
    surfaceMuted: '#f5f5f5',
    foreground: '#0a0a0a',
    muted: '#737373',
    border: '#e5e5e5',
    gradientFrom: '#0a0a0a',
    gradientTo: '#3d5afe',
    fontHeading: '"Inter", system-ui, sans-serif',
    fontBody: '"Inter", system-ui, sans-serif',
    fontDisplaySize: 'xlarge',
    borderRadius: 'none',
    spacing: 'normal',
    style: 'minimal',
    layout: { hero: 'minimal', productCard: 'minimal', gridColumns: 4, nav: 'bold' },
    pattern: 'none',
    shadow: 'sharp',
    dark: false,
  }),
};

// ─────────────────────────────────────────────────────────────────────
// 7. LUMEN — ebooks / downloads  ·  Shopify "Dawn"-inspired
// Clean white, indigo, amber accent, Outfit, large rounded radius,
// centered hero, classic cards in a comfortable 3-col grid. The calm,
// trustworthy baseline.
// ─────────────────────────────────────────────────────────────────────
const lumen: StoreThemeTemplate = {
  id: 'lumen',
  name: 'Lumen',
  tagline: 'Ebooks · PDF · téléchargements',
  description:
    'Blanc lumineux, indigo profond, accent ambre, Outfit, coins arrondis. Hero centré, cartes classiques en grille 3 colonnes. Pour ebooks, guides PDF, packs.',
  niche: 'ebooks',
  nicheLabel: 'Ebooks & téléchargements',
  forStoreTypes: ['digital'],
  theme: makeTheme({
    templateId: 'lumen',
    primary: '#4338ca',            // deeper indigo, more premium
    primaryFg: '#ffffff',
    accent: '#f59e0b',             // amber gold
    background: '#fbfbfd',         // very soft off-white (less harsh than pure white)
    surface: '#ffffff',
    surfaceMuted: '#eef0fa',
    foreground: '#0f1530',
    muted: '#5b6184',
    border: '#e1e3f2',
    gradientFrom: '#4338ca',
    gradientTo: '#f59e0b',
    fontHeading: '"Outfit", "Inter", system-ui, sans-serif',
    fontBody: '"Inter", system-ui, sans-serif',
    fontDisplaySize: 'large',
    borderRadius: 'large',
    spacing: 'relaxed',
    style: 'glass',
    layout: { hero: 'centered', productCard: 'classic', gridColumns: 3, nav: 'standard' },
    pattern: 'mesh',
    shadow: 'soft',
    dark: false,
  }),
};

export const STORE_THEME_TEMPLATES: StoreThemeTemplate[] = [
  // Physical stores
  volt, atelier, bloom,
  // Digital stores
  pulse, sage, studio, lumen,
];

/**
 * Filter themes by store type. Physical stores see only physical-product
 * themes, digital stores see only digital-product themes.
 */
export function themesForStoreType(kind: StoreKind): StoreThemeTemplate[] {
  return STORE_THEME_TEMPLATES.filter((t) => t.forStoreTypes.includes(kind));
}

export function getThemeById(id: string): StoreThemeTemplate | undefined {
  return STORE_THEME_TEMPLATES.find((t) => t.id === id);
}

/**
 * Normalize a stored theme object. Stores saved before the `layout` block
 * existed (or fully custom palettes) won't carry it — fall back to the
 * matching template's layout, or Lumen's as a safe default.
 */
export function withLayoutFallback(theme: ThemeTokens): ThemeTokens {
  if (theme.layout && theme.layout.hero) return theme;
  const base = getThemeById(theme.templateId)?.theme || lumen.theme;
  return { ...theme, layout: base.layout };
}

// Tailwind-friendly radius mapping (used by storefront)
export const RADIUS_PX: Record<ThemeRadius, string> = {
  none: '0px',
  small: '6px',
  medium: '12px',
  large: '20px',
  xl: '28px',
};

/**
 * Convert a theme to a flat record of CSS custom properties for inline style.
 * Apply on the storefront root: <div style={tokensToCssVars(theme)}>…</div>
 */
export function tokensToCssVars(t: ThemeTokens): CSSProperties {
  return {
    ['--th-primary' as string]: t.primary,
    ['--th-primary-fg' as string]: t.primaryFg,
    ['--th-accent' as string]: t.accent,
    ['--th-bg' as string]: t.background,
    ['--th-surface' as string]: t.surface,
    ['--th-surface-muted' as string]: t.surfaceMuted,
    ['--th-fg' as string]: t.foreground,
    ['--th-muted' as string]: t.muted,
    ['--th-border' as string]: t.border,
    ['--th-grad-from' as string]: t.gradientFrom,
    ['--th-grad-to' as string]: t.gradientTo,
    ['--th-font-heading' as string]: t.fontHeading,
    ['--th-font-body' as string]: t.fontBody,
    ['--th-radius' as string]: RADIUS_PX[t.borderRadius],
    fontFamily: t.fontBody,
    backgroundColor: t.background,
    color: t.foreground,
  };
}

/**
 * Build a Google Fonts URL covering the theme's heading & body families.
 * Returns null if all fonts are system stacks.
 */
export function googleFontsHref(t: ThemeTokens): string | null {
  const families: string[] = [];
  const all = `${t.fontHeading} ${t.fontBody}`;
  if (/Space Grotesk/i.test(all)) families.push('Space+Grotesk:wght@400;500;600;700');
  if (/Playfair Display/i.test(all)) families.push('Playfair+Display:wght@400;600;700;800;900');
  if (/Cormorant Garamond/i.test(all)) families.push('Cormorant+Garamond:wght@400;500;700');
  if (/DM Serif Display/i.test(all)) families.push('DM+Serif+Display:wght@400');
  if (/Outfit/i.test(all)) families.push('Outfit:wght@400;500;600;700;800');
  if (/Inter/i.test(all)) families.push('Inter:wght@400;500;600;700;800;900');
  if (families.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
}
