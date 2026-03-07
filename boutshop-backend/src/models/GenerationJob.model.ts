/**
 * Async generation job — tracks the AI landing page pipeline so the frontend
 * can poll for progress without holding a long-lived HTTP request open.
 *
 * Steps (in order):
 *   1. analyze   — Florence-2 captions the product photo(s)
 *   2. copy      — Claude Sonnet writes the page copy in dialect
 *   3. images    — Nano Banana generates / edits all visuals in parallel
 *   4. assemble  — Persist images + finalize sections
 *
 * Documents auto-expire after 24h via a TTL index on `expiresAt`.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type JobStep = 'analyze' | 'copy' | 'images' | 'assemble';

export const JOB_STEPS: JobStep[] = ['analyze', 'copy', 'images', 'assemble'];

export interface IGenerationJob extends Document {
  storeId: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  kind: 'landing-from-product' | 'landing-from-image';
  status: JobStatus;
  /** 0–100 — visual progress bar */
  progress: number;
  /** Currently active step. */
  currentStep: JobStep;
  /** Per-step status flags so the UI can render check marks. */
  steps: Record<JobStep, 'pending' | 'running' | 'done' | 'failed'>;
  /** Inputs needed to re-trigger or audit. */
  input?: Record<string, unknown>;
  /** Final result when status='succeeded'. */
  result?: {
    sections?: unknown[];
    seoTitle?: string;
    seoDescription?: string;
    language?: string;
    direction?: 'ltr' | 'rtl';
    currency?: string;
    country?: string;
    dialect?: string;
    imagesGenerated?: number;
    imageCaption?: string;
  };
  error?: string;
  startedAt: Date;
  finishedAt?: Date;
  /** TTL — Mongo auto-deletes after this. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GenerationJobSchema = new Schema<IGenerationJob>(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['landing-from-product', 'landing-from-image'], required: true },
    status: { type: String, enum: ['pending', 'running', 'succeeded', 'failed'], default: 'pending' },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    currentStep: { type: String, enum: JOB_STEPS, default: 'analyze' },
    steps: {
      analyze:  { type: String, enum: ['pending', 'running', 'done', 'failed'], default: 'pending' },
      copy:     { type: String, enum: ['pending', 'running', 'done', 'failed'], default: 'pending' },
      images:   { type: String, enum: ['pending', 'running', 'done', 'failed'], default: 'pending' },
      assemble: { type: String, enum: ['pending', 'running', 'done', 'failed'], default: 'pending' },
    },
    input: { type: Schema.Types.Mixed },
    result: { type: Schema.Types.Mixed },
    error: { type: String },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
      index: { expires: 0 }, // TTL: Mongo cleans up at expiresAt
    },
  },
  { timestamps: true }
);

export const GenerationJob = mongoose.model<IGenerationJob>('GenerationJob', GenerationJobSchema);
