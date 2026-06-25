'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Circle, Truck, Eye, AlertTriangle, Clock, Lock, Zap, Copy, Check, Loader2, Power } from 'lucide-react';
import { storesApi, extractApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { StoreSubPageShell, type SaveStatus } from '@/components/dashboard/store-sub-page';
import type { DeliveryIntegration, StoreType } from '@/components/dashboard/store-editor';
import { cn } from '@/lib/utils';

export default function StoreDeliveryPage() {
  const params = useParams();
  const router = useRouter();
  const storeId = params.storeId as string;
  const [store, setStore] = useState<StoreType | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [delivery, setDelivery] = useState<DeliveryIntegration>({
    provider: 'mogadelivery',
    enabled: false,
    autoDispatch: true,
  });
  // Onboarding auto MD
  const [connecting, setConnecting] = useState(false);
  const [togglingConn, setTogglingConn] = useState(false);
  const [connectResult, setConnectResult] = useState<null | {
    kind: 'success' | 'manual' | 'error';
    message: string;
    secret?: string;
  }>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [mdJwt, setMdJwt] = useState('');
  const [existingBoutiqueId, setExistingBoutiqueId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    setConnectResult(null);
    try {
      const res = await storesApi.connectMogaDelivery(storeId, {
        sellerToken: mdJwt.trim() || undefined,
        existingBoutiqueId: existingBoutiqueId.trim() || undefined,
      });
      if (res.data.mode === 'auto') {
        setConnectResult({
          kind: 'success',
          message: `Boutique connectée chez MogaDelivery. Le secret a été généré et synchronisé (preview ${res.data.webhookSecretPreview}). Tu peux retenter un dispatch.`,
        });
        // Recharge le store pour afficher le secret en DB
        const fresh = await storesApi.get(storeId);
        const s = (fresh.data as { store: StoreType }).store;
        if (s.integrations?.delivery) {
          setDelivery({
            provider: s.integrations.delivery.provider || 'mogadelivery',
            enabled: !!s.integrations.delivery.enabled,
            apiKey: s.integrations.delivery.apiKey || '',
            baseUrl: s.integrations.delivery.baseUrl || '',
            webhookSecret: s.integrations.delivery.webhookSecret || '',
            login: s.integrations.delivery.login || '',
            pwd: s.integrations.delivery.pwd || '',
            autoDispatch: s.integrations.delivery.autoDispatch !== false,
            pickupAddress: s.integrations.delivery.pickupAddress || {},
          });
        }
      } else {
        setConnectResult({
          kind: 'manual',
          secret: res.data.webhookSecret,
          message: res.data.message || 'Mode manuel : envoie ce secret à MogaDelivery puis enregistre.',
        });
      }
    } catch (err) {
      setConnectResult({ kind: 'error', message: extractApiError(err, 'Onboarding échoué.') });
    } finally {
      setConnecting(false);
    }
  }

  async function handleToggleConnection(connect: boolean) {
    setTogglingConn(true);
    setConnectResult(null);
    try {
      await storesApi.setDeliveryConnection(storeId, connect);
      setDelivery((d) => ({ ...d, enabled: connect }));
      setConnectResult({
        kind: 'success',
        message: connect
          ? 'Intégration reconnectée — les dispatchs reprennent. Secret inchangé, aucun risque de 401.'
          : 'Intégration déconnectée — dispatchs suspendus. Ton secret et ta Boutique MogaDelivery sont conservés ; reconnecte quand tu veux.',
      });
    } catch (err) {
      setConnectResult({ kind: 'error', message: extractApiError(err, 'Action impossible.') });
    } finally {
      setTogglingConn(false);
    }
  }

  async function copyManualSecret() {
    const s = connectResult?.secret;
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch { /* fallback : selection manuelle */ }
  }

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
            login: s.integrations.delivery.login || '',
            pwd: s.integrations.delivery.pwd || '',
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
    setStatus('saving');
    setErrorMessage('');
    try {
      const newIntegrations = { ...(store.integrations || {}), delivery: { ...delivery } };
      const res = await storesApi.update(storeId, { integrations: newIntegrations });
      const updated = (res.data as { store: StoreType }).store;
      setStore(updated);
      if (updated.integrations?.delivery) {
        setDelivery({
          provider: updated.integrations.delivery.provider || 'mogadelivery',
          enabled: !!updated.integrations.delivery.enabled,
          apiKey: updated.integrations.delivery.apiKey || '',
          baseUrl: updated.integrations.delivery.baseUrl || '',
          webhookSecret: updated.integrations.delivery.webhookSecret || '',
          login: updated.integrations.delivery.login || '',
          pwd: updated.integrations.delivery.pwd || '',
          autoDispatch: updated.integrations.delivery.autoDispatch !== false,
          pickupAddress: updated.integrations.delivery.pickupAddress || {},
        });
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2400);
    } catch (err: unknown) {
      console.error('[store/delivery] save failed', err);
      setErrorMessage(extractApiError(err, "L'enregistrement a échoué. Réessaie."));
      setStatus('error');
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
      status={status}
      errorMessage={errorMessage}
      onSave={handleSave}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                {delivery.provider === 'bestdelivery' ? 'Best Delivery' : 'MogaDelivery'}
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
          {/* Sélecteur de transporteur */}
          <div className="space-y-1.5">
            <Label htmlFor="delivery-provider">Transporteur</Label>
            <select
              id="delivery-provider"
              value={delivery.provider || 'mogadelivery'}
              onChange={(e) => setDelivery((d) => ({ ...d, provider: e.target.value as DeliveryIntegration['provider'] }))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="mogadelivery">MogaDelivery — multi-pays (Afrique de l&apos;Ouest)</option>
              <option value="bestdelivery">Best Delivery — Tunisie (SOAP)</option>
            </select>
          </div>

          {/* ── Best Delivery (Tunisie) — auth login/pwd, SOAP, suivi en polling (phase 2) ── */}
          {delivery.provider === 'bestdelivery' && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-md bg-sky-500/10 px-3 py-2 text-xs text-sky-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Best Delivery couvre la <strong>Tunisie</strong>. Renseigne les identifiants de ton compte expéditeur.
                  Le suivi de statut se fera par interrogation automatique (polling) — disponible en phase 2.
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bd-login">Login Best Delivery <span className="text-rose-600">*</span></Label>
                  <Input
                    id="bd-login"
                    autoComplete="off"
                    placeholder="login du compte expéditeur"
                    value={delivery.login || ''}
                    onChange={(e) => setDelivery((d) => ({ ...d, login: e.target.value }))}
                    className={delivery.enabled && !delivery.login?.trim() ? 'border-rose-500/60' : ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bd-pwd">Mot de passe <span className="text-rose-600">*</span></Label>
                  <Input
                    id="bd-pwd"
                    type="password"
                    autoComplete="off"
                    placeholder="••••••••"
                    value={delivery.pwd || ''}
                    onChange={(e) => setDelivery((d) => ({ ...d, pwd: e.target.value }))}
                    className={delivery.enabled && !delivery.pwd?.trim() ? 'border-rose-500/60' : ''}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bd-wsdl">WSDL (avancé)</Label>
                <Input
                  id="bd-wsdl"
                  placeholder="https://api.best-delivery.net/serviceShipments.php?wsdl"
                  value={delivery.baseUrl || ''}
                  onChange={(e) => setDelivery((d) => ({ ...d, baseUrl: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Laisse vide pour l&apos;endpoint de production par défaut.</p>
              </div>
              <p className="text-[11px] text-muted-foreground">
                ℹ️ Le governorat de livraison requis par Best Delivery est repris du champ « état/région » de l&apos;adresse de la commande.
              </p>
            </div>
          )}

          {delivery.provider !== 'bestdelivery' && (
          <>
          {/* Statut de connexion + déconnexion douce / reconnexion. Visible
              dès qu'un secret est en place (boutique déjà connectée). Bascule
              juste le master switch — secret et Boutique MD conservés. */}
          {delivery.webhookSecret && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                    delivery.enabled
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                      : 'border-border bg-muted text-muted-foreground'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${delivery.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
                  {delivery.enabled ? 'Connecté' : 'Déconnecté'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {delivery.enabled
                    ? 'Les commandes payées partent automatiquement chez le coursier.'
                    : 'Dispatchs suspendus — secret et Boutique MD conservés.'}
                </span>
              </div>
              <Button
                type="button"
                variant={delivery.enabled ? 'outline' : 'default'}
                onClick={() => handleToggleConnection(!delivery.enabled)}
                disabled={togglingConn}
                className="gap-2"
              >
                {togglingConn ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                {delivery.enabled ? 'Déconnecter' : 'Reconnecter'}
              </Button>
            </div>
          )}

          {/* Onboarding auto — recommandé pour les nouvelles boutiques et
              les reconnexions après un secret désynchronisé. */}
          <div className="rounded-xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/5 to-rose-500/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-fuchsia-700" />
                  <h3 className="text-sm font-semibold">Connexion automatique MogaDelivery</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Crée ta Boutique côté MogaDelivery (ou resync le secret si déjà créée), génère un HMAC et le pose des deux côtés en un clic.
                  Colle ton JWT MD dans Avancé si tu en as un — sinon on bascule en mode manuel.
                </p>
              </div>
              <Button type="button" onClick={handleConnect} disabled={connecting} className="gap-2">
                {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                {delivery.webhookSecret ? 'Resynchroniser' : 'Connecter'}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="mt-2 text-[11px] font-medium text-fuchsia-700 hover:underline"
            >
              {showAdvanced ? 'Masquer' : 'Afficher'} les options avancées (JWT MD, boutique existante)
            </button>
            {showAdvanced && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor="md-jwt" className="text-[11px]">JWT seller MogaDelivery (optionnel)</Label>
                  <Input
                    id="md-jwt"
                    type="password"
                    autoComplete="off"
                    value={mdJwt}
                    onChange={(e) => setMdJwt(e.target.value)}
                    placeholder="eyJhbGciOi..."
                    className="font-mono text-xs"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Connecte-toi sur admin-mogadelivery.com, copie ton token depuis DevTools (Application → Storage → JWT). Servirá uniquement pour cet appel.
                  </p>
                </div>
                <div>
                  <Label htmlFor="md-boutique" className="text-[11px]">boutiqueId existant (resync)</Label>
                  <Input
                    id="md-boutique"
                    value={existingBoutiqueId}
                    onChange={(e) => setExistingBoutiqueId(e.target.value)}
                    placeholder="Laisse vide pour créer une nouvelle Boutique"
                    className="text-xs"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Si MogaDelivery a déjà créé la Boutique, colle son id pour juste rotater le secret.
                  </p>
                </div>
              </div>
            )}
            {connectResult && (
              <div
                className={`mt-3 rounded-md px-3 py-2 text-xs ${
                  connectResult.kind === 'success' ? 'bg-emerald-500/10 text-emerald-800' :
                  connectResult.kind === 'manual' ? 'bg-amber-500/10 text-amber-800' :
                  'bg-rose-500/10 text-rose-800'
                }`}
              >
                <p>{connectResult.message}</p>
                {connectResult.kind === 'manual' && connectResult.secret && (
                  <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5">
                    <code className="flex-1 truncate font-mono text-[11px]">{connectResult.secret}</code>
                    <button
                      type="button"
                      onClick={copyManualSecret}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium transition-colors hover:bg-muted"
                    >
                      {secretCopied ? <Check className="h-3 w-3 text-emerald-700" /> : <Copy className="h-3 w-3" />}
                      {secretCopied ? 'Copié' : 'Copier'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

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
            <Label htmlFor="moga-secret">
              Secret webhook <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="moga-secret"
              type="password"
              autoComplete="off"
              placeholder="64 caractères hexadécimaux fournis par MogaDelivery"
              value={delivery.webhookSecret || ''}
              onChange={(e) => setDelivery((d) => ({ ...d, webhookSecret: e.target.value }))}
              className={delivery.enabled && !delivery.webhookSecret?.trim() ? 'border-rose-500/60' : ''}
            />
            <p className="text-xs text-muted-foreground">
              <strong>Obligatoire.</strong> Demande-le à MogaDelivery (dashboard → API → Webhook secret).
              Sans cette clé, les commandes ne pourront pas être envoyées (401 Unauthorized).
            </p>
            {delivery.enabled && !delivery.webhookSecret?.trim() && (
              <div className="flex items-start gap-2 rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Le dispatch est activé mais aucun secret n&apos;est posé — chaque commande échouera avec un 401.
                  Récupère la clé sur ton dashboard MogaDelivery et colle-la ici.
                </span>
              </div>
            )}
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
          </>
          )}

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

      {/* Autres transporteurs — pas encore intégrés mais affichés pour
          que le vendeur sache que la couverture s'étend. Cards verrouillées,
          pas d'inputs branchés. */}
      <UpcomingCarrierCard
        name="Codrox"
        status="soon"
        regions="Afrique du Nord + Europe"
        pitch="Coursier multi-pays, dispatch automatique des commandes payées. Intégration en cours de finalisation."
      />
      <UpcomingCarrierCard
        name="ShipBob"
        status="planned"
        regions="USA · UK · UE · CA"
        pitch="3PL avec entrepôts pré-positionnés pour livrer en 2-3 jours sur tes marchés Tier 1. Intégration prévue après les tests pilotes."
      />

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
        </div>

        {/* ── STICKY RIGHT — real-time integration readiness checklist ──
            Masquée sous lg pour libérer l'espace d'édition sur tablette. */}
        <aside className="hidden lg:sticky lg:top-4 lg:self-start lg:block">
          <DeliveryReadinessPreview cfg={delivery} />
        </aside>
      </div>
    </StoreSubPageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Live config checklist — non-iframe preview that shows whether each
// piece needed for auto-dispatch is in place. Updates as the seller
// types so they see the integration "fill up" green in real time.
// ─────────────────────────────────────────────────────────────────────

function DeliveryReadinessPreview({ cfg }: { cfg: DeliveryIntegration }) {
  const pickup = cfg.pickupAddress || {};
  const hasKey      = !!cfg.apiKey?.trim();
  const hasContact  = !!(pickup.contactName?.trim() && pickup.contactPhone?.trim());
  const hasAddress  = !!(pickup.line1?.trim() && pickup.city?.trim() && pickup.country?.trim());
  const hasSecret   = !!cfg.webhookSecret?.trim();
  const enabled     = !!cfg.enabled;

  const checks = [
    { key: 'enabled',  label: 'Intégration activée',         done: enabled,    required: true,
      hint: enabled ? 'Active.' : 'Coche « Activé » en haut de la carte MogaDelivery.' },
    { key: 'key',      label: 'Clé API MogaDelivery',         done: hasKey,     required: true,
      hint: hasKey ? 'Configurée.' : 'Récupère-la dans admin-mogadelivery.com → API.' },
    { key: 'contact',  label: 'Contact de l\'expédition',     done: hasContact, required: true,
      hint: hasContact ? 'Nom + téléphone OK.' : 'Renseigne le nom + téléphone du contact.' },
    { key: 'address',  label: 'Adresse de retrait',           done: hasAddress, required: true,
      hint: hasAddress ? 'Adresse complète.' : 'Manque adresse, ville ou pays.' },
    { key: 'secret',   label: 'Secret webhook (recommandé)',  done: hasSecret,  required: false,
      hint: hasSecret ? 'Webhooks signés.' : 'Ajoute-le pour vérifier la signature HMAC des webhooks.' },
  ];

  const totalReq = checks.filter((c) => c.required).length;
  const doneReq  = checks.filter((c) => c.required && c.done).length;
  const ready    = doneReq === totalReq;
  const pct      = Math.round((doneReq / totalReq) * 100);
  const auto     = cfg.autoDispatch !== false;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-gradient-to-r from-muted/30 to-muted/10 px-3 py-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Eye className="h-3 w-3" />
          Aperçu intégration
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold',
            ready ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', ready ? 'bg-emerald-500' : 'bg-amber-500')} />
          {ready ? 'Prêt' : `${pct}%`}
        </span>
      </div>

      <div className="space-y-3 p-4">
        {/* Status banner */}
        <div
          className={cn(
            'flex items-center gap-2 rounded-xl border p-3',
            ready
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-amber-500/30 bg-amber-500/5'
          )}
        >
          <span
            className={cn(
              'grid h-9 w-9 shrink-0 place-items-center rounded-full text-white shadow-sm',
              ready ? 'bg-emerald-500' : 'bg-amber-500'
            )}
          >
            <Truck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className={cn('text-xs font-bold', ready ? 'text-emerald-800' : 'text-amber-800')}>
              {ready ? 'Dispatch automatique opérationnel' : 'Configuration incomplète'}
            </div>
            <div className={cn('text-[10px]', ready ? 'text-emerald-700' : 'text-amber-700')}>
              {ready
                ? auto
                  ? 'Chaque commande payée part vers MogaDelivery sans action.'
                  : 'Tu devras dispatcher manuellement depuis la liste des commandes.'
                : `Il reste ${totalReq - doneReq} étape${totalReq - doneReq > 1 ? 's' : ''} obligatoire${totalReq - doneReq > 1 ? 's' : ''}.`}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] font-medium text-muted-foreground">
            <span>Progression</span>
            <span>{doneReq}/{totalReq} obligatoires</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full transition-all duration-300',
                ready ? 'bg-emerald-500' : 'bg-amber-500'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Checklist */}
        <ul className="space-y-1.5">
          {checks.map((c) => {
            const Icon = c.done ? CheckCircle2 : Circle;
            return (
              <li
                key={c.key}
                className={cn(
                  'flex items-start gap-2 rounded-lg border p-2 text-[11px] transition-colors',
                  c.done
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : c.required
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-border/60 bg-muted/20'
                )}
              >
                <Icon
                  className={cn(
                    'mt-0.5 h-3.5 w-3.5 shrink-0',
                    c.done ? 'text-emerald-600' : c.required ? 'text-amber-600' : 'text-muted-foreground/60'
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('font-semibold', c.done ? 'text-foreground' : 'text-foreground/80')}>
                      {c.label}
                    </span>
                    {!c.required && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">
                        optionnel
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{c.hint}</p>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Flow indicator */}
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Flux d&apos;une commande
          </div>
          <div className="space-y-1.5">
            {[
              { step: '1', label: 'Client passe commande (COD)', ok: true },
              { step: '2', label: auto ? 'Envoi auto à MogaDelivery' : 'Envoi manuel à MogaDelivery', ok: ready },
              { step: '3', label: 'Coursier collecte le colis', ok: ready && hasAddress },
              { step: '4', label: 'Webhook → statut à jour', ok: ready && (hasSecret || true) },
            ].map((s) => (
              <div key={s.step} className="flex items-center gap-2">
                <span
                  className={cn(
                    'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white',
                    s.ok ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                  )}
                >
                  {s.step}
                </span>
                <span className={cn('text-[10px]', s.ok ? 'text-foreground' : 'text-muted-foreground')}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {!ready && (
          <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-50 p-2">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
            <p className="text-[10px] leading-snug text-amber-800">
              Tant que la config n&apos;est pas verte, MogaDelivery refusera les dispatch (clé API ou
              adresse manquante = erreur 422).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Carte « transporteur à venir » — sert à signaler au vendeur quelles
 * intégrations arrivent sans débloquer aucune action. Le but : poser
 * la roadmap dans son contexte (il voit qu'il n'est pas bloqué à vie
 * avec un seul partenaire) sans introduire de faux toggles qui
 * laisseraient croire qu'on est branché.
 *
 * - status='soon'    → bientôt disponible (en finalisation)
 * - status='planned' → pas encore disponible (roadmap, plus loin)
 */
function UpcomingCarrierCard({
  name,
  status,
  regions,
  pitch,
}: {
  name: string;
  status: 'soon' | 'planned';
  regions: string;
  pitch: string;
}) {
  const isSoon = status === 'soon';
  return (
    <Card className="border-dashed bg-muted/30 opacity-90">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              {name}
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold',
                  isSoon
                    ? 'bg-amber-500/10 text-amber-700'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {isSoon ? <Clock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                {isSoon ? 'Bientôt' : 'Pas encore disponible'}
              </span>
            </CardTitle>
            <CardDescription className="mt-1">
              {pitch}
            </CardDescription>
          </div>
          {/* Toggle visuellement présent mais désactivé — montre que la
              place de l'option est réservée. */}
          <label className="inline-flex cursor-not-allowed items-center gap-2 opacity-50">
            <input type="checkbox" disabled className="h-4 w-4 rounded border-input" />
            <span className="text-sm font-medium">Activé</span>
          </label>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1">
            <Truck className="h-3 w-3" />
            {regions}
          </span>
          <span>
            On te ping dès que c&apos;est branché — pas besoin de revenir vérifier.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
