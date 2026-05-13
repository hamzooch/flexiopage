'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { storesApi } from '@/lib/api';
import { STORE_THEME_TEMPLATES, themesForStoreType, type StoreThemeTemplate } from '@/data/store-themes';
import { ThemePreviewGrid } from '@/components/dashboard/theme-preview-card';
import { MediaPicker } from '@/components/dashboard/MediaPicker';
import { StoreSubPageShell } from '@/components/dashboard/store-sub-page';
import type { StoreType } from '@/components/dashboard/store-editor';

export default function StoreAppearancePage() {
  const params = useParams();
  const storeId = params.storeId as string;
  const [store, setStore] = useState<StoreType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [favicon, setFavicon] = useState<string | undefined>(undefined);
  const [selectedTheme, setSelectedTheme] = useState<StoreThemeTemplate | null>(null);

  useEffect(() => {
    if (!storeId) return;
    storesApi
      .get(storeId)
      .then((res) => {
        const s = (res.data as { store: StoreType }).store;
        setStore(s);
        setLogo(s.logo || undefined);
        setFavicon(s.favicon || undefined);
        const themeId = (s.theme as { templateId?: string })?.templateId;
        if (themeId) {
          const t = STORE_THEME_TEMPLATES.find((x) => x.id === themeId);
          if (t) setSelectedTheme(t);
        }
      })
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, [storeId]);

  async function handleSave() {
    if (!store) return;
    setSaving(true);
    try {
      await storesApi.update(storeId, {
        logo: logo ?? '',
        favicon: favicon ?? '',
        theme: selectedTheme ? (selectedTheme.theme as unknown as Record<string, unknown>) : undefined,
      });
      setStore({
        ...store,
        logo,
        favicon,
        theme: selectedTheme ? (selectedTheme.theme as unknown as Record<string, unknown>) : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !store) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <StoreSubPageShell
      storeId={storeId}
      storeName={store.name}
      title="Apparence"
      description="Logo, favicon et thème — la signature visuelle de ta boutique."
      saving={saving}
      onSave={handleSave}
    >
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
          <CardDescription>Choisis un template pour ta boutique. Affecte les couleurs, polices et style général.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemePreviewGrid
            templates={themesForStoreType(store.storeType === 'digital' ? 'digital' : 'physical')}
            selectedId={selectedTheme?.id || (store.theme as { templateId?: string })?.templateId}
            onSelect={setSelectedTheme}
          />
        </CardContent>
      </Card>
    </StoreSubPageShell>
  );
}
