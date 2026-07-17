/**
 * Pure helpers for the storefront's reorderable body sections. Kept in a
 * dependency-free module (no React, no 'use client') so both server
 * components (storefront page) and client components (dashboard editor)
 * can import them without dragging the editor's client bundle.
 */

/** Les sections réordonnables du corps de la page d'accueil. */
export type MovableSectionId =
  | 'hero'
  | 'slider'
  | 'products'
  | 'testimonials'
  | 'video'
  | 'faq'
  | 'richText'
  | 'featuredProduct';

export const DEFAULT_SECTION_ORDER: MovableSectionId[] = [
  'hero',
  'slider',
  'products',
  'testimonials',
  'video',
  'faq',
  'richText',
];

/**
 * Normalize a possibly-undefined `sectionOrder` into the canonical 4-item
 * list — unknown ids are dropped, missing ids are appended in their
 * default position. Use this everywhere we render sections in the
 * seller's chosen order so dashboard preview and storefront stay in sync.
 */
export function resolveSectionOrder(saved?: MovableSectionId[]): MovableSectionId[] {
  const seen = new Set<MovableSectionId>();
  const out: MovableSectionId[] = [];
  if (Array.isArray(saved)) {
    for (const id of saved) {
      if (DEFAULT_SECTION_ORDER.includes(id) && !seen.has(id)) {
        out.push(id);
        seen.add(id);
      }
    }
  }
  for (const id of DEFAULT_SECTION_ORDER) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}
