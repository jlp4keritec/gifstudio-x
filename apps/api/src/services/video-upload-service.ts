import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { prisma } from '../lib/prisma';
import { probeVideo } from '../lib/ffprobe';
import { env } from '../config/env';
import { AppError } from '../middlewares/error-handler';
import { generateAndSaveThumbnail } from './video-thumbnail-service';

const MAX_DURATION_SEC = env.MAX_VIDEO_DURATION_SECONDS;

function getVideosDir(): string {
  const dir = path.resolve(env.STORAGE_ROOT, 'videos');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function deriveExtension(originalName: string, mimeType: string): string {
  const extMap: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-matroska': '.mkv',
    'video/x-msvideo': '.avi',
    'video/ogg': '.ogv',
  };
  if (extMap[mimeType]) return extMap[mimeType];

  const ext = path.extname(originalName).toLowerCase();
  if (['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv'].includes(ext)) return ext;

  return '.mp4';
}

export async function importVideoFromUpload(params: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  userId: string;
}) {
  const { buffer, originalName, mimeType, userId } = params;

  const asset = await prisma.videoAsset.create({
    data: {
      source: 'file_upload',
      sourceUrl: null,
      originalFilename: originalName,
      status: 'downloading',
      importedById: userId,
      mimeType,
      fileSizeBytes: BigInt(buffer.length),
    },
  });

  const videosDir = getVideosDir();
  const extension = deriveExtension(originalName, mimeType);
  const safeFilename = `${randomUUID()}${extension}`;
  const localPath = path.resolve(videosDir, safeFilename);

  try {
    fs.writeFileSync(localPath, buffer);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Erreur d\'ecriture sur disque';
    await prisma.videoAsset.update({
      where: { id: asset.id },
      data: { status: 'failed', errorMessage },
    });
    throw new AppError(500, `Ecriture echouee : ${errorMessage}`, 'WRITE_FAILED');
  }

  let metadata;
  try {
    metadata = await probeVideo(localPath);
  } catch (err) {
    try {
      fs.unlinkSync(localPath);
    } catch {
      // ignore
    }
    const errorMessage =
      err instanceof Error
        ? err.message.includes('ENOENT')
          ? 'ffprobe introuvable — installe FFmpeg et ajoute-le au PATH'
          : `Impossible de lire les metadonnees : ${err.message}`
        : 'Erreur ffprobe';
    await prisma.videoAsset.update({
      where: { id: asset.id },
      data: { status: 'failed', errorMessage },
    });
    throw new AppError(500, errorMessage, 'PROBE_FAILED');
  }

  if (metadata.durationSec > MAX_DURATION_SEC) {
    try {
      fs.unlinkSync(localPath);
    } catch {
      // ignore
    }
    const errorMessage = `Video trop longue : ${Math.round(metadata.durationSec)}s (max : ${MAX_DURATION_SEC}s)`;
    await prisma.videoAsset.update({
      where: { id: asset.id },
      data: { status: 'failed', errorMessage },
    });
    throw new AppError(400, errorMessage, 'VIDEO_TOO_LONG');
  }

  const stats = fs.statSync(localPath);
  await prisma.videoAsset.update({
    where: { id: asset.id },
    data: {
      status: 'ready',
      localPath,
      fileSizeBytes: BigInt(stats.size),
      durationSec: metadata.durationSec,
      width: metadata.width,
      height: metadata.height,
      videoCodec: metadata.videoCodec,
      audioCodec: metadata.audioCodec,
      downloadedAt: new Date(),
    },
  });

  // Generation thumbnail (non bloquant en cas d'echec)
  await generateAndSaveThumbnail({
    assetId: asset.id,
    videoPath: localPath,
    durationSec: metadata.durationSec,
  });

  const refreshed = await prisma.videoAsset.findUniqueOrThrow({
    where: { id: asset.id },
  });

  return refreshed;
}
