'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { storesApi, extractApiError } from '@/lib/api';
import {
  STORE_THEME_TEMPLATES,
  themesForStoreType,
  withLayoutFallback,
  type StoreThemeTemplate,
  type ThemeTokens,
} from '@/data/store-themes';
import { ThemePreviewGrid } from '@/components/dashboard/theme-preview-card';
import { ThemePaletteEditor } from '@/components/dashboard/theme-palette-editor';
import { MediaPicker } from '@/components/dashboard/MediaPicker';
import { StoreSubPageShell, type SaveStatus } from '@/components/dashboard/store-sub-page';
import { StoreHomepageLivePreview } from '@/components/dashboard/store-homepage-live-preview';
import type { StorefrontSettings, StoreType, WhatsappSettings } from '@/components/dashboard/store-editor';
import { applyThemeRecommendationsToStorefront } from '@/lib/theme-sections';

export default function StoreAppearancePage() {
  const params = useParams();
  const storeId = params.storeId as string;
  const [store, setStore] = useState<StoreType | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [favicon, setFavicon] = useState<string | undefined>(undefined);
  // The full theme tokens to be saved — selecting a template seeds these,
  // the palette editor mutates them in place.
  const [themeTokens, setThemeTokens] = useState<ThemeTokens | null>(null);
  // On retient le templateId initialement chargé pour détecter un changement
  // de thème au moment du save. Si le vendeur switch de thème, on auto-
  // applique la recommandation de sections au storefront (showHero,
  // slider.enabled, etc.) dans le même PATCH — pas besoin d'aller dans
  // l'onglet Sections pour ré-aligner manuellement.
  const [originalTemplateId, setOriginalTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    storesApi
      .get(storeId)
      .then((res) => {
        const s = (res.data as { store: StoreType }).store;
        setStore(s);
        setLogo(s.logo || undefined);
        setFavicon(s.favicon || undefined);
        const saved = s.theme as Partial<ThemeTokens> | undefined;
        if (saved?.templateId) {
          const tpl = STORE_THEME_TEMPLATES.find((x) => x.id === saved.templateId);
          // A saved theme may pre-date the `layout` block or be fully
          // customized — backfill missing structural tokens.
          if (saved.primary && saved.background) {
            setThemeTokens(withLayoutFallback(saved as ThemeTokens));
          } else if (tpl) {
            setThemeTokens(tpl.theme);
          }
          setOriginalTemplateId(saved.templateId);
        }
      })
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, [storeId]);

  function handleSelectTemplate(tpl: StoreThemeTemplate) {
    setThemeTokens(tpl.theme);
  }

  async function handleSave() {
    if (!store) return;
    setStatus('saving');
    setErrorMessage('');
    try {
      // Si le thème a changé, on resync les toggles de sections du
      // storefront (showHero, slider.enabled, etc.) à la recommandation
      // du nouveau thème dans le même PATCH. On ne touche jamais aux
      // contenus (titres, images, témoignages déjà saisis) — uniquement
      // les flags d'activation.
      const themeChanged = themeTokens?.templateId && themeTokens.templateId !== originalTemplateId;
      let settingsPatch: Record<string, unknown> | undefined;
      if (themeChanged) {
        const currentStorefront = (store.settings?.storefront || {}) as Record<string, unknown>;
        const adjusted = applyThemeRecommendationsToStorefront(currentStorefront, themeTokens || undefined);
        settingsPatch = { ...(store.settings || {}), storefront: adjusted };
      }

      const res = await storesApi.update(storeId, {
        logo: logo ?? '',
        favicon: favicon ?? '',
        theme: themeTokens ? (themeTokens as unknown as Record<string, unknown>) : undefined,
        ...(settingsPatch ? { settings: settingsPatch } : {}),
      });
      // Re-sync from the server response so the next save builds on top of
      // what's actually in the DB (e.g. unescaped URLs).
      const updated = (res.data as { store: StoreType }).store;
      setStore(updated);
      setLogo(updated.logo || undefined);
      setFavicon(updated.favicon || undefined);
      const savedTheme = updated.theme as Partial<ThemeTokens> | undefined;
      if (savedTheme?.primary && savedTheme?.background) {
        setThemeTokens(withLayoutFallback(savedTheme as ThemeTokens));
      }
      if (savedTheme?.templateId) setOriginalTemplateId(savedTheme.templateId);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2400);
    } catch (err: unknown) {
      console.error('[store/appearance] save failed', err);
      setErrorMessage(extractApiError(err, "L'enregistrement a échoué. Réessaie."));
      setStatus('error');
    }
  }

  if (loading || !store) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  const storefrontMock: StorefrontSettings = (store.settings?.storefront || {}) as StorefrontSettings;
  const whatsappMock: WhatsappSettings | undefined = store.settings?.whatsapp;

  return (
    <StoreSubPageShell
      storeId={storeId}
      storeName={store.name}
      title="Apparence"
      description="Logo, favicon et thème — la signature visuelle de ta boutique."
      status={status}
      errorMessage={errorMessage}
      onSave={handleSave}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Logo &amp; favicon</CardTitle>
          <CardDescription>
            Le logo apparaît dans la navbar de la boutique sur tous les thèmes. Le favicon est l&apos;icône dans l&apos;onglet du navigateur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="max-w-[220px]">
                <MediaPicker
                  storeId={storeId}
                  value={logo}
                  onChange={setLogo}
                  label="Logo de la boutique"
                  shape="square"
                  helper="Format carré recommandé (PNG ou SVG, 512×512)."
                />
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="max-w-[160px]">
                <MediaPicker
                  storeId={storeId}
                  value={favicon}
                  onChange={setFavicon}
                  label="Favicon (onglet du navigateur)"
                  shape="square"
                  helper="32×32 ou 64×64. PNG ou ICO."
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Thème</CardTitle>
          <CardDescription>
            Chaque thème a sa propre structure de page, ses polices et son style. Choisis-en un,
            puis personnalise ses couleurs juste en dessous.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemePreviewGrid
            templates={themesForStoreType(store.storeType === 'digital' ? 'digital' : 'physical')}
            selectedId={themeTokens?.templateId}
            onSelect={handleSelectTemplate}
          />
        </CardContent>
      </Card>

      {themeTokens && (
        <Card>
          <CardHeader>
            <CardTitle>Palette de couleurs</CardTitle>
            <CardDescription>
              Personnalise les couleurs du thème sélectionné. Tu peux toujours revenir à la palette
              d&apos;origine.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThemePaletteEditor theme={themeTokens} onChange={setThemeTokens} />
          </CardContent>
        </Card>
      )}
        </div>

        {/* ── STICKY RIGHT — real-time mini-storefront mock ──────
            Masqué sous lg pour libérer l'espace d'édition sur tablette. */}
        <aside className="hidden lg:sticky lg:top-4 lg:self-start lg:block">
          <StoreHomepageLivePreview
            storeName={store.name}
            logo={logo}
            favicon={favicon}
            theme={themeTokens || undefined}
            storefront={storefrontMock}
            whatsapp={whatsappMock}
            currency={store.settings?.currency}
            direction={store.settings?.direction}
          />
        </aside>
      </div>
    </StoreSubPageShell>
  );
}
