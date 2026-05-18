'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { FileText, Plus, Eye, ExternalLink, Pencil } from 'lucide-react';

interface StoreType {
  _id: string;
  name: string;
  slug: string;
}

interface PageType {
  _id: string;
  name: string;
  slug: string;
  isPublished?: boolean;
  sections?: unknown[];
}

export default function DashboardPagesPage() {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get('storeId');
  const { storeId: selectedStoreId, setStoreId: setSelectedStoreId } = useScopedStoreId(storeIdParam);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [pages, setPages] = useState<PageType[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Landing Pages</h1>
          <p className="text-muted-foreground">Build and manage landing pages.</p>
        </div>
        {selectedStoreId && (
          <Link href={`/dashboard/pages/new?storeId=${selectedStoreId}`}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New page
            </Button>
          </Link>
        )}
      </div>

      {stores.length > 0 && (
        <div className="flex gap-2">
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
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Create a store first to add pages.
          </CardContent>
        </Card>
      ) : loading ? (
        <p className="text-muted-foreground">Loading pages...</p>
      ) : pages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 font-medium">No landing pages</p>
            <Link href={`/dashboard/pages/new?storeId=${selectedStoreId}`}>
              <Button className="mt-2">Create page</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => {
            const storeSlug = stores.find((s) => s._id === selectedStoreId)?.slug;
            return (
              <Card key={p._id}>
                <CardContent className="p-4">
                  <div className="flex justify-between">
                    <p className="font-medium">{p.name}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        p.isPublished ? 'bg-emerald-500/10 text-emerald-700' : 'bg-amber-500/10 text-amber-700'
                      }`}
                    >
                      {p.isPublished ? 'Live' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">/{p.slug}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/dashboard/pages/${p._id}?storeId=${selectedStoreId}`}>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </Link>
                    <Link href={`/preview/${p._id}?storeId=${selectedStoreId}`} target="_blank">
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                      </Button>
                    </Link>
                    {p.isPublished && storeSlug && (
                      <Link href={`/${storeSlug}/p/${p.slug}`} target="_blank">
                        <Button size="sm" className="gap-1.5 gradient-brand text-white">
                          <ExternalLink className="h-3.5 w-3.5" />
                          View live
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
