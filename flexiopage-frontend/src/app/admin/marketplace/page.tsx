'use client';

/**
 * Marketplace catalog admin — CRUD des produits digitaux mis à disposition
 * des vendeurs. Prix de gros = ce que le vendeur devra à sa 1re vente.
 *
 * Layout : liste à gauche + formulaire d'édition à droite.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminApi, type MarketplaceProduct, type MarketplaceDigitalKind, type MarketplaceDigitalAsset } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Loader2, Package, Plus, RefreshCw, Trash2, Save, ArrowLeft, Eye, EyeOff, X, Sparkles,
} from 'lucide-react';

const DIGITAL_KINDS: { value: MarketplaceDigitalKind; label: string }[] = [
  { value: 'download', label: 'Téléchargement (fichier)' },
  { value: 'course', label: 'Cours vidéo' },
  { value: 'license', label: 'Clé de licence' },
  { value: 'membership', label: 'Accès membre' },
  { value: 'service', label: 'Service / prestation' },
];

const CURRENCIES = ['USD', 'EUR', 'XOF', 'MAD', 'TND', 'DZD', 'EGP'];

interface FormState {
  title: string;
  description: string;
  category: string;
  digitalKind: MarketplaceDigitalKind;
  coverImage: string;
  wholesalePrice: string;
  suggestedRetailPrice: string;
  currency: string;
  isActive: boolean;
  tags: string;
  deliverableAssets: MarketplaceDigitalAsset[];
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  category: '',
  digitalKind: 'download',
  coverImage: '',
  wholesalePrice: '',
  suggestedRetailPrice: '',
  currency: 'USD',
  isActive: true,
  tags: '',
  deliverableAssets: [],
};

function toForm(product: MarketplaceProduct): FormState {
  return {
    title: product.title,
    description: product.description || '',
    category: product.category || '',
    digitalKind: product.digitalKind,
    coverImage: product.coverImage || '',
    wholesalePrice: String(product.wholesalePrice),
    suggestedRetailPrice: product.suggestedRetailPrice ? String(product.suggestedRetailPrice) : '',
    currency: product.currency,
    isActive: product.isActive,
    tags: (product.tags || []).join(', '),
    deliverableAssets: product.deliverableAssets || [],
  };
}

export default function AdminMarketplacePage() {
  const [items, setItems] = useState<MarketplaceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<MarketplaceProduct | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiHint, setAiHint] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.listMarketplaceProducts(
        search.trim() ? { q: search.trim() } : undefined,
      );
      setItems(data.items);
    } catch (e) {
      setMessage({ tone: 'err', text: (e as Error).message || 'Erreur de chargement' });
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setAiHint('');
    setMessage(null);
  }

  function openEdit(p: MarketplaceProduct) {
    setEditing(p);
    setForm(toForm(p));
    setShowForm(true);
    setAiHint('');
    setMessage(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setAiHint('');
  }

  async function generateWithAi() {
    if (!form.title.trim()) {
      setMessage({ tone: 'err', text: 'Renseigne au moins le titre pour utiliser l\'IA' });
      return;
    }
    if (!form.wholesalePrice) {
      setMessage({ tone: 'err', text: 'Renseigne le prix de gros pour utiliser l\'IA' });
      return;
    }
    setGenerating(true);
    try {
      const { data } = await adminApi.generateMarketplaceProduct({
        title: form.title.trim(),
        digitalKind: form.digitalKind,
        wholesalePrice: Number(form.wholesalePrice),
        currency: form.currency,
        hint: aiHint.trim() || undefined,
      });
      setForm((f) => ({
        ...f,
        description: data.description,
        category: data.category,
        tags: data.tags.join(', '),
        suggestedRetailPrice: String(data.suggestedRetailPrice),
      }));
      setMessage({
        tone: 'ok',
        text: data.aiGenerated ? 'Champs remplis par l\'IA ✨' : 'IA indisponible — valeurs par défaut appliquées',
      });
    } catch (e) {
      setMessage({ tone: 'err', text: (e as Error).message || 'Génération échouée' });
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!form.title.trim() || !form.wholesalePrice || !form.currency) {
      setMessage({ tone: 'err', text: 'Titre, prix de gros et devise sont requis' });
      return;
    }
    const wp = Number(form.wholesalePrice);
    if (!Number.isFinite(wp) || wp < 0) {
      setMessage({ tone: 'err', text: 'Prix de gros invalide' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        digitalKind: form.digitalKind,
        coverImage: form.coverImage.trim() || undefined,
        wholesalePrice: wp,
        suggestedRetailPrice: form.suggestedRetailPrice ? Number(form.suggestedRetailPrice) : undefined,
        currency: form.currency,
        isActive: form.isActive,
        tags: form.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
        deliverableAssets: form.deliverableAssets,
      };
      if (editing) {
        await adminApi.updateMarketplaceProduct(editing._id, payload);
        setMessage({ tone: 'ok', text: 'Produit mis à jour' });
      } else {
        await adminApi.createMarketplaceProduct(payload);
        setMessage({ tone: 'ok', text: 'Produit créé' });
      }
      closeForm();
      await load();
    } catch (e) {
      setMessage({ tone: 'err', text: (e as Error).message || 'Erreur' });
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: MarketplaceProduct) {
    if (!confirm(`Supprimer « ${p.title} » ?\nRefusé si des vendeurs l'ont déjà acquis.`)) return;
    try {
      await adminApi.deleteMarketplaceProduct(p._id);
      setMessage({ tone: 'ok', text: 'Produit supprimé' });
      await load();
    } catch (e) {
      setMessage({ tone: 'err', text: (e as Error).message || 'Suppression refusée (produit déjà acquis)' });
    }
  }

  function addDeliverable() {
    setForm((f) => ({
      ...f,
      deliverableAssets: [
        ...f.deliverableAssets,
        {
          id: `asset_${Date.now()}`,
          name: '',
          url: '',
          kind: 'file',
          order: f.deliverableAssets.length,
        },
      ],
    }));
  }

  function updateDeliverable(idx: number, patch: Partial<MarketplaceDigitalAsset>) {
    setForm((f) => ({
      ...f,
      deliverableAssets: f.deliverableAssets.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }));
  }

  function removeDeliverable(idx: number) {
    setForm((f) => ({
      ...f,
      deliverableAssets: f.deliverableAssets.filter((_, i) => i !== idx),
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Package className="h-6 w-6 text-orange-600" />
            Catalogue marketplace
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Publie ici les produits digitaux que les vendeurs pourront ajouter à leur boutique.
            Le prix de gros est prélevé UNE fois, à la 1re vente que le vendeur réalise.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Actualiser
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nouveau produit
          </Button>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            'rounded-md border p-3 text-sm',
            message.tone === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
          )}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* Liste */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Catalogue ({items.length})</CardTitle>
            <CardDescription>Recherche par titre.</CardDescription>
            <div className="pt-2">
              <Input
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucun produit.</p>
            ) : (
              items.map((p) => (
                <button
                  key={p._id}
                  onClick={() => openEdit(p)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md border p-3 text-left transition hover:border-orange-500/50 hover:bg-orange-50/50 dark:hover:bg-orange-950/20',
                    editing?._id === p._id && 'border-orange-500 bg-orange-50 dark:bg-orange-950/30',
                  )}
                >
                  {p.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.coverImage}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.title}</span>
                      {!p.isActive && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                          inactif
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {p.wholesalePrice} {p.currency} · {p.stats.acquisitions} acq. ·{' '}
                      {p.stats.totalSales} ventes
                    </div>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {/* Formulaire */}
        {showForm ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">
                    {editing ? 'Modifier' : 'Créer'} un produit
                  </CardTitle>
                  <CardDescription>
                    {editing
                      ? 'La MAJ des deliverables est propagée à tous les vendeurs qui ont acquis ce produit.'
                      : 'Renseigne le prix de gros que la plateforme prélèvera à la 1re vente.'}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={closeForm}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Fermer
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Titre *</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              {/* Assistant IA — remplit description/tags/catégorie/prix retail */}
              <div className="rounded-md border border-orange-500/30 bg-gradient-to-br from-orange-50 to-amber-50 p-3 dark:from-orange-950/20 dark:to-amber-950/20">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-medium">Assistant IA</span>
                  <span className="text-xs text-muted-foreground">
                    (requiert titre + prix de gros renseignés)
                  </span>
                </div>
                <Input
                  className="mb-2"
                  placeholder="Contexte optionnel (ex: cible, URL de référence, angle marketing)…"
                  value={aiHint}
                  onChange={(e) => setAiHint(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateWithAi}
                  disabled={generating || !form.title.trim() || !form.wholesalePrice}
                  className="gap-2"
                >
                  {generating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Générer description, tags, catégorie et prix retail
                </Button>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  className="mt-1 min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="category">Catégorie</Label>
                  <Input
                    id="category"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="ex: ebook, template…"
                  />
                </div>
                <div>
                  <Label htmlFor="digitalKind">Type *</Label>
                  <select
                    id="digitalKind"
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.digitalKind}
                    onChange={(e) =>
                      setForm({ ...form, digitalKind: e.target.value as MarketplaceDigitalKind })
                    }
                  >
                    {DIGITAL_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>{k.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="coverImage">Image de couverture (URL)</Label>
                <Input
                  id="coverImage"
                  value={form.coverImage}
                  onChange={(e) => setForm({ ...form, coverImage: e.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="wholesalePrice">Prix de gros *</Label>
                  <Input
                    id="wholesalePrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.wholesalePrice}
                    onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="suggestedRetailPrice">Prix retail suggéré</Label>
                  <Input
                    id="suggestedRetailPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.suggestedRetailPrice}
                    onChange={(e) =>
                      setForm({ ...form, suggestedRetailPrice: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="currency">Devise *</Label>
                  <select
                    id="currency"
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="tags">Tags (virgules)</Label>
                <Input
                  id="tags"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="ebook, marketing, template"
                />
              </div>

              {/* Deliverables */}
              <div className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Fichiers livrés au client</div>
                    <div className="text-xs text-muted-foreground">
                      Ces fichiers sont partagés avec toutes les boutiques qui acquièrent ce produit.
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={addDeliverable} className="gap-1">
                    <Plus className="h-3 w-3" /> Ajouter
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.deliverableAssets.length === 0 ? (
                    <p className="text-xs italic text-muted-foreground">Aucun fichier.</p>
                  ) : (
                    form.deliverableAssets.map((asset, idx) => (
                      <div key={asset.id} className="grid grid-cols-[1fr_1.5fr_auto] items-end gap-2">
                        <Input
                          placeholder="Nom (ex: Chapitre 1.pdf)"
                          value={asset.name}
                          onChange={(e) => updateDeliverable(idx, { name: e.target.value })}
                        />
                        <Input
                          placeholder="URL du fichier"
                          value={asset.url}
                          onChange={(e) => updateDeliverable(idx, { url: e.target.value })}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDeliverable(idx)}
                          className="text-rose-600"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <span className="flex items-center gap-1">
                  {form.isActive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  Actif dans le catalogue vendeur
                </span>
              </label>

              <div className="flex items-center justify-between gap-2 border-t pt-4">
                {editing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(editing)}
                    className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Supprimer
                  </Button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={closeForm}>Annuler</Button>
                  <Button size="sm" onClick={save} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Enregistrer
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex items-center justify-center py-16 text-muted-foreground">
            <div className="text-center">
              <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
              <p className="text-sm">Sélectionne un produit ou clique sur « Nouveau produit ».</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
