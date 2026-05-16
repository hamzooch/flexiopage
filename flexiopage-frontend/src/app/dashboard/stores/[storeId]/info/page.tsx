'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi, extractApiError } from '@/lib/api';
import { StoreSubPageShell, type SaveStatus } from '@/components/dashboard/store-sub-page';
import {
  SETTINGS_COUNTRIES,
  SETTINGS_CURRENCIES,
  SETTINGS_LANGUAGES,
  directionOf,
  type StoreType,
} from '@/components/dashboard/store-editor';

export default function StoreInfoPage() {
  const params = useParams();
  const storeId = params.storeId as string;
  const [store, setStore] = useState<StoreType | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('');
  const [currency, setCurrency] = useState('USD');

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
        setCountry(s.settings?.country || '');
        setLanguage(s.settings?.language || '');
        setCurrency(s.settings?.currency || 'USD');
      })
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, [storeId]);

  async function handleSave() {
    if (!store) return;
    setStatus('saving');
    setErrorMessage('');
    try {
      const newSettings = {
        ...(store.settings || {}),
        currency: currency || 'USD',
        language: language || undefined,
        country: country || undefined,
        direction: directionOf(language),
      };
      const res = await storesApi.update(storeId, {
        name,
        description: description || undefined,
        customDomain: customDomain || undefined,
        settings: newSettings,
      });
      const updated = (res.data as { store: StoreType }).store;
      setStore(updated);
      setName(updated.name);
      setDescription(updated.description || '');
      setCustomDomain(updated.customDomain || '');
      setCountry(updated.settings?.country || '');
      setLanguage(updated.settings?.language || '');
      setCurrency(updated.settings?.currency || 'USD');
      setStatus('saved');
      // Drop the success pill back to idle after a short moment so it doesn't
      // linger forever — long enough to be read, short enough to feel snappy.
      setTimeout(() => setStatus('idle'), 2400);
    } catch (err: unknown) {
      console.error('[store/info] save failed', err);
      setErrorMessage(extractApiError(err, "L'enregistrement a échoué. Réessaie."));
      setStatus('error');
    }
  }

  if (loading || !store) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <StoreSubPageShell
      storeId={storeId}
      storeName={store.name}
      title="Informations"
      description="Nom, description, langue, devise, pays, et domaine personnalisé."
      status={status}
      errorMessage={errorMessage}
      onSave={handleSave}
    >
      <Card>
        <CardHeader>
          <CardTitle>Identité de la boutique</CardTitle>
          <CardDescription>Visible par tes clients dans la navbar et dans les emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom de la boutique *</Label>
            <Input id="name" placeholder="Ex: Caftans Marrakech" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description courte</Label>
            <textarea
              id="description"
              placeholder="Ex: Vente de bijoux artisanaux livrés en 48h"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">1-2 phrases qui résument l&apos;activité (SEO + sous-titre du hero).</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Marché &amp; langue</CardTitle>
              <CardDescription>Pré-remplit la génération AI des landing pages.</CardDescription>
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
              <Label htmlFor="country">Pays cible</Label>
              <select
                id="country"
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
              <Label htmlFor="lang">Langue</Label>
              <select
                id="lang"
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
              <Label htmlFor="cur">Devise</Label>
              <select
                id="cur"
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

      <Card>
        <CardHeader>
          <CardTitle>Domaine personnalisé</CardTitle>
          <CardDescription>Optionnel — branche ton propre nom de domaine sur cette boutique.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="domain">Domaine</Label>
            <Input
              id="domain"
              placeholder="Ex: www.maboutique.com"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Configure un CNAME chez ton registrar vers <code className="rounded bg-muted px-1 py-0.5 text-[11px]">cname.flexiopage.com</code>.
            </p>
          </div>
        </CardContent>
      </Card>
    </StoreSubPageShell>
  );
}
