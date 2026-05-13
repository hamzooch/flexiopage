'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi } from '@/lib/api';
import { StoreSubPageShell } from '@/components/dashboard/store-sub-page';
import type { DeliveryIntegration, StoreType } from '@/components/dashboard/store-editor';

export default function StoreDeliveryPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const [store, setStore] = useState<StoreType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryIntegration>({
    provider: 'mogadelivery',
    enabled: false,
    autoDispatch: true,
  });

  useEffect(() => {
    if (!storeId) return;
    storesApi
      .get(storeId)
      .then((res) => {
        const s = (res.data as { store: StoreType }).store;
        setStore(s);
        if (s.storeType === 'digital') {
          router.replace(`/dashboard/stores/${storeId}`);
          return;
        }
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
      })
      .catch(() => setStore(null))
      .finally(() => setLoading(false));
  }, [storeId, router]);

  async function handleSave() {
    if (!store) return;
    setSaving(true);
    try {
      const newIntegrations = { ...(store.integrations || {}), delivery: { ...delivery } };
      await storesApi.update(storeId, { integrations: newIntegrations });
      setStore({ ...store, integrations: newIntegrations });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !store) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  const webhookUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/webhooks/mogadelivery`;

  return (
    <StoreSubPageShell
      storeId={storeId}
      storeName={store.name}
      title="Livraison & logistique"
      description="Connecte ton compte MogaDelivery — chaque commande payée part automatiquement chez le coursier."
      saving={saving}
      onSave={handleSave}
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                MogaDelivery
                <span className="rounded-full bg-fuchsia-500/10 px-2.5 py-1 text-[10px] font-semibold text-fuchsia-700">
                  Coursier intégré
                </span>
              </CardTitle>
              <CardDescription className="mt-1">
                Dispatch automatique des commandes payées vers le coursier.
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
              <Label htmlFor="moga-key">Clé API MogaDelivery *</Label>
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
              Configure ce même secret côté MogaDelivery pour qu&apos;on vérifie la signature des webhooks entrants.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">URL du webhook entrant</div>
            <code className="mt-1.5 block truncate rounded-md bg-background px-3 py-2 font-mono text-xs">
              {webhookUrl}
            </code>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Ajoute cette URL dans ta config MogaDelivery pour recevoir les changements de statut (assigné, en transit, livré, retourné).
            </p>
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
                Dès qu&apos;une commande est payée (ou COD), elle est envoyée automatiquement à MogaDelivery.
                Décoche pour dispatcher manuellement depuis la liste des commandes.
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adresse d&apos;expédition</CardTitle>
          <CardDescription>
            Le coursier vient récupérer les colis à cette adresse. Renseigne tous les champs pour qu&apos;il trouve le bon endroit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pickup-contact-name">Nom du contact *</Label>
              <Input
                id="pickup-contact-name"
                placeholder="Ex: Aïssatou Diallo"
                value={delivery.pickupAddress?.contactName || ''}
                onChange={(e) =>
                  setDelivery((d) => ({ ...d, pickupAddress: { ...(d.pickupAddress || {}), contactName: e.target.value } }))
                }
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
                onChange={(e) =>
                  setDelivery((d) => ({ ...d, pickupAddress: { ...(d.pickupAddress || {}), contactPhone: e.target.value } }))
                }
              />
              <p className="text-[11px] text-muted-foreground">Format international avec indicatif pays.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pickup-line1">Adresse complète *</Label>
              <Input
                id="pickup-line1"
                placeholder="Ex: 12 Rue Félix Faure, Plateau"
                value={delivery.pickupAddress?.line1 || ''}
                onChange={(e) =>
                  setDelivery((d) => ({ ...d, pickupAddress: { ...(d.pickupAddress || {}), line1: e.target.value } }))
                }
              />
              <p className="text-[11px] text-muted-foreground">N°, rue, quartier — comme sur Google Maps.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pickup-city">Ville *</Label>
              <Input
                id="pickup-city"
                placeholder="Ex: Dakar"
                value={delivery.pickupAddress?.city || ''}
                onChange={(e) =>
                  setDelivery((d) => ({ ...d, pickupAddress: { ...(d.pickupAddress || {}), city: e.target.value } }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pickup-country">Pays *</Label>
              <Input
                id="pickup-country"
                placeholder="Ex: SN, CI, MA, TN"
                value={delivery.pickupAddress?.country || ''}
                onChange={(e) =>
                  setDelivery((d) => ({ ...d, pickupAddress: { ...(d.pickupAddress || {}), country: e.target.value } }))
                }
              />
              <p className="text-[11px] text-muted-foreground">Code ISO à 2 lettres (ex: SN pour Sénégal).</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </StoreSubPageShell>
  );
}
