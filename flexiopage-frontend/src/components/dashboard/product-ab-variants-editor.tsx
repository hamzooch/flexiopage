'use client';

/**
 * Éditeur des variants A/B d'une page produit. Le vendeur crée plusieurs
 * variantes (titre, prix, images, description différents), chaque visiteur
 * est aléatoirement affecté à un bras et le dashboard mesure quel variant
 * convertit le mieux.
 *
 * Les variants sont stockés comme un sous-tableau `pageVariants` du Product.
 * Chaque variant a un `_id`, un libellé, un poids de tirage, un flag enabled,
 * et un bloc d'overrides partiels (name/price/compareAtPrice/description/images).
 */

import { useState } from 'react';
import { Plus, Trash2, ExternalLink, FlaskConical, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductImagesPicker } from '@/components/dashboard/product-images-picker';
import { useConfirm } from '@/components/ui/confirm-dialog';

export interface PageVariantOverrides {
  name?: string;
  price?: number;
  compareAtPrice?: number;
  description?: string;
  images?: string[];
}

export interface PageVariantDraft {
  _id?: string;
  name: string;
  enabled: boolean;
  weight: number;
  overrides: PageVariantOverrides;
}

interface Props {
  /** Variants actuels (depuis le produit chargé). */
  value: PageVariantDraft[];
  /** Appelé à chaque modification locale — le parent patch le produit. */
  onChange: (next: PageVariantDraft[]) => void;
  /** Store id — requis pour l'upload d'images via ProductImagesPicker. */
  storeId: string;
  /** Slug storefront pour construire les liens de preview `?v=<id>`. */
  storeSlug?: string;
  /** Slug du produit — même raison. */
  productSlug?: string;
  /** Devise d'affichage dans les champs prix. */
  currency?: string;
}

/**
 * Génère un id client stable pour les nouveaux variants (le vrai `_id` Mongo
 * sera assigné côté backend, mais on a besoin d'un id local le temps que
 * l'utilisateur sauvegarde pour pouvoir dédupliquer le state React).
 */
function tempId(): string {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
}

export function ProductAbVariantsEditor({
  value,
  onChange,
  storeId,
  storeSlug,
  productSlug,
  currency = 'TND',
}: Props) {
  const confirm = useConfirm();
  const [expandedId, setExpandedId] = useState<string | null>(value[0]?._id || null);

  function update(index: number, patch: Partial<PageVariantDraft>): void {
    onChange(value.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }
  function updateOverride(index: number, patch: Partial<PageVariantOverrides>): void {
    const current = value[index]?.overrides || {};
    update(index, { overrides: { ...current, ...patch } });
  }
  function addVariant(): void {
    const id = tempId();
    onChange([
      ...value,
      {
        _id: id,
        name: `Variante ${String.fromCharCode(65 + value.length)}`,
        enabled: true,
        weight: 1,
        overrides: {},
      },
    ]);
    setExpandedId(id);
  }
  async function removeVariant(index: number): Promise<void> {
    const v = value[index];
    const ok = await confirm({
      title: 'Supprimer ce variant ?',
      description: `« ${v.name} » et ses stats historiques ne seront plus visibles.`,
      confirmLabel: 'Supprimer',
      tone: 'destructive',
    });
    if (!ok) return;
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" aria-hidden />
            <CardTitle className="text-base">Test A/B — variantes de la page produit</CardTitle>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addVariant}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Ajouter une variante
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Chaque visiteur est tiré au sort vers une variante (ou vers la page originale, le « contrôle »)
          et son comportement est mesuré séparément. La variante avec le meilleur taux de conversion gagne.
          Pour forcer une variante pendant un test, ajoute <code className="rounded bg-muted px-1">?v=&lt;id&gt;</code> à ton URL.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {value.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            Aucune variante — le produit affiche la page telle quelle (contrôle).
          </div>
        ) : (
          <ul className="space-y-2">
            {value.map((v, i) => {
              const vid = v._id || `idx-${i}`;
              const open = expandedId === vid;
              return (
                <li key={vid} className="rounded-lg border border-border/70 bg-card">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => setExpandedId(open ? null : vid)}
                    >
                      <span
                        className={
                          'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ' +
                          (v.enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')
                        }
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="truncate text-sm font-medium">{v.name || 'Variante sans nom'}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        poids {v.weight}× {v.enabled ? '' : '· désactivée'}
                      </span>
                    </button>
                    {storeSlug && productSlug && v._id && !v._id.startsWith('tmp-') && (
                      <a
                        href={`/${storeSlug}/product/${productSlug}?v=${v._id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                        title="Aperçu de cette variante"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => removeVariant(i)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Supprimer cette variante"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {open && (
                    <div className="space-y-4 border-t border-border/60 px-3 py-3">
                      {/* Métadonnées du variant */}
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                        <div>
                          <Label htmlFor={`v-name-${vid}`} className="text-xs">
                            Libellé interne
                          </Label>
                          <Input
                            id={`v-name-${vid}`}
                            value={v.name}
                            onChange={(e) => update(i, { name: e.target.value })}
                            placeholder="Ex: Prix barré haut"
                            maxLength={80}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`v-weight-${vid}`} className="text-xs">
                            Poids
                          </Label>
                          <Input
                            id={`v-weight-${vid}`}
                            type="number"
                            min={0}
                            max={100}
                            value={v.weight}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              update(i, { weight: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 1 });
                            }}
                            className="w-20"
                          />
                        </div>
                        <label className="flex cursor-pointer items-end gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={v.enabled}
                            onChange={(e) => update(i, { enabled: e.target.checked })}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="pb-2">Activée</span>
                        </label>
                      </div>

                      {/* Overrides */}
                      <div className="space-y-3 rounded-md border border-border/60 bg-muted/30 p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Champs à remplacer
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Laisse vide pour garder la valeur du produit original. Un champ renseigné écrase celui du produit
                          quand cette variante est servie.
                        </p>

                        <div>
                          <Label htmlFor={`v-ovname-${vid}`} className="text-xs">
                            Titre affiché sur la page
                          </Label>
                          <Input
                            id={`v-ovname-${vid}`}
                            value={v.overrides.name || ''}
                            onChange={(e) =>
                              updateOverride(i, { name: e.target.value || undefined })
                            }
                            placeholder="Laisse vide pour garder le titre d'origine"
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label htmlFor={`v-ovprice-${vid}`} className="text-xs">
                              Prix ({currency})
                            </Label>
                            <Input
                              id={`v-ovprice-${vid}`}
                              type="number"
                              min={0}
                              step="0.01"
                              value={v.overrides.price ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const n = raw === '' ? undefined : Number(raw);
                                updateOverride(i, { price: Number.isFinite(n) ? (n as number) : undefined });
                              }}
                              placeholder="Prix d'origine"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`v-ovcompare-${vid}`} className="text-xs">
                              Prix barré ({currency})
                            </Label>
                            <Input
                              id={`v-ovcompare-${vid}`}
                              type="number"
                              min={0}
                              step="0.01"
                              value={v.overrides.compareAtPrice ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const n = raw === '' ? undefined : Number(raw);
                                updateOverride(i, {
                                  compareAtPrice: Number.isFinite(n) ? (n as number) : undefined,
                                });
                              }}
                              placeholder="Prix barré d'origine"
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor={`v-ovdesc-${vid}`} className="text-xs">
                            Description
                          </Label>
                          <textarea
                            id={`v-ovdesc-${vid}`}
                            value={v.overrides.description || ''}
                            onChange={(e) =>
                              updateOverride(i, { description: e.target.value || undefined })
                            }
                            rows={4}
                            placeholder="Laisse vide pour garder la description d'origine"
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        </div>

                        <div>
                          <Label className="text-xs">
                            <span className="inline-flex items-center gap-1">
                              <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                              Images
                            </span>
                          </Label>
                          <ProductImagesPicker
                            storeId={storeId}
                            images={v.overrides.images || []}
                            onChange={(imgs) =>
                              updateOverride(i, { images: imgs.length > 0 ? imgs : undefined })
                            }
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            Laisse vide pour garder les images du produit original.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
