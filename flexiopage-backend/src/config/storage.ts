/**
 * File storage abstraction: local filesystem or S3-compatible (e.g. MinIO, AWS S3)
 */
export type StorageDriver = 'local' | 's3' | 'cloudinary';

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
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  mimeType?: string;
}
