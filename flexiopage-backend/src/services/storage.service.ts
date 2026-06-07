import path from 'path';
import fs from 'fs/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v2 as cloudinary } from 'cloudinary';
import type { StorageConfig, UploadResult, StorageDriver } from '../config/storage';

const config: StorageConfig = {
  driver: (process.env.STORAGE_DRIVER as StorageDriver) || 'local',
  localPath: process.env.UPLOAD_PATH || path.join(process.cwd(), 'uploads'),
  s3Bucket: process.env.S3_BUCKET,
  s3Region: process.env.S3_REGION || 'us-east-1',
  s3Endpoint: process.env.S3_ENDPOINT,
  s3AccessKey: process.env.S3_ACCESS_KEY,
  s3SecretKey: process.env.S3_SECRET_KEY,
  publicUrlPrefix: process.env.PUBLIC_URL_PREFIX || '/uploads',
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
};

// Configure Cloudinary once at module load. The SDK keeps the config on its
// global v2 object, so we don't need to pass credentials on every call.
let cloudinaryConfigured = false;
function ensureCloudinaryConfigured(): void {
  if (cloudinaryConfigured) return;
  if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
    throw new Error('Cloudinary not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
  }
  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
    secure: true,
  });
  cloudinaryConfigured = true;
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.s3Region,
      ...(config.s3Endpoint && { endpoint: config.s3Endpoint }),
      credentials:
        config.s3AccessKey && config.s3SecretKey
          ? { accessKeyId: config.s3AccessKey, secretAccessKey: config.s3SecretKey }
          : undefined,
    });
  }
  return s3Client;
}

/** Ensure local upload directory exists */
async function ensureLocalDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/** Upload buffer to local filesystem */
async function uploadLocal(
  key: string,
  buffer: Buffer,
  mimeType?: string
): Promise<UploadResult> {
  const fullPath = path.join(config.localPath!, key);
  await ensureLocalDir(path.dirname(fullPath));
  await fs.writeFile(fullPath, buffer);
  const url = `${config.publicUrlPrefix}/${key}`.replace(/\/+/g, '/');
  return { key, url, size: buffer.length, mimeType };
}

/** Upload buffer to S3 */
async function uploadS3(
  key: string,
  buffer: Buffer,
  mimeType?: string
): Promise<UploadResult> {
  const client = getS3Client();
  const bucket = config.s3Bucket!;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );
  const baseUrl = config.s3Endpoint
    ? `${config.s3Endpoint}/${bucket}`
    : `https://${bucket}.s3.${config.s3Region}.amazonaws.com`;
  const url = `${baseUrl}/${key}`;
  return { key, url, size: buffer.length, mimeType };
}

/** Upload buffer to Cloudinary. Returns the secure_url + public_id (as key)
 *  so it can be deleted later via the same SDK. */
async function uploadCloudinary(
  key: string,
  buffer: Buffer,
  mimeType?: string
): Promise<UploadResult> {
  ensureCloudinaryConfigured();
  // Strip the extension — Cloudinary auto-detects format from the content
  // and appends its own. Keeping our extension would result in /xxx.jpg.png.
  const publicIdNoExt = key.replace(/\.[^./]+$/, '');
  const result = await new Promise<{ secure_url: string; public_id: string; bytes: number; format: string }>(
    (resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicIdNoExt,
          resource_type: 'auto', // images, videos, raw all supported
          overwrite: false,
        },
        (err, res) => {
          if (err || !res) return reject(err || new Error('Cloudinary upload failed'));
          resolve(res as { secure_url: string; public_id: string; bytes: number; format: string });
        }
      );
      stream.end(buffer);
    }
  );
  return {
    key: result.public_id,
    url: result.secure_url,
    size: result.bytes,
    mimeType,
  };
}

/** Upload a file buffer; returns key and public URL */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  folder: string,
  mimeType?: string
): Promise<UploadResult> {
  const ext = path.extname(filename) || '';
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  const key = `${folder}/${safeName}`;

  if (config.driver === 'cloudinary') {
    return uploadCloudinary(key, buffer, mimeType);
  }
  if (config.driver === 's3' && config.s3Bucket) {
    return uploadS3(key, buffer, mimeType);
  }
  return uploadLocal(key, buffer, mimeType);
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * Download a remote image (e.g. from fal.media which expires in ~24h) and
 * re-host it in our own storage so the URL stays alive forever.
 *
 * Returns the new local/S3 public URL. If the input is already a stable URL
 * (data URL, an /uploads/ path, or our own host), returns it unchanged.
 */
export async function persistRemoteImage(
  remoteUrl: string,
  folder = 'ai-generated'
): Promise<string> {
  if (!remoteUrl) return remoteUrl;
  // Skip stable URLs we don't need to re-host
  if (remoteUrl.startsWith('data:') || remoteUrl.startsWith('blob:')) return remoteUrl;
  if (remoteUrl.startsWith('/')) return remoteUrl; // already in our storage
  // Self-hosted base — already persisted
  const apiBase = (process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
  if (apiBase && remoteUrl.startsWith(apiBase)) return remoteUrl;

  const res = await fetch(remoteUrl);
  if (!res.ok) {
    throw new Error(`persistRemoteImage: failed to fetch ${remoteUrl} (${res.status})`);
  }
  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
  const ext = EXT_BY_MIME[mimeType] || path.extname(new URL(remoteUrl).pathname) || '.jpg';
  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  const key = `${folder}/${filename}`;
  if (config.driver === 'cloudinary') {
    const result = await uploadCloudinary(key, buffer, mimeType);
    return result.url;
  }
  if (config.driver === 's3' && config.s3Bucket) {
    const result = await uploadS3(key, buffer, mimeType);
    return result.url;
  }
  const result = await uploadLocal(key, buffer, mimeType);
  return result.url;
}
