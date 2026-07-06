'use client';

/**
 * Bordereau de livraison imprimable (route autonome, hors layout dashboard
 * pour une page propre à l'impression). Ouvert dans un nouvel onglet depuis
 * le détail d'une commande ou en lot depuis la liste :
 *
 *   /bordereau?storeId=<id>&ids=<orderId,orderId,…>
 *
 * Récupère le branding boutique + chaque commande, rend UN bordereau par page
 * A4, puis déclenche l'impression (l'utilisateur choisit « Enregistrer en
 * PDF »). Aucune dépendance PDF côté serveur : print-to-PDF = meilleure
 * qualité et zéro coût VPS.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Printer, AlertTriangle } from 'lucide-react';
import { storesApi } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { encodeCode128B } from '@/lib/code128';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
  sku?: string;
}
interface BordereauOrder {
  _id: string;
  orderNumber: string;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  email?: string;
  shippingAddress?: {
    line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string;
  };
  items: OrderItem[];
  subtotal: number;
  shippingCost?: number;
  discount?: number;
  total: number;
  currency: string;
  paymentMethod?: string;
  paymentStatus?: string;
  marketCountry?: string;
  notes?: string;
  confirmationNote?: string;
  delivery?: { provider?: string; externalId?: string; trackingNumber?: string };
  trackingNumber?: string;
}
interface StoreBranding {
  _id: string;
  name: string;
  logo?: string;
  settings?: { currency?: string; country?: string };
}

// ── Code-barres Code128 en SVG ───────────────────────────────────────
function Barcode({ value, height = 42 }: { value: string; height?: number }) {
  const modules = useMemo(() => encodeCode128B(value), [value]);
  const unit = 1.5; // largeur d'un module (px)
  const totalWidth = modules.reduce((s, w) => s + w, 0) * unit;
  let x = 0;
  const bars: { x: number; w: number }[] = [];
  modules.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w: w * unit }); // index pair = barre
    x += w * unit;
  });
  return (
    <svg width={totalWidth} height={height} viewBox={`0 0 ${totalWidth} ${height}`} role="img" aria-label={`Code-barres ${value}`}>
      <rect x={0} y={0} width={totalWidth} height={height} fill="#fff" />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000" />
      ))}
    </svg>
  );
}

function addr(a?: BordereauOrder['shippingAddress']): string {
  if (!a) return '—';
  return [a.line1, a.line2, [a.postalCode, a.city].filter(Boolean).join(' '), a.state, a.country]
    .filter(Boolean)
    .join(', ');
}

function Bordereau({ order, store }: { order: BordereauOrder; store: StoreBranding | null }) {
  const currency = order.currency || store?.settings?.currency || 'USD';
  const isCod = order.paymentMethod === 'cod' || order.paymentStatus !== 'paid';
  const carrier = order.delivery?.provider;
  const tracking = order.delivery?.externalId || order.delivery?.trackingNumber || order.trackingNumber;
  const totalUnits = order.items.reduce((s, i) => s + i.quantity, 0);
  const note = order.notes || order.confirmationNote;

  return (
    <article className="bordereau">
      {/* En-tête : expéditeur / titre + code-barres */}
      <header className="bd-head">
        <div className="bd-sender">
          {store?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logo} alt="" className="bd-logo" />
          ) : (
            <div className="bd-logo bd-logo-ph">{(store?.name || 'F').charAt(0)}</div>
          )}
          <div>
            <div className="bd-store">{store?.name || 'Boutique'}</div>
            <div className="bd-muted">Expéditeur</div>
          </div>
        </div>
        <div className="bd-title-wrap">
          <div className="bd-title">BORDEREAU DE LIVRAISON</div>
          <div className="bd-order-no">N° {order.orderNumber}</div>
          <div className="bd-muted">{formatDate(order.createdAt)}</div>
          <div className="bd-barcode">
            <Barcode value={order.orderNumber} />
            <div className="bd-barcode-txt">{order.orderNumber}</div>
          </div>
        </div>
      </header>

      {/* Destinataire + infos livraison */}
      <div className="bd-grid">
        <section className="bd-box">
          <div className="bd-box-label">Destinataire</div>
          <div className="bd-name">{order.customerName || '—'}</div>
          <div className="bd-phone">☎ {order.customerPhone || '—'}</div>
          <div className="bd-address">{addr(order.shippingAddress)}</div>
          {order.email && <div className="bd-muted bd-email">{order.email}</div>}
        </section>
        <section className="bd-box">
          <div className="bd-box-label">Livraison</div>
          <dl className="bd-dl">
            <dt>Paiement</dt><dd>{isCod ? 'À la livraison (COD)' : 'Payé (prépayé)'}</dd>
            <dt>Transporteur</dt><dd>{carrier || '—'}</dd>
            <dt>Suivi</dt><dd>{tracking || '—'}</dd>
            <dt>Pays</dt><dd>{order.marketCountry || order.shippingAddress?.country || store?.settings?.country || '—'}</dd>
            <dt>Colis</dt><dd>{totalUnits} article{totalUnits > 1 ? 's' : ''}</dd>
          </dl>
        </section>
      </div>

      {/* Montant à encaisser — l'info clé du COD */}
      <div className={`bd-cod ${isCod ? '' : 'bd-cod-paid'}`}>
        <span className="bd-cod-label">{isCod ? 'MONTANT À ENCAISSER' : 'DÉJÀ PAYÉ — NE PAS ENCAISSER'}</span>
        <span className="bd-cod-amount">{formatCurrency(order.total, currency)}</span>
      </div>

      {/* Articles */}
      <table className="bd-table">
        <thead>
          <tr>
            <th className="bd-l">Article</th>
            <th>SKU</th>
            <th className="bd-c">Qté</th>
            <th className="bd-r">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it, i) => (
            <tr key={i}>
              <td className="bd-l">{it.name}</td>
              <td className="bd-mono">{it.sku || '—'}</td>
              <td className="bd-c">{it.quantity}</td>
              <td className="bd-r">{formatCurrency(it.total, currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {order.shippingCost ? (
            <tr><td colSpan={3} className="bd-r bd-muted">Livraison</td><td className="bd-r">{formatCurrency(order.shippingCost, currency)}</td></tr>
          ) : null}
          {order.discount ? (
            <tr><td colSpan={3} className="bd-r bd-muted">Remise</td><td className="bd-r">−{formatCurrency(order.discount, currency)}</td></tr>
          ) : null}
          <tr className="bd-total-row">
            <td colSpan={3} className="bd-r">TOTAL</td>
            <td className="bd-r">{formatCurrency(order.total, currency)}</td>
          </tr>
        </tfoot>
      </table>

      {note && (
        <div className="bd-note"><strong>Note :</strong> {note}</div>
      )}

      {/* Pied : signatures */}
      <footer className="bd-foot">
        <div className="bd-sign"><span>Signature livreur</span></div>
        <div className="bd-sign"><span>Signature client · Date</span></div>
      </footer>
      <div className="bd-gen">Généré via FlexioPage · {store?.name || ''}</div>
    </article>
  );
}

function BordereauView() {
  const sp = useSearchParams();
  const storeId = sp.get('storeId') || '';
  const ids = useMemo(() => (sp.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean), [sp]);

  const [orders, setOrders] = useState<BordereauOrder[]>([]);
  const [store, setStore] = useState<StoreBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printedRef = useRef(false);

  useEffect(() => {
    if (!storeId || ids.length === 0) {
      setError('Lien invalide : boutique ou commandes manquantes.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [storesRes, ...orderRes] = await Promise.all([
          storesApi.list(),
          ...ids.map((id) => storesApi.getOrder(storeId, id)),
        ]);
        if (cancelled) return;
        const list = (storesRes.data as { stores: StoreBranding[] }).stores || [];
        setStore(list.find((s) => s._id === storeId) || null);
        const fetched = orderRes
          .map((r) => (r.data as { order: BordereauOrder }).order)
          .filter(Boolean);
        setOrders(fetched);
        if (fetched.length === 0) setError('Aucune commande trouvée.');
      } catch {
        if (!cancelled) setError('Impossible de charger les bordereaux.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storeId, ids]);

  // Auto-impression une seule fois, après le rendu (laisse le logo se charger).
  useEffect(() => {
    if (loading || error || orders.length === 0 || printedRef.current) return;
    printedRef.current = true;
    const t = window.setTimeout(() => window.print(), 500);
    return () => window.clearTimeout(t);
  }, [loading, error, orders.length]);

  if (loading) {
    return (
      <div className="bd-center"><Loader2 className="bd-spin" /> Préparation des bordereaux…</div>
    );
  }
  if (error) {
    return (
      <div className="bd-center bd-error"><AlertTriangle className="bd-ico" /> {error}</div>
    );
  }

  return (
    <>
      {/* Barre d'action — masquée à l'impression */}
      <div className="bd-toolbar no-print">
        <span>{orders.length} bordereau{orders.length > 1 ? 'x' : ''} prêt{orders.length > 1 ? 's' : ''}</span>
        <button type="button" onClick={() => window.print()} className="bd-print-btn">
          <Printer size={16} /> Imprimer / Télécharger PDF
        </button>
        <span className="bd-hint">Astuce : choisissez « Enregistrer en PDF » comme imprimante.</span>
      </div>

      <div className="bd-sheet">
        {orders.map((o) => (
          <Bordereau key={o._id} order={o} store={store} />
        ))}
      </div>

      <style jsx global>{`
        :root { color-scheme: light; }
        body { background: #f3f4f6; }
        .bd-center { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 60vh; color: #6b7280; font: 500 14px system-ui, sans-serif; }
        .bd-error { color: #b91c1c; }
        .bd-ico, .bd-spin { width: 18px; height: 18px; }
        .bd-spin { animation: bd-rot 1s linear infinite; }
        @keyframes bd-rot { to { transform: rotate(360deg); } }

        .bd-toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
          padding: 10px 16px; background: #111827; color: #fff; font: 500 13px system-ui, sans-serif; }
        .bd-print-btn { display: inline-flex; align-items: center; gap: 6px; background: #4f46e5; color: #fff; border: 0;
          padding: 7px 14px; border-radius: 8px; font-weight: 600; cursor: pointer; }
        .bd-print-btn:hover { background: #4338ca; }
        .bd-hint { color: #9ca3af; font-size: 12px; }

        .bd-sheet { padding: 20px 0; }
        .bordereau {
          box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto 20px; padding: 14mm;
          background: #fff; color: #111827; font: 13px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          box-shadow: 0 1px 8px rgba(0,0,0,.12); display: flex; flex-direction: column;
        }
        .bd-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
          padding-bottom: 12px; border-bottom: 2px solid #111827; }
        .bd-sender { display: flex; align-items: center; gap: 12px; }
        .bd-logo { width: 54px; height: 54px; object-fit: contain; border-radius: 10px; }
        .bd-logo-ph { display: grid; place-items: center; background: #111827; color: #fff; font-size: 26px; font-weight: 700; }
        .bd-store { font-size: 17px; font-weight: 700; }
        .bd-muted { color: #6b7280; font-size: 11px; }
        .bd-title-wrap { text-align: right; }
        .bd-title { font-size: 12px; font-weight: 700; letter-spacing: .06em; color: #4b5563; }
        .bd-order-no { font-size: 20px; font-weight: 800; margin: 2px 0; }
        .bd-barcode { margin-top: 8px; text-align: right; }
        .bd-barcode-txt { font: 600 11px ui-monospace, monospace; letter-spacing: .18em; margin-top: 2px; }

        .bd-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; margin: 14px 0; }
        .bd-box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; }
        .bd-box-label { text-transform: uppercase; font-size: 10px; letter-spacing: .08em; color: #6b7280; font-weight: 700; margin-bottom: 6px; }
        .bd-name { font-size: 16px; font-weight: 700; }
        .bd-phone { font-size: 17px; font-weight: 800; margin: 3px 0; letter-spacing: .02em; }
        .bd-address { font-size: 13px; color: #374151; }
        .bd-email { margin-top: 4px; }
        .bd-dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 0; }
        .bd-dl dt { color: #6b7280; font-size: 12px; }
        .bd-dl dd { margin: 0; font-weight: 600; font-size: 12px; text-align: right; }

        .bd-cod { display: flex; align-items: center; justify-content: space-between; gap: 12px;
          background: #fef3c7; border: 2px solid #f59e0b; border-radius: 10px; padding: 12px 18px; margin-bottom: 14px; }
        .bd-cod-paid { background: #dcfce7; border-color: #22c55e; }
        .bd-cod-label { font-size: 12px; font-weight: 800; letter-spacing: .05em; color: #78350f; }
        .bd-cod-paid .bd-cod-label { color: #14532d; }
        .bd-cod-amount { font-size: 26px; font-weight: 900; }

        .bd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .bd-table th { text-align: right; padding: 7px 8px; border-bottom: 2px solid #111827; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #4b5563; }
        .bd-table td { padding: 7px 8px; border-bottom: 1px solid #eceef1; text-align: right; }
        .bd-l { text-align: left !important; }
        .bd-c { text-align: center !important; }
        .bd-r { text-align: right !important; }
        .bd-mono { font-family: ui-monospace, monospace; font-size: 12px; color: #374151; }
        .bd-total-row td { font-weight: 800; font-size: 15px; border-bottom: 0; padding-top: 10px; }

        .bd-note { margin-top: 12px; background: #f9fafb; border-left: 3px solid #9ca3af; border-radius: 4px; padding: 8px 12px; font-size: 12px; }

        .bd-foot { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: auto; padding-top: 26px; }
        .bd-sign { border-top: 1px solid #9ca3af; padding-top: 4px; min-height: 46px; }
        .bd-sign span { font-size: 11px; color: #6b7280; }
        .bd-gen { text-align: center; color: #9ca3af; font-size: 10px; margin-top: 10px; }

        @media print {
          body { background: #fff; }
          .no-print { display: none !important; }
          .bd-sheet { padding: 0; }
          .bordereau { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none;
            page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .bordereau:last-child { page-break-after: auto; }
        }
        @page { size: A4; margin: 12mm; }
      `}</style>
    </>
  );
}

export default function BordereauPage() {
  return (
    <Suspense fallback={<div className="bd-center">Chargement…</div>}>
      <BordereauView />
    </Suspense>
  );
}
