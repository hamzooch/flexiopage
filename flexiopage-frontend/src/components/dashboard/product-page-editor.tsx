'use client';

/**
 * Editor for the store-wide product-page configuration. Lets the seller:
 *   - Toggle which extra sections appear (badges / timer / testimonials / description)
 *   - Reorder those sections via inline ↑↓ chevrons
 *   - Pick a countdown timer (deadline + headline + accent)
 *   - Build a list of custom trust badges (icon + label + sublabel)
 *
 * All changes live under `settings.storefront.productPage` and apply to
 * every product page on the storefront unless the product itself overrides
 * (via product.pageSettings — separate path, not handled here).
 */

import { useEffect, useState } from 'react';
import {
  Truck, ShieldCheck, RefreshCcw, Lock, Headphones, Gift, Clock,
  Star, Leaf, Banknote, Plus, Trash2, ChevronUp, ChevronDown,
  Timer, Award, MessageSquareQuote, FileText, Palette as PaletteIcon,
  LayoutGrid, Image as ImgIcon, Columns2,
  Smartphone, Tablet, Monitor,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  defaultBadgesForStoreType,
  DEFAULT_PRODUCT_PAGE_ORDER,
  resolveProductPageOrder,
  type BadgeIcon,
  type ProductPageSectionId,
  type ProductPageSettings,
  type ProductPageStyle,
  type TrustBadge,
} from '@/lib/product-page-order';
import { storesApi } from '@/lib/api';
import { FieldToggle, type CodFormSettings } from '@/components/dashboard/store-editor';
import { TimerPresetPicker } from '@/components/dashboard/timer-presets';
import { PalettePresetPicker } from '@/components/dashboard/palette-presets';
import { Wallet } from 'lucide-react';

const BADGE_ICONS: Record<BadgeIcon, typeof Truck> = {
  truck: Truck,
  shield: ShieldCheck,
  refresh: RefreshCcw,
  lock: Lock,
  headset: Headphones,
  gift: Gift,
  clock: Clock,
  star: Star,
  leaf: Leaf,
  banknote: Banknote,
};

const ICON_LIST: BadgeIcon[] = ['truck', 'shield', 'refresh', 'lock', 'headset', 'gift', 'clock', 'star', 'leaf', 'banknote'];

const SECTION_META: Record<ProductPageSectionId, { label: string; icon: typeof Award; help: string }> = {
  badges:       { label: 'Badges de confiance', icon: Award,              help: 'Livraison rapide, garantie, paiement sécurisé…' },
  timer:        { label: 'Timer / urgence',     icon: Timer,              help: 'Compte à rebours qui pousse à commander vite' },
  description:  { label: 'Description longue',  icon: FileText,           help: 'Le texte détaillé du produit, sous la fiche' },
  testimonials: { label: 'Avis clients',        icon: MessageSquareQuote, help: 'Les témoignages de la boutique remontent ici' },
};

interface Props {
  cfg: ProductPageSettings;
  onChange: (next: ProductPageSettings) => void;
  /** Optional: when provided, the editor surfaces the COD form fields
   *  inline (texts, shipping fee, field toggles) so the seller manages
   *  everything about the product page from one place instead of
   *  bouncing between /sections and /checkout. */
  codForm?: CodFormSettings;
  onCodFormChange?: (next: CodFormSettings) => void;
  /** Store currency — used as the shipping fee unit. */
  currency?: string;
  /** Storefront-wide accent color for the COD button preview. */
  storeType?: 'physical' | 'digital';
  /** Store id — required for uploading custom badge images to the media endpoint. */
  storeId?: string;
}

export function ProductPageEditor({ cfg, onChange, codForm, onCodFormChange, currency = 'TND', storeType = 'physical', storeId }: Props) {
  const order = resolveProductPageOrder(cfg.sectionOrder);
  const badges = cfg.badges ?? [];

  // ── Section reorder ───────────────────────────────────────────────
  function moveSection(id: ProductPageSectionId, dir: -1 | 1) {
    const i = order.indexOf(id);
    const swap = i + dir;
    if (i < 0 || swap < 0 || swap >= order.length) return;
    const next = order.slice();
    [next[i], next[swap]] = [next[swap], next[i]];
    onChange({ ...cfg, sectionOrder: next });
  }

  // ── Badge CRUD ────────────────────────────────────────────────────
  function addBadge() {
    onChange({ ...cfg, badges: [...badges, { icon: 'truck', label: 'Nouveau badge' }] });
  }
  function updateBadge(i: number, patch: Partial<TrustBadge>) {
    const next = badges.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...cfg, badges: next });
  }
  function removeBadge(i: number) {
    onChange({ ...cfg, badges: badges.filter((_, idx) => idx !== i) });
  }
  function seedDefaultBadges() {
    onChange({ ...cfg, badges: defaultBadgesForStoreType(storeType) });
  }

  /**
   * Upload a custom badge image via the store's media endpoint and attach
   * the returned URL to the given badge slot. Silent no-op if no storeId is
   * available (embed in a create-mode page where the store isn't saved yet).
   */
  async function uploadBadgeImage(i: number, file: File) {
    if (!storeId) {
      alert('Sauvegarde la boutique une fois avant d\'ajouter une image.');
      return;
    }
    try {
      const res = await storesApi.uploadMedia(storeId, file);
      const url = (res.data.media as { url?: string })?.url;
      if (url) updateBadge(i, { imageUrl: url });
    } catch {
      alert('Échec de l\'upload. Réessaie avec une image plus petite.');
    }
  }

  const style = cfg.style || {};
  const setStyle = (patch: Partial<ProductPageStyle>) =>
    onChange({ ...cfg, style: { ...style, ...patch } });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
      {/* ── STYLE — palette + colors + gallery layout ────────── */}
      <section
        id="product-page-style"
        className="scroll-mt-6 rounded-xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/5 to-card p-4"
      >
        <div className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold">
          <PaletteIcon className="h-4 w-4 text-fuchsia-600" />
          Style visuel & design du formulaire
          <span className="ml-1 rounded-full bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-700">
            Surcharge le thème
          </span>
        </div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Une palette = couleurs (titre, prix, accent, bouton, navbar), forme + animation du bouton Commander. S&apos;applique à <strong>toutes</strong> les pages produit de cette boutique.
        </p>

        {/* Master toggle — without this on, the storefront ignores every
            palette field below and uses the active theme. Picking a palette
            or any color auto-flips this on so the seller sees their choice
            applied without having to discover the toggle. */}
        <div className="mb-4 rounded-xl border border-border/60 bg-card p-3">
          <FieldToggle
            label="Personnaliser le style de la page produit"
            sublabel={
              style.useCustomPalette
                ? '✓ Tes couleurs personnalisées s\'appliquent sur la page produit publique.'
                : 'Désactivé — la page produit utilise les couleurs du thème principal de la boutique.'
            }
            checked={!!style.useCustomPalette}
            onChange={(v) => setStyle({ useCustomPalette: v })}
          />
        </div>

        {/* When custom is OFF, dim the palette + color pickers so the
            seller sees they're inert. Still clickable — that auto-flips
            the master switch on for them. */}
        <div className={style.useCustomPalette ? '' : 'opacity-60'}>
          {/* Preset palette picker — one click sets all 6 colors at once.
              Auto-enables useCustomPalette so the seller's choice takes effect. */}
          <PalettePresetPicker
            value={style}
            onApply={(next) => setStyle({ ...next, useCustomPalette: true })}
          />

        {/* Fine-tune — exposed as a collapsible advanced area so the
            seller can tweak individual colors after picking a palette,
            without the form looking overwhelming on first open. */}
        <details className="mt-4 group">
          <summary className="cursor-pointer text-[11px] font-semibold text-fuchsia-700 hover:underline">
            Personnaliser couleur par couleur
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <PpColorField
              label="Titre du produit"
              value={style.titleColor}
              onChange={(c) => setStyle({ titleColor: c, paletteId: undefined, useCustomPalette: true })}
              defaultLabel="Thème"
            />
            <PpColorField
              label="Prix"
              value={style.priceColor}
              onChange={(c) => setStyle({ priceColor: c, paletteId: undefined, useCustomPalette: true })}
              defaultLabel="Primaire"
            />
            <PpColorField
              label="Accent (badges/timer)"
              value={style.accentColor}
              onChange={(c) => setStyle({ accentColor: c, paletteId: undefined, useCustomPalette: true })}
              defaultLabel="Primaire"
            />
            <PpColorField
              label="Bouton « Commander »"
              value={style.buttonColor}
              onChange={(c) => setStyle({ buttonColor: c, paletteId: undefined, useCustomPalette: true })}
              defaultLabel="Accent"
            />
            <PpColorField
              label="Texte du bouton"
              value={style.buttonTextColor}
              onChange={(c) => setStyle({ buttonTextColor: c, paletteId: undefined, useCustomPalette: true })}
              defaultLabel="Auto"
            />
            <PpColorField
              label="Fond de page"
              value={style.backgroundColor}
              onChange={(c) => setStyle({ backgroundColor: c, paletteId: undefined, useCustomPalette: true })}
              defaultLabel="Thème"
            />
            <PpColorField
              label="Texte description"
              value={style.descriptionColor}
              onChange={(c) => setStyle({ descriptionColor: c, paletteId: undefined, useCustomPalette: true })}
              defaultLabel="Auto"
            />
            <PpColorField
              label="Fond navbar"
              value={style.navbarColor}
              onChange={(c) => setStyle({ navbarColor: c, paletteId: undefined, useCustomPalette: true })}
              defaultLabel="Thème"
            />
            <PpColorField
              label="Texte navbar"
              value={style.navbarTextColor}
              onChange={(c) => setStyle({ navbarTextColor: c, paletteId: undefined, useCustomPalette: true })}
              defaultLabel="Auto"
            />
          </div>
        </details>

        {/* CTA button — shape + animation. Moved here from /checkout so the
            entire visual identity of the product page (palette + button) lives
            in one place. These win over store.codForm.button* on the storefront. */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Forme du bouton « Commander »</Label>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {([
                { v: 'pill',    label: 'Pilule',  preview: 'rounded-full' },
                { v: 'rounded', label: 'Arrondi', preview: 'rounded-lg' },
                { v: 'square',  label: 'Carré',   preview: 'rounded-none' },
              ] as const).map((opt) => {
                const active = (style.buttonShape || 'pill') === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setStyle({ buttonShape: opt.v, paletteId: undefined, useCustomPalette: true })}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border p-2 text-[11px] font-medium transition-all',
                      active
                        ? 'border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-800 shadow-sm'
                        : 'border-border/60 text-muted-foreground hover:border-fuchsia-500/40'
                    )}
                  >
                    <div className={cn('h-3 w-10 bg-gradient-to-r from-fuchsia-500 to-pink-500', opt.preview)} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label className="text-xs">Animation du bouton</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {([
                { v: 'none',    label: 'Statique' },
                { v: 'pulse',   label: 'Pulsation' },
                { v: 'shimmer', label: 'Brillance' },
                { v: 'bounce',  label: 'Bondi' },
              ] as const).map((opt) => {
                const current = style.buttonAnimated === false
                  ? 'none'
                  : (style.buttonAnimation || (style.buttonAnimated ? 'pulse' : 'none'));
                const active = current === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setStyle({
                      buttonAnimated: opt.v !== 'none',
                      buttonAnimation: opt.v === 'none' ? 'none' : opt.v,
                      paletteId: undefined, useCustomPalette: true,
                    })}
                    className={cn(
                      'rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all',
                      active
                        ? 'border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-800 shadow-sm'
                        : 'border-border/60 text-muted-foreground hover:border-fuchsia-500/40'
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        </div>{/* /useCustomPalette dimmer */}

        <div className="mt-4">
          <Label className="text-xs">Disposition de la galerie</Label>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {([
              { v: 'single',     label: 'Image unique', icon: ImgIcon,    hint: 'Une seule grande image' },
              { v: 'thumbnails', label: 'Miniatures',   icon: Columns2,   hint: 'Image + bande de miniatures' },
              { v: 'grid',       label: 'Mosaïque',     icon: LayoutGrid, hint: 'Grille 2×2 (jusqu’à 4 photos)' },
            ] as const).map((opt) => {
              const Icon = opt.icon;
              const active = (style.galleryLayout || 'thumbnails') === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setStyle({ galleryLayout: opt.v })}
                  title={opt.hint}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] font-medium transition-all',
                    active
                      ? 'border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-800 shadow-sm'
                      : 'border-border/60 text-muted-foreground hover:border-fuchsia-500/40'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 space-y-3">
          <FieldToggle
            label="Bande d'avis (5 étoiles)"
            sublabel="Petite ligne décorative ★★★★★ sous le titre"
            checked={!!style.showRatingStrip}
            onChange={(v) => setStyle({ showRatingStrip: v })}
          />

          {style.showRatingStrip && (
            <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Note (étoiles pleines)
                </label>
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.1}
                  value={style.ratingStripStars ?? 5}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    setStyle({ ratingStripStars: Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : undefined });
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  De 0 à 5 — accepte les demi-étoiles (ex. 4.5).
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Nombre d&apos;avis
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={style.ratingStripReviews ?? 127}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setStyle({ ratingStripReviews: Number.isFinite(n) ? Math.max(0, n) : undefined });
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Affiché entre parenthèses : « ({(style.ratingStripReviews ?? 127).toLocaleString('fr-FR')} avis) ».
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── SECTION ORDER ─────────────────────────────────────── */}
      <section className="rounded-xl border border-border/60 bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Ordre des sections</h3>
            <p className="text-[11px] text-muted-foreground">
              Réordonne les 4 sections du bas de la page produit. La fiche
              principale (photo + prix + form COD) reste toujours en haut.
            </p>
          </div>
          {cfg.sectionOrder && cfg.sectionOrder.length > 0 && (
            <button
              type="button"
              onClick={() => onChange({ ...cfg, sectionOrder: DEFAULT_PRODUCT_PAGE_ORDER })}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              Réinitialiser
            </button>
          )}
        </div>
        <ul className="mt-3 space-y-1">
          {order.map((id, i) => {
            const meta = SECTION_META[id];
            const Icon = meta.icon;
            const canUp = i > 0;
            const canDown = i < order.length - 1;
            const enabled =
              id === 'badges'       ? cfg.showBadges !== false
              : id === 'timer'        ? !!cfg.showTimer
              : id === 'description'  ? cfg.showDescription !== false
              : /* testimonials */     !!cfg.showTestimonials;
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-2 py-1.5"
              >
                <span className="grid h-4 w-4 place-items-center text-[10px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-md',
                    enabled
                      ? 'bg-gradient-to-br from-primary to-fuchsia-600 text-white shadow-sm'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">{meta.label}</div>
                  <div className="text-[10px] text-muted-foreground">{meta.help}</div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    disabled={!canUp}
                    onClick={() => moveSection(id, -1)}
                    aria-label="Monter"
                    className={cn(
                      'grid h-7 w-7 place-items-center rounded',
                      canUp ? 'text-muted-foreground hover:bg-muted hover:text-foreground' : 'text-muted-foreground/30'
                    )}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={!canDown}
                    onClick={() => moveSection(id, 1)}
                    aria-label="Descendre"
                    className={cn(
                      'grid h-7 w-7 place-items-center rounded',
                      canDown ? 'text-muted-foreground hover:bg-muted hover:text-foreground' : 'text-muted-foreground/30'
                    )}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── BADGES ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border/60 bg-card p-4">
        <FieldToggle
          label="Badges de confiance"
          sublabel="Livraison rapide, paiement sécurisé, garantie de retour…"
          checked={cfg.showBadges !== false}
          onChange={(v) => onChange({ ...cfg, showBadges: v })}
        />
        {cfg.showBadges !== false && (
          <div className="mt-3 space-y-2">
            {badges.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3 text-center text-[11px] text-muted-foreground">
                Aucun badge personnalisé — la boutique affichera 3 badges par défaut.
                <div className="mt-2">
                  <Button type="button" size="sm" variant="outline" onClick={seedDefaultBadges} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Charger les 3 badges par défaut
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {badges.map((b, i) => {
                  const Icon = BADGE_ICONS[b.icon] || Truck;
                  return (
                    <div
                      key={i}
                      className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-2"
                    >
                      <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                        <details className="relative">
                          <summary
                            className="grid h-9 w-9 cursor-pointer place-items-center rounded-md bg-primary/10 text-primary overflow-hidden"
                            title="Changer l'icône ou l'image"
                          >
                            {b.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={b.imageUrl} alt="" className="h-full w-full object-contain" />
                            ) : (
                              <Icon className="h-4 w-4" />
                            )}
                          </summary>
                          <div className="absolute left-0 top-10 z-20 grid w-44 grid-cols-5 gap-1 rounded-lg border border-border bg-card p-2 shadow-lg">
                            {ICON_LIST.map((ic) => {
                              const IC = BADGE_ICONS[ic];
                              const active = ic === b.icon && !b.imageUrl;
                              return (
                                <button
                                  key={ic}
                                  type="button"
                                  onClick={() => updateBadge(i, { icon: ic, imageUrl: undefined })}
                                  className={cn(
                                    'grid h-8 w-8 place-items-center rounded-md transition-colors',
                                    active ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                  )}
                                >
                                  <IC className="h-4 w-4" />
                                </button>
                              );
                            })}
                          </div>
                        </details>
                        <Input
                          value={b.label}
                          onChange={(e) => updateBadge(i, { label: e.target.value })}
                          placeholder="Livraison rapide"
                          className="h-9 text-sm"
                        />
                        <Input
                          value={b.sublabel || ''}
                          onChange={(e) => updateBadge(i, { sublabel: e.target.value })}
                          placeholder="2 à 5 jours (optionnel)"
                          className="h-9 text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={() => removeBadge(i)}
                          className="grid h-9 w-9 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {/* Custom image slot — the vendor can upload their own
                          badge image (partner logo, hand-drawn seal, …). If set
                          it takes priority over the Lucide icon at render time. */}
                      <div className="flex items-center gap-2 pl-11 text-[11px]">
                        {b.imageUrl ? (
                          <>
                            <span className="text-emerald-700">✓ Image custom</span>
                            <button
                              type="button"
                              onClick={() => updateBadge(i, { imageUrl: undefined })}
                              className="text-muted-foreground hover:text-destructive underline"
                            >
                              retirer
                            </button>
                          </>
                        ) : (
                          <label className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) void uploadBadgeImage(i, f);
                                e.target.value = '';
                              }}
                            />
                            📷 Ajouter une image custom (optionnel)
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
                <Button type="button" size="sm" variant="outline" onClick={addBadge} className="mt-1 gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Ajouter un badge
                </Button>
              </>
            )}
          </div>
        )}
      </section>

      {/* ── TIMER ──────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border/60 bg-card p-4">
        <FieldToggle
          label="Compte à rebours (urgence)"
          sublabel="Affiche un timer qui pousse à commander avant la fin"
          checked={!!cfg.showTimer}
          onChange={(v) => onChange({ ...cfg, showTimer: v })}
        />
        {cfg.showTimer && (
          <div className="mt-4 space-y-4">
            {/* Preset templates — one-click setups for the most common urgency scenarios */}
            <TimerPresetPicker
              value={cfg.timer}
              onApply={(next) => onChange({ ...cfg, timer: { ...(cfg.timer || {}), ...next } })}
            />

            {/* Fine-tune — visible once a model is applied OR for fully custom configs */}
            {cfg.timer?.endsAt && (
              <div className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1">
                  <Label htmlFor="timer-end" className="text-[10px] uppercase tracking-wider text-muted-foreground">Fin du compteur</Label>
                  <Input
                    id="timer-end"
                    type="datetime-local"
                    value={cfg.timer?.endsAt ? new Date(cfg.timer.endsAt).toISOString().slice(0, 16) : ''}
                    onChange={(e) =>
                      onChange({
                        ...cfg,
                        timer: { ...(cfg.timer || {}), endsAt: e.target.value ? new Date(e.target.value).toISOString() : undefined },
                      })
                    }
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="timer-headline" className="text-[10px] uppercase tracking-wider text-muted-foreground">Texte</Label>
                  <Input
                    id="timer-headline"
                    value={cfg.timer?.headline || ''}
                    onChange={(e) =>
                      onChange({
                        ...cfg,
                        timer: { ...(cfg.timer || {}), headline: e.target.value },
                      })
                    }
                    placeholder="Offre limitée — finit dans"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Couleur</Label>
                  <input
                    type="color"
                    value={cfg.timer?.accentColor || '#ef4444'}
                    onChange={(e) =>
                      onChange({
                        ...cfg,
                        timer: { ...(cfg.timer || {}), accentColor: e.target.value },
                      })
                    }
                    className="h-9 w-12 cursor-pointer rounded-md border border-border/60 bg-background p-0"
                  />
                </div>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              Quand le compteur atteint zéro, le bloc disparaît automatiquement de la page produit.
            </p>
          </div>
        )}
      </section>

      {/* ── TESTIMONIALS + DESCRIPTION + ADD-TO-CART TOGGLES ──── */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <FieldToggle
            label="Avis clients sur la page produit"
            sublabel="Utilise les témoignages de la boutique"
            checked={!!cfg.showTestimonials}
            onChange={(v) => onChange({ ...cfg, showTestimonials: v })}
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <FieldToggle
            label="Description longue"
            sublabel="Affiche la description sous la fiche"
            checked={cfg.showDescription !== false}
            onChange={(v) => onChange({ ...cfg, showDescription: v })}
          />
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <FieldToggle
            label="Bouton « Ajouter au panier »"
            sublabel="Désactive pour une page 100% COD"
            checked={cfg.showAddToCart !== false}
            onChange={(v) => onChange({ ...cfg, showAddToCart: v })}
          />
        </div>
      </section>

      {/* ── FORMULAIRE COD — only when the seller wired this editor to
            store.codForm via the optional props. Surfaces texts + shipping
            + field toggles inline so the page produit tab is now the single
            source of truth for the seller's product page experience. ── */}
      {codForm && onCodFormChange && storeType === 'physical' && (
        <section className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-card p-4">
          <div className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-emerald-600" />
            Formulaire de commande (COD)
            <span className="ml-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              Au cœur de la fiche
            </span>
          </div>
          <p className="mb-4 text-[11px] text-muted-foreground">
            Textes affichés, champs visibles + frais de livraison. Le design (couleurs, forme du bouton) se règle dans <strong>Style visuel</strong> juste au-dessus.
          </p>

          {/* Texts */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Titre du formulaire</Label>
              <Input
                value={codForm.headline || ''}
                onChange={(e) => onCodFormChange({ ...codForm, headline: e.target.value })}
                placeholder="Commander · Paiement à la livraison"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Texte du bouton</Label>
              <Input
                value={codForm.submitLabel || ''}
                onChange={(e) => onCodFormChange({ ...codForm, submitLabel: e.target.value })}
                placeholder="Commander"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Phrase rassurante (sous le bouton)</Label>
              <Input
                value={codForm.reassurance || ''}
                onChange={(e) => onCodFormChange({ ...codForm, reassurance: e.target.value })}
                placeholder="Aucun prépaiement, paiement à la livraison uniquement"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Frais de livraison ({currency})</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={codForm.shippingFee ?? ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  onCodFormChange({ ...codForm, shippingFee: Number.isFinite(v) && v >= 0 ? v : undefined });
                }}
                placeholder="0"
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground">Ajouté au total à payer.</p>
            </div>
          </div>

          {/* Field toggles */}
          <div className="mt-4 border-t border-border/60 pt-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Champs visibles
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <FieldToggle
                label="Email"
                sublabel="On peut envoyer la confirmation par email"
                checked={!!codForm.showEmail}
                onChange={(v) => onCodFormChange({ ...codForm, showEmail: v })}
              />
              <FieldToggle
                label="Email obligatoire"
                sublabel="Force le client à saisir un email"
                disabled={!codForm.showEmail}
                checked={!!codForm.requireEmail}
                onChange={(v) => onCodFormChange({ ...codForm, requireEmail: v })}
              />
              <FieldToggle
                label="Ville"
                sublabel="Demande la ville de livraison"
                checked={!!codForm.showCity}
                onChange={(v) => onCodFormChange({ ...codForm, showCity: v })}
              />
              <FieldToggle
                label="Complément d'adresse"
                sublabel="Étage, repère, appartement…"
                checked={!!codForm.showAddressLine2}
                onChange={(v) => onCodFormChange({ ...codForm, showAddressLine2: v })}
              />
              <FieldToggle
                label="Code postal"
                sublabel="Recommandé Maroc / Tunisie"
                checked={!!codForm.showPostalCode}
                onChange={(v) => onCodFormChange({ ...codForm, showPostalCode: v })}
              />
              <FieldToggle
                label="Région / État"
                sublabel="Province, wilaya, etc."
                checked={!!codForm.showState}
                onChange={(v) => onCodFormChange({ ...codForm, showState: v })}
              />
              <FieldToggle
                label="Note pour le livreur"
                sublabel="Repère, étage, instructions"
                checked={!!codForm.showNotes}
                onChange={(v) => onCodFormChange({ ...codForm, showNotes: v })}
              />
              <FieldToggle
                label="Sélecteur de quantité"
                sublabel="Permet d'augmenter / diminuer"
                checked={!!codForm.showQuantity}
                onChange={(v) => onCodFormChange({ ...codForm, showQuantity: v })}
              />
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">
              Nom, téléphone et adresse sont toujours affichés (obligatoires). Les autres champs sont opt-in.
            </p>
          </div>
        </section>
      )}
      </div>

      {/* ── LIVE PREVIEW (sticky right) ─────────────────────── */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <ProductPageLivePreview cfg={cfg} codForm={codForm} currency={currency} storeType={storeType} />
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/** Compact form-field stub used by the COD form mock in the live preview. */
function PpFieldStub({ label }: { label: string }) {
  return (
    <div className="space-y-[2px]">
      <div className="text-[7px] font-medium" style={{ color: '#64748b' }}>{label}</div>
      <div className="h-4 rounded border border-border/40 bg-background/80" />
    </div>
  );
}

function PpColorField({
  label, value, onChange, defaultLabel,
}: { label: string; value?: string; onChange: (v?: string) => void; defaultLabel: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value || '#7c3aed'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 cursor-pointer rounded-md border border-border/60 bg-background p-0"
        />
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={defaultLabel}
          className="h-9 flex-1 font-mono text-[11px]"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="rounded px-1.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Reset"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Live preview — mini mock of the public product page
// ─────────────────────────────────────────────────────────────────────

/**
 * Faithful but compact mock of the storefront product page. Re-renders
 * in real-time as the seller edits — no save needed. The actual public
 * page uses the same data once persisted.
 */
function ProductPageLivePreview({
  cfg,
  codForm,
  currency = 'TND',
  storeType = 'physical',
}: {
  cfg: ProductPageSettings;
  codForm?: CodFormSettings;
  currency?: string;
  storeType?: 'physical' | 'digital';
}) {
  const rawStyle = cfg.style || {};
  // Same gate as the storefront: when useCustomPalette is off, the preview
  // shows neutral defaults so the seller sees exactly what the public page
  // will render (= the theme). Layout choices (gallery, rating) still apply.
  const customOn = !!rawStyle.useCustomPalette;
  const style = customOn
    ? rawStyle
    : ({ galleryLayout: rawStyle.galleryLayout, showRatingStrip: rawStyle.showRatingStrip } as typeof rawStyle);
  const accent = style.accentColor || '#7c3aed';
  const titleColor = style.titleColor || '#0f172a';
  const priceColor = style.priceColor || accent;
  // Button colors fall back to accent so legacy configs still render the CTA
  // in the right family. Background falls back to white for the mock.
  const buttonBg = style.buttonColor || accent;
  const buttonFg = style.buttonTextColor || '#ffffff';
  const pageBg = style.backgroundColor || '#ffffff';
  // Description body text — falls back to title color so dark palettes
  // (mode sombre) read legibly on the dark background.
  const descColor = style.descriptionColor || style.titleColor || '#374151';
  // Navbar bar in the mock — palette-driven so the seller can confirm the
  // navbar override before publishing.
  const navBg = style.navbarColor || '#ffffff';
  const navFg = style.navbarTextColor || '#0a0a0a';
  const layout = style.galleryLayout || 'thumbnails';
  const order = resolveProductPageOrder(cfg.sectionOrder);
  const badges = (cfg.badges && cfg.badges.length > 0) ? cfg.badges : defaultBadgesForStoreType(storeType);
  const fakePrice = '49.90';

  // Viewport selector — drives the mock's max-width AND its column layout
  // so the seller actually sees how the page wraps on each device, not a
  // simple width clamp that would look like a narrow desktop.
  const [device, setDevice] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
  const isMobile = device === 'mobile';
  const frameMaxWidth =
    device === 'mobile'  ? 280
    : device === 'tablet' ? 420
    : 9999;
  // On mobile the hero stacks gallery → info; tablet/desktop keep 2-col.
  const heroGridClass = isMobile ? 'space-y-2' : 'grid grid-cols-2 gap-2';

  // Live timer countdown for the preview — same self-update pattern as
  // the real component, capped to "demo" granularity.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  void tick;

  const timerEnds = cfg.timer?.endsAt ? new Date(cfg.timer.endsAt).getTime() : 0;
  const timerDelta = Math.max(0, timerEnds - Date.now());
  const timerActive = !!cfg.showTimer && timerDelta > 0;
  const tparts = (() => {
    const s = Math.floor(timerDelta / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return [d, h, m, ss];
  })();

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-gradient-to-r from-muted/30 to-muted/10 px-3 py-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <FileText className="h-3 w-3" />
          Aperçu temps réel
        </div>
        {/* Viewport switcher — adapts the mock browser width AND the hero
            layout (mobile = single column, tablet/desktop = 2 columns). */}
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5">
          {([
            { id: 'mobile',  icon: Smartphone, label: 'Mobile' },
            { id: 'tablet',  icon: Tablet,     label: 'Tablette' },
            { id: 'desktop', icon: Monitor,    label: 'Desktop' },
          ] as const).map((d) => {
            const Icon = d.icon;
            const active = device === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDevice(d.id)}
                title={d.label}
                aria-label={d.label}
                aria-pressed={active}
                className={cn(
                  'grid h-6 w-6 place-items-center rounded transition-all',
                  active ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-h-[80vh] overflow-y-auto bg-muted/20 p-3">
        {/* Mini browser frame — width changes with device. Background is
            driven by the palette so dark-mode palettes flip the whole
            inner page (and not just text/buttons). */}
        <div
          className="mx-auto overflow-hidden rounded-xl shadow-sm transition-all"
          style={{ maxWidth: frameMaxWidth, backgroundColor: pageBg }}
        >
          <div className="flex items-center gap-1 border-b border-border/40 bg-muted/30 px-2 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
            <span className="ml-2 truncate text-[9px] text-muted-foreground">/produit/mon-produit</span>
          </div>

          {/* Mock navbar — reflects palette navbarColor/navbarTextColor so the
              seller validates the navbar override before publishing. */}
          <div
            className="flex items-center justify-between border-b border-border/40 px-2 py-1.5"
            style={{ backgroundColor: navBg }}
          >
            <span className="truncate text-[9px] font-bold" style={{ color: navFg }}>
              MA BOUTIQUE
            </span>
            <div className="flex items-center gap-2 text-[8px]" style={{ color: navFg }}>
              <span>Accueil</span>
              <span>Catalogue</span>
              <span>Contact</span>
            </div>
          </div>

          <div className="space-y-3 p-3">
            {/* HERO — gallery + info (stacks on mobile, side-by-side otherwise) */}
            <div className={heroGridClass}>
              {/* Gallery */}
              <div className="space-y-1">
                {layout === 'grid' ? (
                  <div className="grid grid-cols-2 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="aspect-square rounded"
                        style={{ backgroundColor: `${accent}1a`, backgroundImage: `linear-gradient(135deg, ${accent}33, ${accent}10)` }}
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    <div
                      className="aspect-square rounded"
                      style={{ backgroundColor: `${accent}1a`, backgroundImage: `linear-gradient(135deg, ${accent}33, ${accent}10)` }}
                    />
                    {layout === 'thumbnails' && (
                      <div className="grid grid-cols-4 gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="aspect-square rounded border"
                            style={{ backgroundColor: `${accent}10`, borderColor: `${accent}30` }}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              {/* Info */}
              <div className="space-y-1.5">
                <h3
                  className="text-sm font-bold leading-tight"
                  style={{ color: titleColor }}
                >
                  Mon Produit
                </h3>
                {style.showRatingStrip && (() => {
                  const stars = Math.max(0, Math.min(5, style.ratingStripStars ?? 5));
                  const reviews = Math.max(0, style.ratingStripReviews ?? 127);
                  return (
                    <div className="flex items-center gap-0.5">
                      {[0, 1, 2, 3, 4].map((i) => {
                        const fill = Math.max(0, Math.min(1, stars - i));
                        return (
                          <span key={i} className="relative inline-flex h-2.5 w-2.5">
                            <Star className="h-2.5 w-2.5" style={{ color: 'rgb(212, 212, 216)' }} />
                            {fill > 0 && (
                              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                                <Star className="h-2.5 w-2.5" style={{ color: accent, fill: accent }} />
                              </span>
                            )}
                          </span>
                        );
                      })}
                      <span className="ml-1 text-[8px] text-muted-foreground">({reviews.toLocaleString('fr-FR')})</span>
                    </div>
                  );
                })()}
                <div className="text-base font-extrabold leading-none" style={{ color: priceColor }}>
                  {fakePrice} {currency}
                </div>
                {/* COD form mock — replaces the stub button with the real form
                    structure when this preview was wired with a codForm. Shows
                    the seller's headline, every opted-in field, the totals
                    breakdown and the configured button. */}
                {storeType === 'physical' ? (
                  <div
                    className="space-y-1.5 rounded border border-border/40 p-1.5"
                    style={{ backgroundColor: codForm?.backgroundColor || '#ffffff' }}
                  >
                    <div className="text-[9px] font-bold leading-tight" style={{ color: '#0f172a' }}>
                      {codForm?.headline || 'Commander · Paiement à la livraison'}
                    </div>

                    {/* Mandatory fields — always rendered */}
                    <div className="grid grid-cols-2 gap-1">
                      <PpFieldStub label="Nom *" />
                      <PpFieldStub label="Tél *" />
                    </div>
                    {codForm?.showEmail && (
                      <PpFieldStub label={codForm.requireEmail ? 'Email *' : 'Email'} />
                    )}
                    <PpFieldStub label="Pays *" />
                    <PpFieldStub label="Adresse *" />
                    {codForm?.showAddressLine2 && <PpFieldStub label="Complément" />}
                    {(codForm?.showCity || codForm?.showState || codForm?.showPostalCode) && (
                      <div className="grid grid-cols-3 gap-1">
                        {codForm?.showCity && <PpFieldStub label="Ville *" />}
                        {codForm?.showState && <PpFieldStub label="Région" />}
                        {codForm?.showPostalCode && <PpFieldStub label="CP" />}
                      </div>
                    )}
                    {codForm?.showNotes && <PpFieldStub label="Note livreur" />}
                    {codForm?.showQuantity && (
                      <div className="flex items-center justify-between border-t border-border/40 pt-1 text-[8px]">
                        <span style={{ color: '#64748b' }}>Quantité</span>
                        <span className="inline-flex items-center gap-1 rounded border border-border/40 px-1">−<span className="px-1 font-bold">1</span>+</span>
                      </div>
                    )}

                    {/* Totals — render shipping line when fee configured */}
                    {(codForm?.shippingFee ?? 0) > 0 ? (
                      <div className="space-y-0.5 border-t border-border/40 pt-1 text-[8px]" style={{ color: '#64748b' }}>
                        <div className="flex items-center justify-between">
                          <span>Sous-total</span><span>{fakePrice} {currency}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Livraison</span><span>+ {(codForm?.shippingFee ?? 0).toFixed(2)} {currency}</span>
                        </div>
                        <div className="flex items-center justify-between pt-0.5" style={{ color: '#0f172a' }}>
                          <span className="font-medium">À payer</span>
                          <span className="font-extrabold" style={{ color: priceColor }}>
                            {(parseFloat(fakePrice) + (codForm?.shippingFee ?? 0)).toFixed(2)} {currency}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      className="inline-flex h-7 w-full items-center justify-center text-[10px] font-bold"
                      style={{
                        backgroundColor: buttonBg,
                        color: buttonFg,
                        borderRadius:
                          (style.buttonShape || 'pill') === 'pill' ? 999
                          : (style.buttonShape === 'square') ? 0 : 8,
                      }}
                    >
                      {codForm?.submitLabel || 'Commander'} ·{' '}
                      {(parseFloat(fakePrice) + (codForm?.shippingFee ?? 0)).toFixed(2)} {currency}
                    </button>
                    {codForm?.reassurance && (
                      <p className="text-center text-[7px]" style={{ color: '#64748b' }}>
                        {codForm.reassurance}
                      </p>
                    )}
                  </div>
                ) : (
                  // Digital — no COD form, just the "Acheter" CTA
                  <button
                    type="button"
                    className="mt-1 inline-flex h-7 w-full items-center justify-center rounded-md text-[10px] font-bold"
                    style={{ backgroundColor: buttonBg, color: buttonFg }}
                  >
                    ⚡ Acheter · {fakePrice} {currency}
                  </button>
                )}
              </div>
            </div>

            {/* Reorderable body sections */}
            {order.map((id) => {
              if (id === 'badges' && cfg.showBadges !== false) {
                return (
                  <div key="badges" className="grid grid-cols-3 gap-1.5">
                    {badges.slice(0, 3).map((b, i) => (
                      <div key={i} className="flex items-center gap-1 rounded border border-border/60 bg-card px-1.5 py-1">
                        <span
                          className="grid h-4 w-4 shrink-0 place-items-center rounded text-[8px]"
                          style={{ backgroundColor: `${accent}1a`, color: accent }}
                        >
                          ✓
                        </span>
                        <span className="min-w-0 truncate text-[9px] font-semibold" style={{ color: titleColor }}>
                          {b.label}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }
              if (id === 'timer' && timerActive) {
                return (
                  <div
                    key="timer"
                    className="flex items-center justify-between rounded border px-2 py-1.5"
                    style={{ borderColor: `${accent}40`, backgroundColor: `${accent}0d` }}
                  >
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: accent }}>
                      <Clock className="h-3 w-3" />
                      {cfg.timer?.headline || 'Offre limitée'}
                    </span>
                    <span className="flex gap-0.5 tabular-nums">
                      {tparts.map((v, i) => (
                        <span
                          key={i}
                          className="rounded px-1 py-0.5 text-[9px] font-extrabold text-white"
                          style={{ backgroundColor: accent }}
                        >
                          {String(v).padStart(2, '0')}
                        </span>
                      ))}
                    </span>
                  </div>
                );
              }
              if (id === 'description' && cfg.showDescription !== false) {
                return (
                  <div key="description">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: titleColor }}>
                      Description
                    </div>
                    {/* Render real description body in the palette color so
                        the seller previews exactly how their description reads. */}
                    <div className="space-y-1 text-[9px] leading-snug" style={{ color: descColor }}>
                      <p>Lorem ipsum dolor sit amet — voici le ton de la description.</p>
                      <p>Chaque ligne se rendra dans cette couleur sur la fiche publique.</p>
                    </div>
                  </div>
                );
              }
              if (id === 'testimonials' && cfg.showTestimonials) {
                return (
                  <div key="testimonials">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: titleColor }}>
                      Avis clients
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[0, 1].map((i) => (
                        <div key={i} className="rounded border border-border/60 bg-card p-1.5">
                          <div className="flex items-center gap-0.5">
                            {[0, 1, 2, 3, 4].map((j) => (
                              <Star key={j} className="h-2 w-2" style={{ color: accent, fill: accent }} />
                            ))}
                          </div>
                          <div className="mt-1 space-y-0.5">
                            <div className="h-1 w-full rounded bg-muted/80" />
                            <div className="h-1 w-3/4 rounded bg-muted/80" />
                          </div>
                          <div className="mt-1.5 text-[8px] font-semibold" style={{ color: titleColor }}>
                            — Client
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>
        <p className="mt-2 text-center text-[9px] text-muted-foreground">
          Reflète exactement ce qu'affichera la vraie page produit après sauvegarde
        </p>
      </div>
    </div>
  );
}
