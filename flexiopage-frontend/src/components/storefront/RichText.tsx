/**
 * Section « texte libre » — le vendeur écrit du markdown (titres, gras,
 * italique, listes, liens) qui est rendu inline sur la page d'accueil.
 * Utile pour raconter l'histoire de la marque, mettre en avant une
 * promesse, ajouter un contenu SEO au-dessus du footer, etc.
 *
 * Rendu uniquement si activée + contenu non-vide.
 */

import type { ThemeTokens } from '@/data/store-themes';
import { renderMarkdown } from '@/lib/markdown';

export interface RichTextConfig {
  enabled?: boolean;
  title?: string;
  content?: string;
  /** Alignement du bloc : gauche par défaut (SEO), centre pour manifest de marque. */
  align?: 'left' | 'center';
}

export function StorefrontRichText({ config, theme }: { config?: RichTextConfig; theme: ThemeTokens }) {
  if (!config?.enabled) return null;
  const content = (config.content || '').trim();
  if (!content) return null;

  const title = config.title?.trim();
  const align = config.align || 'left';

  return (
    <section
      className="border-t"
      style={{ borderColor: theme.border, backgroundColor: theme.background }}
    >
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        {title && (
          <h2
            className={`text-2xl font-bold tracking-tight sm:text-3xl ${align === 'center' ? 'text-center' : ''}`}
            style={{ fontFamily: theme.fontHeading, color: theme.foreground }}
          >
            {title}
          </h2>
        )}
        <article
          className={`prose-storefront ${title ? 'mt-4' : ''} ${align === 'center' ? 'text-center' : ''} text-sm leading-relaxed sm:text-base`}
          style={{ color: theme.muted, fontFamily: theme.fontBody }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
      </div>
    </section>
  );
}
