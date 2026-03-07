/**
 * Three niche-specific professional store themes. Each one is a complete
 * design system (color tokens, font stacks, radius, accent gradient, layout
 * style) so the storefront can apply it via CSS variables and still feel
 * coherent end-to-end — header, hero, product cards, footer.
 *
 * 1. Volt    — Electronics, premium dark / neon
 * 2. Atelier — Fashion, editorial, light / serif
 * 3. Bloom   — Beauty & wellness, soft pastels
 *
 * Backwards-compat: the old shape exposed `primaryColor` etc.; we keep
 * those keys aliased on the new theme object so existing callers don't break.
 */
import type { CSSProperties } from 'react';

export type ThemeNiche = 'electronics' | 'fashion' | 'beauty' | 'general';
export type ThemeStyle = 'editorial' | 'tech' | 'soft';
export type ThemeRadius = 'none' | 'small' | 'medium' | 'large' | 'xl';
export type ThemeSpacing = 'tight' | 'normal' | 'relaxed';

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
  theme: ThemeTokens;
}

function makeTheme(t: Omit<ThemeTokens, 'primaryColor' | 'secondaryColor' | 'backgroundColor' | 'textColor'>): ThemeTokens {
  return {
    ...t,
    primaryColor: t.primary,
    secondaryColor: t.muted,
    backgroundColor: t.background,
    textColor: t.foreground,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 1. VOLT — Electronics
// Deep navy + electric cyan, geometric sans, sharp corners, glow shadows.
// Inspired by Apple / Nothing / Samsung product pages.
// ─────────────────────────────────────────────────────────────────────
const volt: StoreThemeTemplate = {
  id: 'volt',
  name: 'Volt',
  tagline: 'Tech, premium, electric',
  description:
    'Sombre, géométrique, accent cyan électrique. Idéal pour smartphones, accessoires, gaming, audio.',
  niche: 'electronics',
  nicheLabel: 'Électronique',
  theme: makeTheme({
    templateId: 'volt',
    primary: '#06b6d4',         // electric cyan
    primaryFg: '#0a0e1a',
    accent: '#a78bfa',
    background: '#0a0e1a',      // deep navy black
    surface: '#111827',
    surfaceMuted: '#0f172a',
    foreground: '#e5e7eb',
    muted: '#94a3b8',
    border: '#1f2937',
    gradientFrom: '#06b6d4',
    gradientTo: '#7c3aed',
    fontHeading: '"Space Grotesk", "Inter", system-ui, sans-serif',
    fontBody: '"Inter", system-ui, -apple-system, sans-serif',
    fontDisplaySize: 'xlarge',
    borderRadius: 'small',
    spacing: 'normal',
    style: 'tech',
    pattern: 'grid',
    shadow: 'glow',
    dark: true,
  }),
};

// ─────────────────────────────────────────────────────────────────────
// 2. ATELIER — Fashion
// Editorial magazine, warm cream + charcoal, big serif headlines,
// flat (no rounded corners), generous whitespace. COS / Aritzia / & Other Stories.
// ─────────────────────────────────────────────────────────────────────
const atelier: StoreThemeTemplate = {
  id: 'atelier',
  name: 'Atelier',
  tagline: 'Editorial, élégant, intemporel',
  description:
    'Magazine de mode : sérif large, crème chaud, lignes droites. Parfait pour vêtements, maroquinerie, accessoires.',
  niche: 'fashion',
  nicheLabel: 'Mode & vêtements',
  theme: makeTheme({
    templateId: 'atelier',
    primary: '#1c1917',
    primaryFg: '#fafaf9',
    accent: '#a16207',           // warm gold
    background: '#fafaf6',       // warm cream
    surface: '#ffffff',
    surfaceMuted: '#f5f5f0',
    foreground: '#1c1917',
    muted: '#78716c',
    border: '#e7e5e4',
    gradientFrom: '#a16207',
    gradientTo: '#1c1917',
    fontHeading: '"Playfair Display", "Cormorant Garamond", Georgia, serif',
    fontBody: '"Inter", "Helvetica Neue", system-ui, sans-serif',
    fontDisplaySize: 'xlarge',
    borderRadius: 'none',
    spacing: 'relaxed',
    style: 'editorial',
    pattern: 'none',
    shadow: 'sharp',
    dark: false,
  }),
};

// ─────────────────────────────────────────────────────────────────────
// 3. BLOOM — Beauty & wellness (third pick — huge niche in MENA market)
// Soft pastels, blush + dusty rose, very rounded corners, large display
// sans, gentle shadows. Glossier-meets-Maghreb feel. Great for cosmetics,
// perfumes, skincare, jewelry.
// ─────────────────────────────────────────────────────────────────────
const bloom: StoreThemeTemplate = {
  id: 'bloom',
  name: 'Bloom',
  tagline: 'Doux, premium, pétale',
  description:
    'Pastels chauds, rose poudré, formes très arrondies. Idéal pour cosmétiques, parfums, soin, bien-être, bijoux.',
  niche: 'beauty',
  nicheLabel: 'Beauté & bien-être',
  theme: makeTheme({
    templateId: 'bloom',
    primary: '#be185d',          // berry rose
    primaryFg: '#ffffff',
    accent: '#f472b6',
    background: '#fdf2f8',       // pale blush
    surface: '#ffffff',
    surfaceMuted: '#fce7f3',
    foreground: '#3f3354',
    muted: '#9d8aa8',
    border: '#f9d6e6',
    gradientFrom: '#f9a8d4',
    gradientTo: '#a78bfa',
    fontHeading: '"Outfit", "DM Serif Display", "Inter", sans-serif',
    fontBody: '"Inter", system-ui, sans-serif',
    fontDisplaySize: 'large',
    borderRadius: 'xl',
    spacing: 'relaxed',
    style: 'soft',
    pattern: 'mesh',
    shadow: 'soft',
    dark: false,
  }),
};

export const STORE_THEME_TEMPLATES: StoreThemeTemplate[] = [volt, atelier, bloom];

export function getThemeById(id: string): StoreThemeTemplate | undefined {
  return STORE_THEME_TEMPLATES.find((t) => t.id === id);
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
  if (/Playfair Display/i.test(all)) families.push('Playfair+Display:wght@400;600;700;800');
  if (/Cormorant Garamond/i.test(all)) families.push('Cormorant+Garamond:wght@400;500;700');
  if (/DM Serif Display/i.test(all)) families.push('DM+Serif+Display:wght@400');
  if (/Outfit/i.test(all)) families.push('Outfit:wght@400;500;600;700;800');
  if (/Inter/i.test(all)) families.push('Inter:wght@400;500;600;700');
  if (families.length === 0) return null;
  return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
}
