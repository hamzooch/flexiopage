import { Response, NextFunction, Request } from 'express';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth.middleware';
import { Media } from '../models/Media.model';
import * as storageService from '../services/storage.service';
import { logger } from '../lib/logger';

// 50MB — couvre les GIF animés (souvent 10-30MB), photos HEIC/JPEG modernes
// (~15MB), et de courts clips audio. Au-delà il faudrait des uploads chunkés.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// ── Validation de type ──────────────────────────────────────────────
// Le mimetype vient du CLIENT (spoofable) → on vérifie aussi l'extension.
// `media` (images/covers affichés sur les vitrines) : images/vidéo/audio
// uniquement. SVG exclu : il peut embarquer du <script> et serait servi
// depuis /uploads sur l'origine API (stored XSS).
// `deliverable` (fichiers vendus, téléchargés par l'acheteur) : formats
// libres par design (ZIP, PDF, EPUB…), mais on bloque ce qui s'exécute
// dans un navigateur ou un OS au double-clic.
const MEDIA_MIME = /^(image|video|audio)\//;
const BLOCKED_MIME = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'application/javascript',
  'text/javascript',
]);
const BLOCKED_EXT = new Set([
  'html', 'htm', 'xhtml', 'svg', 'js', 'mjs', 'php',
  'exe', 'msi', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'scr', 'com', 'jar',
]);

function fileExt(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}

/** Renvoie un message d'erreur si le fichier est refusé, sinon null. */
function rejectReason(file: Express.Multer.File, purpose: 'media' | 'deliverable'): string | null {
  const ext = fileExt(file.originalname);
  if (BLOCKED_MIME.has(file.mimetype) || BLOCKED_EXT.has(ext)) {
    return 'Type de fichier non autorisé (exécutable ou code web).';
  }
  if (purpose === 'media' && !MEDIA_MIME.test(file.mimetype)) {
    return 'Seuls les fichiers image, vidéo ou audio sont acceptés ici.';
  }
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

/**
 * Multer middleware for a single file. Wrapped so multer errors (oversize file,
 * unexpected field name) come back as readable JSON instead of express crashing.
 */
export function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const code = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Fichier trop volumineux. Limite : ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} Mo.`
          : `Upload refusé : ${err.message}`;
      res.status(code).json({ error: message, code: err.code });
      return;
    }
    logger.error({ err }, 'unexpected upload error');
    res.status(500).json({ error: 'Upload failed' });
  });
}

export async function uploadMedia(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  // "deliverable" routes digital product files (ZIP, PDF, MP4…) to R2 when
  // configured — no PDF/ZIP restriction, zero egress cost. Anything else
  // (images, covers) stays on the default driver (Cloudinary in prod).
  const purpose: 'media' | 'deliverable' =
    req.body?.purpose === 'deliverable' ? 'deliverable' : 'media';
  const rejected = rejectReason(file, purpose);
  if (rejected) {
    res.status(400).json({ error: rejected });
    return;
  }
  const storeId = store._id.toString();
  const folder = purpose === 'deliverable'
    ? `stores/${storeId}/deliverables`
    : `stores/${storeId}`;
  try {
    const result = await storageService.uploadFile(
      file.buffer,
      file.originalname,
      folder,
      file.mimetype,
      purpose
    );
    const media = await Media.create({
      storeId,
      uploadedBy: req.user!._id,
      key: result.key,
      url: result.url,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: result.size,
    });
    res.status(201).json({ media });
  } catch (err) {
    logger.error({ err, storeId, filename: file.originalname }, 'media upload failed');
    res.status(500).json({ error: 'Storage failed to persist the file' });
  }
}

export async function listMedia(req: AuthRequest, res: Response): Promise<void> {
  const store = req.store!;
  const list = await Media.find({ storeId: store._id }).sort({ createdAt: -1 }).lean();
  res.json({ media: list });
}
