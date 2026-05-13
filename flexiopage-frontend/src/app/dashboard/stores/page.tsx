'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi } from '@/lib/api';
import {
  Store as StoreIcon,
  Plus,
  ArrowRight,
  ArrowLeft,
  Package,
  Cloud,
  Check,
  Sparkles,
  ExternalLink,
  Settings as SettingsIcon,
} from 'lucide-react';
import { STORE_THEME_TEMPLATES, themesForStoreType, type StoreThemeTemplate } from '@/data/store-themes';
import { ThemePreviewGrid } from '@/components/dashboard/theme-preview-card';
import { cn } from '@/lib/utils';

type StoreType = 'physical' | 'digital';

const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur']);
const directionOf = (lang: string): 'ltr' | 'rtl' => (RTL_LANGS.has(lang.split('-')[0]) ? 'rtl' : 'ltr');

const STORE_LANGUAGES: { code: string; label: string }[] = [
  { code: '',   label: '— Aucune langue par défaut —' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
];

type CountryGroup = 'arab' | 'africa' | 'other';

const STORE_COUNTRIES: { code: string; label: string; currency: string; arab?: boolean; group: CountryGroup }[] = [
  // Monde arabe (Maghreb arabophone + Moyen-Orient)
  { code: 'SA', label: 'Saudi Arabia',          currency: 'SAR', arab: true, group: 'arab' },
  { code: 'AE', label: 'United Arab Emirates',  currency: 'AED', arab: true, group: 'arab' },
  { code: 'EG', label: 'Egypt',                 currency: 'EGP', arab: true, group: 'arab' },
  { code: 'MA', label: 'Morocco',               currency: 'MAD', arab: true, group: 'arab' },
  { code: 'TN', label: 'Tunisia',               currency: 'TND', arab: true, group: 'arab' },
  { code: 'DZ', label: 'Algeria',               currency: 'DZD', arab: true, group: 'arab' },
  { code: 'QA', label: 'Qatar',                 currency: 'QAR', arab: true, group: 'arab' },
  { code: 'KW', label: 'Kuwait',                currency: 'KWD', arab: true, group: 'arab' },
  { code: 'BH', label: 'Bahrain',               currency: 'BHD', arab: true, group: 'arab' },
  { code: 'OM', label: 'Oman',                  currency: 'OMR', arab: true, group: 'arab' },
  { code: 'IQ', label: 'Iraq',                  currency: 'IQD', arab: true, group: 'arab' },
  { code: 'JO', label: 'Jordan',                currency: 'JOD', arab: true, group: 'arab' },
  { code: 'LB', label: 'Lebanon',               currency: 'LBP', arab: true, group: 'arab' },
  { code: 'LY', label: 'Libya',                 currency: 'LYD', arab: true, group: 'arab' },
  { code: 'YE', label: 'Yemen',                 currency: 'YER', arab: true, group: 'arab' },
  { code: 'PS', label: 'Palestine',             currency: 'ILS', arab: true, group: 'arab' },
  { code: 'SY', label: 'Syria',                 currency: 'SYP', arab: true, group: 'arab' },
  { code: 'SD', label: 'Sudan',                 currency: 'SDG', arab: true, group: 'arab' },
  { code: 'MR', label: 'Mauritania',            currency: 'MRU', arab: true, group: 'arab' },
  // Afrique sub-saharienne
  { code: 'NG', label: 'Nigeria',               currency: 'NGN',             group: 'africa' },
  { code: 'KE', label: 'Kenya',                 currency: 'KES',             group: 'africa' },
  { code: 'ZA', label: 'South Africa',          currency: 'ZAR',             group: 'africa' },
  { code: 'GH', label: 'Ghana',                 currency: 'GHS',             group: 'africa' },
  { code: 'SN', label: 'Senegal',               currency: 'XOF',             group: 'africa' },
  { code: 'CI', label: 'Côte d\'Ivoire',        currency: 'XOF',             group: 'africa' },
  { code: 'CM', label: 'Cameroon',              currency: 'XAF',             group: 'africa' },
  { code: 'ET', label: 'Ethiopia',              currency: 'ETB',             group: 'africa' },
  { code: 'TZ', label: 'Tanzania',              currency: 'TZS',             group: 'africa' },
  { code: 'UG', label: 'Uganda',                currency: 'UGX',             group: 'africa' },
  { code: 'RW', label: 'Rwanda',                currency: 'RWF',             group: 'africa' },
  { code: 'BJ', label: 'Benin',                 currency: 'XOF',             group: 'africa' },
  { code: 'TG', label: 'Togo',                  currency: 'XOF',             group: 'africa' },
  { code: 'BF', label: 'Burkina Faso',          currency: 'XOF',             group: 'africa' },
  { code: 'ML', label: 'Mali',                  currency: 'XOF',             group: 'africa' },
  { code: 'NE', label: 'Niger',                 currency: 'XOF',             group: 'africa' },
  { code: 'GN', label: 'Guinea',                currency: 'GNF',             group: 'africa' },
  { code: 'GA', label: 'Gabon',                 currency: 'XAF',             group: 'africa' },
  { code: 'CG', label: 'Congo (Brazzaville)',   currency: 'XAF',             group: 'africa' },
  { code: 'CD', label: 'DR Congo',              currency: 'CDF',             group: 'africa' },
  { code: 'AO', label: 'Angola',                currency: 'AOA',             group: 'africa' },
  { code: 'ZW', label: 'Zimbabwe',              currency: 'ZWL',             group: 'africa' },
  { code: 'ZM', label: 'Zambia',                currency: 'ZMW',             group: 'africa' },
  { code: 'MZ', label: 'Mozambique',            currency: 'MZN',             group: 'africa' },
  { code: 'MG', label: 'Madagascar',            currency: 'MGA',             group: 'africa' },
  { code: 'MU', label: 'Mauritius',             currency: 'MUR',             group: 'africa' },
  { code: 'BW', label: 'Botswana',              currency: 'BWP',             group: 'africa' },
  { code: 'NA', label: 'Namibia',               currency: 'NAD',             group: 'africa' },
  { code: 'MW', label: 'Malawi',                currency: 'MWK',             group: 'africa' },
  // Autre
  { code: 'FR', label: 'France',                currency: 'EUR',             group: 'other' },
  { code: 'BE', label: 'Belgium',               currency: 'EUR',             group: 'other' },
  { code: 'CH', label: 'Switzerland',           currency: 'CHF',             group: 'other' },
  { code: 'CA', label: 'Canada',                currency: 'CAD',             group: 'other' },
  { code: 'US', label: 'United States',         currency: 'USD',             group: 'other' },
  { code: 'GB', label: 'United Kingdom',        currency: 'GBP',             group: 'other' },
  { code: 'DE', label: 'Germany',               currency: 'EUR',             group: 'other' },
  { code: 'ES', label: 'Spain',                 currency: 'EUR',             group: 'other' },
  { code: 'IT', label: 'Italy',                 currency: 'EUR',             group: 'other' },
  { code: 'NL', label: 'Netherlands',           currency: 'EUR',             group: 'other' },
  { code: 'PT', label: 'Portugal',              currency: 'EUR',             group: 'other' },
  { code: 'TR', label: 'Turkey',                currency: 'TRY',             group: 'other' },
];

const STORE_CURRENCIES: { code: string; label: string; symbol: string }[] = [
  { code: 'SAR', label: 'Saudi Riyal',     symbol: 'ر.س' },
  { code: 'AED', label: 'UAE Dirham',      symbol: 'د.إ' },
  { code: 'EGP', label: 'Egyptian Pound',  symbol: 'ج.م' },
  { code: 'MAD', label: 'Moroccan Dirham', symbol: 'د.م.' },
  { code: 'TND', label: 'Tunisian Dinar',  symbol: 'د.ت' },
  { code: 'DZD', label: 'Algerian Dinar',  symbol: 'د.ج' },
  { code: 'QAR', label: 'Qatari Riyal',    symbol: 'ر.ق' },
  { code: 'KWD', label: 'Kuwaiti Dinar',   symbol: 'د.ك' },
  { code: 'BHD', label: 'Bahraini Dinar',  symbol: '.د.ب' },
  { code: 'OMR', label: 'Omani Rial',      symbol: 'ر.ع.' },
  { code: 'JOD', label: 'Jordanian Dinar', symbol: 'د.أ' },
  { code: 'LBP', label: 'Lebanese Pound',  symbol: 'ل.ل' },
  // Afrique sub-saharienne
  { code: 'NGN', label: 'Nigerian Naira',          symbol: '₦' },
  { code: 'KES', label: 'Kenyan Shilling',         symbol: 'KSh' },
  { code: 'ZAR', label: 'South African Rand',      symbol: 'R' },
  { code: 'GHS', label: 'Ghanaian Cedi',           symbol: '₵' },
  { code: 'XOF', label: 'CFA Franc (BCEAO)',       symbol: 'CFA' },
  { code: 'XAF', label: 'CFA Franc (BEAC)',        symbol: 'FCFA' },
  { code: 'ETB', label: 'Ethiopian Birr',          symbol: 'Br' },
  { code: 'TZS', label: 'Tanzanian Shilling',      symbol: 'TSh' },
  { code: 'UGX', label: 'Ugandan Shilling',        symbol: 'USh' },
  { code: 'RWF', label: 'Rwandan Franc',           symbol: 'FRw' },
  { code: 'GNF', label: 'Guinean Franc',           symbol: 'FG' },
  { code: 'CDF', label: 'Congolese Franc',         symbol: 'FC' },
  { code: 'AOA', label: 'Angolan Kwanza',          symbol: 'Kz' },
  { code: 'ZMW', label: 'Zambian Kwacha',          symbol: 'ZK' },
  { code: 'ZWL', label: 'Zimbabwean Dollar',       symbol: 'Z$' },
  { code: 'MZN', label: 'Mozambican Metical',      symbol: 'MT' },
  { code: 'MGA', label: 'Malagasy Ariary',         symbol: 'Ar' },
  { code: 'MUR', label: 'Mauritian Rupee',         symbol: '₨' },
  { code: 'BWP', label: 'Botswana Pula',           symbol: 'P' },
  { code: 'NAD', label: 'Namibian Dollar',         symbol: 'N$' },
  { code: 'MWK', label: 'Malawian Kwacha',         symbol: 'MK' },
  // Autre
  { code: 'EUR', label: 'Euro',                    symbol: '€' },
  { code: 'GBP', label: 'British Pound',           symbol: '£' },
  { code: 'CHF', label: 'Swiss Franc',             symbol: 'CHF' },
  { code: 'TRY', label: 'Turkish Lira',            symbol: '₺' },
  { code: 'USD', label: 'US Dollar',               symbol: '$' },
  { code: 'CAD', label: 'Canadian Dollar',         symbol: 'CA$' },
];

interface StoreType_Doc {
  _id: string;
  name: string;
  slug: string;
  subdomain: string;
  description?: string;
  isPublished?: boolean;
  storeType?: StoreType;
  theme?: { templateId?: string; style?: string };
}

type Step = 'list' | 'choose-type' | 'choose-theme' | 'create-form';

const TYPE_OPTIONS: {
  id: StoreType;
  title: string;
  desc: string;
  bullets: string[];
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  glow: string;
}[] = [
  {
    id: 'physical',
    title: 'Produits physiques',
    desc: 'Vends des produits tangibles livrés à tes clients.',
    bullets: ['Suivi de stock', 'Livraison & poids', 'Variantes (taille, couleur)'],
    icon: Package,
    accent: 'from-indigo-500 to-violet-600',
    glow: 'shadow-indigo-500/30',
  },
  {
    id: 'digital',
    title: 'Produits digitaux',
    desc: 'Vends des fichiers téléchargeables : ebooks, templates, musique, logiciels, cours.',
    bullets: ['Livraison instantanée', 'Pas de stock', 'Liens de téléchargement sécurisés'],
    icon: Cloud,
    accent: 'from-fuchsia-500 to-pink-600',
    glow: 'shadow-fuchsia-500/30',
  },
];

export default function DashboardStoresPage() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreType_Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>('list');
  const [selectedType, setSelectedType] = useState<StoreType | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<StoreThemeTemplate | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCountry, setNewCountry] = useState('');
  const [newLanguage, setNewLanguage] = useState('');
  const [newLanguageTouched, setNewLanguageTouched] = useState(false);
  const [newCurrency, setNewCurrency] = useState('USD');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  function loadStores() {
    setLoading(true);
    storesApi
      .list()
      .then((res) => setStores((res.data as { stores: StoreType_Doc[] }).stores))
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadStores();
  }, []);

  function startCreate() {
    setStep('choose-type');
    setSelectedType(null);
    setSelectedTheme(null);
    setNewName('');
    setNewDescription('');
    setNewCountry('');
    setNewLanguage('');
    setNewLanguageTouched(false);
    setNewCurrency('USD');
    setError('');
  }

  function handleSelectType(type: StoreType) {
    setSelectedType(type);
    setStep('choose-theme');
  }

  function handleSelectTheme(theme: StoreThemeTemplate) {
    setSelectedTheme(theme);
    setStep('create-form');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      setError('Le nom de la boutique est obligatoire');
      return;
    }
    if (!selectedType) {
      setError('Le type de boutique est obligatoire');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await storesApi.create({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        storeType: selectedType,
        theme: selectedTheme ? (selectedTheme.theme as unknown as Record<string, unknown>) : undefined,
        country: newCountry || undefined,
        language: newLanguage || undefined,
        currency: newCurrency || undefined,
      });
      // Drop the seller straight into the store hub for the newly-created
      // store so they can immediately configure sections / upload a logo.
      const newId = (res.data as { store?: { _id?: string } }).store?._id;
      if (newId) {
        router.push(`/dashboard/stores/${newId}`);
      } else {
        setStep('list');
        loadStores();
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : 'La création a échoué';
      setError(msg || 'La création a échoué');
    } finally {
      setCreating(false);
    }
  }

  // ────────────────────────────── Step: Choose type
  if (step === 'choose-type') {
    return (
      <div className="space-y-8 animate-fade-in-up">
        <WizardHeader
          step={1}
          total={3}
          back={() => setStep('list')}
          title="Que vends-tu ?"
          subtitle="Choisis le type de produits pour cette boutique."
        />
        <div className="grid gap-5 md:grid-cols-2">
          {TYPE_OPTIONS.map((opt) => {
            const isActive = selectedType === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectType(opt.id)}
                className={cn(
                  'group relative overflow-hidden rounded-3xl border bg-card p-6 text-left transition-all duration-300',
                  'hover:-translate-y-1 hover:shadow-xl',
                  isActive
                    ? 'border-primary ring-4 ring-primary/15 shadow-lg'
                    : 'border-border/60 hover:border-primary/40'
                )}
              >
                <div
                  className={cn(
                    'pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-40',
                    opt.accent
                  )}
                  aria-hidden
                />
                <div
                  className={cn(
                    'relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3',
                    opt.accent,
                    opt.glow
                  )}
                >
                  <opt.icon className="h-7 w-7" />
                </div>
                <h3 className="relative mt-5 text-xl font-semibold tracking-tight">{opt.title}</h3>
                <p className="relative mt-1 text-sm text-muted-foreground">{opt.desc}</p>
                <ul className="relative mt-4 space-y-1.5">
                  {opt.bullets.map((b) => (
                    <li key={b} className="flex items-center gap-2 text-sm text-foreground/80">
                      <span
                        className={cn(
                          'grid h-4 w-4 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white',
                          opt.accent
                        )}
                      >
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
                <div className="relative mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Choisir
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ────────────────────────────── Step: Choose theme
  if (step === 'choose-theme' && selectedType) {
    return (
      <div className="space-y-8 animate-fade-in-up">
        <WizardHeader
          step={2}
          total={3}
          back={() => setStep('choose-type')}
          title="Choisis un thème"
          subtitle={`Sélectionne un design adapté à ton ${selectedType === 'physical' ? 'commerce physique' : 'produit digital'}. Tu pourras le changer plus tard.`}
        />
        <ThemePreviewGrid
          templates={themesForStoreType(selectedType)}
          selectedId={selectedTheme?.id}
          onSelect={handleSelectTheme}
        />
      </div>
    );
  }

  // ────────────────────────────── Step: Create form
  if (step === 'create-form' && selectedType && selectedTheme) {
    const TypeIcon = selectedType === 'physical' ? Package : Cloud;
    return (
      <div className="mx-auto max-w-2xl space-y-8 animate-fade-in-up">
        <WizardHeader
          step={3}
          total={3}
          back={() => setStep('choose-theme')}
          title="Nomme ta boutique"
          subtitle="Plus qu'à choisir un nom et une description — on s'occupe du reste."
        />

        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 bg-muted/30 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl gradient-brand text-white shadow-md">
                <TypeIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Ton choix</div>
                <div className="text-sm font-medium">
                  {selectedType === 'physical' ? 'Physique' : 'Digital'} · thème {selectedTheme.name}
                </div>
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep('choose-type')}>
              Changer
            </Button>
          </div>

          <form onSubmit={handleCreate} className="space-y-5 p-6">
            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="store-name">Nom de la boutique *</Label>
              <Input
                id="store-name"
                placeholder="Ex: Caftans Marrakech, Bijoux Sahel, Tech Tunisia"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-desc">Description (optionnel)</Label>
              <textarea
                id="store-desc"
                placeholder="Courte description affichée sur ta vitrine"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="flex min-h-[90px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm transition-colors focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
              />
            </div>

            {/* Locale block — used as defaults for AI landing pages */}
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">Marché et langue</h3>
                  <p className="text-xs text-muted-foreground">
                    Ces réglages seront utilisés par défaut pour générer les landing pages AI de ce store.
                  </p>
                </div>
                {newLanguage && directionOf(newLanguage) === 'rtl' && (
                  <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-700">
                    RTL
                  </span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="store-country" className="text-xs">Pays cible</Label>
                  <select
                    id="store-country"
                    value={newCountry}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNewCountry(v);
                      const match = STORE_COUNTRIES.find((c) => c.code === v);
                      if (match) {
                        setNewCurrency(match.currency);
                        if (match.arab && !newLanguageTouched && newLanguage !== 'ar') {
                          setNewLanguage('ar');
                        }
                      }
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">— Choisir —</option>
                    <optgroup label="Monde arabe">
                      {STORE_COUNTRIES.filter((c) => c.group === 'arab').map((c) => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Afrique">
                      {STORE_COUNTRIES.filter((c) => c.group === 'africa').map((c) => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Autre">
                      {STORE_COUNTRIES.filter((c) => c.group === 'other').map((c) => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="store-lang" className="text-xs">Langue</Label>
                  <select
                    id="store-lang"
                    value={newLanguage}
                    onChange={(e) => { setNewLanguage(e.target.value); setNewLanguageTouched(true); }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {STORE_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="store-cur" className="text-xs">Devise</Label>
                  <select
                    id="store-cur"
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {STORE_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.label} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {newCountry && STORE_COUNTRIES.find((c) => c.code === newCountry)?.arab && newLanguage === 'ar' && (
                <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 px-3 py-2 text-xs text-fuchsia-700">
                  Marché arabe détecté → arabe sélectionné automatiquement, layout RTL pour les landing pages.
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="submit"
                disabled={creating}
                className="h-11 gap-2 rounded-xl gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-95"
              >
                <Sparkles className="h-4 w-4" />
                {creating ? 'Création…' : 'Créer la boutique'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl"
                onClick={() => setStep('choose-theme')}
              >
                Changer le thème
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ────────────────────────────── Step: List
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stores</h1>
          <p className="text-muted-foreground">
            Manage all your stores — physical or digital.
          </p>
        </div>
        <Button
          onClick={startCreate}
          className="h-11 gap-2 rounded-xl gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-95"
        >
          <Plus className="h-4 w-4" />
          Create store
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-border/60 bg-card" />
          ))}
        </div>
      ) : stores.length === 0 ? (
        <div className="overflow-hidden rounded-3xl border border-border/60 bg-card p-12 text-center animate-fade-in-up">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl gradient-brand text-white shadow-lg shadow-primary/30 animate-float">
            <StoreIcon className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-semibold">No stores yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Create your first store. Choose between physical or digital products to get started.
          </p>
          <Button
            onClick={startCreate}
            className="mt-6 h-11 gap-2 rounded-xl gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Create your first store
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store, i) => {
            const isDigital = store.storeType === 'digital';
            const TypeIcon = isDigital ? Cloud : Package;
            return (
              <div
                key={store._id}
                style={{ animationDelay: `${i * 60}ms` }}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl animate-fade-in-up"
              >
                <div
                  className={cn(
                    'pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-25',
                    isDigital ? 'from-fuchsia-500 to-pink-500' : 'from-indigo-500 to-violet-500'
                  )}
                  aria-hidden
                />
                <div className="relative flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        'grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md',
                        isDigital
                          ? 'from-fuchsia-500 to-pink-600 shadow-fuchsia-500/30'
                          : 'from-indigo-500 to-violet-600 shadow-indigo-500/30'
                      )}
                    >
                      <TypeIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold tracking-tight">{store.name}</h3>
                      <p className="truncate text-xs text-muted-foreground">/{store.slug}</p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      store.isPublished
                        ? 'bg-emerald-500/10 text-emerald-700'
                        : 'bg-amber-500/10 text-amber-700'
                    )}
                  >
                    {store.isPublished ? 'Live' : 'Draft'}
                  </span>
                </div>

                <div className="relative mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
                      isDigital ? 'bg-fuchsia-500/10 text-fuchsia-700' : 'bg-indigo-500/10 text-indigo-700'
                    )}
                  >
                    <TypeIcon className="h-3 w-3" />
                    {isDigital ? 'Digital' : 'Physical'}
                  </span>
                  {store.theme?.templateId && (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                      Theme: {store.theme.templateId}
                    </span>
                  )}
                </div>

                <div className="relative mt-5 flex flex-wrap gap-2">
                  <Link href={`/dashboard/stores/${store._id}`}>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg">
                      <SettingsIcon className="h-3.5 w-3.5" />
                      Settings
                    </Button>
                  </Link>
                  <Link href={`/dashboard/products?storeId=${store._id}`}>
                    <Button size="sm" className="h-9 gap-1.5 rounded-lg gradient-brand text-white">
                      <Package className="h-3.5 w-3.5" />
                      Products
                    </Button>
                  </Link>
                  <Link href={`/${store.slug}`} target="_blank" rel="noopener">
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-9 gap-1.5 rounded-lg',
                        !store.isPublished && 'border-amber-500/40 text-amber-700 hover:bg-amber-500/10'
                      )}
                      title={store.isPublished ? 'Voir la boutique publiée' : 'Aperçu — la boutique est en brouillon'}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Voir la boutique
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WizardHeader({
  step,
  total,
  back,
  title,
  subtitle,
}: {
  step: number;
  total: number;
  back: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={back} className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Button>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Étape {step}</span>
        <span>sur {total}</span>
        <div className="ml-2 flex flex-1 max-w-[120px] gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-all duration-300',
                i < step ? 'gradient-brand' : 'bg-muted'
              )}
            />
          ))}
        </div>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
