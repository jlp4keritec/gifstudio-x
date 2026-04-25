import multer from 'multer';
import { env } from '../config/env';
import { AppError } from './error-handler';

/**
 * Middleware multer pour l'import de videos en tant que VideoAsset
 * (1 fichier par requete, taille limite env.MAX_UPLOAD_SIZE_MB).
 *
 * Different de `videoUpload` (qui sert pour /upload cote creation de GIF) :
 *   - Accepte toutes les extensions video acceptees par l'import URL
 *   - Limite = env.MAX_UPLOAD_SIZE_MB (500 Mo par defaut pour gifstudio-x)
 */
const ACCEPTED_MIMES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/x-msvideo',
  'video/ogg',
];

const ACCEPTED_EXTENSIONS = ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv'];

const storage = multer.memoryStorage();

export const videoAssetUpload = multer({
  storage,
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const mimeOk = ACCEPTED_MIMES.includes(file.mimetype);
    const extOk = ACCEPTED_EXTENSIONS.some((ext) =>
      file.originalname.toLowerCase().endsWith(ext),
    );

    if (!mimeOk && !extOk) {
      cb(
        new AppError(
          400,
          `Type de fichier non supporte : ${file.mimetype} (${file.originalname})`,
          'INVALID_FILE_TYPE',
        ),
      );
      return;
    }
    cb(null, true);
  },
});
