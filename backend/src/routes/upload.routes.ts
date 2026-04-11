import { Router, Request, Response, NextFunction } from 'express';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { getFileUrl } from '../config/storage.js';

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/mnt/user/journeytogether/uploads';

// POST /upload/cover — upload journey cover image
router.post('/cover', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const upload = (await import('multer')).default;
    const multerUpload = upload().single('cover');

    multerUpload(req, res, async (err) => {
      if (err) {
        next(new AppError(400, err.message));
        return;
      }

      if (!req.file) {
        next(new AppError(400, 'No file uploaded'));
        return;
      }

      const filename = req.file.filename;
      const filePath = path.join(UPLOAD_DIR, 'covers', filename);

      // Compress image with sharp
      try {
        await sharp(filePath)
          .resize(1200, 630, { fit: 'cover' })
          .jpeg({ quality: 85 })
          .toFile(filePath);
      } catch {
        // Image processing failed, use original
      }

      const url = getFileUrl(`covers/${filename}`);
      res.json({ url });
    });
  } catch (err) {
    next(err);
  }
});

// POST /upload/avatar — upload user avatar
router.post('/avatar', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const upload = (await import('multer')).default;
    const multerUpload = upload().single('avatar');

    multerUpload(req, res, async (err) => {
      if (err) {
        next(new AppError(400, err.message));
        return;
      }

      if (!req.file) {
        next(new AppError(400, 'No file uploaded'));
        return;
      }

      const filename = req.file.filename;
      const filePath = path.join(UPLOAD_DIR, 'avatars', filename);

      try {
        await sharp(filePath)
          .resize(256, 256, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toFile(filePath);
      } catch {
        // Use original
      }

      const url = getFileUrl(`avatars/${filename}`);
      res.json({ avatar_url: url });
    });
  } catch (err) {
    next(err);
  }
});

// POST /upload/photo — upload session photo
router.post('/photo', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const upload = (await import('multer')).default;
    const multerUpload = upload().single('photo');

    multerUpload(req, res, async (err) => {
      if (err) {
        next(new AppError(400, err.message));
        return;
      }

      if (!req.file) {
        next(new AppError(400, 'No file uploaded'));
        return;
      }

      const filename = req.file.filename;
      const filePath = path.join(UPLOAD_DIR, 'photos', filename);

      try {
        await sharp(filePath)
          .resize(1200, 1200, { fit: 'inside' })
          .jpeg({ quality: 85 })
          .toFile(filePath);
      } catch {
        // Use original
      }

      const url = getFileUrl(`photos/${filename}`);
      res.json({ photo_url: url });
    });
  } catch (err) {
    next(err);
  }
});

// POST /upload/voice — upload voice note
router.post('/voice', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const upload = (await import('multer')).default;
    const multerUpload = upload().single('voice');

    multerUpload(req, res, (err) => {
      if (err) {
        next(new AppError(400, err.message));
        return;
      }

      if (!req.file) {
        next(new AppError(400, 'No file uploaded'));
        return;
      }

      const url = getFileUrl(`voice/${req.file.filename}`);
      res.json({ voice_note_url: url });
    });
  } catch (err) {
    next(err);
  }
});

export default router;
