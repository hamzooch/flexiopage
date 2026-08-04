/**
 * File storage abstraction: local filesystem or S3-compatible (e.g. MinIO, AWS S3)
 */
export type StorageDriver = 'local' | 's3' | 'cloudinary';

/**
 * "media"       → images / covers / thumbnails. Served inline (browser
 *                 renders), benefits from Cloudinary transformations.
 * "deliverable" → digital product files (ZIP, PDF, MP4, MP3…). Must be
 *                 served with Content-Disposition: attachment, no
 *                 transformations needed. Routes to R2 when configured
 *                 (zero egress fees, no PDF/ZIP delivery restriction like
 *                 Cloudinary).
 */
export type UploadPurpose = 'media' | 'deliverable';

export interface StorageConfig {
  driver: StorageDriver;
  localPath?: string;
  s3Bucket?: string;
  s3Region?: string;
  s3Endpoint?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  publicUrlPrefix?: string;
  cloudinaryCloudName?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;
  /** Cloudflare R2 — dedicated bucket for digital deliverables. */
  r2AccountId?: string;
  r2Bucket?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  /** Optional custom public domain (e.g. files.mydomain.com). Empty ⇒
   *  fall back to the account-scoped R2 endpoint for the stored URL. */
  r2PublicBaseUrl?: string;
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  mimeType?: string;
}
