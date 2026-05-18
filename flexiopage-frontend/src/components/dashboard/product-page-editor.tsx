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

import {
  Truck, ShieldCheck, RefreshCcw, Lock, Headphones, Gift, Clock,
  Star, Leaf, Banknote, Plus, Trash2, ChevronUp, ChevronDown,
  Timer, Award, MessageSquareQuote, FileText,
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

  return (
    <div className="space-y-6">
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
  );
}
