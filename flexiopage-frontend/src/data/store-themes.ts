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
// 1. VOLT — Electronics  ·  Shopify "Ride"-inspired
// Pure black, volt-lime accent, oversized geometric type, sharp corners,
// full-bleed hero, image-overlay product cards. Loud and high-energy.
// ─────────────────────────────────────────────────────────────────────
const volt: StoreThemeTemplate = {
  id: 'volt',
  name: 'Volt',
  tagline: 'Tech, brut, haute énergie',
  description:
    'Noir absolu, accent vert volt, typo géante, angles vifs. Hero plein cadre, cartes en surimpression. Pour smartphones, gaming, audio.',
  niche: 'electronics',
  nicheLabel: 'Électronique',
  forStoreTypes: ['physical'],
  theme: makeTheme({
    templateId: 'volt',
    primary: '#ccff00',          // volt lime
    primaryFg: '#0a0a0a',
    accent: '#ff4d00',           // blaze orange
    background: '#0a0a0a',       // pure black
    surface: '#161616',
    surfaceMuted: '#121212',
    foreground: '#f4f4f4',
    muted: '#8a8a8a',
    border: '#2a2a2a',
    gradientFrom: '#ccff00',
    gradientTo: '#ff4d00',
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
    primary: '#1a1714',
    primaryFg: '#f7f4ee',
    accent: '#9a7b4f',           // antique brass
    background: '#f3efe7',       // warm paper
    surface: '#ffffff',
    surfaceMuted: '#e9e4d8',
    foreground: '#1a1714',
    muted: '#76706a',
    border: '#ddd6c8',
    gradientFrom: '#9a7b4f',
    gradientTo: '#1a1714',
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
    primary: '#c81d6b',          // berry rose
    primaryFg: '#ffffff',
    accent: '#f59ec4',           // petal pink
    background: '#fdeef3',       // pale blush
    surface: '#ffffff',
    surfaceMuted: '#fbdce8',
    foreground: '#3f2436',
    muted: '#9a7f8d',
    border: '#f6cdde',
    gradientFrom: '#f59ec4',
    gradientTo: '#c81d6b',
    fontHeading: '"Outfit", "DM Serif Display", "Inter", sans-serif',
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
    primary: '#7c5cff',          // violet
    primaryFg: '#ffffff',
    accent: '#1fd5c8',           // teal-cyan
    background: '#0c0a1d',       // indigo night
    surface: '#16142c',
    surfaceMuted: '#110f24',
    foreground: '#e6e4f5',
    muted: '#8e8aa8',
    border: '#272447',
    gradientFrom: '#7c5cff',
    gradientTo: '#1fd5c8',
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
    primary: '#b5512f',           // terracotta
    primaryFg: '#fdf6ef',
    accent: '#5c7a5c',            // sage green
    background: '#f4efe4',        // warm oat
    surface: '#ffffff',
    surfaceMuted: '#ebe4d3',
    foreground: '#2c2820',
    muted: '#766f5f',
    border: '#ddd4bf',
    gradientFrom: '#b5512f',
    gradientTo: '#5c7a5c',
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
    primary: '#0b0b0b',
    primaryFg: '#ffffff',
    accent: '#2f5cff',            // electric blue
    background: '#ffffff',
    surface: '#ffffff',
    surfaceMuted: '#f0f0f0',
    foreground: '#0b0b0b',
    muted: '#6e6e6e',
    border: '#e2e2e2',
    gradientFrom: '#0b0b0b',
    gradientTo: '#2f5cff',
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
    primary: '#4f46e5',           // indigo
    primaryFg: '#ffffff',
    accent: '#f59e0b',            // amber
    background: '#ffffff',
    surface: '#ffffff',
    surfaceMuted: '#f1f2fb',
    foreground: '#10153a',
    muted: '#5b6184',
    border: '#e3e4f4',
    gradientFrom: '#4f46e5',
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
