/**
 * Customer download portal — chariow-style.
 * Hit by /d/[token] after a purchase. Shows order summary + every digital
 * asset of every line item with download buttons + license keys.
 */
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import {
  Download,
  Video,
  FileText,
  Music,
  Image as ImageIcon,
  Link2,
  Key,
  Crown,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Mail,
} from 'lucide-react';

interface Props {
  params: Promise<{ token: string }>;
}

interface Asset {
  id: string;
  name: string;
  url: string;
  kind: 'file' | 'video' | 'image' | 'audio' | 'link';
  mimeType?: string;
  size?: number;
  durationSeconds?: number;
  order: number;
}

interface Item {
  orderItemId?: string;
  name: string;
  productSlug?: string;
  productImage?: string;
  digitalKind: 'download' | 'course' | 'license' | 'membership' | 'service';
  assets: Asset[];
  courseModules?: Array<{ id: string; title: string; lessonIds: string[]; order: number }>;
  licenseKey?: string;
}

interface PortalData {
  order: {
    orderNumber: string;
    email: string;
    customerName?: string;
    total: number;
    currency: string;
    paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded' | 'manual';
    createdAt: string;
    downloadExpiresAt?: string;
  };
  store: { name: string; slug: string } | null;
  items: Item[];
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001').replace(/\/$/, '');
function absUrl(u?: string): string {
  if (!u) return '';
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  if (u.startsWith('/')) return `${API_BASE}${u}`;
  return u;
}

const ASSET_ICON = {
  file: FileText,
  video: Video,
  audio: Music,
  image: ImageIcon,
  link: Link2,
};

const KIND_LABEL: Record<Item['digitalKind'], string> = {
  download: 'Téléchargement',
  course: 'Cours en ligne',
  license: 'Clé de licence',
  membership: 'Espace membre',
  service: 'Prestation',
};

export default async function DownloadPortalPage({ params }: Props) {
  const { token } = await params;
  let data: PortalData | null = null;
  let errorState: 'notfound' | 'expired' | 'fetch' | null = null;
  let expiresAtIso: string | undefined;

  try {
    const res = await fetch(`${API_BASE}/api/public/downloads/${token}`, { cache: 'no-store' });
    if (res.status === 404) errorState = 'notfound';
    else if (res.status === 410) {
      errorState = 'expired';
      const j = await res.json().catch(() => ({}));
      expiresAtIso = j.expiresAt;
    } else if (!res.ok) errorState = 'fetch';
    else data = await res.json();
  } catch {
    errorState = 'fetch';
  }

  if (errorState || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted/30 p-6">
        <div className="w-full max-w-md rounded-3xl border border-border/60 bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <Clock className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {errorState === 'expired' ? 'Lien expiré' : 'Lien introuvable'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {errorState === 'expired'
              ? `Ce lien de téléchargement a expiré${expiresAtIso ? ` le ${new Date(expiresAtIso).toLocaleDateString('fr-FR')}` : ''}. Contacte le marchand pour relancer ton accès.`
              : 'Ce lien de téléchargement n\'existe pas ou est invalide. Vérifie ton email pour le lien correct.'}
          </p>
          <Link href="/" className="mt-6 inline-flex h-10 items-center justify-center rounded-lg border border-border/70 bg-background px-5 text-sm font-medium hover:bg-muted">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  const { order, store, items } = data;
  const created = new Date(order.createdAt);
  const expires = order.downloadExpiresAt ? new Date(order.downloadExpiresAt) : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-b from-fuchsia-500/5 via-background to-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link href={store ? `/store/${store.slug}` : '/'} className="text-base font-bold tracking-tight">
            {store?.name || 'BoutShop'}
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-3 w-3" />
            Lien sécurisé
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Confirmation banner */}
        <div className="rounded-3xl border border-border/60 bg-card p-7 shadow-sm">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" strokeWidth={2.5} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight">
                Merci pour ta commande{order.customerName ? `, ${order.customerName}` : ''} !
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Commande{' '}
                <span className="font-mono font-semibold text-foreground">{order.orderNumber}</span>
                {' '}· {created.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                {' '}· {formatCurrency(order.total, order.currency)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  {order.email}
                </span>
                {expires && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-700">
                    <Clock className="h-3 w-3" />
                    Accès jusqu&apos;au {expires.toLocaleDateString('fr-FR')}
                  </span>
                )}
                {!expires && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/10 px-2.5 py-1 font-semibold text-fuchsia-700">
                    <Crown className="h-3 w-3" />
                    Accès à vie
                  </span>
                )}
                {order.paymentStatus !== 'paid' && (
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-700">
                    {order.paymentStatus === 'pending' ? 'Paiement en attente' : 'Paiement à confirmer'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="mt-8 space-y-6">
          {items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
              Aucun livrable digital pour cette commande.
            </div>
          )}

          {items.map((item, i) => (
            <ItemCard key={item.orderItemId || i} item={item} />
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Garde ce lien — tu peux y revenir à tout moment pour re-télécharger.
        </p>
      </main>
    </div>
  );
}

function ItemCard({ item }: { item: Item }) {
  const isCourse = item.digitalKind === 'course';
  const isLicense = item.digitalKind === 'license';
  const isService = item.digitalKind === 'service';
  const isMembership = item.digitalKind === 'membership';

  return (
    <section className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
      <header className="flex items-start gap-4 border-b border-border/60 bg-muted/30 p-5">
        {item.productImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={absUrl(item.productImage)}
            alt={item.name}
            className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-border/60"
          />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-card text-muted-foreground ring-1 ring-border/60">
            <FileText className="h-6 w-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight">{item.name}</h2>
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-fuchsia-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-fuchsia-700">
            {KIND_LABEL[item.digitalKind]}
          </span>
        </div>
      </header>

      <div className="space-y-5 p-5">
        {/* License key */}
        {isLicense && item.licenseKey && (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 sm:flex-row sm:items-center sm:gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500 text-white">
              <Key className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                Ta clé de licence
              </div>
              <code className="mt-1 block break-all rounded-lg bg-white px-3 py-2 font-mono text-sm font-bold text-amber-900 ring-1 ring-amber-500/30">
                {item.licenseKey}
              </code>
            </div>
            <CopyButton value={item.licenseKey} />
          </div>
        )}

        {isService && (
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-5 text-sm text-muted-foreground">
            <strong className="text-foreground">Prestation</strong> — le marchand te contactera à <span className="font-medium">{item.assets[0]?.url ? '' : 'ton email'}</span> pour planifier la livraison de ta commande.
          </div>
        )}

        {/* Course modules */}
        {isCourse && item.courseModules && item.courseModules.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Modules du cours
            </div>
            {[...item.courseModules]
              .sort((a, b) => a.order - b.order)
              .map((mod, mi) => {
                const lessons = item.assets.filter((a) => mod.lessonIds.includes(a.id));
                return (
                  <div key={mod.id} className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
                        {mi + 1}
                      </span>
                      <h3 className="text-sm font-semibold">{mod.title}</h3>
                      <span className="ml-auto text-xs text-muted-foreground">{lessons.length} leçon{lessons.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {lessons.map((a) => (
                        <AssetRow key={a.id} asset={a} compact />
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Plain assets list (download / membership / course outside any module) */}
        {!isService && (
          <div className="space-y-2">
            {item.assets
              .filter((a) =>
                !isCourse ||
                !item.courseModules ||
                item.courseModules.length === 0 ||
                !item.courseModules.some((m) => m.lessonIds.includes(a.id))
              )
              .sort((a, b) => a.order - b.order)
              .map((a) => (
                <AssetRow key={a.id} asset={a} />
              ))}
            {item.assets.length === 0 && !isLicense && !isMembership && (
              <p className="text-sm text-muted-foreground">Aucun fichier disponible pour le moment.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function AssetRow({ asset, compact = false }: { asset: Asset; compact?: boolean }) {
  const Icon = ASSET_ICON[asset.kind] || FileText;
  const url = absUrl(asset.url);
  return (
    <div
      className={`group flex items-center gap-3 rounded-xl border border-border/60 bg-card transition-all hover:border-primary/40 hover:shadow-md ${
        compact ? 'p-2.5' : 'p-3'
      }`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{asset.name}</div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="uppercase">{asset.kind}</span>
          {asset.size && <span>· {fmtBytes(asset.size)}</span>}
          {asset.mimeType && <span className="hidden sm:inline">· {asset.mimeType}</span>}
        </div>
      </div>
      {asset.kind === 'link' ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 text-xs font-semibold transition-colors hover:bg-muted"
        >
          <Link2 className="h-3.5 w-3.5" />
          Ouvrir
        </a>
      ) : (
        <a
          href={url}
          download={asset.name}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg gradient-brand px-3 text-xs font-semibold text-white shadow-md shadow-primary/25 transition-transform hover:scale-[1.02]"
        >
          <Download className="h-3.5 w-3.5" />
          Télécharger
        </a>
      )}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(value);
        }
      }}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-white px-3 text-xs font-semibold text-amber-900 shadow-sm transition-colors hover:bg-amber-100"
    >
      Copier
    </button>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
