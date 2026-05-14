'use client';

/**
 * Simplified theme palette editor.
 *
 * The seller only ever picks 3 colors — primary, accent, background —
 * and `deriveTheme` regenerates the full, contrast-safe token set
 * (surfaces, text, borders, gradient) from those. This keeps the editor
 * approachable and prevents unreadable color combinations.
 */
import { useMemo } from 'react';
import {
  deriveTheme,
  getThemeById,
  type ThemeTokens,
} from '@/data/store-themes';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

interface Props {
  /** The current (possibly customized) theme tokens being edited. */
  theme: ThemeTokens;
  onChange: (next: ThemeTokens) => void;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

interface SwatchFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (hex: string) => void;
}

function SwatchField({ label, hint, value, onChange }: SwatchFieldProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="mb-2">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <div className="flex items-center gap-2">
        <label
          className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-border"
          style={{ backgroundColor: HEX_RE.test(value) ? value : '#ffffff' }}
        >
          <input
            type="color"
            value={HEX_RE.test(value) ? value : '#ffffff'}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={label}
          />
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (HEX_RE.test(v)) onChange(v.toLowerCase());
            else onChange(v); // keep typing; only commit when valid
          }}
          placeholder="#000000"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm uppercase outline-none ring-primary/30 focus:ring-2"
        />
      </div>
    </div>
  );
}

export function ThemePaletteEditor({ theme, onChange }: Props) {
  const baseTemplate = getThemeById(theme.templateId);

  // The derived (read-only) tokens, shown so the seller sees what the
  // 3 picks generate downstream.
  const derivedSwatches = useMemo(
    () => [
      { key: 'background', label: 'Fond', color: theme.background },
      { key: 'surface', label: 'Cartes', color: theme.surface },
      { key: 'foreground', label: 'Texte', color: theme.foreground },
      { key: 'muted', label: 'Texte 2', color: theme.muted },
      { key: 'border', label: 'Bordures', color: theme.border },
      { key: 'primary', label: 'Principale', color: theme.primary },
      { key: 'accent', label: 'Accent', color: theme.accent },
    ],
    [theme]
  );

  function setColor(field: 'primary' | 'accent' | 'background', hex: string) {
    // Only re-derive when the value is a complete hex; otherwise just
    // reflect the raw text so the field stays editable.
    if (!HEX_RE.test(hex)) {
      onChange({ ...theme, [field]: hex });
      return;
    }
    onChange(deriveTheme(theme, { [field]: hex }));
  }

  function resetPalette() {
    if (baseTemplate) onChange(baseTemplate.theme);
  }

  const isCustomized =
    baseTemplate != null &&
    (theme.primary !== baseTemplate.theme.primary ||
      theme.accent !== baseTemplate.theme.accent ||
      theme.background !== baseTemplate.theme.background);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Choisis 3 couleurs — le reste de la palette (surfaces, textes, bordures)
          est généré automatiquement pour rester lisible.
        </p>
        {isCustomized && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetPalette}
            className="h-8 shrink-0 gap-1.5 rounded-lg"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Réinitialiser
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SwatchField
          label="Couleur principale"
          hint="Boutons, prix, liens"
          value={theme.primary}
          onChange={(hex) => setColor('primary', hex)}
        />
        <SwatchField
          label="Couleur d'accent"
          hint="Dégradés, détails"
          value={theme.accent}
          onChange={(hex) => setColor('accent', hex)}
        />
        <SwatchField
          label="Couleur de fond"
          hint="Arrière-plan des pages"
          value={theme.background}
          onChange={(hex) => setColor('background', hex)}
        />
      </div>

      {/* Derived palette preview */}
      <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Palette générée
        </div>
        <div className="flex flex-wrap gap-2">
          {derivedSwatches.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span
                className="h-6 w-6 rounded-md ring-1 ring-border"
                style={{ backgroundColor: s.color }}
                title={s.color}
              />
              <span className="text-[11px] text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
