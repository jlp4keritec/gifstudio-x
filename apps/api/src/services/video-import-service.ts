import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import axios from 'axios';

import { prisma } from '../lib/prisma';
import { probeVideo } from '../lib/ffprobe';
import { env } from '../config/env';
import { AppError } from '../middlewares/error-handler';
import { generateAndSaveThumbnail } from './video-thumbnail-service';
import { resolveVideoUrl, needsResolution } from './url-resolver';
import { assertPublicUrl } from '../lib/url-security';
import { safeAxiosHead } from '../lib/safe-fetch';

const MAX_SIZE_BYTES = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const MAX_DURATION_SEC = env.MAX_VIDEO_DURATION_SECONDS;

const ACCEPTED_MIME_PREFIXES = ['video/'];
const ACCEPTED_EXTENSIONS = ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.ogv'];

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getVideosDir(): string {
  const dir = path.resolve(env.STORAGE_ROOT, 'videos');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function deriveExtension(url: string, contentType?: string | null): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (ACCEPTED_EXTENSIONS.includes(ext)) return ext;
  } catch {
    // ignore
  }

  if (contentType) {
    if (contentType.includes('mp4')) return '.mp4';
    if (contentType.includes('webm')) return '.webm';
    if (contentType.includes('quicktime')) return '.mov';
    if (contentType.includes('matroska')) return '.mkv';
    if (contentType.includes('x-msvideo')) return '.avi';
    if (contentType.includes('ogg')) return '.ogv';
  }

  return '.mp4';
}

export async function validateVideoUrl(url: string): Promise<{
  contentType: string | null;
  contentLength: number | null;
}> {
  // [Patch HX-01] Validation SSRF : refuse les hosts prives, loopback, cloud metadata
  let parsed: URL;
  try {
    parsed = assertPublicUrl(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'URL invalide';
    throw new AppError(400, msg, 'INVALID_URL');
  }

  let contentType: string | null = null;
  let contentLength: number | null = null;

  try {
    const head = await safeAxiosHead(url, {
      timeout: 10_000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { 'User-Agent': BROWSER_UA },
    });
    contentType = head.headers['content-type']?.toString().split(';')[0] ?? null;
    const cl = head.headers['content-length'];
    contentLength = cl ? Number(cl) : null;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 405) {
      // HEAD non supporte, on laissera le GET trancher
    } else if (axios.isAxiosError(err) && err.code === 'ENOTFOUND') {
      throw new AppError(400, 'Hote introuvable', 'HOST_NOT_FOUND');
    } else if (axios.isAxiosError(err) && err.code === 'ECONNREFUSED') {
      throw new AppError(400, 'Connexion refusee par le serveur', 'CONN_REFUSED');
    }
  }

  if (contentType) {
    const isAcceptedMime = ACCEPTED_MIME_PREFIXES.some((p) => contentType!.startsWith(p));
    const urlExt = path.extname(parsed.pathname).toLowerCase();
    const hasAcceptedExt = ACCEPTED_EXTENSIONS.includes(urlExt);

    if (!isAcceptedMime && !hasAcceptedExt) {
      throw new AppError(
        400,
        `Type de contenu non accepte : ${contentType} (attendu : video/*)`,
        'UNSUPPORTED_MIME',
      );
    }
  }

  if (contentLength !== null && contentLength > MAX_SIZE_BYTES) {
    const maxMb = Math.round(MAX_SIZE_BYTES / (1024 * 1024));
    const actualMb = Math.round(contentLength / (1024 * 1024));
    throw new AppError(
      400,
      `Fichier trop volumineux : ${actualMb} Mo (max autorise : ${maxMb} Mo)`,
      'FILE_TOO_LARGE',
    );
  }

  return { contentType, contentLength };
}

export async function importVideoFromUrl(params: {
  url: string;
  userId: string;
}) {
  const { url: rawUrl, userId } = params;

  // Etape 0 : resolution d'URL si necessaire (ex: redgifs.com/watch/xxx -> .mp4 direct)
  const needsResolve = needsResolution(rawUrl);
  let resolvedUrl = rawUrl;
  let resolverTitle: string | null = null;

  if (needsResolve) {
    try {
      const resolved = await resolveVideoUrl(rawUrl);
      resolvedUrl = resolved.directUrl;
      resolverTitle = resolved.title ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Resolution URL echouee';
      throw new AppError(400, msg, 'URL_RESOLUTION_FAILED');
    }
  }

  const { contentType, contentLength } = await validateVideoUrl(resolvedUrl);

  const originalFilename = (() => {
    try {
      return path.basename(new URL(resolvedUrl).pathname) || null;
    } catch {
      return null;
    }
  })();

  // On garde l'URL originale dans sourceUrl (page web), pas la resolue
  const asset = await prisma.videoAsset.create({
    data: {
      source: 'url_import',
      sourceUrl: rawUrl,
      originalFilename: resolverTitle ?? originalFilename,
      status: 'downloading',
      importedById: userId,
      mimeType: contentType,
      fileSizeBytes: contentLength ? BigInt(contentLength) : null,
    },
  });

  const videosDir = getVideosDir();
  const extension = deriveExtension(resolvedUrl, contentType);
  const safeFilename = `${randomUUID()}${extension}`;
  const localPath = path.resolve(videosDir, safeFilename);

  let downloadedBytes = 0;
  try {
    const response = await axios.get(resolvedUrl, {
      responseType: 'stream',
      timeout: 30_000,
      maxRedirects: 5,
      headers: { 'User-Agent': BROWSER_UA },
    });

    const writeStream = fs.createWriteStream(localPath);

    response.data.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      if (downloadedBytes > MAX_SIZE_BYTES) {
        response.data.destroy(new Error('MAX_SIZE_EXCEEDED'));
      }
    });

    await pipeline(response.data, writeStream);
  } catch (err) {
    if (fs.existsSync(localPath)) {
      try {
        fs.unlinkSync(localPath);
      } catch {
        // ignore
      }
    }
    const errorMessage = err instanceof Error ? err.message : 'Erreur de telechargement';
    await prisma.videoAsset.update({
      where: { id: asset.id },
      data: {
        status: 'failed',
        errorMessage: errorMessage.includes('MAX_SIZE_EXCEEDED')
          ? `Fichier trop volumineux (> ${Math.round(MAX_SIZE_BYTES / (1024 * 1024))} Mo)`
          : errorMessage,
      },
    });
    throw new AppError(500, `Telechargement echoue : ${errorMessage}`, 'DOWNLOAD_FAILED');
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

  // Thumbnail (non bloquant en cas d'echec)
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
