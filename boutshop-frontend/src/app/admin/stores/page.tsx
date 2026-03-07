'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi, type AdminStore } from '@/lib/api';
import { Loader2, Cloud, Package, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default function AdminStoresPage() {
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.stores().then((res) => {
      setStores(res.data.stores);
      setTotal(res.data.total);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Boutiques ({total})</CardTitle>
        <CardDescription>Toutes les boutiques de la plateforme, plus récentes en premier.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Boutique</th>
                  <th className="py-2 text-left font-medium">Vendeur</th>
                  <th className="py-2 text-left font-medium">Type</th>
                  <th className="py-2 text-left font-medium">Pays / devise</th>
                  <th className="py-2 text-left font-medium">Statut</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => {
                  const isDigital = s.storeType === 'digital';
                  return (
                    <tr key={s._id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-md ${
                            isDigital ? 'from-fuchsia-500 to-pink-600' : 'from-indigo-500 to-violet-600'
                          }`}>
                            {isDigital ? <Cloud className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold">{s.name}</div>
                            <div className="truncate text-xs text-muted-foreground">/{s.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-xs">
                        <div className="font-medium">{s.ownerId?.name || '—'}</div>
                        <div className="text-muted-foreground">{s.ownerId?.email || '—'}</div>
                      </td>
                      <td className="py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isDigital ? 'bg-fuchsia-500/10 text-fuchsia-700' : 'bg-indigo-500/10 text-indigo-700'
                        }`}>
                          {isDigital ? 'Digital' : 'Physical'}
                        </span>
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">
                        {s.settings?.country || '—'} · {s.settings?.currency || '—'}
                      </td>
                      <td className="py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          s.isPublished
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : 'bg-amber-500/10 text-amber-700'
                        }`}>
                          {s.isPublished ? 'Live' : 'Draft'}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/store/${s.slug}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Voir <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
