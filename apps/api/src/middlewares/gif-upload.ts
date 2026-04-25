import multer from 'multer';
import { AppError } from './error-handler';

const GIF_MAX_MB = 25;

export const gifUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: GIF_MAX_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'image/gif') {
      cb(new AppError(400, 'Le fichier doit être un GIF', 'INVALID_TYPE'));
      return;
    }
    cb(null, true);
  },
});
