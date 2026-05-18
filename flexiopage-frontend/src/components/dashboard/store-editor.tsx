'use client';

/**
 * Shared types + presentational helpers for the store-settings sub-pages.
 * Extracted from the old monolithic /dashboard/stores/[storeId] form so each
 * sub-page (/info, /appearance, /sections, /checkout, /delivery) imports
 * only what it needs.
 */
import { ChevronDown, ChevronUp, GripVertical, Link2, MessageSquareQuote, Plus, Share2, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MediaPicker } from '@/components/dashboard/MediaPicker';

// ─────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────
export interface DeliveryIntegration {
  provider?: 'mogadelivery' | 'manual' | 'other';
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  webhookSecret?: string;
  autoDispatch?: boolean;
  pickupAddress?: {
    contactName?: string;
    contactPhone?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
}

export interface CodFormSettings {
  headline?: string;
  submitLabel?: string;
  showEmail?: boolean;
  requireEmail?: boolean;
  showAddressLine2?: boolean;
  showCity?: boolean;
  showPostalCode?: boolean;
  showState?: boolean;
  showNotes?: boolean;
  showQuantity?: boolean;
  reassurance?: string;
  /** Flat shipping fee added to every COD order in this store. */
  shippingFee?: number;
  // ── Visual customization (overrides the active theme on the COD form) ──
  backgroundColor?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  buttonShape?: 'pill' | 'rounded' | 'square';
  buttonAnimated?: boolean;
  buttonAnimation?: 'pulse' | 'shimmer' | 'bounce' | 'none';
}

export interface SlideItem {
  image: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  textAlign?: 'left' | 'center' | 'right';
  overlay?: 'none' | 'light' | 'dark';
}

export interface SliderSettings {
  enabled?: boolean;
  autoplay?: boolean;
  autoplayMs?: number;
  height?: 'sm' | 'md' | 'lg' | 'xl';
  slides?: SlideItem[];
}

export interface NavMenuLink {
  label: string;
  url: string;
}

export type BrandDisplay = 'logo+name' | 'logo' | 'name';

export interface NavbarSettings {
  showSearch?: boolean;
  menuLinks?: NavMenuLink[];
  /** How the brand shows in the navbar: logo + name, logo only, or name only. */
  brandDisplay?: BrandDisplay;
}

export interface AnnouncementBarSettings {
  enabled?: boolean;
  /** Short promo lines: "Livraison gratuite", "Promo −40%", … */
  messages?: string[];
  /** fixed — static centered text · animated — scrolling ticker. */
  mode?: 'fixed' | 'animated';
}

export interface TestimonialItem {
  author: string;
  role?: string;
  rating?: number;
  content: string;
  avatar?: string;
  productName?: string;
  verified?: boolean;
}

export interface TestimonialsSettings {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  items?: TestimonialItem[];
}

export interface FooterColumn {
  title: string;
  links: Array<{ label: string; url: string }>;
}

export interface FooterSettings {
  social?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    youtube?: string;
    x?: string;
    whatsapp?: string;
  };
  contact?: {
    email?: string;
    phone?: string;
    address?: string;
  };
  /** Legacy flat list — kept for backwards compat, columns take precedence. */
  links?: Array<{ label: string; url: string }>;
  columns?: FooterColumn[];
}

export interface StorefrontSettings {
  announcementBar?: AnnouncementBarSettings;
  navbar?: NavbarSettings;
  showHero?: boolean;
  heroTitle?: string;
  heroSubtitle?: string;
  heroImage?: string;
  showProductsGrid?: boolean;
  productsGridTitle?: string;
  showFeatures?: boolean;
  testimonials?: TestimonialsSettings;
  showFooter?: boolean;
  footerNote?: string;
  footer?: FooterSettings;
  slider?: SliderSettings;
}

export interface StoreType {
  _id: string;
  name: string;
  slug: string;
  subdomain: string;
  description?: string;
  customDomain?: string;
  isPublished?: boolean;
  storeType?: 'physical' | 'digital';
  logo?: string;
  favicon?: string;
  theme?: Record<string, unknown>;
  settings?: {
    currency?: string;
    language?: string;
    country?: string;
    direction?: 'ltr' | 'rtl';
    seoTitle?: string;
    seoDescription?: string;
    codForm?: CodFormSettings;
    storefront?: StorefrontSettings;
  };
  integrations?: { delivery?: DeliveryIntegration };
}

// ─────────────────────────────────────────────────────────────────────
// LOCALE DATA + HELPERS
// ─────────────────────────────────────────────────────────────────────
const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur']);
export const directionOf = (lang?: string): 'ltr' | 'rtl' =>
  lang ? (RTL_LANGS.has(lang.split('-')[0]) ? 'rtl' : 'ltr') : 'ltr';

export const SETTINGS_LANGUAGES = [
  { code: '',   label: '— Aucune —' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
];

export type SettingsGroup = 'arab' | 'africa' | 'other';

export const SETTINGS_COUNTRIES: { code: string; label: string; currency: string; arab: boolean; group: SettingsGroup }[] = [
  { code: '',   label: '— Aucun —',              currency: '',    arab: false, group: 'other' },
  { code: 'SA', label: 'Saudi Arabia',           currency: 'SAR', arab: true,  group: 'arab' },
  { code: 'AE', label: 'UAE',                    currency: 'AED', arab: true,  group: 'arab' },
  { code: 'EG', label: 'Egypt',                  currency: 'EGP', arab: true,  group: 'arab' },
  { code: 'MA', label: 'Morocco',                currency: 'MAD', arab: true,  group: 'arab' },
  { code: 'TN', label: 'Tunisia',                currency: 'TND', arab: true,  group: 'arab' },
  { code: 'DZ', label: 'Algeria',                currency: 'DZD', arab: true,  group: 'arab' },
  { code: 'QA', label: 'Qatar',                  currency: 'QAR', arab: true,  group: 'arab' },
  { code: 'KW', label: 'Kuwait',                 currency: 'KWD', arab: true,  group: 'arab' },
  { code: 'BH', label: 'Bahrain',                currency: 'BHD', arab: true,  group: 'arab' },
  { code: 'OM', label: 'Oman',                   currency: 'OMR', arab: true,  group: 'arab' },
  { code: 'IQ', label: 'Iraq',                   currency: 'IQD', arab: true,  group: 'arab' },
  { code: 'JO', label: 'Jordan',                 currency: 'JOD', arab: true,  group: 'arab' },
  { code: 'LB', label: 'Lebanon',                currency: 'LBP', arab: true,  group: 'arab' },
  { code: 'NG', label: 'Nigeria',                currency: 'NGN', arab: false, group: 'africa' },
  { code: 'KE', label: 'Kenya',                  currency: 'KES', arab: false, group: 'africa' },
  { code: 'ZA', label: 'South Africa',           currency: 'ZAR', arab: false, group: 'africa' },
  { code: 'GH', label: 'Ghana',                  currency: 'GHS', arab: false, group: 'africa' },
  { code: 'SN', label: 'Senegal',                currency: 'XOF', arab: false, group: 'africa' },
  { code: 'CI', label: 'Côte d\'Ivoire',         currency: 'XOF', arab: false, group: 'africa' },
  { code: 'CM', label: 'Cameroon',               currency: 'XAF', arab: false, group: 'africa' },
  { code: 'ET', label: 'Ethiopia',               currency: 'ETB', arab: false, group: 'africa' },
  { code: 'TZ', label: 'Tanzania',               currency: 'TZS', arab: false, group: 'africa' },
  { code: 'UG', label: 'Uganda',                 currency: 'UGX', arab: false, group: 'africa' },
  { code: 'RW', label: 'Rwanda',                 currency: 'RWF', arab: false, group: 'africa' },
  { code: 'BJ', label: 'Benin',                  currency: 'XOF', arab: false, group: 'africa' },
  { code: 'TG', label: 'Togo',                   currency: 'XOF', arab: false, group: 'africa' },
  { code: 'BF', label: 'Burkina Faso',           currency: 'XOF', arab: false, group: 'africa' },
  { code: 'ML', label: 'Mali',                   currency: 'XOF', arab: false, group: 'africa' },
  { code: 'NE', label: 'Niger',                  currency: 'XOF', arab: false, group: 'africa' },
  { code: 'GN', label: 'Guinea',                 currency: 'GNF', arab: false, group: 'africa' },
  { code: 'GA', label: 'Gabon',                  currency: 'XAF', arab: false, group: 'africa' },
  { code: 'CG', label: 'Congo (Brazzaville)',    currency: 'XAF', arab: false, group: 'africa' },
  { code: 'CD', label: 'DR Congo',               currency: 'CDF', arab: false, group: 'africa' },
  { code: 'AO', label: 'Angola',                 currency: 'AOA', arab: false, group: 'africa' },
  { code: 'ZW', label: 'Zimbabwe',               currency: 'ZWL', arab: false, group: 'africa' },
  { code: 'ZM', label: 'Zambia',                 currency: 'ZMW', arab: false, group: 'africa' },
  { code: 'MZ', label: 'Mozambique',             currency: 'MZN', arab: false, group: 'africa' },
  { code: 'MG', label: 'Madagascar',             currency: 'MGA', arab: false, group: 'africa' },
  { code: 'MU', label: 'Mauritius',              currency: 'MUR', arab: false, group: 'africa' },
  { code: 'BW', label: 'Botswana',               currency: 'BWP', arab: false, group: 'africa' },
  { code: 'NA', label: 'Namibia',                currency: 'NAD', arab: false, group: 'africa' },
  { code: 'MW', label: 'Malawi',                 currency: 'MWK', arab: false, group: 'africa' },
  { code: 'FR', label: 'France',                 currency: 'EUR', arab: false, group: 'other' },
  { code: 'BE', label: 'Belgium',                currency: 'EUR', arab: false, group: 'other' },
  { code: 'CH', label: 'Switzerland',            currency: 'CHF', arab: false, group: 'other' },
  { code: 'CA', label: 'Canada',                 currency: 'CAD', arab: false, group: 'other' },
  { code: 'US', label: 'United States',          currency: 'USD', arab: false, group: 'other' },
  { code: 'GB', label: 'United Kingdom',         currency: 'GBP', arab: false, group: 'other' },
  { code: 'DE', label: 'Germany',                currency: 'EUR', arab: false, group: 'other' },
  { code: 'ES', label: 'Spain',                  currency: 'EUR', arab: false, group: 'other' },
  { code: 'IT', label: 'Italy',                  currency: 'EUR', arab: false, group: 'other' },
  { code: 'TR', label: 'Turkey',                 currency: 'TRY', arab: false, group: 'other' },
];

export const SETTINGS_CURRENCIES = [
  'SAR', 'AED', 'EGP', 'MAD', 'TND', 'DZD', 'QAR', 'KWD', 'BHD', 'OMR', 'JOD', 'LBP',
  'NGN', 'KES', 'ZAR', 'GHS', 'XOF', 'XAF', 'ETB', 'TZS', 'UGX', 'RWF', 'GNF',
  'CDF', 'AOA', 'ZMW', 'ZWL', 'MZN', 'MGA', 'MUR', 'BWP', 'NAD', 'MWK',
  'EUR', 'GBP', 'CHF', 'TRY', 'USD', 'CAD', 'AUD',
];

// ─────────────────────────────────────────────────────────────────────
// FIELD TOGGLE — common checkbox-card affordance
// ─────────────────────────────────────────────────────────────────────
export function FieldToggle({
  label,
  sublabel,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-card p-3 transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/30'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {sublabel && <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>}
      </div>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SLIDER EDITOR — add/remove/reorder slides, configure autoplay
// ─────────────────────────────────────────────────────────────────────
const HEIGHT_OPTIONS: { value: NonNullable<SliderSettings['height']>; label: string }[] = [
  { value: 'sm', label: 'Compact (260-320px)' },
  { value: 'md', label: 'Moyen (340-420px)' },
  { value: 'lg', label: 'Grand (420-520px)' },
  { value: 'xl', label: 'Très grand (520-640px)' },
];

function emptySlide(): SlideItem {
  return { image: '', title: '', subtitle: '', ctaLabel: '', ctaUrl: '', textAlign: 'center', overlay: 'dark' };
}

export function SliderEditor({
  storeId,
  slider,
  onChange,
}: {
  storeId: string;
  slider?: SliderSettings;
  onChange: (s: SliderSettings) => void;
}) {
  const cfg: SliderSettings = {
    enabled: false,
    autoplay: true,
    autoplayMs: 5000,
    height: 'lg',
    slides: [],
    ...(slider || {}),
  };
  const slides = cfg.slides || [];

  function update(patch: Partial<SliderSettings>) {
    onChange({ ...cfg, ...patch });
  }
  function updateSlide(i: number, patch: Partial<SlideItem>) {
    const next = slides.slice();
    next[i] = { ...next[i], ...patch };
    update({ slides: next });
  }
  function addSlide() {
    update({ slides: [...slides, emptySlide()] });
  }
  function removeSlide(i: number) {
    const next = slides.slice();
    next.splice(i, 1);
    update({ slides: next });
  }
  function moveSlide(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const next = slides.slice();
    [next[i], next[j]] = [next[j], next[i]];
    update({ slides: next });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-4">
      <FieldToggle
        label="Slider d'accueil"
        sublabel="Carrousel d'images affiché juste après le menu de navigation"
        checked={cfg.enabled !== false && !!cfg.enabled}
        onChange={(v) => update({ enabled: v })}
      />

      {cfg.enabled && (
        <>
          <div className="grid gap-3 pt-1 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Hauteur</Label>
              <select
                value={cfg.height || 'lg'}
                onChange={(e) => update({ height: e.target.value as SliderSettings['height'] })}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                {HEIGHT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Intervalle autoplay (ms)</Label>
              <Input
                type="number"
                min={2000}
                step={500}
                value={cfg.autoplayMs ?? 5000}
                onChange={(e) => update({ autoplayMs: parseInt(e.target.value, 10) || 5000 })}
                className="h-10"
              />
            </div>
            <div className="flex items-end">
              <FieldToggle
                label="Autoplay"
                sublabel="Défilement automatique"
                checked={cfg.autoplay !== false}
                onChange={(v) => update({ autoplay: v })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold">Slides ({slides.length})</h4>
                <p className="text-[11px] text-muted-foreground">Image de fond + titre/sous-titre + bouton optionnel</p>
              </div>
              <Button type="button" size="sm" onClick={addSlide} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Ajouter un slide
              </Button>
            </div>

            {slides.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-card p-6 text-center text-xs text-muted-foreground">
                Aucun slide. Clique sur « Ajouter un slide » pour commencer.
              </div>
            ) : (
              <ul className="space-y-3">
                {slides.map((slide, i) => (
                  <li key={i} className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Slide {i + 1}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" aria-label="Monter" disabled={i === 0} onClick={() => moveSlide(i, -1)}
                          className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" aria-label="Descendre" disabled={i === slides.length - 1} onClick={() => moveSlide(i, 1)}
                          className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" aria-label="Supprimer" onClick={() => removeSlide(i)}
                          className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                      <MediaPicker storeId={storeId} value={slide.image} onChange={(url) => updateSlide(i, { image: url || '' })} shape="wide" />
                      <div className="space-y-2">
                        <Input placeholder="Titre du slide (optionnel)" value={slide.title || ''} onChange={(e) => updateSlide(i, { title: e.target.value })} className="h-9" />
                        <Input placeholder="Sous-titre (optionnel)" value={slide.subtitle || ''} onChange={(e) => updateSlide(i, { subtitle: e.target.value })} className="h-9" />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input placeholder="Texte du bouton" value={slide.ctaLabel || ''} onChange={(e) => updateSlide(i, { ctaLabel: e.target.value })} className="h-9 text-xs" />
                          <Input placeholder="Lien du bouton (/produit, https://...)" value={slide.ctaUrl || ''} onChange={(e) => updateSlide(i, { ctaUrl: e.target.value })} className="h-9 text-xs" />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <select value={slide.textAlign || 'center'} onChange={(e) => updateSlide(i, { textAlign: e.target.value as SlideItem['textAlign'] })}
                            className="h-9 rounded-md border border-border bg-background px-2 text-xs">
                            <option value="left">Texte à gauche</option>
                            <option value="center">Texte centré</option>
                            <option value="right">Texte à droite</option>
                          </select>
                          <select value={slide.overlay || 'dark'} onChange={(e) => updateSlide(i, { overlay: e.target.value as SlideItem['overlay'] })}
                            className="h-9 rounded-md border border-border bg-background px-2 text-xs">
                            <option value="dark">Overlay sombre</option>
                            <option value="light">Overlay clair</option>
                            <option value="none">Sans overlay</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ANNOUNCEMENT BAR EDITOR — promo lines above the navbar (fixed / animated)
// ─────────────────────────────────────────────────────────────────────
export function AnnouncementBarEditor({
  bar,
  onChange,
}: {
  bar?: AnnouncementBarSettings;
  onChange: (b: AnnouncementBarSettings) => void;
}) {
  const cfg: AnnouncementBarSettings = { enabled: false, mode: 'fixed', messages: [], ...(bar || {}) };
  const messages = cfg.messages || [];

  function update(patch: Partial<AnnouncementBarSettings>) {
    onChange({ ...cfg, ...patch });
  }
  function updateMessage(i: number, value: string) {
    const next = messages.slice();
    next[i] = value;
    update({ messages: next });
  }
  function addMessage() {
    update({ messages: [...messages, ''] });
  }
  function removeMessage(i: number) {
    const next = messages.slice();
    next.splice(i, 1);
    update({ messages: next });
  }
  function moveMessage(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= messages.length) return;
    const next = messages.slice();
    [next[i], next[j]] = [next[j], next[i]];
    update({ messages: next });
  }

  const MODE_OPTIONS: { value: NonNullable<AnnouncementBarSettings['mode']>; label: string; hint: string }[] = [
    { value: 'fixed', label: 'Fixe', hint: 'Texte statique, centré' },
    { value: 'animated', label: 'Animé', hint: 'Bandeau défilant en continu' },
  ];

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-4">
      <FieldToggle
        label="Bandeau d'annonce"
        sublabel="Bande fine au-dessus du menu — promos, livraison gratuite, remises…"
        checked={!!cfg.enabled}
        onChange={(v) => update({ enabled: v })}
      />

      {cfg.enabled && (
        <>
          {/* Mode — fixed vs animated */}
          <div>
            <h4 className="text-sm font-semibold">Affichage</h4>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {MODE_OPTIONS.map((opt) => {
                const active = (cfg.mode || 'fixed') === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => update({ mode: opt.value })}
                    title={opt.hint}
                    className={
                      'rounded-lg border p-2 text-center text-xs font-medium transition-colors ' +
                      (active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/60 bg-card text-muted-foreground hover:border-primary/40')
                    }
                  >
                    {opt.label}
                    <span className="mt-0.5 block text-[10px] font-normal opacity-70">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Messages */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold">Messages</h4>
                <p className="text-[11px] text-muted-foreground">
                  Une phrase courte par ligne (ex: « Livraison gratuite dès 50€ »).
                </p>
              </div>
              <Button type="button" size="sm" onClick={addMessage} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </Button>
            </div>

            {messages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-card p-4 text-center text-xs text-muted-foreground">
                Aucun message. Clique sur « Ajouter » pour écrire ta première annonce.
              </div>
            ) : (
              <ul className="space-y-2">
                {messages.map((m, i) => (
                  <li key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-border/60 bg-card p-2">
                    <Input
                      placeholder="Ex: Promo −40% sur tout le catalogue"
                      value={m}
                      onChange={(e) => updateMessage(i, e.target.value)}
                      className="h-9 text-sm"
                    />
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="Monter" disabled={i === 0} onClick={() => moveMessage(i, -1)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Descendre" disabled={i === messages.length - 1} onClick={() => moveMessage(i, 1)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Supprimer" onClick={() => removeMessage(i)} className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// NAVBAR EDITOR — menu links (label + URL)
// ─────────────────────────────────────────────────────────────────────
export function NavbarEditor({
  navbar,
  onChange,
}: {
  navbar?: NavbarSettings;
  onChange: (n: NavbarSettings) => void;
}) {
  const cfg: NavbarSettings = { menuLinks: [], ...(navbar || {}) };
  const links = cfg.menuLinks || [];

  function update(patch: Partial<NavbarSettings>) {
    onChange({ ...cfg, ...patch });
  }
  function updateLink(i: number, patch: Partial<NavMenuLink>) {
    const next = links.slice();
    next[i] = { ...next[i], ...patch };
    update({ menuLinks: next });
  }
  function addLink() {
    update({ menuLinks: [...links, { label: '', url: '' }] });
  }
  function removeLink(i: number) {
    const next = links.slice();
    next.splice(i, 1);
    update({ menuLinks: next });
  }
  function moveLink(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= links.length) return;
    const next = links.slice();
    [next[i], next[j]] = [next[j], next[i]];
    update({ menuLinks: next });
  }

  const brandDisplay: BrandDisplay = cfg.brandDisplay || 'logo+name';
  const BRAND_OPTIONS: { value: BrandDisplay; label: string; hint: string }[] = [
    { value: 'logo+name', label: 'Logo + nom', hint: 'Logo et nom de la boutique' },
    { value: 'logo', label: 'Logo seul', hint: 'Affiche uniquement le logo' },
    { value: 'name', label: 'Nom seul', hint: 'Affiche uniquement le nom' },
  ];

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
      {/* Brand display — logo / name / both */}
      <div>
        <h4 className="text-sm font-semibold">Affichage de la marque</h4>
        <p className="text-[11px] text-muted-foreground">
          Ce qui apparaît à gauche de la navbar.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {BRAND_OPTIONS.map((opt) => {
            const active = brandDisplay === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ brandDisplay: opt.value })}
                title={opt.hint}
                className={
                  'rounded-lg border p-2 text-center text-xs font-medium transition-colors ' +
                  (active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/60 bg-card text-muted-foreground hover:border-primary/40')
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 border-t border-border/50 pt-3">
        <div>
          <h4 className="text-sm font-semibold">Menu de navigation (navbar)</h4>
          <p className="text-[11px] text-muted-foreground">
            Liens affichés dans la barre supérieure (Catalogue, À propos, Contact, etc.)
          </p>
        </div>
        <Button type="button" size="sm" onClick={addLink} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Ajouter un lien
        </Button>
      </div>

      {links.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-card p-4 text-center text-xs text-muted-foreground">
          Aucun lien personnalisé. La barre affichera le menu par défaut :
          <span className="font-medium text-foreground"> Accueil · Catalogue · Contact</span>.
        </div>
      ) : (
        <ul className="space-y-2">
          {links.map((l, i) => (
            <li key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg border border-border/60 bg-card p-2">
              <Input placeholder="Libellé (ex: Catalogue)" value={l.label} onChange={(e) => updateLink(i, { label: e.target.value })} className="h-9 text-sm" />
              <Input placeholder="/about, #section, https://..." value={l.url} onChange={(e) => updateLink(i, { url: e.target.value })} className="h-9 text-xs font-mono" />
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Monter" disabled={i === 0} onClick={() => moveLink(i, -1)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Descendre" disabled={i === links.length - 1} onClick={() => moveLink(i, 1)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Supprimer" onClick={() => removeLink(i)} className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TESTIMONIALS EDITOR — toggle + add/remove/reorder
// ─────────────────────────────────────────────────────────────────────
function emptyTestimonial(): TestimonialItem {
  return { author: '', content: '', rating: 5, verified: true };
}

export function TestimonialsEditor({
  storeId,
  testimonials,
  onChange,
}: {
  storeId: string;
  testimonials?: TestimonialsSettings;
  onChange: (t: TestimonialsSettings) => void;
}) {
  const cfg: TestimonialsSettings = { enabled: false, items: [], ...(testimonials || {}) };
  const items = cfg.items || [];

  function update(patch: Partial<TestimonialsSettings>) {
    onChange({ ...cfg, ...patch });
  }
  function updateItem(i: number, patch: Partial<TestimonialItem>) {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    update({ items: next });
  }
  function addItem() {
    update({ items: [...items, emptyTestimonial()] });
  }
  function removeItem(i: number) {
    const next = items.slice();
    next.splice(i, 1);
    update({ items: next });
  }
  function moveItem(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    update({ items: next });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-4">
      <FieldToggle
        label="Avis clients / Témoignages"
        sublabel="Section avec témoignages, notes 5 étoiles, photos clients"
        checked={!!cfg.enabled}
        onChange={(v) => update({ enabled: v })}
      />
      {cfg.enabled && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            <div>
              <Label className="text-xs">Titre de la section</Label>
              <Input placeholder="Ex: Ils nous font confiance" value={cfg.title || ''} onChange={(e) => update({ title: e.target.value })} className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs">Sous-titre (optionnel)</Label>
              <Input placeholder="Ex: Plus de 1000 clients satisfaits" value={cfg.subtitle || ''} onChange={(e) => update({ subtitle: e.target.value })} className="mt-1 h-9" />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                  <MessageSquareQuote className="h-3.5 w-3.5" />
                  Témoignages ({items.length})
                </h4>
                <p className="text-[11px] text-muted-foreground">Ajoute les avis de tes vrais clients (3 à 9 recommandé).</p>
              </div>
              <Button type="button" size="sm" onClick={addItem} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Ajouter un témoignage
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-card p-6 text-center text-xs text-muted-foreground">
                Aucun témoignage. Clique sur « Ajouter un témoignage » pour commencer.
              </div>
            ) : (
              <ul className="space-y-3">
                {items.map((t, i) => (
                  <li key={i} className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Témoignage {i + 1}</span>
                      <div className="flex items-center gap-1">
                        <button type="button" aria-label="Monter" disabled={i === 0} onClick={() => moveItem(i, -1)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" aria-label="Descendre" disabled={i === items.length - 1} onClick={() => moveItem(i, 1)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30">
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" aria-label="Supprimer" onClick={() => removeItem(i)} className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                      <MediaPicker storeId={storeId} value={t.avatar} onChange={(url) => updateItem(i, { avatar: url || '' })} shape="round" />
                      <div className="space-y-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input placeholder="Nom client" value={t.author} onChange={(e) => updateItem(i, { author: e.target.value })} className="h-9" />
                          <Input placeholder="Lieu / rôle (ex: Tunis · Cliente fidèle)" value={t.role || ''} onChange={(e) => updateItem(i, { role: e.target.value })} className="h-9 text-sm" />
                        </div>
                        <textarea placeholder="Témoignage du client…" value={t.content} onChange={(e) => updateItem(i, { content: e.target.value })} rows={3}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <div className="inline-flex items-center gap-2">
                            <Label className="text-xs whitespace-nowrap">Note</Label>
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <button key={n} type="button" onClick={() => updateItem(i, { rating: n })} className="rounded p-0.5 hover:bg-muted" aria-label={`${n} étoiles`}>
                                  <Star className="h-4 w-4" fill={n <= (t.rating || 5) ? '#fbbf24' : 'none'} color={n <= (t.rating || 5) ? '#fbbf24' : 'currentColor'} />
                                </button>
                              ))}
                            </div>
                          </div>
                          <Input placeholder="Produit acheté (optionnel)" value={t.productName || ''} onChange={(e) => updateItem(i, { productName: e.target.value })} className="h-9 text-xs" />
                          <label className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
                            <input type="checkbox" checked={!!t.verified} onChange={(e) => updateItem(i, { verified: e.target.checked })} className="h-4 w-4 rounded border-input" />
                            Vérifié
                          </label>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FOOTER EDITOR — social links + contact + extra links
// ─────────────────────────────────────────────────────────────────────
const SOCIAL_FIELDS: Array<{ key: keyof NonNullable<FooterSettings['social']>; label: string; placeholder: string }> = [
  { key: 'instagram', label: 'Instagram', placeholder: '@mabellestore' },
  { key: 'facebook',  label: 'Facebook',  placeholder: '@MaBelleStore' },
  { key: 'tiktok',    label: 'TikTok',    placeholder: '@mabellestore' },
  { key: 'youtube',   label: 'YouTube',   placeholder: '@mabellestore' },
  { key: 'x',         label: 'X',         placeholder: '@mabellestore' },
  { key: 'whatsapp',  label: 'WhatsApp',  placeholder: '+216 99 999 999' },
];

export function FooterEditor({
  footer,
  onChange,
}: {
  footer?: FooterSettings;
  onChange: (f: FooterSettings) => void;
}) {
  const cfg: FooterSettings = { social: {}, contact: {}, links: [], columns: [], ...(footer || {}) };
  const columns = cfg.columns || [];

  function setSocial(key: string, value: string) {
    onChange({ ...cfg, social: { ...(cfg.social || {}), [key]: value } });
  }
  function setContact(key: 'email' | 'phone' | 'address', value: string) {
    onChange({ ...cfg, contact: { ...(cfg.contact || {}), [key]: value } });
  }

  function addColumn() {
    onChange({ ...cfg, columns: [...columns, { title: 'Nouvelle colonne', links: [] }] });
  }
  function updateColumnTitle(i: number, title: string) {
    const next = columns.slice();
    next[i] = { ...next[i], title };
    onChange({ ...cfg, columns: next });
  }
  function removeColumn(i: number) {
    const next = columns.slice();
    next.splice(i, 1);
    onChange({ ...cfg, columns: next });
  }
  function addLinkTo(colIdx: number) {
    const next = columns.slice();
    next[colIdx] = { ...next[colIdx], links: [...(next[colIdx].links || []), { label: '', url: '' }] };
    onChange({ ...cfg, columns: next });
  }
  function updateLinkAt(colIdx: number, linkIdx: number, patch: Partial<{ label: string; url: string }>) {
    const next = columns.slice();
    const links = (next[colIdx].links || []).slice();
    links[linkIdx] = { ...links[linkIdx], ...patch };
    next[colIdx] = { ...next[colIdx], links };
    onChange({ ...cfg, columns: next });
  }
  function removeLinkAt(colIdx: number, linkIdx: number) {
    const next = columns.slice();
    const links = (next[colIdx].links || []).slice();
    links.splice(linkIdx, 1);
    next[colIdx] = { ...next[colIdx], links };
    onChange({ ...cfg, columns: next });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card p-4">
      <div>
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          <Share2 className="h-3.5 w-3.5" /> Réseaux sociaux
        </h4>
        <p className="text-[11px] text-muted-foreground">Colle le pseudo (@compte) ou l&apos;URL complète.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SOCIAL_FIELDS.map((f) => (
            <Input key={f.key} placeholder={`${f.label} — ${f.placeholder}`} value={cfg.social?.[f.key] || ''} onChange={(e) => setSocial(f.key, e.target.value)} className="h-9 text-sm" />
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold">Coordonnées</h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Input placeholder="Email de contact" type="email" value={cfg.contact?.email || ''} onChange={(e) => setContact('email', e.target.value)} className="h-9" />
          <Input placeholder="Téléphone" value={cfg.contact?.phone || ''} onChange={(e) => setContact('phone', e.target.value)} className="h-9" />
          <Input placeholder="Adresse postale (optionnel)" value={cfg.contact?.address || ''} onChange={(e) => setContact('address', e.target.value)} className="h-9 sm:col-span-2" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <Link2 className="h-3.5 w-3.5" /> Colonnes du footer
          </h4>
          <Button type="button" size="sm" variant="outline" onClick={addColumn} className="gap-1.5">
            <Plus className="h-3 w-3" /> Ajouter une colonne
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Chaque colonne apparaît dans le footer de la boutique. Les pages standards (CGV, FAQ, etc.)
          sont créées automatiquement — leurs URLs sont <code className="rounded bg-muted px-1">/p/conditions-utilisation</code>,
          {' '}<code className="rounded bg-muted px-1">/p/faq</code>, etc.
        </p>
        {columns.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            Aucune colonne. Ajoute-en une (ex: « Termes et politiques », « Contact », « Information »).
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {columns.map((col, ci) => (
              <div key={ci} className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Titre de la colonne"
                    value={col.title}
                    onChange={(e) => updateColumnTitle(ci, e.target.value)}
                    className="h-9 flex-1 text-sm font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => removeColumn(ci)}
                    aria-label="Supprimer la colonne"
                    className="grid h-9 w-9 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {(col.links || []).map((l, li) => (
                    <li key={li} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <Input
                        placeholder="Libellé (ex: FAQ)"
                        value={l.label}
                        onChange={(e) => updateLinkAt(ci, li, { label: e.target.value })}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="/p/faq"
                        value={l.url}
                        onChange={(e) => updateLinkAt(ci, li, { url: e.target.value })}
                        className="h-8 text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => removeLinkAt(ci, li)}
                        aria-label="Supprimer le lien"
                        className="grid h-8 w-8 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => addLinkTo(ci)}
                  className="mt-2 h-8 gap-1.5 text-xs"
                >
                  <Plus className="h-3 w-3" /> Ajouter un lien
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
