'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi } from '@/lib/api';

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = params.productId as string;
  const storeId = searchParams.get('storeId');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [type, setType] = useState<'physical' | 'digital'>('physical');
  const [stock, setStock] = useState('0');
  const [isPublished, setIsPublished] = useState(false);
  // Per-product storefront page customization. Toggles default to "shown".
  const [pageSettings, setPageSettings] = useState({
    showGallery: true,
    showDescription: true,
    showTrustBadges: true,
    codFormTitle: '',
    reassuranceText: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!storeId || !productId) return;
    storesApi
      .getProduct(storeId, productId)
      .then((res) => {
        const p = (res.data as { product: Record<string, unknown> }).product;
        setName((p.name as string) || '');
        setDescription((p.description as string) || '');
        setPrice(String(p.price ?? ''));
        setType((p.type as 'physical' | 'digital') || 'physical');
        setStock(String(p.stock ?? '0'));
        setIsPublished(!!p.isPublished);
        const ps = (p.pageSettings as Record<string, unknown>) || {};
        setPageSettings({
          showGallery: ps.showGallery !== false,
          showDescription: ps.showDescription !== false,
          showTrustBadges: ps.showTrustBadges !== false,
          codFormTitle: (ps.codFormTitle as string) || '',
          reassuranceText: (ps.reassuranceText as string) || '',
        });
      })
      .catch(() => setError('Product not found'))
      .finally(() => setLoading(false));
  }, [storeId, productId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) return;
    setSaving(true);
    setError('');
    try {
      await storesApi.updateProduct(storeId, productId, {
        name: name.trim(),
        description: description.trim() || undefined,
        price: parseFloat(price) || 0,
        type,
        stock: parseInt(stock, 10) || 0,
        isPublished,
        pageSettings: {
          showGallery: pageSettings.showGallery,
          showDescription: pageSettings.showDescription,
          showTrustBadges: pageSettings.showTrustBadges,
          codFormTitle: pageSettings.codFormTitle.trim() || undefined,
          reassuranceText: pageSettings.reassuranceText.trim() || undefined,
        },
      });
      router.push(`/dashboard/products?storeId=${storeId}`);
      router.refresh();
    } catch {
      setError('Failed to update product');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (error && !storeId) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error}</p>
        <Link href="/dashboard/products">
          <Button variant="outline">Back to products</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/products')}>
          ← Back
        </Button>
        <h1 className="text-3xl font-bold">Edit product</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Product details</CardTitle>
            <CardDescription>Update name, price, and inventory.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value as 'physical' | 'digital')}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="physical">Physical</option>
                  <option value="digital">Digital</option>
                </select>
              </div>
            </div>
            {type === 'physical' && (
              <div className="space-y-2">
                <Label htmlFor="stock">Stock</Label>
                <Input
                  id="stock"
                  type="number"
                  min="0"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="published"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="published">Published</Label>
            </div>
          </CardContent>
        </Card>

        {/* Per-product storefront page customization */}
        <Card>
          <CardHeader>
            <CardTitle>Page produit</CardTitle>
            <CardDescription>
              Personnalise la page publique de ce produit — sections affichées et textes du
              formulaire de commande.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2.5">
              {[
                { key: 'showGallery' as const, label: 'Afficher la galerie de miniatures' },
                { key: 'showDescription' as const, label: 'Afficher la section description' },
                { key: 'showTrustBadges' as const, label: 'Afficher les badges de confiance' },
              ].map((opt) => (
                <label key={opt.key} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pageSettings[opt.key]}
                    onChange={(e) =>
                      setPageSettings((s) => ({ ...s, [opt.key]: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>

            {type === 'physical' && (
              <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="codFormTitle">Titre du formulaire de commande</Label>
                  <Input
                    id="codFormTitle"
                    value={pageSettings.codFormTitle}
                    onChange={(e) =>
                      setPageSettings((s) => ({ ...s, codFormTitle: e.target.value }))
                    }
                    placeholder="Ex: Commander — paiement à la livraison"
                  />
                  <p className="text-[11px] text-muted-foreground">Vide = titre par défaut de la boutique.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reassuranceText">Ligne de réassurance</Label>
                  <Input
                    id="reassuranceText"
                    value={pageSettings.reassuranceText}
                    onChange={(e) =>
                      setPageSettings((s) => ({ ...s, reassuranceText: e.target.value }))
                    }
                    placeholder="Ex: Aucun prépaiement · livraison 48h"
                  />
                  <p className="text-[11px] text-muted-foreground">Affichée sous le formulaire de commande.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </form>
    </div>
  );
}
