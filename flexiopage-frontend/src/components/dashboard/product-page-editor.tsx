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
  DEFAULT_BADGES,
  DEFAULT_PRODUCT_PAGE_ORDER,
  resolveProductPageOrder,
  type BadgeIcon,
  type ProductPageSectionId,
  type ProductPageSettings,
  type ProductPageStyle,
  type TrustBadge,
} from '@/lib/product-page-order';
import { FieldToggle } from '@/components/dashboard/store-editor';

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
}

export function ProductPageEditor({ cfg, onChange }: Props) {
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
    onChange({ ...cfg, badges: DEFAULT_BADGES });
  }

  const style = cfg.style || {};
  const setStyle = (patch: Partial<ProductPageStyle>) =>
    onChange({ ...cfg, style: { ...style, ...patch } });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
      {/* ── STYLE — colors + gallery layout ──────────────────── */}
      <section className="rounded-xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/5 to-card p-4">
        <div className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold">
          <PaletteIcon className="h-4 w-4 text-fuchsia-600" />
          Style visuel
          <span className="ml-1 rounded-full bg-fuchsia-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-700">
            Surcharge le thème
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <PpColorField
            label="Titre du produit"
            value={style.titleColor}
            onChange={(c) => setStyle({ titleColor: c })}
            defaultLabel="Thème"
          />
          <PpColorField
            label="Prix"
            value={style.priceColor}
            onChange={(c) => setStyle({ priceColor: c })}
            defaultLabel="Primaire"
          />
          <PpColorField
            label="Accent (badges/timer)"
            value={style.accentColor}
            onChange={(c) => setStyle({ accentColor: c })}
            defaultLabel="Primaire"
          />
        </div>

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

        <div className="mt-3">
          <FieldToggle
            label="Bande d'avis (5 étoiles)"
            sublabel="Petite ligne décorative ★★★★★ sous le titre"
            checked={!!style.showRatingStrip}
            onChange={(v) => setStyle({ showRatingStrip: v })}
          />
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
                      className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2"
                    >
                      <details className="relative">
                        <summary
                          className="grid h-9 w-9 cursor-pointer place-items-center rounded-md bg-primary/10 text-primary"
                          title="Changer l'icône"
                        >
                          <Icon className="h-4 w-4" />
                        </summary>
                        <div className="absolute left-0 top-10 z-20 grid w-44 grid-cols-5 gap-1 rounded-lg border border-border bg-card p-2 shadow-lg">
                          {ICON_LIST.map((ic) => {
                            const IC = BADGE_ICONS[ic];
                            const active = ic === b.icon;
                            return (
                              <button
                                key={ic}
                                type="button"
                                onClick={() => updateBadge(i, { icon: ic })}
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
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="timer-end" className="text-xs">Fin du compteur</Label>
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
              <p className="text-[10px] text-muted-foreground">
                Quand le compteur atteint zéro, le bloc disparaît automatiquement.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="timer-headline" className="text-xs">Texte du timer</Label>
              <Input
                id="timer-headline"
                value={cfg.timer?.headline || ''}
                onChange={(e) =>
                  onChange({
                    ...cfg,
                    timer: { ...(cfg.timer || {}), headline: e.target.value },
                  })
                }
                placeholder="Offre limitée — finit dans…"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Couleur d'accent</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={cfg.timer?.accentColor || '#ef4444'}
                  onChange={(e) =>
                    onChange({
                      ...cfg,
                      timer: { ...(cfg.timer || {}), accentColor: e.target.value },
                    })
                  }
                  className="h-9 w-11 cursor-pointer rounded-md border border-border/60 bg-background p-0"
                />
                <Input
                  value={cfg.timer?.accentColor || ''}
                  onChange={(e) =>
                    onChange({
                      ...cfg,
                      timer: { ...(cfg.timer || {}), accentColor: e.target.value || undefined },
                    })
                  }
                  placeholder="#ef4444 (rouge urgence par défaut)"
                  className="h-9 flex-1 font-mono text-xs"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── TESTIMONIALS + DESCRIPTION TOGGLE ──────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2">
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
      </section>
      </div>

      {/* ── LIVE PREVIEW (sticky right) ─────────────────────── */}
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <ProductPageLivePreview cfg={cfg} />
      </aside>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

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
function ProductPageLivePreview({ cfg }: { cfg: ProductPageSettings }) {
  const style = cfg.style || {};
  const accent = style.accentColor || '#7c3aed';
  const titleColor = style.titleColor || '#0f172a';
  const priceColor = style.priceColor || accent;
  const layout = style.galleryLayout || 'thumbnails';
  const order = resolveProductPageOrder(cfg.sectionOrder);
  const badges = (cfg.badges && cfg.badges.length > 0) ? cfg.badges : DEFAULT_BADGES;
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
        {/* Mini browser frame — width changes with device */}
        <div
          className="mx-auto overflow-hidden rounded-xl bg-card shadow-sm transition-all"
          style={{ maxWidth: frameMaxWidth }}
        >
          <div className="flex items-center gap-1 border-b border-border/40 bg-muted/30 px-2 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
            <span className="ml-2 truncate text-[9px] text-muted-foreground">/produit/mon-produit</span>
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
                {style.showRatingStrip && (
                  <div className="flex items-center gap-0.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} className="h-2.5 w-2.5" style={{ color: accent, fill: accent }} />
                    ))}
                    <span className="ml-1 text-[8px] text-muted-foreground">(127)</span>
                  </div>
                )}
                <div className="text-base font-extrabold leading-none" style={{ color: priceColor }}>
                  {fakePrice} TND
                </div>
                <div className="space-y-1 pt-1">
                  <div className="h-1.5 w-full rounded bg-muted" />
                  <div className="h-1.5 w-2/3 rounded bg-muted" />
                </div>
                <button
                  type="button"
                  className="mt-1 inline-flex h-7 w-full items-center justify-center rounded-md text-[10px] font-bold text-white"
                  style={{ backgroundColor: accent }}
                >
                  Commander · {fakePrice} TND
                </button>
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
                    <div className="space-y-1">
                      <div className="h-1.5 w-full rounded bg-muted/80" />
                      <div className="h-1.5 w-11/12 rounded bg-muted/80" />
                      <div className="h-1.5 w-3/4 rounded bg-muted/80" />
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
