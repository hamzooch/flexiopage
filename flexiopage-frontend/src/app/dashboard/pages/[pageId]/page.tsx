'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi } from '@/lib/api';
import { SectionEditor, type PageSection } from '@/components/landing/SectionEditor';
import { LandingRenderer } from '@/components/landing/LandingRenderer';
import { DevicePreviewFrame } from '@/components/landing/DevicePreviewFrame';
import { ArrowLeft, Check, Eye, Loader2, Monitor, Smartphone, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const SECTION_TYPES = [
  { id: 'hero', label: 'Hero' },
  { id: 'products', label: 'Products' },
  { id: 'testimonials', label: 'Testimonials' },
  { id: 'cta', label: 'CTA' },
  { id: 'cod-form', label: 'Order form (COD)' },
  { id: 'features', label: 'Features' },
  { id: 'faq', label: 'FAQ' },
] as const;

const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur']);
const directionOf = (lang: string): 'ltr' | 'rtl' =>
  RTL_LANGS.has(lang.split('-')[0]) ? 'rtl' : 'ltr';

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
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

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
        if (typeof p.language === 'string' && p.language) setLanguage(p.language);
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
    <div className="-mx-4 -my-6 flex h-[calc(100vh-64px)] flex-col bg-muted/30 sm:-mx-6 lg:-mx-8">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/dashboard/pages?storeId=${storeId}`)}
            className="-ml-2 shrink-0 gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h1 className="truncate text-base font-semibold tracking-tight">
            {name || 'Edit page'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* device toggle */}
          <div className="hidden items-center rounded-lg border border-border/60 bg-card p-0.5 sm:inline-flex">
            <button
              type="button"
              onClick={() => setPreviewDevice('desktop')}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                previewDevice === 'desktop'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="Desktop preview"
            >
              <Monitor className="h-3.5 w-3.5" />
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setPreviewDevice('mobile')}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                previewDevice === 'mobile'
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="Mobile preview"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Mobile
            </button>
          </div>
          <Link href={`/preview/${pageId}?storeId=${storeId}`} target="_blank">
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg">
              <Eye className="h-3.5 w-3.5" /> Aperçu
            </Button>
          </Link>
          <form onSubmit={handleSubmit} className="contents">
            <Button
              type="submit"
              disabled={saving || !name.trim()}
              className="h-9 gap-1.5 rounded-lg gradient-brand text-white shadow-md shadow-primary/25 hover:opacity-95"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </form>
        </div>
      </header>

      {/* Body: split — sections editor left, live preview right */}
      <div className="flex min-h-0 flex-1">
        {/* LEFT panel — page details + sections editor */}
        <aside className="flex w-full shrink-0 flex-col border-r border-border/60 bg-card/40 sm:w-[440px] lg:w-[480px]">
          <div className="flex-1 overflow-y-auto p-5">
            {error && (
              <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Page details */}
            <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
              <div>
                <h2 className="text-sm font-semibold">Détails</h2>
                <p className="text-xs text-muted-foreground">Nom et slug pour le SEO.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs">Nom de la page</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="ex. Home" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug" className="text-xs">Slug URL</Label>
                <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="ex. home" />
              </div>
              <label className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-xs font-medium">Publiée</span>
              </label>
            </section>

            {/* SEO */}
            <section className="mt-4 space-y-3 rounded-2xl border border-border/60 bg-card p-4">
              <h2 className="text-sm font-semibold">SEO</h2>
              <div className="space-y-2">
                <Label className="text-xs">Titre SEO</Label>
                <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder="Titre pour les moteurs" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Description SEO</Label>
                <textarea
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  placeholder="Courte description"
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                />
              </div>
            </section>

            {/* Sections editor */}
            <section className="mt-4 rounded-2xl border border-primary/30 bg-card p-4 ring-2 ring-primary/10">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">Sections ({sections.length})</h2>
                <p className="text-xs text-muted-foreground">Édite ou ajoute des blocs.</p>
              </div>
              <div className="flex flex-wrap gap-1.5 pb-3">
                {SECTION_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => addSection(t.id)}
                    className="inline-flex h-7 items-center rounded-md border border-border/60 bg-background px-2 text-[11px] font-medium hover:border-primary/40 hover:bg-muted"
                  >
                    + {t.label}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {sections.map((sec, index) => (
                  <SectionEditor
                    key={sec.id}
                    section={sec}
                    index={index}
                    onUpdate={(props) => updateSectionProps(index, props)}
                    onRemove={() => removeSection(index)}
                  />
                ))}
                {sections.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Aucune section. Utilise les boutons ci-dessus.
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* footer */}
          <div className="shrink-0 border-t border-border/60 bg-card px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              onClick={() => router.push(`/dashboard/pages?storeId=${storeId}`)}
            >
              Annuler et retour
            </Button>
          </div>
        </aside>

        {/* RIGHT panel — live preview */}
        <main className="hidden flex-1 flex-col overflow-hidden bg-muted/40 sm:flex">
          <div className="shrink-0 border-b border-border/60 bg-card/80 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700">
              <Eye className="h-3 w-3" />
              Aperçu live
            </span>
            <span className="ml-2">— les modifications s'affichent en direct</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sections.length > 0 ? (
              <div
                className={cn(
                  'mx-auto bg-background shadow-2xl ring-1 ring-black/5 transition-all duration-300',
                  previewDevice === 'mobile'
                    ? 'my-6 overflow-hidden rounded-[36px] border-8 border-foreground/80'
                    : 'min-h-full w-full'
                )}
                style={previewDevice === 'mobile' ? { width: 390 } : undefined}
              >
                <DevicePreviewFrame device={previewDevice}>
                  <LandingRenderer
                    sections={sections}
                    direction={directionOf(language)}
                    language={language}
                  />
                </DevicePreviewFrame>
              </div>
            ) : (
              <div className="grid h-full min-h-[400px] place-items-center p-12 text-center text-sm text-muted-foreground">
                <div>
                  <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                  Aucune section pour le moment.<br />
                  Ajoute des blocs depuis le panneau de gauche pour voir l'aperçu.
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
