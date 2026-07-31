/**
 * Vendor acquisition — lien entre un vendeur, sa boutique, un produit du
 * catalogue marketplace, et le produit qu'il a instancié dans sa boutique.
 *
 * Cycle de vie :
 *   1. `active` — Créée au moment où le vendeur ajoute le produit à sa
 *      boutique (0 débit). `wholesaleOwed` capture le prix de gros figé
 *      au moment de l'acquisition (une MAJ ultérieure du prix admin
 *      n'affecte QUE les futures acquisitions).
 *   2. `settled` — À la 1re vente déclenchée sur le Product lié, on
 *      débite `wholesaleOwed` du `payoutBalance` du vendeur (via une
 *      transaction wallet `marketplace_debit`). L'acquisition passe en
 *      `settled` et ne sera plus jamais débitée (les ventes suivantes ne
 *      subissent que la commission plateforme classique).
 *   3. `refunded` — Si la vente qui a déclenché le settlement est
 *      remboursée, on crédite `wholesaleOwed` au vendeur (transaction
 *      `marketplace_debit_refund`) et l'acquisition repasse `active` —
 *      la prochaine vente re-déclenchera le débit.
 *
 * Unicité : un vendeur peut acquérir le même MarketplaceProduct dans
 * plusieurs boutiques distinctes (chacune = une dette wholesale à part).
 * On empêche par contre les doublons dans la MÊME boutique.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type VendorAcquisitionStatus = 'active' | 'settled' | 'refunded';

export interface IVendorAcquisition extends Document {
  vendorId: mongoose.Types.ObjectId;
  storeId: mongoose.Types.ObjectId;
  marketplaceProductId: mongoose.Types.ObjectId;
  /** Product créé dans la boutique du vendeur, référence en retour. */
  vendorProductId: mongoose.Types.ObjectId;
  /** Prix de vente choisi par le vendeur — copie à titre indicatif ; la
   *  source de vérité reste `Product.price` (le vendeur peut le modifier). */
  retailPrice: number;
  currency: string;
  status: VendorAcquisitionStatus;
  /** Wholesale figé à l'acquisition (MAJ admin ultérieure = pas d'effet). */
  wholesaleOwed: number;
  /** Timestamp de la 1re vente qui a déclenché le settlement. */
  firstSaleAt?: Date;
  /** Timestamp du prélèvement wholesale. */
  settledAt?: Date;
  /** Order qui a déclenché le settlement — utile pour tracer le refund. */
  settledByOrderId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const VendorAcquisitionSchema = new Schema<IVendorAcquisition>(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    marketplaceProductId: {
      type: Schema.Types.ObjectId,
      ref: 'MarketplaceProduct',
      required: true,
    },
    vendorProductId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    retailPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, trim: true, uppercase: true },
    status: {
      type: String,
      enum: ['active', 'settled', 'refunded'],
      default: 'active',
      required: true,
    },
    wholesaleOwed: { type: Number, required: true, min: 0 },
    firstSaleAt: { type: Date },
    settledAt: { type: Date },
    settledByOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  },
  { timestamps: true },
);

// Un même produit marketplace ne peut être acquis qu'une fois par boutique.
VendorAcquisitionSchema.index(
  { storeId: 1, marketplaceProductId: 1 },
  { unique: true },
);
// Recherche "toutes les acquisitions du vendeur" (dashboard).
VendorAcquisitionSchema.index({ vendorId: 1, status: 1, updatedAt: -1 });
// Résolution rapide depuis le Product vendeur (hook wholesale à la vente).
VendorAcquisitionSchema.index({ vendorProductId: 1 });

export const VendorAcquisition = mongoose.model<IVendorAcquisition>(
  'VendorAcquisition',
  VendorAcquisitionSchema,
);
