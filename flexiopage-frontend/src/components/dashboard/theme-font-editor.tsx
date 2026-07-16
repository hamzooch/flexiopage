'use client';

/**
 * Font-pair picker for the seller's theme. Sits alongside the palette
 * editor on the Apparence page. Each card previews the heading + body
 * combo — clicking one overrides `fontHeading` + `fontBody` on the
 * theme tokens. The rest of the theme (colors, layout, radius) is
 * untouched, so this is safely additive to a palette customization.
 */
import { useEffect, useMemo } from 'react';
import {
  FONT_PAIRS,
  findFontPair,
  getThemeById,
  googleFontsHref,
  type FontPair,
  type ThemeTokens,
} from '@/data/store-themes';
import { Button } from '@/components/ui/button';
import { Check, RotateCcw } from 'lucide-react';

/**
 * URL Google Fonts couvrant toutes les paires du picker — injectée une
 * seule fois dans <head> quand le composant est monté, pour que les cartes
 * prévisualisent la vraie police (sinon tout tombe sur le fallback Inter
 * chargé au niveau du root layout).
 */
const PICKER_FONTS_HREF: string | null = (() => {
  // On construit un pseudo-token contenant TOUTES les familles des paires
  // pour laisser googleFontsHref matcher chacune via son regex.
  const combinedHeading = FONT_PAIRS.map((p) => p.heading).join(' ');
  const combinedBody = FONT_PAIRS.map((p) => p.body).join(' ');
  return googleFontsHref({
    fontHeading: combinedHeading,
    fontBody: combinedBody,
  } as ThemeTokens);
})();

interface Props {
  theme: ThemeTokens;
  onChange: (next: ThemeTokens) => void;
}

export function ThemeFontEditor({ theme, onChange }: Props) {
  const baseTemplate = getThemeById(theme.templateId);
  const selected = useMemo(
    () => findFontPair(theme.fontHeading, theme.fontBody),
    [theme.fontHeading, theme.fontBody]
  );

  // Charge les Google Fonts du picker une seule fois par visite. On garde
  // une petite marque sur le <link> injecté pour ne pas dupliquer si le
  // composant est monté/démonté plusieurs fois dans la même session.
  useEffect(() => {
    if (!PICKER_FONTS_HREF || typeof document === 'undefined') return;
    const marker = 'data-flexiopage-font-picker';
    if (document.head.querySelector(`link[${marker}]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = PICKER_FONTS_HREF;
    link.setAttribute(marker, '1');
    document.head.appendChild(link);
  }, []);

  function pick(pair: FontPair) {
    onChange({ ...theme, fontHeading: pair.heading, fontBody: pair.body });
  }

  function reset() {
    if (!baseTemplate) return;
    onChange({
      ...theme,
      fontHeading: baseTemplate.theme.fontHeading,
      fontBody: baseTemplate.theme.fontBody,
    });
  }

  const isCustomized =
    baseTemplate != null &&
    (theme.fontHeading !== baseTemplate.theme.fontHeading ||
      theme.fontBody !== baseTemplate.theme.fontBody);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Choisis un couple d&apos;écritures — la première est appliquée aux titres,
          la seconde au texte courant.
        </p>
        {isCustomized && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reset}
            className="h-8 shrink-0 gap-1.5 rounded-lg"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Réinitialiser
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FONT_PAIRS.map((pair) => {
          const isActive = selected?.id === pair.id;
          return (
            <button
              key={pair.id}
              type="button"
              onClick={() => pick(pair)}
              aria-pressed={isActive}
              className={
                'group relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-all ' +
                (isActive
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/40'
                  : 'border-border/60 bg-muted/20 hover:border-border hover:bg-muted/40')
              }
            >
              {isActive && (
                <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
              <div className="flex items-baseline gap-2">
                <span
                  className="text-3xl font-bold leading-none"
                  style={{ fontFamily: pair.heading }}
                >
                  {pair.sample}
                </span>
                <span
                  className="text-lg leading-none text-muted-foreground"
                  style={{ fontFamily: pair.body }}
                >
                  {pair.sample.toLowerCase()}
                </span>
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{pair.label}</div>
                <div
                  className="mt-0.5 truncate text-[11px] text-muted-foreground"
                  style={{ fontFamily: pair.body }}
                >
                  Titre + texte courant
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
