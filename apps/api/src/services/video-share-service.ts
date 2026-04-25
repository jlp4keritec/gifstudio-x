import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Genere un slug aleatoire URL-safe de 16 caracteres (~96 bits d'entropie).
 */
function generateSlug(): string {
  return crypto.randomBytes(12).toString('base64url').slice(0, 16);
}

/**
 * Recupere le slug existant d'une video, ou en cree un nouveau si inexistant.
 * 1 video = 1 slug (reutilise).
 */
export async function ensureShareSlug(videoAssetId: string): Promise<string> {
  const existing = await prisma.videoAsset.findUnique({
    where: { id: videoAssetId },
    select: { shareSlug: true, status: true, localPath: true },
  });

  if (!existing) {
    throw new Error('Video introuvable');
  }
  if (existing.status !== 'ready' || !existing.localPath) {
    throw new Error('Video non disponible (statut != ready)');
  }
  if (existing.shareSlug) {
    return existing.shareSlug;
  }

  // Generer un slug + retry sur conflit (extremement rare)
  for (let i = 0; i < 5; i++) {
    const slug = generateSlug();
    try {
      await prisma.videoAsset.update({
        where: { id: videoAssetId },
        data: { shareSlug: slug },
      });
      return slug;
    } catch (err) {
      // P2002 = unique constraint violation
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        continue;
      }
      throw err;
    }
  }
  throw new Error('Impossible de generer un slug unique apres 5 tentatives');
}

export async function revokeShareSlug(videoAssetId: string): Promise<void> {
  await prisma.videoAsset.update({
    where: { id: videoAssetId },
    data: { shareSlug: null },
  });
}

/**
 * Stream un fichier video au client en supportant le header Range
 * (necessaire pour le scrubbing dans <video> et l'editeur GIF).
 */
export function streamVideoFile(params: {
  res: Response;
  rangeHeader: string | undefined;
  filePath: string;
  mimeType: string;
}): void {
  const { res, rangeHeader, filePath, mimeType } = params;

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: 'Fichier introuvable sur disque' });
    return;
  }

  const stats = fs.statSync(filePath);
  const totalSize = stats.size;

  // Pas de Range : envoi complet
  if (!rangeHeader) {
    res.status(200);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(totalSize));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Parsing du Range : "bytes=START-END"
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    res.status(416).json({ success: false, error: 'Range header invalide' });
    return;
  }

  const startStr = match[1];
  const endStr = match[2];
  const start = startStr ? parseInt(startStr, 10) : 0;
  const end = endStr ? parseInt(endStr, 10) : totalSize - 1;

  if (start >= totalSize || end >= totalSize || start > end) {
    res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
    res.json({ success: false, error: 'Range hors limites' });
    return;
  }

  const chunkSize = end - start + 1;
  res.status(206);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', String(chunkSize));
  res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const stream = fs.createReadStream(filePath, { start, end });
  stream.on('error', (err) => {
    console.warn('[video-stream] error:', err.message);
    if (!res.headersSent) {
      res.status(500).end();
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

/**
 * Devine le mime type a partir de l'extension si pas stocke en BDD.
 */
export function guessVideoMime(filePath: string, fallback: string | null): string {
  if (fallback) return fallback;
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp4': return 'video/mp4';
    case '.webm': return 'video/webm';
    case '.mov': return 'video/quicktime';
    case '.mkv': return 'video/x-matroska';
    case '.avi': return 'video/x-msvideo';
    case '.ogv': return 'video/ogg';
    default: return 'application/octet-stream';
  }
}
