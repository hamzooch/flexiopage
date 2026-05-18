'use client';

/**
 * Product reviews — fetches the published reviews + the aggregated star
 * average on mount, and offers a small inline form to submit a new one.
 *
 * Client-side fetch (vs SSR) so the seller's moderation flips show up
 * without a full page rebuild. The fetch is cheap (one query indexed
 * on storeId+productId+isPublished).
 */

import { useCallback, useEffect, useState } from 'react';
import { Star, Loader2, ShieldCheck, MessageSquareQuote } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThemeTokens } from '@/data/store-themes';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

interface Review {
  _id: string;
  name: string;
  rating: number;
  title?: string;
  content: string;
  verified: boolean;
  createdAt: string;
}

interface Summary {
  avg: number;
  count: number;
}

interface Props {
  storeSlug: string;
  productSlug: string;
  theme: ThemeTokens;
}

export function ProductReviews({ storeSlug, productSlug, theme }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<Summary>({ avg: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_URL}/api/public/stores/${storeSlug}/products/${productSlug}/reviews`,
        { cache: 'no-store' }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { reviews: Review[]; summary: Summary };
      setReviews(data.reviews);
      setSummary(data.summary);
    } finally {
      setLoading(false);
    }
  }, [storeSlug, productSlug]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="mt-12">
      <div className="mb-5 flex items-center gap-3">
        <span className="inline-block h-px flex-1" style={{ backgroundColor: theme.border }} aria-hidden />
        <h2
          className="text-xl font-bold tracking-tight sm:text-2xl"
          style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
        >
          Avis clients
        </h2>
        <span className="inline-block h-px flex-1" style={{ backgroundColor: theme.border }} aria-hidden />
      </div>

      {/* Summary */}
      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
        style={{ borderColor: theme.border, backgroundColor: theme.surfaceMuted }}
      >
        <div className="flex items-center gap-3">
          <div className="text-3xl font-extrabold" style={{ color: theme.foreground }}>
            {summary.count > 0 ? summary.avg.toFixed(1) : '—'}
          </div>
          <div>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className="h-4 w-4"
                  style={{
                    color: theme.primary,
                    fill: s <= Math.round(summary.avg) ? theme.primary : 'transparent',
                  }}
                />
              ))}
            </div>
            <div className="text-[11px]" style={{ color: theme.muted }}>
              Basé sur {summary.count} avis publié{summary.count > 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ color: theme.primary }}
        >
          <MessageSquareQuote className="h-3.5 w-3.5" />
          {formOpen ? 'Fermer' : 'Laisser un avis'}
        </button>
      </div>

      {/* Form */}
      {formOpen && (
        <ReviewForm
          storeSlug={storeSlug}
          productSlug={productSlug}
          theme={theme}
          onSubmitted={() => {
            setFormOpen(false);
            void load();
          }}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="grid place-items-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.muted }} />
        </div>
      ) : reviews.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-8 text-center text-sm"
          style={{ borderColor: theme.border, color: theme.muted }}
        >
          Aucun avis pour le moment. Sois le premier à donner ton retour !
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r._id}
              className="rounded-xl border p-4"
              style={{ borderColor: theme.border, backgroundColor: theme.surface }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className="h-3.5 w-3.5"
                        style={{
                          color: theme.primary,
                          fill: s <= r.rating ? theme.primary : 'transparent',
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-semibold" style={{ color: theme.foreground }}>
                    {r.name}
                  </span>
                  {r.verified && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ backgroundColor: '#10b98115', color: '#047857' }}
                    >
                      <ShieldCheck className="h-2.5 w-2.5" />
                      Achat vérifié
                    </span>
                  )}
                </div>
                <span className="text-[11px]" style={{ color: theme.muted }}>
                  {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                </span>
              </div>
              {r.title && (
                <div className="mt-2 text-sm font-semibold" style={{ color: theme.foreground }}>
                  {r.title}
                </div>
              )}
              <p className="mt-1 text-sm leading-relaxed" style={{ color: theme.foreground }}>
                {r.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewForm({
  storeSlug,
  productSlug,
  theme,
  onSubmitted,
}: {
  storeSlug: string;
  productSlug: string;
  theme: ThemeTokens;
  onSubmitted: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim() || !content.trim()) {
      setError('Nom et avis obligatoires.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `${API_URL}/api/public/stores/${storeSlug}/products/${productSlug}/reviews`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), email: email.trim() || undefined, rating, title: title.trim() || undefined, content: content.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Envoi échoué.');
        return;
      }
      onSubmitted();
    } catch {
      setError('Impossible d\'envoyer.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mb-4 space-y-3 rounded-xl border p-4"
      style={{ borderColor: theme.border, backgroundColor: theme.surface }}
    >
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setRating(s)}
            aria-label={`${s} étoile${s > 1 ? 's' : ''}`}
            className="grid h-7 w-7 place-items-center rounded hover:bg-muted"
          >
            <Star
              className={cn('h-5 w-5 transition-colors')}
              style={{
                color: theme.primary,
                fill: s <= rating ? theme.primary : 'transparent',
              }}
            />
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ton nom *"
          className="h-10 rounded-md border px-3 text-sm"
          style={{ borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground }}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (optionnel — pour vérification d'achat)"
          className="h-10 rounded-md border px-3 text-sm"
          style={{ borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground }}
        />
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titre de ton avis (optionnel)"
        className="h-10 w-full rounded-md border px-3 text-sm"
        style={{ borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground }}
      />
      <textarea
        required
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Ton avis sur le produit *"
        rows={3}
        className="w-full rounded-md border px-3 py-2 text-sm"
        style={{ borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground }}
      />
      {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-bold disabled:opacity-60"
        style={{ backgroundColor: theme.primary, color: theme.primaryFg }}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Publier mon avis'}
      </button>
    </form>
  );
}
