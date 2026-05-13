'use client';

/**
 * Shared shell for every /dashboard/stores/[storeId]/* sub-page :
 * - back link → hub
 * - title + description in a Card
 * - sticky bottom-right Save button bound to the page-level save handler
 * - inline status pill next to the Save button ("saved!" / error msg)
 *
 * Each sub-page renders its own fields between <StoreSubPageShell> and
 * passes its own onSave (so each page only updates what it cares about).
 */

import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  storeId: string;
  storeName: string;
  title: string;
  description?: string;
  /** Visual state for the Save button + inline status pill. */
  status?: SaveStatus;
  /** Error text rendered next to the Save button when status='error'. */
  errorMessage?: string;
  /** Bound submit handler — wraps the form. */
  onSave: () => void | Promise<void>;
  /** Optional extra button on the right of "Save". */
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}

export function StoreSubPageShell({
  storeId,
  storeName,
  title,
  description,
  status = 'idle',
  errorMessage,
  onSave,
  rightSlot,
  children,
}: Props) {
  const saving = status === 'saving';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave();
      }}
      className="space-y-6 pb-24"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/stores/${storeId}`}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {storeName}
          </Link>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>

      <div className="space-y-6">{children}</div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3 px-4 py-3 sm:px-6">
          {/* Inline status pill */}
          {status === 'saved' && (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 animate-fade-in"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Enregistré
            </span>
          )}
          {status === 'error' && (
            <span
              role="alert"
              className="inline-flex max-w-[60ch] items-center gap-1.5 truncate rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive"
              title={errorMessage}
            >
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              {errorMessage || 'Erreur'}
            </span>
          )}
          {rightSlot}
          <Button
            type="submit"
            disabled={saving}
            className={cn('gap-1.5 gradient-brand text-white', saving && 'opacity-70')}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </form>
  );
}
