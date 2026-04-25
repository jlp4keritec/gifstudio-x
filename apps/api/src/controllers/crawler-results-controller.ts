import type { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { importVideoFromUrl } from '../services/video-import-service';
import { fetchRemoteImage } from '../services/image-proxy-service';

const listQuerySchema = z.object({
  status: z
    .enum(['pending_review', 'approved', 'rejected', 'imported', 'import_failed'])
    .optional(),
  sourceId: z.string().uuid().optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().optional(),
});

function serializeResult(r: {
  id: string;
  crawlerSourceId: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  title: string | null;
  externalId: string | null;
  metadata: unknown;
  status: string;
  rejectedAt: Date | null;
  importedVideoAssetId: string | null;
  importErrorMessage: string | null;
  discoveredAt: Date;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  crawlerSource?: {
    name: string;
    adapter: string;
  } | null;
}) {
  return {
    id: r.id,
    crawlerSourceId: r.crawlerSourceId,
    sourceUrl: r.sourceUrl,
    thumbnailUrl: r.thumbnailUrl,
    title: r.title,
    externalId: r.externalId,
    metadata: r.metadata,
    status: r.status,
    rejectedAt: r.rejectedAt?.toISOString() ?? null,
    importedVideoAssetId: r.importedVideoAssetId,
    importErrorMessage: r.importErrorMessage,
    discoveredAt: r.discoveredAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    crawlerSource: r.crawlerSource
      ? { name: r.crawlerSource.name, adapter: r.crawlerSource.adapter }
      : null,
  };
}

export async function listResults(req: Request, res: Response, next: NextFunction) {
  try {
    const q = listQuerySchema.parse(req.query);
    const where: Prisma.CrawlerResultWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.sourceId) where.crawlerSourceId = q.sourceId;
    if (q.search && q.search.trim()) {
      const term = q.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { sourceUrl: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.crawlerResult.count({ where }),
      prisma.crawlerResult.findMany({
        where,
        orderBy: { discoveredAt: 'desc' },
        skip: q.offset,
        take: q.limit,
        include: {
          crawlerSource: { select: { name: true, adapter: true } },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        items: items.map(serializeResult),
        total,
        offset: q.offset,
        limit: q.limit,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function rejectResult(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const existing = await prisma.crawlerResult.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Resultat introuvable', 'NOT_FOUND');

    const updated = await prisma.crawlerResult.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectedAt: new Date(),
        reviewedAt: new Date(),
      },
      include: { crawlerSource: { select: { name: true, adapter: true } } },
    });

    res.json({ success: true, data: { result: serializeResult(updated) } });
  } catch (err) {
    next(err);
  }
}

export async function approveAndImport(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');

    const id = String(req.params.id);
    const existing = await prisma.crawlerResult.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Resultat introuvable', 'NOT_FOUND');
    if (existing.status === 'imported') {
      throw new AppError(400, 'Deja importe', 'ALREADY_IMPORTED');
    }

    await prisma.crawlerResult.update({
      where: { id },
      data: { status: 'approved', reviewedAt: new Date() },
    });

    try {
      const asset = await importVideoFromUrl({
        url: existing.sourceUrl,
        userId: req.user.userId,
      });

      const updated = await prisma.crawlerResult.update({
        where: { id },
        data: {
          status: 'imported',
          importedVideoAssetId: asset.id,
          importErrorMessage: null,
        },
        include: { crawlerSource: { select: { name: true, adapter: true } } },
      });

      await prisma.videoAsset.update({
        where: { id: asset.id },
        data: { source: 'crawler' },
      });

      res.json({
        success: true,
        data: { result: serializeResult(updated), videoAssetId: asset.id },
      });
    } catch (importErr) {
      const msg =
        importErr instanceof Error ? importErr.message : 'Import echoue';
      const updated = await prisma.crawlerResult.update({
        where: { id },
        data: {
          status: 'import_failed',
          importErrorMessage: msg,
        },
        include: { crawlerSource: { select: { name: true, adapter: true } } },
      });
      res.status(500).json({
        success: false,
        error: `Import echoue : ${msg}`,
        data: { result: serializeResult(updated) },
      });
    }
  } catch (err) {
    next(err);
  }
}

export async function reopenResult(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const existing = await prisma.crawlerResult.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Resultat introuvable', 'NOT_FOUND');

    const updated = await prisma.crawlerResult.update({
      where: { id },
      data: {
        status: 'pending_review',
        rejectedAt: null,
        reviewedAt: null,
      },
      include: { crawlerSource: { select: { name: true, adapter: true } } },
    });
    res.json({ success: true, data: { result: serializeResult(updated) } });
  } catch (err) {
    next(err);
  }
}

export async function deleteResult(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const existing = await prisma.crawlerResult.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Resultat introuvable', 'NOT_FOUND');
    await prisma.crawlerResult.delete({ where: { id } });
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/crawler/results/:id/thumbnail
 * Proxifie la thumbnail distante (Rule34, Reddit, etc.) qui bloque le hotlink.
 * Cache 1h navigateur.
 */
export async function getResultThumbnail(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const result = await prisma.crawlerResult.findUnique({
      where: { id },
      select: { thumbnailUrl: true },
    });
    if (!result?.thumbnailUrl) {
      throw new AppError(404, 'Aucune thumbnail', 'NOT_FOUND');
    }

    const fetched = await fetchRemoteImage(result.thumbnailUrl);

    res.setHeader('Content-Type', fetched.contentType);
    if (fetched.contentLength !== null) {
      res.setHeader('Content-Length', String(fetched.contentLength));
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fetched.stream.pipe(res);
    fetched.stream.on('error', (err) => {
      console.warn(`[thumbnail-proxy] stream error for ${id}:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({ success: false, error: 'Stream error' });
      } else {
        res.destroy();
      }
    });
  } catch (err) {
    if (err instanceof AppError) return next(err);
    const msg = err instanceof Error ? err.message : 'Proxy error';
    console.warn(`[thumbnail-proxy] failed:`, msg);
    if (!res.headersSent) {
      res.status(502).json({ success: false, error: `Thumbnail proxy : ${msg}` });
    }
  }
}
