import multer from 'multer';
import { env } from '../config/env';
import { UPLOAD_CONSTRAINTS } from '@gifstudio-x/shared';
import { AppError } from './error-handler';

const storage = multer.memoryStorage();

export const videoUpload = multer({
  storage,
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!(UPLOAD_CONSTRAINTS.acceptedMimes as readonly string[]).includes(file.mimetype)) {
      cb(
        new AppError(
          400,
          `Type de fichier non supporté : ${file.mimetype}`,
          'INVALID_FILE_TYPE',
        ),
      );
      return;
    }
    cb(null, true);
  },
});
