'use client';

/**
 * Product variants editor — couleur/taille style. Backed by
 * IProductVariant (already in Product.model). Each variant carries:
 *   - a display name ("Rouge / M")
 *   - an optional SKU + price override + stock count
 *   - free-form options key:value (Couleur=Rouge, Taille=M) so the COD
 *     form can render swatches grouped by attribute
 *
 * Kept intentionally simple — no auto-generation from a matrix. Sellers
 * with 50+ variants are rare; for now hand-pick keeps the UI honest.
 */

import { useState } from 'react';
import { Plus, Trash2, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface VariantOption {
  /** Attribute name (e.g. "Couleur", "Taille"). */
  key: string;
  /** Attribute value (e.g. "Rouge", "M"). */
  value: string;
}

export interface ProductVariant {
  name: string;
  sku?: string;
  price?: number;
  /** Per-variant stock count; 0 = out of stock. */
  stock?: number;
  /** Key→value pairs used to render swatches grouped by attribute. */
  options?: Record<string, string>;
}

interface Props {
  variants: ProductVariant[];
  onChange: (next: ProductVariant[]) => void;
  /** Used to format the price hint placeholder. */
  currency?: string;
  /** Fallback when a variant has no override price. */
  basePrice?: number;
}

function emptyVariant(): ProductVariant {
  return { name: '', stock: 0, options: {} };
}

export function VariantsEditor({ variants, onChange, currency = 'TND', basePrice }: Props) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  function patch(i: number, partial: Partial<ProductVariant>) {
    const next = variants.slice();
    next[i] = { ...next[i], ...partial };
    onChange(next);
  }
  function add() {
    onChange([...variants, emptyVariant()]);
    setExpandedIdx(variants.length);
  }
  function remove(i: number) {
    onChange(variants.filter((_, idx) => idx !== i));
    if (expandedIdx === i) setExpandedIdx(null);
  }
  function moveOptionKey(i: number, oldKey: string, newKey: string) {
    const opts = { ...(variants[i].options || {}) };
    const value = opts[oldKey];
    delete opts[oldKey];
    if (newKey.trim()) opts[newKey.trim()] = value;
    patch(i, { options: opts });
  }
  function setOptionValue(i: number, key: string, value: string) {
    const opts = { ...(variants[i].options || {}) };
    opts[key] = value;
    patch(i, { options: opts });
  }
  function removeOption(i: number, key: string) {
    const opts = { ...(variants[i].options || {}) };
    delete opts[key];
    patch(i, { options: opts });
  }
  function addOption(i: number) {
    // Find a unique key so two new options don't clash on the same row.
    const existing = Object.keys(variants[i].options || {});
    let k = 'Couleur';
    if (existing.includes(k)) k = 'Taille';
    if (existing.includes(k)) k = `Attribut ${existing.length + 1}`;
    setOptionValue(i, k, '');
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <Layers className="h-3.5 w-3.5" />
            Variantes ({variants.length})
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Ex: « Rouge / M », « Bleu / L »… Chaque variante a son propre prix et stock.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={add} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Ajouter une variante
        </Button>
      </div>

      {variants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-4 text-center text-xs text-muted-foreground">
          Aucune variante — le produit sera vendu en une seule version au prix principal.
        </div>
      ) : (
        <ul className="space-y-2">
          {variants.map((v, i) => {
            const expanded = expandedIdx === i;
            const optEntries = Object.entries(v.options || {});
            return (
              <li key={i} className="overflow-hidden rounded-xl border border-border/60 bg-card">
                <div className="flex items-center gap-2 p-2.5">
                  <button
                    type="button"
                    onClick={() => setExpandedIdx(expanded ? null : i)}
                    className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-muted"
                    aria-label={expanded ? 'Replier' : 'Déplier'}
                  >
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  <Input
                    value={v.name}
                    onChange={(e) => patch(i, { name: e.target.value })}
                    placeholder="Nom (ex: Rouge / M)"
                    className="h-9 flex-1 text-sm font-medium"
                  />
                  <div className="hidden items-center gap-1 text-[10px] text-muted-foreground sm:flex">
                    {(v.stock ?? 0) > 0 ? (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-700">
                        {v.stock} en stock
                      </span>
                    ) : (
                      <span className="rounded bg-rose-500/10 px-1.5 py-0.5 font-semibold text-rose-700">
                        Rupture
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="grid h-7 w-7 place-items-center rounded text-destructive hover:bg-destructive/10"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {expanded && (
                  <div className="space-y-3 border-t border-border/60 bg-muted/20 p-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">SKU</Label>
                        <Input
                          value={v.sku || ''}
                          onChange={(e) => patch(i, { sku: e.target.value || undefined })}
                          placeholder="TSHIRT-RED-M"
                          className="h-9 font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Prix ({currency})
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={v.price ?? ''}
                          onChange={(e) => {
                            const n = parseFloat(e.target.value);
                            patch(i, { price: Number.isFinite(n) && n >= 0 ? n : undefined });
                          }}
                          placeholder={basePrice ? String(basePrice) : 'prix principal'}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Stock</Label>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={v.stock ?? 0}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            patch(i, { stock: Number.isFinite(n) && n >= 0 ? n : 0 });
                          }}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Attributs
                        </Label>
                        <button
                          type="button"
                          onClick={() => addOption(i)}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                        >
                          <Plus className="h-3 w-3" /> Ajouter
                        </button>
                      </div>
                      {optEntries.length === 0 ? (
                        <p className="rounded-md border border-dashed border-border/60 bg-card px-2 py-1.5 text-[11px] text-muted-foreground">
                          Aucun attribut. Ajoute par ex. <code className="rounded bg-muted px-1">Couleur=Rouge</code>.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {optEntries.map(([k, val]) => (
                            <li key={k} className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                              <Input
                                value={k}
                                onChange={(e) => moveOptionKey(i, k, e.target.value)}
                                placeholder="Couleur"
                                className="h-8 text-xs"
                              />
                              <Input
                                value={val}
                                onChange={(e) => setOptionValue(i, k, e.target.value)}
                                placeholder="Rouge"
                                className="h-8 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => removeOption(i, k)}
                                className={cn(
                                  'grid h-8 w-8 place-items-center rounded text-destructive hover:bg-destructive/10'
                                )}
                                aria-label="Retirer l'attribut"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
