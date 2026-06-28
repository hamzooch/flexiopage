/**
 * Section vidéo gérée par le vendeur : un lien (YouTube / Vimeo / fichier
 * .mp4) affiché dans un cadre, avec un titre + un paragraphe à côté.
 * Disponible sur tous les thèmes. Rendu seulement si activée ET un lien posé.
 */
import type { ThemeTokens } from '@/data/store-themes';
import { RADIUS_PX } from '@/data/store-themes';

export interface VideoConfig {
  enabled?: boolean;
  url?: string;
  title?: string;
  text?: string;
}

/** Normalise un lien vidéo en source embeddable (iframe) ou fichier direct. */
function toEmbed(url?: string): { kind: 'iframe' | 'file'; src: string } | null {
  const u = (url || '').trim();
  if (!u) return null;
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { kind: 'iframe', src: `https://www.youtube.com/embed/${yt[1]}` };
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vm[1]}` };
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(u)) return { kind: 'file', src: u };
  // Fallback : on tente un embed direct (autre plateforme fournissant une URL iframe).
  return { kind: 'iframe', src: u };
}

export function StorefrontVideo({ config, theme }: { config?: VideoConfig; theme: ThemeTokens }) {
  if (!config?.enabled) return null;
  const embed = toEmbed(config.url);
  if (!embed) return null;

  const radius = RADIUS_PX[theme.borderRadius] ?? '12px';
  const title = config.title?.trim() || 'Notre histoire';
  const text = config.text?.trim() || '';

  return (
    <section className="border-t" style={{ borderColor: theme.border, backgroundColor: theme.background }}>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid items-center gap-8 lg:grid-cols-[1.6fr_1fr]">
          {/* Carreau vidéo */}
          <div
            className="relative aspect-video w-full overflow-hidden"
            style={{ borderRadius: radius, backgroundColor: theme.surfaceMuted, border: `1px solid ${theme.border}` }}
          >
            {embed.kind === 'file' ? (
              <video src={embed.src} controls playsInline className="h-full w-full object-cover" />
            ) : (
              <iframe
                src={embed.src}
                title={title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
                style={{ border: 0 }}
              />
            )}
          </div>
          {/* Paragraphe à côté */}
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl" style={{ fontFamily: theme.fontHeading, color: theme.foreground }}>
              {title}
            </h2>
            {text && (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed sm:text-base" style={{ color: theme.muted }}>
                {text}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
