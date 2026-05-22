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
import { Bold, List, Image as ImageIcon, Link as LinkIcon, Link2, Smile, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MediaPicker } from '@/components/dashboard/MediaPicker';
import { cn } from '@/lib/utils';

/** Emojis/icônes courants pour enrichir une description produit. */
const EMOJIS = [
  '✅', '⭐', '🔥', '🎉', '💯', '👍', '❤️', '😍', '🥰', '😊',
  '🙏', '✨', '🎁', '🚚', '📦', '💰', '🛍️', '⏰', '⚡', '🆕',
  '💪', '👌', '🤩', '😎', '🌟', '💥', '🎯', '📢', '➡️', '✔️',
  '❌', '🔝', '🏆', '💎', '🌈', '☀️', '📞', '💬', '📲', '👇',
];

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
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [urlError, setUrlError] = useState('');

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
    closeImageModal();
  }

  /** Insère une image / GIF à partir d'un lien collé (Giphy, CDN, etc.). */
  function insertImageUrl() {
    const url = linkUrl.trim();
    // Même validation que renderMarkdown : seuls http(s) ou chemin relatif.
    if (!/^https?:\/\/.+/i.test(url) && !url.startsWith('/')) {
      setUrlError('Lien invalide. Colle une URL commençant par https://');
      return;
    }
    insertImage(url);
  }

  function closeImageModal() {
    setImageModalOpen(false);
    setLinkUrl('');
    setUrlError('');
  }

  function insertLink() {
    insert('[TEXT](https://)', { wrap: true });
  }

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="relative flex flex-wrap items-center gap-1.5">
        <ToolbarBtn onClick={() => insert('**TEXT**', { wrap: true })} title="Gras (Ctrl+B)">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => insert('\n- ')} title="Liste à puces">
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={insertLink} title="Lien">
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => setEmojiOpen((v) => !v)} title="Emoji / icône" active={emojiOpen}>
          <Smile className="h-3.5 w-3.5" />
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

        {emojiOpen && (
          <>
            {/* Click-away */}
            <div className="fixed inset-0 z-40" onClick={() => setEmojiOpen(false)} />
            <div className="absolute left-0 top-9 z-50 grid w-[268px] grid-cols-8 gap-0.5 rounded-xl border border-border/60 bg-card p-2 shadow-xl">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => { insert(e); setEmojiOpen(false); }}
                  className="grid h-8 w-8 place-items-center rounded-md text-lg hover:bg-muted"
                  aria-label={`Insérer ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </>
        )}
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
        className="min-h-[10rem] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10 lg:min-h-[22rem]"
      />

      <p className="text-[11px] text-muted-foreground">
        Mise en forme acceptée : <code className="rounded bg-muted px-1">**gras**</code> · <code className="rounded bg-muted px-1">- listes</code> · <code className="rounded bg-muted px-1">[lien](url)</code> · <code className="rounded bg-muted px-1">![](url-image.gif)</code> pour images / GIFs · emojis 😊 via le bouton 🙂.
      </p>

      {imageModalOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={closeImageModal}
        >
          <div
            className={cn('w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Insérer une image ou un GIF</h3>
              <button
                type="button"
                onClick={closeImageModal}
                aria-label="Fermer"
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Option 1 : coller un lien (Giphy, CDN, etc.) */}
            <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">Coller un lien (image / GIF)</label>
            <div className="flex gap-2">
              <Input
                value={linkUrl}
                onChange={(e) => { setLinkUrl(e.target.value); setUrlError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertImageUrl(); } }}
                placeholder="https://media.giphy.com/…/image.gif"
                className="h-9"
              />
              <Button type="button" size="sm" onClick={insertImageUrl} disabled={!linkUrl.trim()} className="h-9 shrink-0 gap-1.5">
                <Link2 className="h-3.5 w-3.5" /> Insérer
              </Button>
            </div>
            {urlError && <p className="mt-1 text-[11px] text-rose-600">{urlError}</p>}

            <div className="my-4 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> ou téléverser <span className="h-px flex-1 bg-border" />
            </div>

            {/* Option 2 : upload / galerie */}
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
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-md border border-border/60 bg-card text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground',
        active && 'border-primary/40 bg-primary/5 text-foreground',
      )}
    >
      {children}
    </button>
  );
}
