'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi } from '@/lib/api';
import { STORE_THEME_TEMPLATES, themesForStoreType, type StoreThemeTemplate } from '@/data/store-themes';
import { ThemePreviewGrid } from '@/components/dashboard/theme-preview-card';
import { MediaPicker } from '@/components/dashboard/MediaPicker';
import { Check, ImageIcon, Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Star, MessageSquareQuote, Link2, Share2 } from 'lucide-react';

interface DeliveryIntegration {
  provider?: 'mogadelivery' | 'manual' | 'other';
  enabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  webhookSecret?: string;
  autoDispatch?: boolean;
  pickupAddress?: {
    contactName?: string;
    contactPhone?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
}

interface CodFormSettings {
  headline?: string;
  submitLabel?: string;
  showEmail?: boolean;
  requireEmail?: boolean;
  showPostalCode?: boolean;
  showState?: boolean;
  showNotes?: boolean;
  showQuantity?: boolean;
  reassurance?: string;
}

interface SlideItem {
  image: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  textAlign?: 'left' | 'center' | 'right';
  overlay?: 'none' | 'light' | 'dark';
}

interface SliderSettings {
  enabled?: boolean;
  autoplay?: boolean;
  autoplayMs?: number;
  height?: 'sm' | 'md' | 'lg' | 'xl';
  slides?: SlideItem[];
}

interface NavMenuLink {
  label: string;
  url: string;
}

interface NavbarSettings {
  showSearch?: boolean;
  menuLinks?: NavMenuLink[];
}

interface TestimonialItem {
  author: string;
  role?: string;
  rating?: number;
  content: string;
  avatar?: string;
  productName?: string;
  verified?: boolean;
}

interface TestimonialsSettings {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  items?: TestimonialItem[];
}

interface FooterSettings {
  social?: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    youtube?: string;
    x?: string;
    whatsapp?: string;
  };
  contact?: {
    email?: string;
    phone?: string;
    address?: string;
  };
  links?: Array<{ label: string; url: string }>;
}

interface StorefrontSettings {
  navbar?: NavbarSettings;
  showHero?: boolean;
  heroTitle?: string;
  heroSubtitle?: string;
  heroImage?: string;
  showProductsGrid?: boolean;
  productsGridTitle?: string;
  showFeatures?: boolean;
  testimonials?: TestimonialsSettings;
  showFooter?: boolean;
  footerNote?: string;
  footer?: FooterSettings;
  slider?: SliderSettings;
}

interface StoreType {
  _id: string;
  name: string;
  slug: string;
  subdomain: string;
  description?: string;
  customDomain?: string;
  isPublished?: boolean;
  storeType?: 'physical' | 'digital';
  logo?: string;
  favicon?: string;
  theme?: Record<string, unknown>;
  settings?: {
    currency?: string;
    language?: string;
    country?: string;
    direction?: 'ltr' | 'rtl';
    seoTitle?: string;
    seoDescription?: string;
    codForm?: CodFormSettings;
    storefront?: StorefrontSettings;
  };
  integrations?: { delivery?: DeliveryIntegration };
}

const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur']);
const directionOf = (lang?: string): 'ltr' | 'rtl' =>
  lang ? (RTL_LANGS.has(lang.split('-')[0]) ? 'rtl' : 'ltr') : 'ltr';

const SETTINGS_LANGUAGES = [
  { code: '',   label: '— Aucune —' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
];

type SettingsGroup = 'arab' | 'africa' | 'other';

const SETTINGS_COUNTRIES: { code: string; label: string; currency: string; arab: boolean; group: SettingsGroup }[] = [
  { code: '',   label: '— Aucun —',              currency: '',    arab: false, group: 'other' },
  // Monde arabe
  { code: 'SA', label: 'Saudi Arabia',           currency: 'SAR', arab: true,  group: 'arab' },
  { code: 'AE', label: 'UAE',                    currency: 'AED', arab: true,  group: 'arab' },
  { code: 'EG', label: 'Egypt',                  currency: 'EGP', arab: true,  group: 'arab' },
  { code: 'MA', label: 'Morocco',                currency: 'MAD', arab: true,  group: 'arab' },
  { code: 'TN', label: 'Tunisia',                currency: 'TND', arab: true,  group: 'arab' },
  { code: 'DZ', label: 'Algeria',                currency: 'DZD', arab: true,  group: 'arab' },
  { code: 'QA', label: 'Qatar',                  currency: 'QAR', arab: true,  group: 'arab' },
  { code: 'KW', label: 'Kuwait',                 currency: 'KWD', arab: true,  group: 'arab' },
  { code: 'BH', label: 'Bahrain',                currency: 'BHD', arab: true,  group: 'arab' },
  { code: 'OM', label: 'Oman',                   currency: 'OMR', arab: true,  group: 'arab' },
  { code: 'IQ', label: 'Iraq',                   currency: 'IQD', arab: true,  group: 'arab' },
  { code: 'JO', label: 'Jordan',                 currency: 'JOD', arab: true,  group: 'arab' },
  { code: 'LB', label: 'Lebanon',                currency: 'LBP', arab: true,  group: 'arab' },
  // Afrique sub-saharienne
  { code: 'NG', label: 'Nigeria',                currency: 'NGN', arab: false, group: 'africa' },
  { code: 'KE', label: 'Kenya',                  currency: 'KES', arab: false, group: 'africa' },
  { code: 'ZA', label: 'South Africa',           currency: 'ZAR', arab: false, group: 'africa' },
  { code: 'GH', label: 'Ghana',                  currency: 'GHS', arab: false, group: 'africa' },
  { code: 'SN', label: 'Senegal',                currency: 'XOF', arab: false, group: 'africa' },
  { code: 'CI', label: 'Côte d\'Ivoire',         currency: 'XOF', arab: false, group: 'africa' },
  { code: 'CM', label: 'Cameroon',               currency: 'XAF', arab: false, group: 'africa' },
  { code: 'ET', label: 'Ethiopia',               currency: 'ETB', arab: false, group: 'africa' },
  { code: 'TZ', label: 'Tanzania',               currency: 'TZS', arab: false, group: 'africa' },
  { code: 'UG', label: 'Uganda',                 currency: 'UGX', arab: false, group: 'africa' },
  { code: 'RW', label: 'Rwanda',                 currency: 'RWF', arab: false, group: 'africa' },
  { code: 'BJ', label: 'Benin',                  currency: 'XOF', arab: false, group: 'africa' },
  { code: 'TG', label: 'Togo',                   currency: 'XOF', arab: false, group: 'africa' },
  { code: 'BF', label: 'Burkina Faso',           currency: 'XOF', arab: false, group: 'africa' },
  { code: 'ML', label: 'Mali',                   currency: 'XOF', arab: false, group: 'africa' },
  { code: 'NE', label: 'Niger',                  currency: 'XOF', arab: false, group: 'africa' },
  { code: 'GN', label: 'Guinea',                 currency: 'GNF', arab: false, group: 'africa' },
  { code: 'GA', label: 'Gabon',                  currency: 'XAF', arab: false, group: 'africa' },
  { code: 'CG', label: 'Congo (Brazzaville)',    currency: 'XAF', arab: false, group: 'africa' },
  { code: 'CD', label: 'DR Congo',               currency: 'CDF', arab: false, group: 'africa' },
  { code: 'AO', label: 'Angola',                 currency: 'AOA', arab: false, group: 'africa' },
  { code: 'ZW', label: 'Zimbabwe',               currency: 'ZWL', arab: false, group: 'africa' },
  { code: 'ZM', label: 'Zambia',                 currency: 'ZMW', arab: false, group: 'africa' },
  { code: 'MZ', label: 'Mozambique',             currency: 'MZN', arab: false, group: 'africa' },
  { code: 'MG', label: 'Madagascar',             currency: 'MGA', arab: false, group: 'africa' },
  { code: 'MU', label: 'Mauritius',              currency: 'MUR', arab: false, group: 'africa' },
  { code: 'BW', label: 'Botswana',               currency: 'BWP', arab: false, group: 'africa' },
  { code: 'NA', label: 'Namibia',                currency: 'NAD', arab: false, group: 'africa' },
  { code: 'MW', label: 'Malawi',                 currency: 'MWK', arab: false, group: 'africa' },
  // Autre
  { code: 'FR', label: 'France',                 currency: 'EUR', arab: false, group: 'other' },
  { code: 'BE', label: 'Belgium',                currency: 'EUR', arab: false, group: 'other' },
  { code: 'CH', label: 'Switzerland',            currency: 'CHF', arab: false, group: 'other' },
  { code: 'CA', label: 'Canada',                 currency: 'CAD', arab: false, group: 'other' },
  { code: 'US', label: 'United States',          currency: 'USD', arab: false, group: 'other' },
  { code: 'GB', label: 'United Kingdom',         currency: 'GBP', arab: false, group: 'other' },
  { code: 'DE', label: 'Germany',                currency: 'EUR', arab: false, group: 'other' },
  { code: 'ES', label: 'Spain',                  currency: 'EUR', arab: false, group: 'other' },
  { code: 'IT', label: 'Italy',                  currency: 'EUR', arab: false, group: 'other' },
  { code: 'TR', label: 'Turkey',                 currency: 'TRY', arab: false, group: 'other' },
];

const SETTINGS_CURRENCIES = [
  // Arabe
  'SAR', 'AED', 'EGP', 'MAD', 'TND', 'DZD', 'QAR', 'KWD', 'BHD', 'OMR', 'JOD', 'LBP',
  // Afrique
  'NGN', 'KES', 'ZAR', 'GHS', 'XOF', 'XAF', 'ETB', 'TZS', 'UGX', 'RWF', 'GNF',
  'CDF', 'AOA', 'ZMW', 'ZWL', 'MZN', 'MGA', 'MUR', 'BWP', 'NAD', 'MWK',
  // Autre
  'EUR', 'GBP', 'CHF', 'TRY', 'USD', 'CAD', 'AUD',
];

export default function StoreSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const [store, setStore] = useState<StoreType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [favicon, setFavicon] = useState<string | undefined>(undefined);
  const [selectedTheme, setSelectedTheme] = useState<StoreThemeTemplate | null>(null);
  // Locale settings — used as defaults for AI landing pages
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('');
  const [currency, setCurrency] = useState('USD');
  // Delivery integration (mogadelivery)
  const [delivery, setDelivery] = useState<DeliveryIntegration>({
    provider: 'mogadelivery',
    enabled: false,
    autoDispatch: true,
  });
  // Editable COD form fields shown on the public product page
  const [codForm, setCodForm] = useState<CodFormSettings>({
    showEmail: true,
    requireEmail: false,
    showPostalCode: false,
    showState: false,
    showNotes: true,
    showQuantity: true,
  });
  // Storefront sections visibility / copy
  const [storefront, setStorefront] = useState<StorefrontSettings>({
    showHero: true,
    showProductsGrid: true,
    showFeatures: true,
    showFooter: true,
  });

  useEffect(() => {
    if (!storeId) return;
    storesApi
      .get(storeId)
      .then((res) => {
        const s = (res.data as { store: StoreType }).store;
        setStore(s);
        setName(s.name);
        setDescription(s.description || '');
        setCustomDomain(s.customDomain || '');
        setIsPublished(!!s.isPublished);
        setLogo(s.logo || undefined);
        setFavicon(s.favicon || undefined);
        setCountry(s.settings?.country || '');
        setLanguage(s.settings?.language || '');
        setCurrency(s.settings?.currency || 'USD');
        if (s.integrations?.delivery) {
          setDelivery({
            provider: s.integrations.delivery.provider || 'mogadelivery',
            enabled: !!s.integrations.delivery.enabled,
            apiKey: s.integrations.delivery.apiKey || '',
            baseUrl: s.integrations.delivery.baseUrl || '',
            webhookSecret: s.integrations.delivery.webhookSecret || '',
            autoDispatch: s.integrations.delivery.autoDispatch !== false,
            pickupAddress: s.integrations.delivery.pickupAddress || {},
          });
        }
        if (s.settings?.codForm) setCodForm({ ...codForm, ...s.settings.codForm });
        if (s.settings?.storefront) setStorefront({ ...storefront, ...s.settings.storefront });
        const themeId = (s.theme as { templateId?: string })?.templateId;
        if (themeId) {
          const t = STORE_THEME_TEMPLATES.find((x) => x.id === themeId);
          if (t) setSelectedTheme(t);
        }
      })
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, [storeId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) return;
    setSaving(true);
    try {
      const newSettings = {
        ...(store?.settings || {}),
        currency: currency || 'USD',
        language: language || undefined,
        country: country || undefined,
        direction: directionOf(language),
        codForm,
        storefront,
      };
      const newIntegrations = {
        ...(store?.integrations || {}),
        delivery: { ...delivery },
      };
      await storesApi.update(storeId, {
        name,
        description: description || undefined,
        customDomain: customDomain || undefined,
        isPublished,
        logo: logo ?? '',
        favicon: favicon ?? '',
        theme: selectedTheme ? (selectedTheme.theme as unknown as Record<string, unknown>) : undefined,
        settings: newSettings,
        integrations: newIntegrations,
      });
      setStore((prev) =>
        prev
          ? {
              ...prev,
              name,
              description,
              customDomain,
              isPublished,
              logo,
              favicon,
              theme: selectedTheme ? (selectedTheme.theme as unknown as Record<string, unknown>) : undefined,
              settings: newSettings,
            }
          : null
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading || !store) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/stores')}>
          ← Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Store settings</h1>
          <p className="text-muted-foreground">{store.name}</p>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <CardTitle>Informations générales</CardTitle>
            <CardDescription>Le nom, la description et le domaine de ta boutique.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nom de la boutique *</Label>
              <Input
                id="name"
                placeholder="Ex: Caftans Marrakech, Gadgets Tech, Artisanat Sahel"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <p className="text-[11px] text-muted-foreground">Visible par tes clients en haut de la boutique.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description courte</Label>
              <textarea
                id="description"
                placeholder="Ex: Vente de bijoux artisanaux livrés en 48h en Afrique de l'Ouest"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">1-2 phrases qui résument ton activité (SEO + sous-titre du hero).</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="domain">Domaine personnalisé (optionnel)</Label>
              <Input
                id="domain"
                placeholder="Ex: www.maboutique.com"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Configure un CNAME chez ton registrar vers `cname.flexiopage.com`.</p>
            </div>
            <label htmlFor="published" className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="published"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span>
                <span className="text-sm font-medium">Boutique publiée (visible par les clients)</span>
                <span className="block text-[11px] text-muted-foreground">Décoche pour mettre la boutique hors-ligne.</span>
              </span>
            </label>
          </CardContent>
          <CardContent>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Marché &amp; langue</CardTitle>
                <CardDescription>
                  Pré-remplit la génération AI des landing pages de tous les produits de ce store.
                </CardDescription>
              </div>
              {language && directionOf(language) === 'rtl' && (
                <span className="rounded-full bg-fuchsia-500/10 px-2.5 py-1 text-[10px] font-semibold text-fuchsia-700">
                  RTL · Droite → Gauche
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="settings-country">Pays cible</Label>
                <select
                  id="settings-country"
                  value={country}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCountry(v);
                    const match = SETTINGS_COUNTRIES.find((c) => c.code === v);
                    if (match?.currency) setCurrency(match.currency);
                    if (match?.arab && language !== 'ar') setLanguage('ar');
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <optgroup label="Monde arabe">
                    {SETTINGS_COUNTRIES.filter((c) => c.group === 'arab').map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Afrique">
                    {SETTINGS_COUNTRIES.filter((c) => c.group === 'africa').map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Autre">
                    {SETTINGS_COUNTRIES.filter((c) => c.group === 'other').map((c) => (
                      <option key={c.code || 'none'} value={c.code}>{c.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-lang">Langue</Label>
                <select
                  id="settings-lang"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {SETTINGS_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="settings-cur">Devise</Label>
                <select
                  id="settings-cur"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {SETTINGS_CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Delivery integration — only visible for physical-product stores */}
        {(store.storeType !== 'digital') && (
          <Card className="mt-6">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Livraison &amp; logistique
                    <span className="rounded-full bg-fuchsia-500/10 px-2.5 py-1 text-[10px] font-semibold text-fuchsia-700">
                      Mogadelivery
                    </span>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Connecte ton compte mogadelivery pour que chaque commande payée parte automatiquement chez le coursier.
                  </CardDescription>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!delivery.enabled}
                    onChange={(e) => setDelivery((d) => ({ ...d, enabled: e.target.checked }))}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="text-sm font-medium">Activé</span>
                </label>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="moga-key">Clé API mogadelivery *</Label>
                  <Input
                    id="moga-key"
                    type="password"
                    autoComplete="off"
                    placeholder="md_live_..."
                    value={delivery.apiKey || ''}
                    onChange={(e) => setDelivery((d) => ({ ...d, apiKey: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Récupère-la dans ton tableau de bord <code className="rounded bg-muted px-1 py-0.5 text-[11px]">admin-mogadelivery.com</code> → API.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="moga-base">Base URL (avancé)</Label>
                  <Input
                    id="moga-base"
                    placeholder="https://admin-mogadelivery.com"
                    value={delivery.baseUrl || ''}
                    onChange={(e) => setDelivery((d) => ({ ...d, baseUrl: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">Laisse vide pour utiliser la valeur par défaut.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="moga-secret">Secret webhook</Label>
                <Input
                  id="moga-secret"
                  type="password"
                  autoComplete="off"
                  placeholder="(optionnel) clé HMAC partagée"
                  value={delivery.webhookSecret || ''}
                  onChange={(e) => setDelivery((d) => ({ ...d, webhookSecret: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Configure ce même secret côté mogadelivery pour qu'on vérifie la signature des webhooks entrants.
                </p>
              </div>

              {/* Webhook URL info */}
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">URL du webhook entrant</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md bg-background px-3 py-2 font-mono text-xs">
                    {(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001')}/api/webhooks/mogadelivery
                  </code>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Ajoute cette URL dans ta config mogadelivery pour recevoir les changements de statut (assigné, en transit, livré, retourné).
                </p>
              </div>

              {/* Pickup address (expedition) */}
              <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
                <div>
                  <h3 className="text-sm font-semibold">Adresse d&apos;expédition</h3>
                  <p className="text-xs text-muted-foreground">Le coursier MogaDelivery vient récupérer les colis à cette adresse. Renseigne tous les champs pour que le livreur trouve le bon endroit.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="pickup-contact-name">Nom du contact *</Label>
                    <Input
                      id="pickup-contact-name"
                      placeholder="Ex: Aïssatou Diallo"
                      value={delivery.pickupAddress?.contactName || ''}
                      onChange={(e) => setDelivery((d) => ({ ...d, pickupAddress: { ...(d.pickupAddress || {}), contactName: e.target.value } }))}
                    />
                    <p className="text-[11px] text-muted-foreground">La personne que le livreur appelle à l&apos;arrivée.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pickup-contact-phone">Téléphone du contact *</Label>
                    <Input
                      id="pickup-contact-phone"
                      type="tel"
                      placeholder="Ex: +221 70 000 00 00"
                      value={delivery.pickupAddress?.contactPhone || ''}
                      onChange={(e) => setDelivery((d) => ({ ...d, pickupAddress: { ...(d.pickupAddress || {}), contactPhone: e.target.value } }))}
                    />
                    <p className="text-[11px] text-muted-foreground">Format international avec indicatif pays.</p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="pickup-line1">Adresse complète *</Label>
                    <Input
                      id="pickup-line1"
                      placeholder="Ex: 12 Rue Félix Faure, Plateau"
                      value={delivery.pickupAddress?.line1 || ''}
                      onChange={(e) => setDelivery((d) => ({ ...d, pickupAddress: { ...(d.pickupAddress || {}), line1: e.target.value } }))}
                    />
                    <p className="text-[11px] text-muted-foreground">N°, rue, quartier — comme sur Google Maps.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pickup-city">Ville *</Label>
                    <Input
                      id="pickup-city"
                      placeholder="Ex: Dakar"
                      value={delivery.pickupAddress?.city || ''}
                      onChange={(e) => setDelivery((d) => ({ ...d, pickupAddress: { ...(d.pickupAddress || {}), city: e.target.value } }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pickup-country">Pays *</Label>
                    <Input
                      id="pickup-country"
                      placeholder="Ex: SN, CI, MA, TN"
                      value={delivery.pickupAddress?.country || ''}
                      onChange={(e) => setDelivery((d) => ({ ...d, pickupAddress: { ...(d.pickupAddress || {}), country: e.target.value } }))}
                    />
                    <p className="text-[11px] text-muted-foreground">Code ISO à 2 lettres (ex: SN pour Sénégal).</p>
                  </div>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card p-4">
                <input
                  type="checkbox"
                  checked={delivery.autoDispatch !== false}
                  onChange={(e) => setDelivery((d) => ({ ...d, autoDispatch: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <div>
                  <div className="text-sm font-medium">Dispatch automatique</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Dès qu'une commande est payée (ou COD), elle est envoyée automatiquement à mogadelivery. Décoche pour dispatcher manuellement depuis la liste des commandes.
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>
        )}

        {/* COD form editor — physical stores only */}
        {(store.storeType !== 'digital') && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Formulaire de commande (COD)</CardTitle>
              <CardDescription>
                Le formulaire « paiement à la livraison » qui s'affiche sous chaque produit. Tu choisis quels champs afficher
                et personnalises les libellés.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cod-headline">Titre affiché en haut du formulaire</Label>
                  <Input
                    id="cod-headline"
                    placeholder="Ex: Commander · Paiement à la livraison"
                    value={codForm.headline || ''}
                    onChange={(e) => setCodForm({ ...codForm, headline: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">Le grand titre qui apparaît au-dessus du formulaire client.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cod-submit">Texte du bouton de validation</Label>
                  <Input
                    id="cod-submit"
                    placeholder="Ex: Commander · Réserver · اطلب الآن"
                    value={codForm.submitLabel || ''}
                    onChange={(e) => setCodForm({ ...codForm, submitLabel: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">2-3 mots maximum. Sera suivi du prix automatiquement.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cod-reassurance">Phrase rassurante sous le bouton (optionnel)</Label>
                <Input
                  id="cod-reassurance"
                  placeholder="Ex: Aucun prépaiement, paiement à la livraison uniquement"
                  value={codForm.reassurance || ''}
                  onChange={(e) => setCodForm({ ...codForm, reassurance: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">Petit message pour rassurer le client (ex: garantie, retour gratuit).</p>
              </div>

              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
                <h4 className="text-sm font-semibold">Champs visibles</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  <FieldToggle
                    label="Email"
                    sublabel="On peut envoyer la confirmation par email"
                    checked={!!codForm.showEmail}
                    onChange={(v) => setCodForm({ ...codForm, showEmail: v })}
                  />
                  <FieldToggle
                    label="Email obligatoire"
                    sublabel="Force le client à saisir un email"
                    disabled={!codForm.showEmail}
                    checked={!!codForm.requireEmail}
                    onChange={(v) => setCodForm({ ...codForm, requireEmail: v })}
                  />
                  <FieldToggle
                    label="Code postal"
                    sublabel="Recommandé pour Maroc / Tunisie"
                    checked={!!codForm.showPostalCode}
                    onChange={(v) => setCodForm({ ...codForm, showPostalCode: v })}
                  />
                  <FieldToggle
                    label="Région / État"
                    sublabel="Province, wilaya, etc."
                    checked={!!codForm.showState}
                    onChange={(v) => setCodForm({ ...codForm, showState: v })}
                  />
                  <FieldToggle
                    label="Note pour le livreur"
                    sublabel="Repère, étage, instructions"
                    checked={!!codForm.showNotes}
                    onChange={(v) => setCodForm({ ...codForm, showNotes: v })}
                  />
                  <FieldToggle
                    label="Sélecteur de quantité"
                    sublabel="Permet d'augmenter / diminuer la quantité"
                    checked={!!codForm.showQuantity}
                    onChange={(v) => setCodForm({ ...codForm, showQuantity: v })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Nom, téléphone et adresse sont toujours obligatoires (livreur en a besoin).
              </p>
            </CardContent>
          </Card>
        )}

        {/* Storefront sections editor */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Sections de la vitrine</CardTitle>
            <CardDescription>
              Active ou désactive les blocs affichés sur la page d'accueil de ta boutique.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <NavbarEditor
              navbar={storefront.navbar}
              onChange={(navbar) => setStorefront({ ...storefront, navbar })}
            />

            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
              <FieldToggle
                label="Bandeau d'accueil (hero)"
                sublabel="Grande zone en haut avec titre + sous-titre"
                checked={storefront.showHero !== false}
                onChange={(v) => setStorefront({ ...storefront, showHero: v })}
              />
              {storefront.showHero !== false && (
                <div className="grid gap-4 pt-1 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="hero-title">Titre principal du hero</Label>
                    <Input
                      id="hero-title"
                      placeholder="Ex: Bijoux artisanaux du Sahel"
                      value={storefront.heroTitle || ''}
                      onChange={(e) => setStorefront({ ...storefront, heroTitle: e.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground">Vide = nom de la boutique.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hero-subtitle">Sous-titre du hero</Label>
                    <Input
                      id="hero-subtitle"
                      placeholder="Ex: Pièces uniques fabriquées à la main, livrées en 48h"
                      value={storefront.heroSubtitle || ''}
                      onChange={(e) => setStorefront({ ...storefront, heroSubtitle: e.target.value })}
                    />
                    <p className="text-[11px] text-muted-foreground">Vide = description de la boutique.</p>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <MediaPicker
                      storeId={storeId}
                      value={storefront.heroImage}
                      onChange={(url) => setStorefront({ ...storefront, heroImage: url || '' })}
                      label="Image de fond du hero (optionnel)"
                      shape="wide"
                      helper="Téléverse une image ou choisis-la dans ta galerie (1920×1080 recommandé)."
                    />
                  </div>
                </div>
              )}
            </div>

            <SliderEditor
              storeId={storeId}
              slider={storefront.slider}
              onChange={(slider) => setStorefront({ ...storefront, slider })}
            />

            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
              <FieldToggle
                label="Grille des produits"
                sublabel="Liste des produits publiés"
                checked={storefront.showProductsGrid !== false}
                onChange={(v) => setStorefront({ ...storefront, showProductsGrid: v })}
              />
              {storefront.showProductsGrid !== false && (
                <div className="space-y-1.5">
                  <Label htmlFor="grid-title">Titre de la section produits</Label>
                  <Input
                    id="grid-title"
                    placeholder="Ex: Nos produits · Le catalogue · Découvrir"
                    value={storefront.productsGridTitle || ''}
                    onChange={(e) => setStorefront({ ...storefront, productsGridTitle: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">Vide = « Nos produits » par défaut.</p>
                </div>
              )}
            </div>

            <TestimonialsEditor
              storeId={storeId}
              testimonials={storefront.testimonials}
              onChange={(testimonials) => setStorefront({ ...storefront, testimonials })}
            />

            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
              <FieldToggle
                label="Bandeau de réassurance"
                sublabel="Livraison rapide · Paiement sécurisé · Support"
                checked={storefront.showFeatures !== false}
                onChange={(v) => setStorefront({ ...storefront, showFeatures: v })}
              />
              <FieldToggle
                label="Pied de page"
                sublabel="Mentions et lien vers les pages"
                checked={storefront.showFooter !== false}
                onChange={(v) => setStorefront({ ...storefront, showFooter: v })}
              />
              {storefront.showFooter !== false && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="footer-note">Note légale du pied de page (optionnel)</Label>
                    <Input
                      id="footer-note"
                      placeholder="Ex: © 2026 Ma Boutique · Tous droits réservés"
                      value={storefront.footerNote || ''}
                      onChange={(e) => setStorefront({ ...storefront, footerNote: e.target.value })}
                    />
                  </div>
                  <FooterEditor
                    footer={storefront.footer}
                    onChange={(footer) => setStorefront({ ...storefront, footer })}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Logo &amp; favicon</CardTitle>
            <CardDescription>
              Le logo est affiché dans la navbar de la boutique sur tous les thèmes. Téléverse une image
              ou choisis depuis ta galerie.
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

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Theme</CardTitle>
            <CardDescription>Choose a template for your storefront. Affects colors and style.</CardDescription>
          </CardHeader>
          <CardContent>
            <ThemePreviewGrid
              templates={themesForStoreType(store.storeType === 'digital' ? 'digital' : 'physical')}
              selectedId={
                selectedTheme?.id ||
                (store.theme as { templateId?: string })?.templateId
              }
              onSelect={setSelectedTheme}
            />
            <p className="mt-4 text-sm text-muted-foreground">
              Sauvegarde les changements ci-dessus pour appliquer le thème sélectionné à ton storefront.
            </p>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function FieldToggle({
  label,
  sublabel,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-card p-3 transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/30'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {sublabel && <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>}
      </div>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Slider editor — add/remove/reorder slides, configure autoplay
// ─────────────────────────────────────────────────────────────────────
const HEIGHT_OPTIONS: { value: NonNullable<SliderSettings['height']>; label: string }[] = [
  { value: 'sm', label: 'Compact (260-320px)' },
  { value: 'md', label: 'Moyen (340-420px)' },
  { value: 'lg', label: 'Grand (420-520px)' },
  { value: 'xl', label: 'Très grand (520-640px)' },
];

function emptySlide(): SlideItem {
  return { image: '', title: '', subtitle: '', ctaLabel: '', ctaUrl: '', textAlign: 'center', overlay: 'dark' };
}

function SliderEditor({
  storeId,
  slider,
  onChange,
}: {
  storeId: string;
  slider?: SliderSettings;
  onChange: (s: SliderSettings) => void;
}) {
  const cfg: SliderSettings = {
    enabled: false,
    autoplay: true,
    autoplayMs: 5000,
    height: 'lg',
    slides: [],
    ...(slider || {}),
  };
  const slides = cfg.slides || [];

  function update(patch: Partial<SliderSettings>) {
    onChange({ ...cfg, ...patch });
  }

  function updateSlide(i: number, patch: Partial<SlideItem>) {
    const next = slides.slice();
    next[i] = { ...next[i], ...patch };
    update({ slides: next });
  }

  function addSlide() {
    update({ slides: [...slides, emptySlide()] });
  }

  function removeSlide(i: number) {
    const next = slides.slice();
    next.splice(i, 1);
    update({ slides: next });
  }

  function moveSlide(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const next = slides.slice();
    [next[i], next[j]] = [next[j], next[i]];
    update({ slides: next });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-4">
      <FieldToggle
        label="Slider d'accueil"
        sublabel="Carrousel d'images affiché juste après le menu de navigation"
        checked={cfg.enabled !== false && !!cfg.enabled}
        onChange={(v) => update({ enabled: v })}
      />

      {cfg.enabled && (
        <>
          <div className="grid gap-3 pt-1 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Hauteur</Label>
              <select
                value={cfg.height || 'lg'}
                onChange={(e) => update({ height: e.target.value as SliderSettings['height'] })}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                {HEIGHT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Intervalle autoplay (ms)</Label>
              <Input
                type="number"
                min={2000}
                step={500}
                value={cfg.autoplayMs ?? 5000}
                onChange={(e) => update({ autoplayMs: parseInt(e.target.value, 10) || 5000 })}
                className="h-10"
              />
            </div>
            <div className="flex items-end">
              <FieldToggle
                label="Autoplay"
                sublabel="Défilement automatique"
                checked={cfg.autoplay !== false}
                onChange={(v) => update({ autoplay: v })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold">Slides ({slides.length})</h4>
                <p className="text-[11px] text-muted-foreground">
                  Image de fond + titre/sous-titre + bouton optionnel
                </p>
              </div>
              <Button type="button" size="sm" onClick={addSlide} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Ajouter un slide
              </Button>
            </div>

            {slides.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-card p-6 text-center text-xs text-muted-foreground">
                Aucun slide. Clique sur « Ajouter un slide » pour commencer.
              </div>
            ) : (
              <ul className="space-y-3">
                {slides.map((slide, i) => (
                  <li key={i} className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Slide {i + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Monter"
                          disabled={i === 0}
                          onClick={() => moveSlide(i, -1)}
                          className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Descendre"
                          disabled={i === slides.length - 1}
                          onClick={() => moveSlide(i, 1)}
                          className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Supprimer"
                          onClick={() => removeSlide(i)}
                          className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                      <MediaPicker
                        storeId={storeId}
                        value={slide.image}
                        onChange={(url) => updateSlide(i, { image: url || '' })}
                        shape="wide"
                      />

                      <div className="space-y-2">
                        <Input
                          placeholder="Titre du slide (optionnel)"
                          value={slide.title || ''}
                          onChange={(e) => updateSlide(i, { title: e.target.value })}
                          className="h-9"
                        />
                        <Input
                          placeholder="Sous-titre (optionnel)"
                          value={slide.subtitle || ''}
                          onChange={(e) => updateSlide(i, { subtitle: e.target.value })}
                          className="h-9"
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            placeholder="Texte du bouton"
                            value={slide.ctaLabel || ''}
                            onChange={(e) => updateSlide(i, { ctaLabel: e.target.value })}
                            className="h-9 text-xs"
                          />
                          <Input
                            placeholder="Lien du bouton (/produit, https://...)"
                            value={slide.ctaUrl || ''}
                            onChange={(e) => updateSlide(i, { ctaUrl: e.target.value })}
                            className="h-9 text-xs"
                          />
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <select
                            value={slide.textAlign || 'center'}
                            onChange={(e) => updateSlide(i, { textAlign: e.target.value as SlideItem['textAlign'] })}
                            className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                          >
                            <option value="left">Texte à gauche</option>
                            <option value="center">Texte centré</option>
                            <option value="right">Texte à droite</option>
                          </select>
                          <select
                            value={slide.overlay || 'dark'}
                            onChange={(e) => updateSlide(i, { overlay: e.target.value as SlideItem['overlay'] })}
                            className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                          >
                            <option value="dark">Overlay sombre</option>
                            <option value="light">Overlay clair</option>
                            <option value="none">Sans overlay</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// NAVBAR EDITOR — menu links (label + URL)
// ─────────────────────────────────────────────────────────────────────
function NavbarEditor({
  navbar,
  onChange,
}: {
  navbar?: NavbarSettings;
  onChange: (n: NavbarSettings) => void;
}) {
  const cfg: NavbarSettings = { menuLinks: [], ...(navbar || {}) };
  const links = cfg.menuLinks || [];

  function update(patch: Partial<NavbarSettings>) {
    onChange({ ...cfg, ...patch });
  }
  function updateLink(i: number, patch: Partial<NavMenuLink>) {
    const next = links.slice();
    next[i] = { ...next[i], ...patch };
    update({ menuLinks: next });
  }
  function addLink() {
    update({ menuLinks: [...links, { label: '', url: '' }] });
  }
  function removeLink(i: number) {
    const next = links.slice();
    next.splice(i, 1);
    update({ menuLinks: next });
  }
  function moveLink(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= links.length) return;
    const next = links.slice();
    [next[i], next[j]] = [next[j], next[i]];
    update({ menuLinks: next });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Menu de navigation (navbar)</h4>
          <p className="text-[11px] text-muted-foreground">
            Liens affichés dans la barre supérieure (Catalogue, À propos, Contact, etc.)
          </p>
        </div>
        <Button type="button" size="sm" onClick={addLink} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Ajouter un lien
        </Button>
      </div>

      {links.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-card p-4 text-center text-xs text-muted-foreground">
          Aucun lien. La barre affichera juste ton logo.
        </div>
      ) : (
        <ul className="space-y-2">
          {links.map((l, i) => (
            <li key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg border border-border/60 bg-card p-2">
              <Input
                placeholder="Libellé (ex: Catalogue)"
                value={l.label}
                onChange={(e) => updateLink(i, { label: e.target.value })}
                className="h-9 text-sm"
              />
              <Input
                placeholder="/about, #section, https://..."
                value={l.url}
                onChange={(e) => updateLink(i, { url: e.target.value })}
                className="h-9 text-xs font-mono"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Monter"
                  disabled={i === 0}
                  onClick={() => moveLink(i, -1)}
                  className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Descendre"
                  disabled={i === links.length - 1}
                  onClick={() => moveLink(i, 1)}
                  className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Supprimer"
                  onClick={() => removeLink(i)}
                  className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TESTIMONIALS EDITOR — toggle + add/remove/reorder
// ─────────────────────────────────────────────────────────────────────
function emptyTestimonial(): TestimonialItem {
  return { author: '', content: '', rating: 5, verified: true };
}

function TestimonialsEditor({
  storeId,
  testimonials,
  onChange,
}: {
  storeId: string;
  testimonials?: TestimonialsSettings;
  onChange: (t: TestimonialsSettings) => void;
}) {
  const cfg: TestimonialsSettings = {
    enabled: false,
    items: [],
    ...(testimonials || {}),
  };
  const items = cfg.items || [];

  function update(patch: Partial<TestimonialsSettings>) {
    onChange({ ...cfg, ...patch });
  }
  function updateItem(i: number, patch: Partial<TestimonialItem>) {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    update({ items: next });
  }
  function addItem() {
    update({ items: [...items, emptyTestimonial()] });
  }
  function removeItem(i: number) {
    const next = items.slice();
    next.splice(i, 1);
    update({ items: next });
  }
  function moveItem(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    update({ items: next });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/30 p-4">
      <FieldToggle
        label="Avis clients / Témoignages"
        sublabel="Section avec témoignages, notes 5 étoiles, photos clients"
        checked={!!cfg.enabled}
        onChange={(v) => update({ enabled: v })}
      />

      {cfg.enabled && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 pt-1">
            <div>
              <Label className="text-xs">Titre de la section</Label>
              <Input
                placeholder="Ex: Ils nous font confiance"
                value={cfg.title || ''}
                onChange={(e) => update({ title: e.target.value })}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Sous-titre (optionnel)</Label>
              <Input
                placeholder="Ex: Plus de 1000 clients satisfaits"
                value={cfg.subtitle || ''}
                onChange={(e) => update({ subtitle: e.target.value })}
                className="mt-1 h-9"
              />
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                  <MessageSquareQuote className="h-3.5 w-3.5" />
                  Témoignages ({items.length})
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Ajoute les avis de tes vrais clients (3 à 9 recommandé).
                </p>
              </div>
              <Button type="button" size="sm" onClick={addItem} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Ajouter un témoignage
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-card p-6 text-center text-xs text-muted-foreground">
                Aucun témoignage. Clique sur « Ajouter un témoignage » pour commencer.
              </div>
            ) : (
              <ul className="space-y-3">
                {items.map((t, i) => (
                  <li key={i} className="rounded-xl border border-border/60 bg-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Témoignage {i + 1}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Monter"
                          disabled={i === 0}
                          onClick={() => moveItem(i, -1)}
                          className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Descendre"
                          disabled={i === items.length - 1}
                          onClick={() => moveItem(i, 1)}
                          className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted disabled:opacity-30"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Supprimer"
                          onClick={() => removeItem(i)}
                          className="grid h-7 w-7 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                      <MediaPicker
                        storeId={storeId}
                        value={t.avatar}
                        onChange={(url) => updateItem(i, { avatar: url || '' })}
                        shape="round"
                      />

                      <div className="space-y-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            placeholder="Nom client"
                            value={t.author}
                            onChange={(e) => updateItem(i, { author: e.target.value })}
                            className="h-9"
                          />
                          <Input
                            placeholder="Lieu / rôle (ex: Tunis · Cliente fidèle)"
                            value={t.role || ''}
                            onChange={(e) => updateItem(i, { role: e.target.value })}
                            className="h-9 text-sm"
                          />
                        </div>
                        <textarea
                          placeholder="Témoignage du client…"
                          value={t.content}
                          onChange={(e) => updateItem(i, { content: e.target.value })}
                          rows={3}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <div className="inline-flex items-center gap-2">
                            <Label className="text-xs whitespace-nowrap">Note</Label>
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => updateItem(i, { rating: n })}
                                  className="rounded p-0.5 hover:bg-muted"
                                  aria-label={`${n} étoiles`}
                                >
                                  <Star
                                    className="h-4 w-4"
                                    fill={n <= (t.rating || 5) ? '#fbbf24' : 'none'}
                                    color={n <= (t.rating || 5) ? '#fbbf24' : 'currentColor'}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                          <Input
                            placeholder="Produit acheté (optionnel)"
                            value={t.productName || ''}
                            onChange={(e) => updateItem(i, { productName: e.target.value })}
                            className="h-9 text-xs"
                          />
                          <label className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={!!t.verified}
                              onChange={(e) => updateItem(i, { verified: e.target.checked })}
                              className="h-4 w-4 rounded border-input"
                            />
                            Vérifié
                          </label>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FOOTER EDITOR — social links + contact + extra links
// ─────────────────────────────────────────────────────────────────────
const SOCIAL_FIELDS: Array<{ key: keyof NonNullable<FooterSettings['social']>; label: string; placeholder: string }> = [
  { key: 'instagram', label: 'Instagram', placeholder: '@mabellestore' },
  { key: 'facebook',  label: 'Facebook',  placeholder: '@MaBelleStore' },
  { key: 'tiktok',    label: 'TikTok',    placeholder: '@mabellestore' },
  { key: 'youtube',   label: 'YouTube',   placeholder: '@mabellestore' },
  { key: 'x',         label: 'X',         placeholder: '@mabellestore' },
  { key: 'whatsapp',  label: 'WhatsApp',  placeholder: '+216 99 999 999' },
];

function FooterEditor({
  footer,
  onChange,
}: {
  footer?: FooterSettings;
  onChange: (f: FooterSettings) => void;
}) {
  const cfg: FooterSettings = {
    social: {},
    contact: {},
    links: [],
    ...(footer || {}),
  };
  const links = cfg.links || [];

  function setSocial(key: string, value: string) {
    onChange({ ...cfg, social: { ...(cfg.social || {}), [key]: value } });
  }
  function setContact(key: 'email' | 'phone' | 'address', value: string) {
    onChange({ ...cfg, contact: { ...(cfg.contact || {}), [key]: value } });
  }
  function addLink() {
    onChange({ ...cfg, links: [...links, { label: '', url: '' }] });
  }
  function updateLink(i: number, patch: Partial<{ label: string; url: string }>) {
    const next = links.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ ...cfg, links: next });
  }
  function removeLink(i: number) {
    const next = links.slice();
    next.splice(i, 1);
    onChange({ ...cfg, links: next });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card p-4">
      <div>
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          <Share2 className="h-3.5 w-3.5" /> Réseaux sociaux
        </h4>
        <p className="text-[11px] text-muted-foreground">
          Colle le pseudo (@compte) ou l'URL complète.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SOCIAL_FIELDS.map((f) => (
            <Input
              key={f.key}
              placeholder={`${f.label} — ${f.placeholder}`}
              value={cfg.social?.[f.key] || ''}
              onChange={(e) => setSocial(f.key, e.target.value)}
              className="h-9 text-sm"
            />
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold">Coordonnées</h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Email de contact"
            type="email"
            value={cfg.contact?.email || ''}
            onChange={(e) => setContact('email', e.target.value)}
            className="h-9"
          />
          <Input
            placeholder="Téléphone"
            value={cfg.contact?.phone || ''}
            onChange={(e) => setContact('phone', e.target.value)}
            className="h-9"
          />
          <Input
            placeholder="Adresse postale (optionnel)"
            value={cfg.contact?.address || ''}
            onChange={(e) => setContact('address', e.target.value)}
            className="h-9 sm:col-span-2"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <Link2 className="h-3.5 w-3.5" /> Liens additionnels
          </h4>
          <Button type="button" size="sm" variant="outline" onClick={addLink} className="gap-1.5">
            <Plus className="h-3 w-3" /> Ajouter
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Mentions légales, CGV, politique de retour, etc.
        </p>
        {links.length > 0 && (
          <ul className="mt-2 space-y-2">
            {links.map((l, i) => (
              <li key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  placeholder="Libellé"
                  value={l.label}
                  onChange={(e) => updateLink(i, { label: e.target.value })}
                  className="h-9 text-sm"
                />
                <Input
                  placeholder="/legal/cgv"
                  value={l.url}
                  onChange={(e) => updateLink(i, { url: e.target.value })}
                  className="h-9 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => removeLink(i)}
                  aria-label="Supprimer"
                  className="grid h-9 w-9 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
