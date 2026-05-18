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
  // Images / GIFs ![alt](url) — must run BEFORE the [label](url) link rule
  // since the syntax is a superset. URL is validated to http(s):// or a
  // store-relative path so a malicious description can't embed a
  // javascript: pseudo-URL. Lazy-loaded so the page text renders fast.
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, url: string) => {
    const safe = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') ? url : '';
    if (!safe) return '';
    return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(alt || '')}" loading="lazy" />`;
  });
  // Links [label](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
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
