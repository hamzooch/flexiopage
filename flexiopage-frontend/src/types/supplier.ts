/**
 * Fournisseur (Supplier) — type partagé entre la page liste, le form et
 * la section "Sourcing" de l'éditeur produit. Forme identique au modèle
 * Mongoose côté backend (cf. flexiopage-backend/src/models/Supplier.model.ts).
 */

export interface Supplier {
  _id: string;
  storeId: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  /** Code ISO-2. */
  country?: string;
  city?: string;
  address?: string;
  currency?: string;
  paymentTerms?: string;
  defaultLeadTimeDays?: number;
  notes?: string;
  archivedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}
