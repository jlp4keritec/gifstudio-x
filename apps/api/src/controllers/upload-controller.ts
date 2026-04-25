import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs/promises';
import { AppError } from '../middlewares/error-handler';
import {
  generateFilename,
  getFilePath,
  getPublicUrl,
  moveToTrash,
} from '../services/storage-service';
import {
  getExtensionFromMime,
  validateVideoBuffer,
} from '../services/video-validation-service';

export async function uploadVideo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      throw new AppError(400, 'Aucun fichier reçu', 'NO_FILE');
    }

    const { buffer, mimetype, size, originalname } = req.file;

    const validation = validateVideoBuffer(buffer, mimetype, size);
    if (!validation.valid) {
      throw new AppError(400, validation.error ?? 'Fichier invalide', 'INVALID_VIDEO');
    }

    const detectedMime = validation.mimeType ?? mimetype;
    const extension = getExtensionFromMime(detectedMime);
    const filename = generateFilename(extension);
    const targetPath = getFilePath('videos', filename);

    await fs.writeFile(targetPath, buffer);

    res.status(201).json({
      success: true,
      data: {
        video: {
          id: filename.replace(extension, ''),
          filename,
          originalName: originalname,
          mimeType: detectedMime,
          size,
          path: targetPath,
          url: getPublicUrl('videos', filename),
          uploadedAt: new Date().toISOString(),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteUploadedVideo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const filename = String(req.params.filename ?? '');

    if (!filename || !/^[a-f0-9-]+\.(mp4|mov|webm)$/i.test(filename)) {
      throw new AppError(400, 'Nom de fichier invalide', 'INVALID_FILENAME');
    }

    try {
      const archivedName = await moveToTrash('videos', filename);
      res.json({
        success: true,
        data: { archived: archivedName, message: 'Vidéo archivée' },
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AppError(404, 'Fichier introuvable', 'NOT_FOUND');
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
}
