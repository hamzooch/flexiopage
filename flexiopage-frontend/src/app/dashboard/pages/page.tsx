'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { PageHeader } from '@/components/dashboard/page-header';
import { publicStoreUrl } from '@/lib/utils';
import { Check, Copy, ExternalLink, Eye, FileText, Loader2, Pencil, Plus, Search } from 'lucide-react';

interface StoreType {
  _id: string;
  name: string;
  slug: string;
  customDomain?: string | null;
  customDomainVerified?: boolean;
}

interface PageSection {
  type?: string;
}

interface PageType {
  _id: string;
  name: string;
  slug: string;
  isPublished?: boolean;
  sections?: PageSection[];
}

type PageView = 'all' | 'live' | 'draft' | 'noform';

function hasCodForm(page: PageType) {
  return (page.sections || []).some((s) => s.type === 'cod-form');
}

export default function DashboardPagesPage() {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get('storeId');
  const { storeId: selectedStoreId, setStoreId: setSelectedStoreId } = useScopedStoreId(storeIdParam);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [pages, setPages] = useState<PageType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<PageView>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    storesApi.list().then((res) => {
      const list = (res.data as { stores: StoreType[] }).stores;
      setStores(list);
      if (!selectedStoreId && list.length) setSelectedStoreId(list[0]._id);
    }).catch(() => setStores([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedStoreId) {
      setPages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Only show LANDING pages here — the auto-seeded info pages (Conditions,
    // FAQ, Contact…) are edited from /dashboard/stores/[id]/info-pages and
    // the footer editor, not from this marketing-pages list.
    storesApi
      .listPages(selectedStoreId, { kind: 'landing' })
      .then((res) => setPages((res.data as { pages: PageType[] }).pages))
      .catch(() => setPages([]))
      .finally(() => setLoading(false));
  }, [selectedStoreId]);

  const currentStore = stores.find((s) => s._id === selectedStoreId);
  const liveCount = pages.filter((p) => p.isPublished).length;
  const noFormCount = pages.filter((p) => !hasCodForm(p)).length;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pages
      .filter((p) => {
        if (view === 'live' && !p.isPublished) return false;
        if (view === 'draft' && p.isPublished) return false;
        if (view === 'noform' && hasCodForm(p)) return false;
        if (!q) return true;
        return p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
      })
      .sort((a, b) => Number(!!b.isPublished) - Number(!!a.isPublished) || a.name.localeCompare(b.name, 'fr'));
  }, [pages, search, view]);

  async function copyLink(page: PageType) {
    if (!currentStore || !page.isPublished) return;
    const url = publicStoreUrl(currentStore, `p/${page.slug}`);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(page._id);
      window.setTimeout(() => setCopiedId((id) => (id === page._id ? null : id)), 1600);
    } catch {
      setCopiedId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileText}
        title="Landing pages"
        description="Les pages où tes publicités envoient le client. Le formulaire prend la commande en cash à la livraison."
        actions={
          <div className="flex items-center gap-2">
            {stores.length > 1 ? null : currentStore ? (
              <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-xs font-medium">
                {currentStore.name}
              </span>
            ) : null}
            {selectedStoreId && (
              <Link href={`/dashboard/pages/new?storeId=${selectedStoreId}`}>
                <Button className="gap-1.5 gradient-brand text-white">
                  <Plus className="h-4 w-4" />
                  Nouvelle page
                </Button>
              </Link>
            )}
          </div>
        }
      />

      {stores.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {stores.map((s) => (
            <Button
              key={s._id}
              variant={selectedStoreId === s._id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedStoreId(s._id)}
            >
              {s.name}
            </Button>
          ))}
        </div>
      )}

      {!selectedStoreId ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center text-sm text-muted-foreground">
          Crée une boutique d&apos;abord.
        </div>
      ) : loading ? (
        <div className="grid h-40 place-items-center rounded-2xl border border-border/60 bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : pages.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <FileText className="h-7 w-7" />
          </div>
          <p className="font-medium">Aucune landing page</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Une page avec un formulaire, c&apos;est l&apos;adresse que tu colles dans ta publicité.
          </p>
          <Link href={`/dashboard/pages/new?storeId=${selectedStoreId}`}>
            <Button className="mt-4 gap-1.5 gradient-brand text-white">
              <Plus className="h-4 w-4" /> Créer une page
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher une page"
                className="h-9 pl-8 text-sm"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {([
                { id: 'all', label: 'Toutes', count: pages.length },
                { id: 'live', label: 'En ligne', count: liveCount },
                { id: 'draft', label: 'Brouillons', count: pages.length - liveCount },
                { id: 'noform', label: 'Sans formulaire', count: noFormCount },
              ] as const).map((f) => (
                <Button
                  key={f.id}
                  type="button"
                  size="sm"
                  variant={view === f.id ? 'default' : 'outline'}
                  className="h-9 shrink-0"
                  onClick={() => setView(f.id)}
                >
                  {f.label}
                  <span className="ms-1.5 tabular-nums opacity-70">{f.count}</span>
                </Button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center text-sm text-muted-foreground">
              Aucune page dans cette vue.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((p) => {
                const cod = hasCodForm(p);
                const liveUrl = currentStore && p.isPublished ? publicStoreUrl(currentStore, `p/${p.slug}`) : '';
                return (
                  <div key={p._id} className="rounded-2xl border border-border/60 bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate font-medium">{p.name}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          p.isPublished ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'
                        }`}
                      >
                        {p.isPublished ? 'En ligne' : 'Brouillon'}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">/p/{p.slug}</p>
                    <div className="mt-2">
                      {cod ? (
                        <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Formulaire
                        </span>
                      ) : (
                        <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          Sans formulaire
                        </span>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={`/dashboard/pages/${p._id}?storeId=${selectedStoreId}`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Pencil className="h-3.5 w-3.5" />
                          Modifier
                        </Button>
                      </Link>
                      <Link href={`/preview/${p._id}?storeId=${selectedStoreId}`} target="_blank">
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Eye className="h-3.5 w-3.5" />
                          Aperçu
                        </Button>
                      </Link>
                      {liveUrl && (
                        <>
                          <a href={liveUrl} target="_blank" rel="noreferrer">
                            <Button size="sm" className="gap-1.5 gradient-brand text-white">
                              <ExternalLink className="h-3.5 w-3.5" />
                              Voir
                            </Button>
                          </a>
                          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copyLink(p)}>
                            {copiedId === p._id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedId === p._id ? 'Lien copié' : 'Copier le lien'}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
