'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';

export interface PageSection {
  id: string;
  type: string;
  order: number;
  props: Record<string, unknown>;
}

interface SectionEditorProps {
  section: PageSection;
  index: number;
  onUpdate: (props: Record<string, unknown>) => void;
  onRemove: () => void;
}

export function SectionEditor({ section, index, onUpdate, onRemove }: SectionEditorProps) {
  const p = section.props || {};
  const set = (key: string, value: unknown) => onUpdate({ ...p, [key]: value });

  if (section.type === 'hero') {
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Hero</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Headline</Label>
            <Input
              value={(p.title as string) || ''}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Catchy headline"
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Subtitle</Label>
            <Input
              value={(p.subtitle as string) || ''}
              onChange={(e) => set('subtitle', e.target.value)}
              placeholder="Short description"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Primary button</Label>
            <Input
              value={(p.ctaText as string) || ''}
              onChange={(e) => set('ctaText', e.target.value)}
              placeholder="e.g. Buy now"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Secondary button</Label>
            <Input
              value={(p.ctaSecondary as string) || ''}
              onChange={(e) => set('ctaSecondary', e.target.value)}
              placeholder="Optional"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Layout</Label>
            <select
              value={(p.layout as string) || 'center'}
              onChange={(e) => set('layout', e.target.value)}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="center">Center</option>
              <option value="split">Split (image + text)</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  if (section.type === 'features') {
    const items = (p.items as Array<{ title?: string; description?: string }>) || [];
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Features / Avantages</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <Label className="text-xs">Section title</Label>
          <Input
            value={(p.title as string) || ''}
            onChange={(e) => set('title', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Subtitle</Label>
          <Input
            value={(p.subtitle as string) || ''}
            onChange={(e) => set('subtitle', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Items</Label>
          {items.map((item, i) => (
            <div key={i} className="mt-2 flex gap-2 rounded border p-2">
              <Input
                value={item.title || ''}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i], title: e.target.value };
                  set('items', next);
                }}
                placeholder="Titre"
                className="flex-1"
              />
              <Input
                value={item.description || ''}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...next[i], description: e.target.value };
                  set('items', next);
                }}
                placeholder="Description"
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => set('items', items.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => set('items', [...items, { title: '', description: '' }])}
            >
              <Plus className="mr-1 h-4 w-4" /> Add item
            </Button>
        </div>
      </div>
    );
  }

  if (section.type === 'testimonials') {
    const items = (p.items as Array<{ quote?: string; author?: string }>) || [];
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Testimonials</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <Label className="text-xs">Title</Label>
          <Input
            value={(p.title as string) || ''}
            onChange={(e) => set('title', e.target.value)}
            className="mt-1"
          />
        </div>
        {items.map((item, i) => (
          <div key={i} className="rounded border p-2 space-y-2">
            <Input
              value={item.quote || ''}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...next[i], quote: e.target.value };
                set('items', next);
              }}
              placeholder="Quote"
            />
            <Input
              value={item.author || ''}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...next[i], author: e.target.value };
                set('items', next);
              }}
              placeholder="Author"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => set('items', items.filter((_, j) => j !== i))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set('items', [...items, { quote: '', author: '' }])}
        >
          <Plus className="mr-1 h-4 w-4" /> Add testimonial
        </Button>
      </div>
    );
  }

  if (section.type === 'cta') {
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Call to action</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <Label className="text-xs">Titre</Label>
          <Input
            value={(p.title as string) || ''}
            onChange={(e) => set('title', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Subtitle</Label>
          <Input
            value={(p.subtitle as string) || ''}
            onChange={(e) => set('subtitle', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Button text</Label>
          <Input
            value={(p.buttonText as string) || ''}
            onChange={(e) => set('buttonText', e.target.value)}
            placeholder="e.g. Buy now"
            className="mt-1"
          />
        </div>
      </div>
    );
  }

  if (section.type === 'faq') {
    const items = (p.items as Array<{ question?: string; answer?: string }>) || [];
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">FAQ</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <Label className="text-xs">Title</Label>
          <Input
            value={(p.title as string) || ''}
            onChange={(e) => set('title', e.target.value)}
            className="mt-1"
          />
        </div>
        {items.map((item, i) => (
          <div key={i} className="rounded border p-2 space-y-2">
            <Input
              value={item.question || ''}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...next[i], question: e.target.value };
                set('items', next);
              }}
              placeholder="Question"
            />
            <textarea
              value={item.answer || ''}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...next[i], answer: e.target.value };
                set('items', next);
              }}
              placeholder="Answer"
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => set('items', items.filter((_, j) => j !== i))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set('items', [...items, { question: '', answer: '' }])}
        >
          <Plus className="mr-1 h-4 w-4" /> Add question
        </Button>
      </div>
    );
  }

  if (section.type === 'cod-form') {
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Formulaire de commande (COD)</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Slug du produit à commander</Label>
            <Input
              value={(p.productSlug as string) || ''}
              onChange={(e) => set('productSlug', e.target.value)}
              placeholder="(laisser vide = 1er produit publié)"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Libellé du bouton</Label>
            <Input
              value={(p.submitLabel as string) || ''}
              onChange={(e) => set('submitLabel', e.target.value)}
              placeholder="Commander"
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Titre au-dessus du formulaire</Label>
          <Input
            value={(p.title as string) || ''}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Commander · Paiement à la livraison"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Sous-titre</Label>
          <Input
            value={(p.subtitle as string) || ''}
            onChange={(e) => set('subtitle', e.target.value)}
            placeholder="Remplis tes coordonnées — paiement en espèces à la livraison"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Phrase de réassurance (optionnel)</Label>
          <Input
            value={(p.reassurance as string) || ''}
            onChange={(e) => set('reassurance', e.target.value)}
            placeholder="Aucun prépaiement, tu paies au livreur"
            className="mt-1"
          />
        </div>
        <div className="space-y-2 rounded border bg-card p-3">
          <p className="text-xs font-semibold">Champs visibles</p>
          {[
            ['showEmail', 'Email', true],
            ['requireEmail', 'Email obligatoire', false],
            ['showPostalCode', 'Code postal', false],
            ['showState', 'Région / wilaya', false],
            ['showNotes', 'Note pour le livreur', true],
            ['showQuantity', 'Sélecteur quantité', true],
          ].map(([key, label, defOn]) => {
            const k = key as string;
            const def = defOn as boolean;
            const v = p[k];
            const checked = typeof v === 'boolean' ? v : def;
            return (
              <label key={k} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => set(k, e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-input"
                />
                {label as string}
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  if (section.type === 'products') {
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Bloc produits</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <Label className="text-xs">Title</Label>
          <Input
            value={(p.title as string) || ''}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Our products"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Subtitle</Label>
          <Input
            value={(p.subtitle as string) || ''}
            onChange={(e) => set('subtitle', e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
    );
  }

  if (section.type === 'stats') {
    const items = (p.items as Array<{ value?: string; label?: string }>) || [];
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Stats</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <Label className="text-xs">Title (optional)</Label>
          <Input value={(p.title as string) || ''} onChange={(e) => set('title', e.target.value)} className="mt-1" />
        </div>
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 rounded border p-2">
            <Input
              value={item.value || ''}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...next[i], value: e.target.value };
                set('items', next);
              }}
              placeholder="e.g. 12k+"
              className="flex-1"
            />
            <Input
              value={item.label || ''}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...next[i], label: e.target.value };
                set('items', next);
              }}
              placeholder="Label"
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => set('items', items.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set('items', [...items, { value: '', label: '' }])}
        >
          <Plus className="mr-1 h-4 w-4" /> Add stat
        </Button>
      </div>
    );
  }

  if (section.type === 'gallery') {
    const images = (p.images as string[]) || [];
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Gallery</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <Label className="text-xs">Title (optional)</Label>
          <Input value={(p.title as string) || ''} onChange={(e) => set('title', e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Subtitle (optional)</Label>
          <Input value={(p.subtitle as string) || ''} onChange={(e) => set('subtitle', e.target.value)} className="mt-1" />
        </div>
        {images.map((img, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={img}
              onChange={(e) => {
                const next = [...images];
                next[i] = e.target.value;
                set('images', next);
              }}
              placeholder="https://..."
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => set('images', images.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => set('images', [...images, ''])}>
          <Plus className="mr-1 h-4 w-4" /> Add image URL
        </Button>
      </div>
    );
  }

  if (section.type === 'product') {
    const highlights = (p.highlights as string[]) || [];
    const trustBadges = (p.trustBadges as string[]) || [];
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Product detail</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={(p.name as string) || ''} onChange={(e) => set('name', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Tagline</Label>
            <Input value={(p.tagline as string) || ''} onChange={(e) => set('tagline', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Price before</Label>
            <Input
              type="number"
              value={(p.priceBefore as number | string) ?? ''}
              onChange={(e) => set('priceBefore', e.target.value === '' ? undefined : Number(e.target.value))}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Price after</Label>
            <Input
              type="number"
              value={(p.priceAfter as number | string) ?? ''}
              onChange={(e) => set('priceAfter', e.target.value === '' ? undefined : Number(e.target.value))}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Currency</Label>
            <Input value={(p.currency as string) || ''} onChange={(e) => set('currency', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Image URL</Label>
            <Input value={(p.imageUrl as string) || ''} onChange={(e) => set('imageUrl', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">CTA text</Label>
            <Input value={(p.ctaText as string) || ''} onChange={(e) => set('ctaText', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Rating</Label>
            <Input
              type="number"
              step="0.1"
              value={(p.rating as number | string) ?? ''}
              onChange={(e) => set('rating', e.target.value === '' ? undefined : Number(e.target.value))}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Highlights</Label>
          {highlights.map((h, i) => (
            <div key={i} className="mt-2 flex gap-2">
              <Input
                value={h}
                onChange={(e) => {
                  const next = [...highlights];
                  next[i] = e.target.value;
                  set('highlights', next);
                }}
                placeholder="Benefit bullet"
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => set('highlights', highlights.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => set('highlights', [...highlights, ''])}
          >
            <Plus className="mr-1 h-4 w-4" /> Add highlight
          </Button>
        </div>
        <div>
          <Label className="text-xs">Trust badges</Label>
          {trustBadges.map((b, i) => (
            <div key={i} className="mt-2 flex gap-2">
              <Input
                value={b}
                onChange={(e) => {
                  const next = [...trustBadges];
                  next[i] = e.target.value;
                  set('trustBadges', next);
                }}
                placeholder="e.g. Free shipping"
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => set('trustBadges', trustBadges.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => set('trustBadges', [...trustBadges, ''])}
          >
            <Plus className="mr-1 h-4 w-4" /> Add badge
          </Button>
        </div>
      </div>
    );
  }

  if (section.type === 'brands') {
    const items = (p.items as Array<{ name?: string }>) || [];
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Brands / press</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <Label className="text-xs">Title (optional)</Label>
          <Input value={(p.title as string) || ''} onChange={(e) => set('title', e.target.value)} className="mt-1" />
        </div>
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={it.name || ''}
              onChange={(e) => {
                const next = [...items];
                next[i] = { name: e.target.value };
                set('items', next);
              }}
              placeholder="Brand or media name"
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => set('items', items.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => set('items', [...items, { name: '' }])}>
          <Plus className="mr-1 h-4 w-4" /> Add brand
        </Button>
      </div>
    );
  }

  if (section.type === 'video') {
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Video</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <Label className="text-xs">Title</Label>
          <Input value={(p.title as string) || ''} onChange={(e) => set('title', e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Subtitle</Label>
          <Input value={(p.subtitle as string) || ''} onChange={(e) => set('subtitle', e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Video URL (mp4)</Label>
          <Input value={(p.videoUrl as string) || ''} onChange={(e) => set('videoUrl', e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Poster URL</Label>
          <Input value={(p.posterUrl as string) || ''} onChange={(e) => set('posterUrl', e.target.value)} className="mt-1" />
        </div>
      </div>
    );
  }

  if (section.type === 'pricing') {
    const plans = (p.plans as Array<{ name?: string; price?: string | number; period?: string; features?: string[]; ctaText?: string; highlight?: boolean }>) || [];
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Pricing</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <Label className="text-xs">Title</Label>
          <Input value={(p.title as string) || ''} onChange={(e) => set('title', e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Subtitle</Label>
          <Input value={(p.subtitle as string) || ''} onChange={(e) => set('subtitle', e.target.value)} className="mt-1" />
        </div>
        {plans.map((plan, i) => (
          <div key={i} className="rounded border p-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                value={plan.name || ''}
                onChange={(e) => {
                  const next = [...plans];
                  next[i] = { ...next[i], name: e.target.value };
                  set('plans', next);
                }}
                placeholder="Plan name"
              />
              <Input
                value={String(plan.price ?? '')}
                onChange={(e) => {
                  const next = [...plans];
                  next[i] = { ...next[i], price: e.target.value };
                  set('plans', next);
                }}
                placeholder="Price"
              />
              <Input
                value={plan.period || ''}
                onChange={(e) => {
                  const next = [...plans];
                  next[i] = { ...next[i], period: e.target.value };
                  set('plans', next);
                }}
                placeholder="month / year / one-time"
              />
              <Input
                value={plan.ctaText || ''}
                onChange={(e) => {
                  const next = [...plans];
                  next[i] = { ...next[i], ctaText: e.target.value };
                  set('plans', next);
                }}
                placeholder="CTA text"
              />
            </div>
            <textarea
              value={(plan.features || []).join('\n')}
              onChange={(e) => {
                const next = [...plans];
                next[i] = { ...next[i], features: e.target.value.split('\n').filter((s) => s.length) };
                set('plans', next);
              }}
              placeholder="One feature per line"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!!plan.highlight}
                onChange={(e) => {
                  const next = [...plans];
                  next[i] = { ...next[i], highlight: e.target.checked };
                  set('plans', next);
                }}
              />
              Highlight this plan
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => set('plans', plans.filter((_, j) => j !== i))}
            >
              Remove plan
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => set('plans', [...plans, { name: '', price: '', features: [], ctaText: '' }])}
        >
          <Plus className="mr-1 h-4 w-4" /> Add plan
        </Button>
      </div>
    );
  }

  if (section.type === 'footer') {
    const links = (p.links as Array<{ label?: string; href?: string }>) || [];
    const socials = (p.socials as Array<{ name?: string; href?: string }>) || [];
    const paymentMethods = (p.paymentMethods as string[]) || [];
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Footer</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Brand name</Label>
            <Input value={(p.brandName as string) || ''} onChange={(e) => set('brandName', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Tagline</Label>
            <Input value={(p.tagline as string) || ''} onChange={(e) => set('tagline', e.target.value)} className="mt-1" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Links</Label>
          {links.map((l, i) => (
            <div key={i} className="mt-2 flex gap-2">
              <Input
                value={l.label || ''}
                onChange={(e) => {
                  const next = [...links];
                  next[i] = { ...next[i], label: e.target.value };
                  set('links', next);
                }}
                placeholder="Label"
                className="flex-1"
              />
              <Input
                value={l.href || ''}
                onChange={(e) => {
                  const next = [...links];
                  next[i] = { ...next[i], href: e.target.value };
                  set('links', next);
                }}
                placeholder="/path or https://..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => set('links', links.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => set('links', [...links, { label: '', href: '' }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Add link
          </Button>
        </div>
        <div>
          <Label className="text-xs">Socials</Label>
          {socials.map((s, i) => (
            <div key={i} className="mt-2 flex gap-2">
              <Input
                value={s.name || ''}
                onChange={(e) => {
                  const next = [...socials];
                  next[i] = { ...next[i], name: e.target.value };
                  set('socials', next);
                }}
                placeholder="instagram | facebook | youtube | tiktok"
                className="flex-1"
              />
              <Input
                value={s.href || ''}
                onChange={(e) => {
                  const next = [...socials];
                  next[i] = { ...next[i], href: e.target.value };
                  set('socials', next);
                }}
                placeholder="https://..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => set('socials', socials.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => set('socials', [...socials, { name: '', href: '' }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Add social
          </Button>
        </div>
        <div>
          <Label className="text-xs">Payment methods (one per line)</Label>
          <textarea
            value={paymentMethods.join('\n')}
            onChange={(e) => set('paymentMethods', e.target.value.split('\n').filter((s) => s.length))}
            placeholder={'visa\nmastercard\ncod'}
            className="mt-1 flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
    );
  }

  // Generic fallback
  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium capitalize">{section.type}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Title</Label>
          <Input
            value={(p.title as string) || ''}
            onChange={(e) => set('title', e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Subtitle</Label>
          <Input
            value={(p.subtitle as string) || ''}
            onChange={(e) => set('subtitle', e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );
}
