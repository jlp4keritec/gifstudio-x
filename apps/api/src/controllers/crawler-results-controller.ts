import type { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { AppError } from '../middlewares/error-handler';
import { importVideoFromUrl } from '../services/video-import-service';
import { proxyImage } from '../services/image-proxy-service';
import { runWithConcurrency } from '../lib/concurrency';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  status: z
    .enum(['pending_review', 'approved', 'rejected', 'imported', 'import_failed'])
    .optional(),
  sourceId: z.string().uuid().optional(),
  search: z.string().optional(),
});

const bulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(['delete', 'reject', 'approve']),
});

interface ResultRow {
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
  crawlerSource?: { id: string; name: string; adapter: string } | null;
}

function serializeResult(r: ResultRow) {
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
    crawlerSource: r.crawlerSource ?? null,
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
          crawlerSource: { select: { id: true, name: true, adapter: true } },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        items: items.map((i) => serializeResult(i as ResultRow)),
        total,
        offset: q.offset,
        limit: q.limit,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getResultThumbnail(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const r = await prisma.crawlerResult.findUnique({
      where: { id },
      select: { thumbnailUrl: true },
    });
    if (!r?.thumbnailUrl) {
      throw new AppError(404, 'Pas de thumbnail', 'NO_THUMBNAIL');
    }
    await proxyImage(r.thumbnailUrl, res);
  } catch (err) {
    next(err);
  }
}

async function approveOne(id: string, userId: string): Promise<void> {
  const r = await prisma.crawlerResult.findUnique({ where: { id } });
  if (!r) throw new Error(`Resultat ${id} introuvable`);
  if (r.status !== 'pending_review') {
    throw new Error(`Statut "${r.status}" non eligible (doit etre pending_review)`);
  }

  try {
    const asset = await importVideoFromUrl({
      url: r.sourceUrl,
      userId,
    });

    await prisma.crawlerResult.update({
      where: { id },
      data: {
        status: 'imported',
        reviewedAt: new Date(),
        importedVideoAssetId: asset.id,
        importErrorMessage: null,
      },
    });
  } catch (err) {
    await prisma.crawlerResult.update({
      where: { id },
      data: {
        status: 'import_failed',
        importErrorMessage: err instanceof Error ? err.message : 'Erreur import',
      },
    });
    throw err;
  }
}

export async function approveAndImport(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    const id = String(req.params.id);
    await approveOne(id, req.user.userId);
    const updated = await prisma.crawlerResult.findUniqueOrThrow({
      where: { id },
      include: { crawlerSource: { select: { id: true, name: true, adapter: true } } },
    });
    res.json({ success: true, data: { result: serializeResult(updated as ResultRow) } });
  } catch (err) {
    if (err instanceof Error && err.message.includes('introuvable')) {
      return next(new AppError(404, err.message, 'NOT_FOUND'));
    }
    next(err);
  }
}

async function rejectOne(id: string): Promise<void> {
  const r = await prisma.crawlerResult.findUnique({ where: { id } });
  if (!r) throw new Error(`Resultat ${id} introuvable`);
  await prisma.crawlerResult.update({
    where: { id },
    data: {
      status: 'rejected',
      rejectedAt: new Date(),
      reviewedAt: new Date(),
    },
  });
}

export async function rejectResult(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    await rejectOne(id);
    const updated = await prisma.crawlerResult.findUniqueOrThrow({
      where: { id },
      include: { crawlerSource: { select: { id: true, name: true, adapter: true } } },
    });
    res.json({ success: true, data: { result: serializeResult(updated as ResultRow) } });
  } catch (err) {
    if (err instanceof Error && err.message.includes('introuvable')) {
      return next(new AppError(404, err.message, 'NOT_FOUND'));
    }
    next(err);
  }
}

export async function reopenResult(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    const r = await prisma.crawlerResult.findUnique({ where: { id } });
    if (!r) throw new AppError(404, 'Resultat introuvable', 'NOT_FOUND');
    const updated = await prisma.crawlerResult.update({
      where: { id },
      data: {
        status: 'pending_review',
        rejectedAt: null,
        reviewedAt: null,
        importErrorMessage: null,
      },
      include: { crawlerSource: { select: { id: true, name: true, adapter: true } } },
    });
    res.json({ success: true, data: { result: serializeResult(updated as ResultRow) } });
  } catch (err) {
    next(err);
  }
}

async function deleteOneResult(id: string): Promise<void> {
  const r = await prisma.crawlerResult.findUnique({ where: { id } });
  if (!r) throw new Error(`Resultat ${id} introuvable`);
  await prisma.crawlerResult.delete({ where: { id } });
}

export async function deleteResult(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id);
    await deleteOneResult(id);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    if (err instanceof Error && err.message.includes('introuvable')) {
      return next(new AppError(404, err.message, 'NOT_FOUND'));
    }
    next(err);
  }
}

/**
 * POST /admin/crawler/results/bulk
 * body : { ids: string[], action: 'delete' | 'reject' | 'approve' }
 * Action en parallele, max 20 simultanes.
 */
export async function bulkAction(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Non authentifie', 'UNAUTHORIZED');
    const { ids, action } = bulkActionSchema.parse(req.body);

    const userId = req.user.userId;
    const tasks = ids.map((id) => {
      switch (action) {
        case 'delete': return () => deleteOneResult(id);
        case 'reject': return () => rejectOne(id);
        case 'approve': return () => approveOne(id, userId);
      }
    });

    const results = await runWithConcurrency(tasks, 20);

    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    results.forEach((r, i) => {
      if ('error' in r) {
        failed.push({ id: ids[i], error: r.error.message });
      } else {
        succeeded.push(ids[i]);
      }
    });

    res.json({
      success: true,
      data: {
        action,
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
