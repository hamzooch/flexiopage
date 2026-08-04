import path from 'path';
import fs from 'fs/promises';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v2 as cloudinary } from 'cloudinary';
import type { StorageConfig, UploadResult, StorageDriver, UploadPurpose } from '../config/storage';

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
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2Bucket: process.env.R2_BUCKET,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
};

/** True if R2 is fully configured (account id + bucket + credentials). */
export function isR2Configured(): boolean {
  return !!(config.r2AccountId && config.r2Bucket && config.r2AccessKeyId && config.r2SecretAccessKey);
}

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

let r2Client: S3Client | null = null;

/** R2 is S3-compatible — the AWS SDK works verbatim once pointed at the
 *  account-scoped endpoint. Region MUST be "auto" for R2. */
function getR2Client(): S3Client {
  if (!r2Client) {
    if (!isR2Configured()) {
      throw new Error('R2 not configured — set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
    }
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2AccessKeyId!,
        secretAccessKey: config.r2SecretAccessKey!,
      },
    });
  }
  return r2Client;
}

/** Upload buffer to R2. Stored URL uses R2_PUBLIC_BASE_URL if set (custom
 *  domain, faster + no bandwidth cost), otherwise the account-scoped R2
 *  endpoint (private, only reachable via signed URL). Either way, the
 *  download endpoint always signs a fresh URL on serve. */
async function uploadR2(
  key: string,
  buffer: Buffer,
  mimeType?: string
): Promise<UploadResult> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: config.r2Bucket!,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );
  const base = config.r2PublicBaseUrl
    ? config.r2PublicBaseUrl.replace(/\/+$/, '')
    : `https://${config.r2AccountId}.r2.cloudflarestorage.com/${config.r2Bucket}`;
  return { key, url: `${base}/${key}`, size: buffer.length, mimeType };
}

/**
 * Generate a short-lived presigned GET URL for an R2 object with the
 * response headers forced to `attachment` so the browser saves the file
 * instead of trying to render it inline.
 *
 * @param urlOrKey — either the stored public URL (from uploadR2) or the
 *                   raw object key. We extract the key either way.
 * @param filename — download filename shown to the user.
 * @param expiresSeconds — link lifetime; keep short (default 5 min).
 */
export async function signR2DownloadUrl(
  urlOrKey: string,
  filename: string,
  expiresSeconds = 300
): Promise<string> {
  if (!isR2Configured()) {
    throw new Error('R2 not configured — cannot sign download URL');
  }
  const key = extractR2Key(urlOrKey);
  const encoded = encodeURIComponent(filename);
  const safeName = filename.replace(/["\\]/g, '_');
  const command = new GetObjectCommand({
    Bucket: config.r2Bucket!,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${safeName}"; filename*=UTF-8''${encoded}`,
  });
  return getSignedUrl(getR2Client(), command, { expiresIn: expiresSeconds });
}

/** True if `url` looks like an R2 URL we produced (either the r2.cloudflarestorage.com
 *  endpoint OR our configured custom domain). */
export function isR2Url(url: string): boolean {
  if (!url) return false;
  if (/r2\.cloudflarestorage\.com/i.test(url)) return true;
  const base = config.r2PublicBaseUrl?.replace(/\/+$/, '');
  return !!(base && url.startsWith(base + '/'));
}

/** Strip the base URL off an R2 URL to get the object key. If given a bare
 *  key already, returns it unchanged. */
function extractR2Key(urlOrKey: string): string {
  if (!/^https?:\/\//i.test(urlOrKey)) return urlOrKey.replace(/^\/+/, '');
  // Custom domain: strip the exact base.
  const base = config.r2PublicBaseUrl?.replace(/\/+$/, '');
  if (base && urlOrKey.startsWith(base + '/')) {
    return urlOrKey.slice(base.length + 1);
  }
  // Default endpoint: https://<account>.r2.cloudflarestorage.com/<bucket>/<key>
  const m = urlOrKey.match(/^https?:\/\/[^/]+\/[^/]+\/(.+)$/i);
  return m ? m[1] : urlOrKey;
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

/**
 * Upload a file buffer; returns key and public URL.
 *
 * `purpose` controls routing:
 *   - "media" (default) → follows the STORAGE_DRIVER setting (Cloudinary
 *     for image transformations, S3, or local).
 *   - "deliverable" → digital product file (ZIP, PDF, MP4…). Routes to R2
 *     when configured (zero egress + no PDF/ZIP delivery restriction).
 *     Falls back to the default driver if R2 credentials aren't set, so
 *     dev environments without R2 still work.
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  folder: string,
  mimeType?: string,
  purpose: UploadPurpose = 'media'
): Promise<UploadResult> {
  const ext = path.extname(filename) || '';
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  const key = `${folder}/${safeName}`;

  if (purpose === 'deliverable' && isR2Configured()) {
    return uploadR2(key, buffer, mimeType);
  }
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
