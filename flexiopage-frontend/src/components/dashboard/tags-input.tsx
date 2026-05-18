'use client';

/**
 * Chip-style tag input. Each tag is normalized (trimmed + lowercased)
 * before being added so auto-collection rules match consistently
 * regardless of how the seller typed the same tag twice.
 *
 * Submission triggers: Enter, comma, or blur. Backspace on empty input
 * pops the last tag — same UX as Shopify's tag field.
 */

import { useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Optional suggested tags shown as quick-add chips below the input. */
  suggestions?: string[];
  /** Cap to avoid runaway tag pollution. */
  max?: number;
  className?: string;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function TagsInput({
  value,
  onChange,
  placeholder = 'Ajouter un tag…',
  suggestions = [],
  max = 50,
  className,
}: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  function addRaw(raw: string) {
    const t = normalize(raw);
    if (!t) return;
    if (value.includes(t)) return;
    if (value.length >= max) return;
    onChange([...value, t]);
  }

  function commitDraft() {
    if (!draft.trim()) return;
    addRaw(draft);
    setDraft('');
  }

  function removeAt(i: number) {
    const next = value.slice();
    next.splice(i, 1);
    onChange(next);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      // Empty draft + backspace → pop the last tag, matches Shopify UX.
      e.preventDefault();
      removeAt(value.length - 1);
    }
  }

  const remainingSuggestions = suggestions.filter((s) => !value.includes(normalize(s)));

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-2 transition-colors focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, i) => (
          <span
            key={tag + i}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeAt(i); }}
              aria-label={`Retirer ${tag}`}
              className="grid h-4 w-4 place-items-center rounded-full text-primary/70 transition-colors hover:bg-primary/20 hover:text-primary"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commitDraft}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-[8ch] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* Quick-add suggestions — clicking one drops it straight into the value */}
      {remainingSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Suggestions :</span>
          {remainingSuggestions.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addRaw(s)}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Plus className="h-2.5 w-2.5" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
