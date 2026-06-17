'use client';

/**
 * Info pages editor — flat list of the standard pages seeded at store
 * creation (CGV, Confidentialité, FAQ, About, Livraison, …) plus any
 * extra info pages the seller adds. Each page is a markdown body + a
 * title + a publish toggle.
 *
 * The seller can also add new info pages from here. They land in the
 * footer columns automatically as soon as the seller pastes their URL
 * (e.g. `/p/<slug>`) in the FooterEditor.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfirm, usePrompt } from '@/components/ui/confirm-dialog';
import {
  ArrowLeft,
  FileText,
  Plus,
  Save,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';
import { storesApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { renderMarkdown } from '@/lib/markdown';

interface PageDoc {
  _id: string;
  name: string;
  slug: string;
  kind?: 'landing' | 'info';
  body?: string;
  isPublished?: boolean;
  updatedAt?: string;
}

interface StoreDoc {
  _id: string;
  name: string;
  slug: string;
}

export default function InfoPagesEditor() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const prompt = usePrompt();

  const [store, setStore] = useState<StoreDoc | null>(null);
  const [pages, setPages] = useState<PageDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storeRes, pagesRes] = await Promise.all([
        storesApi.get(storeId),
        storesApi.listPages(storeId),
      ]);
      setStore((storeRes.data as { store: StoreDoc }).store);
      const list = (pagesRes.data as { pages: PageDoc[] }).pages || [];
      setPages(list.filter((p) => p.kind === 'info'));
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  async function createInfoPage() {
    const name = await prompt({
      title: 'Nouvelle page',
      description: 'Donne-lui un titre clair — c\'est ce que tes clients verront dans le menu et dans le footer.',
      placeholder: 'Ex: Mentions légales, CGV, À propos…',
      confirmLabel: 'Créer',
      minLength: 2,
    });
    if (!name?.trim()) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await storesApi.createPage(storeId, {
      name: name.trim(),
      slug,
      kind: 'info',
      body: `# ${name.trim()}\n\nDécris ici le contenu de ta page.`,
      isPublished: true,
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/stores/${storeId}`)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Pages d&apos;information</h1>
            <p className="text-sm text-muted-foreground">
              Conditions, FAQ, Contact, Livraison… — créées automatiquement à la création de ta boutique.
            </p>
          </div>
        </div>
        <Button onClick={createInfoPage} className="gap-1.5 gradient-brand text-white">
          <Plus className="h-3.5 w-3.5" />
          Nouvelle page
        </Button>
      </header>

      {loading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : pages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Aucune page d&apos;info</p>
          <p className="text-sm text-muted-foreground">Clique sur « Nouvelle page » pour en créer une.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {pages.map((p) => (
            <PageRow
              key={p._id}
              page={p}
              storeId={storeId}
              storeSlug={store?.slug || ''}
              expanded={expandedId === p._id}
              onToggle={() => setExpandedId((id) => (id === p._id ? null : p._id))}
              onSaved={(updated) =>
                setPages((arr) => arr.map((row) => (row._id === updated._id ? updated : row)))
              }
              onDeleted={() => setPages((arr) => arr.filter((row) => row._id !== p._id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PageRow({
  page,
  storeId,
  storeSlug,
  expanded,
  onToggle,
  onSaved,
  onDeleted,
}: {
  page: PageDoc;
  storeId: string;
  storeSlug: string;
  expanded: boolean;
  onToggle: () => void;
  onSaved: (p: PageDoc) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(page.name);
  const [body, setBody] = useState(page.body || '');
  const [isPublished, setIsPublished] = useState(!!page.isPublished);
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = name !== page.name || body !== (page.body || '') || isPublished !== !!page.isPublished;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await storesApi.updatePage(storeId, page._id, {
        name: name.trim(),
        body,
        isPublished,
      });
      const updated = (res.data as { page: PageDoc }).page;
      onSaved(updated);
      setSavedAt(Date.now());
      window.setTimeout(() => setSavedAt(null), 2200);
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePublish() {
    const next = !isPublished;
    setIsPublished(next);
    setSaving(true);
    try {
      const res = await storesApi.updatePage(storeId, page._id, { isPublished: next });
      const updated = (res.data as { page: PageDoc }).page;
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Supprimer « ${page.name} » ?`,
      description: 'La page ne sera plus accessible sur ta vitrine ni dans le footer. Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      tone: 'destructive',
    });
    if (!ok) return;
    await storesApi.deletePage(storeId, page._id);
    onDeleted();
  }

  return (
    <li className="overflow-hidden rounded-2xl border border-border/60 bg-card transition-colors hover:border-primary/30">
      {/* Row header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-500/10 text-indigo-700">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold">{page.name}</h3>
              {isPublished ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  <Eye className="h-3 w-3" /> Publiée
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  <EyeOff className="h-3 w-3" /> Brouillon
                </span>
              )}
            </div>
            <code className="text-[11px] text-muted-foreground">/p/{page.slug}</code>
          </div>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-border/60 bg-muted/20 p-5">
          <div className="grid gap-4">
            <div>
              <Label htmlFor={`name-${page._id}`}>Titre</Label>
              <Input
                id={`name-${page._id}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor={`body-${page._id}`} className="flex items-center justify-between">
                <span>Contenu (markdown)</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  Supporté : # / ## titres · **gras** · *italique* · [lien](url) · - listes
                </span>
              </Label>
              {/* Side-by-side editor + live preview — same renderMarkdown the
                  storefront uses, so the seller sees the actual output. */}
              <div className="mt-1.5 grid gap-3 lg:grid-cols-2">
                <textarea
                  id={`body-${page._id}`}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={14}
                  className="w-full rounded-xl border border-input bg-background p-3 font-mono text-sm leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
                />
                <div className="rounded-xl border border-border/60 bg-card shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-gradient-to-r from-muted/30 to-muted/10 px-3 py-2">
                    <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      <Eye className="h-3 w-3" />
                      Aperçu en direct
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Live
                    </span>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto p-4">
                    <h2 className="mb-3 text-base font-bold tracking-tight">{name || 'Titre de la page'}</h2>
                    {body.trim() ? (
                      <article
                        className="prose-storefront text-sm leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
                      />
                    ) : (
                      <p className="text-sm italic text-muted-foreground">
                        Commence à écrire pour voir l&apos;aperçu apparaître ici.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSave} disabled={saving || !dirty} className="gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Enregistrer
                </Button>
                <Button variant="outline" onClick={handleTogglePublish} disabled={saving} className="gap-1.5">
                  {isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {isPublished ? 'Mettre en brouillon' : 'Publier'}
                </Button>
                {storeSlug && (
                  <Link href={`/${storeSlug}/p/${page.slug}`} target="_blank" rel="noopener">
                    <Button variant="outline" className="gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Voir
                    </Button>
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-3">
                {savedAt && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Enregistré
                  </span>
                )}
                <Button variant="ghost" onClick={handleDelete} className="gap-1.5 text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />
                  Supprimer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
