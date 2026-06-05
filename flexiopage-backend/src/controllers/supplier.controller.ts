/**
 * Suppliers (fournisseurs) — CRUD scopé par boutique.
 *
 * Le middleware `requireStore` (utilisé par le router) garantit que
 * `req.store` est bien la boutique du vendeur authentifié, donc on peut
 * faire confiance à `req.store._id` pour scoper toutes les requêtes.
 *
 * Archivage logique via `archivedAt` plutôt que DELETE dur : ça préserve
 * l'historique des importations passées qui référencent ce fournisseur.
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Supplier } from '../models/Supplier.model';

/** GET /api/stores/:storeId/suppliers?includeArchived=true */
export async function listSuppliers(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const includeArchived = req.query.includeArchived === 'true';
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
  const skip = parseInt(req.query.skip as string, 10) || 0;
  const search = String(req.query.search || '').trim();

  const filter: Record<string, unknown> = { storeId: store._id };
  if (!includeArchived) filter.archivedAt = { $exists: false };
  if (search) {
    const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: re }, { contactName: re }, { email: re }, { phone: re }];
  }

  const [suppliers, total] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).limit(limit).skip(skip).lean(),
    Supplier.countDocuments(filter),
  ]);
  res.json({ suppliers, total, limit, skip });
}

/** GET /api/stores/:storeId/suppliers/:supplierId */
export async function getSupplier(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const supplier = await Supplier.findOne({ _id: req.params.supplierId, storeId: store._id }).lean();
  if (!supplier) {
    res.status(404).json({ error: 'Fournisseur introuvable.' });
    return;
  }
  res.json({ supplier });
}

/** POST /api/stores/:storeId/suppliers */
export async function createSupplier(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const body = req.body as Partial<{
    name: string; contactName: string; email: string; phone: string; whatsapp: string;
    website: string; country: string; city: string; address: string;
    currency: string; paymentTerms: string; defaultLeadTimeDays: number; notes: string;
  }>;
  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Le nom du fournisseur est obligatoire.' });
    return;
  }
  const supplier = await Supplier.create({
    storeId: store._id,
    name: body.name.trim(),
    contactName: body.contactName?.trim(),
    email: body.email?.trim(),
    phone: body.phone?.trim(),
    whatsapp: body.whatsapp?.trim(),
    website: body.website?.trim(),
    country: body.country?.trim(),
    city: body.city?.trim(),
    address: body.address?.trim(),
    currency: body.currency?.trim(),
    paymentTerms: body.paymentTerms?.trim(),
    defaultLeadTimeDays: body.defaultLeadTimeDays,
    notes: body.notes?.trim(),
  });
  res.status(201).json({ supplier });
}

/** PATCH /api/stores/:storeId/suppliers/:supplierId */
export async function updateSupplier(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const allowed: Array<keyof typeof req.body> = [
    'name', 'contactName', 'email', 'phone', 'whatsapp', 'website',
    'country', 'city', 'address', 'currency', 'paymentTerms',
    'defaultLeadTimeDays', 'notes',
  ];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in req.body) updates[k as string] = (req.body as Record<string, unknown>)[k as string];
  }
  // Normalisation des trim sur les strings — évite que ' ' ' ne passe les checks.
  for (const [k, v] of Object.entries(updates)) {
    if (typeof v === 'string') updates[k] = v.trim();
  }
  if (typeof updates.name === 'string' && !updates.name) {
    res.status(400).json({ error: 'Le nom du fournisseur ne peut pas être vide.' });
    return;
  }
  const supplier = await Supplier.findOneAndUpdate(
    { _id: req.params.supplierId, storeId: store._id },
    { $set: updates },
    { new: true },
  ).lean();
  if (!supplier) {
    res.status(404).json({ error: 'Fournisseur introuvable.' });
    return;
  }
  res.json({ supplier });
}

/** POST /api/stores/:storeId/suppliers/:supplierId/archive */
export async function archiveSupplier(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const supplier = await Supplier.findOneAndUpdate(
    { _id: req.params.supplierId, storeId: store._id },
    { $set: { archivedAt: new Date() } },
    { new: true },
  ).lean();
  if (!supplier) {
    res.status(404).json({ error: 'Fournisseur introuvable.' });
    return;
  }
  res.json({ supplier });
}

/** POST /api/stores/:storeId/suppliers/:supplierId/restore */
export async function restoreSupplier(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const supplier = await Supplier.findOneAndUpdate(
    { _id: req.params.supplierId, storeId: store._id },
    { $unset: { archivedAt: '' } },
    { new: true },
  ).lean();
  if (!supplier) {
    res.status(404).json({ error: 'Fournisseur introuvable.' });
    return;
  }
  res.json({ supplier });
}
