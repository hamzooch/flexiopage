'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Settings, Trash2 } from 'lucide-react';
import { useStoreStore } from '@/stores/store-store';

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
    return <CodFormSectionEditor p={p} set={set} onRemove={onRemove} />;
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

  if (section.type === 'image') {
    // Bloc image full-width — un seul visuel, ratio configurable, légende
    // et lien optionnels. Pour les boutiques branding qui veulent
    // intercaler des plans lifestyle entre les sections.
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Bloc image</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <Label className="text-xs">URL de l&apos;image</Label>
          <Input
            value={(p.imageUrl as string) || ''}
            onChange={(e) => set('imageUrl', e.target.value)}
            placeholder="https://…/photo.jpg"
            className="mt-1"
          />
          {(p.imageUrl as string) && (
            <div className="mt-2 overflow-hidden rounded-md border border-border/60 bg-muted/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={(p.imageUrl as string)} alt="" className="block w-full max-h-40 object-cover" />
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Texte alternatif (alt)</Label>
            <Input
              value={(p.alt as string) || ''}
              onChange={(e) => set('alt', e.target.value)}
              placeholder="Description courte pour SEO/accessibilité"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Légende (optionnel)</Label>
            <Input
              value={(p.caption as string) || ''}
              onChange={(e) => set('caption', e.target.value)}
              placeholder="Affichée sous l'image"
              className="mt-1"
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Ratio</Label>
            <select
              value={(p.ratio as string) || '21/9'}
              onChange={(e) => set('ratio', e.target.value)}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="21/9">Panoramique 21:9</option>
              <option value="16/9">Cinéma 16:9</option>
              <option value="4/3">Classique 4:3</option>
              <option value="1/1">Carré 1:1</option>
              <option value="3/4">Portrait 3:4</option>
              <option value="9/16">Stories 9:16</option>
              <option value="auto">Auto (taille réelle)</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Largeur</Label>
            <select
              value={(p.width as string) || 'contained'}
              onChange={(e) => set('width', e.target.value)}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="contained">Conteneur (max 6xl)</option>
              <option value="narrow">Resserré (max 4xl)</option>
              <option value="full">Pleine largeur</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Coins</Label>
            <select
              value={(p.rounded as string) || 'lg'}
              onChange={(e) => set('rounded', e.target.value)}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="lg">Arrondis</option>
              <option value="xl">Très arrondis</option>
              <option value="sm">Subtils</option>
              <option value="none">Aucun</option>
            </select>
          </div>
        </div>
        <div>
          <Label className="text-xs">Lien (optionnel)</Label>
          <Input
            value={(p.link as string) || ''}
            onChange={(e) => set('link', e.target.value)}
            placeholder="https://… ou /produit/slug"
            className="mt-1"
          />
        </div>
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
    const url = (p.videoUrl as string) || '';
    // Petit feedback temps réel : on devine la source à partir de l'URL
    // pour rassurer le vendeur que son lien est bien reconnu.
    const sourceHint = (() => {
      if (!url) return '';
      if (/youtu\.?be/i.test(url))                  return '✓ YouTube détecté — embed iframe automatique.';
      if (/vimeo\.com/i.test(url))                  return '✓ Vimeo détecté — embed iframe automatique.';
      if (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url)) return '✓ Fichier vidéo direct détecté.';
      return '⚠ URL non reconnue — colle un lien YouTube, Vimeo, ou un .mp4 / .webm.';
    })();
    return (
      <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Vidéo</span>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div>
          <Label className="text-xs">Titre (optionnel)</Label>
          <Input value={(p.title as string) || ''} onChange={(e) => set('title', e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Sous-titre (optionnel)</Label>
          <Input value={(p.subtitle as string) || ''} onChange={(e) => set('subtitle', e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">URL de la vidéo</Label>
          <Input
            value={url}
            onChange={(e) => set('videoUrl', e.target.value)}
            placeholder="https://youtu.be/… , https://vimeo.com/… , ou https://…/video.mp4"
            className="mt-1"
          />
          <p className={`mt-1.5 text-[11px] ${sourceHint.startsWith('⚠') ? 'text-amber-700' : sourceHint.startsWith('✓') ? 'text-emerald-700' : 'text-muted-foreground'}`}>
            {sourceHint || 'Supporte YouTube, Vimeo, ou un fichier direct (mp4, webm, mov, ogg, m4v).'}
          </p>
        </div>
        <div>
          <Label className="text-xs">Poster URL (image de couverture, optionnel)</Label>
          <Input
            value={(p.posterUrl as string) || ''}
            onChange={(e) => set('posterUrl', e.target.value)}
            placeholder="https://…/cover.jpg"
            className="mt-1"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Utile uniquement pour les fichiers vidéo directs — YouTube et Vimeo gèrent leur propre vignette.
          </p>
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

// COD-form landing section is a *pointer* — it says "put the store-wide COD
// form here for product X." The form's look, visible fields, colors, button
// and reassurance line are edited once in Store settings → COD form, and
// mirrored on every surface (product page, landing sections). This keeps
// personalization in a single place, as promised to the seller.
function CodFormSectionEditor({
  p,
  set,
  onRemove,
}: {
  p: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
  onRemove: () => void;
}) {
  const storeId = useStoreStore((s) => s.currentStoreId);
  const settingsHref = storeId
    ? `/dashboard/stores/${storeId}#cod-form`
    : '/dashboard/stores';

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">Formulaire de commande (COD)</span>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div>
        <Label className="text-xs">Slug du produit à commander</Label>
        <Input
          value={(p.productSlug as string) || ''}
          onChange={(e) => set('productSlug', e.target.value)}
          placeholder="(laisser vide = 1er produit publié)"
          className="mt-1"
        />
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          C'est la seule chose à choisir ici : quel produit ce formulaire vend.
        </p>
      </div>

      <Link
        href={settingsHref}
        className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs transition-colors hover:border-primary/40 hover:bg-primary/10"
      >
        <Settings className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">
            Personnalise le formulaire dans Réglages boutique
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Titre, champs visibles, couleurs, bouton, phrase de réassurance… Une seule édition,
            appliquée automatiquement ici et sur la page produit.
          </p>
        </div>
      </Link>
    </div>
  );
}
