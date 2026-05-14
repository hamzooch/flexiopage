'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi } from '@/lib/api';
import { StoreSubPageShell, type SaveStatus } from '@/components/dashboard/store-sub-page';
import { FieldToggle, type CodFormSettings, type StoreType } from '@/components/dashboard/store-editor';

export default function StoreCheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const [store, setStore] = useState<StoreType | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [codForm, setCodForm] = useState<CodFormSettings>({
    showEmail: false,
    requireEmail: false,
    showAddressLine2: false,
    showCity: false,
    showPostalCode: false,
    showState: false,
    showNotes: false,
    showQuantity: true,
  });

  useEffect(() => {
    if (!storeId) return;
    storesApi
      .get(storeId)
      .then((res) => {
        const s = (res.data as { store: StoreType }).store;
        setStore(s);
        if (s.storeType === 'digital') {
          // No COD on digital stores — bounce to hub
          router.replace(`/dashboard/stores/${storeId}`);
          return;
        }
        if (s.settings?.codForm) {
          setCodForm({
            showEmail: false,
            requireEmail: false,
            showAddressLine2: false,
            showCity: false,
            showPostalCode: false,
            showState: false,
            showNotes: false,
            showQuantity: true,
            ...s.settings.codForm,
          });
        }
      })
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, [storeId, router]);

  async function handleSave() {
    if (!store) return;
    setStatus('saving');
    setErrorMessage('');
    try {
      const newSettings = { ...(store.settings || {}), codForm };
      await storesApi.update(storeId, { settings: newSettings });
      setStore({ ...store, settings: newSettings });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2400);
    } catch (err: unknown) {
      console.error('[store/checkout] save failed', err);
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : (err as Error)?.message;
      setErrorMessage(msg || "L'enregistrement a échoué. Réessaie.");
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
      title="Formulaire de commande (COD)"
      description="Le formulaire « paiement à la livraison » qui s'affiche sous chaque produit physique."
      status={status}
      errorMessage={errorMessage}
      onSave={handleSave}
    >
      <Card>
        <CardHeader>
          <CardTitle>Textes affichés au client</CardTitle>
          <CardDescription>Personnalise le titre, le bouton et la phrase rassurante du formulaire.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cod-headline">Titre en haut du formulaire</Label>
              <Input
                id="cod-headline"
                placeholder="Ex: Commander · Paiement à la livraison"
                value={codForm.headline || ''}
                onChange={(e) => setCodForm({ ...codForm, headline: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cod-submit">Texte du bouton de validation</Label>
              <Input
                id="cod-submit"
                placeholder="Ex: Commander · اطلب الآن"
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Champs visibles</CardTitle>
          <CardDescription>Choisis quels champs apparaissent dans le formulaire client.</CardDescription>
        </CardHeader>
        <CardContent>
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
              label="Ville"
              sublabel="Demande la ville de livraison"
              checked={!!codForm.showCity}
              onChange={(v) => setCodForm({ ...codForm, showCity: v })}
            />
            <FieldToggle
              label="Complément d'adresse"
              sublabel="Étage, repère, appartement…"
              checked={!!codForm.showAddressLine2}
              onChange={(v) => setCodForm({ ...codForm, showAddressLine2: v })}
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
          <p className="mt-4 text-xs text-muted-foreground">
            Nom complet, téléphone (avec code pays) et adresse sont toujours affichés et obligatoires. Tous les autres champs sont masqués par défaut — active-les ici si tu en as besoin.
          </p>
        </CardContent>
      </Card>
    </StoreSubPageShell>
  );
}
