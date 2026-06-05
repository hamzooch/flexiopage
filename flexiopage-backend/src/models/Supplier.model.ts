/**
 * Fournisseur (Supplier) — partenaire à qui le vendeur achète des produits
 * pour reconstituer son stock.
 *
 * Scopé par boutique (`storeId`) car chaque marchand a son propre carnet
 * d'adresses fournisseurs. Un fournisseur peut être :
 *   - un grossiste local
 *   - un compte AliExpress / Alibaba
 *   - un fabricant
 *   - un dropshipper
 *
 * Lié aux produits via `Product.suppliers[]` (un produit peut avoir
 * plusieurs sources de sourcing) et aux importations (`Importation.supplierId`).
 *
 * Archivage logique via `archivedAt` plutôt que suppression dure pour
 * préserver l'historique des importations passées.
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface ISupplier extends Document {
  storeId: mongoose.Types.ObjectId;
  name: string;
  /** Personne de contact côté fournisseur (vendeur, account manager, etc). */
  contactName?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  /** Pays du fournisseur (code ISO-2). Utile pour estimer délais & douanes. */
  country?: string;
  city?: string;
  address?: string;
  /** Devise dans laquelle on facture habituellement avec ce fournisseur. */
  currency?: string;
  /** Conditions de paiement ("à la commande", "30j net", "50% avance"). */
  paymentTerms?: string;
  /** Délai standard de livraison après commande (jours). Sert d'estimation
   *  par défaut sur une importation, surchargeable au cas par cas. */
  defaultLeadTimeDays?: number;
  /** Note libre — qualité, fiabilité, contacts alternatifs, etc. */
  notes?: string;
  /** Date d'archivage logique. Présent = exclus des listes par défaut. */
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SupplierSchema = new Schema<ISupplier>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    contactName: { type: String, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    phone: { type: String, trim: true, maxlength: 40 },
    whatsapp: { type: String, trim: true, maxlength: 40 },
    website: { type: String, trim: true, maxlength: 300 },
    country: { type: String, trim: true, uppercase: true, maxlength: 2 },
    city: { type: String, trim: true, maxlength: 80 },
    address: { type: String, trim: true, maxlength: 300 },
    currency: { type: String, trim: true, uppercase: true, maxlength: 8 },
    paymentTerms: { type: String, trim: true, maxlength: 120 },
    defaultLeadTimeDays: { type: Number, min: 0, max: 365 },
    notes: { type: String, trim: true, maxlength: 2000 },
    archivedAt: { type: Date },
  },
  { timestamps: true },
);

// Recherche par nom dans une boutique : sert au picker côté éditeur produit.
SupplierSchema.index({ storeId: 1, name: 1 });
// Liste rapide des fournisseurs actifs d'une boutique.
SupplierSchema.index({ storeId: 1, archivedAt: 1 });

export const Supplier = mongoose.model<ISupplier>('Supplier', SupplierSchema);
