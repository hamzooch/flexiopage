'use client';

/**
 * Fournisseurs — liste + création + édition.
 *
 * Le vendeur gère ici son carnet d'adresses fournisseurs (grossistes,
 * fabricants, comptes AliExpress, etc.). Chaque fournisseur peut être lié
 * à un ou plusieurs produits (Sourcing → onglet Sourcing du produit) et
 * sera utilisé par le futur module Importations (Phase 3).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Loader2, Plus, Search, Pencil, Archive, RotateCcw, Building2, Mail, Phone, Globe, X,
} from 'lucide-react';
import { storesApi, extractApiError } from '@/lib/api';
import { useStoreStore } from '@/stores/store-store';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { COUNTRIES } from '@/data/countries';
import type { Supplier } from '@/types/supplier';

export default function SuppliersPage() {
  const params = useSearchParams();
  const router = useRouter();
  const currentStoreId = useStoreStore((s) => s.currentStoreId);
  const storeId = params.get('storeId') || currentStoreId || '';

  const [list, setList] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const res = await storesApi.listSuppliers(storeId, {
        limit: pageSize,
        skip: (page - 1) * pageSize,
        search: search.trim() || undefined,
        includeArchived,
      });
      setList(res.data.suppliers);
      setTotal(res.data.total);
    } catch (err) {
      setError(extractApiError(err, 'Chargement impossible.'));
    } finally {
      setLoading(false);
    }
  }, [storeId, page, pageSize, search, includeArchived]);

  useEffect(() => { void load(); }, [load]);

  if (!storeId) {
    return <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Sélectionne une boutique d&apos;abord.</div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Building2}
        title="Fournisseurs"
        description="Ton carnet d'adresses fournisseurs : grossistes, fabricants, AliExpress, dropshippers. Lié au sourcing produit et aux futures importations."
        actions={
          <Button onClick={() => setEditing('new')} className="gap-1.5 gradient-brand text-white">
            <Plus className="h-4 w-4" /> Ajouter un fournisseur
          </Button>
        }
      />

      {/* Barre de filtres */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Rechercher par nom, contact, email ou téléphone…"
            className="pl-9"
          />
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-xs">
          <input type="checkbox" checked={includeArchived} onChange={(e) => { setIncludeArchived(e.target.checked); setPage(1); }} className="h-3.5 w-3.5" />
          Inclure archivés
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading && list.length === 0 ? (
        <div className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <EmptyState onCreate={() => setEditing('new')} />
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card">
          <ul className="divide-y divide-border/40">
            {list.map((s) => (
              <SupplierRow key={s._id} supplier={s} onEdit={() => setEditing(s)} onChanged={load} storeId={storeId} />
            ))}
          </ul>
          <Pagination
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
        </div>
      )}

      {editing && (
        <SupplierFormModal
          storeId={storeId}
          supplier={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}

      <p className="text-center text-[11px] text-muted-foreground">
        Phase 1 : carnet de fournisseurs. {' '}
        <button type="button" onClick={() => router.push(`/dashboard/products?storeId=${encodeURIComponent(storeId)}`)} className="underline hover:text-foreground">
          Phase 2 : lier les fournisseurs aux produits via Sourcing
        </button>.
      </p>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-card p-10 text-center">
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/15 to-fuchsia-500/10 text-violet-700">
        <Building2 className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold">Aucun fournisseur enregistré</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Ajoute tes grossistes, fabricants ou contacts AliExpress pour pouvoir lier chaque produit à son fournisseur et préparer tes importations.
      </p>
      <Button onClick={onCreate} className="mt-4 gap-1.5 gradient-brand text-white">
        <Plus className="h-4 w-4" /> Ajouter mon premier fournisseur
      </Button>
    </div>
  );
}

function SupplierRow({
  supplier, onEdit, onChanged, storeId,
}: { supplier: Supplier; onEdit: () => void; onChanged: () => void; storeId: string }) {
  const [busy, setBusy] = useState(false);
  const archived = !!supplier.archivedAt;
  const country = COUNTRIES.find((c) => c.code === (supplier.country || '').toUpperCase());

  async function toggleArchive() {
    setBusy(true);
    try {
      if (archived) await storesApi.restoreSupplier(storeId, supplier._id);
      else await storesApi.archiveSupplier(storeId, supplier._id);
      await onChanged();
    } finally { setBusy(false); }
  }

  return (
    <li className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center ${archived ? 'opacity-60' : ''}`}>
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500/15 to-fuchsia-500/10 text-violet-700">
        <Building2 className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{supplier.name}</span>
          {archived && <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Archivé</span>}
          {country && <span className="text-[10px] text-muted-foreground">· {country.label}</span>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {supplier.contactName && <span>{supplier.contactName}</span>}
          {supplier.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {supplier.email}</span>}
          {supplier.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {supplier.phone}</span>}
          {supplier.website && <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> {supplier.website.replace(/^https?:\/\//, '').slice(0, 30)}</span>}
          {supplier.defaultLeadTimeDays != null && <span>· {supplier.defaultLeadTimeDays}j de délai</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={onEdit} className="gap-1"><Pencil className="h-3.5 w-3.5" /> Éditer</Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={toggleArchive} className="gap-1">
          {archived ? <><RotateCcw className="h-3.5 w-3.5" /> Réactiver</> : <><Archive className="h-3.5 w-3.5" /> Archiver</>}
        </Button>
      </div>
    </li>
  );
}

function SupplierFormModal({
  storeId, supplier, onClose, onSaved,
}: { storeId: string; supplier: Supplier | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!supplier;
  const [form, setForm] = useState<Partial<Supplier>>(() => ({
    name: supplier?.name || '',
    contactName: supplier?.contactName || '',
    email: supplier?.email || '',
    phone: supplier?.phone || '',
    whatsapp: supplier?.whatsapp || '',
    website: supplier?.website || '',
    country: supplier?.country || '',
    city: supplier?.city || '',
    address: supplier?.address || '',
    currency: supplier?.currency || '',
    paymentTerms: supplier?.paymentTerms || '',
    defaultLeadTimeDays: supplier?.defaultLeadTimeDays,
    notes: supplier?.notes || '',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const countryOptions = useMemo(() => COUNTRIES.slice().sort((a, b) => a.label.localeCompare(b.label)), []);

  async function save() {
    if (!form.name?.trim()) { setErr('Le nom est obligatoire.'); return; }
    setBusy(true); setErr('');
    try {
      if (isEdit && supplier) {
        await storesApi.updateSupplier(storeId, supplier._id, form);
      } else {
        await storesApi.createSupplier(storeId, form);
      }
      onSaved();
    } catch (e) {
      setErr(extractApiError(e, 'Enregistrement impossible.'));
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-card p-5 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">{isEdit ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h3>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom du fournisseur *" required>
              <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Atelier Sahel · AliExpress Tech Store" />
            </Field>
            <Field label="Personne de contact">
              <Input value={form.contactName || ''} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Ex: Mr Ben Ali" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contact@..." />
            </Field>
            <Field label="Téléphone">
              <Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+225..." />
            </Field>
            <Field label="WhatsApp">
              <Input value={form.whatsapp || ''} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+225..." />
            </Field>
            <Field label="Site web">
              <Input value={form.website || ''} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Pays">
              <select value={form.country || ''} onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="h-10 w-full rounded-md border border-border/60 bg-background px-2 text-sm">
                <option value="">—</option>
                {countryOptions.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Ville">
              <Input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="Devise" hint="Code ISO ex: USD, EUR, CNY">
              <Input value={form.currency || ''} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={6} />
            </Field>
          </div>

          <Field label="Adresse postale">
            <Input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Conditions de paiement" hint='Ex: "à la commande", "30j net", "50% avance"'>
              <Input value={form.paymentTerms || ''} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
            </Field>
            <Field label="Délai standard (jours)" hint="Délai habituel entre commande et livraison">
              <Input type="number" min={0} max={365} value={form.defaultLeadTimeDays ?? ''}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setForm({ ...form, defaultLeadTimeDays: Number.isFinite(n) && n >= 0 ? n : undefined });
                }} />
            </Field>
          </div>

          <Field label="Notes (qualité, fiabilité, alternatives…)">
            <textarea value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="min-h-[80px] w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm" />
          </Field>

          {err && <p className="text-xs text-rose-600">{err}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
            <Button onClick={save} disabled={busy || !form.name?.trim()} className="gap-1.5 gradient-brand text-white">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, children, required, hint,
}: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}{required && <span className="ms-0.5 text-rose-500">*</span>}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
