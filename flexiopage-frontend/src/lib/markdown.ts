/**
 * Minimal markdown → HTML renderer for the storefront info pages
 * (Conditions, FAQ, About, etc.). Intentionally tiny — sellers edit a
 * textarea, we render a clean read-only doc.
 *
 * Supported:
 *   # / ## / ### headings
 *   blank line → paragraph break
 *   - / * lines → unordered list (consecutive items grouped)
 *   1. lines → ordered list
 *   **bold**, *italic* (single-line, no nesting)
 *   [label](url) links — relative + http(s) only, rel=noopener for http(s)
 *   --- → <hr>
 *
 * Everything else is HTML-escaped, so the seller can't accidentally
 * inject <script> tags from a paste. Trade-off: no tables, no images,
 * no nested lists — keep it simple. If we need richer content later,
 * swap this for `marked` or `react-markdown`.
 */

import { mediaUrl } from '@/lib/utils';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(line: string): string {
  let out = escapeHtml(line);
  // Bold **x**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic *x* (skip **)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // Filet de sécurité : les descriptions sauvegardées avant le fix server-side
  // contiennent des URLs avec entities HTML (`https:&#x2F;&#x2F;…`) parce que
  // le sanitizeMiddleware backend a escape les `/`. On dé-escape les entities
  // critiques uniquement (slash, esperluette, apostrophe, guillemet) avant les
  // checks d'URL et le passage à mediaUrl() — sinon `mediaUrl()` ne détecte
  // pas le `http://` préfixe et préfixe l'API base, cassant l'URL.
  const decodeUrlEntities = (u: string): string =>
    u
      .replace(/&#x2F;/gi, '/')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');

  // Helpers partagés entre la règle image et la règle lien.
  const isImageUrl = (u: string): boolean => {
    const d = decodeUrlEntities(u);
    return /\.(jpe?g|png|gif|webp|avif|svg)(\?.*)?$/i.test(d) || d.includes('/uploads/');
  };
  const renderImage = (alt: string, url: string): string => {
    const decoded = decodeUrlEntities(url);
    const safe = decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('/') ? decoded : '';
    if (!safe) return '';
    // Les uploads sont stockés en chemin relatif "/uploads/..." qui pointe vers
    // le serveur API, PAS le domaine du storefront → on les résout via mediaUrl()
    // avant injection sinon le navigateur essaie de les charger depuis le
    // storefront (404).
    const resolved = mediaUrl(safe) || safe;
    return `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt || '')}" loading="lazy" />`;
  };

  // Images / GIFs syntaxe explicite ![alt](url) — doit tourner AVANT la règle
  // [label](url) car la syntaxe en est un sur-ensemble.
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, url: string) => renderImage(alt, url));

  // Filet de sécurité : si le vendeur a tapé [](url-image) (sans le `!`) ou
  // [texte](url-image), on rend quand même comme une image quand l'URL ressemble
  // clairement à un fichier image. Évite que la photo apparaisse en texte brut
  // ou en lien quand le `!` a sauté à l'édition. Étiquette tolérée vide ici.
  out = out.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    if (isImageUrl(url)) return renderImage(label, url);
    // Lien classique — étiquette doit avoir au moins un caractère utile,
    // sinon on laisse passer (sera traité comme texte brut).
    if (!label.trim()) return _match;
    const safe = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url.startsWith('#') ? url : `#`;
    const external = safe.startsWith('http');
    const attrs = external ? ` target="_blank" rel="noopener noreferrer"` : '';
    return `<a href="${escapeHtml(safe)}"${attrs}>${label}</a>`;
  });
  return out;
}

export function renderMarkdown(input: string): string {
  if (!input) return '';
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let inUl = false;
  let inOl = false;
  let paragraph: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    html.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
    paragraph = [];
  }
  function closeLists() {
    if (inUl) { html.push('</ul>'); inUl = false; }
    if (inOl) { html.push('</ol>'); inOl = false; }
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      closeLists();
      continue;
    }
    // Headings
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph(); closeLists();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    // Horizontal rule
    if (/^-{3,}$/.test(line.trim())) {
      flushParagraph(); closeLists();
      html.push('<hr>');
      continue;
    }
    // Unordered list
    const ul = /^[-*]\s+(.+)$/.exec(line);
    if (ul) {
      flushParagraph();
      if (inOl) { html.push('</ol>'); inOl = false; }
      if (!inUl) { html.push('<ul>'); inUl = true; }
      html.push(`<li>${renderInline(ul[1])}</li>`);
      continue;
    }
    // Ordered list
    const ol = /^\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      flushParagraph();
      if (inUl) { html.push('</ul>'); inUl = false; }
      if (!inOl) { html.push('<ol>'); inOl = true; }
      html.push(`<li>${renderInline(ol[1])}</li>`);
      continue;
    }
    // Default: accumulate paragraph
    closeLists();
    paragraph.push(line);
  }
  flushParagraph();
  closeLists();
  return html.join('\n');
}
