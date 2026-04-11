import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/mnt/user/journeytogether/uploads';

// Ensure upload directories exist
const dirs = [
  UPLOAD_DIR,
  path.join(UPLOAD_DIR, 'covers'),
  path.join(UPLOAD_DIR, 'avatars'),
  path.join(UPLOAD_DIR, 'photos'),
  path.join(UPLOAD_DIR, 'voice'),
];
for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    if (file.fieldname === 'cover') {
      cb(null, path.join(UPLOAD_DIR, 'covers'));
    } else if (file.fieldname === 'avatar') {
      cb(null, path.join(UPLOAD_DIR, 'avatars'));
    } else if (file.fieldname === 'photo') {
      cb(null, path.join(UPLOAD_DIR, 'photos'));
    } else if (file.fieldname === 'voice') {
      cb(null, path.join(UPLOAD_DIR, 'voice'));
    } else {
      cb(null, UPLOAD_DIR);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed: Record<string, string[]> = {
      cover: ['image/jpeg', 'image/png', 'image/webp'],
      avatar: ['image/jpeg', 'image/png', 'image/webp'],
      photo: ['image/jpeg', 'image/png', 'image/webp'],
      voice: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg'],
    };
    const allowedMimes = allowed[file.fieldname] || [];
    if (allowedMimes.length === 0 || allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type for ${file.fieldname}: ${file.mimetype}`));
    }
  },
});

export const UPLOAD_BASE_URL = process.env.UPLOAD_BASE_URL || `http://192.168.1.200:${process.env.PORT || 3000}/uploads`;

export function getFileUrl(filename: string): string {
  return `${UPLOAD_BASE_URL}/${filename}`;
}
