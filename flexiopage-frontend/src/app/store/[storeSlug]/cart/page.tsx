'use client';

/**
 * Public cart page — reads localStorage, lists items with quantity steppers
 * and remove buttons, totals the subtotal, and offers the "Passer commande"
 * CTA that leads to /cart/checkout.
 *
 * Pure client component because the data lives in localStorage. The
 * surrounding layout (navbar / footer / whatsapp / popup) is already
 * server-rendered by the parent /store/[storeSlug]/layout.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { IMAGE_BLUR_DATA_URL } from '@/lib/image-placeholder';
import {
  ShoppingBag, Minus, Plus, Trash2, ArrowRight, ArrowLeft,
} from 'lucide-react';
import { formatCurrency, mediaUrl } from '@/lib/utils';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  clearCart,
  getCart,
  removeFromCart,
  updateCartQty,
  type CartItem,
} from '@/lib/cart';

export default function CartPage() {
  const params = useParams();
  const storeSlug = params.storeSlug as string;
  const confirm = useConfirm();
  const [items, setItems] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(() => setItems(getCart(storeSlug)), [storeSlug]);

  useEffect(() => {
    setMounted(true);
    refresh();
    // Re-render when another tab or component mutates the cart.
    window.addEventListener('flexio:cart', refresh);
    return () => window.removeEventListener('flexio:cart', refresh);
  }, [refresh]);

  function setQty(productId: string, variantName: string | undefined, q: number) {
    updateCartQty(storeSlug, productId, variantName, q);
    refresh();
  }
  function removeRow(productId: string, variantName?: string) {
    removeFromCart(storeSlug, productId, variantName);
    refresh();
  }
  async function emptyCart() {
    const ok = await confirm({
      title: 'Vider le panier ?',
      description: 'Tous les articles seront retirés. Tu pourras toujours les ajouter à nouveau depuis le catalogue.',
      confirmLabel: 'Vider',
      tone: 'destructive',
    });
    if (!ok) return;
    clearCart(storeSlug);
    refresh();
  }

  if (!mounted) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-muted-foreground">
        …
      </div>
    );
  }

  // Currency — assume the cart is single-currency (you can only browse one
  // store at a time). Fall back to first item or TND.
  const currency = items[0]?.currency || 'TND';
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <ShoppingBag className="h-3 w-3" />
            Mon panier
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-4xl">
            {items.length === 0
              ? 'Panier vide'
              : `${itemCount} article${itemCount > 1 ? 's' : ''}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Le panier reste sur ton navigateur jusqu&apos;à ce que tu passes commande.
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={emptyCart}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:border-rose-500/40 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Vider le panier
          </button>
        )}
      </header>

      {items.length === 0 ? (
        <EmptyState storeSlug={storeSlug} />
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          {/* LEFT — items list */}
          <ul className="space-y-3">
            {items.map((it) => {
              const lineTotal = it.price * it.quantity;
              return (
                <li
                  key={`${it.id}::${it.variantName || ''}`}
                  className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-3 sm:p-4"
                >
                  <Link
                    href={`/${storeSlug}/product/${it.slug}`}
                    className="block aspect-square w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:w-24"
                  >
                    {it.image ? (
                      <Image
                        src={mediaUrl(it.image) || it.image}
                        alt=""
                        fill
                        sizes="96px"
                        placeholder="blur"
                        blurDataURL={IMAGE_BLUR_DATA_URL}
                        className="object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-[10px] text-muted-foreground">
                        Sans image
                      </div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${storeSlug}/product/${it.slug}`}
                      className="block text-sm font-semibold leading-snug hover:underline"
                    >
                      {it.name}
                    </Link>
                    {it.variantName && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Variante : <strong>{it.variantName}</strong>
                      </p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatCurrency(it.price, it.currency)} l&apos;unité
                    </p>
                    {/* Quantity stepper + remove */}
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="inline-flex items-center rounded-md border border-border/60">
                        <button
                          type="button"
                          onClick={() => setQty(it.id, it.variantName, it.quantity - 1)}
                          disabled={it.quantity <= 1}
                          aria-label="Diminuer"
                          className="grid h-8 w-8 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-8 px-2 text-center text-sm font-bold tabular-nums">
                          {it.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty(it.id, it.variantName, it.quantity + 1)}
                          disabled={it.quantity >= 99}
                          aria-label="Augmenter"
                          className="grid h-8 w-8 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-extrabold tabular-nums text-primary">
                          {formatCurrency(lineTotal, it.currency)}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRow(it.id, it.variantName)}
                          className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-rose-600"
                        >
                          <Trash2 className="h-3 w-3" />
                          Retirer
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* RIGHT — summary */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Récapitulatif
              </h2>
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Sous-total ({itemCount} article{itemCount > 1 ? 's' : ''})</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(subtotal, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Livraison</span>
                  <span>Calculée au checkout</span>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border/60 pt-3">
                <span className="text-sm font-medium">Total estimé</span>
                <span className="text-xl font-extrabold tabular-nums text-primary">
                  {formatCurrency(subtotal, currency)}
                </span>
              </div>
              <Link
                href={`/${storeSlug}/cart/checkout`}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-primary to-fuchsia-600 px-4 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.01]"
              >
                Passer commande
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={`/${storeSlug}`}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-border/60 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Continuer mes achats
              </Link>
              <p className="text-center text-[11px] text-muted-foreground">
                Paiement à la livraison · pas de prépaiement
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function EmptyState({ storeSlug }: { storeSlug: string }) {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-border/60 bg-card/40 p-12 text-center">
      <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground" />
      <p className="mt-4 text-lg font-semibold">Aucun article dans le panier</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Parcours la boutique et ajoute des produits — ils s&apos;empilent ici pour une commande unique.
      </p>
      <Link
        href={`/${storeSlug}`}
        className="mt-6 inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary to-fuchsia-600 px-5 py-2.5 text-sm font-bold text-white shadow-md"
      >
        <ShoppingBag className="h-3.5 w-3.5" />
        Voir les produits
      </Link>
    </div>
  );
}
