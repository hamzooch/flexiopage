'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi } from '@/lib/api';
import { SectionEditor, type PageSection } from '@/components/landing/SectionEditor';

const SECTION_TYPES = [
  { id: 'hero', label: 'Hero' },
  { id: 'products', label: 'Products' },
  { id: 'testimonials', label: 'Testimonials' },
  { id: 'cta', label: 'CTA' },
  { id: 'cod-form', label: 'Order form (COD)' },
  { id: 'features', label: 'Features' },
  { id: 'faq', label: 'FAQ' },
] as const;

export default function EditLandingPagePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageId = params.pageId as string;
  const storeId = searchParams.get('storeId');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [sections, setSections] = useState<PageSection[]>([]);
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!storeId || !pageId) return;
    storesApi
      .getPage(storeId, pageId)
      .then((res) => {
        const p = (res.data as { page: Record<string, unknown> }).page;
        setName((p.name as string) || '');
        setSlug((p.slug as string) || '');
        setSections(Array.isArray(p.sections) ? (p.sections as PageSection[]) : []);
        setSeoTitle((p.seoTitle as string) || '');
        setSeoDescription((p.seoDescription as string) || '');
        setIsPublished(!!p.isPublished);
      })
      .catch(() => setError('Page not found'))
      .finally(() => setLoading(false));
  }, [storeId, pageId]);

  function addSection(type: string) {
    setSections((prev) => [
      ...prev,
      { id: `sec-${Date.now()}`, type, order: prev.length, props: { title: '', subtitle: '' } },
    ]);
  }

  function updateSectionProps(index: number, props: Record<string, unknown>) {
    setSections((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], props: { ...next[index].props, ...props } };
      return next;
    });
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) return;
    setSaving(true);
    setError('');
    try {
      await storesApi.updatePage(storeId, pageId, {
        name: name.trim(),
        slug: slug.trim() || undefined,
        sections: sections.map((s, i) => ({ ...s, order: i })),
        seoTitle: seoTitle.trim() || undefined,
        seoDescription: seoDescription.trim() || undefined,
        isPublished,
      });
      router.push(`/dashboard/pages?storeId=${storeId}`);
      router.refresh();
    } catch {
      setError('Failed to update page');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (error && !storeId) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error}</p>
        <Link href="/dashboard/pages">
          <Button variant="outline">Back to pages</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/pages')}>
            ← Back
          </Button>
          <h1 className="text-3xl font-bold">Edit page</h1>
        </div>
        <Link href={`/preview/${pageId}?storeId=${storeId}`} target="_blank">
          <Button type="button" variant="outline" size="sm" className="gap-1.5">
            👁  Preview
          </Button>
        </Link>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="pt-6 space-y-4">
            {error && (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>SEO title (optional)</Label>
              <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>SEO description (optional)</Label>
              <textarea
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                className="mt-1 flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
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

        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="mb-4 flex flex-wrap gap-2">
              {SECTION_TYPES.map((t) => (
                <Button
                  key={t.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addSection(t.id)}
                >
                  + {t.label}
                </Button>
              ))}
            </div>
            <div className="space-y-4">
              {sections.map((sec, index) => (
                <SectionEditor
                  key={sec.id}
                  section={sec}
                  index={index}
                  onUpdate={(props) => updateSectionProps(index, props)}
                  onRemove={() => removeSection(index)}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
