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

import { useEffect, useRef, useState } from 'react';
import { Bold, List, Image as ImageIcon, Link as LinkIcon, Link2, Loader2, Smile, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { storesApi, extractApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Limite côté backend (cf. media.controller.MAX_UPLOAD_BYTES). On signale
 *  au vendeur avant l'upload pour éviter le round-trip + 413. */
const MAX_UPLOAD_MB = 50;

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
  // Un seul input file caché qu'on reconfigure (accept) avant d'ouvrir le picker
  // selon que le vendeur clique sur "Image" ou "GIF". Plus simple et plus fiable
  // que de passer par la modal MediaPicker (qui avalait les erreurs en silence).
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** Ajuste la hauteur du textarea à son contenu (le vendeur voit tout sans scroll). */
  function autosize() {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }
  // Recalcule quand la valeur change de l'extérieur (chargement, génération IA, insertions).
  useEffect(autosize, [value]);

  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [mediaMode, setMediaMode] = useState<'image' | 'gif'>('image');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

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

  /** Téléverse des fichiers image/GIF puis les insère au curseur (collage / drop). */
  async function uploadAndInsert(files: File[]) {
    // Sépare ce qui est image (.gif inclus) du reste pour message clair.
    const images = files.filter((f) => f.type.startsWith('image/'));
    const rejected = files.filter((f) => !f.type.startsWith('image/'));
    if (rejected.length && !images.length) {
      setUploadError(`Format non supporté : ${rejected.map((f) => f.name).join(', ')}. Seules les images et GIF sont acceptés.`);
      return;
    }
    // Filtre les images trop lourdes AVANT l'upload pour éviter le 413.
    const tooBig = images.filter((f) => f.size > MAX_UPLOAD_MB * 1024 * 1024);
    const ok = images.filter((f) => f.size <= MAX_UPLOAD_MB * 1024 * 1024);
    if (tooBig.length) {
      const names = tooBig.map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} Mo)`).join(', ');
      setUploadError(`Trop volumineux : ${names}. Limite ${MAX_UPLOAD_MB} Mo par fichier.`);
      if (!ok.length) return;
    }
    setUploading(true);
    if (!tooBig.length) setUploadError('');
    try {
      for (const file of ok) {
        const res = await storesApi.uploadMedia(storeId, file);
        const url = (res.data as { media?: { url?: string } }).media?.url;
        if (url) insertImage(url);
      }
    } catch (err) {
      // Remonte le vrai message du backend (ex: "Fichier trop volumineux. Limite : 50 Mo.")
      // plutôt qu'un générique.
      setUploadError(extractApiError(err, "Échec du téléversement de l'image."));
    } finally {
      setUploading(false);
    }
  }

  /** Colle une image/GIF depuis le presse-papier (screenshot, image copiée). */
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const all = Array.from(e.clipboardData?.files || []);
    if (!all.length) return; // pas de fichier → on laisse le collage texte normal.
    e.preventDefault();
    void uploadAndInsert(all);
  }

  /** Glisser-déposer une image/GIF dans la zone de texte. */
  function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const all = Array.from(e.dataTransfer?.files || []);
    if (!all.length) return;
    e.preventDefault();
    void uploadAndInsert(all);
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

  /** Ouvre directement le file picker système — pas de modal intermédiaire.
   *  Le vendeur clique "Image" → choisit son fichier → upload → insertion. */
  function pickFile(mode: 'image' | 'gif') {
    setMediaMode(mode);
    setEmojiOpen(false);
    setUploadError('');
    const input = fileInputRef.current;
    if (!input) return;
    // Configure l'accept selon le bouton cliqué (GIF strict ou toute image).
    input.accept = mode === 'gif' ? 'image/gif,.gif' : 'image/*';
    input.value = ''; // permet de re-sélectionner le même fichier
    input.click();
  }

  /** Ouvre la modal de paste de lien (Giphy, CDN externe). */
  function openLinkModal(mode: 'image' | 'gif') {
    setMediaMode(mode);
    setEmojiOpen(false);
    setImageModalOpen(true);
  }

  function closeImageModal() {
    setImageModalOpen(false);
    setLinkUrl('');
    setUrlError('');
  }

  /** Handler du file input caché — relayé vers uploadAndInsert. */
  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    void uploadAndInsert(files);
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
        <ToolbarBtn onClick={insertLink} title="Insérer un lien">
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => pickFile('image')} title="Téléverser une image">
          {uploading && mediaMode === 'image' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )}
        </ToolbarBtn>
        <ToolbarBtn onClick={() => pickFile('gif')} title="Téléverser un GIF">
          {uploading && mediaMode === 'gif' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span className="text-[9px] font-bold leading-none tracking-tight">GIF</span>
          )}
        </ToolbarBtn>
        <ToolbarBtn onClick={() => openLinkModal(mediaMode)} title="Insérer depuis un lien (Giphy, CDN)">
          <Link2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => setEmojiOpen((v) => !v)} title="Emoji / icône" active={emojiOpen}>
          <Smile className="h-3.5 w-3.5" />
        </ToolbarBtn>

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

      {/* File input caché, partagé par les boutons Image et GIF de la toolbar. */}
      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={onFileInputChange}
      />

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => { onChange(e.target.value); autosize(); }}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        placeholder={placeholder}
        rows={rows}
        onKeyDown={(e) => {
          // Ctrl/Cmd + B → wrap with **
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            insert('**TEXT**', { wrap: true });
          }
        }}
        className="min-h-[14rem] w-full resize-y overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10 lg:min-h-[26rem]"
      />

      {uploading && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Téléversement en cours…
        </p>
      )}
      {uploadError && (
        <div className="flex items-start justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
          <span>{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError('')}
            className="shrink-0 text-rose-500 hover:text-rose-700"
            aria-label="Fermer"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Mise en forme acceptée : <code className="rounded bg-muted px-1">**gras**</code> · <code className="rounded bg-muted px-1">- listes</code> · <code className="rounded bg-muted px-1">[lien](url)</code> · <code className="rounded bg-muted px-1">![](url-image.gif)</code> pour images / GIFs · emojis 😊 via le bouton 🙂. Tu peux aussi <strong>coller</strong> (Ctrl/Cmd+V) ou glisser-déposer une image / un GIF directement.
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
              <h3 className="text-sm font-semibold">{mediaMode === 'gif' ? 'Insérer un GIF par lien' : "Insérer une image par lien"}</h3>
              <button
                type="button"
                onClick={closeImageModal}
                aria-label="Fermer"
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
              {mediaMode === 'gif' ? 'Coller un lien GIF (Giphy, Tenor…)' : "Coller un lien d'image (Unsplash, CDN…)"}
            </label>
            <div className="flex gap-2">
              <Input
                value={linkUrl}
                onChange={(e) => { setLinkUrl(e.target.value); setUrlError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertImageUrl(); } }}
                placeholder={mediaMode === 'gif' ? 'https://media.giphy.com/…/giphy.gif' : 'https://…/photo.jpg'}
                className="h-9"
                autoFocus
              />
              <Button type="button" size="sm" onClick={insertImageUrl} disabled={!linkUrl.trim()} className="h-9 shrink-0 gap-1.5">
                <Link2 className="h-3.5 w-3.5" /> Insérer
              </Button>
            </div>
            {urlError && <p className="mt-1 text-[11px] text-rose-600">{urlError}</p>}
            {mediaMode === 'gif' && (
              <p className="mt-1 text-[11px] text-muted-foreground">Astuce : sur Giphy, clic droit sur le GIF → « Copier l&apos;adresse de l&apos;image » (lien finissant par .gif).</p>
            )}

            <p className="mt-4 rounded-md bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
              💡 Pour téléverser un fichier depuis ton ordinateur, ferme cette fenêtre et utilise les boutons <strong>Image</strong> ou <strong>GIF</strong> de la barre d&apos;outils.
            </p>
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
