'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { storesApi, extractApiError } from '@/lib/api';
import { StoreSubPageShell, type SaveStatus } from '@/components/dashboard/store-sub-page';
import { FieldToggle, type CodFormSettings, type StoreType } from '@/components/dashboard/store-editor';
import { cn } from '@/lib/utils';
import { Wallet } from 'lucide-react';

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
      const res = await storesApi.update(storeId, { settings: newSettings });
      const updated = (res.data as { store: StoreType }).store;
      setStore(updated);
      if (updated.settings?.codForm) {
        setCodForm({
          showEmail: false,
          requireEmail: false,
          showAddressLine2: false,
          showCity: false,
          showPostalCode: false,
          showState: false,
          showNotes: false,
          showQuantity: true,
          ...updated.settings.codForm,
        });
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2400);
    } catch (err: unknown) {
      console.error('[store/checkout] save failed', err);
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
      title="Formulaire de commande (COD)"
      description="Le formulaire « paiement à la livraison » qui s'affiche sous chaque produit physique."
      status={status}
      errorMessage={errorMessage}
      onSave={handleSave}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
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
          <CardTitle>Design du formulaire</CardTitle>
          <CardDescription>
            Personnalise les couleurs et l&apos;animation du bouton « Commander ».
            Laisse vide pour suivre le thème de la boutique.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <ColorField
              label="Fond du formulaire"
              value={codForm.backgroundColor}
              onChange={(c) => setCodForm({ ...codForm, backgroundColor: c })}
              defaultLabel="Surface du thème"
            />
            <ColorField
              label="Couleur du bouton"
              value={codForm.buttonColor}
              onChange={(c) => setCodForm({ ...codForm, buttonColor: c })}
              defaultLabel="Primaire du thème"
            />
            <ColorField
              label="Texte du bouton"
              value={codForm.buttonTextColor}
              onChange={(c) => setCodForm({ ...codForm, buttonTextColor: c })}
              defaultLabel="Auto"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Forme du bouton</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { v: 'pill',    label: 'Pilule',  preview: 'rounded-full' },
                  { v: 'rounded', label: 'Arrondi', preview: 'rounded-lg' },
                  { v: 'square',  label: 'Carré',   preview: 'rounded-none' },
                ] as const).map((opt) => {
                  const isActive = (codForm.buttonShape || 'pill') === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setCodForm({ ...codForm, buttonShape: opt.v })}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-all',
                        isActive
                          ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                          : 'border-border/60 text-muted-foreground hover:border-primary/40'
                      )}
                    >
                      <div className={cn('h-3 w-12 bg-gradient-to-r from-fuchsia-500 to-pink-500', opt.preview)} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Animation du bouton</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { v: 'none',     label: 'Statique' },
                  { v: 'pulse',    label: 'Pulsation' },
                  { v: 'shimmer',  label: 'Brillance' },
                  { v: 'bounce',   label: 'Bondi' },
                ] as const).map((opt) => {
                  const current = codForm.buttonAnimated === false
                    ? 'none'
                    : (codForm.buttonAnimation || 'pulse');
                  const isActive = current === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setCodForm({
                        ...codForm,
                        buttonAnimated: opt.v !== 'none',
                        buttonAnimation: opt.v === 'none' ? 'none' : opt.v,
                      })}
                      className={cn(
                        'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all',
                        isActive
                          ? 'border-primary bg-primary/5 text-foreground shadow-sm'
                          : 'border-border/60 text-muted-foreground hover:border-primary/40'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                L&apos;animation attire l&apos;œil sur l&apos;action de commander — utile pour les pubs.
              </p>
            </div>
          </div>

        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Frais de livraison</CardTitle>
          <CardDescription>
            Montant ajouté automatiquement au prix du produit dans le total à payer
            à la livraison. Laisse 0 pour ne rien facturer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:max-w-sm">
            <Label htmlFor="cod-shipping">Frais de livraison ({store.settings?.currency || 'TND'})</Label>
            <div className="relative">
              <Input
                id="cod-shipping"
                type="number"
                min={0}
                step="0.01"
                value={codForm.shippingFee ?? ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setCodForm({ ...codForm, shippingFee: Number.isFinite(v) && v >= 0 ? v : undefined });
                }}
                placeholder="0"
                className="pr-12 text-sm"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                {store.settings?.currency || 'TND'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Le client voit « Sous-total + Livraison = Total ». Le montant est enregistré
              avec chaque commande pour le suivi comptable.
            </p>
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
        </div>

        {/* RIGHT — sticky live preview of the COD form */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <CodFormLivePreview cfg={codForm} />
        </aside>
      </div>
    </StoreSubPageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Small UI helpers — color picker row + animated button preview
// ─────────────────────────────────────────────────────────────────────

function ColorField({
  label, value, onChange, defaultLabel,
}: { label: string; value?: string; onChange: (v?: string) => void; defaultLabel: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#7c3aed'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 cursor-pointer rounded-md border border-border/60 bg-background p-0"
        />
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder={defaultLabel}
          className="h-9 flex-1 font-mono text-xs"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="rounded-md px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Effacer (reprend le thème)"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Live preview of the full COD form. Mirrors the storefront cod-order-form
 * structure so the seller sees the actual shape, colors, animation and
 * visible fields update in real time — no save required.
 */
function CodFormLivePreview({ cfg }: { cfg: CodFormSettings }) {
  const bg = cfg.backgroundColor || '#ffffff';
  const btnBg = cfg.buttonColor || '#7c3aed';
  const btnFg = cfg.buttonTextColor || '#ffffff';
  const shape = cfg.buttonShape || 'pill';
  const btnRadius =
    shape === 'pill' ? '999px'
    : shape === 'rounded' ? '12px'
    : '0';
  const animation = cfg.buttonAnimated === false ? 'none' : (cfg.buttonAnimation || 'pulse');
  const animationClass =
    animation === 'pulse'   ? 'cod-prev-pulse'
    : animation === 'shimmer' ? 'cod-prev-shimmer'
    : animation === 'bounce'  ? 'cod-prev-bounce'
    : '';

  const headline = cfg.headline || 'Commander · Paiement à la livraison';
  const submitLabel = cfg.submitLabel || 'Commander';
  const reassurance = cfg.reassurance || 'Aucun prépaiement, paiement à la livraison uniquement';

  // Mock content for the preview — fixed price so the seller sees a plausible
  // CTA without needing a real product context.
  const mockProductPrice = 19.90;
  const shippingFee = Math.max(0, Number(cfg.shippingFee) || 0);
  const mockTotal = mockProductPrice + shippingFee;
  const fmt = (n: number) => `${n.toFixed(2)} TND`;
  const mockPrice = fmt(mockTotal);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-gradient-to-r from-muted/30 to-muted/10 px-3 py-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Wallet className="h-3 w-3" />
          Aperçu temps réel
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live
        </span>
      </div>

      {/* The mock form */}
      <div className="p-3">
        <div
          className="space-y-3 rounded-xl border border-border/40 p-3 text-[11px]"
          style={{ backgroundColor: bg, color: '#0f172a' }}
        >
          <div>
            <h3 className="text-sm font-bold leading-tight">{headline}</h3>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Tu paies <strong>{mockPrice}</strong> en espèces au livreur.
            </p>
          </div>

          {/* Identity row */}
          <div className="grid grid-cols-2 gap-1.5">
            <PreviewField label="Nom complet *" placeholder="Aïssatou Diallo" />
            <PreviewField label="Téléphone *"   placeholder="+216 55 …" />
          </div>
          {cfg.showEmail && (
            <PreviewField
              label={`Email${cfg.requireEmail ? ' *' : ' (optionnel)'}`}
              placeholder="ton@email.com"
            />
          )}

          {/* Country select mock */}
          <div className="space-y-0.5">
            <span className="block text-[9px] font-medium text-muted-foreground">Pays *</span>
            <div className="flex h-7 items-center justify-between rounded-md border border-border/40 bg-background/80 px-2 text-[10px]">
              <span>Tunisie (+216)</span>
              <span className="text-muted-foreground">▾</span>
            </div>
          </div>

          <PreviewField label="Adresse *" placeholder="N° + rue, quartier" />
          {cfg.showAddressLine2 && <PreviewField label="Complément" placeholder="Étage, repère…" />}

          {(cfg.showCity || cfg.showState || cfg.showPostalCode) && (
            <div className="grid grid-cols-3 gap-1.5">
              {cfg.showCity && <PreviewField label="Ville *" placeholder="Dakar" />}
              {cfg.showState && <PreviewField label="Région" placeholder="" />}
              {cfg.showPostalCode && <PreviewField label="CP" placeholder="" />}
            </div>
          )}

          {cfg.showNotes && (
            <PreviewField label="Note livreur (optionnel)" placeholder="Sonnez à la porte…" />
          )}

          {/* Quantity stepper */}
          {cfg.showQuantity && (
            <div className="flex items-center justify-between border-t border-border/40 pt-2">
              <span className="font-medium">Quantité</span>
              <div className="inline-flex items-center rounded-md border border-border/40">
                <span className="grid h-6 w-6 place-items-center text-xs">−</span>
                <span className="w-7 text-center text-[10px] font-semibold">1</span>
                <span className="grid h-6 w-6 place-items-center text-xs">+</span>
              </div>
            </div>
          )}

          {/* Totals breakdown — only show line items when shipping > 0 */}
          {shippingFee > 0 ? (
            <div className="space-y-1 border-t border-border/40 pt-2">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Sous-total</span>
                <span>{fmt(mockProductPrice)}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Livraison</span>
                <span>+ {fmt(shippingFee)}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] font-medium">À payer à la livraison</span>
                <span className="text-base font-extrabold" style={{ color: btnBg }}>{mockPrice}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between border-t border-border/40 pt-2">
              <span className="text-[10px] text-muted-foreground">À payer à la livraison</span>
              <span className="text-base font-extrabold" style={{ color: btnBg }}>{mockPrice}</span>
            </div>
          )}

          {/* Submit button — the star of the show */}
          <button
            type="button"
            className={cn(
              'relative inline-flex h-10 w-full items-center justify-center overflow-hidden px-3 text-[11px] font-bold transition-all',
              animationClass
            )}
            style={{ backgroundColor: btnBg, color: btnFg, borderRadius: btnRadius }}
          >
            {submitLabel} · {mockPrice}
          </button>

          {reassurance && (
            <p className="text-center text-[9px] text-muted-foreground">
              {reassurance}
            </p>
          )}
        </div>

        <p className="mt-2 text-center text-[9px] text-muted-foreground">
          Apparence sur la page produit du storefront
        </p>
      </div>

      <style>{`
        @keyframes codPrevPulse {
          0%, 100% { box-shadow: 0 0 0 0 ${btnBg}55; transform: scale(1); }
          50%      { box-shadow: 0 0 0 10px ${btnBg}00; transform: scale(1.02); }
        }
        @keyframes codPrevBounce {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
        @keyframes codPrevShimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .cod-prev-pulse  { animation: codPrevPulse 1.6s ease-in-out infinite; }
        .cod-prev-bounce { animation: codPrevBounce 1.2s ease-in-out infinite; }
        .cod-prev-shimmer {
          background-image: linear-gradient(110deg, ${btnBg} 30%, ${btnBg}cc 50%, ${btnBg} 70%) !important;
          background-size: 200% 100% !important;
          animation: codPrevShimmer 2.4s linear infinite;
        }
      `}</style>
    </div>
  );
}

function PreviewField({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div className="space-y-0.5">
      <span className="block text-[9px] font-medium text-muted-foreground">{label}</span>
      <div className="flex h-7 items-center rounded-md border border-border/40 bg-background/80 px-2 text-[10px] text-muted-foreground/70">
        {placeholder}
      </div>
    </div>
  );
}
