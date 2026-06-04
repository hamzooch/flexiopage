import { Response, NextFunction, Request } from 'express';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth.middleware';
import { Media } from '../models/Media.model';
import * as storageService from '../services/storage.service';
import { logger } from '../lib/logger';

// 50MB — couvre les GIF animés (souvent 10-30MB), photos HEIC/JPEG modernes
// (~15MB), et de courts clips audio. Au-delà il faudrait des uploads chunkés.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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
  const storeId = store._id.toString();
  const folder = `stores/${storeId}`;
  try {
    const result = await storageService.uploadFile(
      file.buffer,
      file.originalname,
      folder,
      file.mimetype
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
