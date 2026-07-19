'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { storesApi } from '@/lib/api';
import { useScopedStoreId } from '@/lib/use-scoped-store';
import { cn, formatCurrency, mediaUrl } from '@/lib/utils';
import { Package, Plus, ImageIcon, Cloud, Search, ExternalLink, Beaker, FlaskConical, Save, X } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';

interface StoreType {
  _id: string;
  name: string;
  slug: string;
  storeType?: 'physical' | 'digital';
  settings?: { currency?: string };
}

type TestStatus = 'pending' | 'in_progress' | 'tested' | 'test_finished';

interface ProductSupplierLite {
  supplierSku?: string;
  costPrice?: number;
  productUrl?: string;
  currency?: string;
  isPrimary?: boolean;
}

interface ProductType {
  _id: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  type: string;
  stock?: number;
  isPublished?: boolean;
  images?: string[];
  isTestCandidate?: boolean;
  testStatus?: TestStatus;
  wowEffect?: number;
  suppliers?: ProductSupplierLite[];
}

const TEST_STATUS_BADGE: Record<TestStatus, { label: string; cls: string; dot: string }> = {
  pending:       { label: 'En attente',    cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20',    dot: 'bg-amber-500' },
  in_progress:   { label: 'Test en cours', cls: 'bg-blue-500/10 text-blue-700 ring-blue-500/20',       dot: 'bg-blue-500' },
  tested:        { label: 'Testé (winner)',cls: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20', dot: 'bg-emerald-500' },
  test_finished: { label: 'Test terminé',  cls: 'bg-slate-500/10 text-slate-700 ring-slate-500/20',    dot: 'bg-slate-500' },
};

const TEST_STATUS_ORDER: TestStatus[] = ['pending', 'in_progress', 'tested', 'test_finished'];

type TabValue = 'all' | 'test';

export default function DashboardProductsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const storeIdParam = searchParams.get('storeId');
  const tabParam = (searchParams.get('tab') as TabValue) || 'all';
  const activeTab: TabValue = tabParam === 'test' ? 'test' : 'all';

  const { storeId: selectedStoreId, setStoreId: setSelectedStoreId } = useScopedStoreId(storeIdParam);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [products, setProducts] = useState<ProductType[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce recherche (350ms) + retour page 1 sur changement de recherche/boutique/onglet.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch, selectedStoreId, activeTab]);

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
      setProducts([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const skip = (page - 1) * pageSize;
    storesApi
      .listProducts(selectedStoreId, {
        limit: pageSize,
        skip,
        search: debouncedSearch.trim() || undefined,
        testCandidates: activeTab === 'test' ? true : undefined,
      })
      .then((res) => {
        const data = res.data as { products: ProductType[]; total: number };
        setProducts(data.products);
        setTotal(data.total ?? 0);
      })
      .catch(() => {
        setProducts([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [selectedStoreId, page, pageSize, debouncedSearch, activeTab]);

  const activeStore = stores.find((s) => s._id === selectedStoreId);
  const isDigitalStore = activeStore?.storeType === 'digital';
  const newProductHref = selectedStoreId
    ? (isDigitalStore
        ? `/dashboard/products/new/digital?storeId=${selectedStoreId}`
        : `/dashboard/products/new?storeId=${selectedStoreId}`)
    : '#';

  // On garde le tab dans l'URL — refresh + partage préservent l'onglet actif.
  function handleTabChange(next: string) {
    const nextTab = (next === 'test' ? 'test' : 'all') as TabValue;
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    if (nextTab === 'all') sp.delete('tab'); else sp.set('tab', 'test');
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  // Patch local du produit modifié — évite un refetch complet à chaque save.
  function replaceProduct(updated: ProductType) {
    setProducts((prev) => prev.map((p) => (p._id === updated._id ? { ...p, ...updated } : p)));
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Products</h1>
          <p className="text-muted-foreground">
            {isDigitalStore ? 'Tes produits digitaux : téléchargements, cours, licences, abonnements.' : 'Manage your store products.'}
          </p>
        </div>
        {selectedStoreId && (
          <Link href={newProductHref}>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {isDigitalStore ? 'Nouveau produit digital' : 'Add product'}
            </Button>
          </Link>
        )}
      </div>

      {stores.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {stores.map((s) => (
            <Button
              key={s._id}
              variant={selectedStoreId === s._id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedStoreId(s._id)}
              className="shrink-0"
            >
              {s.name}
            </Button>
          ))}
        </div>
      )}

      {selectedStoreId && (
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="all">
              <Package className="mr-1.5 h-3.5 w-3.5" />
              Tous les produits
            </TabsTrigger>
            <TabsTrigger value="test">
              <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
              Produit test
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un produit (nom, SKU…)"
                className="pl-9"
              />
            </div>

            {loading ? (
              <p className="text-muted-foreground">Loading products...</p>
            ) : products.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Package className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-4 font-medium">No products</p>
                  <Link href={newProductHref}>
                    <Button className="mt-2">{isDigitalStore ? 'Nouveau produit digital' : 'Add product'}</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {products.map((p, i) => {
                    const cover = mediaUrl(p.images?.[0]);
                    const currency = activeStore?.settings?.currency || 'USD';
                    const isDigital = p.type === 'digital';
                    const hasDiscount = !!p.compareAtPrice && p.compareAtPrice > p.price;
                    const lowStock = !isDigital && typeof p.stock === 'number' && p.stock > 0 && p.stock <= 5;
                    const outOfStock = !isDigital && p.stock === 0;
                    const revealDelay = `${Math.min(i, 11) * 55}ms`;
                    return (
                      <Link
                        key={p._id}
                        href={`/dashboard/products/${p._id}?storeId=${selectedStoreId}`}
                        className="dpc-card group relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-all duration-500 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10"
                        style={{ animationDelay: revealDelay }}
                      >
                        <div className="relative aspect-square overflow-hidden bg-muted/40">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cover}
                              alt={p.name}
                              className="h-full w-full object-cover transition-transform duration-[700ms] ease-out group-hover:scale-110 group-hover:rotate-[0.6deg]"
                            />
                          ) : (
                            <div className="grid h-full place-items-center text-muted-foreground transition-transform duration-500 group-hover:scale-110">
                              {isDigital ? <Cloud className="h-7 w-7" /> : <ImageIcon className="h-7 w-7" />}
                            </div>
                          )}
                          <span className="dpc-shimmer pointer-events-none absolute inset-0" aria-hidden />
                          {hasDiscount && (
                            <span className="dpc-badge-pulse absolute left-1.5 top-1.5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm">
                              −{Math.round(((p.compareAtPrice! - p.price) / p.compareAtPrice!) * 100)}%
                            </span>
                          )}
                          <span
                            className={cn(
                              'absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-sm backdrop-blur transition-transform duration-300 group-hover:scale-105',
                              p.isPublished
                                ? 'bg-emerald-500/90 text-white'
                                : 'bg-amber-500/90 text-white'
                            )}
                          >
                            {p.isPublished ? 'Live' : 'Draft'}
                          </span>
                          {p.isTestCandidate && (
                            <span className="absolute left-1.5 bottom-1.5 inline-flex items-center gap-1 rounded-full bg-violet-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur">
                              <Beaker className="h-2.5 w-2.5" /> Test
                            </span>
                          )}
                          {isDigital && !p.isTestCandidate && (
                            <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur">
                              <Cloud className="h-2.5 w-2.5" /> Digital
                            </span>
                          )}
                          {outOfStock && !p.isTestCandidate && (
                            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur">
                              Rupture
                            </span>
                          )}
                          {!outOfStock && lowStock && !p.isTestCandidate && (
                            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur">
                              {p.stock}
                            </span>
                          )}
                          <span
                            className="dpc-quickedit pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-2 opacity-0 transition-all duration-300"
                            aria-hidden
                          >
                            <span className="inline-flex items-center gap-1 rounded-full bg-card/95 px-2 py-1 text-[10px] font-semibold text-foreground shadow-md backdrop-blur">
                              Modifier <span aria-hidden>→</span>
                            </span>
                          </span>
                        </div>
                        <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                          <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary">
                            {p.name}
                          </h3>
                          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0 tabular-nums">
                            <span className="whitespace-nowrap text-sm font-bold text-primary">
                              {formatCurrency(p.price, currency)}
                            </span>
                            {hasDiscount && (
                              <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground line-through">
                                {formatCurrency(p.compareAtPrice!, currency)}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
                <div className="mt-4 rounded-2xl border border-border/60 bg-card">
                  <Pagination
                    total={total}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                    disabled={loading}
                  />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="test" className="space-y-4">
            <TestProductsPanel
              storeId={selectedStoreId!}
              currency={activeStore?.settings?.currency || 'USD'}
              products={products}
              loading={loading}
              total={total}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              search={search}
              onSearch={setSearch}
              onProductUpdated={replaceProduct}
            />
          </TabsContent>
        </Tabs>
      )}

      {!selectedStoreId && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Create a store first to add products.
          </CardContent>
        </Card>
      )}

      <style jsx global>{`
        @keyframes dpcReveal {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .dpc-card {
          opacity: 0;
          animation: dpcReveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes dpcBadgePulse {
          0%, 100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(244,63,94,0.45); }
          50%      { transform: scale(1.06); box-shadow: 0 0 0 6px rgba(244,63,94,0); }
        }
        .dpc-badge-pulse { animation: dpcBadgePulse 2.2s ease-in-out infinite; }
        .dpc-shimmer {
          background: linear-gradient(115deg,
            transparent 0%, transparent 42%,
            rgba(255,255,255,0.22) 50%,
            transparent 58%, transparent 100%);
          background-size: 200% 100%;
          background-position: 200% 0;
          opacity: 0;
          transition: opacity 0.35s ease, background-position 0.9s ease;
        }
        .group:hover .dpc-shimmer { opacity: 1; background-position: -100% 0; }
        .group:hover .dpc-quickedit { opacity: 1; transform: translateY(-4px); }
        @media (prefers-reduced-motion: reduce) {
          .dpc-card, .dpc-badge-pulse, .dpc-shimmer, .dpc-quickedit {
            animation: none !important; transition: none !important;
            opacity: 1 !important; transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Sous-onglet "Produit test"                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

interface TestPanelProps {
  storeId: string;
  currency: string;
  products: ProductType[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  search: string;
  onSearch: (s: string) => void;
  onProductUpdated: (p: ProductType) => void;
}

function TestProductsPanel({
  storeId,
  currency,
  products,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  search,
  onSearch,
  onProductUpdated,
}: TestPanelProps) {
  const [promoteOpen, setPromoteOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Rechercher dans les produits en test…"
            className="pl-9"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => setPromoteOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Ajouter au test
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Chargement des produits en test…</p>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FlaskConical className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 font-medium">Aucun produit en test</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Marque un produit comme candidat au test pour le suivre ici : wow effect, lien fournisseur,
              prix en gros et statut de campagne (en attente, en cours, testé…).
            </p>
            <Button className="mt-4" size="sm" variant="outline" onClick={() => setPromoteOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Ajouter un produit au test
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Produit</th>
                    <th className="px-3 py-2.5 font-semibold">Wow%</th>
                    <th className="px-3 py-2.5 font-semibold">Lien produit</th>
                    <th className="px-3 py-2.5 font-semibold">N° fournisseur</th>
                    <th className="px-3 py-2.5 font-semibold">Prix en gros</th>
                    <th className="px-3 py-2.5 font-semibold">Statut</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {products.map((p) => (
                    <TestRow
                      key={p._id}
                      storeId={storeId}
                      product={p}
                      currency={currency}
                      onUpdated={onProductUpdated}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card">
            <Pagination
              total={total}
              page={page}
              pageSize={pageSize}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
              disabled={loading}
            />
          </div>
        </>
      )}

      {promoteOpen && (
        <PromoteToTestDialog
          storeId={storeId}
          onClose={() => setPromoteOpen(false)}
          onPromoted={(p) => {
            onProductUpdated(p);
            setPromoteOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Ligne test — édition inline                                                */
/* ────────────────────────────────────────────────────────────────────────── */

interface TestRowProps {
  storeId: string;
  product: ProductType;
  currency: string;
  onUpdated: (p: ProductType) => void;
}

function TestRow({ storeId, product, currency, onUpdated }: TestRowProps) {
  const primary = product.suppliers?.find((s) => s.isPrimary) || product.suppliers?.[0];
  const initialSku = primary?.supplierSku || '';
  const initialUrl = primary?.productUrl || '';
  const initialCost = primary?.costPrice ?? '';
  const initialWow = product.wowEffect ?? '';
  const initialStatus: TestStatus = product.testStatus || 'pending';

  const [editing, setEditing] = useState(false);
  const [wow, setWow] = useState<number | ''>(initialWow);
  const [productUrl, setProductUrl] = useState<string>(initialUrl);
  const [supplierSku, setSupplierSku] = useState<string>(initialSku);
  const [costPrice, setCostPrice] = useState<number | ''>(initialCost);
  const [status, setStatus] = useState<TestStatus>(initialStatus);
  const [saving, setSaving] = useState(false);

  const badge = TEST_STATUS_BADGE[status];
  const cover = mediaUrl(product.images?.[0]);

  function reset() {
    setWow(initialWow);
    setProductUrl(initialUrl);
    setSupplierSku(initialSku);
    setCostPrice(initialCost);
    setStatus(initialStatus);
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    try {
      // On merge le fournisseur primaire — les autres fournisseurs sont préservés tels quels.
      const rest = (product.suppliers || []).filter((s) => s !== primary);
      const nextPrimary = {
        ...(primary || {}),
        supplierSku: supplierSku.trim() || undefined,
        productUrl: productUrl.trim() || undefined,
        costPrice: costPrice === '' ? undefined : Number(costPrice),
        currency: primary?.currency || currency,
        isPrimary: true,
      };
      const suppliers = [nextPrimary, ...rest];

      const res = await storesApi.updateProduct(storeId, product._id, {
        wowEffect: wow === '' ? undefined : Number(wow),
        testStatus: status,
        isTestCandidate: true,
        suppliers,
      });
      const updated = (res.data as { product: ProductType }).product;
      onUpdated({ ...product, ...updated });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function removeFromTest() {
    if (!confirm('Retirer ce produit du suivi de test ?')) return;
    setSaving(true);
    try {
      const res = await storesApi.updateProduct(storeId, product._id, {
        isTestCandidate: false,
      });
      const updated = (res.data as { product: ProductType }).product;
      onUpdated({ ...product, ...updated });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="hover:bg-muted/30">
      {/* Produit */}
      <td className="px-3 py-2.5">
        <Link
          href={`/dashboard/products/${product._id}?storeId=${storeId}`}
          className="flex items-center gap-2.5 hover:text-primary"
        >
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-muted/60">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-muted-foreground">
                <ImageIcon className="h-4 w-4" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="line-clamp-1 text-[13px] font-semibold">{product.name}</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              PV : {formatCurrency(product.price, currency)}
            </div>
          </div>
        </Link>
      </td>

      {/* Wow */}
      <td className="px-3 py-2.5 tabular-nums">
        {editing ? (
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={wow}
            onChange={(e) => setWow(e.target.value === '' ? '' : Number(e.target.value))}
            className="h-8 w-20"
          />
        ) : product.wowEffect != null ? (
          <WowPill value={product.wowEffect} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Lien produit */}
      <td className="max-w-[240px] px-3 py-2.5">
        {editing ? (
          <Input
            type="url"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            placeholder="https://aliexpress.com/…"
            className="h-8"
          />
        ) : productUrl ? (
          <a
            href={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="max-w-[200px] truncate">{prettyHost(productUrl)}</span>
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Fournisseur SKU */}
      <td className="px-3 py-2.5">
        {editing ? (
          <Input
            value={supplierSku}
            onChange={(e) => setSupplierSku(e.target.value)}
            placeholder="SKU / ref"
            className="h-8 w-32"
          />
        ) : supplierSku ? (
          <code className="rounded bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium">
            {supplierSku}
          </code>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Prix en gros */}
      <td className="px-3 py-2.5 tabular-nums">
        {editing ? (
          <Input
            type="number"
            min={0}
            step="0.01"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
            className="h-8 w-24"
          />
        ) : costPrice !== '' && costPrice != null ? (
          <span className="font-medium">
            {formatCurrency(Number(costPrice), primary?.currency || currency)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Statut */}
      <td className="px-3 py-2.5">
        {editing ? (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TestStatus)}
            className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
          >
            {TEST_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{TEST_STATUS_BADGE[s].label}</option>
            ))}
          </select>
        ) : (
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
            badge.cls,
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', badge.dot)} />
            {badge.label}
          </span>
        )}
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5 text-right">
        {editing ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={reset} disabled={saving} className="h-8 px-2">
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" onClick={save} disabled={saving} className="h-8 px-2">
              <Save className="mr-1 h-3.5 w-3.5" />
              {saving ? '…' : 'OK'}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="h-8 px-2">
              Modifier
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={removeFromTest}
              disabled={saving}
              className="h-8 px-2 text-muted-foreground hover:text-destructive"
              title="Retirer du suivi de test"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function WowPill({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const cls =
    v >= 75 ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20' :
    v >= 50 ? 'bg-blue-500/10 text-blue-700 ring-blue-500/20' :
    v >= 25 ? 'bg-amber-500/10 text-amber-700 ring-amber-500/20' :
              'bg-slate-500/10 text-slate-700 ring-slate-500/20';
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset tabular-nums',
      cls,
    )}>
      {v}%
    </span>
  );
}

function prettyHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Dialog : promouvoir un produit du catalogue au pipeline de test             */
/* ────────────────────────────────────────────────────────────────────────── */

function PromoteToTestDialog({
  storeId,
  onClose,
  onPromoted,
}: {
  storeId: string;
  onClose: () => void;
  onPromoted: (p: ProductType) => void;
}) {
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [results, setResults] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setLoading(true);
    storesApi
      .listProducts(storeId, { limit: 20, search: dq.trim() || undefined })
      .then((res) => {
        const data = res.data as { products: ProductType[] };
        // Filtrer côté client les déjà-candidats (le backend renvoie tout).
        setResults(data.products.filter((p) => !p.isTestCandidate));
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [storeId, dq]);

  async function promote(p: ProductType) {
    setSaving(p._id);
    try {
      const res = await storesApi.updateProduct(storeId, p._id, {
        isTestCandidate: true,
        testStatus: 'pending',
      });
      const updated = (res.data as { product: ProductType }).product;
      onPromoted({ ...p, ...updated });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/60 bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-semibold">Ajouter un produit au test</h3>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="border-b border-border/60 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un produit du catalogue…"
              className="pl-9"
            />
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {loading ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : results.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Aucun produit disponible à ajouter au test.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {results.map((p) => {
                const cover = mediaUrl(p.images?.[0]);
                return (
                  <li key={p._id} className="flex items-center gap-3 p-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted/60">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center text-muted-foreground">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-sm font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {formatCurrency(p.price, 'USD')}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => promote(p)}
                      disabled={saving === p._id}
                    >
                      <Beaker className="mr-1 h-3.5 w-3.5" />
                      {saving === p._id ? '…' : 'Tester'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
