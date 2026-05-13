'use client';

/**
 * Theme picker card + fullscreen preview modal.
 *
 *   <ThemePreviewGrid>  — 3 cards, each with [Voir] [Utiliser] buttons
 *   ThemePreviewCard    — one card (mini storefront mock + 2 actions)
 *   ThemePreviewModal   — fullscreen mock storefront for "Voir"
 */
import { useEffect, useState } from 'react';
import type { StoreThemeTemplate, ThemeTokens } from '@/data/store-themes';
import { RADIUS_PX, googleFontsHref, tokensToCssVars } from '@/data/store-themes';
import { Button } from '@/components/ui/button';
import {
  Check,
  Cpu,
  Shirt,
  Sparkles,
  Eye,
  X,
  Star,
  ShieldCheck,
  Truck,
  Heart,
  ArrowRight,
  Code2,
  GraduationCap,
  Palette,
  BookOpen,
  Download,
  Zap,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CardProps {
  template: StoreThemeTemplate;
  selected: boolean;
  /** "Utiliser" — apply the theme to the store. */
  onUse: () => void;
  /** "Voir" — open the fullscreen preview modal. */
  onPreview: () => void;
}

const NICHE_ICON: Record<string, typeof Cpu> = {
  electronics: Cpu,
  fashion: Shirt,
  beauty: Sparkles,
  general: Sparkles,
  saas: Code2,
  coaching: GraduationCap,
  creators: Palette,
  ebooks: BookOpen,
};

export function ThemePreviewCard({ template, selected, onUse, onPreview }: CardProps) {
  const t = template.theme;
  const NicheIcon = NICHE_ICON[template.niche] || Sparkles;
  const radius = RADIUS_PX[t.borderRadius];

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border-2 bg-card transition-all duration-300',
        'hover:-translate-y-1 hover:shadow-2xl',
        selected ? 'border-primary ring-4 ring-primary/15' : 'border-border/60 hover:border-primary/40'
      )}
    >
      {/* Mini storefront mock */}
      <div
        className="relative h-44 overflow-hidden border-b border-border/40"
        style={{
          backgroundColor: t.background,
          color: t.foreground,
          fontFamily: t.fontBody,
        }}
      >
        {t.pattern === 'grid' && (
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: `linear-gradient(${t.border} 1px, transparent 1px), linear-gradient(90deg, ${t.border} 1px, transparent 1px)`,
              backgroundSize: '24px 24px',
            }}
            aria-hidden
          />
        )}
        {t.pattern === 'mesh' && (
          <>
            <div
              className="pointer-events-none absolute -left-8 -top-8 h-32 w-32 rounded-full blur-2xl opacity-60"
              style={{ backgroundColor: t.gradientFrom }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -right-8 bottom-0 h-32 w-32 rounded-full blur-2xl opacity-50"
              style={{ backgroundColor: t.gradientTo }}
              aria-hidden
            />
          </>
        )}

        <div
          className="relative flex items-center justify-between border-b px-4 py-2.5 text-[10px]"
          style={{ borderColor: t.border }}
        >
          <span className="font-bold tracking-tight" style={{ fontFamily: t.fontHeading, color: t.foreground }}>
            {template.name.toUpperCase()}
          </span>
          <div className="flex gap-1.5">
            <span className="h-1 w-1 rounded-full" style={{ backgroundColor: t.muted }} />
            <span className="h-1 w-1 rounded-full" style={{ backgroundColor: t.muted }} />
            <span className="h-1 w-1 rounded-full" style={{ backgroundColor: t.muted }} />
          </div>
        </div>

        <div className="relative px-4 pt-3">
          <div
            className="text-[15px] font-bold leading-tight tracking-tight"
            style={{ fontFamily: t.fontHeading, color: t.foreground }}
          >
            {nicheHeadline(template.niche)}
          </div>
          <div className="mt-1 text-[9px] leading-snug" style={{ color: t.muted }}>
            {nicheSub(template.niche)}
          </div>
        </div>

        <div className="absolute inset-x-3 bottom-3 flex gap-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex-1 overflow-hidden border"
              style={{
                backgroundColor: t.surface,
                borderColor: t.border,
                borderRadius: radius,
                boxShadow:
                  t.shadow === 'glow'
                    ? `0 0 14px ${withAlpha(t.primary, 0.25)}`
                    : t.shadow === 'soft'
                      ? '0 6px 16px rgba(0,0,0,0.04)'
                      : '0 1px 0 rgba(0,0,0,0.05)',
              }}
            >
              <div
                className="h-10 w-full"
                style={{
                  background:
                    i === 0 ? `linear-gradient(135deg, ${t.gradientFrom}, ${t.gradientTo})` : t.surfaceMuted,
                }}
              />
              <div className="px-1.5 py-1">
                <div className="h-1.5 w-3/4 rounded" style={{ backgroundColor: t.muted, opacity: 0.6 }} />
                <div className="mt-1 flex items-center justify-between">
                  <div className="h-1 w-1/3 rounded" style={{ backgroundColor: t.primary }} />
                  <div
                    className="rounded px-1 text-[7px] font-semibold"
                    style={{
                      backgroundColor: t.primary,
                      color: t.primaryFg,
                      borderRadius: t.borderRadius === 'none' ? '0' : '4px',
                    }}
                  >
                    {i === 0 ? '–30%' : 'NEW'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-primary text-white shadow-md">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <span
            className="grid h-7 w-7 place-items-center rounded-lg text-white"
            style={{ background: `linear-gradient(135deg, ${t.gradientFrom}, ${t.gradientTo})` }}
          >
            <NicheIcon className="h-3.5 w-3.5" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {template.nicheLabel}
          </span>
        </div>
        <div>
          <h3 className="text-base font-semibold tracking-tight">{template.name}</h3>
          <p className="text-xs text-muted-foreground">{template.tagline}</p>
        </div>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{template.description}</p>

        {/* Tokens row */}
        <div className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-full ring-1 ring-border" style={{ backgroundColor: t.primary }} />
          <span className="h-3.5 w-3.5 rounded-full ring-1 ring-border" style={{ backgroundColor: t.accent }} />
          <span className="h-3.5 w-3.5 rounded-full ring-1 ring-border" style={{ backgroundColor: t.background }} />
          <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t.borderRadius === 'none' ? 'Sharp' : t.borderRadius === 'xl' ? 'Très arrondi' : 'Arrondi'}
          </span>
        </div>

        {/* Action buttons */}
        <div className="mt-auto flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
            className="h-9 flex-1 gap-1.5 rounded-lg"
          >
            <Eye className="h-3.5 w-3.5" />
            Voir
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onUse();
            }}
            className={cn(
              'h-9 flex-1 gap-1.5 rounded-lg gradient-brand text-white shadow-md shadow-primary/25',
              selected && 'opacity-90'
            )}
          >
            {selected ? (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                Sélectionné
              </>
            ) : (
              <>
                Utiliser
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// THEME PREVIEW MODAL — fullscreen mock storefront
// ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  template: StoreThemeTemplate | null;
  onClose: () => void;
  onUse: (tpl: StoreThemeTemplate) => void;
}

const MOCK_PRODUCTS: Record<string, Array<{ name: string; price: string; before?: string; tag?: string }>> = {
  electronics: [
    { name: 'Casque ANC Pro', price: '249 €', before: '329 €', tag: '–24%' },
    { name: 'Smartwatch Lumen X', price: '399 €' },
    { name: 'Enceinte Boom 2', price: '129 €', tag: 'NEW' },
    { name: 'Clavier Mécanique', price: '189 €', before: '229 €' },
    { name: 'Écran 4K 27"', price: '549 €' },
    { name: 'Souris Sans Fil', price: '79 €', tag: 'NEW' },
  ],
  fashion: [
    { name: 'Trench Beige', price: '189 €', before: '249 €', tag: '–24%' },
    { name: 'Robe Midi Soie', price: '149 €' },
    { name: 'Sac Cuir Caramel', price: '329 €' },
    { name: 'Blazer Oversize', price: '219 €', tag: 'NEW' },
    { name: 'Bottines Chelsea', price: '179 €' },
    { name: 'Foulard Soie', price: '69 €' },
  ],
  beauty: [
    { name: 'Sérum Vitamine C', price: '49 €', before: '69 €', tag: '–28%' },
    { name: 'Rouge Mat Velvet', price: '29 €' },
    { name: 'Crème Hydratante', price: '39 €', tag: 'NEW' },
    { name: 'Parfum Iris Nuit', price: '89 €' },
    { name: 'Palette Sunset', price: '59 €' },
    { name: 'Masque Détox', price: '34 €' },
  ],
  general: [
    { name: 'Produit phare', price: '99 €', before: '149 €', tag: '–33%' },
    { name: 'Best-seller', price: '129 €' },
    { name: 'Nouveauté', price: '79 €', tag: 'NEW' },
    { name: 'Édition limitée', price: '199 €' },
  ],
  saas: [
    { name: 'Bundle Pro · 12 mois',  price: '149 €', before: '299 €', tag: '–50%' },
    { name: 'Lifetime Access',        price: '299 €', tag: 'POPULAIRE' },
    { name: 'Plugin Power Pack',      price: '49 €' },
    { name: 'API Starter',            price: '29 €/mois' },
    { name: 'Team License · 5 sièges',price: '199 €' },
    { name: 'Cloud Sync Add-on',      price: '19 €' },
  ],
  coaching: [
    { name: 'Masterclass · 12 modules', price: '197 €', before: '297 €', tag: '–33%' },
    { name: 'Coaching 1-on-1 · 3 mois', price: '997 €' },
    { name: 'Bootcamp · 30 jours',      price: '247 €', tag: 'NEW' },
    { name: 'Membre Premium · 1 an',    price: '397 €' },
    { name: 'Audit stratégique',        price: '149 €' },
    { name: 'Workshop en direct',       price: '79 €' },
  ],
  creators: [
    { name: 'Pack Notion · 24 templates', price: '49 €', before: '99 €', tag: '–50%' },
    { name: 'Figma UI Kit Pro',           price: '79 €' },
    { name: 'Lightroom Presets · 60',     price: '29 €', tag: 'NEW' },
    { name: 'Bundle Pinterest · 100',     price: '39 €' },
    { name: 'Prompts ChatGPT · 250',      price: '19 €' },
    { name: 'Webflow Template · SaaS',    price: '89 €' },
  ],
  ebooks: [
    { name: 'Le Guide Complet (PDF)',    price: '19 €', before: '39 €', tag: '–50%' },
    { name: 'Workbook · 80 pages',        price: '14 €' },
    { name: 'Bundle 3 ebooks',            price: '39 €', tag: 'POPULAIRE' },
    { name: 'Audio + PDF · 2h',           price: '24 €' },
    { name: 'Notion Tracker',             price: '9 €' },
    { name: 'Pack Checklist · 12',        price: '12 €' },
  ],
};

const STORE_NAMES: Record<string, string> = {
  electronics: 'NEXIA',
  fashion: 'Atelier 12',
  beauty: 'Maison Pétale',
  general: 'Ma boutique',
  saas: 'Pulse Lab',
  coaching: 'Académie Sage',
  creators: 'Studio Indigo',
  ebooks: 'Lumen Books',
};

export function ThemePreviewModal({ template, onClose, onUse }: ModalProps) {
  // Lock scroll + Escape to close
  useEffect(() => {
    if (!template) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [template, onClose]);

  if (!template) return null;
  const t = template.theme;
  const fontsUrl = googleFontsHref(t);
  const radius = RADIUS_PX[t.borderRadius];
  const products = MOCK_PRODUCTS[template.niche] || MOCK_PRODUCTS.general;
  const storeName = STORE_NAMES[template.niche] || STORE_NAMES.general;
  const isEditorial = t.style === 'editorial';
  const isTech = t.style === 'tech';

  const titleSize =
    t.fontDisplaySize === 'xlarge' ? 'text-5xl sm:text-7xl' :
    t.fontDisplaySize === 'large'  ? 'text-4xl sm:text-6xl' : 'text-3xl sm:text-5xl';

  return (
    <>
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} />}
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="relative flex h-full max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal toolbar */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur sm:px-5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="grid h-9 w-9 place-items-center rounded-lg gradient-brand text-white shadow-md shadow-primary/25">
                <Eye className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold tracking-tight">
                  Aperçu — Thème {template.name}
                </h2>
                <p className="truncate text-xs text-muted-foreground">{template.nicheLabel} · {template.tagline}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => { onUse(template); onClose(); }}
                className="h-9 gap-1.5 rounded-lg gradient-brand text-white shadow-md shadow-primary/25"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                Utiliser ce thème
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fermer" className="h-9 w-9">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mock storefront body */}
          <div
            className="flex-1 overflow-y-auto"
            style={tokensToCssVars(t)}
            dir="ltr"
          >
            {/* HEADER */}
            <header
              className="sticky top-0 z-10 border-b backdrop-blur-xl"
              style={{ borderColor: t.border, backgroundColor: hexA(t.background, 0.85) }}
            >
              <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
                <span className="text-lg font-bold tracking-tight" style={{ fontFamily: t.fontHeading, color: t.foreground }}>
                  {storeName}
                </span>
                <div className="flex items-center gap-5 text-xs" style={{ color: t.muted }}>
                  <span>Boutique</span>
                  <span>Nouveautés</span>
                  <span>Contact</span>
                </div>
              </div>
            </header>

            {/* HERO */}
            <section className="relative overflow-hidden">
              {t.pattern === 'grid' && (
                <div
                  className="absolute inset-0 opacity-25"
                  style={{
                    backgroundImage: `linear-gradient(${t.border} 1px, transparent 1px), linear-gradient(90deg, ${t.border} 1px, transparent 1px)`,
                    backgroundSize: '40px 40px',
                    maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)',
                  }}
                  aria-hidden
                />
              )}
              {t.pattern === 'mesh' && (
                <>
                  <div
                    className="pointer-events-none absolute -left-32 -top-24 h-96 w-96 rounded-full blur-3xl opacity-50"
                    style={{ backgroundColor: t.gradientFrom }}
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute -right-24 top-12 h-80 w-80 rounded-full blur-3xl opacity-40"
                    style={{ backgroundColor: t.gradientTo }}
                    aria-hidden
                  />
                </>
              )}
              <div className={`relative mx-auto max-w-5xl px-6 ${isEditorial ? 'py-16 sm:py-24' : 'py-14 sm:py-20'}`}>
                <div className={`${isEditorial ? 'max-w-2xl' : 'mx-auto max-w-3xl text-center'}`}>
                  {!isEditorial && (
                    <div
                      className="mb-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur"
                      style={{
                        borderColor: t.border,
                        color: isTech ? t.primary : t.foreground,
                        backgroundColor: hexA(t.surface, 0.6),
                      }}
                    >
                      <Sparkles className="h-3 w-3" />
                      Nouvelle collection
                    </div>
                  )}
                  <h1
                    className={`${titleSize} ${isEditorial ? 'leading-[0.95]' : 'leading-[1.05]'} font-bold tracking-tight`}
                    style={{ fontFamily: t.fontHeading, color: t.foreground }}
                  >
                    {nicheHeadline(template.niche)}
                  </h1>
                  <p className={`mt-5 leading-relaxed ${isEditorial ? 'max-w-md text-base' : 'mx-auto max-w-xl text-sm sm:text-base'}`} style={{ color: t.muted }}>
                    {nicheLongSub(template.niche)}
                  </p>
                  <div className={`mt-7 flex flex-wrap items-center gap-3 ${isEditorial ? '' : 'justify-center'}`}>
                    <span
                      className="inline-flex h-11 items-center gap-2 px-6 text-sm font-semibold"
                      style={{
                        background: isTech
                          ? `linear-gradient(135deg, ${t.gradientFrom}, ${t.gradientTo})`
                          : t.primary,
                        color: t.primaryFg,
                        borderRadius: t.borderRadius === 'none' ? '0' : '999px',
                        boxShadow:
                          t.shadow === 'glow'
                            ? `0 8px 32px ${hexA(t.primary, 0.45)}`
                            : t.shadow === 'soft'
                              ? `0 12px 28px ${hexA(t.primary, 0.25)}`
                              : `0 2px 0 ${t.primary}`,
                      }}
                    >
                      Découvrir
                      <ArrowRight className="h-4 w-4" />
                    </span>
                    <span
                      className="inline-flex h-11 items-center px-5 text-sm font-medium"
                      style={{
                        border: `1px solid ${t.border}`,
                        color: t.foreground,
                        borderRadius: t.borderRadius === 'none' ? '0' : '999px',
                      }}
                    >
                      En savoir plus
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* TRUST STRIP */}
            <section className="border-y" style={{ borderColor: t.border, backgroundColor: t.surfaceMuted }}>
              <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 py-6 text-xs sm:grid-cols-4">
                {(template.forStoreTypes.includes('digital')
                  ? [
                      { Icon: Zap,          label: 'Accès instantané' },
                      { Icon: ShieldCheck,  label: 'Paiement sécurisé' },
                      { Icon: Clock,        label: 'Accès à vie' },
                      { Icon: Star,         label: 'Note 4.9 / 5' },
                    ]
                  : [
                      { Icon: Truck,        label: 'Livraison gratuite' },
                      { Icon: ShieldCheck,  label: 'Paiement sécurisé' },
                      { Icon: Heart,        label: 'Retours 30 jours' },
                      { Icon: Star,         label: 'Note 4.9 / 5' },
                    ]
                ).map((it, i) => (
                  <div key={i} className="flex items-center gap-2.5" style={{ color: t.muted }}>
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
                      style={{ backgroundColor: t.surface, border: `1px solid ${t.border}`, color: t.primary }}
                    >
                      <it.Icon className="h-4 w-4" />
                    </span>
                    <span className="font-medium" style={{ color: t.foreground }}>{it.label}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* PRODUCTS GRID */}
            <section style={{ backgroundColor: t.background }}>
              <div className="mx-auto max-w-5xl px-6 py-14">
                <div className={`mb-8 ${isEditorial ? '' : 'text-center'}`}>
                  {isEditorial && (
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: t.accent }}>
                      — Sélection
                    </div>
                  )}
                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: t.fontHeading, color: t.foreground }}>
                    Nos produits
                  </h2>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {products.slice(0, 6).map((p, i) => (
                    <div
                      key={i}
                      className="group block overflow-hidden border transition-transform hover:-translate-y-1"
                      style={{
                        backgroundColor: t.surface,
                        borderColor: t.border,
                        borderRadius: radius,
                        boxShadow:
                          t.shadow === 'glow'
                            ? `0 4px 24px ${hexA(t.primary, 0.15)}`
                            : t.shadow === 'soft'
                              ? '0 6px 16px rgba(0,0,0,0.04)'
                              : '0 1px 0 rgba(0,0,0,0.05)',
                      }}
                    >
                      <div
                        className="relative aspect-square"
                        style={{
                          background:
                            i % 3 === 0
                              ? `linear-gradient(135deg, ${t.gradientFrom}, ${t.gradientTo})`
                              : t.surfaceMuted,
                        }}
                      >
                        {p.tag && (
                          <span
                            className="absolute left-3 top-3 px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                            style={{
                              backgroundColor: t.primary,
                              color: t.primaryFg,
                              borderRadius: t.borderRadius === 'none' ? '0' : '999px',
                            }}
                          >
                            {p.tag}
                          </span>
                        )}
                      </div>
                      <div className="p-4">
                        <h3
                          className="text-sm font-semibold tracking-tight"
                          style={{
                            fontFamily: isEditorial ? t.fontHeading : t.fontBody,
                            color: t.foreground,
                          }}
                        >
                          {p.name}
                        </h3>
                        <div className="mt-1.5 flex items-baseline gap-2">
                          <span className="font-bold" style={{ color: t.primary }}>{p.price}</span>
                          {p.before && (
                            <span className="text-xs line-through" style={{ color: t.muted }}>{p.before}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* FOOTER */}
            <footer
              className="border-t"
              style={{ borderColor: t.border, backgroundColor: t.surfaceMuted, color: t.muted }}
            >
              <div className="mx-auto max-w-5xl px-6 py-10 text-center">
                <span className="text-base font-bold tracking-tight" style={{ fontFamily: t.fontHeading, color: t.foreground }}>
                  {storeName}
                </span>
                <p className="mt-2 text-xs">© 2026 {storeName}. Tous droits réservés.</p>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// GRID — opens the modal locally
// ─────────────────────────────────────────────────────────────────────

interface GridProps {
  templates: StoreThemeTemplate[];
  selectedId?: string;
  onSelect: (t: StoreThemeTemplate) => void;
}

export function ThemePreviewGrid({ templates, selectedId, onSelect }: GridProps) {
  const [previewing, setPreviewing] = useState<StoreThemeTemplate | null>(null);
  return (
    <>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => (
          <ThemePreviewCard
            key={tpl.id}
            template={tpl}
            selected={selectedId === tpl.id}
            onUse={() => onSelect(tpl)}
            onPreview={() => setPreviewing(tpl)}
          />
        ))}
      </div>
      <ThemePreviewModal
        template={previewing}
        onClose={() => setPreviewing(null)}
        onUse={(tpl) => onSelect(tpl)}
      />
    </>
  );
}

export type { ThemeTokens };

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function nicheHeadline(niche: string): string {
  switch (niche) {
    case 'electronics': return 'Tech qui fait la différence.';
    case 'fashion':     return 'L\'élégance au quotidien.';
    case 'beauty':      return 'Révèle ton éclat.';
    case 'saas':        return 'Ship faster. Build better.';
    case 'coaching':    return 'Apprends. Progresse. Transforme.';
    case 'creators':    return 'Outils premium pour créateurs.';
    case 'ebooks':      return 'Lis, applique, transforme.';
    default:            return 'Bienvenue.';
  }
}
function nicheSub(niche: string): string {
  switch (niche) {
    case 'electronics': return 'Smartphones, audio, gaming.';
    case 'fashion':     return 'Nouvelle collection automne.';
    case 'beauty':      return 'Soin · Parfum · Maquillage';
    case 'saas':        return 'Apps · API · automatisations.';
    case 'coaching':    return 'Cours · coaching · communauté.';
    case 'creators':    return 'Templates · presets · packs.';
    case 'ebooks':      return 'Ebooks · guides · PDF.';
    default:            return 'Une boutique propre.';
  }
}
function nicheLongSub(niche: string): string {
  switch (niche) {
    case 'electronics':
      return 'Des produits sélectionnés pour leurs performances. Audio, gaming, accessoires premium — livraison express partout.';
    case 'fashion':
      return 'Des pièces taillées pour durer. Coupes essentielles, tissus nobles, fabrication soignée — la nouvelle saison est arrivée.';
    case 'beauty':
      return 'Des formulations propres, des textures qui font du bien. Soin, maquillage, parfum — pensés pour ta routine quotidienne.';
    case 'saas':
      return 'Des outils pensés pour les makers : automatisations, intégrations, accès API. Mise à jour à vie, support prioritaire.';
    case 'coaching':
      return 'Des programmes structurés pour passer du blocage au résultat. Vidéos, sessions live, communauté privée — tout pour avancer.';
    case 'creators':
      return 'Des templates et packs créatifs prêts à l\'emploi. Notion, Figma, Lightroom — gain de temps garanti.';
    case 'ebooks':
      return 'Des ebooks et guides PDF concrets, conçus pour l\'action. Téléchargement instantané, accès à vie, mises à jour incluses.';
    default:
      return 'Une sélection soigneusement choisie pour t\'inspirer chaque jour.';
  }
}
function withAlpha(hex: string, a: number): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function hexA(hex: string, a: number): string { return withAlpha(hex, a); }
