import { Response } from 'express';
import multer from 'multer';
import { AuthRequest } from '../middleware/auth.middleware';
import { Media } from '../models/Media.model';
import * as storageService from '../services/storage.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

/** Multer middleware for single file */
export const uploadSingle = upload.single('file');

export async function uploadMedia(req: AuthRequest, res: Response): Promise<void> {
  const store = (req as AuthRequest & { store: { _id: unknown } }).store;
  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  const storeId = store._id.toString();
  const folder = `stores/${storeId}`;
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
}

export async function listMedia(req: AuthRequest, res: Response): Promise<void> {
  const store = (req as AuthRequest & { store: { _id: unknown } }).store;
  const list = await Media.find({ storeId: store._id }).sort({ createdAt: -1 }).lean();
  res.json({ media: list });
}
