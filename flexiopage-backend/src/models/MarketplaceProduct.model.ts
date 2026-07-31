/**
 * Marketplace catalog — produits digitaux curatés par l'admin plateforme.
 *
 * Modèle économique (post-paid) :
 *   - L'admin publie un produit avec un `wholesalePrice` (le prix "gros"
 *     que le vendeur devra à la plateforme).
 *   - Le vendeur "acquiert" un produit gratuitement (aucun débit immédiat)
 *     — voir VendorAcquisition. Il fixe son propre prix de vente dans
 *     sa boutique.
 *   - À la 1re vente déclenchée par un client final, le `wholesalePrice`
 *     est prélevé sur le `payoutBalance` du vendeur (via une transaction
 *     `marketplace_debit`). Aux ventes suivantes : seule la commission
 *     plateforme classique s'applique (aucun nouveau prélèvement wholesale).
 *
 * Les fichiers livrables (deliverableAssets) sont référencés par le
 * Product du vendeur — toute MAJ admin est propagée automatiquement.
 */
import mongoose, { Document, Schema } from 'mongoose';
import type { DigitalKind, IDigitalAsset } from './Product.model';

export interface IMarketplaceProduct extends Document {
  title: string;
  slug: string;
  description?: string;
  category?: string;
  digitalKind: DigitalKind;
  /** Image de couverture (miniature catalogue + fiche produit). */
  coverImage?: string;
  /** Assets visibles publiquement pour donner un aperçu (extraits, samples). */
  previewAssets?: IDigitalAsset[];
  /** Fichiers/liens réels livrés au client final après achat. */
  deliverableAssets: IDigitalAsset[];
  /** Prix payé par le vendeur (une seule fois, à sa 1re vente). Devise pinée. */
  wholesalePrice: number;
  /** Prix retail suggéré (indicatif — le vendeur reste libre). */
  suggestedRetailPrice?: number;
  currency: string;
  isActive: boolean;
  /** Tags libres pour la recherche catalogue. */
  tags?: string[];
  /** Stats agrégées — mises à jour par les hooks acquisition/vente. */
  stats: {
    acquisitions: number;
    totalSales: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const DigitalAssetSubSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    kind: { type: String, enum: ['file', 'video', 'image', 'audio', 'link'], default: 'file' },
    mimeType: { type: String },
    size: { type: Number },
    durationSeconds: { type: Number },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const MarketplaceProductSchema = new Schema<IMarketplaceProduct>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, unique: true },
    description: { type: String },
    category: { type: String, trim: true },
    digitalKind: {
      type: String,
      enum: ['download', 'course', 'license', 'membership', 'service'],
      required: true,
    },
    coverImage: { type: String },
    previewAssets: { type: [DigitalAssetSubSchema], default: [] },
    deliverableAssets: { type: [DigitalAssetSubSchema], default: [] },
    wholesalePrice: { type: Number, required: true, min: 0 },
    suggestedRetailPrice: { type: Number, min: 0 },
    currency: { type: String, required: true, trim: true, uppercase: true },
    isActive: { type: Boolean, default: true },
    tags: [{ type: String, trim: true, lowercase: true }],
    stats: {
      acquisitions: { type: Number, default: 0 },
      totalSales: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

MarketplaceProductSchema.index({ isActive: 1, category: 1 });
MarketplaceProductSchema.index({ isActive: 1, tags: 1 });

export const MarketplaceProduct = mongoose.model<IMarketplaceProduct>(
  'MarketplaceProduct',
  MarketplaceProductSchema,
);
