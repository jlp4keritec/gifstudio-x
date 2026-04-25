import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { importVideoFromUrl } from '../services/video-import-service';
import { importVideoFromUpload } from '../services/video-upload-service';
import { generateAndSaveThumbnail } from '../services/video-thumbnail-service';
import {
  ensureShareSlug,
  revokeShareSlug,
  streamVideoFile,
  guessVideoMime,
} from '../services/video-share-service';
import { runWithConcurrency } from '../lib/concurrency';

const importUrlSchema = z.object({
  url: z.string().url('URL invalide'),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['pending', 'downloading', 'ready', 'failed']).optional(),
  source: z.enum(['url_import', 'file_upload', 'crawler']).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  durationMin: z.coerce.number().int().min(0).optional(),
  durationMax: z.coerce.number().int().min(0).optional(),
  minWidth: z.coerce.number().int().min(0).optional(),
  minHeight: z.coerce.number().int().min(0).optional(),
  search: z.string().optional(),
  sort: z.enum(['date_desc', 'date_asc', 'duration_asc', 'duration_desc', 'size_desc']).default('date_desc'),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

interface CrawlerOriginInfo {
  sourceName: string;
  adapter: string;
  resultId: string;
}

interface AssetWithCrawler {
  id: string;
  source: string;
  sourceUrl: string | null;
  originalFilename: string | null;
  localPath: string | null;
  thumbnailPath: string | null;
  fileSizeBytes: bigint | null;
  mimeType: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  status: string;
  errorMessage: string | null;
  shareSlug: string | null;
  importedById: string;
  createdAt: Date;
  updatedAt: Date;
  downloadedAt: Date | null;
  crawlerResults?: Array<{
    id: string;
    crawlerSource: { name: string; adapter: string } | null;
  }>;
}

function serializeVideoAsset(asset: AssetWithCrawler) {
  let crawlerOrigin: CrawlerOriginInfo | null = null;
  if (asset.source === 'crawler' && asset.crawlerResults && asset.crawlerResults.length > 0) {
    const cr = asset.crawlerResults[0];
    if (cr.crawlerSource) {
      crawlerOrigin = {
        sourceName: cr.crawlerSource.name,
        adapter: cr.crawlerSource.adapter,
        resultId: cr.id,
      };
    }
  }

  return {
    id: asset.id,
    source: asset.source,
    sourceUrl: asset.sourceUrl,
    originalFilename: asset.originalFilename,
    localPath: asset.localPath,
    thumbnailPath: asset.thumbnailPath,
    fileSizeBytes: asset.fileSizeBytes !== null ? Number(asset.fileSizeBytes) : null,
    mimeType: asset.mimeType,
    durationSec: asset.durationSec,
    width: asset.width,
    height: asset.height,
    videoCodec: asset.videoCodec,
    audioCodec: asset.audioCodec,
    status: asset.status,
    errorMessage: asset.errorMessage,
    shareSlug: asset.shareSlug,
    importedById: asset.importedById,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    downloadedAt: asset.downloadedAt?.toISOString() ?? null,
    crawlerOrigin,
  };
}

const videoAssetInclude = {
  crawlerResults: {
    select: {
      id: true,
      crawlerSource: { select: { name: true, adapter: true } },
    },
    take: 1,
  },
} as const;

export async function listVideos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = listQuerySchema.parse(req.query);

    const where: Prisma.VideoAssetWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.source) where.source = q.source;
    if (q.dateFrom || q.dateTo) {
      where.createdAt = {};
      if (q.dateFrom) where.createdAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.createdAt.lte = new Date(q.dateTo);
    }
    if (q.durationMin !== undefined || q.durationMax !== undefined) {
      where.durationSec = {};
      if (q.durationMin !== undefined) where.durationSec.gte = q.durationMin;
      if (q.durationMax !== undefined) where.durationSec.lte = q.durationMax;
    }
    if (q.minWidth !== undefined) where.width = { gte: q.minWidth };
    if (q.minHeight !== undefined) where.height = { gte: q.minHeight };
    if (q.search && q.search.trim()) {
      const term = q.search.trim();
      where.OR = [
        { originalFilename: { contains: term, mode: 'insensitive' } },
        { sourceUrl: { contains: term, mode: 'insensitive' } },
      ];
    }

    let orderBy: Prisma.VideoAssetOrderByWithRelationInput;
    switch (q.sort) {
      case 'date_asc': orderBy = { createdAt: 'asc' }; break;
      case 'duration_asc': orderBy = { durationSec: 'asc' }; break;
      case 'duration_desc': orderBy = { durationSec: 'desc' }; break;
      case 'size_desc': orderBy = { fileSizeBytes: 'desc' }; break;
      default: orderBy = { createdAt: 'desc' };
    }

    const [total, items] = await Promise.all([
      prisma.videoAsset.count({ where }),
      prisma.videoAsset.findMany({
        where, orderBy, skip: q.offset, take: q.limit,
        include: videoAssetInclude,
      }),
    ]);

    res.json({
      success: true,
      data: {
        items: items.map((i) => serializeVideoAsset(i as AssetWithCrawler)),
        total, offset: q.offset, limit: q.limit,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getVideo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const item = await prisma.videoAsset.findUnique({
      where: { id }, include: videoAssetInclude,
    });
    if (!item) throw new AppError(404, 'Video introuvable', 'NOT_FOUND');
    res.json({ success: true, data: { video: serializeVideoAsset(item as AssetWithCrawler) } });
  } catch (err) {
    next(err);
  }
}

export async function importFromUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    const { url } = importUrlSchema.parse(req.body);
    const asset = await importVideoFromUrl({ url, userId: req.user.userId });
    const full = await prisma.videoAsset.findUniqueOrThrow({
      where: { id: asset.id }, include: videoAssetInclude,
    });
    res.status(201).json({
      success: true,
      data: { video: serializeVideoAsset(full as AssetWithCrawler) },
    });
  } catch (err) {
    next(err);
  }
}

export async function uploadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    if (!req.file) throw new AppError(400, 'Aucun fichier recu', 'NO_FILE');

    const asset = await importVideoFromUpload({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      userId: req.user.userId,
    });

    const full = await prisma.videoAsset.findUniqueOrThrow({
      where: { id: asset.id }, include: videoAssetInclude,
    });
    res.status(201).json({
      success: true,
      data: { video: serializeVideoAsset(full as AssetWithCrawler) },
    });
  } catch (err) {
    next(err);
  }
}

async function deleteOneVideoOnDisk(id: string): Promise<void> {
  const item = await prisma.videoAsset.findUnique({ where: { id } });
  if (!item) throw new Error(`Video ${id} introuvable`);

  if (item.localPath && fs.existsSync(item.localPath)) {
    try { fs.unlinkSync(item.localPath); } catch (e) { console.warn('[videos] unlink failed:', e); }
  }
  if (item.thumbnailPath && fs.existsSync(item.thumbnailPath)) {
    try { fs.unlinkSync(item.thumbnailPath); } catch (e) { console.warn('[videos] thumb unlink failed:', e); }
  }

  await prisma.videoAsset.delete({ where: { id } });
}

export async function deleteVideo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    await deleteOneVideoOnDisk(id);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    if (err instanceof Error && err.message.includes('introuvable')) {
      return next(new AppError(404, err.message, 'NOT_FOUND'));
    }
    next(err);
  }
}

/**
 * POST /videos/bulk-delete
 * body : { ids: string[] }
 * Suppression en parallele (max 20 simultanes).
 */
export async function bulkDeleteVideos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ids } = bulkDeleteSchema.parse(req.body);

    const tasks = ids.map((id) => () => deleteOneVideoOnDisk(id));
    const results = await runWithConcurrency(tasks, 20);

    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    results.forEach((r, i) => {
      if (r.ok) succeeded.push(ids[i]);
      else failed.push({ id: ids[i], error: r.error.message });
    });

    res.json({
      success: true,
      data: {
        requested: ids.length,
        succeeded: succeeded.length,
        failed: failed.length,
        succeededIds: succeeded,
        failures: failed,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getThumbnail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const item = await prisma.videoAsset.findUnique({
      where: { id }, select: { thumbnailPath: true },
    });
    if (!item?.thumbnailPath) throw new AppError(404, 'Thumbnail introuvable', 'NOT_FOUND');
    if (!fs.existsSync(item.thumbnailPath)) {
      throw new AppError(404, 'Fichier thumbnail introuvable sur disque', 'NOT_FOUND');
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=604800');
    fs.createReadStream(item.thumbnailPath).pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function regenerateThumbnail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const item = await prisma.videoAsset.findUnique({ where: { id } });
    if (!item) throw new AppError(404, 'Video introuvable', 'NOT_FOUND');
    if (!item.localPath || !fs.existsSync(item.localPath)) {
      throw new AppError(400, 'Fichier video local introuvable', 'NO_LOCAL_FILE');
    }
    const thumbPath = await generateAndSaveThumbnail({
      assetId: item.id, videoPath: item.localPath, durationSec: item.durationSec,
    });
    const updated = await prisma.videoAsset.findUniqueOrThrow({
      where: { id }, include: videoAssetInclude,
    });
    res.json({
      success: true,
      data: {
        video: serializeVideoAsset(updated as AssetWithCrawler),
        thumbnailGenerated: thumbPath !== null,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function regenerateAllThumbnails(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const candidates = await prisma.videoAsset.findMany({
      where: { status: 'ready', thumbnailPath: null, localPath: { not: null } },
      select: { id: true, localPath: true, durationSec: true },
    });
    let done = 0; let failed = 0;
    for (const c of candidates) {
      if (!c.localPath || !fs.existsSync(c.localPath)) { failed++; continue; }
      const p = await generateAndSaveThumbnail({
        assetId: c.id, videoPath: c.localPath, durationSec: c.durationSec,
      });
      if (p) done++; else failed++;
    }
    res.json({
      success: true,
      data: { processed: candidates.length, generated: done, failed },
    });
  } catch (err) {
    next(err);
  }
}

// ============================================================================
// SHARE SLUG : creation, revocation, stream public par slug (10.4)
// ============================================================================

export async function createShareSlug(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const slug = await ensureShareSlug(id);
    const updated = await prisma.videoAsset.findUniqueOrThrow({
      where: { id }, include: videoAssetInclude,
    });
    res.json({
      success: true,
      data: {
        shareSlug: slug,
        video: serializeVideoAsset(updated as AssetWithCrawler),
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      const code = err.message.includes('introuvable') ? 404 : 400;
      return next(new AppError(code, err.message, 'SHARE_SLUG_FAILED'));
    }
    next(err);
  }
}

export async function revokeShareSlugCtrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const item = await prisma.videoAsset.findUnique({ where: { id } });
    if (!item) throw new AppError(404, 'Video introuvable', 'NOT_FOUND');

    await revokeShareSlug(id);
    res.json({ success: true, data: { revoked: true } });
  } catch (err) {
    next(err);
  }
}

export async function getVideoFileBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const slug = String(req.params.slug);
    const item = await prisma.videoAsset.findUnique({
      where: { shareSlug: slug },
      select: { localPath: true, mimeType: true, status: true },
    });

    if (!item) {
      res.status(404).json({ success: false, error: 'Video introuvable' });
      return;
    }
    if (item.status !== 'ready' || !item.localPath) {
      res.status(404).json({ success: false, error: 'Video non disponible' });
      return;
    }

    streamVideoFile({
      res,
      rangeHeader: req.headers.range,
      filePath: item.localPath,
      mimeType: guessVideoMime(item.localPath, item.mimeType),
    });
  } catch (err) {
    next(err);
  }
}
