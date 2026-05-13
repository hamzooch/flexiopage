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

      <form onSubmit={handleSubmit}>
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
          <CardContent>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
