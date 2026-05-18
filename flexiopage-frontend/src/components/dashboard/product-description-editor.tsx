'use client';

/**
 * Description editor with a tiny markdown toolbar — the seller can paste
 * text + click "Insérer un GIF / image" to upload (via the shared
 * MediaPicker modal) and the URL gets injected as `![](url)` at the
 * current caret position. Also exposes quick buttons for bold + bullet
 * list so non-markdown users get the affordance.
 *
 * Storefront product page renders this with `renderMarkdown`, so anything
 * accepted here (text, **bold**, - bullets, [links](url), ![images](url))
 * shows up correctly on the public page.
 */

import { useRef, useState } from 'react';
import { Bold, List, Image as ImageIcon, Link as LinkIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MediaPicker } from '@/components/dashboard/MediaPicker';
import { cn } from '@/lib/utils';

interface Props {
  storeId: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Default 8 rows on mobile; the textarea grows naturally. */
  rows?: number;
}

export function ProductDescriptionEditor({ storeId, value, onChange, placeholder, rows = 8 }: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);

  /** Inject text at the current caret, preserving the selection if any. */
  function insert(snippet: string, opts?: { wrap?: boolean }) {
    const ta = ref.current;
    if (!ta) {
      onChange((value || '') + snippet);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? start;
    const selected = value.slice(start, end);
    let inserted: string;
    let nextCaret: number;
    if (opts?.wrap) {
      // Wrap selected text (used for **bold**). When nothing selected,
      // drop the markers and place the caret between them.
      if (selected) {
        inserted = snippet.replace('TEXT', selected);
        nextCaret = start + inserted.length;
      } else {
        inserted = snippet.replace('TEXT', '');
        nextCaret = start + snippet.indexOf('TEXT');
      }
    } else {
      inserted = snippet;
      nextCaret = start + snippet.length;
    }
    const next = value.slice(0, start) + inserted + value.slice(end);
    onChange(next);
    // Restore caret on the next tick once React has updated the DOM.
    window.setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
        ref.current.setSelectionRange(nextCaret, nextCaret);
      }
    }, 0);
  }

  function insertImage(url: string) {
    // Markdown image syntax — renderMarkdown turns this into a responsive
    // <img loading="lazy" /> on the storefront. Add surrounding newlines
    // so the image sits on its own block, not glued to the previous text.
    insert(`\n\n![](${url})\n\n`);
    setImageModalOpen(false);
  }

  function insertLink() {
    insert('[TEXT](https://)', { wrap: true });
  }

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolbarBtn onClick={() => insert('**TEXT**', { wrap: true })} title="Gras (Ctrl+B)">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => insert('\n- ')} title="Liste à puces">
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={insertLink} title="Lien">
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <div className="ml-auto" />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setImageModalOpen(true)}
          className="h-8 gap-1.5 px-2.5 text-xs"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Insérer une image / GIF
        </Button>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        onKeyDown={(e) => {
          // Ctrl/Cmd + B → wrap with **
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            insert('**TEXT**', { wrap: true });
          }
        }}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
      />

      <p className="text-[11px] text-muted-foreground">
        Mise en forme acceptée : <code className="rounded bg-muted px-1">**gras**</code> · <code className="rounded bg-muted px-1">- listes</code> · <code className="rounded bg-muted px-1">[lien](url)</code> · <code className="rounded bg-muted px-1">![](url-image.gif)</code> pour images / GIFs.
      </p>

      {imageModalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setImageModalOpen(false)}
        >
          <div
            className={cn('w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Insérer une image ou un GIF</h3>
              <button
                type="button"
                onClick={() => setImageModalOpen(false)}
                aria-label="Fermer"
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Téléverse un fichier ou choisis dans ta galerie. Une fois sélectionné, il sera inséré dans la description au curseur.
            </p>
            <MediaPicker
              storeId={storeId}
              value=""
              onChange={(url) => url && insertImage(url)}
              label=""
              shape="square"
              helper="Formats supportés : PNG, JPG, WebP, GIF animé."
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="grid h-8 w-8 place-items-center rounded-md border border-border/60 bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      {children}
    </button>
  );
}
