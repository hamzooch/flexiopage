'use client';

/**
 * Abandoned carts — leads captured when a buyer fills phone or email in
 * the COD form but doesn't submit. Each row shows the contact info so
 * the seller can WhatsApp / call them manually.
 *
 * The chase WhatsApp deep-link is built per row so a single tap opens
 * the conversation with a pre-filled message referencing the product.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft, ShoppingCart, MessageCircle, Phone, Mail, Trash2, CheckCircle2, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { storesApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Cart {
  _id: string;
  productSlug?: string;
  productName?: string;
  productPrice?: number;
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  country?: string;
  recovered: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function AbandonedCartsPage() {
  const params = useParams();
  const storeId = params.storeId as string;
  const confirm = useConfirm();
  const [carts, setCarts] = useState<Cart[]>([]);
  const [includeRecovered, setIncludeRecovered] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await storesApi.listAbandonedCarts(storeId, { includeRecovered });
      setCarts((res.data as { carts: Cart[] }).carts);
    } finally {
      setLoading(false);
    }
  }, [storeId, includeRecovered]);

  useEffect(() => { void load(); }, [load]);

  async function remove(c: Cart) {
    const ok = await confirm({
      title: 'Supprimer ce lead ?',
      description: c.phone || c.email
        ? `Tu ne pourras plus relancer ${c.name || c.phone || c.email}.`
        : 'Ce lead disparaîtra de la liste des paniers abandonnés.',
      confirmLabel: 'Supprimer',
      tone: 'destructive',
    });
    if (!ok) return;
    await storesApi.deleteAbandonedCart(storeId, c._id);
    setCarts((arr) => arr.filter((x) => x._id !== c._id));
  }

  function waLink(c: Cart): string | null {
    if (!c.phone) return null;
    const digits = c.phone.replace(/[^\d+]/g, '');
    const msg = encodeURIComponent(
      `Bonjour ${c.name || ''}, j'ai vu que tu t'intéressais à ${c.productName || 'un de nos produits'} sur notre boutique. Tu as une question ? On peut finaliser ta commande tout de suite si tu veux 🙌`.trim()
    );
    return `https://wa.me/${digits.replace(/[^\d]/g, '')}?text=${msg}`;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/stores/${storeId}`}>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Paniers abandonnés</h1>
            <p className="text-sm text-muted-foreground">
              Acheteurs qui ont commencé à remplir le formulaire de commande sans finaliser. Rappelle-les directement.
            </p>
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeRecovered}
            onChange={(e) => setIncludeRecovered(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Inclure les récupérés
        </label>
      </header>

      {loading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : carts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
          <ShoppingCart className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-base font-semibold">Aucun panier abandonné</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Dès qu&apos;un visiteur tape son numéro/email dans le formulaire COD sans valider, il apparaît ici.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {carts.map((c) => {
            const wa = waLink(c);
            return (
              <li
                key={c._id}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 transition-colors',
                  c.recovered
                    ? 'border-emerald-500/30 opacity-60'
                    : 'border-border/60 hover:border-primary/30'
                )}
              >
                <span
                  className={cn(
                    'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white',
                    c.recovered
                      ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                      : 'bg-gradient-to-br from-amber-500 to-orange-600'
                  )}
                >
                  {c.recovered ? <CheckCircle2 className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{c.name || 'Anonyme'}</span>
                    {c.recovered && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Commande passée
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {c.productName && (
                      <>
                        <ShoppingCart className="mr-0.5 inline h-3 w-3" /> {c.productName}
                        {' · '}
                      </>
                    )}
                    {new Date(c.updatedAt).toLocaleString('fr-FR')}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-mono hover:bg-muted/80"
                      >
                        <Phone className="h-2.5 w-2.5" />
                        {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-mono hover:bg-muted/80"
                      >
                        <Mail className="h-2.5 w-2.5" />
                        {c.email}
                      </a>
                    )}
                    {c.city && <span className="text-[11px] text-muted-foreground">{c.city}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {wa && !c.recovered && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-500 px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Relance WhatsApp
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(c)}
                    className="grid h-9 w-9 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
