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
import {
  Bold, Italic, Eye, List, Image as ImageIcon, Link as LinkIcon, Link2, Loader2,
  Pencil, Smile, X, Heading2, Heading3, AlignLeft, AlignCenter, AlignRight,
  Minus, Quote, LayoutTemplate, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { storesApi, extractApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { renderMarkdown } from '@/lib/markdown';

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

/**
 * Templates de blocs prêts à l'emploi — insèrent une section markdown
 * complète que le vendeur personnalise ensuite. Objectif : plus jamais
 * la page blanche ; le vendeur remplace les crochets [...] par ses
 * infos réelles. Chaque template est autonome (titres, listes, callouts
 * intégrés) pour un rendu propre dès la 1ʳᵉ édition.
 */
interface DescriptionTemplate {
  id: string;
  label: string;
  emoji: string;
  hint: string;
  content: string;
}

const TEMPLATES: DescriptionTemplate[] = [
  {
    id: 'box-contents',
    label: 'Ce que vous recevez',
    emoji: '📦',
    hint: 'Liste du contenu du colis',
    content: `## 📦 Ce que vous recevez

- 1 × [Nom du produit]
- 1 × [Accessoire inclus]
- 1 × Manuel d'utilisation
- 1 × Emballage cadeau offert
`,
  },
  {
    id: 'features',
    label: 'Caractéristiques',
    emoji: '⭐',
    hint: 'Points clés du produit',
    content: `## ⭐ Caractéristiques principales

- **[Point fort 1]** — [description courte du bénéfice pour le client]
- **[Point fort 2]** — [description courte du bénéfice pour le client]
- **[Point fort 3]** — [description courte du bénéfice pour le client]
- **[Point fort 4]** — [description courte du bénéfice pour le client]
`,
  },
  {
    id: 'shipping',
    label: 'Livraison & retour',
    emoji: '🚚',
    hint: 'Encadré infos logistique',
    content: `## 🚚 Livraison & retour

> ✨ **Livraison sous 48h** partout au Sénégal · **Paiement à la livraison** accepté · **Retour gratuit sous 14 jours** si le produit ne te convient pas.
`,
  },
  {
    id: 'faq',
    label: 'Questions fréquentes',
    emoji: '❓',
    hint: 'Bloc FAQ scaffold',
    content: `## ❓ Questions fréquentes

**[Ta 1ʳᵉ question fréquente ?]**
[Ta réponse claire et rassurante.]

**[Ta 2ᵉ question ?]**
[Ta réponse.]

**[Ta 3ᵉ question ?]**
[Ta réponse.]
`,
  },
  {
    id: 'guarantee',
    label: 'Garantie qualité',
    emoji: '🛡️',
    hint: 'Callout de confiance',
    content: `## 🛡️ Notre engagement qualité

> 🎯 **Satisfait ou remboursé sous 14 jours.**
> Chaque pièce est contrôlée à la main avant expédition. Si le produit ne te convient pas, on le reprend sans discuter — remboursement intégral, zéro question.
`,
  },
  {
    id: 'reviews',
    label: 'Avis clients',
    emoji: '💬',
    hint: '3 témoignages scaffold',
    content: `## 💬 Ce que nos clients disent

> ⭐⭐⭐⭐⭐ « [Extrait du témoignage — bénéfice concret ressenti par le client]. »
> — [Prénom N.], [Ville]

> ⭐⭐⭐⭐⭐ « [Autre témoignage — mise en avant d'un point différent : livraison, qualité, service]. »
> — [Prénom N.], [Ville]

> ⭐⭐⭐⭐⭐ « [3ᵉ témoignage — insiste sur la recommandation ou le rachat]. »
> — [Prénom N.], [Ville]
`,
  },
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

  /**
   * Ajuste la hauteur du textarea à son contenu, mais cape à ~60 % du viewport.
   * Au-delà, le scroll interne prend le relais : le vendeur n'a plus à
   * scroller toute la page pour passer en bas d'une description longue.
   */
  function autosize() {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxHeight = typeof window === 'undefined' ? 600 : Math.round(window.innerHeight * 0.6);
    const desired = Math.min(ta.scrollHeight, maxHeight);
    ta.style.height = `${desired}px`;
    // Quand on dépasse le cap, on doit autoriser le scroll interne ;
    // sinon on garde overflow-hidden (le textarea s'auto-ajuste).
    ta.style.overflowY = ta.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }
  // Recalcule quand la valeur change de l'extérieur (chargement, génération IA, insertions).
  useEffect(autosize, [value]);

  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [mediaMode, setMediaMode] = useState<'image' | 'gif'>('image');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  // Onglet actif : édition (textarea) vs aperçu (rendu HTML identique au public).
  const [view, setView] = useState<'edit' | 'preview'>('edit');

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

  /**
   * Ajoute un préfixe (`## `, `> `, etc.) au début de la ligne courante
   * (ou de chaque ligne sélectionnée si sélection multi-ligne). Idempotent :
   * ré-cliquer supprime le préfixe. Utile pour les titres et les callouts.
   */
  function togglePrefix(prefix: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? start;
    // Étend au début et fin de ligne(s).
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const nlAfter = value.indexOf('\n', end);
    const lineEnd = nlAfter === -1 ? value.length : nlAfter;
    const selected = value.slice(lineStart, lineEnd);
    const lines = selected.split('\n');
    // Si TOUTES les lignes commencent déjà par le préfixe, on le retire ;
    // sinon on l'ajoute à toutes (comportement toggle familier des IDEs).
    const allPrefixed = lines.every((l) => l.startsWith(prefix));
    const transformed = lines
      .map((l) => (allPrefixed ? l.slice(prefix.length) : `${prefix}${l}`))
      .join('\n');
    const next = value.slice(0, lineStart) + transformed + value.slice(lineEnd);
    onChange(next);
    window.setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
        const delta = transformed.length - selected.length;
        ref.current.setSelectionRange(lineStart, end + delta);
      }
    }, 0);
  }

  /**
   * Wrappe la sélection (ou insère un placeholder) dans un fence
   * `:::align\n…\n:::`. Sur sélection vide, ajoute juste les fences avec
   * le curseur au milieu prêt à taper.
   */
  function wrapAlign(align: 'center' | 'right' | 'left') {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? start;
    const selected = value.slice(start, end) || 'Ton texte ici';
    const block = `\n:::${align}\n${selected}\n:::\n`;
    const next = value.slice(0, start) + block + value.slice(end);
    onChange(next);
    window.setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
        // Curseur positionné sur le texte inséré pour édition immédiate.
        const innerStart = start + `\n:::${align}\n`.length;
        ref.current.setSelectionRange(innerStart, innerStart + selected.length);
      }
    }, 0);
  }

  /** Insère un template markdown complet au curseur, précédé/suivi de sauts
   *  pour ne pas coller au texte existant. Ferme le dropdown après. */
  function insertTemplate(template: DescriptionTemplate) {
    // 2 sauts de ligne devant si on n'est pas déjà en début de doc.
    const prefix = value.trim() ? '\n\n' : '';
    insert(prefix + template.content.trim() + '\n\n');
    setTemplatesOpen(false);
    // Bascule sur l'aperçu pour que le vendeur voie tout de suite le rendu
    // du bloc qu'il vient d'insérer (comme pour les images).
    setView('preview');
  }

  function insertImage(url: string) {
    // Markdown image syntax — renderMarkdown turns this into a responsive
    // <img loading="lazy" /> on the storefront. Add surrounding newlines
    // so the image sits on its own block, not glued to the previous text.
    insert(`\n\n![](${url})\n\n`);
    closeImageModal();
    // Le vendeur non-technique ne reconnait pas le markdown `![](...)` dans
    // le textarea — il croit que rien ne s'est passé. Bascule auto sur
    // l'Aperçu pour qu'il voie son image rendue immédiatement et comprenne
    // qu'elle est bien intégrée. Il peut repasser sur Édition pour continuer.
    setView('preview');
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

  /** Extrait toutes les URLs d'image du markdown (avec ou sans `!`) pour le
   *  panneau diagnostic. On accepte ![](url), [](url-image) et liens vers
   *  /uploads/* — comme le renderMarkdown. */
  function extractImageUrls(src: string): string[] {
    const urls: string[] = [];
    const re = /!?\[([^\]]*)\]\(([^)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const url = m[2];
      const looksLikeImage = /\.(jpe?g|png|gif|webp|avif|svg)(\?.*)?$/i.test(url) || url.includes('/uploads/');
      if (m[0].startsWith('!') || looksLikeImage) urls.push(url);
    }
    return urls;
  }

  /** Résout une URL relative en URL absolue API (même logique que mediaUrl).
   *  Inline ici parce qu'on en a besoin dans le rendu, pas besoin d'importer. */
  function resolveImageUrl(url: string): string {
    if (/^https?:\/\//.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000').replace(/\/$/, '');
    return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  return (
    <div className="space-y-2">
      {/* Onglets Édition / Aperçu — l'aperçu rend exactement comme la vitrine. */}
      <div className="flex gap-1 rounded-md border border-border/60 bg-muted/30 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setView('edit')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 transition-colors',
            view === 'edit' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Pencil className="h-3.5 w-3.5" /> Édition
        </button>
        <button
          type="button"
          onClick={() => setView('preview')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 transition-colors',
            view === 'preview' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Eye className="h-3.5 w-3.5" /> Aperçu
        </button>
      </div>

      {view === 'preview' ? (
        <div className="min-h-[14rem] rounded-md border border-border/60 bg-background p-4 lg:min-h-[26rem]">
          {value.trim() ? (
            <div
              className="prose-storefront text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">L&apos;aperçu apparaîtra ici quand tu auras écrit quelque chose.</p>
          )}

          {/* Diagnostic : liste chaque image détectée + son URL résolue + statut
              de chargement. Permet au vendeur de voir si c'est un 404 ou si
              le markdown n'est tout simplement pas reconnu. */}
          {value.trim() && (() => {
            const urls = extractImageUrls(value);
            if (urls.length === 0) {
              return (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                  ⚠️ Aucune image détectée dans la description. Vérifie que tu as bien cliqué sur l&apos;icône 🖼️ Image (pas le lien 🔗) pour téléverser.
                </div>
              );
            }
            return (
              <div className="mt-4 rounded-md border border-border/60 bg-muted/30 p-3">
                <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                  🔍 Images détectées dans la description ({urls.length})
                </p>
                <ul className="space-y-2">
                  {urls.map((u, i) => {
                    const resolved = resolveImageUrl(u);
                    return (
                      <li key={i} className="flex items-center gap-2 rounded-md bg-card p-2 text-[11px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolved}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded border border-border/60 object-cover"
                          onError={(e) => {
                            e.currentTarget.style.opacity = '0.3';
                            e.currentTarget.title = 'Échec de chargement (404 ou CORS)';
                          }}
                        />
                        <div className="flex-1 truncate font-mono text-[10px] text-muted-foreground">
                          <div className="truncate">Markdown: {u}</div>
                          <div className="truncate">
                            URL: <a href={resolved} target="_blank" rel="noopener noreferrer" className="text-primary underline">{resolved}</a>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Si une miniature apparaît grisée, le serveur ne sert pas l&apos;image (clique l&apos;URL pour voir l&apos;erreur exacte).
                </p>
              </div>
            );
          })()}

          <p className="mt-4 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
            👁️ Voici exactement ce que les clients verront sur la page produit publique.
          </p>
        </div>
      ) : (
      <>
      {/* Toolbar — groupée : Structure · Format · Alignement · Média · Templates.
          Séparateurs visuels entre groupes pour aider le vendeur à trouver
          rapidement le bouton qu'il cherche. Sur mobile ça wrap naturellement. */}
      <div className="relative flex flex-wrap items-center gap-1.5">
        {/* Groupe Structure — titres + diviseur */}
        <ToolbarBtn onClick={() => togglePrefix('## ')} title="Titre principal (H2)">
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => togglePrefix('### ')} title="Sous-titre (H3)">
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => insert('\n\n---\n\n')} title="Trait de séparation">
          <Minus className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <ToolbarSeparator />

        {/* Groupe Format — gras, italique, liste, lien, callout */}
        <ToolbarBtn onClick={() => insert('**TEXT**', { wrap: true })} title="Gras (Ctrl+B)">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => insert('*TEXT*', { wrap: true })} title="Italique (Ctrl+I)">
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => insert('\n- ')} title="Liste à puces">
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={insertLink} title="Insérer un lien">
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => togglePrefix('> ')} title="Encadré / callout (attire l'œil)">
          <Quote className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <ToolbarSeparator />

        {/* Groupe Alignement — gauche / centre / droite via fences ::: */}
        <ToolbarBtn onClick={() => wrapAlign('left')} title="Aligner à gauche">
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => wrapAlign('center')} title="Centrer">
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => wrapAlign('right')} title="Aligner à droite">
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <ToolbarSeparator />

        {/* Groupe Média — image, GIF, lien média, emoji */}
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
        <ToolbarBtn onClick={() => { setEmojiOpen((v) => !v); setTemplatesOpen(false); }} title="Emoji / icône" active={emojiOpen}>
          <Smile className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <ToolbarSeparator />

        {/* Groupe Templates — blocs prêts à personnaliser */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setTemplatesOpen((v) => !v); setEmojiOpen(false); }}
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md border border-border/60 bg-gradient-to-br from-primary/10 to-fuchsia-500/10 px-2 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/40',
            templatesOpen && 'border-primary/40 bg-primary/10',
          )}
          title="Insérer un bloc prêt à l'emploi"
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Insérer un bloc</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>

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

        {templatesOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setTemplatesOpen(false)} />
            <div className="absolute right-0 top-9 z-50 w-[300px] rounded-xl border border-border/60 bg-card p-1.5 shadow-xl sm:right-auto sm:left-0">
              <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Blocs prêts à personnaliser
              </div>
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => insertTemplate(tpl)}
                  className="flex w-full items-start gap-2.5 rounded-md p-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-base">
                    {tpl.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-foreground">{tpl.label}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{tpl.hint}</div>
                  </div>
                </button>
              ))}
              <div className="mt-1 border-t border-border/50 px-2 pb-1 pt-2 text-[10px] text-muted-foreground">
                💡 Le bloc s&apos;insère au curseur — remplace les <code>[...]</code> par tes vraies infos.
              </div>
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
            return;
          }
          // Ctrl/Cmd + I → wrap with *italic*
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            insert('*TEXT*', { wrap: true });
            return;
          }
        }}
        className="min-h-[14rem] w-full max-h-[60vh] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10 lg:min-h-[26rem]"
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
        Mise en forme : <code className="rounded bg-muted px-1">## Titre</code> · <code className="rounded bg-muted px-1">**gras**</code> · <code className="rounded bg-muted px-1">- listes</code> · <code className="rounded bg-muted px-1">&gt; encadré</code> · <code className="rounded bg-muted px-1">:::center</code> pour centrer · <code className="rounded bg-muted px-1">---</code> diviseur · <code className="rounded bg-muted px-1">![](url)</code> images / GIFs. Coller (Ctrl/Cmd+V) ou glisser-déposer une image marche aussi. Bascule sur <strong>Aperçu</strong> pour voir le rendu.
      </p>
      </>
      )}

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

/** Trait de séparation vertical entre groupes de boutons de la toolbar.
 *  Purement visuel — n'a aucune sémantique. */
function ToolbarSeparator() {
  return <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-border/60" />;
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
      // `onMouseDown` preventDefault empêche le textarea de perdre le focus
      // au clic — sinon, sur certains navigateurs, la sélection en cours
      // (le texte que le vendeur veut mettre en gras) se collapse avant
      // que `insert()` lise selectionStart/selectionEnd, et le wrap se fait
      // sur une sélection vide → `****` au lieu de `**texte**`.
      onMouseDown={(e) => e.preventDefault()}
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
