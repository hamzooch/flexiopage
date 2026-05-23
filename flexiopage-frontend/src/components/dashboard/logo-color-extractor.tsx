'use client';

/**
 * Logo → theme palette suggester.
 *
 * Lets the seller detect the dominant colors of their uploaded logo and
 * choose which one becomes the theme's primary and which becomes the accent.
 * Applying re-derives the full theme via `deriveTheme` (the background and
 * structural tokens of the selected template are preserved), so the seller
 * keeps a coherent, contrast-safe palette built around their brand colors.
 */
import { useState } from 'react';
import { Loader2, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mediaUrl } from '@/lib/utils';
import {
  extractLogoColors,
  suggestPrimaryAccent,
  type ExtractedColor,
} from '@/lib/extract-logo-colors';
import { deriveTheme, contrastText, type ThemeTokens } from '@/data/store-themes';

interface Props {
  /** Stored logo path/URL (relative `/uploads/...` or absolute). */
  logo: string;
  /** Current theme being edited — supplies background/fonts/layout. */
  theme: ThemeTokens;
  onChange: (next: ThemeTokens) => void;
}

interface Role {
  primary: string;
  accent: string;
}

export function LogoColorExtractor({ logo, theme, onChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [colors, setColors] = useState<ExtractedColor[] | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [applied, setApplied] = useState(false);

  async function detect() {
    const src = mediaUrl(logo);
    if (!src) return;
    setLoading(true);
    setError('');
    setApplied(false);
    try {
      const found = await extractLogoColors(src);
      setColors(found);
      setRole(suggestPrimaryAccent(found));
    } catch (err: unknown) {
      setColors(null);
      setRole(null);
      setError(err instanceof Error ? err.message : "La détection des couleurs a échoué.");
    } finally {
      setLoading(false);
    }
  }

  /** Click a swatch: left side picks primary, right side picks accent. */
  function assign(target: 'primary' | 'accent', hex: string) {
    setRole((prev) => {
      const base = prev ?? { primary: hex, accent: hex };
      return { ...base, [target]: hex };
    });
    setApplied(false);
  }

  function apply() {
    if (!role) return;
    onChange(deriveTheme(theme, { primary: role.primary, accent: role.accent }));
    setApplied(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Détecte les couleurs dominantes de ton logo, puis applique-les au thème.
          Le fond et la structure du thème choisi sont conservés.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={detect}
          disabled={loading}
          className="h-8 shrink-0 gap-1.5 rounded-lg"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {colors ? 'Re-détecter' : 'Détecter les couleurs du logo'}
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {colors && colors.length > 0 && role && (
        <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-3">
          <RoleRow
            label="Couleur principale"
            hint="Boutons, prix, liens"
            selected={role.primary}
            colors={colors}
            onPick={(hex) => assign('primary', hex)}
          />
          <RoleRow
            label="Couleur d'accent"
            hint="Dégradés, détails"
            selected={role.accent}
            colors={colors}
            onPick={(hex) => assign('accent', hex)}
          />

          <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
            <div className="flex items-center gap-2">
              <Preview hex={role.primary} label="Principale" />
              <Preview hex={role.accent} label="Accent" />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={apply}
              className="h-8 shrink-0 gap-1.5 rounded-lg"
            >
              {applied ? <Check className="h-3.5 w-3.5" /> : null}
              {applied ? 'Palette appliquée' : 'Appliquer au thème'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface RoleRowProps {
  label: string;
  hint: string;
  selected: string;
  colors: ExtractedColor[];
  onPick: (hex: string) => void;
}

function RoleRow({ label, hint, selected, colors, onPick }: RoleRowProps) {
  return (
    <div>
      <div className="mb-1.5">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => {
          const isSel = c.hex === selected;
          return (
            <button
              key={c.hex}
              type="button"
              onClick={() => onPick(c.hex)}
              title={c.hex}
              aria-label={`${label} ${c.hex}`}
              aria-pressed={isSel}
              className={`relative h-9 w-9 rounded-lg ring-1 ring-border transition-transform hover:scale-105 ${
                isSel ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''
              }`}
              style={{ backgroundColor: c.hex }}
            >
              {isSel && (
                <Check
                  className="absolute inset-0 m-auto h-4 w-4"
                  style={{ color: contrastText(c.hex) }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Preview({ hex, label }: { hex: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-6 w-6 rounded-md ring-1 ring-border"
        style={{ backgroundColor: hex }}
      />
      <span className="font-mono text-[11px] uppercase text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
