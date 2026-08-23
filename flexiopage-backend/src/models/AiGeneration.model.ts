/**
 * Bibliothèque des générations AI réussies — historique consultable
 * depuis le Studio pour retrouver / re-télécharger un asset généré.
 *
 * Séparé volontairement de GenerationJob (qui track le lifecycle async
 * d'un job avec TTL 24h) : ici on ne garde QUE les résultats réussis,
 * avec un TTL beaucoup plus long (30 jours) pour que le vendeur puisse
 * revenir sur ses créations plusieurs jours après.
 *
 * `result` est typé large car chaque kind stocke des champs différents
 * (poster = PosterContent JSON, landing = image URL + copy, video =
 * MP4 URL + durée). Le frontend narrow selon `kind`.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type AiGenerationKind = 'poster' | 'landing' | 'video';

export interface IAiGeneration extends Document {
  storeId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  /** Optionnel — poster/landing/video sont souvent liés à un produit
   *  mais on autorise la génération sans produit rattaché (ex : poster
   *  brand générique). */
  productId?: mongoose.Types.ObjectId;
  kind: AiGenerationKind;
  /** Résultat de la génération — forme dépend de `kind` : voir types côté frontend. */
  result: Record<string, unknown>;
  /** Coût facturé au wallet AI, en tokens, à titre indicatif. */
  cost?: number;
  /** Snapshot minimal utile à l'affichage dans la galerie (miniature, titre). */
  preview?: {
    thumbnailUrl?: string;
    title?: string;
    subtitle?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

const AiGenerationSchema = new Schema<IAiGeneration>(
  {
    storeId:  { type: Schema.Types.ObjectId, ref: 'Store',   required: true, index: true },
    ownerId:  { type: Schema.Types.ObjectId, ref: 'User',    required: true, index: true },
    productId:{ type: Schema.Types.ObjectId, ref: 'Product' },
    kind:     { type: String, enum: ['poster', 'landing', 'video'], required: true, index: true },
    result:   { type: Schema.Types.Mixed, required: true },
    cost:     { type: Number },
    preview: {
      thumbnailUrl: { type: String },
      title:        { type: String },
      subtitle:     { type: String },
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

// Composite index pour la requête principale « dernières N générations
// d'un kind pour un store donné » — trie par createdAt desc.
AiGenerationSchema.index({ storeId: 1, kind: 1, createdAt: -1 });

export const AiGeneration = mongoose.model<IAiGeneration>('AiGeneration', AiGenerationSchema);
